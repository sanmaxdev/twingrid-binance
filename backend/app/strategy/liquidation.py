"""Liquidation price estimation for cross-margin per §5.2.

For USDⓈ-M cross margin, the approximate liquidation price formula is:
  Liq Price = Entry Price × (1 - 1/Leverage + Maintenance Margin Rate)  for LONG
  Liq Price = Entry Price × (1 + 1/Leverage - Maintenance Margin Rate)  for SHORT

These are estimates; Binance's actual calculation accounts for wallet balance,
unrealized PnL from other positions, and tiered maintenance margin.
"""


def estimate_liquidation_price(
    entry_price: float,
    leverage: int,
    side: str,
    maintenance_margin_rate: float = 0.004,  # Default 0.4% for lower tiers
) -> float:
    """Estimate liquidation price for a cross-margin position.

    Args:
        entry_price: Average entry price
        leverage: Leverage used
        side: 'LONG' or 'SHORT'
        maintenance_margin_rate: Maintenance margin rate (default 0.4% for small positions)

    Returns:
        Estimated liquidation price (0 if invalid inputs)
    """
    if entry_price <= 0 or leverage <= 0:
        return 0.0

    if side.upper() == "LONG":
        liq = entry_price * (1 - 1 / leverage + maintenance_margin_rate)
    elif side.upper() == "SHORT":
        liq = entry_price * (1 + 1 / leverage - maintenance_margin_rate)
    else:
        return 0.0

    return max(liq, 0.0)


def is_near_liquidation(
    current_price: float,
    liquidation_price: float,
    side: str,
    threshold_pct: float = 0.05,  # 5% proximity warning
) -> bool:
    """Check if current price is dangerously close to liquidation.

    Args:
        current_price: Current mark price
        liquidation_price: Estimated liquidation price
        side: 'LONG' or 'SHORT'
        threshold_pct: Percentage threshold for warning

    Returns:
        True if within danger zone
    """
    if liquidation_price <= 0 or current_price <= 0:
        return False

    if side.upper() == "LONG":
        # For longs, liquidation is below entry — danger when price drops near liq
        distance = (current_price - liquidation_price) / current_price
    else:
        # For shorts, liquidation is above entry — danger when price rises near liq
        distance = (liquidation_price - current_price) / current_price

    return distance <= threshold_pct
