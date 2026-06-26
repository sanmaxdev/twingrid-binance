import asyncio
import logging
import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_admin
from app.core.enums import AccountStatus
from app.core.security import decrypt_secret
from app.models.account import Account
from app.models.platform_settings import PlatformSettings
from app.models.settings import AccountSettings
from app.models.user import User
from app.models.user_subscription import UserSubscription
from app.models.workspace import Workspace
from app.schemas.account import AccountSettingsUpdate
from app.services.binance_client import BinanceClient
from app.services.binance_ws_manager import ws_cache

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/stats", response_model=dict[str, Any])
async def get_system_stats(
    current_user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
):
    """
    Get high-level system metrics.
    """
    users_count = await db.scalar(select(func.count()).select_from(User))
    workspaces_count = await db.scalar(select(func.count()).select_from(Workspace))
    accounts_count = await db.scalar(
        select(func.count()).select_from(Account).where(Account.deleted_at.is_(None))
    )
    active_accounts_count = await db.scalar(
        select(func.count())
        .select_from(Account)
        .where(Account.status.in_(["RUNNING"]), Account.deleted_at.is_(None))
    )
    auto_trade_count = await db.scalar(
        select(func.count())
        .select_from(Account)
        .where(Account.auto_trade_enabled == True, Account.deleted_at.is_(None))
    )

    # Get platform trading status
    result = await db.execute(
        select(PlatformSettings).where(PlatformSettings.key == "trading_enabled")
    )
    setting = result.scalar_one_or_none()
    trading_enabled = False
    if setting:
        trading_enabled = setting.value is True or setting.value == "true"

    return {
        "total_users": users_count or 0,
        "total_workspaces": workspaces_count or 0,
        "total_connected_accounts": accounts_count or 0,
        "active_trading_bots": active_accounts_count or 0,
        "auto_trade_enabled_count": auto_trade_count or 0,
        "platform_trading_enabled": trading_enabled,
    }


@router.get("/platform-settings")
async def get_platform_settings(
    current_user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
):
    """Get all platform settings."""
    result = await db.execute(select(PlatformSettings))
    settings = result.scalars().all()
    return {s.key: s.value for s in settings}


@router.post("/platform-settings/trading")
async def toggle_platform_trading(
    current_user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
):
    """Toggle the master trading switch on/off."""
    result = await db.execute(
        select(PlatformSettings).where(PlatformSettings.key == "trading_enabled")
    )
    setting = result.scalar_one_or_none()

    if not setting:
        # Create the setting
        new_setting = PlatformSettings(
            key="trading_enabled", value=True, updated_by=current_user.id
        )
        db.add(new_setting)
        new_value = True
    else:
        current_value = setting.value is True or setting.value == "true"
        new_value = not current_value
        setting.value = new_value
        setting.updated_at = datetime.now(UTC)
        setting.updated_by = current_user.id

    await db.commit()

    logger.info(f"Platform trading toggled to {new_value} by {current_user.email}")

    return {
        "trading_enabled": new_value,
        "message": f"Platform trading has been {'ENABLED' if new_value else 'DISABLED'}.",
    }


@router.post("/halt-all")
async def halt_all_accounts(
    current_user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
):
    """
    Emergency halt: Disable platform trading + halt all RUNNING accounts.
    """
    # 1. Disable platform trading
    result = await db.execute(
        select(PlatformSettings).where(PlatformSettings.key == "trading_enabled")
    )
    setting = result.scalar_one_or_none()
    if setting:
        setting.value = False
        setting.updated_at = datetime.now(UTC)
        setting.updated_by = current_user.id
    else:
        db.add(PlatformSettings(key="trading_enabled", value=False, updated_by=current_user.id))

    # 2. Halt all running accounts + disable auto-trade
    await db.execute(
        update(Account)
        .where(Account.status == AccountStatus.RUNNING, Account.deleted_at.is_(None))
        .values(status=AccountStatus.HALTED, auto_trade_enabled=False)
    )

    await db.commit()

    logger.warning(f"EMERGENCY HALT-ALL executed by {current_user.email}")

    return {
        "status": "halted",
        "message": "All trading has been halted. Platform trading is now disabled. All running accounts have been stopped.",
    }


@router.get("/users")
async def list_all_users(
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    List all users in the system.
    """
    result = await db.execute(select(User).offset(skip).limit(limit))
    users = result.scalars().all()

    # Batch-fetch subscriptions
    user_ids = [u.id for u in users]
    sub_map: dict = {}
    if user_ids:
        sub_result = await db.execute(
            select(UserSubscription).where(UserSubscription.user_id.in_(user_ids))
        )
        for sub in sub_result.scalars().all():
            sub_map[sub.user_id] = sub

    return [
        {
            "id": str(u.id),
            "email": u.email,
            "display_name": u.display_name,
            "role": u.role,
            "is_active": u.is_active,
            "twin_grid_balance": float(u.twin_grid_balance),
            "suspended_at": u.suspended_at.isoformat() if u.suspended_at else None,
            "suspended_reason": u.suspended_reason,
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "subscription": {
                "plan_id": sub_map[u.id].plan_id if u.id in sub_map else "free",
                "status": sub_map[u.id].status if u.id in sub_map else "active",
            },
        }
        for u in users
    ]


@router.get("/workspaces")
async def list_all_workspaces(
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    List all workspaces in the system.
    """
    result = await db.execute(select(Workspace).offset(skip).limit(limit))
    workspaces = result.scalars().all()

    return [
        {
            "id": str(w.id),
            "name": w.name,
            "owner_id": str(w.owner_id),
        }
        for w in workspaces
    ]


@router.get("/accounts")
async def list_all_accounts(
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    List all accounts in the system with owner info.
    """
    result = await db.execute(
        select(Account).where(Account.deleted_at.is_(None)).offset(skip).limit(limit)
    )
    accounts = result.scalars().all()

    # Fetch owner info for each account
    user_ids = list(set(a.user_id for a in accounts))
    user_result = await db.execute(select(User).where(User.id.in_(user_ids)))
    users_map = {u.id: u for u in user_result.scalars().all()}

    return [
        {
            "id": str(a.id),
            "name": a.name,
            "exchange": a.exchange,
            "status": a.status,
            "is_testnet": a.is_testnet,
            "auto_trade_enabled": a.auto_trade_enabled,
            "workspace_id": str(a.workspace_id),
            "user_id": str(a.user_id),
            "owner_email": users_map[a.user_id].email if a.user_id in users_map else None,
            "owner_display_name": users_map[a.user_id].display_name
            if a.user_id in users_map
            else None,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in accounts
    ]


@router.get("/accounts/{account_id}/dashboard")
async def get_account_dashboard_admin(
    account_id: uuid.UUID,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    from app.models.basket import Basket

    # ── DB phase: run ALL database queries first, then release session ──
    account = await db.get(Account, account_id)
    if not account or account.deleted_at:
        raise HTTPException(status_code=404, detail="Account not found")

    # Extract credentials
    api_key = decrypt_secret(account.api_key_encrypted)
    api_secret = decrypt_secret(account.api_secret_encrypted)
    is_testnet = account.is_testnet
    aid = str(account_id)

    # Extract static account info for the response
    account_info_static = {
        "name": account.name,
        "exchange": account.exchange,
        "is_testnet": account.is_testnet,
        "status": account.status,
        "auto_trade_enabled": account.auto_trade_enabled,
    }

    # Get owner info
    owner = await db.get(User, account.user_id)
    owner_info = {
        "email": owner.email if owner else None,
        "display_name": owner.display_name if owner else None,
        "role": owner.role if owner else None,
        "is_active": owner.is_active if owner else None,
    }

    # Calculate PnL summary from baskets
    basket_result = await db.execute(select(Basket).where(Basket.account_id == account_id))
    all_baskets = basket_result.scalars().all()

    # Exclude ERROR baskets from total — they are failed attempts, not real trades
    error_baskets = [b for b in all_baskets if b.status == "ERROR"]
    real_baskets = [b for b in all_baskets if b.status != "ERROR"]
    total_baskets = len(real_baskets)
    closed_baskets = [b for b in all_baskets if b.status == "CLOSED"]
    active_baskets = [b for b in all_baskets if b.status in ("OPEN", "OPENING")]

    total_realized_pnl = sum(float(b.realized_pnl or 0) for b in closed_baskets)
    total_fees_paid = sum(float(b.fees_paid or 0) for b in closed_baskets)
    winning_baskets = sum(1 for b in closed_baskets if (b.realized_pnl or 0) > 0)
    closed_count = len(closed_baskets)
    win_rate = round((winning_baskets / closed_count * 100), 1) if closed_count > 0 else 0
    net_pnl = total_realized_pnl

    pnl_summary = {
        "total_realized_pnl": round(total_realized_pnl, 4),
        "total_fees_paid": round(total_fees_paid, 4),
        "net_pnl": round(net_pnl, 4),
        "total_baskets": total_baskets,
        "closed_baskets": closed_count,
        "active_baskets": len(active_baskets),
        "error_baskets": len(error_baskets),
        "winning_baskets": winning_baskets,
        "losing_baskets": closed_count - winning_baskets,
        "win_rate": win_rate,
    }

    # Close the DB session NOW — all subsequent work is Redis/Binance REST
    # which can take 10-20s. Holding a DB connection during that time causes
    # pool exhaustion under concurrent load.
    await db.close()

    # ── External API phase: Redis cache + Binance REST (no DB needed) ──
    client = BinanceClient(api_key=api_key, api_secret=api_secret, is_testnet=is_testnet)

    try:
        # Cache-first: try WebSocket-cached data for positions, balances, open_orders
        cached_positions = await ws_cache.get_positions(aid)
        cached_balances = await ws_cache.get_balances(aid)
        cached_orders = await ws_cache.get_open_orders(aid)
        cached_account_info = await ws_cache.get_account_info(aid)

        # Only fetch account_info from REST if not in cache
        if cached_account_info is None:
            try:
                account_info_raw = await asyncio.wait_for(client.get_account_info(), timeout=10.0)
                account_info = account_info_raw if isinstance(account_info_raw, dict) else {}
            except Exception as e:
                logger.warning(f"REST account_info failed for {account_id}: {e}")
                account_info = {}
        else:
            account_info = cached_account_info

        # Fetch trades and income via REST (lightweight, not rate-limited as heavily)
        recent_trades, income = await asyncio.gather(
            client.get_trade_history(limit=50),
            client.get_income_history(limit=50),
            return_exceptions=True,
        )

        # For positions/balances/orders: use cache if available, otherwise REST
        if cached_positions is None or cached_balances is None or cached_orders is None:
            positions_rest, balances_rest, orders_rest = await asyncio.gather(
                client.get_position_info() if cached_positions is None else asyncio.sleep(0),
                client.get_balances() if cached_balances is None else asyncio.sleep(0),
                client.get_open_orders() if cached_orders is None else asyncio.sleep(0),
                return_exceptions=True,
            )
        else:
            positions_rest = None
            balances_rest = None
            orders_rest = None

        def handle_res(res, default):
            if isinstance(res, Exception):
                logger.error(f"Binance API error: {res}")
                return default
            return res

        positions = (
            cached_positions if cached_positions is not None else handle_res(positions_rest, [])
        )
        balances = cached_balances if cached_balances is not None else handle_res(balances_rest, [])
        open_orders = cached_orders if cached_orders is not None else handle_res(orders_rest, [])
        recent_trades = handle_res(recent_trades, [])
        income = handle_res(income, [])

        # Filter out zero balances
        if isinstance(balances, list):
            balances = [
                b
                for b in balances
                if float(b.get("balance", 0)) > 0 or float(b.get("crossUnRealizedPNL", 0)) != 0
            ]

        # Filter out zero positions
        if isinstance(positions, list):
            positions = [p for p in positions if float(p.get("positionAmt", 0)) != 0]

        return {
            "account_info": account_info_static,
            "owner": owner_info,
            "account_summary": {
                "total_wallet_balance": account_info.get("totalWalletBalance", "0")
                if isinstance(account_info, dict)
                else "0",
                "total_unrealized_pnl": account_info.get("totalUnrealizedProfit", "0")
                if isinstance(account_info, dict)
                else "0",
                "total_margin_balance": account_info.get("totalMarginBalance", "0")
                if isinstance(account_info, dict)
                else "0",
                "available_balance": account_info.get("availableBalance", "0")
                if isinstance(account_info, dict)
                else "0",
            },
            "pnl_summary": pnl_summary,
            "balances": balances,
            "positions": positions,
            "open_orders": open_orders,
            "recent_trades": recent_trades,
            "income_history": income,
        }
    except Exception as e:
        logger.error(f"Failed to load dashboard for account {account_id}: {str(e)}")
        raise HTTPException(
            status_code=500, detail="Failed to retrieve live data from Binance"
        ) from e


@router.get("/accounts/{account_id}/balance")
async def get_account_balance_admin(
    account_id: uuid.UUID,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Lightweight endpoint: fetch only wallet balance + unrealized PnL for an account.
    Uses Redis cache first (populated by ws_manager), falls back to Binance REST only
    on cache miss.  Returns null values on error so the frontend can show '—' rather
    than '$0.00'.
    """
    account = await db.get(Account, account_id)
    if not account or account.deleted_at:
        raise HTTPException(status_code=404, detail="Account not found")

    # Extract credentials before closing DB session
    api_key = decrypt_secret(account.api_key_encrypted)
    api_secret = decrypt_secret(account.api_secret_encrypted)
    is_testnet = account.is_testnet
    aid = str(account_id)

    # Release DB connection immediately — all remaining work is Redis/REST
    await db.close()

    # --- Cache-first: try the ws_manager's cached account_info ---
    cached = await ws_cache.get_account_info(aid)
    if cached:
        return {
            "success": True,
            "total_wallet_balance": cached.get("totalWalletBalance"),
            "total_unrealized_pnl": cached.get("totalUnrealizedProfit"),
            "available_balance": cached.get("availableBalance"),
        }

    # --- Cache miss: fall back to Binance REST ---
    client = BinanceClient(api_key=api_key, api_secret=api_secret, is_testnet=is_testnet)

    try:
        account_info = await asyncio.wait_for(client.get_account_info(), timeout=12.0)
        return {
            "success": True,
            "total_wallet_balance": account_info.get("totalWalletBalance"),
            "total_unrealized_pnl": account_info.get("totalUnrealizedProfit"),
            "available_balance": account_info.get("availableBalance"),
        }
    except TimeoutError:
        logger.warning(f"Balance fetch timed out for account {account_id}")
        return {
            "success": False,
            "total_wallet_balance": None,
            "total_unrealized_pnl": None,
            "available_balance": None,
        }
    except Exception as e:
        logger.warning(f"Balance fetch failed for account {account_id}: {e}")
        return {
            "success": False,
            "total_wallet_balance": None,
            "total_unrealized_pnl": None,
            "available_balance": None,
        }


@router.get("/accounts/balances")
async def get_all_account_balances(
    current_user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
):
    """
    Batch balance endpoint: fetch wallet balance + unrealized PnL for ALL
    active accounts in a single request.

    Strategy (rate-limit safe):
      1. Read all account balances from Redis cache (populated by ws_manager
         for RUNNING accounts) — this is instant for cached accounts.
      2. For cache misses (IDLE, PAUSED, or just-added accounts), fall back
         to Binance REST **sequentially** with 1.5s stagger between calls
         to stay well within Binance's 2400 weight/minute limit.
      3. Cache any REST-fetched data in Redis so subsequent page loads are
         instant until the TTL expires.

    Returns: { "balances": { "<account_id>": { ... } | null, ... } }
    """
    import json as _json

    from app.core.redis_client import redis_client as _redis

    # 1. Load all active accounts from DB, then release the session
    result = await db.execute(select(Account).where(Account.deleted_at.is_(None)))
    accounts = result.scalars().all()

    if not accounts:
        return {"balances": {}}

    # Extract all account data we need before closing DB
    account_data = []
    for a in accounts:
        account_data.append(
            {
                "id": str(a.id),
                "api_key": decrypt_secret(a.api_key_encrypted),
                "api_secret": decrypt_secret(a.api_secret_encrypted),
                "is_testnet": a.is_testnet,
            }
        )

    # Release DB connection NOW — remaining work is Redis/Binance REST
    await db.close()

    balances_map: dict = {}

    # 2. Batch-read Redis cache for all accounts
    cache_miss_accounts = []
    for acct in account_data:
        aid = acct["id"]
        cached = await ws_cache.get_account_info(aid)
        if cached:
            balances_map[aid] = {
                "success": True,
                "total_wallet_balance": cached.get("totalWalletBalance"),
                "total_unrealized_pnl": cached.get("totalUnrealizedProfit"),
                "available_balance": cached.get("availableBalance"),
                "source": "cache",
            }
        else:
            cache_miss_accounts.append(acct)

    logger.info(
        f"Batch balance: {len(balances_map)} cached, {len(cache_miss_accounts)} cache misses"
    )

    # 3. Sequential REST fallback for cache misses (rate-limit safe)
    #    Max 5 REST calls per batch to avoid long waits; remainder shows "—"
    MAX_REST_FETCHES = 5
    for i, acct in enumerate(cache_miss_accounts[:MAX_REST_FETCHES]):
        aid = acct["id"]
        try:
            client = BinanceClient(
                api_key=acct["api_key"],
                api_secret=acct["api_secret"],
                is_testnet=acct["is_testnet"],
            )
            account_info = await asyncio.wait_for(client.get_account_info(), timeout=12.0)
            balances_map[aid] = {
                "success": True,
                "total_wallet_balance": account_info.get("totalWalletBalance"),
                "total_unrealized_pnl": account_info.get("totalUnrealizedProfit"),
                "available_balance": account_info.get("availableBalance"),
                "source": "rest",
            }
            # Cache the result in Redis so next page load is instant
            try:
                summary = {
                    "totalWalletBalance": account_info.get("totalWalletBalance", "0"),
                    "totalUnrealizedProfit": account_info.get("totalUnrealizedProfit", "0"),
                    "availableBalance": account_info.get("availableBalance", "0"),
                    "totalMarginBalance": account_info.get("totalMarginBalance", "0"),
                }
                await _redis.setex(
                    f"ws:account:{aid}:account_info",
                    300,
                    _json.dumps(summary),
                )
            except Exception:
                pass  # Non-critical — cache write failure is fine
        except Exception as e:
            logger.warning(f"Batch balance REST failed for {aid}: {e}")
            balances_map[aid] = {
                "success": False,
                "total_wallet_balance": None,
                "total_unrealized_pnl": None,
                "available_balance": None,
                "source": "error",
            }

        # Stagger REST calls: 1.5s between each to avoid rate limits
        if i < len(cache_miss_accounts[:MAX_REST_FETCHES]) - 1:
            await asyncio.sleep(1.5)

    # 4. Mark remaining cache-miss accounts (beyond MAX_REST_FETCHES) as unavailable
    for acct in cache_miss_accounts[MAX_REST_FETCHES:]:
        balances_map[acct["id"]] = {
            "success": False,
            "total_wallet_balance": None,
            "total_unrealized_pnl": None,
            "available_balance": None,
            "source": "skipped",
        }

    return {"balances": balances_map}


@router.post("/accounts/{account_id}/positions/{symbol}/close")
async def close_account_position_admin(
    account_id: uuid.UUID,
    symbol: str,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    from app.core.enums import BasketStatus
    from app.models.basket import Basket

    account = await db.get(Account, account_id)
    if not account or account.deleted_at:
        raise HTTPException(status_code=404, detail="Account not found")

    api_key = decrypt_secret(account.api_key_encrypted)
    api_secret = decrypt_secret(account.api_secret_encrypted)
    client = BinanceClient(api_key=api_key, api_secret=api_secret, is_testnet=account.is_testnet)

    try:
        # Cancel all open orders for symbol first
        await client.cancel_all_orders(symbol)

        # Get positions to find the exact quantity to close
        positions = await client.get_position_info(symbol)
        position = next((p for p in positions if p.get("symbol") == symbol), None)

        if position:
            amt = float(position.get("positionAmt", 0))
            if amt != 0:
                side = "SELL" if amt > 0 else "BUY"
                abs_amt = abs(amt)

                # Execute MARKET order to close
                await client.place_market_order(
                    symbol=symbol, side=side, quantity=abs_amt, reduce_only=True
                )
                logger.info(
                    f"Admin manually closed position for {symbol} on account {account_id}. Size: {amt}"
                )

        # Close any open baskets in the DB
        from app.models.order import Order
        from app.services.grid_bot import GridBotService

        stmt = select(Basket).where(
            Basket.account_id == account_id,
            Basket.symbol == symbol,
            Basket.status.in_([BasketStatus.OPEN, BasketStatus.OPENING]),
        )
        result = await db.execute(stmt)
        baskets = result.scalars().all()
        for basket in baskets:
            basket.status = BasketStatus.CLOSED
            basket.exit_reason = "MANUALLY_CLOSED_BY_ADMIN"
            basket.closed_at = datetime.now(UTC)

            # Cancel local DB pending orders
            stmt_pending = select(Order).where(
                Order.basket_id == basket.id, Order.status.in_(["NEW", "PARTIALLY_FILLED"])
            )
            result_pending = await db.execute(stmt_pending)
            for order in result_pending.scalars().all():
                order.status = "CANCELED"

            # Trigger fee deduction and affiliate commissions
            bot = GridBotService(account_id)
            await bot._finalize_basket(db, client, basket, symbol)

        await db.commit()

        return {"success": True, "message": f"Successfully closed position for {symbol}."}

    except Exception as e:
        logger.error(f"Failed to manually close position {symbol} for account {account_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/accounts/{account_id}/settings")
async def get_account_settings_admin(
    account_id: uuid.UUID,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: get trading settings for any account."""
    account = await db.get(Account, account_id)
    if not account or account.deleted_at:
        raise HTTPException(status_code=404, detail="Account not found")

    stmt = select(AccountSettings).where(AccountSettings.account_id == account_id)
    result = await db.execute(stmt)
    settings = result.scalars().first()

    if not settings:
        return {
            "account_id": str(account_id),
            "config": {},
            "version": 0,
            "updated_at": None,
            "updated_by": None,
        }

    return {
        "account_id": str(settings.account_id),
        "config": settings.config,
        "version": settings.version,
        "updated_at": settings.updated_at.isoformat() if settings.updated_at else None,
        "updated_by": str(settings.updated_by) if settings.updated_by else None,
    }


@router.patch("/accounts/{account_id}/settings")
async def update_account_settings_admin(
    account_id: uuid.UUID,
    settings_in: AccountSettingsUpdate,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: overwrite trading settings for any account (bypasses workspace checks)."""
    account = await db.get(Account, account_id)
    if not account or account.deleted_at:
        raise HTTPException(status_code=404, detail="Account not found")

    stmt = select(AccountSettings).where(AccountSettings.account_id == account_id)
    result = await db.execute(stmt)
    settings = result.scalars().first()

    if not settings:
        settings = AccountSettings(
            account_id=account_id, config=settings_in.config, updated_by=current_user.id
        )
        db.add(settings)
    else:
        merged_config = {**settings.config, **settings_in.config}
        settings.config = merged_config
        settings.updated_by = current_user.id
        settings.version += 1

    await db.commit()
    await db.refresh(settings)

    logger.info(f"Admin {current_user.email} updated settings for account {account_id}")

    return {
        "account_id": str(settings.account_id),
        "config": settings.config,
        "version": settings.version,
        "updated_at": settings.updated_at.isoformat() if settings.updated_at else None,
        "updated_by": str(settings.updated_by) if settings.updated_by else None,
    }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Email Management
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EMAIL_EVENTS = [
    "welcome",
    "login_alert",
    "password_reset",
    "account_suspended",
    "account_unsuspended",
    "basket_opened",
    "basket_closed",
    "fee_deducted",
    "deposit_credited",
    "low_balance",
    "position_closed_externally",
    # Subscription lifecycle
    "subscription_activated",
    "subscription_renewed",
    "subscription_payment_failed",
    "subscription_downgraded",
    "subscription_cancelled",
]


@router.get("/email/settings")
async def get_email_settings(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get email event toggle settings."""
    result = await db.execute(
        select(PlatformSettings).where(
            PlatformSettings.key.in_([f"email_event_{e}" for e in EMAIL_EVENTS])
        )
    )
    settings_map = {s.key: s.value for s in result.scalars().all()}

    events = {}
    for event in EMAIL_EVENTS:
        key = f"email_event_{event}"
        # Default: all enabled
        val = settings_map.get(key, {"enabled": True})
        if isinstance(val, dict):
            events[event] = val.get("enabled", True)
        else:
            events[event] = True

    return {"events": events}


@router.patch("/email/settings")
async def update_email_settings(
    request_body: dict,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Toggle email events on/off."""
    events = request_body.get("events", {})
    all_events = {}  # For cache update
    for event, enabled in events.items():
        if event not in EMAIL_EVENTS:
            continue
        key = f"email_event_{event}"
        result = await db.execute(select(PlatformSettings).where(PlatformSettings.key == key))
        setting = result.scalar_one_or_none()
        if setting:
            setting.value = {"enabled": bool(enabled)}
        else:
            db.add(PlatformSettings(key=key, value={"enabled": bool(enabled)}))
        all_events[event] = bool(enabled)

    await db.commit()

    # Update in-memory cache
    try:
        from app.services.notification_service import update_disabled_events

        update_disabled_events(all_events)
    except Exception:
        pass

    return {"detail": "Email settings updated"}


@router.get("/email/logs")
async def get_email_logs(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    limit: int = 200,
):
    """Get email send log from database."""
    from app.models.email_log import EmailLog

    result = await db.execute(select(EmailLog).order_by(EmailLog.created_at.desc()).limit(limit))
    logs = result.scalars().all()
    return {
        "logs": [
            {
                "to": log.to_email,
                "subject": log.subject,
                "status": log.status,
                "error": log.error,
                "timestamp": log.created_at.isoformat() if log.created_at else None,
            }
            for log in logs
        ]
    }


@router.post("/email/test")
async def send_test_email(
    request_body: dict,
    admin: User = Depends(require_admin),
):
    """Send a test email to verify Resend integration."""
    to = request_body.get("to", admin.email)
    from app.core.email import send_email
    from app.core.email_templates import _base_template

    html = _base_template(
        "Test Email",
        """
<p style="margin:0 0 16px;font-size:14px;color:#848E9C;line-height:1.6;">
This is a test email from Twin Grid Console.
</p>
<p style="margin:0;font-size:14px;color:#0ECB81;font-weight:600;">
✅ Email system is working correctly!
</p>
""",
    )
    success = await send_email(to, "Twin Grid — Test Email", html)
    return {"detail": "Test email sent" if success else "Failed to send", "success": success}
