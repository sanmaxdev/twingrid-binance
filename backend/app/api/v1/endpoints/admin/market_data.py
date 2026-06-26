"""Admin Market Data API — manage offline data cache for backtesting."""

import logging
from datetime import UTC, datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_admin
from app.models.user import User
from app.services.market_data_service import (
    VALID_KLINE_INTERVALS,
    VALID_SYMBOLS,
    delete_cache,
    download_full_range,
    fix_gaps,
    get_cache_status,
)

logger = logging.getLogger(__name__)

router = APIRouter()


class DownloadRequest(BaseModel):
    symbol: str = Field(description="Trading pair: BTCUSDT, ETHUSDT, SOLUSDT")
    intervals: list[str] = Field(
        default=["5m", "1h"],
        description="Kline intervals to download (1m, 5m, 15m, 1h, 4h, 1d)",
    )
    start_year: int = Field(ge=2019, le=2030)
    start_month: int = Field(ge=1, le=12)
    end_year: int = Field(ge=2019, le=2030)
    end_month: int = Field(ge=1, le=12)
    include_funding: bool = Field(default=True, description="Also download funding rates")


@router.get("/market-data/status")
async def market_data_status(
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get summary of all cached market data."""
    return await get_cache_status(db)


@router.post("/market-data/download")
async def download_market_data(
    request: DownloadRequest,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Download historical klines and funding rates from Binance.

    This may take a while for large date ranges.
    Data is stored in monthly chunks and can be used for offline backtesting.
    """
    if request.symbol not in VALID_SYMBOLS:
        raise HTTPException(400, f"Invalid symbol. Must be one of: {VALID_SYMBOLS}")

    invalid_intervals = [i for i in request.intervals if i not in VALID_KLINE_INTERVALS]
    if invalid_intervals:
        raise HTTPException(400, f"Invalid intervals: {invalid_intervals}")

    # Validate date range
    start = datetime(request.start_year, request.start_month, 1, tzinfo=UTC)
    end = datetime(request.end_year, request.end_month, 1, tzinfo=UTC)
    if start > end:
        raise HTTPException(400, "Start date must be before end date")

    now = datetime.now(UTC)
    if start > now:
        raise HTTPException(400, "Start date is in the future")

    # Cap at 5 years of history
    max_start = now.replace(year=now.year - 5)
    if start < max_start:
        raise HTTPException(
            400, f"Maximum history is 5 years (earliest: {max_start.strftime('%Y-%m')})"
        )

    try:
        all_results = []
        for interval in request.intervals:
            result = await download_full_range(
                symbol=request.symbol,
                interval=interval,
                start_year=request.start_year,
                start_month=request.start_month,
                end_year=request.end_year,
                end_month=request.end_month,
                db=db,
                include_funding=request.include_funding,
            )
            all_results.append(result)
            # Only download funding once (not per interval)
            request.include_funding = False

        return {
            "status": "ok",
            "results": all_results,
        }
    except Exception as e:
        logger.error(f"Market data download failed: {e}", exc_info=True)
        raise HTTPException(500, f"Download failed: {str(e)}") from e


@router.delete("/market-data")
async def clear_market_data(
    symbol: str | None = Query(None),
    data_type: str | None = Query(None),
    interval: str | None = Query(None),
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Delete cached market data, optionally filtered by symbol/type/interval."""
    deleted = await delete_cache(db, symbol, data_type, interval)
    return {"status": "ok", "deleted_chunks": deleted}


@router.get("/market-data/update-logs")
async def get_update_logs(
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get the auto-update log history."""
    from app.models.platform_settings import PlatformSettings

    result = await db.execute(
        select(PlatformSettings).where(PlatformSettings.key == "market_data_update_logs")
    )
    entry = result.scalars().first()
    logs = []
    if entry and isinstance(entry.value, list):
        logs = entry.value

    return {"logs": logs}


@router.post("/market-data/trigger-update")
async def trigger_update(
    background_tasks: BackgroundTasks,
    _admin: User = Depends(require_admin),
):
    """Manually trigger a market data auto-update (runs in background)."""
    import asyncio

    from app.tasks.market_data_task import _auto_update_market_data

    def _run_update():
        loop = asyncio.new_event_loop()
        try:
            loop.run_until_complete(_auto_update_market_data())
        finally:
            loop.close()

    background_tasks.add_task(_run_update)
    return {"status": "triggered", "message": "Market data update started. Check logs in ~1 min."}


@router.post("/market-data/fix-gaps")
async def fix_data_gaps(
    symbol: str | None = Query(None),
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Find and re-download all missing months (gaps) in cached data."""
    try:
        result = await fix_gaps(db, symbol)
        return result
    except Exception as e:
        logger.error(f"Fix gaps failed: {e}", exc_info=True)
        raise HTTPException(500, f"Fix gaps failed: {str(e)}") from e
