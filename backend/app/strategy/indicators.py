import pandas as pd
import numpy as np
from typing import Dict, Any


def calculate_rsi(closes: pd.Series, period: int = 14) -> pd.Series:
    delta = closes.diff()
    gain = (delta.where(delta > 0, 0)).fillna(0)
    loss = (-delta.where(delta < 0, 0)).fillna(0)

    avg_gain = gain.rolling(window=period, min_periods=period).mean()
    avg_loss = loss.rolling(window=period, min_periods=period).mean()

    # Calculate smoothed averages (RMA) similar to TradingView
    for i in range(period, len(closes)):
        avg_gain.iloc[i] = (avg_gain.iloc[i - 1] * (period - 1) + gain.iloc[i]) / period
        avg_loss.iloc[i] = (avg_loss.iloc[i - 1] * (period - 1) + loss.iloc[i]) / period

    rs = avg_gain / avg_loss
    rsi = 100 - (100 / (1 + rs))

    # Handle division by zero
    rsi = rsi.fillna(100)
    return rsi


def calculate_bollinger_bands(closes: pd.Series, period: int = 20, std_dev: float = 2.0) -> pd.DataFrame:
    sma = closes.rolling(window=period).mean()
    std = closes.rolling(window=period).std(ddof=0)

    upper = sma + (std_dev * std)
    lower = sma - (std_dev * std)

    return pd.DataFrame({'middle': sma, 'upper': upper, 'lower': lower})


def calculate_ema(closes: pd.Series, period: int = 50) -> pd.Series:
    return closes.ewm(span=period, adjust=False).mean()


def calculate_atr(highs: pd.Series, lows: pd.Series, closes: pd.Series, period: int = 14) -> pd.Series:
    tr1 = highs - lows
    tr2 = (highs - closes.shift()).abs()
    tr3 = (lows - closes.shift()).abs()

    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)

    # RMA of True Range
    atr = tr.rolling(window=period, min_periods=period).mean()
    for i in range(period, len(closes)):
        atr.iloc[i] = (atr.iloc[i - 1] * (period - 1) + tr.iloc[i]) / period

    return atr


def calculate_macd(closes: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9) -> Dict[str, pd.Series]:
    """Calculate MACD line, signal line, and histogram."""
    ema_fast = closes.ewm(span=fast, adjust=False).mean()
    ema_slow = closes.ewm(span=slow, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=signal, adjust=False).mean()
    histogram = macd_line - signal_line
    return {"macd": macd_line, "signal": signal_line, "histogram": histogram}


def calculate_bb_percent_b(close: float, bb_upper: float, bb_lower: float) -> float:
    """Calculate Bollinger Band %B — 0 at lower band, 1 at upper band."""
    band_width = bb_upper - bb_lower
    if band_width <= 0:
        return 0.5
    return (close - bb_lower) / band_width


def evaluate_signals(
    df_1m: pd.DataFrame,
    df_5m: pd.DataFrame,
    df_1h: pd.DataFrame,
    rsi_period: int = 14,
    rsi_long_threshold: float = 40,
    rsi_short_threshold: float = 60,
    bb_period: int = 20,
    bb_std: float = 2.0,
    ema_period: int = 50,
    ema_slope_lookback: int = 12,
    ema_slope_threshold: float = 0.001,
    atr_period: int = 14,
    signal_threshold: int = 55,
) -> Dict[str, Any]:
    """
    Evaluates trading signals using a weighted scoring system.

    Instead of requiring ALL conditions to match (very rare), each condition
    contributes points to a score (0–100). If the total score exceeds the
    signal_threshold, a trade signal is generated.

    Scoring weights:
      - RSI oversold/overbought:          30 pts (graduated)
      - Bollinger Band %B extreme:        25 pts (graduated)
      - MACD crossover / momentum:        20 pts
      - EMA trend alignment:              15 pts
      - Price action (candle pattern):     10 pts

    Returns a dict with LONG/SHORT signals, scores, and ATR.
    """
    if df_1m.empty or df_5m.empty or df_1h.empty:
        return {"long": False, "short": False, "atr": 0.0, "long_score": 0, "short_score": 0}

    # ── Calculate indicators on 1m data ──
    rsi = calculate_rsi(df_1m['close'], rsi_period)
    bb = calculate_bollinger_bands(df_1m['close'], bb_period, bb_std)
    macd_data = calculate_macd(df_1m['close'], fast=12, slow=26, signal=9)

    # ── Calculate indicators on 5m data ──
    ema_5m = calculate_ema(df_5m['close'], ema_period)
    rsi_5m = calculate_rsi(df_5m['close'], rsi_period)

    # ── Calculate ATR on 1h data ──
    atr = calculate_atr(df_1h['high'], df_1h['low'], df_1h['close'], atr_period)

    # ── Get latest values ──
    current_close = df_1m['close'].iloc[-1]
    prev_close = df_1m['close'].iloc[-2] if len(df_1m) > 1 else current_close
    current_rsi = rsi.iloc[-1]
    current_bb_lower = bb['lower'].iloc[-1]
    current_bb_upper = bb['upper'].iloc[-1]
    current_bb_middle = bb['middle'].iloc[-1]
    current_atr = atr.iloc[-1]

    # MACD values
    macd_line = macd_data["macd"].iloc[-1]
    macd_signal = macd_data["signal"].iloc[-1]
    macd_hist = macd_data["histogram"].iloc[-1]
    prev_macd_hist = macd_data["histogram"].iloc[-2] if len(macd_data["histogram"]) > 1 else 0

    # Bollinger %B
    bb_pct_b = calculate_bb_percent_b(current_close, current_bb_upper, current_bb_lower)

    # 5m EMA values
    ema_5m_now = ema_5m.iloc[-1] if len(ema_5m) > 0 else current_close
    rsi_5m_now = rsi_5m.iloc[-1] if len(rsi_5m) > 0 else 50

    # ── LONG SCORING ──
    long_score = 0

    # 1. RSI Score (0–30 pts) — graduated based on how oversold
    if current_rsi < rsi_long_threshold:
        # More oversold = more points. RSI 40 → 10pts, RSI 30 → 20pts, RSI 20 → 30pts
        rsi_intensity = (rsi_long_threshold - current_rsi) / rsi_long_threshold
        long_score += min(30, int(rsi_intensity * 60))
    # Bonus: 5m RSI also oversold (confluence)
    if rsi_5m_now < rsi_long_threshold + 5:
        long_score += 5

    # 2. Bollinger Band %B Score (0–25 pts) — price near/below lower band
    if bb_pct_b < 0.2:
        # Below 20% of band = strong mean reversion signal
        bb_intensity = (0.2 - bb_pct_b) / 0.2
        long_score += min(25, int(bb_intensity * 50))
    elif bb_pct_b < 0.35:
        long_score += 10  # Approaching lower band

    # 3. MACD Score (0–20 pts) — momentum turning bullish
    if macd_hist > 0 and prev_macd_hist <= 0:
        long_score += 20  # Fresh bullish crossover
    elif macd_hist > prev_macd_hist and macd_hist < 0:
        long_score += 12  # Histogram rising (momentum shifting bullish)
    elif macd_line > macd_signal:
        long_score += 8   # Already in bullish MACD territory

    # 4. EMA Trend Score (0–15 pts) — price near or below EMA = buy dip
    if current_close < ema_5m_now:
        # Price below 5m EMA — potential dip buy
        dip_pct = (ema_5m_now - current_close) / ema_5m_now
        if dip_pct > 0.002:  # At least 0.2% below EMA
            long_score += min(15, int(dip_pct * 3000))
        else:
            long_score += 5
    elif current_close > ema_5m_now and current_close < ema_5m_now * 1.001:
        long_score += 8  # Price just crossed above EMA — trend confirmation

    # 5. Price Action Score (0–10 pts) — bullish candle patterns
    if current_close > prev_close:
        long_score += 5  # Green candle
        if df_1m['low'].iloc[-1] < current_bb_lower and current_close > current_bb_lower:
            long_score += 5  # Wick below BB lower but closed above = hammer-like

    # ── SHORT SCORING ──
    short_score = 0

    # 1. RSI Score (0–30 pts) — graduated based on how overbought
    if current_rsi > rsi_short_threshold:
        rsi_intensity = (current_rsi - rsi_short_threshold) / (100 - rsi_short_threshold)
        short_score += min(30, int(rsi_intensity * 60))
    if rsi_5m_now > rsi_short_threshold - 5:
        short_score += 5

    # 2. Bollinger Band %B Score (0–25 pts)
    if bb_pct_b > 0.8:
        bb_intensity = (bb_pct_b - 0.8) / 0.2
        short_score += min(25, int(bb_intensity * 50))
    elif bb_pct_b > 0.65:
        short_score += 10

    # 3. MACD Score (0–20 pts)
    if macd_hist < 0 and prev_macd_hist >= 0:
        short_score += 20  # Fresh bearish crossover
    elif macd_hist < prev_macd_hist and macd_hist > 0:
        short_score += 12  # Histogram falling
    elif macd_line < macd_signal:
        short_score += 8

    # 4. EMA Trend Score (0–15 pts)
    if current_close > ema_5m_now:
        pump_pct = (current_close - ema_5m_now) / ema_5m_now
        if pump_pct > 0.002:
            short_score += min(15, int(pump_pct * 3000))
        else:
            short_score += 5
    elif current_close < ema_5m_now and current_close > ema_5m_now * 0.999:
        short_score += 8

    # 5. Price Action Score (0–10 pts)
    if current_close < prev_close:
        short_score += 5
        if df_1m['high'].iloc[-1] > current_bb_upper and current_close < current_bb_upper:
            short_score += 5  # Wick above BB upper but closed below = shooting star

    # ── DETERMINE SIGNALS ──
    long_signal = long_score >= signal_threshold
    short_signal = short_score >= signal_threshold

    # If both trigger, pick the stronger one
    if long_signal and short_signal:
        if long_score >= short_score:
            short_signal = False
        else:
            long_signal = False

    return {
        "long": bool(long_signal),
        "short": bool(short_signal),
        "atr": float(current_atr) if not pd.isna(current_atr) else 0.0,
        "long_score": long_score,
        "short_score": short_score,
    }
