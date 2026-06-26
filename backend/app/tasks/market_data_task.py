"""
Market Data Auto-Update Celery Task.

Runs daily to keep all cached datasets up to date with the latest month's data.
For each symbol/interval combination that exists in the cache,
re-downloads the current month to pick up new candles.
"""

import asyncio
from datetime import UTC, datetime

import structlog
from celery import shared_task
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.models.market_data_cache import MarketDataCache

logger = structlog.get_logger(__name__)

# Module-level DB engine singleton for market data tasks
_md_engine = None
_md_session_factory = None


def _get_md_session():
    """Shared async engine + session factory for market data tasks.

    Uses NullPool to prevent connection leaks from asyncio.run() creating
    new event loops that orphan pooled connections.
    """
    global _md_engine, _md_session_factory
    if _md_engine is None:
        _md_engine = create_async_engine(
            settings.DATABASE_URL,
            echo=False,
            poolclass=NullPool,
        )
        _md_session_factory = async_sessionmaker(_md_engine, expire_on_commit=False)
    return _md_session_factory


async def _auto_update_market_data():
    """Re-download the current month for all cached datasets."""
    async_session = _get_md_session()

    now = datetime.now(UTC)
    results = {
        "started_at": now.isoformat(),
        "datasets_updated": 0,
        "total_candles": 0,
        "total_funding": 0,
        "errors": [],
    }

    try:
        async with async_session() as db:
            # Find all unique (symbol, data_type, interval) datasets that exist
            query = select(
                MarketDataCache.symbol,
                MarketDataCache.data_type,
                MarketDataCache.interval,
            ).group_by(
                MarketDataCache.symbol,
                MarketDataCache.data_type,
                MarketDataCache.interval,
            )
            rows = (await db.execute(query)).all()

            if not rows:
                logger.info("market_data_auto_update: no cached datasets found, nothing to update")
                results["status"] = "no_data"
                await _save_log(db, results)
                return results

            logger.info(f"market_data_auto_update: updating {len(rows)} datasets for current month")

            # Import the download functions
            from app.services.market_data_service import (
                download_funding_rates_month,
                download_klines_month,
            )

            # Track which symbols already had funding updated
            funding_updated = set()

            for row in rows:
                sym, dtype, interval = row.symbol, row.data_type, row.interval
                try:
                    if dtype == "klines":
                        result = await download_klines_month(sym, interval, now.year, now.month, db)
                        count = result.get("candle_count", 0)
                        results["total_candles"] += count
                        results["datasets_updated"] += 1
                        logger.info(f"auto_update: {sym} {interval} klines → {count} candles")

                    elif dtype == "funding_rate":
                        if sym not in funding_updated:
                            result = await download_funding_rates_month(
                                sym, now.year, now.month, db
                            )
                            count = result.get("candle_count", 0)
                            results["total_funding"] += count
                            results["datasets_updated"] += 1
                            funding_updated.add(sym)
                            logger.info(f"auto_update: {sym} funding → {count} rates")
                except Exception as e:
                    err_msg = f"{sym} {dtype} {interval}: {str(e)}"
                    logger.error(f"auto_update error: {err_msg}")
                    results["errors"].append(err_msg)

            results["status"] = "ok" if not results["errors"] else "partial"
            results["completed_at"] = datetime.now(UTC).isoformat()

            # Save update log
            await _save_log(db, results)

    except Exception as e:
        logger.error(f"market_data_auto_update failed: {e}", exc_info=True)
        results["status"] = "failed"
        results["errors"].append(str(e))
        results["completed_at"] = datetime.now(UTC).isoformat()
        # Try to save log even on failure
        try:
            async with async_session() as db:
                await _save_log(db, results)
        except Exception:
            pass

    return results


async def _save_log(db: AsyncSession, results: dict):
    """Save an update log entry to platform_settings as JSON."""
    from sqlalchemy.orm.attributes import flag_modified

    from app.models.platform_settings import PlatformSettings

    # Store last N update logs (keep up to 50)
    log_key = "market_data_update_logs"
    existing = (
        (await db.execute(select(PlatformSettings).where(PlatformSettings.key == log_key)))
        .scalars()
        .first()
    )

    log_entry = {
        "timestamp": results.get("started_at", datetime.now(UTC).isoformat()),
        "completed_at": results.get("completed_at"),
        "status": results.get("status", "unknown"),
        "datasets_updated": results.get("datasets_updated", 0),
        "total_candles": results.get("total_candles", 0),
        "total_funding": results.get("total_funding", 0),
        "errors": results.get("errors", []),
    }

    if existing:
        logs = list(existing.value) if isinstance(existing.value, list) else []
        logs.insert(0, log_entry)
        logs = logs[:50]  # Keep last 50 logs
        existing.value = logs
        # JSONB mutation detection: SQLAlchemy doesn't detect in-place
        # list changes — explicitly flag the column as modified so the
        # UPDATE is emitted and the new log entry actually persists.
        flag_modified(existing, "value")
    else:
        db.add(PlatformSettings(key=log_key, value=[log_entry]))

    await db.commit()


@shared_task(name="market_data_auto_update")
def market_data_auto_update():
    """Celery task: auto-update all cached market data with current month."""
    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(_auto_update_market_data())
    finally:
        loop.close()
