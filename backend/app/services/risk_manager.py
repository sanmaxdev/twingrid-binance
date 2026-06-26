"""Risk manager — per-account and per-user safety gates per §5.3."""

import structlog
from decimal import Decimal
from datetime import datetime, timedelta, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.account import Account
from app.models.basket import Basket
from app.models.user import User

logger = structlog.get_logger()

# ── Configuration defaults (can be moved to platform_settings) ──

MAX_ACTIVE_ACCOUNTS_PER_USER = 10
MAX_DAILY_LOSS_USD = 500.0  # Per account
MAX_BASKET_AGE_HOURS = 72  # Auto-close baskets older than this
COOLDOWN_BETWEEN_BASKETS_SECONDS = 300  # 5 minutes


class RiskCheckResult:
    """Result of a risk gate check."""
    def __init__(self, passed: bool, reason: str = ""):
        self.passed = passed
        self.reason = reason


async def check_user_gates(db: AsyncSession, user_id) -> RiskCheckResult:
    """Check per-user risk gates before allowing new basket."""
    # Check user is not suspended
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    if not user:
        return RiskCheckResult(False, "User not found")
    if user.suspended_at:
        return RiskCheckResult(False, "User is suspended")

    # Check max active accounts
    active_accounts = (await db.execute(
        select(func.count()).select_from(Account).where(
            Account.user_id == user_id,
            Account.status == "RUNNING",
            Account.deleted_at == None,
        )
    )).scalar()

    if active_accounts > MAX_ACTIVE_ACCOUNTS_PER_USER:
        return RiskCheckResult(False, f"Max active accounts exceeded ({active_accounts}/{MAX_ACTIVE_ACCOUNTS_PER_USER})")

    return RiskCheckResult(True)


async def check_account_gates(db: AsyncSession, account_id, max_daily_loss: float = MAX_DAILY_LOSS_USD) -> RiskCheckResult:
    """Check per-account risk gates before opening new basket."""
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # Check daily loss
    daily_loss = (await db.execute(
        select(func.coalesce(func.sum(Basket.realized_pnl), 0)).where(
            Basket.account_id == account_id,
            Basket.closed_at >= today_start,
            Basket.realized_pnl < 0,
        )
    )).scalar()

    daily_loss_abs = abs(float(daily_loss))
    if daily_loss_abs >= max_daily_loss:
        return RiskCheckResult(
            False,
            f"Daily loss limit reached: ${daily_loss_abs:.2f} / ${max_daily_loss:.2f}"
        )

    return RiskCheckResult(True)


async def check_cooldown(db: AsyncSession, account_id, cooldown_seconds: int = COOLDOWN_BETWEEN_BASKETS_SECONDS) -> RiskCheckResult:
    """Check if enough time has passed since the last basket closed."""
    now = datetime.now(timezone.utc)
    cooldown_cutoff = now - timedelta(seconds=cooldown_seconds)

    last_basket = (await db.execute(
        select(Basket).where(
            Basket.account_id == account_id,
            Basket.closed_at >= cooldown_cutoff,
        ).order_by(Basket.closed_at.desc()).limit(1)
    )).scalars().first()

    if last_basket:
        remaining = cooldown_seconds - (now - last_basket.closed_at).total_seconds()
        return RiskCheckResult(False, f"Cooldown active — {int(remaining)}s remaining")

    return RiskCheckResult(True)


async def check_basket_age(db: AsyncSession, account_id, max_age_hours: int = MAX_BASKET_AGE_HOURS) -> list[Basket]:
    """Return baskets that have exceeded maximum age."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=max_age_hours)

    result = await db.execute(
        select(Basket).where(
            Basket.account_id == account_id,
            Basket.status.in_(["OPENING", "OPEN"]),
            Basket.opened_at < cutoff,
        )
    )
    return result.scalars().all()


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Binance USDⓈ-M Maintenance Margin Tier Table
# Source: https://www.binance.com/en/futures/trading-rules/perpetual/leverage-margin
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Each tier: (max_notional_usd, maint_margin_rate, maint_amount_usd)
# maint_amount is the cumulative offset for the tiered calculation
MAINTENANCE_MARGIN_TIERS = {
    "BTCUSDT": [
        (50_000,       0.004,   0),
        (250_000,      0.005,   50),
        (1_000_000,    0.01,    1_300),
        (5_000_000,    0.025,   16_300),
        (10_000_000,   0.05,    141_300),
        (20_000_000,   0.10,    641_300),
        (50_000_000,   0.125,   1_141_300),
        (100_000_000,  0.15,    2_391_300),
        (200_000_000,  0.25,    12_391_300),
        (300_000_000,  0.50,    62_391_300),
    ],
    "ETHUSDT": [
        (10_000,       0.005,   0),
        (100_000,      0.007,   20),
        (500_000,      0.01,    320),
        (1_000_000,    0.02,    5_320),
        (2_000_000,    0.05,    35_320),
        (5_000_000,    0.10,    135_320),
        (10_000_000,   0.125,   260_320),
        (20_000_000,   0.15,    510_320),
        (50_000_000,   0.25,    2_510_320),
    ],
    "SOLUSDT": [
        (5_000,        0.005,   0),
        (25_000,       0.01,    25),
        (100_000,      0.025,   400),
        (250_000,      0.05,    2_900),
        (1_000_000,    0.10,    15_400),
        (2_000_000,    0.125,   40_400),
        (5_000_000,    0.25,    290_400),
    ],
    "XRPUSDT": [
        (5_000,        0.005,   0),
        (25_000,       0.01,    25),
        (100_000,      0.025,   400),
        (250_000,      0.05,    2_900),
        (1_000_000,    0.10,    15_400),
        (2_000_000,    0.125,   40_400),
        (5_000_000,    0.25,    290_400),
    ],
    # Default tiers for any symbol not explicitly listed
    "_default": [
        (5_000,        0.005,   0),
        (25_000,       0.01,    25),
        (100_000,      0.025,   400),
        (250_000,      0.05,    2_900),
        (1_000_000,    0.10,    15_400),
    ],
}


def get_maintenance_margin(notional: float, symbol: str = "BTCUSDT") -> float:
    """
    Calculate maintenance margin for a given notional value using Binance's
    tiered maintenance margin rate table.

    Returns the maintenance margin amount in USD.
    """
    tiers = MAINTENANCE_MARGIN_TIERS.get(symbol, MAINTENANCE_MARGIN_TIERS["_default"])

    for max_notional, rate, amount in tiers:
        if notional <= max_notional:
            return notional * rate - amount

    # Beyond all tiers — use the last tier
    _, rate, amount = tiers[-1]
    return notional * rate - amount


def get_maintenance_margin_rate(notional: float, symbol: str = "BTCUSDT") -> float:
    """Get the maintenance margin rate for a given notional position size."""
    tiers = MAINTENANCE_MARGIN_TIERS.get(symbol, MAINTENANCE_MARGIN_TIERS["_default"])

    for max_notional, rate, _ in tiers:
        if notional <= max_notional:
            return rate

    return tiers[-1][1]


def calculate_liquidation_price(
    side: str,
    avg_entry: float,
    total_qty: float,
    wallet_balance: float,
    leverage: int,
    symbol: str = "BTCUSDT",
) -> float:
    """
    Approximate liquidation price using Binance's maintenance margin model.

    For CROSS margin:
      LONG:  liq_price = avg_entry - (wallet_balance - maint_margin) / qty
      SHORT: liq_price = avg_entry + (wallet_balance - maint_margin) / qty

    This is an approximation — Binance uses a slightly more complex formula
    with funding fees and unrealized PnL from other positions.
    """
    if total_qty <= 0 or avg_entry <= 0:
        return 0.0

    notional = total_qty * avg_entry
    maint_margin = get_maintenance_margin(notional, symbol)

    if side.upper() == "LONG":
        liq_price = avg_entry - (wallet_balance - maint_margin) / total_qty
        return max(0.0, liq_price)
    else:
        liq_price = avg_entry + (wallet_balance - maint_margin) / total_qty
        return max(0.0, liq_price)


def compute_margin_ratio(
    wallet_balance: float,
    unrealized_pnl: float,
    notional: float,
    symbol: str = "BTCUSDT",
) -> float:
    """
    Compute Binance margin ratio: maintenance_margin / margin_balance.

    Returns a value between 0 and 1+ where:
      - 0.0 = very safe
      - 0.8 = 80% margin used (dangerous)
      - 1.0 = liquidation (100% margin ratio)
      - >1.0 = already past liquidation
    """
    margin_balance = wallet_balance + unrealized_pnl
    if margin_balance <= 0:
        return 999.0  # effectively liquidated

    maint_margin = get_maintenance_margin(abs(notional), symbol)
    return maint_margin / margin_balance


def evaluate_basket_risk(
    sos_filled: int,
    unrealized_pnl: float,
    wallet_balance: float,
    notional: float,
    symbol: str,
    config: dict,
    peak_loss_usd: float = 0.0,
) -> RiskCheckResult:
    """
    Evaluate whether a running basket should be force-closed by the risk controller.

    Checks two independent conditions:
    1. MARGIN GUARD: If account margin ratio exceeds rc_margin_usage_pct → CLOSE
    2. SO TRIGGER + LOSS LIMIT: If SOs filled >= rc_max_so_trigger AND
       the loss matches the configured loss_direction criteria → CLOSE

    rc_loss_direction values:
      "exceeds"     — (default) Close when current loss >= threshold (stop-loss style).
      "recovers_to" — Close when loss RETURNS to threshold after having gone deeper.
                      Requires peak_loss_usd to be tracked by the caller.

    peak_loss_usd: Maximum absolute USD loss seen so far during this basket's lifetime.
                   Only relevant for "recovers_to" mode. Callers must track and pass this.

    Returns RiskCheckResult(passed=True) if basket is OK to keep running.
    Returns RiskCheckResult(passed=False, reason=...) if basket should close.
    """
    if not config.get("risk_controller_enabled", False):
        return RiskCheckResult(True)

    # ── Condition 1: Margin Guard (independent — fires regardless of SO count) ──
    margin_guard_enabled = config.get("rc_margin_guard_enabled", True)  # on by default
    rc_margin_pct = config.get("rc_margin_usage_pct", 80.0)
    if margin_guard_enabled and rc_margin_pct > 0:
        margin_ratio = compute_margin_ratio(wallet_balance, unrealized_pnl, notional, symbol)
        margin_pct = margin_ratio * 100.0
        if margin_pct >= rc_margin_pct:
            return RiskCheckResult(
                False,
                f"MARGIN_GUARD: Margin usage {margin_pct:.1f}% >= {rc_margin_pct:.0f}% threshold"
            )

    # ── Condition 2: SO Trigger + Loss Limit ──
    rc_so_trigger = config.get("rc_max_so_trigger", 5)
    if sos_filled >= rc_so_trigger:
        loss_mode = config.get("rc_loss_mode", "pct_wallet")
        loss_direction = config.get("rc_loss_direction", "exceeds")  # "exceeds" or "recovers_to"
        loss_amount = abs(unrealized_pnl)  # current absolute USD loss

        if loss_mode == "pct_wallet":
            max_loss_pct = config.get("rc_max_basket_loss_pct", 10.0)
            if wallet_balance > 0:
                current_loss_pct = (loss_amount / wallet_balance) * 100.0

                if loss_direction == "exceeds":
                    if current_loss_pct >= max_loss_pct:
                        return RiskCheckResult(
                            False,
                            f"LOSS_LIMIT[exceeds]: Loss {current_loss_pct:.1f}% of wallet >= "
                            f"{max_loss_pct:.0f}% limit (after {sos_filled} SOs filled)"
                        )
                elif loss_direction == "recovers_to":
                    # Fire when: peak was >= threshold AND current is recovering back to <= threshold
                    peak_loss_pct = (peak_loss_usd / wallet_balance) * 100.0 if wallet_balance > 0 else 0.0
                    if peak_loss_pct >= max_loss_pct and current_loss_pct <= max_loss_pct:
                        return RiskCheckResult(
                            False,
                            f"LOSS_LIMIT[recovers_to]: Loss recovered to {current_loss_pct:.1f}% "
                            f"(peak was {peak_loss_pct:.1f}%) at {max_loss_pct:.0f}% threshold "
                            f"(after {sos_filled} SOs filled)"
                        )

        elif loss_mode == "fixed_usd":
            max_loss_usd = config.get("rc_max_basket_loss_usd", 0.0)
            if max_loss_usd > 0:
                if loss_direction == "exceeds":
                    if loss_amount >= max_loss_usd:
                        return RiskCheckResult(
                            False,
                            f"LOSS_LIMIT[exceeds]: Loss ${loss_amount:.2f} >= "
                            f"${max_loss_usd:.2f} limit (after {sos_filled} SOs filled)"
                        )
                elif loss_direction == "recovers_to":
                    if peak_loss_usd >= max_loss_usd and loss_amount <= max_loss_usd:
                        return RiskCheckResult(
                            False,
                            f"LOSS_LIMIT[recovers_to]: Loss recovered to ${loss_amount:.2f} "
                            f"(peak was ${peak_loss_usd:.2f}) at ${max_loss_usd:.2f} threshold "
                            f"(after {sos_filled} SOs filled)"
                        )

    return RiskCheckResult(True)
