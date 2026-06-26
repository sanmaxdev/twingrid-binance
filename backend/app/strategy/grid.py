import math
from typing import List, Dict, Any


def clamp(val: float, min_val: float, max_val: float) -> float:
    return max(min_val, min(val, max_val))


def calculate_grid_levels(
    current_wallet: float,
    bo_price: float,
    side: str,
    atr_val: float,
    bo_pct_of_capital: float,
    tp_pct_of_capital: float,
    max_safety_orders: int,
    volume_scale: float,
    step_scale: float,
    atr_multiplier: float,
    step_min_pct: float,
    step_max_pct: float,
    leverage: int,
    base_order_usd: float = 0.0,
    sizing_mode: str = "fixed_usd",
    compounding_enabled: bool = False,
    compounding_pct: float = 0.1,
    initial_capital: float = 0.0,
    tp_mode: str = "pct",
    tp_fixed_amount: float = 0.0,
) -> Dict[str, Any]:
    """
    Calculates the BO and SO levels, including required margin and target fill prices.

    Sizing modes:
      - "fixed_usd": Use base_order_usd as the exact margin for the base order (e.g. $1)
      - "pct_capital": Use bo_pct_of_capital as % of current_wallet for base order margin

    Compounding mode:
      When enabled, base_order_usd is auto-scaled based on account growth:
        adjusted = base_order_usd * (1 + compounding_pct * (current_wallet / initial_capital - 1))
      This means: if account grows 10% and compounding_pct=0.1, base order grows ~1%.

    Returns a dictionary with BO details and a list of SO levels.
    """
    atr_pct = atr_val / bo_price if bo_price > 0 else 0
    step_1 = clamp(atr_pct * atr_multiplier, step_min_pct, step_max_pct)

    # ── Determine base order margin ──
    if sizing_mode == "fixed_usd" and base_order_usd > 0:
        bo_margin = base_order_usd

        # Apply compounding if enabled
        if compounding_enabled and initial_capital > 0 and current_wallet > initial_capital:
            growth_factor = current_wallet / initial_capital
            # Scale margin proportionally: as account doubles, margin also doubles
            compound_multiplier = 1.0 + compounding_pct * (growth_factor - 1.0)
            bo_margin = base_order_usd * compound_multiplier
    else:
        # Percentage mode
        bo_margin = current_wallet * bo_pct_of_capital

        # Compounding in pct mode: increase the effective percentage as account grows
        if compounding_enabled and initial_capital > 0 and current_wallet > initial_capital:
            growth_factor = current_wallet / initial_capital
            compound_multiplier = 1.0 + compounding_pct * (growth_factor - 1.0)
            bo_margin = bo_margin * compound_multiplier

    # Ensure margin doesn't exceed available wallet
    bo_margin = min(bo_margin, current_wallet * 0.5)  # Never risk more than 50% wallet

    bo_notional = bo_margin * leverage
    bo_qty = bo_notional / bo_price if bo_price > 0 else 0

    # ── Determine TP target ──
    if tp_mode == "fixed" and tp_fixed_amount > 0:
        tp_target_usd = tp_fixed_amount
    else:
        tp_target_usd = current_wallet * tp_pct_of_capital

    levels = []
    cum_dev = 0.0

    for n in range(1, max_safety_orders + 1):
        step_n = step_1 * (step_scale ** (n - 1))
        cum_dev += step_n

        if side.upper() == "LONG":
            fill_price = bo_price * (1 - cum_dev)
        else:
            fill_price = bo_price * (1 + cum_dev)

        so_margin = bo_margin * (volume_scale ** n)
        so_notional = so_margin * leverage
        so_qty = so_notional / fill_price if fill_price > 0 else 0

        levels.append({
            "so_index": n,
            "step_pct": step_n,
            "cum_dev": cum_dev,
            "fill_price": round(fill_price, 8),
            "margin": round(so_margin, 8),
            "notional": round(so_notional, 8),
            "qty": round(so_qty, 8)
        })

    return {
        "bo": {
            "price": round(bo_price, 8),
            "margin": round(bo_margin, 8),
            "notional": round(bo_notional, 8),
            "qty": round(bo_qty, 8)
        },
        "so_levels": levels,
        "tp_target_usd": round(tp_target_usd, 8)
    }


def calculate_tp_price(side: str, avg_entry: float, position_qty: float, tp_target_usd: float) -> float:
    """
    Calculates the Take Profit price based on target USD and current position.
    """
    if position_qty <= 0:
        return 0.0

    if side.upper() == "LONG":
        return avg_entry + (tp_target_usd / position_qty)
    else:
        return avg_entry - (tp_target_usd / position_qty)
