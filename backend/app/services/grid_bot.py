import structlog
import pandas as pd
from decimal import Decimal, ROUND_DOWN
from datetime import datetime, timezone, timedelta
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.core.security import decrypt_secret
from app.models.account import Account
from app.models.settings import AccountSettings
from app.models.basket import Basket
from app.models.order import Order
from app.models.platform_settings import PlatformSettings
from app.services.binance_client import BinanceClient
from app.core.enums import AccountStatus, BasketStatus

from app.strategy.indicators import evaluate_signals
from app.strategy.grid import calculate_grid_levels, calculate_tp_price
from app.strategy.trend_filter import detect_trend, evaluate_trend_filter
from app.services.risk_manager import (
    check_user_gates, check_account_gates, check_cooldown, check_basket_age,
    evaluate_basket_risk, calculate_liquidation_price
)
from app.services.fee_service import check_balance_gate, deduct_fee
from app.services.binance_ws_manager import ws_cache

logger = structlog.get_logger(__name__)

# Module-level DB engine singleton (per forked worker process)
_worker_engine = None
_worker_session_factory = None


def _get_worker_session():
    """Return a shared async engine + session factory for the worker process.

    Uses NullPool because each Celery task calls asyncio.run(), which creates
    a new event loop.  Pooled connections from the previous loop become
    orphaned and are never returned, causing a slow leak that eventually
    exhausts PostgreSQL's max_connections (200).

    NullPool opens a fresh DB connection per session and closes it when the
    session ends — no orphaning possible.  The ~1ms TCP overhead per task
    is negligible at 30–60s tick intervals.
    """
    global _worker_engine, _worker_session_factory
    if _worker_engine is None:
        _worker_engine = create_async_engine(
            settings.DATABASE_URL,
            echo=False,
            poolclass=NullPool,
        )
        _worker_session_factory = async_sessionmaker(_worker_engine, expire_on_commit=False)
    return _worker_session_factory, _worker_engine


async def is_platform_trading_enabled(session) -> bool:
    """Check the admin master trading switch."""
    result = await session.execute(
        select(PlatformSettings).where(PlatformSettings.key == "trading_enabled")
    )
    setting = result.scalar_one_or_none()
    if not setting:
        return False
    return setting.value is True or setting.value == "true"


def round_step(value: float, step_size: float) -> float:
    """Round a value down to the nearest step size (Binance precision)."""
    if step_size <= 0:
        return value
    d_val = Decimal(str(value))
    d_step = Decimal(str(step_size))
    return float((d_val / d_step).quantize(Decimal('1'), rounding=ROUND_DOWN) * d_step)


def round_tick(value: float, tick_size: float) -> float:
    """Round a price to the nearest tick size."""
    if tick_size <= 0:
        return value
    d_val = Decimal(str(value))
    d_tick = Decimal(str(tick_size))
    return float((d_val / d_tick).quantize(Decimal('1'), rounding=ROUND_DOWN) * d_tick)


class GridBotService:
    def __init__(self, account_id: str):
        self.account_id = account_id

    async def _fetch_klines_df(self, client: BinanceClient, symbol: str, interval: str, limit: int = 100) -> pd.DataFrame:
        raw_data = await client.get_klines(symbol, interval, limit=limit)
        df = pd.DataFrame(raw_data, columns=[
            'open_time', 'open', 'high', 'low', 'close', 'volume',
            'close_time', 'quote_asset_volume', 'number_of_trades',
            'taker_buy_base_asset_volume', 'taker_buy_quote_asset_volume', 'ignore'
        ])
        for col in ['open', 'high', 'low', 'close', 'volume']:
            df[col] = df[col].astype(float)
        return df

    async def _get_symbol_precision(self, client: BinanceClient, symbol: str) -> dict:
        """Fetch Binance exchange info for quantity/price precision.
        
        Caches results in Redis for 1 hour to avoid repeated 40-weight API calls.
        """
        import json as _json
        import redis.asyncio as aioredis

        cache_key = f"twingrid:precision:{symbol}:{client.is_testnet}"
        try:
            # Try Redis cache first
            redis_client = aioredis.from_url(
                settings.REDIS_URL if hasattr(settings, 'REDIS_URL') else "redis://redis:6379/0",
                decode_responses=True
            )
            cached = await redis_client.get(cache_key)
            if cached:
                await redis_client.aclose()
                return _json.loads(cached)

            # Cache miss — fetch from Binance
            info = await client.get_exchange_info(symbol)
            filters = {f["filterType"]: f for f in info.get("filters", [])}
            lot_size = filters.get("LOT_SIZE", {})
            price_filter = filters.get("PRICE_FILTER", {})
            min_notional = filters.get("MIN_NOTIONAL", {})
            result = {
                "qty_step": float(lot_size.get("stepSize", 0.001)),
                "min_qty": float(lot_size.get("minQty", 0.001)),
                "tick_size": float(price_filter.get("tickSize", 0.01)),
                "min_notional": float(min_notional.get("notional", 5.0)),
            }

            # Cache for 1 hour
            await redis_client.setex(cache_key, 3600, _json.dumps(result))
            await redis_client.aclose()
            return result
        except Exception as e:
            logger.warning(f"Failed to get exchange info for {symbol}, using defaults: {e}")
            return {"qty_step": 0.001, "min_qty": 0.001, "tick_size": 0.01, "min_notional": 5.0}

    async def process_tick(self):
        """
        Main execution loop for a single account.
        Called every minute by Celery for active accounts.
        Uses a fresh DB engine to avoid asyncpg forked-process issues.
        """
        logger.info(f"Processing grid tick for account {self.account_id}")

        SessionLocal, engine = _get_worker_session()
        async with SessionLocal() as session:
            # 0. Check platform-level trading switch
            if not await is_platform_trading_enabled(session):
                logger.debug("Platform trading is DISABLED. Skipping all ticks.")
                return

            # 1. Fetch account
            stmt = select(Account).where(Account.id == self.account_id)
            result = await session.execute(stmt)
            account = result.scalar_one_or_none()

            if not account or account.status != AccountStatus.RUNNING:
                logger.debug(f"Account {self.account_id} is not RUNNING. Skipping tick.")
                return

            if not account.auto_trade_enabled:
                logger.debug(f"Account {self.account_id} auto-trade is DISABLED. Skipping tick.")
                return

            # 2. Fetch settings
            stmt_settings = select(AccountSettings).where(AccountSettings.account_id == self.account_id)
            result_settings = await session.execute(stmt_settings)
            settings_obj = result_settings.scalar_one_or_none()

            if not settings_obj:
                logger.warning(f"No settings found for account {self.account_id}. Skipping.")
                return

            config = settings_obj.config
            # ── Multi-symbol support: read active_symbols list ──
            from app.core.symbols import normalize_active_symbols
            active_symbols = normalize_active_symbols(config)

            logger.info(f"Trading symbols: {active_symbols} | Sizing: {config.get('sizing_mode', 'fixed_usd')} | "
                       f"Base USD: ${config.get('base_order_usd', 1.0)} | "
                       f"Compounding: {config.get('compounding_enabled', False)}")

            # 3. Init Binance Client
            try:
                api_key = decrypt_secret(account.api_key_encrypted)
                api_secret = decrypt_secret(account.api_secret_encrypted)
                client = BinanceClient(api_key=api_key, api_secret=api_secret, is_testnet=account.is_testnet)
            except Exception as e:
                logger.error(f"Failed to init Binance client for account {self.account_id}: {e}")
                return

            # 4. Process each active symbol independently
            for symbol in active_symbols:
                # Check for active basket for THIS specific symbol
                stmt_basket = select(Basket).where(
                    Basket.account_id == self.account_id,
                    Basket.symbol == symbol,
                    Basket.status.in_([BasketStatus.OPENING, BasketStatus.OPEN, BasketStatus.CLOSING])
                )
                result_basket = await session.execute(stmt_basket)
                active_basket = result_basket.scalar_one_or_none()

                if active_basket:
                    # Basket monitoring is handled by process_monitor_only (30s).
                    # Here we only check basket age for force-close.
                    max_age = config.get("max_basket_age_hours", 72)
                    if max_age > 0:
                        aged_baskets = await check_basket_age(session, account.id, max_age)
                        for aged in aged_baskets:
                            if str(aged.id) == str(active_basket.id):
                                logger.warning(f"⏰ Basket {aged.id} ({symbol}) exceeded max age ({max_age}h). Force-closing.")
                                await self._force_close_basket(session, client, aged, symbol)
                else:
                    # ── Orphan position check ──
                    try:
                        positions = await ws_cache.get_positions(str(account.id), symbol)
                        if positions is None:
                            positions = await client.get_position_info(symbol)
                        orphan_amt = 0.0
                        for pos in positions:
                            amt = float(pos.get("positionAmt", 0))
                            if abs(amt) > 0:
                                orphan_amt = amt
                                break
                        if abs(orphan_amt) > 0:
                            logger.warning(
                                f"⚠️ ORPHAN POSITION detected for {symbol} on account "
                                f"{account.id}: positionAmt={orphan_amt}. "
                                f"No matching OPEN basket in DB. Skipping entry."
                            )
                            await self._create_recovery_basket(
                                session, account, symbol, orphan_amt
                            )
                            continue  # Skip to next symbol
                    except Exception as e:
                        logger.warning(f"Orphan position check failed for {symbol} (non-fatal): {e}")

                    # Run risk gates before evaluating entry
                    user_check = await check_user_gates(session, account.user_id)
                    if not user_check.passed:
                        logger.info(f"User gate blocked: {user_check.reason}")
                        continue  # Skip to next symbol

                    acct_check = await check_account_gates(session, account.id)
                    if not acct_check.passed:
                        logger.info(f"Account gate blocked: {acct_check.reason}")
                        continue  # Skip to next symbol

                    cooldown_check = await check_cooldown(session, account.id)
                    if not cooldown_check.passed:
                        logger.debug(f"Cooldown for {symbol}: {cooldown_check.reason}")
                        continue  # Skip to next symbol

                    # Check Twin Grid Balance gate
                    balance_check = await check_balance_gate(session, account.user_id, account.id)
                    if not balance_check.passed:
                        logger.info(f"💳 Balance gate blocked: {balance_check.reason}")
                        continue  # Skip to next symbol

                    await self._evaluate_entry(session, client, account, config, symbol)

    async def process_monitor_only(self):
        """Lightweight monitoring tick — only checks active baskets, no signal evaluation.
        Called every 30s by Celery Beat for faster TP/SO detection."""
        SessionLocal, engine = _get_worker_session()
        async with SessionLocal() as session:
            if not await is_platform_trading_enabled(session):
                return

            stmt = select(Account).where(Account.id == self.account_id)
            result = await session.execute(stmt)
            account = result.scalar_one_or_none()
            if not account or account.status != AccountStatus.RUNNING:
                return

            config_stmt = select(AccountSettings).where(AccountSettings.account_id == self.account_id)
            config_result = await session.execute(config_stmt)
            settings_obj = config_result.scalar_one_or_none()
            config = settings_obj.config if settings_obj else {}

            # Monitor ALL active baskets for this account (any symbol)
            stmt_basket = select(Basket).where(
                Basket.account_id == self.account_id,
                Basket.status.in_([BasketStatus.OPENING, BasketStatus.OPEN, BasketStatus.CLOSING])
            )
            result_basket = await session.execute(stmt_basket)
            active_baskets = result_basket.scalars().all()

            if active_baskets:
                api_key = decrypt_secret(account.api_key_encrypted)
                api_secret = decrypt_secret(account.api_secret_encrypted)
                client = BinanceClient(api_key=api_key, api_secret=api_secret, is_testnet=account.is_testnet)
                for basket in active_baskets:
                    await self._monitor_basket(session, client, basket, basket.symbol)

    async def _create_recovery_basket(
        self, session, account: Account, symbol: str, position_amt: float
    ):
        """Create a recovery basket for an orphan Binance position.

        When the bot detects an open position on Binance that has no
        corresponding OPEN basket in the DB, this method creates a
        lightweight basket so that ``_monitor_basket`` can track it and
        properly finalize it (PnL, fee, notifications) when it closes.
        """
        import uuid
        side = "LONG" if position_amt > 0 else "SHORT"
        qty = abs(position_amt)

        # Avoid creating duplicate recovery baskets — check if one already
        # exists for this account in the last 5 minutes.
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=5)
        existing = (await session.execute(
            select(func.count()).select_from(Basket).where(
                Basket.account_id == account.id,
                Basket.status.in_([BasketStatus.OPENING, BasketStatus.OPEN]),
                Basket.opened_at >= cutoff,
            )
        )).scalar() or 0
        if existing > 0:
            logger.debug(
                f"Recovery basket already exists for account {account.id}, "
                f"skipping duplicate creation."
            )
            return

        # Get position info from Binance for entry price
        avg_entry = 0.0
        mark_price = 0.0
        try:
            from app.services.binance_client import BinanceClient
            api_key = decrypt_secret(account.api_key_encrypted)
            api_secret = decrypt_secret(account.api_secret_encrypted)
            client = BinanceClient(api_key=api_key, api_secret=api_secret, is_testnet=account.is_testnet)
            positions = await client.get_position_info(symbol)
            for pos in positions:
                if abs(float(pos.get("positionAmt", 0))) > 0:
                    avg_entry = float(pos.get("entryPrice", 0))
                    mark_price = float(pos.get("markPrice", 0))
                    break
        except Exception as e:
            logger.warning(f"Could not fetch position info for recovery basket: {e}")

        if avg_entry <= 0:
            avg_entry = mark_price if mark_price > 0 else 1.0

        # Get account config for leverage and TP settings
        config_stmt = select(AccountSettings).where(
            AccountSettings.account_id == account.id
        )
        config_result = await session.execute(config_stmt)
        acct_settings = config_result.scalar_one_or_none()
        config = acct_settings.config if acct_settings and acct_settings.config else {}

        leverage = config.get("leverage", 10)
        notional = qty * avg_entry
        bo_margin = notional / leverage if leverage > 0 else notional

        # Determine TP target from config
        tp_mode = config.get("tp_mode", "pct")
        if tp_mode == "fixed" and config.get("tp_fixed_amount", 0) > 0:
            tp_target_usd = config.get("tp_fixed_amount", 10.0)
        else:
            tp_target_usd = bo_margin * config.get("take_profit_pct", 1.0) / 100.0
            if tp_target_usd <= 0:
                tp_target_usd = 10.0  # fallback

        basket = Basket(
            id=str(uuid.uuid4()),
            account_id=account.id,
            user_id=account.user_id,
            symbol=symbol,
            side=side,
            status=BasketStatus.OPEN,
            qty=qty,
            avg_entry=avg_entry,
            bo_price=avg_entry,
            bo_margin=bo_margin,
            leverage=leverage,
            grid_levels=[],  # No SO levels for recovery
            tp_target_usd=tp_target_usd,
            sos_filled=0,
            opened_at=datetime.now(timezone.utc),
            config_snapshot={"_recovery": True, **config},
        )
        session.add(basket)
        await session.commit()

        # Place TP limit order on Binance for the recovery basket
        try:
            precision = await self._get_symbol_precision(client, symbol)
            tp_price = calculate_tp_price(side, avg_entry, qty, tp_target_usd)
            tp_price = round_tick(tp_price, precision["tick_size"])
            rounded_qty = round_step(qty, precision["qty_step"])
            tp_order_side = "SELL" if side == "LONG" else "BUY"

            tp_response = await client.place_limit_order(
                symbol, tp_order_side, rounded_qty, tp_price, reduce_only=True
            )

            tp_order = Order(
                basket_id=basket.id,
                account_id=account.id,
                user_id=account.user_id,
                binance_order_id=tp_response.get("orderId"),
                binance_client_order_id=tp_response.get("clientOrderId"),
                role="TP",
                side=tp_order_side,
                type="LIMIT",
                qty=rounded_qty,
                price=tp_price,
                status="NEW",
                raw_response=tp_response,
            )
            session.add(tp_order)
            basket.tp_price = tp_price
            await session.commit()

            logger.warning(
                f"📌 Placed recovery TP order for basket {basket.id}: "
                f"price={tp_price}, qty={rounded_qty}, side={tp_order_side}"
            )
        except Exception as tp_err:
            logger.warning(f"Could not place TP order for recovery basket: {tp_err}")

        logger.warning(
            f"🔧 Created RECOVERY basket {basket.id} for orphan {side} "
            f"position on {symbol}: qty={qty}, entry={avg_entry}, "
            f"margin=${bo_margin:.2f}, tp_target=${tp_target_usd:.2f}"
        )

    async def _query_order_fill(self, client: BinanceClient, db_order: Order, symbol: str):
        """Query Binance for the actual fill details of an order and update the DB record."""
        try:
            if db_order.binance_order_id:
                detail = await client.get_order(symbol, db_order.binance_order_id)
                db_order.status = detail.get("status", "FILLED")
                db_order.filled_qty = float(detail.get("executedQty", 0))
                db_order.avg_fill_price = float(detail.get("avgPrice", 0))
                db_order.filled_at = datetime.now(timezone.utc)

                # Get real commission from userTrades (accurate), fallback to estimate
                commission = 0.0
                try:
                    if db_order.status == "FILLED":
                        trades = await client.get_trade_history(symbol=symbol, limit=50)
                        order_trades = [
                            t for t in trades
                            if str(t.get("orderId")) == str(db_order.binance_order_id)
                        ]
                        if order_trades:
                            commission = sum(float(t.get("commission", 0)) for t in order_trades)
                            logger.debug(
                                f"Real commission for {db_order.role}: "
                                f"{commission:.6f} from {len(order_trades)} trades"
                            )
                except Exception as trade_err:
                    logger.debug(f"userTrades lookup failed, using estimate: {trade_err}")

                if commission == 0.0:
                    # Fallback: estimate from cumQuote * taker fee rate (0.04%)
                    cum_quote = float(detail.get("cumQuote", 0))
                    commission = cum_quote * 0.0004

                db_order.commission = commission
                logger.info(
                    f"  Fill data for {db_order.role}: qty={db_order.filled_qty}, "
                    f"avg_price={db_order.avg_fill_price}, commission={db_order.commission:.6f}"
                )
        except Exception as e:
            logger.warning(f"Failed to query fill for order {db_order.binance_order_id}: {e}")
            # Do NOT assume FILLED on error — leave as UNKNOWN for retry on next tick
            db_order.status = "UNKNOWN"

    async def _finalize_basket(self, session, client: BinanceClient, basket: Basket, symbol: str, notify: bool = True):
        """Calculate realized PnL and total fees when a basket closes.
        
        Priority for PnL source:
          1. Already recovered PnL (set by position watchdog)
          2. Binance userTrades matched by basket's order IDs (most accurate)
          3. Binance income history REALIZED_PNL entries
          4. Order-based calculation (last resort)
        """
        try:
            # Fetch ALL orders for this basket
            all_orders_result = await session.execute(
                select(Order).where(Order.basket_id == basket.id)
            )
            all_orders = all_orders_result.scalars().all()

            # Collect this basket's Binance order IDs
            basket_binance_order_ids = {
                str(o.binance_order_id) for o in all_orders
                if o.binance_order_id
            }

            # ── Method 1: If PnL was already recovered (by position watchdog), use it ──
            if basket.realized_pnl is not None and float(basket.realized_pnl) != 0:
                logger.info(
                    f"Basket {basket.id} PnL already set: {basket.realized_pnl:.4f}, "
                    f"skipping re-calculation"
                )

            else:
                # ── Method 2: Pull REAL PnL from Binance trades matched by order IDs ──
                binance_pnl = None
                binance_fees = 0.0

                if basket_binance_order_ids:
                    try:
                        trades = await client.get_trade_history(symbol, limit=100)
                        matching_trades = [
                            t for t in trades
                            if str(t.get("orderId", "")) in basket_binance_order_ids
                        ]

                        if matching_trades:
                            binance_pnl = sum(float(t.get("realizedPnl", 0)) for t in matching_trades)
                            binance_fees = sum(float(t.get("commission", 0)) for t in matching_trades)
                            logger.info(
                                f"Basket {basket.id} PnL from Binance trades: "
                                f"pnl={binance_pnl:.4f}, fees={binance_fees:.6f}, "
                                f"matched {len(matching_trades)}/{len(trades)} trades "
                                f"across {len(basket_binance_order_ids)} order IDs"
                            )
                    except Exception as e:
                        logger.warning(f"Failed to fetch Binance trades for PnL: {e}")

                if binance_pnl is not None and float(binance_pnl) != 0:
                    basket.realized_pnl = binance_pnl
                    basket.fees_paid = binance_fees
                else:
                    # ── Method 3: DISABLED ──
                    # Income history is NOT basket-scoped and can misattribute PnL
                    # from other positions on the same symbol/account.
                    # Fall through directly to Method 4 (order-based calculation).
                    logger.info(
                        f"Basket {basket.id}: trade-matched PnL was 0/None, "
                        f"skipping income history (unreliable), falling through to order-based calc"
                    )

                    # ── Method 4: Order-based calculation (last resort) ──
                    if basket.realized_pnl is None or float(basket.realized_pnl) == 0:
                        total_fees = sum(float(o.commission or 0) for o in all_orders if o.status == "FILLED")
                        basket.fees_paid = total_fees

                        # Find the LATEST filled TP that matches the basket's qty
                        filled_tps = [o for o in all_orders if o.role == "TP" and o.status == "FILLED"]
                        tp_order = None
                        if filled_tps:
                            # Pick the TP whose qty matches the basket qty (full close)
                            basket_qty = float(basket.qty or 0)
                            for tp in sorted(filled_tps, key=lambda o: float(o.qty or 0), reverse=True):
                                tp_qty = float(tp.qty or tp.filled_qty or 0)
                                if basket_qty > 0 and abs(tp_qty - basket_qty) / basket_qty < 0.05:
                                    tp_order = tp
                                    break
                            if not tp_order:
                                logger.warning(
                                    f"Basket {basket.id}: found {len(filled_tps)} filled TPs "
                                    f"but none match basket qty {basket_qty:.6f}. "
                                    f"TP qtys: {[float(t.qty or 0) for t in filled_tps]}"
                                )

                        entry_orders = [o for o in all_orders if o.role != "TP" and o.status == "FILLED"]

                        if tp_order and entry_orders and basket.avg_entry:
                            # Use avg_fill_price if available and non-zero, otherwise fall back to limit price
                            _afp = float(tp_order.avg_fill_price or 0)
                            exit_price = _afp if _afp > 0 else float(tp_order.price or 0)
                            entry_price = float(basket.avg_entry)
                            qty = float(basket.qty or 0)
                            if exit_price > 0 and entry_price > 0 and qty > 0:
                                if basket.side == "LONG":
                                    raw_pnl = (exit_price - entry_price) * qty
                                else:
                                    raw_pnl = (entry_price - exit_price) * qty
                                basket.realized_pnl = raw_pnl - total_fees
                                logger.info(
                                    f"Basket {basket.id} PnL from orders: entry={entry_price:.4f}, "
                                    f"exit={exit_price:.4f}, qty={qty}, pnl={basket.realized_pnl:.4f}"
                                )
                        elif not tp_order and basket.avg_entry:
                            # Force-closed — estimate from mark price
                            try:
                                current_price = await client.get_ticker_price(symbol)
                                entry_price = float(basket.avg_entry)
                                qty = float(basket.qty or 0)
                                if entry_price > 0 and qty > 0:
                                    if basket.side == "LONG":
                                        raw_pnl = (current_price - entry_price) * qty
                                    else:
                                        raw_pnl = (entry_price - current_price) * qty
                                    basket.realized_pnl = raw_pnl - total_fees
                                    logger.info(f"Basket {basket.id} force-close PnL: {basket.realized_pnl:.4f}")
                            except Exception as e:
                                logger.warning(f"Could not estimate force-close PnL: {e}")

            # ── Always: Fetch REAL trading fees + funding from Binance ──
            # This covers cases where order.commission was never populated
            try:
                if basket_binance_order_ids:
                    trades = await client.get_trade_history(symbol, limit=100)
                    matched = [
                        t for t in trades
                        if str(t.get("orderId", "")) in basket_binance_order_ids
                    ]
                    if matched:
                        real_fees = sum(float(t.get("commission", 0)) for t in matched)
                        if real_fees > float(basket.fees_paid or 0):
                            basket.fees_paid = real_fees
                            logger.info(
                                f"Basket {basket.id} fees updated from Binance trades: "
                                f"${real_fees:.6f} ({len(matched)} trades)"
                            )
                        # Also update individual order commissions
                        for order in all_orders:
                            if order.status == "FILLED" and float(order.commission or 0) == 0:
                                order_trades = [
                                    t for t in matched
                                    if str(t.get("orderId")) == str(order.binance_order_id)
                                ]
                                if order_trades:
                                    order.commission = sum(
                                        float(t.get("commission", 0)) for t in order_trades
                                    )
            except Exception as e:
                logger.warning(f"Failed to fetch real fees from Binance trades: {e}")

            # ── Funding fees from Binance income history ──
            try:
                start_ms = int(basket.opened_at.timestamp() * 1000) if basket.opened_at else None
                closed_at = basket.closed_at or datetime.now(timezone.utc)
                end_ms = int(closed_at.timestamp() * 1000)
                if start_ms:
                    funding_records = await client.get_income_history(
                        income_type="FUNDING_FEE",
                        symbol=symbol,
                        start_time=start_ms,
                        end_time=end_ms,
                    )
                    if funding_records:
                        total_funding = sum(float(r.get("income", 0)) for r in funding_records)
                        basket.funding_paid = total_funding
                        logger.info(
                            f"Basket {basket.id} funding: ${total_funding:.6f} "
                            f"({len(funding_records)} records)"
                        )
                    else:
                        basket.funding_paid = 0
            except Exception as e:
                logger.warning(f"Failed to fetch funding from income history: {e}")

            logger.info(f"✅ Basket {basket.id} finalized: fees={basket.fees_paid}, funding={basket.funding_paid}, pnl={basket.realized_pnl}")

            # Deduct Twin Grid Fee on profitable baskets
            if basket.realized_pnl and float(basket.realized_pnl) > 0:
                try:
                    fee_tx = await deduct_fee(
                        session, basket.user_id, basket.id, float(basket.realized_pnl)
                    )
                    if fee_tx:
                        logger.info(
                            f"💰 Twin Grid Fee deducted: ${abs(float(fee_tx.amount)):.4f} "
                            f"from user {basket.user_id}"
                        )
                except Exception as fee_err:
                    logger.error(f"Failed to deduct Twin Grid fee: {fee_err}", exc_info=True)

            # Send basket closed email + Telegram (only if caller didn't suppress)
            if notify:
                try:
                    from app.models.user import User
                    from app.models.account import Account
                    from app.services.notification_service import notification_service
                    user_result = await session.execute(select(User).where(User.id == basket.user_id))
                    user_obj = user_result.scalars().first()
                    acct_result = await session.execute(select(Account.name).where(Account.id == basket.account_id))
                    acct_name = acct_result.scalar() or "Account"
                    if user_obj:
                        pnl_val = float(basket.realized_pnl or 0)
                        fees_val = float(basket.fees_paid or 0)
                        duration = ""
                        if basket.opened_at and basket.closed_at:
                            delta = basket.closed_at - basket.opened_at
                            hours = int(delta.total_seconds() // 3600)
                            mins = int((delta.total_seconds() % 3600) // 60)
                            duration = f"{hours}h {mins}m"
                        await notification_service.notify_basket_closed(
                            user_obj.email, symbol, basket.side,
                            f"${pnl_val:+.4f}", f"${fees_val:.4f}",
                            duration or "N/A", basket.exit_reason or "TP Hit",
                            user_id=basket.user_id, account_name=acct_name,
                        )
                except Exception as e:
                    logger.warning(f"Failed to send basket close notification: {e}")

        except Exception as e:
            logger.error(f"Error finalizing basket {basket.id}: {e}", exc_info=True)

    async def _monitor_basket(self, session, client: BinanceClient, basket: Basket, symbol: str):
        """Monitor an active basket — sync order states with Binance."""
        logger.info(f"Monitoring basket {basket.id} (status={basket.status})")
        try:
            # ── Safeguard 1: Grace period for newly opened baskets ──
            # A basket that was just opened (< 2 minutes ago) cannot have
            # been "externally closed" — the BO market order just filled and
            # the WebSocket cache may not have received the ACCOUNT_UPDATE
            # event yet.  Skipping the position watchdog prevents the stale
            # cache from triggering a false MANUAL_CLOSE after 30 seconds.
            basket_age_seconds = (
                (datetime.now(timezone.utc) - basket.opened_at).total_seconds()
                if basket.opened_at else 999
            )
            skip_position_watchdog = basket_age_seconds < 120

            if skip_position_watchdog:
                logger.debug(
                    f"Basket {basket.id} is only {basket_age_seconds:.0f}s old "
                    f"— skipping position watchdog (grace period)"
                )

            # ── Position Watchdog: Check if position still exists on Binance ──
            # Cache-first: try WebSocket-cached data, fallback to REST
            position_amt = 0.0

            if not skip_position_watchdog:
                positions = await ws_cache.get_positions(str(basket.account_id), symbol)
                if positions is None:
                    positions = await client.get_position_info(symbol)
                for pos in positions:
                    amt = float(pos.get("positionAmt", 0))
                    if abs(amt) > 0:
                        position_amt = amt
                        break

                # ── Safeguard 2: REST confirmation when cache says position is gone ──
                # The WS cache can be stale (especially on mainnet where
                # ACCOUNT_UPDATE events may arrive seconds after the BO fill).
                # Before closing the basket, verify with a direct REST call.
                if position_amt == 0:
                    try:
                        rest_positions = await client.get_position_info(symbol)
                        for rp in rest_positions:
                            if abs(float(rp.get("positionAmt", 0))) > 0:
                                position_amt = float(rp.get("positionAmt", 0))
                                logger.info(
                                    f"WS cache showed positionAmt=0 but REST confirms "
                                    f"position still open for {symbol} "
                                    f"(amt={position_amt}). Skipping false close."
                                )
                                break
                    except Exception as rest_err:
                        logger.warning(
                            f"REST position check failed for {symbol}: {rest_err} "
                            f"— will NOT close basket on stale cache alone"
                        )
                        # If REST fails, do NOT close the basket — err on the
                        # side of keeping it open rather than false-closing
                        position_amt = -1  # sentinel: skip close logic

            if position_amt == 0 and not skip_position_watchdog:
                # Position was closed externally (TP filled, manual close, liquidation, ADL, etc.)
                logger.warning(
                    f"⚠️ Position for {symbol} is GONE on Binance! "
                    f"Basket {basket.id} was closed externally."
                )

                # ─────────────────────────────────────────────────────────────
                # STEP 1: Determine exit reason FIRST — before any cancellation.
                # If the TP order fills on Binance the position closes instantly.
                # The bot then enters this path on the next poll tick. We MUST
                # check the TP status now, before cancel_all_orders potentially
                # confuses the order state or triggers any exception that would
                # cause the silent fallback to MANUAL_CLOSE.
                # ─────────────────────────────────────────────────────────────
                exit_reason = "MANUAL_CLOSE"  # Default fallback
                tp_order_db = None
                try:
                    tp_order_result = await session.execute(
                        select(Order).where(
                            Order.basket_id == basket.id,
                            Order.role == "TP",
                        )
                    )
                    tp_order_db = tp_order_result.scalars().first()
                    if tp_order_db and tp_order_db.binance_order_id:
                        try:
                            tp_status = await client.get_order(
                                symbol, order_id=tp_order_db.binance_order_id
                            )
                            binance_tp_status = tp_status.get("status", "")
                            logger.info(
                                f"TP order {tp_order_db.binance_order_id} status on Binance: "
                                f"{binance_tp_status}"
                            )
                            if binance_tp_status == "FILLED":
                                exit_reason = "TP_FILLED"
                                tp_order_db.status = "FILLED"
                                tp_order_db.filled_qty = tp_status.get("executedQty")
                                tp_order_db.avg_fill_price = tp_status.get("avgPrice")
                                logger.info(
                                    f"✅ TP order {tp_order_db.binance_order_id} confirmed "
                                    f"FILLED — exit_reason=TP_FILLED"
                                )
                        except Exception as tp_err:
                            logger.warning(
                                f"Could not query TP order status from Binance "
                                f"(order_id={tp_order_db.binance_order_id}): {tp_err} — "
                                f"falling through to liquidation/ADL check"
                            )
                except Exception as tp_query_err:
                    logger.warning(f"Failed to query TP order from DB: {tp_query_err}")

                # If TP wasn't the cause, check for liquidation / ADL
                if exit_reason == "MANUAL_CLOSE":
                    try:
                        recent_orders = await client.get_all_orders(symbol, limit=10)
                        for order in recent_orders:
                            if order.get("type") == "LIQUIDATION":
                                exit_reason = "LIQUIDATION"
                                break
                            client_oid = str(order.get("clientOrderId", "")).lower()
                            if "autoclose" in client_oid:
                                exit_reason = "LIQUIDATION"
                                break
                            if "adl" in client_oid:
                                exit_reason = "ADL"
                                break
                    except Exception as liq_err:
                        logger.warning(f"Failed to check liquidation/ADL orders: {liq_err}")

                logger.info(f"Exit reason determined: {exit_reason} for basket {basket.id}")

                # ─────────────────────────────────────────────────────────────
                # STEP 2: Cancel remaining open orders on Binance.
                # Now that we know the exit reason, we can safely cancel.
                # If TP was filled, we still cancel_all_orders to remove any
                # lingering SO orders that didn't fire.
                # ─────────────────────────────────────────────────────────────
                try:
                    await client.cancel_all_orders(symbol)
                    logger.info(f"Canceled all orphan orders for {symbol}")
                except Exception as e:
                    logger.warning(f"Failed to cancel orphan orders: {e}")

                # Mark all pending DB orders as CANCELED (except TP if already set to FILLED)
                stmt_pending = select(Order).where(
                    Order.basket_id == basket.id,
                    Order.status.in_(["NEW", "PARTIALLY_FILLED"])
                )
                result_pending = await session.execute(stmt_pending)
                for order in result_pending.scalars().all():
                    # Don't overwrite the TP we just confirmed as FILLED
                    if tp_order_db and order.id == tp_order_db.id and exit_reason == "TP_FILLED":
                        continue
                    order.status = "CANCELED"

                # ─────────────────────────────────────────────────────────────
                # STEP 3: Recover PnL from Binance
                # ─────────────────────────────────────────────────────────────
                recovered_pnl = None

                # Gather this basket's own Binance order IDs for filtering
                all_basket_orders_result = await session.execute(
                    select(Order).where(Order.basket_id == basket.id)
                )
                all_basket_orders = all_basket_orders_result.scalars().all()
                basket_binance_order_ids = {
                    str(o.binance_order_id) for o in all_basket_orders
                    if o.binance_order_id
                }

                # Method 1 (Best): Sum realizedPnl from Binance trades matched by order IDs
                if basket_binance_order_ids:
                    try:
                        trades = await client.get_trade_history(symbol, limit=100)
                        matching_trades = [
                            t for t in trades
                            if str(t.get("orderId", "")) in basket_binance_order_ids
                        ]
                        if matching_trades:
                            recovered_pnl = sum(float(t.get("realizedPnl", 0)) for t in matching_trades)
                            logger.info(
                                f"Recovered PnL from {len(matching_trades)} basket trades: "
                                f"{recovered_pnl:.4f}"
                            )
                    except Exception as e:
                        logger.warning(f"Failed to query trade history: {e}")

                # Method 2: DISABLED — income history fallback
                # Income history is NOT basket-scoped and frequently misattributes
                # PnL from other positions. Skipping to mark-price estimation.
                if recovered_pnl is None or float(recovered_pnl) == 0:
                    logger.info(
                        f"Basket {basket.id} external close: trade-matched PnL was 0/None, "
                        f"skipping income history (unreliable), trying mark-price estimate"
                    )

                # Method 3: Last resort — estimate from mark price
                if (recovered_pnl is None or float(recovered_pnl) == 0) and basket.avg_entry:
                    try:
                        entry_price = float(basket.avg_entry)
                        qty = float(basket.qty or 0)
                        if entry_price > 0 and qty > 0:
                            current_price = await client.get_ticker_price(symbol)
                            if basket.side == "LONG":
                                recovered_pnl = (current_price - entry_price) * qty
                            else:
                                recovered_pnl = (entry_price - current_price) * qty
                            logger.info(f"Estimated PnL from mark price: {recovered_pnl:.4f}")
                    except Exception as e:
                        logger.warning(f"Failed to estimate PnL from mark price: {e}")

                if recovered_pnl is not None:
                    basket.realized_pnl = recovered_pnl

                # ─────────────────────────────────────────────────────────────
                # STEP 4: Close the basket and send ONE notification.
                # _finalize_basket is called with notify=False to suppress the
                # generic BASKET CLOSED message — we send the correct single
                # notification below based on exit_reason.
                # ─────────────────────────────────────────────────────────────
                basket.status = BasketStatus.CLOSED
                basket.closed_at = datetime.now(timezone.utc)
                basket.exit_reason = exit_reason

                # Finalize basket — compute fees. notify=False prevents duplicate Telegram.
                await self._finalize_basket(session, client, basket, symbol, notify=False)

                # Send exactly ONE notification appropriate for the exit reason.
                try:
                    from app.models.user import User
                    from app.models.account import Account
                    from app.services.notification_service import notification_service
                    user_result = await session.execute(select(User).where(User.id == basket.user_id))
                    user_obj = user_result.scalars().first()
                    acct_result = await session.execute(select(Account.name).where(Account.id == basket.account_id))
                    acct_name = acct_result.scalar() or "Account"
                    if user_obj:
                        pnl_val = float(basket.realized_pnl or 0)
                        fees_val = float(basket.fees_paid or 0)
                        duration = ""
                        if basket.opened_at and basket.closed_at:
                            delta = basket.closed_at - basket.opened_at
                            hours = int(delta.total_seconds() // 3600)
                            mins = int((delta.total_seconds() % 3600) // 60)
                            duration = f"{hours}h {mins}m"

                        if exit_reason == "TP_FILLED":
                            # TP filled by bot — send standard BASKET CLOSED notification
                            await notification_service.notify_basket_closed(
                                user_obj.email, symbol, basket.side,
                                f"${pnl_val:+.4f}", f"${fees_val:.4f}",
                                duration or "N/A", exit_reason,
                                user_id=basket.user_id, account_name=acct_name,
                            )
                        else:
                            # Truly external close (manual, liquidation, ADL)
                            await notification_service.notify_position_closed_externally(
                                user_obj.email, symbol, basket.side,
                                exit_reason,
                                f"${pnl_val:+.4f}", f"${fees_val:.4f}",
                                duration or "N/A",
                                user_id=basket.user_id, account_name=acct_name,
                            )
                except Exception as e:
                    logger.warning(f"Failed to send close notification: {e}")

                await session.commit()
                logger.info(
                    f"✅ Basket {basket.id} closed ({exit_reason}): "
                    f"pnl={basket.realized_pnl}, fees={basket.fees_paid}"
                )
                return  # Skip normal order monitoring

            # ── Virtual SO Check ──
            # Check if mark price has breached any unfilled SO levels
            # and execute them as market orders.
            await self._check_virtual_sos(session, client, basket, symbol)

            # ── Normal Order Monitoring ──
            # Cache-first: try WebSocket-cached data, fallback to REST
            open_orders = await ws_cache.get_open_orders(str(basket.account_id), symbol)
            if open_orders is None:
                open_orders = await client.get_open_orders(symbol)
            open_order_ids = {str(o["orderId"]) for o in open_orders}

            # Fetch DB orders that are NEW, PARTIALLY_FILLED, or UNKNOWN (retry after query error)
            stmt_orders = select(Order).where(
                Order.basket_id == basket.id,
                Order.status.in_(["NEW", "PARTIALLY_FILLED", "UNKNOWN"])
            )
            result_orders = await session.execute(stmt_orders)
            pending_orders = result_orders.scalars().all()

            for db_order in pending_orders:
                if str(db_order.binance_order_id) not in open_order_ids:
                    # Order is no longer open — query Binance for actual fill details
                    logger.info(f"Order {db_order.role} ({db_order.binance_order_id}) no longer open. Querying fill data...")
                    await self._query_order_fill(client, db_order, symbol)

                    if db_order.role == "TP":
                        if db_order.status == "FILLED":
                            logger.info(f"TP FILLED for basket {basket.id}! Closing basket.")
                            basket.status = BasketStatus.CLOSED
                            basket.closed_at = datetime.now(timezone.utc)
                            basket.exit_reason = "TP_FILLED"

                            # Cancel remaining open orders on Binance
                            # (only cancel specific orders, not cancel_all_orders
                            # which could affect other baskets/accounts)
                            for other_order in pending_orders:
                                if other_order.id != db_order.id and other_order.status not in ("FILLED", "CANCELED"):
                                    if other_order.binance_order_id:
                                        try:
                                            await client.cancel_order(symbol, order_id=other_order.binance_order_id)
                                        except Exception:
                                            pass  # May already be gone
                                    other_order.status = "CANCELED"

                            # Finalize basket — compute PnL and fees
                            await self._finalize_basket(session, client, basket, symbol)
                            break
                        else:
                            logger.warning(f"TP order {db_order.binance_order_id} was {db_order.status}, not FILLED! Not closing basket yet.")
                            # The safety net will replace it on the next monitor loop tick since role='TP' is no longer 'NEW'/'PARTIALLY_FILLED'


                    elif db_order.role.startswith("SO"):
                        if db_order.status == "FILLED":
                            basket.sos_filled = (basket.sos_filled or 0) + 1
                            logger.info(f"SO filled: {db_order.role} (total SOs filled: {basket.sos_filled})")

                            # Recalculate average entry and update TP
                            await self._recalculate_tp_after_so(session, client, basket, symbol)

                            # Send SO filled Telegram notification
                            try:
                                from app.models.account import Account
                                from app.services.notification_service import notification_service
                                acct_result = await session.execute(select(Account.name).where(Account.id == basket.account_id))
                                acct_name = acct_result.scalar() or "Account"
                                max_sos = basket.config_snapshot.get("max_safety_orders", "?") if basket.config_snapshot else "?"
                                fill_price = f"${float(db_order.avg_fill_price or db_order.price or 0):.4f}"
                                new_avg = f"${float(basket.avg_entry or 0):.4f}"
                                total_qty = f"{float(basket.qty or 0):.6f}"
                                await notification_service.notify_safety_order_filled(
                                    user_id=basket.user_id,
                                    account_name=acct_name,
                                    symbol=symbol,
                                    side=basket.side,
                                    so_number=f"{basket.sos_filled}/{max_sos}",
                                    fill_price=fill_price,
                                    new_avg=new_avg,
                                    total_qty=total_qty,
                                )
                            except Exception as e:
                                logger.warning(f"Failed to send SO notification: {e}")
                        else:
                            logger.info(
                                f"SO {db_order.role} status changed to {db_order.status} "
                                f"(not incrementing sos_filled)"
                            )

            # ── Missing TP Safety Net (with retry limit) ──
            # If basket is OPEN but has no active TP order, place one now.
            # Track retry count to prevent infinite spam when Binance keeps rejecting.
            if basket.status == BasketStatus.OPEN:
                tp_check_stmt = select(Order).where(
                    Order.basket_id == basket.id,
                    Order.role == "TP",
                    Order.status.in_(["NEW", "PARTIALLY_FILLED"])
                )
                tp_check_result = await session.execute(tp_check_stmt)
                active_tp = tp_check_result.scalar_one_or_none()
                if active_tp is None:
                    snapshot = basket.config_snapshot or {}
                    tp_retry_count = int(snapshot.get("_tp_retry_count", 0))
                    if tp_retry_count >= 3:
                        logger.error(
                            f"🛑 Basket {basket.id} failed TP placement {tp_retry_count} times. "
                            f"Stopping retries — manual intervention or position watchdog will handle it."
                        )
                    else:
                        logger.warning(
                            f"⚠️ Basket {basket.id} has no active TP order! "
                            f"Attempt {tp_retry_count + 1}/3..."
                        )
                        try:
                            await self._recalculate_tp_after_so(session, client, basket, symbol)
                            # Success — reset retry counter
                            basket.config_snapshot = {**snapshot, "_tp_retry_count": 0}
                        except Exception as tp_err:
                            logger.warning(f"TP retry failed: {tp_err}")
                            basket.config_snapshot = {**snapshot, "_tp_retry_count": tp_retry_count + 1}

            # ── Risk Controller Check ──
            # After processing all order updates, evaluate risk on the active basket
            if basket.status == BasketStatus.OPEN and (basket.sos_filled or 0) > 0:
                try:
                    # Cache-first: try WebSocket-cached balances, fallback to REST
                    balances = await ws_cache.get_balances(str(basket.account_id))
                    if balances is None:
                        balances = await client.get_balances()
                    usdt_balance = next(
                        (float(b.get("balance", b.get("walletBalance", 0))) for b in balances if b.get("asset") == "USDT"), 0.0
                    )

                    # Cache-first: try WebSocket-cached positions, fallback to REST
                    positions = await ws_cache.get_positions(str(basket.account_id), symbol)
                    if positions is None:
                        positions = await client.get_position_info(symbol)
                    unrealized_pnl = 0.0
                    position_notional = 0.0
                    for pos in positions:
                        amt = float(pos.get("positionAmt", 0))
                        if abs(amt) > 0:
                            unrealized_pnl = float(pos.get("unRealizedProfit", 0))
                            position_notional = abs(amt) * float(pos.get("markPrice", 0))
                            break

                    # Fetch account config for risk controller settings
                    config_stmt = select(AccountSettings).where(
                        AccountSettings.account_id == basket.account_id
                    )
                    config_result = await session.execute(config_stmt)
                    settings_obj = config_result.scalar_one_or_none()
                    rc_config = settings_obj.config if settings_obj else {}

                    # ── Track peak loss for "recovers_to" direction mode ──
                    # We use the basket's config_snapshot to persist peak_loss_usd across ticks.
                    # This avoids adding a new DB column — the value lives in a runtime scratch key.
                    current_loss_usd = abs(min(unrealized_pnl, 0.0))
                    snapshot = basket.config_snapshot or {}
                    peak_loss_usd = max(float(snapshot.get("_rc_peak_loss_usd", 0.0)), current_loss_usd)
                    if peak_loss_usd > float(snapshot.get("_rc_peak_loss_usd", 0.0)):
                        # Persist updated peak into config_snapshot (JSONB field, no migration needed)
                        basket.config_snapshot = {**snapshot, "_rc_peak_loss_usd": peak_loss_usd}

                    risk_check = evaluate_basket_risk(
                        sos_filled=basket.sos_filled or 0,
                        unrealized_pnl=unrealized_pnl,
                        wallet_balance=usdt_balance,
                        notional=position_notional,
                        symbol=symbol,
                        config=rc_config,
                        peak_loss_usd=peak_loss_usd,
                    )

                    if not risk_check.passed:
                        logger.warning(
                            f"🛡️ RISK CONTROLLER triggered for basket {basket.id}: "
                            f"{risk_check.reason}"
                        )
                        await self._force_close_basket(
                            session, client, basket, symbol
                        )
                        basket.exit_reason = "RISK_STOP"
                        await session.commit()

                        # Send risk stop notification + Telegram
                        try:
                            from app.models.user import User
                            from app.models.account import Account
                            from app.services.notification_service import notification_service
                            user_result = await session.execute(
                                select(User).where(User.id == basket.user_id)
                            )
                            user_obj = user_result.scalars().first()
                            acct_result = await session.execute(select(Account.name).where(Account.id == basket.account_id))
                            acct_name = acct_result.scalar() or "Account"
                            if user_obj:
                                pnl_val = float(basket.realized_pnl or 0)
                                await notification_service.notify_risk_stop(
                                    user_obj.email, symbol, basket.side,
                                    f"${pnl_val:+.4f}",
                                    str(basket.sos_filled or 0),
                                    risk_check.reason,
                                    user_id=basket.user_id, account_name=acct_name,
                                )
                        except Exception as e:
                            logger.warning(f"Failed to send risk stop notification: {e}")

                        return  # Skip normal commit below

                except Exception as e:
                    logger.warning(f"Risk controller check failed (non-fatal): {e}")

            await session.commit()
        except Exception as e:
            logger.error(f"Error monitoring basket {basket.id}: {e}")

    async def _force_close_basket(self, session, client: BinanceClient, basket: Basket, symbol: str):
        """Force-close a basket at market price (age limit, manual close, etc)."""
        try:
            logger.warning(f"Force-closing basket {basket.id} ({basket.side} {symbol})")

            # Cancel this basket's open orders on Binance (not cancel_all_orders)
            cancel_stmt = select(Order).where(
                Order.basket_id == basket.id,
                Order.status.in_(["NEW", "PARTIALLY_FILLED"]),
            )
            cancel_result = await session.execute(cancel_stmt)
            pending = cancel_result.scalars().all()
            for order in pending:
                if order.binance_order_id:
                    try:
                        await client.cancel_order(symbol, order_id=order.binance_order_id)
                    except Exception:
                        pass  # May already be gone
                order.status = "CANCELED"

            # Place a reduce_only market order to close the position
            close_side = "SELL" if basket.side == "LONG" else "BUY"
            close_qty = float(basket.qty or 0)

            if close_qty > 0:
                precision = await self._get_symbol_precision(client, symbol)
                close_qty = round_step(close_qty, precision["qty_step"])

                if close_qty > 0:
                    await client.place_market_order(
                        symbol, close_side, close_qty, reduce_only=True
                    )

            basket.status = BasketStatus.CLOSED
            basket.closed_at = datetime.now(timezone.utc)
            basket.exit_reason = "AGE_LIMIT"

            # Finalize basket — compute PnL and fees
            await self._finalize_basket(session, client, basket, symbol)

            await session.commit()
            logger.info(f"✅ Basket {basket.id} force-closed (age limit)")

        except Exception as e:
            logger.error(f"Error force-closing basket {basket.id}: {e}", exc_info=True)

    async def _check_virtual_sos(self, session, client: BinanceClient, basket: Basket, symbol: str):
        """Check if mark price has breached any unfilled SO levels.

        Virtual SOs are NOT placed as Binance limit orders.  Instead,
        each monitor tick (30s) checks the current mark price against
        the pre-calculated SO levels in ``basket.grid_levels``.
        When a breach is detected, the SO is executed as a market order
        for best-available fill.

        Multiple SOs can fire in a single tick (flash-crash scenario),
        following the user's "catch the dip" philosophy.
        """
        if basket.status != BasketStatus.OPEN:
            return

        so_levels = basket.grid_levels
        if not so_levels:
            return

        sos_filled = basket.sos_filled or 0

        # If all SOs are already filled, nothing to do
        if sos_filled >= len(so_levels):
            return

        # Check if this basket has pre-placed SO limit orders (legacy mode).
        # If yes, skip virtual SO logic — the normal order monitoring handles them.
        legacy_so_stmt = select(func.count()).select_from(Order).where(
            Order.basket_id == basket.id,
            Order.role.like("SO%"),
            Order.type == "LIMIT",
        )
        legacy_count = (await session.execute(legacy_so_stmt)).scalar() or 0
        if legacy_count > 0:
            return  # Legacy basket — SOs are pre-placed, let order monitor handle

        # Get current mark price — cache-first, then REST
        try:
            positions = await ws_cache.get_positions(str(basket.account_id), symbol)
            mark_price = None
            if positions:
                for pos in positions:
                    mp = float(pos.get("markPrice", 0))
                    if mp > 0:
                        mark_price = mp
                        break
            if not mark_price:
                mark_price = await client.get_ticker_price(symbol)
        except Exception as e:
            logger.warning(f"Virtual SO: could not get mark price: {e}")
            return

        # Get precision (cached in Redis)
        precision = await self._get_symbol_precision(client, symbol)
        order_side = "BUY" if basket.side == "LONG" else "SELL"

        # Walk through unfilled SO levels sequentially
        any_so_fired = False
        for so_level in so_levels:
            so_index = so_level["so_index"]

            # Skip already-filled SOs
            if so_index <= sos_filled:
                continue

            # Check price breach
            trigger_price = float(so_level["fill_price"])
            breached = False
            if basket.side == "LONG":
                breached = mark_price <= trigger_price
            else:  # SHORT
                breached = mark_price >= trigger_price

            if not breached:
                break  # SOs are sequential — if SO(n) isn't breached, SO(n+1) won't be either

            # ── Execute Virtual SO as Market Order ──
            so_qty = round_step(float(so_level["qty"]), precision["qty_step"])

            if so_qty < precision["min_qty"]:
                logger.warning(f"Virtual SO{so_index}: qty {so_qty} below min {precision['min_qty']}. Skipping.")
                basket.sos_filled = so_index
                continue

            # Check notional
            so_notional = so_qty * mark_price
            if so_notional < precision.get("min_notional", 5.0):
                logger.warning(f"Virtual SO{so_index}: notional ${so_notional:.2f} below min. Skipping.")
                basket.sos_filled = so_index
                continue

            try:
                cmp_op = "<=" if basket.side == "LONG" else ">="
                logger.info(
                    f"🎯 Virtual SO{so_index} triggered! "
                    f"mark={mark_price:.4f} {cmp_op} "
                    f"trigger={trigger_price:.4f} | Executing market order for {so_qty} {symbol}"
                )
                so_response = await client.place_market_order(symbol, order_side, so_qty)

                # Extract fill data
                so_filled_qty = float(so_response.get("executedQty", 0))
                if so_filled_qty <= 0:
                    so_filled_qty = so_qty
                so_avg_price = float(so_response.get("avgPrice", 0))
                if so_avg_price == 0:
                    so_avg_price = mark_price
                so_commission = sum(
                    float(f.get("commission", 0))
                    for f in so_response.get("fills", [])
                )
                if so_commission == 0:
                    cum_quote = float(so_response.get("cumQuote", 0))
                    so_commission = cum_quote * 0.0004

                # Create Order record
                so_order = Order(
                    basket_id=basket.id,
                    account_id=basket.account_id,
                    user_id=basket.user_id,
                    binance_order_id=so_response.get("orderId"),
                    binance_client_order_id=so_response.get("clientOrderId"),
                    role=f"SO{so_index}",
                    side=order_side,
                    type="MARKET",
                    qty=so_qty,
                    price=so_avg_price,
                    status="FILLED",
                    filled_qty=so_filled_qty,
                    avg_fill_price=so_avg_price,
                    commission=so_commission,
                    filled_at=datetime.now(timezone.utc),
                    raw_response=so_response,
                )
                session.add(so_order)

                basket.sos_filled = so_index
                any_so_fired = True
                logger.info(
                    f"✅ Virtual SO{so_index} filled: qty={so_filled_qty}, "
                    f"price={so_avg_price:.4f}, commission={so_commission:.6f}"
                )

            except Exception as e:
                logger.error(f"Virtual SO{so_index} execution failed: {e}", exc_info=True)
                break  # Don't try further SOs if one failed

        # If any SO fired, recalculate average entry + TP
        if any_so_fired:
            await self._recalculate_tp_after_so(session, client, basket, symbol)

    async def _recalculate_tp_after_so(self, session, client: BinanceClient, basket: Basket, symbol: str):
        """After an SO fills, recalculate weighted avg entry and replace the TP order."""
        try:
            # Get all FILLED orders for this basket (BO + SOs)
            stmt = select(Order).where(
                Order.basket_id == basket.id,
                Order.status == "FILLED",
                Order.role != "TP"
            )
            result = await session.execute(stmt)
            filled_orders = result.scalars().all()

            if not filled_orders:
                return

            # Calculate weighted average entry
            total_qty = sum(float(o.qty) for o in filled_orders)
            total_cost = sum(float(o.qty) * float(o.price or o.avg_fill_price or 0) for o in filled_orders)

            if total_qty <= 0:
                return

            new_avg_entry = total_cost / total_qty
            basket.avg_entry = new_avg_entry
            basket.qty = total_qty

            # Calculate new TP price
            tp_target_usd = float(basket.tp_target_usd)
            new_tp_price = calculate_tp_price(basket.side, new_avg_entry, total_qty, tp_target_usd)

            # Get precision
            precision = await self._get_symbol_precision(client, symbol)
            new_tp_price = round_tick(new_tp_price, precision["tick_size"])
            rounded_qty = round_step(total_qty, precision["qty_step"])

            # Cancel the old TP order on Binance
            old_tp_stmt = select(Order).where(
                Order.basket_id == basket.id,
                Order.role == "TP",
                Order.status.in_(["NEW", "PARTIALLY_FILLED"])
            )
            old_tp_result = await session.execute(old_tp_stmt)
            old_tp = old_tp_result.scalar_one_or_none()

            if old_tp and old_tp.binance_order_id:
                try:
                    await client.cancel_order(symbol, order_id=old_tp.binance_order_id)
                    old_tp.status = "CANCELED"
                except Exception as e:
                    logger.warning(f"Failed to cancel old TP order: {e}")

            # Place new TP order
            tp_order_side = "SELL" if basket.side == "LONG" else "BUY"
            tp_response = await client.place_limit_order(
                symbol, tp_order_side, rounded_qty, new_tp_price, reduce_only=True
            )

            new_tp_order = Order(
                basket_id=basket.id,
                account_id=basket.account_id,
                user_id=basket.user_id,
                binance_order_id=tp_response.get("orderId"),
                binance_client_order_id=tp_response.get("clientOrderId"),
                role="TP",
                side=tp_order_side,
                type="LIMIT",
                qty=rounded_qty,
                price=new_tp_price,
                status="NEW",
                raw_response=tp_response
            )
            session.add(new_tp_order)
            basket.tp_price = new_tp_price

            logger.info(f"TP recalculated: avg_entry={new_avg_entry:.4f}, qty={total_qty}, new_tp={new_tp_price}")

        except Exception as e:
            logger.error(f"Failed to recalculate TP for basket {basket.id}: {e}")

    async def _evaluate_entry(self, session, client: BinanceClient, account: Account, config: dict, symbol: str):
        """No active basket — evaluate indicator signals for potential entry."""
        logger.info(f"Evaluating entry signals for account {account.id} on {symbol}...")
        try:
            # Fetch candle data for indicators
            df_1m = await self._fetch_klines_df(client, symbol, "1m", limit=100)
            df_5m = await self._fetch_klines_df(client, symbol, "5m", limit=100)
            df_1h = await self._fetch_klines_df(client, symbol, "1h", limit=100)

            signals = evaluate_signals(
                df_1m, df_5m, df_1h,
                rsi_period=config.get("rsi_period", 14),
                rsi_long_threshold=config.get("rsi_long_threshold", 40),
                rsi_short_threshold=config.get("rsi_short_threshold", 60),
                bb_period=config.get("bb_period", 20),
                bb_std=config.get("bb_std", 2.0),
                ema_period=config.get("ema_period", 50),
                ema_slope_lookback=config.get("ema_slope_lookback", 12),
                ema_slope_threshold=config.get("ema_slope_threshold", 0.001),
                atr_period=config.get("atr_period", 14),
                signal_threshold=config.get("signal_threshold", 55),
            )

            # Log signal details for debugging
            current_close = df_1m['close'].iloc[-1]
            logger.info(
                f"Signal check on {symbol}: close={current_close:.2f}, "
                f"long={signals['long']} (score={signals.get('long_score', 0)}), "
                f"short={signals['short']} (score={signals.get('short_score', 0)}), "
                f"atr={signals['atr']:.4f}, threshold={config.get('signal_threshold', 55)}"
            )

            # ── Apply Trend Filter (if enabled) ──
            if config.get("trend_filter_enabled", False) and (signals["long"] or signals["short"]):
                trend_timeframes = config.get("trend_timeframes", ["1d", "4h"])
                trend_ema_fast = config.get("trend_ema_fast", 9)
                trend_ema_slow = config.get("trend_ema_slow", 21)
                trends = {}

                if "1d" in trend_timeframes:
                    df_1d = await self._fetch_klines_df(client, symbol, "1d", limit=50)
                    trends["1d"] = detect_trend(df_1d, trend_ema_fast, trend_ema_slow)
                if "4h" in trend_timeframes:
                    df_4h = await self._fetch_klines_df(client, symbol, "4h", limit=50)
                    trends["4h"] = detect_trend(df_4h, trend_ema_fast, trend_ema_slow)
                if "1h" in trend_timeframes:
                    trends["1h"] = detect_trend(df_1h, trend_ema_fast, trend_ema_slow)

                trend_result = evaluate_trend_filter(trends, config.get("trend_mode", "majority"))
                logger.info(
                    f"📊 Trend filter: direction={trend_result['direction']}, "
                    f"details={trend_result['details']}, mode={config.get('trend_mode', 'majority')}"
                )

                if signals["long"] and not trend_result["allow_long"]:
                    logger.info(f"🚫 LONG signal BLOCKED by trend filter ({trend_result['direction']}): {trend_result['details']}")
                    signals["long"] = False
                if signals["short"] and not trend_result["allow_short"]:
                    logger.info(f"🚫 SHORT signal BLOCKED by trend filter ({trend_result['direction']}): {trend_result['details']}")
                    signals["short"] = False

            if signals["long"] and config.get("allow_long", True):
                logger.info(f"🟢 LONG signal detected for {symbol}! (score={signals.get('long_score', 0)})")
                await self._open_basket(session, client, account, config, symbol, "LONG", signals["atr"])
            elif signals["short"] and config.get("allow_short", True):
                logger.info(f"🔴 SHORT signal detected for {symbol}! (score={signals.get('short_score', 0)})")
                await self._open_basket(session, client, account, config, symbol, "SHORT", signals["atr"])
            else:
                logger.info(f"No entry signal on {symbol}. L={signals.get('long_score', 0)}/S={signals.get('short_score', 0)} (need {config.get('signal_threshold', 55)})")
        except Exception as e:
            logger.error(f"Error evaluating signals for account {account.id}: {e}", exc_info=True)

    async def _open_basket(self, session, client: BinanceClient, account: Account, config: dict, symbol: str, side: str, atr: float):
        """Open a new grid basket: BO market order + SO limit orders + TP limit order."""
        logger.info(f"Opening {side} basket for {symbol} on account {account.id}")

        # ── Bug Fix: Consecutive error backoff ──
        # If 3+ ERROR baskets of ANY type in the last 10 minutes,
        # skip this tick to avoid spamming Binance and polluting basket history.
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=10)
        recent_errors = (await session.execute(
            select(func.count()).select_from(Basket).where(
                Basket.account_id == account.id,
                Basket.status == "ERROR",
                Basket.opened_at >= cutoff,
            )
        )).scalar() or 0

        if recent_errors >= 3:
            logger.warning(
                f"⏸️ Skipping basket open: {recent_errors} ERROR baskets "
                f"in the last 10 minutes for account {account.id}. Backing off."
            )
            return

        # Get symbol precision from Binance
        precision = await self._get_symbol_precision(client, symbol)

        # ── Bug Fix: Check available margin, not just total balance ──
        # Use get_account_info() which returns availableBalance (margin not in use)
        try:
            account_info = await client.get_account_info()
            usdt_balance = float(account_info.get("totalWalletBalance", 0))
            available_balance = float(account_info.get("availableBalance", 0))
        except Exception as e:
            logger.error(f"Failed to get account info for {account.id}: {e}")
            return

        if usdt_balance <= 0:
            logger.error(f"Insufficient capital for account {account.id} (balance={usdt_balance}).")
            return

        # Check if available margin is sufficient for at least a minimum base order
        min_required_margin = max(config.get("base_order_usd", 10.0), 5.0)
        if available_balance < min_required_margin:
            logger.warning(
                f"⚠️ Insufficient available margin for account {account.id}: "
                f"available=${available_balance:.2f}, required>=${min_required_margin:.2f}, "
                f"wallet=${usdt_balance:.2f}. Skipping basket."
            )
            return

        # Read sizing configuration
        sizing_mode = config.get("sizing_mode", "fixed_usd")
        base_order_usd = config.get("base_order_usd", 1.0)
        compounding_enabled = config.get("compounding_enabled", False)
        compounding_pct = config.get("compounding_pct", 100.0) / 100.0  # UI sends %, convert to decimal

        # Determine effective capital:
        #   - pct_capital mode: ALWAYS use full wallet balance (the % is relative to actual balance)
        #   - fixed_usd mode: can be capped by capital_target for risk management
        if sizing_mode == "pct_capital":
            current_wallet = usdt_balance
        else:
            capital_target = config.get("capital_target", usdt_balance)
            use_full_balance = config.get("use_full_balance", True)
            current_wallet = usdt_balance if use_full_balance else min(usdt_balance, capital_target)

        initial_capital = config.get("initial_capital", current_wallet)

        ticker_price = await client.get_ticker_price(symbol)

        logger.info(
            f"Sizing: mode={sizing_mode}, base_usd=${base_order_usd}, "
            f"base_pct={config.get('base_order_pct', 1.0)}%, "
            f"compound={compounding_enabled}, wallet=${usdt_balance:.2f}, "
            f"effective_capital=${current_wallet:.2f}, initial=${initial_capital:.2f}"
        )

        # Calculate Grid
        grid_data = calculate_grid_levels(
            current_wallet=current_wallet,
            bo_price=ticker_price,
            side=side,
            atr_val=atr,
            bo_pct_of_capital=config.get("base_order_pct", 1.0) / 100.0,
            tp_pct_of_capital=config.get("take_profit_pct", 1.0) / 100.0,
            max_safety_orders=config.get("max_safety_orders", 7),
            volume_scale=config.get("volume_scale", 1.5),
            step_scale=config.get("step_scale", 1.35),
            atr_multiplier=config.get("atr_multiplier", 0.6),
            step_min_pct=config.get("step_min_pct", 0.004),
            step_max_pct=config.get("step_max_pct", 0.025),
            leverage=config.get("leverage", 10),
            base_order_usd=base_order_usd,
            sizing_mode=sizing_mode,
            compounding_enabled=compounding_enabled,
            compounding_pct=compounding_pct,
            initial_capital=initial_capital,
            tp_mode=config.get("tp_mode", "pct"),
            tp_fixed_amount=config.get("tp_fixed_amount", 0.0),
        )

        # Set leverage and margin type
        try:
            await client.set_leverage(symbol, config.get("leverage", 10))
            await client.set_margin_type(symbol, config.get("margin_type", config.get("margin_mode", "CROSS")).upper())
        except Exception as e:
            logger.warning(f"Error setting leverage/margin type (may already be set): {e}")

        bo = grid_data["bo"]

        logger.info(f"Grid calculated: BO margin=${bo['margin']:.4f}, notional=${bo['notional']:.4f}, qty={bo['qty']:.8f}")

        # Apply Binance precision rounding
        bo_qty = round_step(bo["qty"], precision["qty_step"])
        if bo_qty < precision["min_qty"]:
            logger.error(f"BO qty {bo_qty} is below minimum {precision['min_qty']}. Skipping basket.")
            return

        # Check minimum notional
        bo_notional = bo_qty * ticker_price
        if bo_notional < precision.get("min_notional", 5.0):
            logger.error(f"BO notional ${bo_notional:.2f} is below minimum ${precision.get('min_notional', 5.0)}. Skipping basket.")
            return

        # Create Basket in DB
        basket = Basket(
            account_id=account.id,
            user_id=account.user_id,
            symbol=symbol,
            side=side,
            status=BasketStatus.OPENING,
            config_snapshot=config,
            bo_price=bo["price"],
            bo_margin=bo["margin"],
            leverage=config.get("leverage", 10),
            grid_levels=grid_data["so_levels"],
            tp_target_usd=grid_data["tp_target_usd"],
        )
        session.add(basket)
        await session.flush()  # get basket.id

        # Execute BO Market Order
        try:
            order_side = "BUY" if side == "LONG" else "SELL"
            bo_response = await client.place_market_order(symbol, order_side, bo_qty)

            # Extract fill data from the market order response
            bo_filled_qty = float(bo_response.get("executedQty", 0))
            if bo_filled_qty <= 0:
                # Testnet may return executedQty=0 for filled orders — use requested qty
                bo_filled_qty = bo_qty
                logger.warning(f"executedQty was 0 in BO response, falling back to requested qty: {bo_qty}")
            bo_avg_price = float(bo_response.get("avgPrice", 0))
            if bo_avg_price == 0:
                # Fallback: calculate from fills array
                fills = bo_response.get("fills", [])
                if fills:
                    total_cost = sum(float(f.get("price", 0)) * float(f.get("qty", 0)) for f in fills)
                    total_qty = sum(float(f.get("qty", 0)) for f in fills)
                    bo_avg_price = total_cost / total_qty if total_qty > 0 else bo["price"]
                else:
                    bo_avg_price = bo["price"]
            bo_commission = sum(float(f.get("commission", 0)) for f in bo_response.get("fills", []))
            # If no fills array (testnet may not return it), estimate from cumQuote
            if bo_commission == 0:
                cum_quote = float(bo_response.get("cumQuote", 0))
                if cum_quote > 0:
                    bo_commission = cum_quote * 0.0004  # taker fee estimate

            logger.info(f"BO fill: qty={bo_filled_qty}, avg_price={bo_avg_price:.4f}, commission={bo_commission:.6f}")

            bo_order = Order(
                basket_id=basket.id,
                account_id=account.id,
                user_id=account.user_id,
                binance_order_id=bo_response.get("orderId"),
                binance_client_order_id=bo_response.get("clientOrderId"),
                role="BO",
                side=order_side,
                type="MARKET",
                qty=bo_qty,
                price=bo_avg_price,
                status="FILLED",
                filled_qty=bo_filled_qty,
                avg_fill_price=bo_avg_price,
                commission=bo_commission,
                filled_at=datetime.now(timezone.utc),
                raw_response=bo_response
            )
            session.add(bo_order)

            # ── Virtual SOs ──
            # SO levels are stored in basket.grid_levels but NOT placed as
            # Binance limit orders.  The monitor tick (_check_virtual_sos)
            # will execute them as market orders when mark price reaches
            # each level.  This saves API weight, margin, and avoids
            # cancel-all risk.
            logger.info(
                f"Virtual SOs: {len(grid_data['so_levels'])} levels stored, "
                f"will execute as market orders when price reaches each level"
            )

            # Place TP limit order
            avg_entry = bo_avg_price  # Use actual fill price from Binance
            tp_qty = round_step(bo_filled_qty, precision["qty_step"])  # Use actual filled qty
            tp_price = calculate_tp_price(side, avg_entry, tp_qty, grid_data["tp_target_usd"])
            tp_price = round_tick(tp_price, precision["tick_size"])
            tp_order_side = "SELL" if side == "LONG" else "BUY"

            tp_response = await client.place_limit_order(
                symbol, tp_order_side, tp_qty, tp_price, reduce_only=True
            )

            tp_order = Order(
                basket_id=basket.id,
                account_id=account.id,
                user_id=account.user_id,
                binance_order_id=tp_response.get("orderId"),
                binance_client_order_id=tp_response.get("clientOrderId"),
                role="TP",
                side=tp_order_side,
                type="LIMIT",
                qty=tp_qty,
                price=tp_price,
                status="NEW",
                raw_response=tp_response
            )
            session.add(tp_order)

            basket.status = BasketStatus.OPEN
            basket.avg_entry = avg_entry
            basket.qty = bo_filled_qty
            basket.tp_price = tp_price

            # Calculate and store liquidation price
            try:
                liq_price = calculate_liquidation_price(
                    side=side,
                    avg_entry=avg_entry,
                    total_qty=bo_filled_qty,
                    wallet_balance=usdt_balance,
                    leverage=config.get("leverage", 10),
                    symbol=symbol,
                )
                basket.liquidation_price = liq_price
                logger.info(f"Liquidation price estimate: ${liq_price:.4f}")
            except Exception as e:
                logger.warning(f"Could not calculate liquidation price: {e}")

            await session.commit()
            logger.info(f"✅ Basket {basket.id} OPENED: side={side}, bo_qty={bo_qty}, "
                       f"bo_margin=${bo['margin']:.4f}, tp={tp_price}")

            # Send basket opened email + Telegram
            try:
                from app.services.notification_service import notification_service
                user_result = await session.execute(select(User).where(User.id == account.user_id))
                user_obj = user_result.scalars().first()
                if user_obj:
                    await notification_service.notify_basket_opened(
                        user_obj.email, symbol, side,
                        f"${bo_avg_price:.4f}", f"${bo['margin']:.2f}",
                        str(config.get('leverage', 10)),
                        user_id=account.user_id, account_name=account.name,
                    )
            except Exception:
                pass

        except Exception as e:
            logger.error(f"Failed to place grid orders for basket: {e}", exc_info=True)
            basket.status = BasketStatus.ERROR
            basket.exit_reason = str(e)[:500]
            await session.commit()
