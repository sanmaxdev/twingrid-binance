"""Fee engine — core business logic for Twin Grid profit-share fees."""

import structlog
from decimal import Decimal
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.user import User
from app.models.account import Account
from app.models.settings import AccountSettings
from app.models.fee_transaction import FeeTransaction
from app.models.platform_settings import PlatformSettings
from app.models.user_subscription import UserSubscription
from app.models.subscription_plan import SubscriptionPlan
from app.core.enums import FeeTransactionType

logger = structlog.get_logger(__name__)


class RiskCheckResult:
    """Result of a balance gate check."""
    def __init__(self, passed: bool, reason: str = ""):
        self.passed = passed
        self.reason = reason


async def get_fee_setting(db: AsyncSession, key: str, default=None):
    """Read a fee-related platform setting."""
    result = await db.execute(
        select(PlatformSettings).where(PlatformSettings.key == key)
    )
    setting = result.scalar_one_or_none()
    if not setting:
        return default
    val = setting.value
    # Handle JSONB: could be stored as raw string or native type
    if isinstance(val, str):
        val = val.strip('"')
    return val


async def is_fee_enabled(db: AsyncSession) -> bool:
    """Check if the fee system is enabled."""
    val = await get_fee_setting(db, "twin_grid_fee_enabled", "true")
    return str(val).lower() in ("true", "1", "yes")


async def get_fee_percentage(db: AsyncSession, user_id=None) -> Decimal:
    """
    Get effective fee percentage with correct priority:
      1. Admin override (fee_percentage_override is explicitly set on user)
      2. Subscription plan's default_fee_pct (for Pro / Elite users)
      3. Global platform fee (fallback — effectively for Free plan users)
    """
    if user_id:
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user:
            # Priority 1: explicit admin override
            if user.fee_percentage_override is not None:
                return Decimal(str(user.fee_percentage_override))

            # Priority 2: plan's default fee
            try:
                sub_result = await db.execute(
                    select(UserSubscription).where(UserSubscription.user_id == user_id)
                )
                user_sub = sub_result.scalar_one_or_none()
                if user_sub and user_sub.plan_id != "free":
                    plan_result = await db.execute(
                        select(SubscriptionPlan).where(SubscriptionPlan.id == user_sub.plan_id)
                    )
                    plan = plan_result.scalar_one_or_none()
                    if plan:
                        return Decimal(str(plan.default_fee_pct))
            except Exception:
                pass  # Fall through to global

    # Priority 3: global fee (Free plan / no subscription)
    global_pct = await get_fee_setting(db, "twin_grid_fee_percentage", "25.0")
    return Decimal(str(global_pct))


async def get_min_balance_multiplier(db: AsyncSession) -> Decimal:
    """Get the safety multiplier for minimum balance calculation."""
    val = await get_fee_setting(db, "twin_grid_min_balance_multiplier", "2.0")
    return Decimal(str(val))


async def calculate_minimum_balance(
    db: AsyncSession, user_id, account_id
) -> Decimal:
    """
    Calculate min required Twin Grid Balance before opening a new basket.

    The TP target in grid.py is: tp_target_usd = current_wallet * tp_pct / 100
    So the expected fee per basket = wallet_balance * tp_pct/100 * fee_pct/100
    Minimum = expected_fee * safety_multiplier

    We use the latest equity snapshot's wallet balance when available,
    falling back to config values, then to a safe default.
    """
    # Get account settings for TP% and capital
    result = await db.execute(
        select(AccountSettings).where(AccountSettings.account_id == account_id)
    )
    settings_obj = result.scalar_one_or_none()
    if not settings_obj:
        return Decimal("2.0")  # safe fallback

    config = settings_obj.config
    tp_mode = config.get("tp_mode", "pct")
    tp_pct = Decimal(str(config.get("take_profit_pct", 1.0))) / Decimal("100")
    tp_fixed = Decimal(str(config.get("tp_fixed_amount", 0.0)))

    # Determine the capital (wallet balance) used for TP calculation
    # Priority: latest equity snapshot > config values > default
    capital = None

    # Try to get the real wallet balance from the latest equity snapshot
    try:
        from app.models.equity_snapshot import EquitySnapshot
        snap_result = await db.execute(
            select(EquitySnapshot.wallet_balance)
            .where(EquitySnapshot.account_id == account_id)
            .order_by(EquitySnapshot.recorded_at.desc())
            .limit(1)
        )
        snap_val = snap_result.scalar_one_or_none()
        if snap_val and float(snap_val) > 0:
            capital = Decimal(str(snap_val))
    except Exception:
        pass  # Table may not exist yet or no snapshots

    # Fall back to config-based capital
    if not capital or capital <= 0:
        sizing_mode = config.get("sizing_mode", "fixed_usd")
        if sizing_mode == "pct_capital":
            raw_cap = config.get("initial_capital")
        else:
            raw_cap = config.get("capital_target")
        if raw_cap:
            capital = Decimal(str(raw_cap))

    # Final fallback
    if not capital or capital <= 0:
        capital = Decimal("1000")

    fee_pct = await get_fee_percentage(db, user_id)
    fee_pct_decimal = fee_pct / Decimal("100")
    multiplier = await get_min_balance_multiplier(db)

    # expected_fee = tp_target × fee%
    if tp_mode == "fixed" and tp_fixed > 0:
        tp_target = tp_fixed
    else:
        tp_target = capital * tp_pct
    expected_fee = tp_target * fee_pct_decimal
    minimum = expected_fee * multiplier

    # Enforce a floor of $0.50
    return max(minimum, Decimal("0.50"))


async def check_balance_gate(
    db: AsyncSession, user_id, account_id
) -> RiskCheckResult:
    """
    Pre-trade balance check. Returns pass/fail.
    Called before _evaluate_entry() in grid_bot.
    """
    if not await is_fee_enabled(db):
        return RiskCheckResult(True, "Fee system disabled")

    # Get user balance
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        return RiskCheckResult(False, "User not found")

    balance = Decimal(str(user.twin_grid_balance))
    minimum = await calculate_minimum_balance(db, user_id, account_id)

    if balance < minimum:
        return RiskCheckResult(
            False,
            f"Insufficient Twin Grid Balance: ${balance:.2f} < minimum ${minimum:.2f}. "
            f"Please deposit to continue trading."
        )

    return RiskCheckResult(True)


async def deduct_fee(
    db: AsyncSession, user_id, basket_id, realized_pnl: float
) -> FeeTransaction | None:
    """
    Called when a profitable basket closes.
    Deducts fee from user's Twin Grid Balance.
    Balance CAN go negative.
    """
    if not await is_fee_enabled(db):
        return None

    if realized_pnl <= 0:
        return None

    # ── PnL Sanity Check ──
    # Flag implausibly high PnL values that likely indicate misattribution.
    # Prevents cascading bad fee deductions and affiliate commissions.
    PNL_ABSOLUTE_CAP = 500.0  # USD — no single basket should yield > $500 on small accounts
    result = await db.execute(select(User).where(User.id == user_id))
    _user_check = result.scalar_one_or_none()
    if _user_check:
        wallet = float(_user_check.twin_grid_balance)
        # If PnL > $500 OR PnL > 50% of wallet — something is wrong
        if realized_pnl > PNL_ABSOLUTE_CAP or (wallet > 0 and realized_pnl > wallet * 0.5):
            logger.warning(
                f"🚨 PnL SANITY CHECK FAILED for basket {basket_id}: "
                f"pnl=${realized_pnl:.4f} exceeds cap (${PNL_ABSOLUTE_CAP}) or "
                f"50% of wallet (${wallet:.2f}). Skipping fee deduction — "
                f"flagging for manual review."
            )
            return None

    # ── Duplicate prevention: only one fee per basket ──
    if basket_id:
        existing = await db.execute(
            select(FeeTransaction.id).where(
                FeeTransaction.basket_id == basket_id,
                FeeTransaction.type == FeeTransactionType.FEE_DEDUCTION,
            ).limit(1)
        )
        if existing.scalar_one_or_none():
            logger.warning(
                f"⚠️ Fee already deducted for basket {basket_id}. Skipping duplicate."
            )
            return None

    fee_pct = await get_fee_percentage(db, user_id)
    fee_pct_decimal = fee_pct / Decimal("100")
    fee_amount = Decimal(str(realized_pnl)) * fee_pct_decimal

    if fee_amount <= 0:
        return None

    # Atomically update user balance
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        logger.error(f"Cannot deduct fee: user {user_id} not found")
        return None

    balance_before = Decimal(str(user.twin_grid_balance))
    balance_after = balance_before - fee_amount
    user.twin_grid_balance = float(balance_after)

    tx = FeeTransaction(
        user_id=user_id,
        basket_id=basket_id,
        type=FeeTransactionType.FEE_DEDUCTION,
        amount=float(-fee_amount),  # negative = debit
        balance_before=float(balance_before),
        balance_after=float(balance_after),
        fee_percentage=float(fee_pct),
        basket_pnl=realized_pnl,
        note=f"Fee {fee_pct}% on basket profit ${realized_pnl:.4f}",
    )
    db.add(tx)

    logger.info(
        f"💰 Fee deducted: user={user_id}, pnl=${realized_pnl:.4f}, "
        f"fee={fee_pct}% = ${fee_amount:.4f}, "
        f"balance: ${balance_before:.4f} → ${balance_after:.4f}"
    )

    if balance_after < 0:
        logger.warning(
            f"⚠️ User {user_id} balance went NEGATIVE: ${balance_after:.4f}. "
            f"Trading will be blocked until deposit."
        )

    # Send fee + low balance email (non-blocking)
    try:
        from app.services.notification_service import notification_service
        await notification_service.notify_fee_deducted(
            user.email,
            f"{fee_amount:.4f}", f"{fee_pct}",
            f"${realized_pnl:.4f}", f"${balance_after:.2f}",
            user_id=user_id,
        )
        if balance_after < 10:
            await notification_service.notify_low_balance(
                user.email, f"${balance_after:.2f}", "$10.00",
                user_id=user_id,
            )
    except Exception:
        pass

    # ── Affiliate Commission ──
    await _credit_affiliate_commission(db, user, tx, fee_amount)

    return tx


async def _credit_affiliate_commission(
    db: AsyncSession, referral_user, fee_tx, fee_amount: Decimal
):
    """Credit affiliate commission to referrer if applicable."""
    if not referral_user.invited_by_id:
        return

    # Check if affiliate system is enabled
    from app.models.platform_settings import PlatformSettings
    setting = await db.execute(
        select(PlatformSettings).where(PlatformSettings.key == "affiliate_config")
    )
    config = setting.scalar_one_or_none()
    affiliate_cfg = config.value if config else {}
    if not affiliate_cfg.get("enabled", True):
        return

    # Get referrer
    referrer = await db.execute(select(User).where(User.id == referral_user.invited_by_id))
    referrer = referrer.scalar_one_or_none()
    if not referrer:
        return

    # Commission rate: user override → global default
    if referrer.affiliate_commission_override is not None:
        commission_pct = Decimal(str(referrer.affiliate_commission_override))
    else:
        commission_pct = Decimal(str(affiliate_cfg.get("default_commission_pct", 10.0)))

    if commission_pct <= 0:
        return

    commission_amount = abs(fee_amount) * commission_pct / Decimal("100")
    if commission_amount <= 0:
        return

    # Credit referrer affiliate balance (separate wallet)
    ref_balance_before = Decimal(str(referrer.affiliate_balance))
    ref_balance_after = ref_balance_before + commission_amount
    referrer.affiliate_balance = float(ref_balance_after)

    # Create fee transaction for referrer
    commission_tx = FeeTransaction(
        user_id=referrer.id,
        basket_id=fee_tx.basket_id,
        type=FeeTransactionType.AFFILIATE_COMMISSION,
        amount=float(commission_amount),
        balance_before=float(ref_balance_before),
        balance_after=float(ref_balance_after),
        fee_percentage=float(commission_pct),
        basket_pnl=fee_tx.basket_pnl,
        note=f"Affiliate {commission_pct}% on referral fee ${abs(fee_amount):.4f}",
    )
    db.add(commission_tx)
    await db.flush()

    # Create affiliate commission record
    from app.models.affiliate_commission import AffiliateCommission
    ac = AffiliateCommission(
        referrer_id=referrer.id,
        referral_id=referral_user.id,
        fee_tx_id=fee_tx.id,
        fee_amount=float(abs(fee_amount)),
        commission_pct=float(commission_pct),
        commission_amount=float(commission_amount),
    )
    db.add(ac)

    logger.info(
        f"🤝 Affiliate commission: referrer={referrer.id}, "
        f"referral={referral_user.id}, fee=${abs(fee_amount):.4f}, "
        f"commission={commission_pct}% = ${commission_amount:.4f}"
    )


async def credit_deposit(
    db: AsyncSession, user_id, amount: float, admin_id=None
) -> FeeTransaction:
    """Credit a deposit to user's Twin Grid Balance."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise ValueError(f"User {user_id} not found")

    balance_before = Decimal(str(user.twin_grid_balance))
    balance_after = balance_before + Decimal(str(amount))
    user.twin_grid_balance = float(balance_after)

    tx = FeeTransaction(
        user_id=user_id,
        type=FeeTransactionType.DEPOSIT,
        amount=float(amount),
        balance_before=float(balance_before),
        balance_after=float(balance_after),
        note=f"USDT deposit credited: ${amount:.4f}",
        created_by=admin_id,
    )
    db.add(tx)

    logger.info(
        f"✅ Deposit credited: user={user_id}, amount=${amount:.4f}, "
        f"balance: ${balance_before:.4f} → ${balance_after:.4f}"
    )

    # Send deposit email (non-blocking)
    try:
        from app.services.notification_service import notification_service
        await notification_service.notify_deposit_credited(
            user.email, f"{amount:.2f}", f"${balance_after:.2f}",
            user_id=user_id,
        )
    except Exception:
        pass

    return tx


async def admin_adjust_balance(
    db: AsyncSession, user_id, amount: float, note: str, admin_id
) -> FeeTransaction:
    """Admin manual balance add/remove."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise ValueError(f"User {user_id} not found")

    balance_before = Decimal(str(user.twin_grid_balance))
    balance_after = balance_before + Decimal(str(amount))
    user.twin_grid_balance = float(balance_after)

    tx_type = FeeTransactionType.ADMIN_CREDIT if amount >= 0 else FeeTransactionType.ADMIN_DEBIT

    tx = FeeTransaction(
        user_id=user_id,
        type=tx_type,
        amount=float(amount),
        balance_before=float(balance_before),
        balance_after=float(balance_after),
        note=note,
        created_by=admin_id,
    )
    db.add(tx)

    logger.info(
        f"Admin balance adjustment: user={user_id}, amount=${amount:.4f}, "
        f"note='{note}', balance: ${balance_before:.4f} → ${balance_after:.4f}, "
        f"by admin={admin_id}"
    )
    return tx
