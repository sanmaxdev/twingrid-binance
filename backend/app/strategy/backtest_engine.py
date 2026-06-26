"""
TWIN GRID Backtest Engine
=========================
Bar-by-bar simulator that reuses the exact same signal evaluation
and grid calculation logic as the live bot — zero look-ahead bias.

Usage:
    engine = BacktestEngine(config)
    result = await engine.run()
"""

from datetime import UTC, datetime
from typing import Any

import httpx
import numpy as np
import pandas as pd
import structlog

from app.core.config import settings
from app.services.risk_manager import (
    compute_margin_ratio,
    evaluate_basket_risk,
)
from app.strategy.grid import calculate_grid_levels, calculate_tp_price
from app.strategy.indicators import evaluate_signals
from app.strategy.trend_filter import detect_trend, evaluate_trend_filter

logger = structlog.get_logger(__name__)

# Binance klines endpoints — try multiple in order (handles US geo-block)
BINANCE_KLINE_URLS = [
    settings.BINANCE_LIVE_BASE_URL,  # https://fapi.binance.com
    settings.BINANCE_DEMO_BASE_URL,  # https://demo-fapi.binance.com
    settings.BINANCE_TESTNET_BASE_URL,  # https://testnet.binancefuture.com
]


async def fetch_historical_klines(
    symbol: str,
    interval: str,
    start_time: int,
    end_time: int,
    limit: int = 1500,
) -> pd.DataFrame:
    """Fetch historical klines from Binance, with URL fallback for geo-restricted regions."""
    # Find a working base URL first
    working_url = None
    async with httpx.AsyncClient(timeout=60.0) as client:
        for base_url in BINANCE_KLINE_URLS:
            try:
                test_params = {"symbol": symbol, "interval": "1m", "limit": 1}
                resp = await client.get(f"{base_url}/fapi/v1/klines", params=test_params)
                if resp.status_code == 200 and resp.json():
                    working_url = base_url
                    logger.info(f"Backtest using Binance endpoint: {base_url}")
                    break
            except Exception:
                continue

    if not working_url:
        raise ValueError("All Binance endpoints failed. Cannot fetch historical data.")

    all_candles = []
    current_start = start_time

    async with httpx.AsyncClient(timeout=60.0) as client:
        while current_start < end_time:
            params = {
                "symbol": symbol,
                "interval": interval,
                "startTime": current_start,
                "endTime": end_time,
                "limit": limit,
            }
            response = await client.get(f"{working_url}/fapi/v1/klines", params=params)
            if response.status_code != 200:
                raise ValueError(f"Binance klines error: {response.text}")

            data = response.json()
            if not data:
                break

            all_candles.extend(data)
            # Move start to after last candle
            current_start = data[-1][6] + 1  # close_time + 1ms

            if len(data) < limit:
                break

    if not all_candles:
        return pd.DataFrame()

    df = pd.DataFrame(
        all_candles,
        columns=[
            "open_time",
            "open",
            "high",
            "low",
            "close",
            "volume",
            "close_time",
            "quote_volume",
            "trades",
            "taker_buy_base",
            "taker_buy_quote",
            "ignore",
        ],
    )
    for col in ["open", "high", "low", "close", "volume"]:
        df[col] = df[col].astype(float)

    df["timestamp"] = pd.to_datetime(df["open_time"], unit="ms", utc=True)
    df = df.drop_duplicates(subset=["open_time"]).reset_index(drop=True)
    return df


def resample_to_timeframe(df_1m: pd.DataFrame, target: str) -> pd.DataFrame:
    """Resample 1-minute OHLCV data to a higher timeframe."""
    if df_1m.empty:
        return df_1m

    df = df_1m.set_index("timestamp").copy()
    resampled = (
        df.resample(target)
        .agg(
            {
                "open": "first",
                "high": "max",
                "low": "min",
                "close": "last",
                "volume": "sum",
            }
        )
        .dropna()
    )
    resampled = resampled.reset_index()
    return resampled


class SimulatedBasket:
    """Represents an active basket during simulation."""

    def __init__(
        self,
        side: str,
        entry_price: float,
        bo_qty: float,
        bo_margin: float,
        so_levels: list[dict],
        tp_target_usd: float,
        tp_price: float,
        leverage: int,
        entry_time: str,
        taker_fee: float = 0.0004,
        maker_fee: float = 0.0002,
        symbol: str = "BTCUSDT",
        risk_config: dict = None,
    ):
        self.side = side
        self.entry_price = entry_price
        self.avg_entry = entry_price
        self.total_qty = bo_qty
        self.total_margin = bo_margin
        self.so_levels = so_levels  # unfilled SOs
        self.filled_so_indices: list[int] = []
        self.tp_target_usd = tp_target_usd
        self.tp_price = tp_price
        self.leverage = leverage
        self.entry_time = entry_time
        self.taker_fee = taker_fee
        self.maker_fee = maker_fee
        # ── Separated fee tracking ──
        self.trading_fees = bo_qty * entry_price * taker_fee  # BO is market (taker)
        self.funding_paid = 0.0  # funding cost (always positive = expense)
        self.funding_received = 0.0  # funding income (always positive = income)
        self.is_closed = False
        self.exit_price = 0.0
        self.exit_time = ""
        self.exit_reason = ""
        self.pnl = 0.0
        # Realistic execution delay — after SO fill, skip TP check for N bars
        self._bars_since_last_so_fill = 999  # large = no recent SO fill
        self._bars_open = 0
        self._next_funding_time_ms: int | None = None  # next funding event timestamp
        # Symbol for maintenance margin lookups
        self.symbol = symbol
        # Risk controller config
        self.risk_config = risk_config or {}
        # Track peak absolute loss for "recovers_to" direction mode
        self._peak_loss_usd: float = 0.0

    def check_fills(
        self,
        candle_high: float,
        candle_low: float,
        timestamp: str,
        wallet_balance: float = 0.0,
        candle_open_time_ms: int = 0,
        funding_df: Any = None,
    ) -> float:
        """Check if any SOs or TP were triggered by this candle.

        Returns: margin consumed by SO fills this bar (for wallet deduction).
        """
        if self.is_closed:
            return 0.0

        self._bars_open += 1
        self._bars_since_last_so_fill += 1
        so_margin_consumed = 0.0

        # ── Apply real funding fee if timestamp matches a funding event ──
        if funding_df is not None and not funding_df.empty:
            self._apply_funding(candle_high, candle_low, candle_open_time_ms, funding_df)

        # ── Check TP fill — require wick penetration (realistic) ──
        if self._bars_since_last_so_fill >= 2:
            tp_filled = False
            if self.side == "LONG" and candle_high >= self.tp_price:
                # Require wick to exceed TP by at least 0.02% for fill confidence
                penetration = (
                    (candle_high - self.tp_price) / self.tp_price if self.tp_price > 0 else 0
                )
                if penetration >= 0.0002:
                    tp_filled = True
            elif self.side == "SHORT" and candle_low <= self.tp_price:
                penetration = (
                    (self.tp_price - candle_low) / self.tp_price if self.tp_price > 0 else 0
                )
                if penetration >= 0.0002:
                    tp_filled = True

            if tp_filled:
                self._close("TP", self.tp_price, timestamp)
                return 0.0

        # ── Check SO fills ──
        newly_filled = []
        for so in self.so_levels:
            if so["so_index"] in self.filled_so_indices:
                continue

            fill_price = so["fill_price"]
            if self.side == "LONG" and candle_low <= fill_price:
                newly_filled.append(so)
            elif self.side == "SHORT" and candle_high >= fill_price:
                newly_filled.append(so)

        for so in newly_filled:
            self.filled_so_indices.append(so["so_index"])
            so_qty = so["qty"]

            # Recalculate weighted average entry
            old_cost = self.avg_entry * self.total_qty
            new_cost = so["fill_price"] * so_qty
            self.total_qty += so_qty
            self.avg_entry = (old_cost + new_cost) / self.total_qty if self.total_qty > 0 else 0
            self.total_margin += so["margin"]
            so_margin_consumed += so["margin"]

            # SO is executed as a market order (Virtual SO) — taker fee
            self.trading_fees += so_qty * so["fill_price"] * self.taker_fee

            # Recalculate TP
            self.tp_price = calculate_tp_price(
                self.side, self.avg_entry, self.total_qty, self.tp_target_usd
            )

        # Reset execution delay counter when SOs fill
        if newly_filled:
            self._bars_since_last_so_fill = 0

        # ── Risk Controller Check (after SO processing) ──
        if not self.is_closed and self.risk_config.get("risk_controller_enabled", False):
            current_price = (candle_high + candle_low) / 2
            unrealized = self.get_unrealized_pnl(current_price)
            notional = self.total_qty * current_price

            # Track peak loss for "recovers_to" direction mode
            current_loss = abs(min(unrealized, 0.0))
            if current_loss > self._peak_loss_usd:
                self._peak_loss_usd = current_loss

            risk_check = evaluate_basket_risk(
                sos_filled=len(self.filled_so_indices),
                unrealized_pnl=unrealized,
                wallet_balance=wallet_balance,
                notional=notional,
                symbol=self.symbol,
                config=self.risk_config,
                peak_loss_usd=self._peak_loss_usd,
            )
            if not risk_check.passed:
                # Apply adverse slippage on force close (0.05%)
                slip = current_price * 0.0005
                close_price = current_price - slip if self.side == "LONG" else current_price + slip
                self._close("RISK_STOP", close_price, timestamp)

        return so_margin_consumed

    def _apply_funding(self, candle_high, candle_low, candle_open_ms, funding_df):
        """Apply real historical funding rates when a funding event occurs within this candle."""
        # Funding events happen every 8h (00:00, 08:00, 16:00 UTC)
        # Check if any funding events fall within this candle's time window
        # For 1m candles, window is 60s; for 5m, 300s
        candle_end_ms = candle_open_ms + 300_000  # conservative: 5min window

        mask = (funding_df["funding_time"] >= candle_open_ms) & (
            funding_df["funding_time"] < candle_end_ms
        )
        matching = funding_df[mask]

        if matching.empty:
            return

        for _, row in matching.iterrows():
            rate = float(row["funding_rate"])
            mark_price = float(row.get("mark_price", 0))
            if mark_price <= 0:
                mark_price = (candle_high + candle_low) / 2

            # Funding cost = position_size * mark_price * funding_rate
            # For LONG: pay if rate > 0, receive if rate < 0
            # For SHORT: receive if rate > 0, pay if rate < 0
            if self.side == "LONG":
                funding_cost = self.total_qty * mark_price * rate
            else:
                funding_cost = -self.total_qty * mark_price * rate

            # Track paid vs received separately (both stored as positive values)
            if funding_cost > 0:
                self.funding_paid += funding_cost
            else:
                self.funding_received += abs(funding_cost)

    def get_unrealized_pnl(self, current_price: float) -> float:
        """Get current unrealized PnL at given price."""
        if self.side == "LONG":
            return (current_price - self.avg_entry) * self.total_qty
        else:
            return (self.avg_entry - current_price) * self.total_qty

    def force_close(self, price: float, timestamp: str, reason: str = "TIMEOUT"):
        """Force-close the basket at current price with adverse slippage."""
        # Apply adverse slippage on force-close (market order)
        slip = price * 0.0005  # 0.05% slippage
        if reason != "END_OF_DATA":
            close_price = price - slip if self.side == "LONG" else price + slip
        else:
            close_price = price  # No slippage for theoretical end-of-data close
        self._close(reason, close_price, timestamp)

    def _close(self, reason: str, exit_price: float, timestamp: str):
        """Close the basket and calculate PnL."""
        self.is_closed = True
        self.exit_price = exit_price
        self.exit_time = timestamp
        self.exit_reason = reason

        # TP is a limit order (maker), forced close is market (taker)
        if reason == "TP":
            self.trading_fees += self.total_qty * exit_price * self.maker_fee
        else:
            self.trading_fees += self.total_qty * exit_price * self.taker_fee

        # PnL = raw_pnl - trading_fees - net_funding
        net_funding = self.funding_paid - self.funding_received
        total_cost = self.trading_fees + net_funding

        if self.side == "LONG":
            self.pnl = (exit_price - self.avg_entry) * self.total_qty - total_cost
        else:
            self.pnl = (self.avg_entry - exit_price) * self.total_qty - total_cost

    def to_dict(self, trade_id: int) -> dict:
        # Calculate duration
        duration_str = ""
        try:
            from dateutil import parser as dateparser

            t1 = dateparser.isoparse(self.entry_time)
            t2 = dateparser.isoparse(self.exit_time)
            delta = t2 - t1
            hours, remainder = divmod(int(delta.total_seconds()), 3600)
            minutes = remainder // 60
            if hours > 0:
                duration_str = f"{hours}h {minutes}m"
            else:
                duration_str = f"{minutes}m"
        except Exception:
            duration_str = "—"

        notional = round(self.total_qty * self.avg_entry, 4)
        pnl_pct = round((self.pnl / self.total_margin * 100) if self.total_margin > 0 else 0, 2)

        net_funding = round(self.funding_paid - self.funding_received, 4)

        return {
            "id": trade_id,
            "entry_time": self.entry_time,
            "exit_time": self.exit_time,
            "duration": duration_str,
            "side": self.side,
            "entry_price": round(self.entry_price, 2),
            "exit_price": round(self.exit_price, 2),
            "avg_entry": round(self.avg_entry, 2),
            "tp_price": round(self.tp_price, 2),
            "qty": round(self.total_qty, 8),
            "notional": notional,
            "margin": round(self.total_margin, 4),
            "leverage_used": self.leverage,
            "pnl": round(self.pnl, 4),
            "pnl_pct": pnl_pct,
            "trading_fees": round(self.trading_fees, 4),
            "funding_paid": round(self.funding_paid, 4),
            "funding_received": round(self.funding_received, 4),
            "funding_net": net_funding,
            "fees": round(self.trading_fees + net_funding, 4),  # legacy total
            "sos_filled": len(self.filled_so_indices),
            "max_sos": len(self.so_levels),
            "exit_reason": self.exit_reason,
        }


class BacktestEngine:
    """
    Simulates the Twin Grid strategy bar-by-bar on historical data.
    Uses the exact same evaluate_signals() and calculate_grid_levels()
    functions as the live bot — no special backtest logic.
    """

    def __init__(self, config: dict[str, Any]):
        self.symbol = config.get("symbol", "BTCUSDT")
        self.period_days = config.get("period_days", 7)
        self.initial_capital = config.get("initial_capital", 1000.0)
        self.taker_fee = config.get("taker_fee", 0.0004)
        self.maker_fee = config.get("maker_fee", 0.0002)

        # Custom date range (overrides period_days)
        self.start_date = config.get("start_date")  # ISO string
        self.end_date = config.get("end_date")  # ISO string

        # Strategy config (same keys as account settings)
        self.strategy = {
            "leverage": config.get("leverage", 10),
            "sizing_mode": config.get("sizing_mode", "fixed_usd"),
            "base_order_usd": config.get("base_order_usd", 1.0),
            "base_order_pct": config.get("base_order_pct", 1.0),
            "compounding_enabled": config.get("compounding_enabled", False),
            "compounding_pct": config.get("compounding_pct", 100),
            "max_safety_orders": config.get("max_safety_orders", 7),
            "take_profit_pct": config.get("take_profit_pct", 1.0),
            "tp_mode": config.get("tp_mode", "pct"),
            "tp_fixed_amount": config.get("tp_fixed_amount", 0.0),
            "volume_scale": config.get("volume_scale", 1.5),
            "step_scale": config.get("step_scale", 1.35),
            "rsi_long_threshold": config.get("rsi_long_threshold", 40),
            "rsi_short_threshold": config.get("rsi_short_threshold", 60),
            "signal_threshold": config.get("signal_threshold", 55),
            "allow_long": config.get("allow_long", True),
            "allow_short": config.get("allow_short", True),
            "atr_multiplier": config.get("atr_multiplier", 0.6),
            "step_min_pct": config.get("step_min_pct", 0.004),
            "step_max_pct": config.get("step_max_pct", 0.025),
            "max_basket_age_hours": config.get("max_basket_age_hours", 72),  # 0 = disabled
            # Trend filter
            "trend_filter_enabled": config.get("trend_filter_enabled", False),
            "trend_timeframes": config.get("trend_timeframes", ["1d", "4h"]),
            "trend_mode": config.get("trend_mode", "majority"),
            "trend_ema_fast": config.get("trend_ema_fast", 9),
            "trend_ema_slow": config.get("trend_ema_slow", 21),
            # Risk controller
            "risk_controller_enabled": config.get("risk_controller_enabled", False),
            "rc_max_so_trigger": config.get("rc_max_so_trigger", 5),
            "rc_margin_usage_pct": config.get("rc_margin_usage_pct", 80.0),
            "rc_margin_guard_enabled": config.get("rc_margin_guard_enabled", True),
            "rc_max_basket_loss_pct": config.get("rc_max_basket_loss_pct", 10.0),
            "rc_max_basket_loss_usd": config.get("rc_max_basket_loss_usd", 0.0),
            "rc_loss_mode": config.get("rc_loss_mode", "pct_wallet"),
            "rc_loss_direction": config.get("rc_loss_direction", "exceeds"),
        }

        # Minimum quantity / notional for each symbol (matches Binance exchange info)
        self.min_notional = {"BTCUSDT": 5.0, "ETHUSDT": 5.0, "SOLUSDT": 5.0, "XRPUSDT": 5.0}
        self.min_qty = {"BTCUSDT": 0.001, "ETHUSDT": 0.001, "SOLUSDT": 1.0, "XRPUSDT": 0.1}
        self.qty_precision_step = {
            "BTCUSDT": 0.001,
            "ETHUSDT": 0.001,
            "SOLUSDT": 1.0,
            "XRPUSDT": 0.1,
        }
        self.tick_precision = {
            "BTCUSDT": 0.10,
            "ETHUSDT": 0.01,
            "SOLUSDT": 0.0010,
            "XRPUSDT": 0.0001,
        }

    @staticmethod
    def _round_step(value: float, step: float) -> float:
        """Round down to nearest step size (same as live bot's round_step)."""
        if step <= 0:
            return value
        from decimal import ROUND_DOWN, Decimal

        d_val = Decimal(str(value))
        d_step = Decimal(str(step))
        return float((d_val / d_step).quantize(Decimal("1"), rounding=ROUND_DOWN) * d_step)

    @staticmethod
    def _round_tick(value: float, tick: float) -> float:
        """Round price to nearest tick size (same as live bot's round_tick)."""
        if tick <= 0:
            return value
        from decimal import ROUND_DOWN, Decimal

        d_val = Decimal(str(value))
        d_tick = Decimal(str(tick))
        return float((d_val / d_tick).quantize(Decimal("1"), rounding=ROUND_DOWN) * d_tick)

    async def run(self) -> dict[str, Any]:
        """Execute the full backtest and return results."""
        logger.info(
            f"Starting backtest: {self.symbol}, {self.period_days}d, "
            f"capital=${self.initial_capital}, threshold={self.strategy['signal_threshold']}"
        )

        # 1. Fetch historical data — use custom dates if provided
        if self.start_date and self.end_date:
            try:
                from dateutil import parser as dateparser

                start_dt = dateparser.isoparse(self.start_date)
                end_dt = dateparser.isoparse(self.end_date)
                start_time = int(start_dt.timestamp() * 1000)
                end_time = int(end_dt.timestamp() * 1000)
                self.period_days = max(1, int((end_dt - start_dt).total_seconds() / 86400))
            except Exception:
                end_time = int(datetime.now(UTC).timestamp() * 1000)
                start_time = end_time - (self.period_days * 24 * 60 * 60 * 1000)
        else:
            end_time = int(datetime.now(UTC).timestamp() * 1000)
            start_time = end_time - (self.period_days * 24 * 60 * 60 * 1000)

        # Always use 1m candles as base resolution — matches the live bot
        # which fetches 1m, 5m, and 1h klines from Binance. Using 5m as base
        # caused cooldown/resolution divergence from live behavior.
        base_interval = "1m"
        logger.info(f"Using {base_interval} base candles for {self.period_days}d period")

        # 1a. Try loading from cache first (instant), fall back to API
        df_base = None
        data_source = "api"
        try:
            from app.core.database import AsyncSessionLocal
            from app.services.market_data_service import get_cached_klines

            start_dt = datetime.fromtimestamp(start_time / 1000, tz=UTC)
            end_dt = datetime.fromtimestamp(end_time / 1000, tz=UTC)

            async with AsyncSessionLocal() as _db_session:
                df_base = await get_cached_klines(
                    _db_session, self.symbol, base_interval, start_dt, end_dt
                )
            if df_base is not None and len(df_base) >= 100:
                data_source = "cache"
                logger.info(f"Cache hit: {len(df_base)} {base_interval} candles for {self.symbol}")
            else:
                if df_base is not None:
                    logger.info(
                        f"Cache had only {len(df_base)} candles (need ≥100), falling back to API"
                    )
                df_base = None
        except Exception as e:
            logger.warning(f"Cache lookup failed, falling back to API: {e}")
            df_base = None

        # 1b. Fall back to Binance API if cache unavailable
        if df_base is None:
            data_source = "api"
            df_base = await fetch_historical_klines(
                self.symbol, base_interval, start_time, end_time
            )

        if df_base.empty or len(df_base) < 100:
            raise ValueError(
                f"Insufficient data: only {len(df_base)} candles fetched for {self.symbol}"
            )

        # 2. Create multi-timeframe data — always from 1m base
        df_sim = df_base
        df_5m = resample_to_timeframe(df_base, "5min")
        df_1h = resample_to_timeframe(df_base, "1h")
        logger.info(
            f"Data loaded: {len(df_sim)} 1m (sim), {len(df_5m)} 5m, {len(df_1h)} 1h candles"
        )

        # 2a. Prepare trend filter data (if enabled)
        df_4h = pd.DataFrame()
        df_1d = pd.DataFrame()
        trend_filter_on = self.strategy.get("trend_filter_enabled", False)
        trend_tfs = self.strategy.get("trend_timeframes", ["1d", "4h"])
        if trend_filter_on:
            if "4h" in trend_tfs:
                df_4h = resample_to_timeframe(df_base, "4h")
            if "1d" in trend_tfs:
                df_1d = resample_to_timeframe(df_base, "1D")
            logger.info(f"Trend filter data: 4h={len(df_4h)}, 1d={len(df_1d)} candles")

        # 2b. Pre-flight validation — check if order size can produce valid qty
        sample_price = df_sim.iloc[-1]["close"]
        s = self.strategy
        if s["sizing_mode"] == "fixed_usd":
            test_notional = s["base_order_usd"] * s["leverage"]
        else:
            test_notional = (self.initial_capital * (s["base_order_pct"] / 100.0)) * s["leverage"]
        test_qty = test_notional / sample_price if sample_price > 0 else 0
        min_qty = self.min_qty.get(self.symbol, 0.001)
        qty_step = self.qty_precision_step.get(self.symbol, 0.001)
        rounded_test_qty = self._round_step(test_qty, qty_step)
        if rounded_test_qty < min_qty:
            min_usd = (min_qty * sample_price) / s["leverage"]
            raise ValueError(
                f"Base order too small for {self.symbol}. "
                f"At current price ${sample_price:,.0f} with {s['leverage']}x leverage, "
                f"minimum base order is ~${min_usd:.2f} USD "
                f"(need {min_qty} {self.symbol.replace('USDT', '')}, got {test_qty:.6f}). "
                f"Increase base order or leverage."
            )

        # 3. Load funding rate data from cache (or fallback to synthetic)
        funding_df = None
        try:
            from app.core.database import AsyncSessionLocal
            from app.services.market_data_service import get_cached_funding_rates

            start_dt = datetime.fromtimestamp(start_time / 1000, tz=UTC)
            end_dt = datetime.fromtimestamp(end_time / 1000, tz=UTC)

            async with AsyncSessionLocal() as _db_session:
                funding_df = await get_cached_funding_rates(
                    _db_session, self.symbol, start_dt, end_dt
                )
            if funding_df is not None:
                logger.info(f"Using {len(funding_df)} real funding rates from cache")
            else:
                logger.info("No cached funding rates — using synthetic fallback")
        except Exception as e:
            logger.warning(f"Failed to load funding rates from cache: {e}")
            funding_df = None

        # Synthetic funding fallback: create a fake funding_df with 0.01% every 8h
        if funding_df is None:
            funding_times = list(range(start_time, end_time, 8 * 3600 * 1000))
            funding_df = pd.DataFrame(
                {
                    "funding_time": funding_times,
                    "funding_rate": [0.0001] * len(funding_times),
                    "mark_price": [0.0] * len(funding_times),
                }
            )

        # 4. Run simulation
        wallet = self.initial_capital
        locked_margin = 0.0  # Margin currently locked in active basket
        equity_curve: list[dict] = []
        trades: list[dict] = []
        active_basket: SimulatedBasket | None = None
        trade_counter = 0
        peak_equity = self.initial_capital
        max_drawdown_pct = 0.0
        bars_since_last_close = 999  # Cooldown: bars since last basket closed
        cooldown_bars = 5  # ~5 min cooldown on 1m candles (matches live ~300s)
        liquidated = False
        liquidation_time = ""
        liquidation_price = 0.0
        trend_blocked_count = 0  # Track how many signals the trend filter blocked
        risk_stops_count = 0  # Track how many baskets the risk controller closed
        peak_margin_used_pct = 0.0  # Track peak margin usage
        trade_events: list[dict] = []  # Chart markers for entries/exits/SO fills

        # We need a lookback window for indicators
        lookback_sim = 100
        lookback_5m = 100
        lookback_1h = 100

        # Sample equity every N candles to keep response size manageable
        equity_sample_interval = max(1, len(df_sim) // 500)

        for i in range(lookback_sim, len(df_sim)):
            candle = df_sim.iloc[i]
            ts = (
                candle["timestamp"].isoformat()
                if hasattr(candle["timestamp"], "isoformat")
                else str(candle["timestamp"])
            )
            current_close = candle["close"]
            candle_high = candle["high"]
            candle_low = candle["low"]

            bars_since_last_close += 1

            # If we have an active basket, check fills
            if active_basket and not active_basket.is_closed:
                candle_open_ms = int(candle["open_time"]) if "open_time" in candle.index else 0
                so_margin_used = active_basket.check_fills(
                    candle_high,
                    candle_low,
                    ts,
                    wallet_balance=wallet,
                    candle_open_time_ms=candle_open_ms,
                    funding_df=funding_df,
                )

                # ── Margin lock: deduct SO margin from wallet ──
                if so_margin_used > 0:
                    wallet -= so_margin_used
                    locked_margin += so_margin_used
                    # Record SO fill event for chart
                    so_count = len(active_basket.filled_so_indices)
                    trade_events.append(
                        {
                            "time": ts,
                            "type": "SO_FILL",
                            "price": round(current_close, 2),
                            "trade_id": trade_counter + 1,
                            "so_index": so_count,
                        }
                    )
                    # Track peak margin usage
                    total_account = wallet + locked_margin
                    if total_account > 0:
                        margin_pct = (locked_margin / total_account) * 100
                        if margin_pct > peak_margin_used_pct:
                            peak_margin_used_pct = margin_pct

                # Check basket age limit (matches live risk_manager.check_basket_age)
                max_age_h = self.strategy["max_basket_age_hours"]
                if not active_basket.is_closed and max_age_h > 0 and active_basket.entry_time:
                    try:
                        from dateutil import parser as dateparser

                        entry_dt = dateparser.isoparse(active_basket.entry_time)
                        current_dt = dateparser.isoparse(ts)
                        age_hours = (current_dt - entry_dt).total_seconds() / 3600
                        if age_hours >= max_age_h:
                            active_basket.force_close(current_close, ts, "MAX_AGE")
                    except Exception:
                        pass

                # ── Liquidation check (uses wallet AFTER margin deduction) ──
                if not active_basket.is_closed:
                    unrealized = active_basket.get_unrealized_pnl(current_close)
                    notional = active_basket.total_qty * current_close
                    margin_ratio = compute_margin_ratio(wallet, unrealized, notional, self.symbol)
                    if margin_ratio >= 1.0:
                        active_basket.force_close(current_close, ts, "LIQUIDATED")
                        # Return locked margin + PnL
                        wallet += locked_margin + active_basket.pnl
                        locked_margin = 0.0
                        if wallet < 0:
                            wallet = 0.0
                        trade_counter += 1
                        trades.append(active_basket.to_dict(trade_counter))
                        trade_events.append(
                            {
                                "time": ts,
                                "type": "EXIT",
                                "side": active_basket.side,
                                "price": round(current_close, 2),
                                "trade_id": trade_counter,
                                "reason": "LIQUIDATED",
                                "pnl": round(active_basket.pnl, 4),
                            }
                        )
                        active_basket = None
                        liquidated = True
                        liquidation_time = ts
                        liquidation_price = current_close
                        logger.warning(
                            f"LIQUIDATED at {ts}, price=${current_close:,.2f}, "
                            f"margin_ratio={margin_ratio:.2f}. Wallet wiped."
                        )
                        break

                if active_basket is not None and active_basket.is_closed:
                    # Basket closed — return locked margin + PnL to wallet
                    if active_basket.exit_reason == "RISK_STOP":
                        risk_stops_count += 1
                    wallet += locked_margin + active_basket.pnl
                    locked_margin = 0.0
                    trade_counter += 1
                    trade_events.append(
                        {
                            "time": ts,
                            "type": "EXIT",
                            "side": active_basket.side,
                            "price": round(current_close, 2),
                            "trade_id": trade_counter,
                            "reason": active_basket.exit_reason,
                            "pnl": round(active_basket.pnl, 4),
                        }
                    )
                    trades.append(active_basket.to_dict(trade_counter))
                    active_basket = None
                    bars_since_last_close = 0

                    if wallet <= 0:
                        liquidated = True
                        liquidation_time = ts
                        liquidation_price = current_close
                        logger.warning(f"Account blown at {ts}. Wallet=${wallet:.2f}")
                        break

            # If no active basket, evaluate signals (with cooldown)
            if active_basket is None and bars_since_last_close >= cooldown_bars:
                # Build lookback windows — use df_sim as the "1m-equivalent" window
                window_1m = df_sim.iloc[max(0, i - lookback_sim) : i + 1].copy()

                # Find corresponding 5m/1h windows
                current_ts = candle["timestamp"]
                mask_5m = df_5m["timestamp"] <= current_ts
                window_5m = df_5m[mask_5m].tail(lookback_5m).copy()

                mask_1h = df_1h["timestamp"] <= current_ts
                window_1h = df_1h[mask_1h].tail(lookback_1h).copy()

                if len(window_5m) >= 50 and len(window_1h) >= 14:
                    signals = evaluate_signals(
                        window_1m,
                        window_5m,
                        window_1h,
                        rsi_period=14,
                        rsi_long_threshold=self.strategy["rsi_long_threshold"],
                        rsi_short_threshold=self.strategy["rsi_short_threshold"],
                        bb_period=20,
                        bb_std=2.0,
                        ema_period=50,
                        ema_slope_lookback=12,
                        ema_slope_threshold=0.001,
                        atr_period=14,
                        signal_threshold=self.strategy["signal_threshold"],
                    )

                    side = None
                    if signals["long"] and self.strategy["allow_long"]:
                        side = "LONG"
                    elif signals["short"] and self.strategy["allow_short"]:
                        side = "SHORT"

                    # Apply trend filter gate (same logic as live bot)
                    if side and trend_filter_on:
                        ema_fast = self.strategy.get("trend_ema_fast", 9)
                        ema_slow = self.strategy.get("trend_ema_slow", 21)
                        trends = {}
                        if "1d" in trend_tfs and not df_1d.empty:
                            mask_1d = df_1d["timestamp"] <= current_ts
                            w_1d = df_1d[mask_1d].tail(50)
                            if len(w_1d) >= ema_slow + 5:
                                trends["1d"] = detect_trend(w_1d, ema_fast, ema_slow)
                        if "4h" in trend_tfs and not df_4h.empty:
                            mask_4h = df_4h["timestamp"] <= current_ts
                            w_4h = df_4h[mask_4h].tail(50)
                            if len(w_4h) >= ema_slow + 5:
                                trends["4h"] = detect_trend(w_4h, ema_fast, ema_slow)
                        if "1h" in trend_tfs:
                            if len(window_1h) >= ema_slow + 5:
                                trends["1h"] = detect_trend(window_1h, ema_fast, ema_slow)

                        if trends:
                            trend_result = evaluate_trend_filter(
                                trends, self.strategy.get("trend_mode", "majority")
                            )
                            if side == "LONG" and not trend_result["allow_long"]:
                                side = None
                                trend_blocked_count += 1
                            elif side == "SHORT" and not trend_result["allow_short"]:
                                side = None
                                trend_blocked_count += 1

                    if side and signals["atr"] > 0:
                        # Apply adverse slippage on BO entry (market order)
                        import random

                        slip_base = 0.0005  # 0.05% base adverse slippage
                        slip_rand = random.uniform(0, 0.0005)  # 0-0.05% random
                        if side == "LONG":
                            slipped_price = current_close * (1 + slip_base + slip_rand)
                        else:
                            slipped_price = current_close * (1 - slip_base - slip_rand)

                        basket = self._try_open_basket(
                            side, slipped_price, signals["atr"], wallet, ts
                        )
                        if basket:
                            # ── Margin lock: deduct BO margin from wallet ──
                            wallet -= basket.total_margin
                            locked_margin = basket.total_margin
                            active_basket = basket
                            # Record entry event for chart
                            trade_events.append(
                                {
                                    "time": ts,
                                    "type": "ENTRY",
                                    "side": side,
                                    "price": round(slipped_price, 2),
                                    "trade_id": trade_counter + 1,
                                }
                            )
                            # Track peak margin
                            total_account = wallet + locked_margin
                            if total_account > 0:
                                margin_pct = (locked_margin / total_account) * 100
                                if margin_pct > peak_margin_used_pct:
                                    peak_margin_used_pct = margin_pct

            # Record equity
            if i % equity_sample_interval == 0 or i == len(df_sim) - 1:
                unrealized = 0.0
                if active_basket and not active_basket.is_closed:
                    unrealized = active_basket.get_unrealized_pnl(current_close)

                current_equity = wallet + unrealized
                equity_curve.append(
                    {
                        "timestamp": ts,
                        "equity": round(current_equity, 2),
                        "price": round(current_close, 2),
                    }
                )

                # Track drawdown
                if current_equity > peak_equity:
                    peak_equity = current_equity
                dd = (peak_equity - current_equity) / peak_equity * 100 if peak_equity > 0 else 0
                if dd > max_drawdown_pct:
                    max_drawdown_pct = dd

        # Handle remaining active basket at end of data
        # FIX: Include END_OF_DATA in stats — count as loss if PnL is negative
        open_trade = None
        if active_basket and not active_basket.is_closed:
            last_close = df_sim.iloc[-1]["close"]
            last_ts = df_sim.iloc[-1]["timestamp"]
            last_ts_str = last_ts.isoformat() if hasattr(last_ts, "isoformat") else str(last_ts)
            active_basket.force_close(last_close, last_ts_str, "END_OF_DATA")

            # Return locked margin + PnL to wallet (realize the position)
            wallet += locked_margin + active_basket.pnl
            locked_margin = 0.0
            trade_counter += 1
            eod_trade = active_basket.to_dict(trade_counter)

            # Include in stats — this is a real position that would need closing
            trades.append(eod_trade)
            open_trade = eod_trade

        # Calculate final wallet (should already reflect all closed positions)
        final_wallet = wallet

        # 5. Calculate summary metrics (all trades including END_OF_DATA)
        summary = self._calculate_summary(trades, max_drawdown_pct, final_wallet, open_trade)

        # Add liquidation info to summary
        summary["liquidated"] = liquidated
        if liquidated:
            summary["liquidation_time"] = liquidation_time
            summary["liquidation_price"] = round(liquidation_price, 2)
            summary["final_capital"] = 0.0

        # Add trend filter stats
        summary["trend_filter_enabled"] = trend_filter_on
        summary["trend_blocked_count"] = trend_blocked_count

        # Add risk controller stats
        summary["risk_controller_enabled"] = self.strategy.get("risk_controller_enabled", False)
        summary["risk_stops_count"] = risk_stops_count
        summary["peak_margin_used_pct"] = round(peak_margin_used_pct, 1)

        # 5. Build price data for chart — proper OHLC aggregation for candlestick display
        target_candles = 800  # Target ~800 candles for a clean chart
        price_sample_interval = max(1, len(df_sim) // target_candles)
        price_data = []
        for start in range(0, len(df_sim), price_sample_interval):
            end = min(start + price_sample_interval, len(df_sim))
            group = df_sim.iloc[start:end]
            first = group.iloc[0]
            last = group.iloc[-1]
            ts = (
                first["timestamp"].isoformat()
                if hasattr(first["timestamp"], "isoformat")
                else str(first["timestamp"])
            )
            price_data.append(
                {
                    "timestamp": ts,
                    "open": round(float(first["open"]), 2),
                    "high": round(float(group["high"].max()), 2),
                    "low": round(float(group["low"].min()), 2),
                    "close": round(float(last["close"]), 2),
                }
            )

        liq_msg = " [LIQUIDATED]" if liquidated else ""
        logger.info(
            f"Backtest complete{liq_msg}: {len(trades)} trades, PnL=${summary['total_pnl']:.2f} "
            f"({summary['total_pnl_pct']:.2f}%), WR={summary['win_rate']:.1f}%"
        )
        # All trades (including END_OF_DATA) are already in the trades list
        display_trades = trades.copy()

        return {
            "summary": summary,
            "equity_curve": equity_curve,
            "trades": display_trades,
            "trade_events": trade_events,
            "price_data": price_data,
            "config_used": {
                "symbol": self.symbol,
                "period_days": self.period_days,
                "initial_capital": self.initial_capital,
                "data_source": data_source,
                "candle_count": len(df_sim),
                "base_interval": base_interval,
                **self.strategy,
            },
        }

    def _try_open_basket(
        self, side: str, price: float, atr: float, wallet: float, timestamp: str
    ) -> SimulatedBasket | None:
        """Try to open a simulated basket. Returns None if insufficient capital."""
        s = self.strategy

        grid = calculate_grid_levels(
            current_wallet=wallet,
            bo_price=price,
            side=side,
            atr_val=atr,
            bo_pct_of_capital=s["base_order_pct"] / 100.0,
            tp_pct_of_capital=s["take_profit_pct"] / 100.0,
            max_safety_orders=s["max_safety_orders"],
            volume_scale=s["volume_scale"],
            step_scale=s["step_scale"],
            atr_multiplier=s["atr_multiplier"],
            step_min_pct=s["step_min_pct"],
            step_max_pct=s["step_max_pct"],
            leverage=s["leverage"],
            base_order_usd=s["base_order_usd"],
            sizing_mode=s["sizing_mode"],
            compounding_enabled=s["compounding_enabled"],
            compounding_pct=s["compounding_pct"] / 100.0,
            initial_capital=self.initial_capital,
            tp_mode=s.get("tp_mode", "pct"),
            tp_fixed_amount=s.get("tp_fixed_amount", 0.0),
        )

        bo = grid["bo"]

        # Apply Binance-like precision rounding (matches live bot behavior)
        qty_step = self.qty_precision_step.get(self.symbol, 0.001)
        tick_size = self.tick_precision.get(self.symbol, 0.01)
        min_qty = self.min_qty.get(self.symbol, 0.001)

        bo_qty = self._round_step(bo["qty"], qty_step)
        if bo_qty < min_qty:
            logger.debug(f"Basket rejected: qty {bo_qty} < min {min_qty} for {self.symbol}")
            return None

        # Validate minimum notional
        min_not = self.min_notional.get(self.symbol, 5.0)
        bo_notional = bo_qty * price
        if bo_notional < min_not:
            logger.debug(
                f"Basket rejected: notional ${bo_notional:.2f} < min ${min_not} for {self.symbol}"
            )
            return None

        if bo["margin"] > wallet * 0.5:
            return None

        # Round SO quantities and prices too
        rounded_so_levels = []
        for so in grid["so_levels"]:
            so_qty = self._round_step(so["qty"], qty_step)
            so_price = self._round_tick(so["fill_price"], tick_size)
            if so_qty < min_qty or (so_qty * so_price) < min_not:
                continue  # Skip SOs below minimum (matches live bot)
            rounded_so_levels.append({**so, "qty": so_qty, "fill_price": so_price})

        # Calculate TP price with precision
        tp_price = calculate_tp_price(side, price, bo_qty, grid["tp_target_usd"])
        tp_price = self._round_tick(tp_price, tick_size)

        return SimulatedBasket(
            side=side,
            entry_price=price,
            bo_qty=bo_qty,
            bo_margin=bo["margin"],
            so_levels=rounded_so_levels,
            tp_target_usd=grid["tp_target_usd"],
            tp_price=tp_price,
            leverage=s["leverage"],
            entry_time=timestamp,
            taker_fee=self.taker_fee,
            maker_fee=self.maker_fee,
            symbol=self.symbol,
            risk_config=self.strategy,
        )

    def _calculate_summary(
        self,
        trades: list[dict],
        max_drawdown_pct: float,
        final_wallet: float,
        open_trade: dict = None,
    ) -> dict[str, Any]:
        """Calculate performance summary metrics (includes ALL trades including END_OF_DATA)."""
        open_pnl = open_trade["pnl"] if open_trade else 0.0

        if not trades:
            return {
                "total_trades": 0,
                "winning_trades": 0,
                "losing_trades": 0,
                "win_rate": 0.0,
                "total_pnl": 0.0,
                "total_pnl_pct": 0.0,
                "max_drawdown_pct": round(max_drawdown_pct, 2),
                "sharpe_ratio": 0.0,
                "profit_factor": 0.0,
                "avg_trade_pnl": 0.0,
                "avg_sos_filled": 0.0,
                "total_fees_paid": 0.0,
                "initial_capital": self.initial_capital,
                "final_capital": round(final_wallet, 2),
                "has_open_trade": open_trade is not None,
                "open_trade_pnl": round(open_pnl, 4),
            }

        pnls = [t["pnl"] for t in trades]
        winning = [p for p in pnls if p > 0]
        losing = [p for p in pnls if p <= 0]
        total_pnl = sum(pnls)
        total_trading_fees = sum(t.get("trading_fees", 0) for t in trades)
        total_funding_paid = sum(t.get("funding_paid", 0) for t in trades)
        total_funding_received = sum(t.get("funding_received", 0) for t in trades)
        total_funding_net = total_funding_paid - total_funding_received

        # Sharpe ratio (annualized, using per-trade returns)
        if len(pnls) > 1:
            returns = np.array(pnls)
            mean_ret = np.mean(returns)
            std_ret = np.std(returns, ddof=1)
            # Annualize: assume ~365 trades/year rough estimate
            sharpe = (mean_ret / std_ret * np.sqrt(365)) if std_ret > 0 else 0.0
        else:
            sharpe = 0.0

        # Profit factor
        gross_profit = sum(winning) if winning else 0
        gross_loss = abs(sum(losing)) if losing else 0
        profit_factor = (
            gross_profit / gross_loss if gross_loss > 0 else (999.0 if gross_profit > 0 else 0.0)
        )

        avg_sos = np.mean([t.get("sos_filled", 0) for t in trades])

        return {
            "total_trades": len(trades),
            "winning_trades": len(winning),
            "losing_trades": len(losing),
            "win_rate": round(len(winning) / len(trades) * 100, 2) if trades else 0,
            "total_pnl": round(total_pnl, 4),
            "total_pnl_pct": round(total_pnl / self.initial_capital * 100, 2),
            "max_drawdown_pct": round(max_drawdown_pct, 2),
            "sharpe_ratio": round(float(sharpe), 2),
            "profit_factor": round(float(profit_factor), 2),
            "avg_trade_pnl": round(total_pnl / len(trades), 4) if trades else 0,
            "avg_sos_filled": round(float(avg_sos), 1),
            "total_trading_fees": round(total_trading_fees, 4),
            "total_funding_paid": round(total_funding_paid, 4),
            "total_funding_received": round(total_funding_received, 4),
            "total_funding_net": round(total_funding_net, 4),
            "total_fees_paid": round(total_trading_fees + total_funding_net, 4),  # legacy total
            "initial_capital": self.initial_capital,
            "final_capital": round(final_wallet, 2),
            "has_open_trade": open_trade is not None,
            "open_trade_pnl": round(open_pnl, 4),
        }
