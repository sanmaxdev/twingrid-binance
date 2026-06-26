import asyncio
import hashlib
import logging
import uuid
from datetime import UTC

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_workspace_member
from app.core.database import get_db
from app.core.enums import AccountStatus, WorkspaceRole
from app.core.security import decrypt_secret, encrypt_secret
from app.models.account import Account
from app.models.platform_settings import PlatformSettings
from app.models.settings import AccountSettings
from app.models.workspace_member import WorkspaceMember
from app.schemas.account import (
    AccountCreate,
    AccountResponse,
    AccountSettingsResponse,
    AccountSettingsUpdate,
    AccountUpdate,
    AutoTradeToggle,
    ConnectionTestRequest,
    PlatformSettingsResponse,
)
from app.services.binance_client import BinanceClient
from app.services.binance_ws_manager import ws_cache

router = APIRouter()

logger = logging.getLogger(__name__)

DEFAULT_STRATEGY_CONFIG = {
    "active_symbols": ["BTCUSDT"],
    "margin_type": "CROSS",
    "leverage": 10,
    # Sizing
    "sizing_mode": "fixed_usd",  # "fixed_usd" or "pct_capital"
    "base_order_usd": 1.0,  # Fixed $1 base order
    "base_order_pct": 1.0,  # 1% of capital (when in pct mode)
    # Compounding
    "compounding_enabled": False,
    "compounding_pct": 100,  # 100% = fully proportional to growth
    "initial_capital": 0,  # Set on first trade if 0
    # Grid
    "max_safety_orders": 7,
    "take_profit_pct": 1.0,
    "tp_mode": "pct",  # "pct" or "fixed"
    "tp_fixed_amount": 5.0,  # Fixed USD amount when tp_mode="fixed"
    "volume_scale": 1.5,
    "step_scale": 1.35,
    # Signal tuning
    "rsi_long_threshold": 40,
    "rsi_short_threshold": 60,
    "signal_threshold": 55,
    "allow_long": True,
    "allow_short": True,
}


def _hash_api_key(api_key: str) -> str:
    """Generate a SHA256 hash of the API key for duplicate detection."""
    return hashlib.sha256(api_key.encode("utf-8")).hexdigest()


@router.post("/", response_model=AccountResponse, status_code=status.HTTP_201_CREATED)
async def create_account(
    account_in: AccountCreate,
    workspace_member: WorkspaceMember = Depends(get_current_workspace_member),
    db: AsyncSession = Depends(get_db),
):
    if workspace_member.role not in [WorkspaceRole.OWNER, WorkspaceRole.ADMIN]:
        raise HTTPException(status_code=403, detail="Not enough permissions to add accounts")

    # Check subscription account limit
    from app.services.subscription_service import check_account_limit

    limit_check = await check_account_limit(db, workspace_member.user_id)
    if not limit_check["allowed"]:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "account_limit_reached",
                "message": f"Your {limit_check['plan'].upper()} plan allows up to {limit_check['max']} account(s). Upgrade to connect more accounts.",
                "current": limit_check["current"],
                "max": limit_check["max"],
                "plan": limit_check["plan"],
            },
        )

    # Check for duplicate API key across ALL accounts (any user/workspace)
    key_hash = _hash_api_key(account_in.api_key)
    existing = await db.execute(
        select(Account).where(Account.api_key_hash == key_hash, Account.deleted_at.is_(None))
    )
    if existing.scalars().first():
        raise HTTPException(
            status_code=409,
            detail="This API key is already linked to an account. Each Binance API key can only be connected once.",
        )

    # Encrypt keys
    api_key_enc = encrypt_secret(account_in.api_key)
    api_secret_enc = encrypt_secret(account_in.api_secret)

    # Create account with user_id from workspace member
    new_account = Account(
        workspace_id=workspace_member.workspace_id,
        user_id=workspace_member.user_id,
        name=account_in.name,
        exchange=account_in.exchange,
        is_testnet=account_in.is_testnet,
        api_key_encrypted=api_key_enc,
        api_secret_encrypted=api_secret_enc,
        api_key_hash=key_hash,
        status=AccountStatus.IDLE,
        auto_trade_enabled=False,
    )
    db.add(new_account)
    await db.flush()

    # Create default settings
    default_settings = AccountSettings(
        account_id=new_account.id,
        config=DEFAULT_STRATEGY_CONFIG,
        updated_by=workspace_member.user_id,
    )
    db.add(default_settings)
    await db.commit()

    # Eagerly load the settings relationship to avoid async lazy-load crash
    stmt = (
        select(Account).where(Account.id == new_account.id).options(selectinload(Account.settings))
    )
    result = await db.execute(stmt)
    account_with_settings = result.scalars().first()

    return account_with_settings


@router.get("/", response_model=list[AccountResponse])
async def list_accounts(
    workspace_member: WorkspaceMember = Depends(get_current_workspace_member),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Account)
        .where(Account.workspace_id == workspace_member.workspace_id, Account.deleted_at.is_(None))
        .options(selectinload(Account.settings))
    )
    result = await db.execute(stmt)
    accounts = result.scalars().all()
    return accounts


@router.get("/platform-trading-status", response_model=PlatformSettingsResponse)
async def get_platform_trading_status(
    workspace_member: WorkspaceMember = Depends(get_current_workspace_member),
    db: AsyncSession = Depends(get_db),
):
    """Check if platform trading is enabled (readable by any authenticated user)."""
    result = await db.execute(
        select(PlatformSettings).where(PlatformSettings.key == "trading_enabled")
    )
    setting = result.scalar_one_or_none()
    trading_enabled = False
    if setting:
        trading_enabled = setting.value is True or setting.value == "true"
    return PlatformSettingsResponse(trading_enabled=trading_enabled)


@router.get("/{account_id}", response_model=AccountResponse)
async def get_account(
    account_id: uuid.UUID,
    workspace_member: WorkspaceMember = Depends(get_current_workspace_member),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Account).where(Account.id == account_id).options(selectinload(Account.settings))
    result = await db.execute(stmt)
    account = result.scalars().first()
    if not account or account.deleted_at or account.workspace_id != workspace_member.workspace_id:
        raise HTTPException(status_code=404, detail="Account not found")

    return account


@router.patch("/{account_id}", response_model=AccountResponse)
async def update_account(
    account_id: uuid.UUID,
    account_in: AccountUpdate,
    workspace_member: WorkspaceMember = Depends(get_current_workspace_member),
    db: AsyncSession = Depends(get_db),
):
    if workspace_member.role not in [WorkspaceRole.OWNER, WorkspaceRole.ADMIN]:
        raise HTTPException(status_code=403, detail="Not enough permissions to update accounts")

    account = await db.get(Account, account_id)
    if not account or account.deleted_at or account.workspace_id != workspace_member.workspace_id:
        raise HTTPException(status_code=404, detail="Account not found")

    if account_in.name is not None:
        account.name = account_in.name
    if account_in.api_key is not None:
        account.api_key_encrypted = encrypt_secret(account_in.api_key)
        account.api_key_hash = _hash_api_key(account_in.api_key)
    if account_in.api_secret is not None:
        account.api_secret_encrypted = encrypt_secret(account_in.api_secret)

    await db.commit()
    await db.refresh(account)
    return account


@router.delete("/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(
    account_id: uuid.UUID,
    workspace_member: WorkspaceMember = Depends(get_current_workspace_member),
    db: AsyncSession = Depends(get_db),
):
    from datetime import datetime

    if workspace_member.role not in [WorkspaceRole.OWNER, WorkspaceRole.ADMIN]:
        raise HTTPException(status_code=403, detail="Not enough permissions to delete accounts")

    account = await db.get(Account, account_id)
    if not account or account.deleted_at or account.workspace_id != workspace_member.workspace_id:
        raise HTTPException(status_code=404, detail="Account not found")

    account.deleted_at = datetime.now(UTC)
    account.status = AccountStatus.HALTED
    account.auto_trade_enabled = False
    await db.commit()


@router.post("/{account_id}/toggle-auto-trade", response_model=AccountResponse)
async def toggle_auto_trade(
    account_id: uuid.UUID,
    body: AutoTradeToggle,
    workspace_member: WorkspaceMember = Depends(get_current_workspace_member),
    db: AsyncSession = Depends(get_db),
):
    """Toggle auto-trade for an account. Cannot enable if platform trading is disabled."""
    account = await db.get(Account, account_id)
    if not account or account.deleted_at or account.workspace_id != workspace_member.workspace_id:
        raise HTTPException(status_code=404, detail="Account not found")

    if body.enabled:
        # Check platform trading is enabled before allowing user to enable
        result = await db.execute(
            select(PlatformSettings).where(PlatformSettings.key == "trading_enabled")
        )
        setting = result.scalar_one_or_none()
        platform_trading_on = setting and (setting.value is True or setting.value == "true")

        if not platform_trading_on:
            raise HTTPException(
                status_code=403,
                detail="Platform trading is currently disabled by the administrator. Cannot enable auto-trade.",
            )

    account.auto_trade_enabled = body.enabled
    await db.commit()

    stmt = select(Account).where(Account.id == account_id).options(selectinload(Account.settings))
    result = await db.execute(stmt)
    return result.scalars().first()


@router.post("/{account_id}/start", response_model=AccountResponse)
async def start_trading(
    account_id: uuid.UUID,
    workspace_member: WorkspaceMember = Depends(get_current_workspace_member),
    db: AsyncSession = Depends(get_db),
):
    """Set account status to RUNNING and enable auto-trade."""
    account = await db.get(Account, account_id)
    if not account or account.deleted_at or account.workspace_id != workspace_member.workspace_id:
        raise HTTPException(status_code=404, detail="Account not found")

    # Check platform trading
    result = await db.execute(
        select(PlatformSettings).where(PlatformSettings.key == "trading_enabled")
    )
    setting = result.scalar_one_or_none()
    platform_trading_on = setting and (setting.value is True or setting.value == "true")

    if not platform_trading_on:
        raise HTTPException(
            status_code=403, detail="Platform trading is currently disabled by the administrator."
        )

    account.status = AccountStatus.RUNNING
    account.auto_trade_enabled = True
    await db.commit()

    stmt = select(Account).where(Account.id == account_id).options(selectinload(Account.settings))
    result = await db.execute(stmt)
    return result.scalars().first()


@router.post("/{account_id}/stop", response_model=AccountResponse)
async def stop_trading(
    account_id: uuid.UUID,
    workspace_member: WorkspaceMember = Depends(get_current_workspace_member),
    db: AsyncSession = Depends(get_db),
):
    """Set account status to PAUSED and disable auto-trade."""
    account = await db.get(Account, account_id)
    if not account or account.deleted_at or account.workspace_id != workspace_member.workspace_id:
        raise HTTPException(status_code=404, detail="Account not found")

    account.status = AccountStatus.PAUSED
    account.auto_trade_enabled = False
    await db.commit()

    stmt = select(Account).where(Account.id == account_id).options(selectinload(Account.settings))
    result = await db.execute(stmt)
    return result.scalars().first()


@router.post("/{account_id}/emergency-close")
async def emergency_close(
    account_id: uuid.UUID,
    workspace_member: WorkspaceMember = Depends(get_current_workspace_member),
    db: AsyncSession = Depends(get_db),
):
    """Cancel all orders and close all positions for an account. Halt account."""
    account = await db.get(Account, account_id)
    if not account or account.deleted_at or account.workspace_id != workspace_member.workspace_id:
        raise HTTPException(status_code=404, detail="Account not found")

    api_key = decrypt_secret(account.api_key_encrypted)
    api_secret = decrypt_secret(account.api_secret_encrypted)
    client = BinanceClient(api_key=api_key, api_secret=api_secret, is_testnet=account.is_testnet)

    # Get all active symbols for this account
    from app.core.symbols import normalize_active_symbols

    config = account.settings.config if account.settings else {}
    active_syms = normalize_active_symbols(config)

    results = {}
    for symbol in active_syms:
        try:
            await client.cancel_all_orders(symbol)
            results[f"cancel_orders_{symbol}"] = "done"
        except Exception as e:
            results[f"cancel_orders_{symbol}"] = str(e)

        try:
            close_result = await client.close_all_positions(symbol)
            results[f"close_positions_{symbol}"] = f"Closed {len(close_result)} positions"
        except Exception as e:
            results[f"close_positions_{symbol}"] = str(e)

    account.status = AccountStatus.HALTED
    account.auto_trade_enabled = False
    await db.commit()

    return {"status": "halted", "details": results}


@router.post("/{account_id}/test-connection")
async def test_connection(
    account_id: uuid.UUID,
    workspace_member: WorkspaceMember = Depends(get_current_workspace_member),
    db: AsyncSession = Depends(get_db),
):
    account = await db.get(Account, account_id)
    if not account or account.deleted_at or account.workspace_id != workspace_member.workspace_id:
        raise HTTPException(status_code=404, detail="Account not found")

    api_key = decrypt_secret(account.api_key_encrypted)
    api_secret = decrypt_secret(account.api_secret_encrypted)

    client = BinanceClient(api_key=api_key, api_secret=api_secret, is_testnet=account.is_testnet)

    try:
        data = await client.verify_credentials()
        return {"status": "success", "message": "Connection verified successfully.", "data": data}
    except ValueError:
        raise HTTPException(
            status_code=400, detail="Invalid API credentials or insufficient permissions"
        ) from None
    except Exception as e:
        logger.error(f"Connection test failed for account {account_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to connect to Binance API") from e


@router.post("/test-connection/preview")
async def test_connection_preview(
    req: ConnectionTestRequest,
    workspace_member: WorkspaceMember = Depends(get_current_workspace_member),
):
    if workspace_member.role not in [WorkspaceRole.OWNER, WorkspaceRole.ADMIN]:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    client = BinanceClient(
        api_key=req.api_key, api_secret=req.api_secret, is_testnet=req.is_testnet
    )
    try:
        data = await client.verify_credentials()
        return {"status": "success", "message": "Connection verified successfully.", "data": data}
    except ValueError:
        raise HTTPException(
            status_code=400, detail="Invalid API credentials or insufficient permissions"
        ) from None
    except Exception as e:
        logger.error(f"Connection preview test failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to connect to Binance API") from e


@router.patch("/{account_id}/settings", response_model=AccountSettingsResponse)
async def update_account_settings(
    account_id: uuid.UUID,
    settings_in: AccountSettingsUpdate,
    workspace_member: WorkspaceMember = Depends(get_current_workspace_member),
    db: AsyncSession = Depends(get_db),
):
    if workspace_member.role not in [WorkspaceRole.OWNER, WorkspaceRole.ADMIN]:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    # Verify account belongs to workspace
    account = await db.get(Account, account_id)
    if not account or account.deleted_at or account.workspace_id != workspace_member.workspace_id:
        raise HTTPException(status_code=404, detail="Account not found")

    # Fetch settings
    stmt = select(AccountSettings).where(AccountSettings.account_id == account_id)
    result = await db.execute(stmt)
    settings = result.scalars().first()

    if not settings:
        # Create settings if they don't exist
        settings = AccountSettings(
            account_id=account_id, config=settings_in.config, updated_by=workspace_member.user_id
        )
        db.add(settings)
    else:
        # Update existing config (merge or overwrite?)
        # Let's merge it so we don't drop existing ones not provided
        merged_config = {**settings.config, **settings_in.config}
        settings.config = merged_config
        settings.updated_by = workspace_member.user_id
        settings.version += 1

    # ── Normalize active_symbols (backward compat: active_symbol → active_symbols) ──
    final_config = settings.config
    from app.core.symbols import (
        MAX_ACTIVE_SYMBOLS,
        SUPPORTED_SYMBOLS_SET,
        get_symbol_meta,
        normalize_active_symbols,
    )

    active_syms = normalize_active_symbols(final_config)
    if not active_syms:
        active_syms = ["BTCUSDT"]
    # Write back normalized form
    settings.config = {**final_config, "active_symbols": active_syms}
    # Remove old key if present
    if "active_symbol" in settings.config:
        del settings.config["active_symbol"]

    # Validate symbol count
    if len(active_syms) > MAX_ACTIVE_SYMBOLS:
        raise HTTPException(
            status_code=422,
            detail=f"Maximum {MAX_ACTIVE_SYMBOLS} active symbols allowed, got {len(active_syms)}.",
        )
    # Validate each symbol is supported
    for sym in active_syms:
        if sym not in SUPPORTED_SYMBOLS_SET:
            raise HTTPException(status_code=422, detail=f"Unsupported symbol: {sym}")

    # ── Pre-validation: check that settings will produce viable orders ──
    leverage = final_config.get("leverage", 10)
    base_order_usd = final_config.get("base_order_usd", 1.0)
    sizing_mode = final_config.get("sizing_mode", "fixed_usd")

    for symbol in active_syms:
        meta = get_symbol_meta(symbol)
        mins = {
            "min_qty": meta["min_qty"],
            "min_notional": meta["min_notional"],
            "price_approx": meta["price_approx"],
        }

        if sizing_mode == "fixed_usd":
            bo_notional = base_order_usd * leverage
            bo_qty = bo_notional / mins["price_approx"]

            issues = []
            if bo_notional < mins["min_notional"]:
                issues.append(
                    f"Base order notional (${base_order_usd} x {leverage}x = ${bo_notional:.2f}) "
                    f"is below Binance minimum notional (${mins['min_notional']}) for {symbol}."
                )
            if bo_qty < mins["min_qty"]:
                issues.append(
                    f"Base order qty ({bo_qty:.6f}) is below Binance minimum ({mins['min_qty']}) for {symbol}. "
                    f"Increase base order USD or leverage."
                )

            if issues:
                raise HTTPException(
                    status_code=422,
                    detail={
                        "code": "settings_validation_failed",
                        "message": f"Settings produce orders too small for {symbol} on Binance.",
                        "issues": issues,
                        "suggestions": [
                            f"Increase base order from ${base_order_usd} to at least ${max(mins['min_notional'] / leverage, mins['min_qty'] * mins['price_approx'] / leverage):.2f}",
                            f"Or increase leverage from {leverage}x",
                        ],
                    },
                )

    await db.commit()
    await db.refresh(settings)

    return settings


@router.get("/{account_id}/dashboard")
async def get_account_dashboard(
    account_id: uuid.UUID,
    workspace_member: WorkspaceMember = Depends(get_current_workspace_member),
    db: AsyncSession = Depends(get_db),
):
    # ── DB phase: extract everything we need, then release the session ──
    account = await db.get(Account, account_id)
    if not account or account.deleted_at or account.workspace_id != workspace_member.workspace_id:
        raise HTTPException(status_code=404, detail="Account not found")

    api_key = decrypt_secret(account.api_key_encrypted)
    api_secret = decrypt_secret(account.api_secret_encrypted)
    is_testnet = account.is_testnet
    aid = str(account_id)

    # Close the DB session NOW — all subsequent work is Redis/Binance REST
    # which can take 10-20s. Holding a DB connection during that time causes
    # pool exhaustion under concurrent load.
    await db.close()

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
