"""Binance WebSocket User Data Stream Manager.

Maintains persistent WebSocket connections for each active trading account,
caching positions, balances, and open orders in Redis for near-zero-latency
reads by GridBotService and dashboard endpoints.

Architecture:
- One `BinanceUserStream` per active account
- Events (ORDER_TRADE_UPDATE, ACCOUNT_UPDATE) update Redis cache
- listenKey refreshed every 30 minutes, full reconnect every 23 hours
- Graceful shutdown and auto-reconnect on failures
"""

import asyncio
import json
import time

import redis.asyncio as aioredis
import structlog
import websockets
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.core.enums import AccountStatus
from app.core.redis_client import redis_client
from app.core.security import decrypt_secret
from app.models.account import Account
from app.services.binance_client import BinanceClient

logger = structlog.get_logger(__name__)

# Redis key TTL in seconds (5 minutes — if WS drops, data stays valid briefly)
CACHE_TTL = 300

# How often the periodic snapshot loop refreshes data from REST (seconds)
SNAPSHOT_INTERVAL = 60


# ─── Redis Cache Helper (used by GridBotService, equity_task, dashboards) ───


async def _get_redis():
    """Get a working async Redis client.

    In the main FastAPI process the shared *redis_client* works fine.
    In Celery workers that call ``asyncio.run()`` per task, the shared
    client is bound to a dead event loop and raises 'Event loop is closed'.
    When that happens we create a fresh, short-lived connection.
    """
    try:
        await redis_client.ping()
        return redis_client, False  # (client, is_temporary)
    except Exception:
        # Shared client dead in this event loop → create a throw-away one
        fresh = aioredis.from_url(settings.REDIS_URL)
        return fresh, True


class WSCache:
    """Read interface for WebSocket-cached Binance data stored in Redis."""

    @staticmethod
    async def _read_key(key: str) -> str | None:
        """Read a single Redis key, auto-healing broken connections."""
        client, is_temp = await _get_redis()
        try:
            return await client.get(key)
        finally:
            if is_temp:
                await client.aclose()

    @staticmethod
    async def get_positions(account_id: str, symbol: str = None) -> list | None:
        """Get cached positions for an account. Returns None on cache miss."""
        try:
            raw = await WSCache._read_key(f"ws:account:{account_id}:positions")
            if raw is None:
                return None
            positions = json.loads(raw)
            if symbol:
                positions = [p for p in positions if p.get("symbol") == symbol]
            return positions
        except Exception as e:
            logger.debug(f"Cache miss for positions (account={account_id}): {e}")
            return None

    @staticmethod
    async def get_balances(account_id: str) -> list | None:
        """Get cached balances for an account. Returns None on cache miss."""
        try:
            raw = await WSCache._read_key(f"ws:account:{account_id}:balances")
            if raw is None:
                return None
            return json.loads(raw)
        except Exception as e:
            logger.debug(f"Cache miss for balances (account={account_id}): {e}")
            return None

    @staticmethod
    async def get_open_orders(account_id: str, symbol: str = None) -> list | None:
        """Get cached open orders for an account. Returns None on cache miss."""
        try:
            raw = await WSCache._read_key(f"ws:account:{account_id}:open_orders")
            if raw is None:
                return None
            orders_dict = json.loads(raw)
            orders = list(orders_dict.values())
            if symbol:
                orders = [o for o in orders if o.get("symbol") == symbol]
            return orders
        except Exception as e:
            logger.debug(f"Cache miss for open_orders (account={account_id}): {e}")
            return None

    @staticmethod
    async def get_account_info(account_id: str) -> dict | None:
        """Get cached account_info (totalWalletBalance, totalUnrealizedProfit,
        availableBalance, totalMarginBalance) for an account.
        Returns None on cache miss."""
        try:
            raw = await WSCache._read_key(f"ws:account:{account_id}:account_info")
            if raw is None:
                return None
            return json.loads(raw)
        except Exception as e:
            logger.debug(f"Cache miss for account_info (account={account_id}): {e}")
            return None


ws_cache = WSCache()


# ─── Per-Account WebSocket Stream ───


class BinanceUserStream:
    """Manages a single Binance WebSocket User Data Stream for one account."""

    def __init__(self, account_id: str, api_key: str, api_secret: str, is_testnet: bool):
        self.account_id = account_id
        self.client = BinanceClient(api_key=api_key, api_secret=api_secret, is_testnet=is_testnet)
        self.listen_key: str | None = None
        self._running = False
        self._ws = None
        self._keepalive_task: asyncio.Task | None = None
        self._reconnect_task: asyncio.Task | None = None
        self._snapshot_task: asyncio.Task | None = None

    async def start(self):
        """Start the WebSocket stream with auto-reconnect."""
        self._running = True
        while self._running:
            try:
                await self._connect_and_listen()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(
                    "ws_stream_error",
                    account_id=self.account_id,
                    error=str(e),
                )
                if self._running:
                    await asyncio.sleep(5)  # Wait before reconnect

    async def stop(self):
        """Gracefully stop the stream."""
        self._running = False
        if self._keepalive_task and not self._keepalive_task.done():
            self._keepalive_task.cancel()
        if self._ws:
            await self._ws.close()
        # Clean up listenKey
        if self.listen_key:
            try:
                await self.client.close_listen_key(self.listen_key)
            except Exception:
                pass
        # Clean up Redis cache
        for key_suffix in ["positions", "balances", "open_orders", "last_event"]:
            try:
                await redis_client.delete(f"ws:account:{self.account_id}:{key_suffix}")
            except Exception:
                pass
        logger.info("ws_stream_stopped", account_id=self.account_id)

    async def _connect_and_listen(self):
        """Create listenKey, connect WS, and process messages."""
        # 1. Get listenKey
        self.listen_key = await self.client.create_listen_key()
        logger.info(
            "ws_listen_key_created",
            account_id=self.account_id,
            key_prefix=self.listen_key[:8] + "...",
        )

        # 2. Seed the cache with a REST snapshot so GridBot has data immediately
        await self._seed_cache()

        # 3. Start keepalive loop (refresh every 30 minutes)
        self._keepalive_task = asyncio.create_task(self._keepalive_loop())

        # 3b. Start periodic snapshot loop (poll REST and publish to frontend)
        self._snapshot_task = asyncio.create_task(self._periodic_snapshot_loop())

        # 4. Connect WebSocket
        ws_url = f"{self.client.ws_base_url}/ws/{self.listen_key}"
        logger.info("ws_connecting", account_id=self.account_id, url=ws_url[:60] + "...")

        # 24-hour max connection limit — reconnect at 23 hours
        max_connection_secs = 23 * 3600

        try:
            async with websockets.connect(
                ws_url,
                ping_interval=60,
                ping_timeout=30,
                close_timeout=10,
            ) as ws:
                self._ws = ws
                logger.info("ws_connected", account_id=self.account_id)

                connection_start = time.time()

                async for message in ws:
                    if not self._running:
                        break

                    # Check 23-hour limit
                    if time.time() - connection_start > max_connection_secs:
                        logger.info(
                            "ws_23h_reconnect",
                            account_id=self.account_id,
                        )
                        break

                    try:
                        data = json.loads(message)
                        await self._process_event(data)
                    except json.JSONDecodeError:
                        logger.warning(
                            "ws_invalid_json",
                            account_id=self.account_id,
                            raw=str(message)[:200],
                        )

        finally:
            self._ws = None
            if self._keepalive_task and not self._keepalive_task.done():
                self._keepalive_task.cancel()
                try:
                    await self._keepalive_task
                except asyncio.CancelledError:
                    pass
            if self._snapshot_task and not self._snapshot_task.done():
                self._snapshot_task.cancel()
                try:
                    await self._snapshot_task
                except asyncio.CancelledError:
                    pass

    async def _seed_cache(self):
        """Populate Redis cache with initial REST snapshot so data is
        available immediately (before WS events start flowing)."""
        try:
            account_info = await self.client.get_account_info()
            # Small delay to avoid burst of requests
            await asyncio.sleep(1)
            positions = await self.client.get_position_info()
            await asyncio.sleep(1)
            open_orders = await self.client.get_open_orders()

            # Extract per-asset balances from account_info
            balances = account_info.get("assets", [])

            # Store account_info summary (totalWalletBalance, etc.)
            account_summary = {
                "totalWalletBalance": account_info.get("totalWalletBalance", "0"),
                "totalUnrealizedProfit": account_info.get("totalUnrealizedProfit", "0"),
                "availableBalance": account_info.get("availableBalance", "0"),
                "totalMarginBalance": account_info.get("totalMarginBalance", "0"),
            }
            await redis_client.setex(
                f"ws:account:{self.account_id}:account_info",
                CACHE_TTL,
                json.dumps(account_summary),
            )

            # Enrich positions with margin data from account_info
            # /fapi/v2/positionRisk doesn't return initialMargin/maintMargin,
            # but /fapi/v2/account positions array does.
            acct_positions = account_info.get("positions", [])
            margin_map = {}
            for ap in acct_positions:
                key = f"{ap.get('symbol', '')}_{ap.get('positionSide', 'BOTH')}"
                margin_map[key] = {
                    "initialMargin": ap.get("initialMargin", "0"),
                    "maintMargin": ap.get("maintMargin", "0"),
                }
            for pos in positions:
                key = f"{pos.get('symbol', '')}_{pos.get('positionSide', 'BOTH')}"
                if key in margin_map:
                    pos["initialMargin"] = margin_map[key]["initialMargin"]
                    pos["maintMargin"] = margin_map[key]["maintMargin"]

            # Store positions (now enriched with margin data)
            await redis_client.setex(
                f"ws:account:{self.account_id}:positions",
                CACHE_TTL,
                json.dumps(positions),
            )

            # Store balances
            await redis_client.setex(
                f"ws:account:{self.account_id}:balances",
                CACHE_TTL,
                json.dumps(balances),
            )

            # Store open orders as dict keyed by orderId
            orders_dict = {str(o["orderId"]): o for o in open_orders}
            await redis_client.setex(
                f"ws:account:{self.account_id}:open_orders",
                CACHE_TTL,
                json.dumps(orders_dict),
            )

            logger.info(
                "ws_cache_seeded",
                account_id=self.account_id,
                positions=len(positions),
                balances=len(balances),
                orders=len(open_orders),
            )
        except Exception as e:
            logger.warning(
                "ws_cache_seed_failed",
                account_id=self.account_id,
                error=str(e),
            )

    async def _keepalive_loop(self):
        """Refresh listenKey every 30 minutes to keep it alive (expires at 60m)."""
        try:
            while self._running:
                await asyncio.sleep(30 * 60)  # 30 minutes
                if not self._running or not self.listen_key:
                    break
                try:
                    await self.client.keepalive_listen_key(self.listen_key)
                    logger.debug(
                        "ws_listen_key_refreshed",
                        account_id=self.account_id,
                    )
                except Exception as e:
                    logger.error(
                        "ws_listen_key_refresh_failed",
                        account_id=self.account_id,
                        error=str(e),
                    )
                    # If keepalive fails, the WS will get a listenKeyExpired event
                    # and we'll reconnect automatically
        except asyncio.CancelledError:
            pass

    async def _periodic_snapshot_loop(self):
        """Periodically fetch balances & positions via REST and publish
        to Redis pub/sub so the frontend receives regular live updates
        even when no Binance WS events are firing (which only happen on
        actual account changes like trades)."""
        import random

        # Stagger start: each account waits a random 0-15s offset so
        # multiple accounts don't all hit Binance REST at the same instant
        await asyncio.sleep(random.uniform(2, 15))
        try:
            while self._running:
                await asyncio.sleep(SNAPSHOT_INTERVAL)
                if not self._running:
                    break
                try:
                    # Fetch fresh data from REST — stagger the two calls
                    account_info = await self.client.get_account_info()
                    await asyncio.sleep(2)  # 2s gap between REST calls
                    positions = await self.client.get_position_info()

                    # Extract the correct totals from /fapi/v2/account
                    total_wallet_balance = account_info.get("totalWalletBalance", "0")
                    total_unrealized_pnl = account_info.get("totalUnrealizedProfit", "0")
                    available_balance = account_info.get("availableBalance", "0")
                    total_margin_balance = account_info.get("totalMarginBalance", "0")

                    # Also get per-asset balances for cache (used by GridBot)
                    balances = account_info.get("assets", [])

                    # Cache account_info summary (key new addition)
                    account_summary = {
                        "totalWalletBalance": total_wallet_balance,
                        "totalUnrealizedProfit": total_unrealized_pnl,
                        "availableBalance": available_balance,
                        "totalMarginBalance": total_margin_balance,
                    }
                    await redis_client.setex(
                        f"ws:account:{self.account_id}:account_info",
                        CACHE_TTL,
                        json.dumps(account_summary),
                    )

                    # Update Redis cache
                    await redis_client.setex(
                        f"ws:account:{self.account_id}:balances",
                        CACHE_TTL,
                        json.dumps(balances),
                    )
                    # Enrich positions with margin data from account_info
                    acct_positions = account_info.get("positions", [])
                    margin_map = {}
                    for ap in acct_positions:
                        key = f"{ap.get('symbol', '')}_{ap.get('positionSide', 'BOTH')}"
                        margin_map[key] = {
                            "initialMargin": ap.get("initialMargin", "0"),
                            "maintMargin": ap.get("maintMargin", "0"),
                        }
                    for pos in positions:
                        key = f"{pos.get('symbol', '')}_{pos.get('positionSide', 'BOTH')}"
                        if key in margin_map:
                            pos["initialMargin"] = margin_map[key]["initialMargin"]
                            pos["maintMargin"] = margin_map[key]["maintMargin"]

                    await redis_client.setex(
                        f"ws:account:{self.account_id}:positions",
                        CACHE_TTL,
                        json.dumps(positions),
                    )

                    # Filter to only non-zero positions before publishing
                    active_positions = [p for p in positions if float(p.get("positionAmt", 0)) != 0]

                    # Publish snapshot to Redis pub/sub for frontend live updates
                    await redis_client.publish(
                        f"ws:live:{self.account_id}",
                        json.dumps(
                            {
                                "type": "account_update",
                                "account_id": self.account_id,
                                "totalWalletBalance": total_wallet_balance,
                                "totalUnrealizedProfit": total_unrealized_pnl,
                                "availableBalance": available_balance,
                                "positions": active_positions,
                            }
                        ),
                    )

                    logger.debug(
                        "ws_snapshot_published",
                        account_id=self.account_id,
                        balances=len(balances),
                        positions=len(
                            [p for p in positions if float(p.get("positionAmt", 0)) != 0]
                        ),
                    )
                except Exception as e:
                    logger.debug(
                        "ws_snapshot_failed",
                        account_id=self.account_id,
                        error=str(e),
                    )
        except asyncio.CancelledError:
            pass

    async def _process_event(self, data: dict):
        """Process a WebSocket event and update Redis cache."""
        event_type = data.get("e")

        # Update last_event timestamp
        await redis_client.setex(
            f"ws:account:{self.account_id}:last_event",
            CACHE_TTL * 5,  # longer TTL for monitoring
            str(int(time.time())),
        )

        if event_type == "ORDER_TRADE_UPDATE":
            await self._handle_order_update(data)
        elif event_type == "ACCOUNT_UPDATE":
            await self._handle_account_update(data)
        elif event_type == "MARGIN_CALL":
            await self._handle_margin_call(data)
        elif event_type == "listenKeyExpired":
            logger.warning(
                "ws_listen_key_expired",
                account_id=self.account_id,
            )
            # Close WS to trigger reconnect
            if self._ws:
                await self._ws.close()
        elif event_type == "ACCOUNT_CONFIG_UPDATE":
            logger.debug(
                "ws_config_update",
                account_id=self.account_id,
                data=data,
            )
        else:
            logger.debug(
                "ws_unknown_event",
                account_id=self.account_id,
                event_type=event_type,
            )

    async def _handle_order_update(self, data: dict):
        """Process ORDER_TRADE_UPDATE: update open orders cache."""
        try:
            order_data = data.get("o", {})
            order_id = str(order_data.get("i", ""))  # orderId
            order_status = order_data.get("X", "")  # status
            symbol = order_data.get("s", "")  # symbol

            if not order_id:
                return

            # Read current open orders cache
            raw = await redis_client.get(f"ws:account:{self.account_id}:open_orders")
            orders_dict = json.loads(raw) if raw else {}

            if order_status in ("FILLED", "CANCELED", "EXPIRED", "REJECTED"):
                # Remove from open orders
                orders_dict.pop(order_id, None)
                logger.info(
                    "ws_order_closed",
                    account_id=self.account_id,
                    order_id=order_id,
                    status=order_status,
                    symbol=symbol,
                    role=order_data.get("c", ""),  # clientOrderId
                )
            elif order_status in ("NEW", "PARTIALLY_FILLED"):
                # Add/update in open orders (map WS fields to REST-like format)
                orders_dict[order_id] = {
                    "orderId": int(order_id),
                    "symbol": symbol,
                    "status": order_status,
                    "clientOrderId": order_data.get("c", ""),
                    "price": order_data.get("p", "0"),
                    "origQty": order_data.get("q", "0"),
                    "executedQty": order_data.get("z", "0"),
                    "cumQuote": order_data.get("Z", "0"),
                    "type": order_data.get("o", ""),
                    "reduceOnly": order_data.get("R", False),
                    "side": order_data.get("S", ""),
                    "stopPrice": order_data.get("sp", "0"),
                    "timeInForce": order_data.get("f", ""),
                    "avgPrice": order_data.get("ap", "0"),
                    "time": order_data.get("T", 0),
                    "updateTime": data.get("E", 0),
                }

            # Write back
            await redis_client.setex(
                f"ws:account:{self.account_id}:open_orders",
                CACHE_TTL,
                json.dumps(orders_dict),
            )

            # Publish to Redis pub/sub for frontend live updates
            await redis_client.publish(
                f"ws:live:{self.account_id}",
                json.dumps(
                    {
                        "type": "order_update",
                        "account_id": self.account_id,
                        "open_orders": list(orders_dict.values()),
                    }
                ),
            )

        except Exception as e:
            logger.warning(
                "ws_order_update_error",
                account_id=self.account_id,
                error=str(e),
            )

    async def _handle_account_update(self, data: dict):
        """Process ACCOUNT_UPDATE: update positions and balances cache."""
        try:
            update_data = data.get("a", {})

            # Update balances
            balances_raw = update_data.get("B", [])
            if balances_raw:
                # Merge with existing cache (WS only sends changed assets)
                raw = await redis_client.get(f"ws:account:{self.account_id}:balances")
                existing = json.loads(raw) if raw else []
                existing_map = {b["asset"]: b for b in existing if "asset" in b}

                for ws_bal in balances_raw:
                    asset = ws_bal.get("a", "")
                    if asset:
                        existing_map[asset] = {
                            "asset": asset,
                            "balance": ws_bal.get("wb", "0"),
                            "walletBalance": ws_bal.get("wb", "0"),
                            "crossWalletBalance": ws_bal.get("cw", "0"),
                            "crossUnPnl": ws_bal.get("bc", "0"),
                        }

                await redis_client.setex(
                    f"ws:account:{self.account_id}:balances",
                    CACHE_TTL,
                    json.dumps(list(existing_map.values())),
                )

            # Update positions
            positions_raw = update_data.get("P", [])
            if positions_raw:
                raw = await redis_client.get(f"ws:account:{self.account_id}:positions")
                existing = json.loads(raw) if raw else []
                existing_map = {}
                for p in existing:
                    key = f"{p.get('symbol', '')}_{p.get('positionSide', 'BOTH')}"
                    existing_map[key] = p

                for ws_pos in positions_raw:
                    symbol = ws_pos.get("s", "")
                    pos_side = ws_pos.get("ps", "BOTH")
                    key = f"{symbol}_{pos_side}"
                    # Carry forward fields that WS events don't include
                    prev = existing_map.get(key, {})
                    existing_map[key] = {
                        "symbol": symbol,
                        "positionAmt": ws_pos.get("pa", "0"),
                        "entryPrice": ws_pos.get("ep", "0"),
                        "markPrice": ws_pos.get("mp", "0")
                        if "mp" in ws_pos
                        else prev.get("markPrice", "0"),
                        "unRealizedProfit": ws_pos.get("up", "0"),
                        "positionSide": pos_side,
                        "marginType": ws_pos.get("mt", "cross"),
                        # Preserve REST-only fields from previous cache
                        "initialMargin": prev.get("initialMargin", "0"),
                        "maintMargin": prev.get("maintMargin", "0"),
                        "leverage": prev.get("leverage", "1"),
                        "liquidationPrice": prev.get("liquidationPrice", "0"),
                        "isolatedMargin": prev.get("isolatedMargin", "0"),
                        "notional": prev.get("notional", "0"),
                        "isolatedWallet": prev.get("isolatedWallet", "0"),
                    }

                positions_list = list(existing_map.values())
                await redis_client.setex(
                    f"ws:account:{self.account_id}:positions",
                    CACHE_TTL,
                    json.dumps(positions_list),
                )

            # Build snapshot and publish to Redis pub/sub for frontend live updates
            bal_raw = await redis_client.get(f"ws:account:{self.account_id}:balances")
            pos_raw = await redis_client.get(f"ws:account:{self.account_id}:positions")

            # Filter to only non-zero positions
            all_positions = json.loads(pos_raw) if pos_raw else []
            active_positions = [p for p in all_positions if float(p.get("positionAmt", 0)) != 0]

            await redis_client.publish(
                f"ws:live:{self.account_id}",
                json.dumps(
                    {
                        "type": "account_update",
                        "account_id": self.account_id,
                        "balances": json.loads(bal_raw) if bal_raw else [],
                        "positions": active_positions,
                    }
                ),
            )

            logger.debug(
                "ws_account_update",
                account_id=self.account_id,
                balances_updated=len(balances_raw),
                positions_updated=len(positions_raw),
            )

        except Exception as e:
            logger.warning(
                "ws_account_update_error",
                account_id=self.account_id,
                error=str(e),
            )

    async def _handle_margin_call(self, data: dict):
        """Log margin call events for monitoring."""
        logger.warning(
            "ws_margin_call",
            account_id=self.account_id,
            data=data,
        )


# ─── WebSocket Manager (manages all account streams) ───


class BinanceWSManager:
    """Manages WebSocket User Data Streams for all active accounts."""

    def __init__(self):
        self.streams: dict[str, BinanceUserStream] = {}
        self._running = False

    async def run_forever(self):
        """Main loop: poll DB for active accounts, start/stop streams."""
        self._running = True
        logger.info("ws_manager_starting")

        while self._running:
            try:
                await self._sync_streams()
            except Exception as e:
                logger.error("ws_manager_sync_error", error=str(e))

            # Check every 60 seconds for new/removed accounts
            await asyncio.sleep(60)

    async def shutdown(self):
        """Gracefully stop all streams."""
        self._running = False
        logger.info("ws_manager_shutting_down", stream_count=len(self.streams))
        tasks = [stream.stop() for stream in self.streams.values()]
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        self.streams.clear()
        logger.info("ws_manager_stopped")

    async def _sync_streams(self):
        """Compare active accounts in DB with running streams.
        Start streams for new accounts, stop streams for removed ones."""
        if not hasattr(self, "_db_engine") or self._db_engine is None:
            self._db_engine = create_async_engine(
                settings.DATABASE_URL,
                echo=False,
                poolclass=NullPool,
            )
            self._db_session_factory = async_sessionmaker(self._db_engine, expire_on_commit=False)

        try:
            async with self._db_session_factory() as session:
                # Get all RUNNING accounts with auto_trade enabled
                result = await session.execute(
                    select(Account).where(
                        Account.status == AccountStatus.RUNNING,
                        Account.auto_trade_enabled == True,
                        Account.deleted_at.is_(None),
                    )
                )
                active_accounts = result.scalars().all()

            active_ids = set()
            for account in active_accounts:
                account_id = str(account.id)
                active_ids.add(account_id)

                if account_id not in self.streams:
                    # New account — start stream (stagger by 3s between accounts
                    # to avoid bursting Binance REST calls on startup)
                    try:
                        api_key = decrypt_secret(account.api_key_encrypted)
                        api_secret = decrypt_secret(account.api_secret_encrypted)
                        stream = BinanceUserStream(
                            account_id=account_id,
                            api_key=api_key,
                            api_secret=api_secret,
                            is_testnet=account.is_testnet,
                        )
                        self.streams[account_id] = stream
                        # Run stream in background task
                        asyncio.create_task(self._run_stream(account_id, stream))
                        logger.info(
                            "ws_stream_started",
                            account_id=account_id,
                            is_testnet=account.is_testnet,
                        )
                        # Stagger: wait 3s before starting the next stream
                        await asyncio.sleep(3)
                    except Exception as e:
                        logger.error(
                            "ws_stream_start_failed",
                            account_id=account_id,
                            error=str(e),
                        )

            # Stop streams for accounts that are no longer active
            stale_ids = set(self.streams.keys()) - active_ids
            for stale_id in stale_ids:
                stream = self.streams.pop(stale_id, None)
                if stream:
                    await stream.stop()
                    logger.info("ws_stream_removed", account_id=stale_id)

            if active_ids:
                logger.info(
                    "ws_manager_sync",
                    active_streams=len(self.streams),
                    total_accounts=len(active_ids),
                )

        except Exception as e:
            logger.error("ws_sync_error", error=str(e))

    async def _run_stream(self, account_id: str, stream: BinanceUserStream):
        """Wrapper that runs a stream and cleans up on exit."""
        try:
            await stream.start()
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(
                "ws_stream_crashed",
                account_id=account_id,
                error=str(e),
            )
        finally:
            # Remove from active streams if it crashed
            self.streams.pop(account_id, None)
