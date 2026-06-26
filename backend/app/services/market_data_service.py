"""
Market Data Service — Download and cache historical klines + funding rates from Binance.

Stores data in monthly chunks in PostgreSQL for offline backtest usage.
Supports: BTCUSDT, ETHUSDT, SOLUSDT
Data types: klines (1m, 5m, 15m, 1h, 4h, 1d), funding_rate (8h)
"""

import asyncio
import json
import sys
from datetime import UTC, datetime
from typing import Any

import httpx
import pandas as pd
import structlog
from dateutil.relativedelta import relativedelta
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.market_data_cache import MarketDataCache

logger = structlog.get_logger(__name__)


# ── Binance API endpoints (fallback chain for geo-blocked regions) ──
# Import settings lazily to avoid circular imports
def _get_binance_urls():
    from app.core.config import settings

    return [
        settings.BINANCE_LIVE_BASE_URL,
        settings.BINANCE_DEMO_BASE_URL,
        settings.BINANCE_TESTNET_BASE_URL,
    ]


VALID_SYMBOLS = {"BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT"}
VALID_KLINE_INTERVALS = {"1m", "5m", "15m", "1h", "4h", "1d"}
FUNDING_INTERVAL = "8h"

# Milliseconds per candle interval (for pagination)
INTERVAL_MS = {
    "1m": 60_000,
    "5m": 300_000,
    "15m": 900_000,
    "1h": 3_600_000,
    "4h": 14_400_000,
    "1d": 86_400_000,
}


MAX_RETRIES = 3
RETRY_DELAY = 2  # seconds, doubles on each retry


async def _find_working_url() -> str:
    """Find a working Binance API URL (handles geo-blocks)."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        for base_url in _get_binance_urls():
            try:
                resp = await client.get(
                    f"{base_url}/fapi/v1/klines",
                    params={"symbol": "BTCUSDT", "interval": "1m", "limit": 1},
                )
                if resp.status_code == 200 and resp.json():
                    return base_url
            except Exception:
                continue
    raise ValueError("All Binance endpoints failed — check network/geo-block.")


async def _fetch_with_retry(
    client: httpx.AsyncClient,
    url: str,
    params: dict,
    max_retries: int = MAX_RETRIES,
) -> list:
    """Fetch with exponential backoff retry on failure."""
    delay = RETRY_DELAY
    for attempt in range(max_retries):
        try:
            resp = await client.get(url, params=params)
            if resp.status_code == 429:  # Rate limited
                wait = int(resp.headers.get("Retry-After", delay * 2))
                logger.warning(f"Rate limited, waiting {wait}s...")
                await asyncio.sleep(wait)
                continue
            if resp.status_code != 200:
                raise ValueError(f"HTTP {resp.status_code}: {resp.text[:200]}")
            return resp.json()
        except (httpx.TimeoutException, httpx.ConnectError, httpx.ReadError) as e:
            if attempt == max_retries - 1:
                raise ValueError(f"Failed after {max_retries} attempts: {e}") from e
            logger.warning(f"Retry {attempt + 1}/{max_retries} after {delay}s: {e}")
            await asyncio.sleep(delay)
            delay *= 2
    return []


async def download_klines_month(
    symbol: str,
    interval: str,
    year: int,
    month: int,
    db: AsyncSession,
) -> dict[str, Any]:
    """
    Download one month of kline data and upsert into the cache.

    Returns metadata dict with candle_count and status.
    """
    if symbol not in VALID_SYMBOLS:
        raise ValueError(f"Invalid symbol: {symbol}")
    if interval not in VALID_KLINE_INTERVALS:
        raise ValueError(f"Invalid interval: {interval}")

    # Calculate month boundaries (UTC)
    month_start = datetime(year, month, 1, tzinfo=UTC)
    next_month = month_start + relativedelta(months=1)
    # Don't go past current time
    now = datetime.now(UTC)
    month_end = min(next_month, now)

    if month_start >= now:
        return {"status": "skipped", "reason": "Month is in the future"}

    start_ms = int(month_start.timestamp() * 1000)
    end_ms = int(month_end.timestamp() * 1000)

    year_month = f"{year:04d}-{month:02d}"
    logger.info(f"Downloading {symbol} {interval} klines for {year_month}...")

    base_url = await _find_working_url()
    all_candles = []

    async with httpx.AsyncClient(timeout=120.0) as client:
        current_start = start_ms
        while current_start < end_ms:
            params = {
                "symbol": symbol,
                "interval": interval,
                "startTime": current_start,
                "endTime": end_ms,
                "limit": 1500,
            }
            data = await _fetch_with_retry(client, f"{base_url}/fapi/v1/klines", params)
            if not data:
                break

            all_candles.extend(data)
            current_start = data[-1][6] + 1  # close_time + 1ms

            if len(data) < 1500:
                break

            # Small delay between pages to avoid rate limiting
            await asyncio.sleep(0.1)

    if not all_candles:
        return {"status": "empty", "candle_count": 0, "year_month": year_month}

    # Convert to compact storage format: [open_time, open, high, low, close, volume]
    compact = []
    seen = set()
    for c in all_candles:
        ot = int(c[0])
        if ot in seen:
            continue
        seen.add(ot)
        compact.append(
            [
                ot,
                float(c[1]),  # open
                float(c[2]),  # high
                float(c[3]),  # low
                float(c[4]),  # close
                float(c[5]),  # volume
            ]
        )

    compact.sort(key=lambda x: x[0])
    data_size = sys.getsizeof(json.dumps(compact))

    # Upsert into cache (replace if exists)
    existing = (
        (
            await db.execute(
                select(MarketDataCache).where(
                    MarketDataCache.symbol == symbol,
                    MarketDataCache.data_type == "klines",
                    MarketDataCache.interval == interval,
                    MarketDataCache.year_month == year_month,
                )
            )
        )
        .scalars()
        .first()
    )

    if existing:
        existing.data = compact
        existing.candle_count = len(compact)
        existing.file_size_bytes = data_size
        existing.date_start = month_start
        existing.date_end = month_end
        existing.downloaded_at = datetime.now(UTC)
    else:
        db.add(
            MarketDataCache(
                symbol=symbol,
                data_type="klines",
                interval=interval,
                year_month=year_month,
                date_start=month_start,
                date_end=month_end,
                data=compact,
                candle_count=len(compact),
                file_size_bytes=data_size,
            )
        )

    await db.commit()

    logger.info(f"Cached {len(compact)} {interval} candles for {symbol} {year_month}")
    return {
        "status": "ok",
        "candle_count": len(compact),
        "year_month": year_month,
        "size_bytes": data_size,
    }


async def download_funding_rates_month(
    symbol: str,
    year: int,
    month: int,
    db: AsyncSession,
) -> dict[str, Any]:
    """
    Download one month of funding rate history and upsert into the cache.

    Binance funding rates are every 8 hours (3 per day, ~90 per month).
    """
    if symbol not in VALID_SYMBOLS:
        raise ValueError(f"Invalid symbol: {symbol}")

    month_start = datetime(year, month, 1, tzinfo=UTC)
    next_month = month_start + relativedelta(months=1)
    now = datetime.now(UTC)
    month_end = min(next_month, now)

    if month_start >= now:
        return {"status": "skipped", "reason": "Month is in the future"}

    start_ms = int(month_start.timestamp() * 1000)
    end_ms = int(month_end.timestamp() * 1000)

    year_month = f"{year:04d}-{month:02d}"
    logger.info(f"Downloading {symbol} funding rates for {year_month}...")

    base_url = await _find_working_url()
    all_rates = []

    async with httpx.AsyncClient(timeout=60.0) as client:
        current_start = start_ms
        while current_start < end_ms:
            params = {
                "symbol": symbol,
                "startTime": current_start,
                "endTime": end_ms,
                "limit": 1000,
            }
            data = await _fetch_with_retry(client, f"{base_url}/fapi/v1/fundingRate", params)
            if not data:
                break

            all_rates.extend(data)
            current_start = data[-1]["fundingTime"] + 1

            if len(data) < 1000:
                break

            await asyncio.sleep(0.1)

    if not all_rates:
        return {"status": "empty", "candle_count": 0, "year_month": year_month}

    # Compact format: [funding_time_ms, funding_rate_float, mark_price_float]
    compact = []
    seen = set()
    for r in all_rates:
        ft = int(r["fundingTime"])
        if ft in seen:
            continue
        seen.add(ft)
        compact.append(
            [
                ft,
                float(r["fundingRate"]),
                float(r.get("markPrice", 0)),
            ]
        )

    compact.sort(key=lambda x: x[0])
    data_size = sys.getsizeof(json.dumps(compact))

    existing = (
        (
            await db.execute(
                select(MarketDataCache).where(
                    MarketDataCache.symbol == symbol,
                    MarketDataCache.data_type == "funding_rate",
                    MarketDataCache.interval == FUNDING_INTERVAL,
                    MarketDataCache.year_month == year_month,
                )
            )
        )
        .scalars()
        .first()
    )

    if existing:
        existing.data = compact
        existing.candle_count = len(compact)
        existing.file_size_bytes = data_size
        existing.date_start = month_start
        existing.date_end = month_end
        existing.downloaded_at = datetime.now(UTC)
    else:
        db.add(
            MarketDataCache(
                symbol=symbol,
                data_type="funding_rate",
                interval=FUNDING_INTERVAL,
                year_month=year_month,
                date_start=month_start,
                date_end=month_end,
                data=compact,
                candle_count=len(compact),
                file_size_bytes=data_size,
            )
        )

    await db.commit()

    logger.info(f"Cached {len(compact)} funding rates for {symbol} {year_month}")
    return {
        "status": "ok",
        "candle_count": len(compact),
        "year_month": year_month,
    }


async def download_full_range(
    symbol: str,
    interval: str,
    start_year: int,
    start_month: int,
    end_year: int,
    end_month: int,
    db: AsyncSession,
    include_funding: bool = True,
) -> dict[str, Any]:
    """
    Download klines (and optionally funding rates) for a full date range.

    SMART SKIP: Only downloads months that are NOT already in the cache.
    The current (incomplete) month is always re-downloaded to pick up new data.

    Returns aggregate stats of the download.
    """
    results = {
        "symbol": symbol,
        "interval": interval,
        "months_processed": 0,
        "months_skipped": 0,
        "months_downloaded": 0,
        "total_candles": 0,
        "total_funding_records": 0,
        "funding_months_skipped": 0,
        "errors": [],
    }

    now = datetime.now(UTC)
    current_ym = f"{now.year:04d}-{now.month:02d}"

    # ── Build the full list of year-months in the requested range ──
    all_months = _get_month_range(
        datetime(start_year, start_month, 1, tzinfo=UTC),
        datetime(end_year, end_month, 1, tzinfo=UTC),
    )

    # ── Query which kline months are already cached ──
    cached_kline_result = await db.execute(
        select(MarketDataCache.year_month).where(
            MarketDataCache.symbol == symbol,
            MarketDataCache.data_type == "klines",
            MarketDataCache.interval == interval,
        )
    )
    cached_kline_months = {row[0] for row in cached_kline_result.all()}

    # ── Query which funding months are already cached ──
    cached_funding_months: set = set()
    if include_funding:
        cached_funding_result = await db.execute(
            select(MarketDataCache.year_month).where(
                MarketDataCache.symbol == symbol,
                MarketDataCache.data_type == "funding_rate",
                MarketDataCache.interval == FUNDING_INTERVAL,
            )
        )
        cached_funding_months = {row[0] for row in cached_funding_result.all()}

    for ym in all_months:
        y, m = int(ym[:4]), int(ym[5:])
        is_current_month = ym == current_ym

        # ── Klines: skip if cached and NOT the current (partial) month ──
        if ym in cached_kline_months and not is_current_month:
            results["months_skipped"] += 1
            logger.info(f"Skip {symbol} {interval} {ym} — already cached")
        else:
            try:
                kline_result = await download_klines_month(symbol, interval, y, m, db)
                results["total_candles"] += kline_result.get("candle_count", 0)
                results["months_downloaded"] += 1
            except Exception as e:
                err = f"Klines {symbol} {interval} {ym}: {str(e)}"
                logger.error(err)
                results["errors"].append(err)

        # ── Funding: skip if cached and NOT the current month ──
        if include_funding:
            if ym in cached_funding_months and not is_current_month:
                results["funding_months_skipped"] += 1
            else:
                try:
                    fund_result = await download_funding_rates_month(symbol, y, m, db)
                    results["total_funding_records"] += fund_result.get("candle_count", 0)
                except Exception as e:
                    err = f"Funding {symbol} {ym}: {str(e)}"
                    logger.error(err)
                    results["errors"].append(err)

        results["months_processed"] += 1

    return results


# ── Query functions used by the backtest engine ──


async def get_cached_klines(
    db: AsyncSession,
    symbol: str,
    interval: str,
    start_time: datetime,
    end_time: datetime,
) -> pd.DataFrame | None:
    """
    Load klines from cache for the given date range.

    Returns a DataFrame in the same format as the live API fetch,
    or None if cache is incomplete for the requested range.
    """
    # Determine which months we need
    needed_months = _get_month_range(start_time, end_time)

    # Query all matching chunks
    result = await db.execute(
        select(MarketDataCache)
        .where(
            MarketDataCache.symbol == symbol,
            MarketDataCache.data_type == "klines",
            MarketDataCache.interval == interval,
            MarketDataCache.year_month.in_(needed_months),
        )
        .order_by(MarketDataCache.year_month)
    )
    chunks = result.scalars().all()

    # Check if we have all needed months
    cached_months = {c.year_month for c in chunks}
    missing = set(needed_months) - cached_months
    if missing:
        logger.info(f"Cache miss for {symbol} {interval}: missing {sorted(missing)}")
        return None

    # Combine all chunks into one DataFrame
    all_candles = []
    for chunk in chunks:
        all_candles.extend(chunk.data)

    if not all_candles:
        return None

    # Build DataFrame matching the format from fetch_historical_klines
    df = pd.DataFrame(
        all_candles,
        columns=[
            "open_time",
            "open",
            "high",
            "low",
            "close",
            "volume",
        ],
    )
    df["open_time"] = df["open_time"].astype(int)

    # Filter to exact requested range
    start_ms = int(start_time.timestamp() * 1000)
    end_ms = int(end_time.timestamp() * 1000)
    df = df[(df["open_time"] >= start_ms) & (df["open_time"] <= end_ms)]

    if df.empty:
        return None

    for col in ["open", "high", "low", "close", "volume"]:
        df[col] = df[col].astype(float)

    df["timestamp"] = pd.to_datetime(df["open_time"], unit="ms", utc=True)
    df = df.drop_duplicates(subset=["open_time"]).sort_values("open_time").reset_index(drop=True)

    logger.info(f"Cache hit: {len(df)} {interval} candles for {symbol}")
    return df


async def get_cached_funding_rates(
    db: AsyncSession,
    symbol: str,
    start_time: datetime,
    end_time: datetime,
) -> pd.DataFrame | None:
    """
    Load funding rate history from cache for the given date range.

    Returns DataFrame with columns: [funding_time, funding_rate, mark_price]
    or None if cache is incomplete.
    """
    needed_months = _get_month_range(start_time, end_time)

    result = await db.execute(
        select(MarketDataCache)
        .where(
            MarketDataCache.symbol == symbol,
            MarketDataCache.data_type == "funding_rate",
            MarketDataCache.interval == FUNDING_INTERVAL,
            MarketDataCache.year_month.in_(needed_months),
        )
        .order_by(MarketDataCache.year_month)
    )
    chunks = result.scalars().all()

    cached_months = {c.year_month for c in chunks}
    missing = set(needed_months) - cached_months
    if missing:
        logger.info(f"Funding cache miss for {symbol}: missing {sorted(missing)}")
        return None

    all_rates = []
    for chunk in chunks:
        all_rates.extend(chunk.data)

    if not all_rates:
        return None

    df = pd.DataFrame(all_rates, columns=["funding_time", "funding_rate", "mark_price"])
    df["funding_time"] = df["funding_time"].astype(int)

    start_ms = int(start_time.timestamp() * 1000)
    end_ms = int(end_time.timestamp() * 1000)
    df = df[(df["funding_time"] >= start_ms) & (df["funding_time"] <= end_ms)]

    df = (
        df.drop_duplicates(subset=["funding_time"])
        .sort_values("funding_time")
        .reset_index(drop=True)
    )

    logger.info(f"Funding cache hit: {len(df)} rates for {symbol}")
    return df


async def get_cache_status(db: AsyncSession) -> dict[str, Any]:
    """
    Get a summary of all cached data — used by the admin UI.
    Also detects gaps (missing months) in each dataset for data integrity.
    """
    from sqlalchemy import func

    # Aggregate stats per dataset
    result = await db.execute(
        select(
            MarketDataCache.symbol,
            MarketDataCache.data_type,
            MarketDataCache.interval,
            func.count(MarketDataCache.id).label("months"),
            func.sum(MarketDataCache.candle_count).label("total_records"),
            func.sum(MarketDataCache.file_size_bytes).label("total_bytes"),
            func.min(MarketDataCache.date_start).label("earliest"),
            func.max(MarketDataCache.date_end).label("latest"),
        )
        .group_by(
            MarketDataCache.symbol,
            MarketDataCache.data_type,
            MarketDataCache.interval,
        )
        .order_by(
            MarketDataCache.symbol,
            MarketDataCache.data_type,
            MarketDataCache.interval,
        )
    )
    rows = result.all()

    # For gap detection, also fetch all year_month values per dataset
    ym_result = await db.execute(
        select(
            MarketDataCache.symbol,
            MarketDataCache.data_type,
            MarketDataCache.interval,
            MarketDataCache.year_month,
        ).order_by(
            MarketDataCache.symbol,
            MarketDataCache.data_type,
            MarketDataCache.interval,
            MarketDataCache.year_month,
        )
    )
    ym_rows = ym_result.all()

    # Build lookup: (symbol, data_type, interval) -> set of year_months
    cached_ym_map: dict[tuple, set] = {}
    for ymr in ym_rows:
        key = (ymr.symbol, ymr.data_type, ymr.interval)
        cached_ym_map.setdefault(key, set()).add(ymr.year_month)

    items = []
    for row in rows:
        key = (row.symbol, row.data_type, row.interval)
        cached_months_set = cached_ym_map.get(key, set())

        # Detect gaps: compute expected months between earliest and latest
        missing_months: list[str] = []
        if row.earliest and row.latest:
            expected = _get_month_range(row.earliest, row.latest)
            missing_months = sorted(set(expected) - cached_months_set)

        items.append(
            {
                "symbol": row.symbol,
                "data_type": row.data_type,
                "interval": row.interval,
                "months_cached": row.months,
                "total_records": int(row.total_records or 0),
                "total_bytes": int(row.total_bytes or 0),
                "earliest": row.earliest.isoformat() if row.earliest else None,
                "latest": row.latest.isoformat() if row.latest else None,
                "missing_months": missing_months,
                "has_gaps": len(missing_months) > 0,
            }
        )

    return {"items": items}


async def delete_cache(
    db: AsyncSession,
    symbol: str | None = None,
    data_type: str | None = None,
    interval: str | None = None,
) -> int:
    """Delete cached data, optionally filtered. Returns count of deleted rows."""
    stmt = delete(MarketDataCache)
    if symbol:
        stmt = stmt.where(MarketDataCache.symbol == symbol)
    if data_type:
        stmt = stmt.where(MarketDataCache.data_type == data_type)
    if interval:
        stmt = stmt.where(MarketDataCache.interval == interval)

    result = await db.execute(stmt)
    await db.commit()
    return result.rowcount


def _get_month_range(start: datetime, end: datetime) -> list[str]:
    """Get list of year-month strings covering the date range."""
    months = []
    current = start.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    while current <= end:
        months.append(f"{current.year:04d}-{current.month:02d}")
        current += relativedelta(months=1)
    return months


async def fix_gaps(
    db: AsyncSession,
    symbol: str | None = None,
) -> dict[str, Any]:
    """
    Find all gaps (missing months) across cached datasets and re-download them.

    If symbol is provided, only fix gaps for that symbol.
    Returns a summary of what was fixed.
    """
    from sqlalchemy import func

    results = {
        "gaps_found": 0,
        "gaps_fixed": 0,
        "gaps_failed": 0,
        "details": [],
        "errors": [],
    }

    # Get all datasets with their cached months
    query = select(
        MarketDataCache.symbol,
        MarketDataCache.data_type,
        MarketDataCache.interval,
        func.min(MarketDataCache.date_start).label("earliest"),
        func.max(MarketDataCache.date_end).label("latest"),
    ).group_by(
        MarketDataCache.symbol,
        MarketDataCache.data_type,
        MarketDataCache.interval,
    )
    if symbol:
        query = query.where(MarketDataCache.symbol == symbol)

    rows = (await db.execute(query)).all()

    # Get all cached year_months
    ym_query = select(
        MarketDataCache.symbol,
        MarketDataCache.data_type,
        MarketDataCache.interval,
        MarketDataCache.year_month,
    )
    if symbol:
        ym_query = ym_query.where(MarketDataCache.symbol == symbol)
    ym_rows = (await db.execute(ym_query)).all()

    cached_ym_map: dict[tuple, set] = {}
    for ymr in ym_rows:
        key = (ymr.symbol, ymr.data_type, ymr.interval)
        cached_ym_map.setdefault(key, set()).add(ymr.year_month)

    for row in rows:
        if not row.earliest or not row.latest:
            continue

        key = (row.symbol, row.data_type, row.interval)
        cached = cached_ym_map.get(key, set())
        expected = _get_month_range(row.earliest, row.latest)
        missing = sorted(set(expected) - cached)

        if not missing:
            continue

        results["gaps_found"] += len(missing)
        label = f"{row.symbol} {row.data_type} {row.interval}"
        logger.info(f"Fixing {len(missing)} gaps for {label}: {missing}")

        for ym in missing:
            y, m = int(ym[:4]), int(ym[5:])
            try:
                if row.data_type == "klines":
                    r = await download_klines_month(row.symbol, row.interval, y, m, db)
                elif row.data_type == "funding_rate":
                    r = await download_funding_rates_month(row.symbol, y, m, db)
                else:
                    continue

                count = r.get("candle_count", 0)
                results["gaps_fixed"] += 1
                results["details"].append(
                    {
                        "dataset": label,
                        "month": ym,
                        "records": count,
                        "status": "fixed",
                    }
                )
                logger.info(f"Fixed gap: {label} {ym} ({count} records)")

                # Small delay between months to avoid rate limiting
                await asyncio.sleep(0.3)

            except Exception as e:
                results["gaps_failed"] += 1
                err_msg = f"{label} {ym}: {str(e)}"
                results["errors"].append(err_msg)
                results["details"].append(
                    {
                        "dataset": label,
                        "month": ym,
                        "status": "failed",
                        "error": str(e),
                    }
                )
                logger.error(f"Gap fix failed: {err_msg}")

    return results
