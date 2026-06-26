"""
Multi-Timeframe Trend Filter
=============================
Detects the macro trend direction using EMA crossovers on higher timeframes
(1D, 4H, 1H). Used as a gate AFTER signal scoring to prevent the strategy
from opening positions against the dominant trend — reducing liquidation risk.

Usage:
    trend = detect_trend(df_1d, ema_fast=9, ema_slow=21)
    # → "BULLISH" | "BEARISH" | "NEUTRAL"

    result = evaluate_trend_filter(
        {"1d": "BULLISH", "4h": "BULLISH"},
        mode="majority"
    )
    # → {"direction": "BULLISH", "allow_long": True, "allow_short": False, ...}
"""

from typing import Any

import pandas as pd


def detect_trend(
    df: pd.DataFrame,
    ema_fast: int = 9,
    ema_slow: int = 21,
    neutral_band_pct: float = 0.001,  # 0.1% — EMAs within this = NEUTRAL
) -> str:
    """
    Detect trend direction on a single timeframe using EMA crossover.

    Args:
        df: OHLCV DataFrame with at least a 'close' column
        ema_fast: Fast EMA period (default 9)
        ema_slow: Slow EMA period (default 21)
        neutral_band_pct: If EMAs are within this % of each other, return NEUTRAL

    Returns:
        "BULLISH", "BEARISH", or "NEUTRAL"
    """
    if df.empty or len(df) < max(ema_fast, ema_slow) + 5:
        return "NEUTRAL"

    closes = df["close"].astype(float)

    fast_ema = closes.ewm(span=ema_fast, adjust=False).mean()
    slow_ema = closes.ewm(span=ema_slow, adjust=False).mean()

    current_fast = fast_ema.iloc[-1]
    current_slow = slow_ema.iloc[-1]

    # Check if EMAs are within the neutral band
    if current_slow > 0:
        ema_gap_pct = abs(current_fast - current_slow) / current_slow
        if ema_gap_pct <= neutral_band_pct:
            return "NEUTRAL"

    # Check slope of fast EMA (last 3 candles) for confirmation
    if len(fast_ema) >= 3:
        slope = fast_ema.iloc[-1] - fast_ema.iloc[-3]
    else:
        slope = 0.0

    if current_fast > current_slow:
        # Fast above slow — potential bullish
        if slope >= 0:
            return "BULLISH"
        else:
            # Fast above slow but falling — trend weakening, treat as neutral
            return "NEUTRAL"
    elif current_fast < current_slow:
        # Fast below slow — potential bearish
        if slope <= 0:
            return "BEARISH"
        else:
            # Fast below slow but rising — trend weakening, treat as neutral
            return "NEUTRAL"

    return "NEUTRAL"


def evaluate_trend_filter(
    trends: dict[str, str],
    mode: str = "majority",
) -> dict[str, Any]:
    """
    Combine multi-timeframe trend signals into a directional filter.

    Args:
        trends: Dict mapping timeframe labels to trend directions.
                e.g. {"1d": "BULLISH", "4h": "BEARISH", "1h": "NEUTRAL"}
        mode: How to combine signals:
              - "majority": majority of non-NEUTRAL TFs must agree
              - "all": ALL non-NEUTRAL TFs must agree
              - "any": ANY one non-NEUTRAL TF is enough

    Returns:
        {
            "direction": "BULLISH" | "BEARISH" | "NEUTRAL",
            "allow_long": bool,
            "allow_short": bool,
            "details": {"1d": "BULLISH", "4h": "BEARISH", ...}
        }
    """
    if not trends:
        return {
            "direction": "NEUTRAL",
            "allow_long": True,
            "allow_short": True,
            "details": {},
        }

    bullish_count = sum(1 for t in trends.values() if t == "BULLISH")
    bearish_count = sum(1 for t in trends.values() if t == "BEARISH")
    total_directional = bullish_count + bearish_count

    direction = "NEUTRAL"

    if mode == "all":
        # ALL non-neutral timeframes must agree
        if total_directional > 0:
            if bearish_count == 0 and bullish_count > 0:
                direction = "BULLISH"
            elif bullish_count == 0 and bearish_count > 0:
                direction = "BEARISH"
            # else: mixed signals → NEUTRAL

    elif mode == "any":
        # ANY single directional timeframe sets the direction
        # If conflicting, use the higher-count direction
        if bullish_count > bearish_count:
            direction = "BULLISH"
        elif bearish_count > bullish_count:
            direction = "BEARISH"
        elif bullish_count > 0:
            # Equal counts — conflict → NEUTRAL
            direction = "NEUTRAL"

    else:  # "majority" (default)
        # Majority of non-neutral TFs must agree
        if total_directional > 0:
            if bullish_count > total_directional / 2:
                direction = "BULLISH"
            elif bearish_count > total_directional / 2:
                direction = "BEARISH"
            # else: no clear majority → NEUTRAL

    # Determine allowed directions
    if direction == "BULLISH":
        allow_long = True
        allow_short = False
    elif direction == "BEARISH":
        allow_long = False
        allow_short = True
    else:
        allow_long = True
        allow_short = True

    return {
        "direction": direction,
        "allow_long": allow_long,
        "allow_short": allow_short,
        "details": trends,
    }
