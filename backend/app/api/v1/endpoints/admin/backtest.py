"""Admin Backtest API endpoint."""

import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func

from app.api.deps import require_admin, get_db, get_current_user
from app.strategy.backtest_engine import BacktestEngine
from app.models.backtest_history import BacktestHistory
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter()


class BacktestRequest(BaseModel):
    symbol: str = Field(default="BTCUSDT", description="Trading pair")
    period_days: int = Field(default=7, ge=1, le=365, description="Backtest period in days")
    initial_capital: float = Field(default=1000.0, gt=0, description="Starting capital in USD")

    # Optional custom date range (ISO format strings, override period_days)
    start_date: Optional[str] = Field(default=None, description="Custom start date ISO string")
    end_date: Optional[str] = Field(default=None, description="Custom end date ISO string")

    # Strategy parameters
    leverage: int = Field(default=10, ge=1, le=125)
    sizing_mode: str = Field(default="fixed_usd")
    base_order_usd: float = Field(default=1.0, ge=0.1)
    base_order_pct: float = Field(default=1.0, ge=0.1)
    compounding_enabled: bool = Field(default=False)
    compounding_pct: float = Field(default=100, ge=0)
    max_safety_orders: int = Field(default=7, ge=0, le=20)
    take_profit_pct: float = Field(default=1.0, ge=0.1)
    tp_mode: str = Field(default="pct", description="TP mode: 'pct' or 'fixed'")
    tp_fixed_amount: float = Field(default=5.0, ge=0, description="Fixed USD TP target when tp_mode='fixed'")
    volume_scale: float = Field(default=1.5, ge=1.0)
    step_scale: float = Field(default=1.35, ge=1.0)
    rsi_long_threshold: float = Field(default=40, ge=10, le=50)
    rsi_short_threshold: float = Field(default=60, ge=50, le=90)
    signal_threshold: int = Field(default=55, ge=20, le=90)
    allow_long: bool = Field(default=True)
    allow_short: bool = Field(default=True)

    # Fee configuration
    taker_fee: float = Field(default=0.0004, ge=0, le=0.01)
    maker_fee: float = Field(default=0.0002, ge=0, le=0.01)

    # Grid geometry (previously missing — always fell back to defaults)
    atr_multiplier: float = Field(default=0.6, ge=0.1, le=2.0, description="ATR multiplier for grid step sizing")
    step_min_pct: float = Field(default=0.004, ge=0.001, le=0.05, description="Minimum step size as fraction (0.004 = 0.4%)")
    step_max_pct: float = Field(default=0.025, ge=0.005, le=0.10, description="Maximum step size as fraction (0.025 = 2.5%)")

    # Risk management
    max_basket_age_hours: int = Field(default=72, ge=0, le=720, description="Force-close baskets older than this. 0 = disabled.")

    # Trend filter
    trend_filter_enabled: bool = Field(default=False, description="Enable multi-timeframe trend filter")
    trend_timeframes: List[str] = Field(default=["1d", "4h"], description="Timeframes for trend detection")
    trend_mode: str = Field(default="majority", description="How to combine trend signals: majority/all/any")
    trend_ema_fast: int = Field(default=9, ge=3, le=50, description="Fast EMA period for trend")
    trend_ema_slow: int = Field(default=21, ge=10, le=200, description="Slow EMA period for trend")

    # Risk controller
    risk_controller_enabled: bool = Field(default=False, description="Enable risk controller for liquidation protection")
    rc_max_so_trigger: int = Field(default=5, ge=1, le=20, description="SO count that activates loss check")
    rc_margin_usage_pct: float = Field(default=80.0, ge=10, le=99, description="Margin guard threshold %")
    rc_max_basket_loss_pct: float = Field(default=10.0, ge=1, le=100, description="Max basket loss as % of wallet")
    rc_max_basket_loss_usd: float = Field(default=50.0, ge=0, description="Max basket loss in USD")
    rc_loss_mode: str = Field(default="pct_wallet", description="Loss calculation mode: pct_wallet or fixed_usd")
    rc_loss_direction: str = Field(default="exceeds", description="Exit direction: exceeds or recovers_to")
    rc_margin_guard_enabled: bool = Field(default=True, description="Whether the margin guard check is active")

    # Optional label for the run
    label: Optional[str] = Field(default=None, max_length=200, description="Optional label for this backtest run")


@router.post("/backtest/run")
async def run_backtest(
    request: BacktestRequest,
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Run a strategy backtest against historical Binance data.
    Admin-only endpoint. Results are auto-saved to history.
    """
    # Validate symbol
    allowed_symbols = {"BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT"}
    if request.symbol not in allowed_symbols:
        raise HTTPException(status_code=400, detail=f"Symbol must be one of: {allowed_symbols}")

    try:
        config = request.model_dump(exclude={"label"})
        engine = BacktestEngine(config)
        result = await engine.run()

        # Sanitize numpy types for JSONB storage
        def sanitize(obj):
            """Recursively convert numpy types to native Python types."""
            import numpy as np
            if isinstance(obj, dict):
                return {k: sanitize(v) for k, v in obj.items()}
            elif isinstance(obj, (list, tuple)):
                return [sanitize(v) for v in obj]
            elif isinstance(obj, (np.integer,)):
                return int(obj)
            elif isinstance(obj, (np.floating,)):
                return float(obj)
            elif isinstance(obj, (np.bool_,)):
                return bool(obj)
            elif isinstance(obj, np.ndarray):
                return obj.tolist()
            return obj

        safe_result = sanitize(result)
        safe_config = sanitize(config)

        # Auto-save to history
        s = safe_result.get("summary", {})
        try:
            history_entry = BacktestHistory(
                run_by=admin_user.id,
                symbol=request.symbol,
                period_days=request.period_days,
                initial_capital=request.initial_capital,
                config=safe_config,
                total_trades=int(s.get("total_trades", 0)),
                winning_trades=int(s.get("winning_trades", 0)),
                losing_trades=int(s.get("losing_trades", 0)),
                win_rate=float(s.get("win_rate", 0.0)),
                total_pnl=float(s.get("total_pnl", 0.0)),
                total_pnl_pct=float(s.get("total_pnl_pct", 0.0)),
                max_drawdown_pct=float(s.get("max_drawdown_pct", 0.0)),
                sharpe_ratio=float(s.get("sharpe_ratio", 0.0)),
                profit_factor=float(s.get("profit_factor", 0.0)),
                final_capital=float(s.get("final_capital", 0.0)),
                total_fees_paid=float(s.get("total_fees_paid", 0.0)),
                liquidated=bool(s.get("liquidated", False)),
                trend_filter_enabled=bool(s.get("trend_filter_enabled", False)),
                trend_blocked_count=int(s.get("trend_blocked_count", 0)),
                full_result=safe_result,
                label=request.label,
            )
            db.add(history_entry)
            await db.commit()
            await db.refresh(history_entry)
            safe_result["history_id"] = str(history_entry.id)
        except Exception as save_err:
            logger.error(f"Failed to save backtest to history: {save_err}", exc_info=True)
            await db.rollback()
            safe_result["history_id"] = None
            safe_result["history_save_error"] = str(save_err)

        return safe_result

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Backtest failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Backtest execution failed: {str(e)}")


@router.get("/backtest/history")
async def get_backtest_history(
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
    symbol: Optional[str] = Query(default=None),
    _admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get paginated backtest history list (summary only, no full results)."""
    query = select(BacktestHistory).order_by(desc(BacktestHistory.created_at))

    if symbol:
        query = query.where(BacktestHistory.symbol == symbol)

    # Count total
    count_query = select(func.count()).select_from(BacktestHistory)
    if symbol:
        count_query = count_query.where(BacktestHistory.symbol == symbol)
    total = (await db.execute(count_query)).scalar() or 0

    # Paginate
    query = query.offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(query)
    rows = result.scalars().all()

    items = []
    for row in rows:
        items.append({
            "id": str(row.id),
            "symbol": row.symbol,
            "period_days": row.period_days,
            "initial_capital": row.initial_capital,
            "total_trades": row.total_trades,
            "winning_trades": row.winning_trades,
            "losing_trades": row.losing_trades,
            "win_rate": row.win_rate,
            "total_pnl": row.total_pnl,
            "total_pnl_pct": row.total_pnl_pct,
            "max_drawdown_pct": row.max_drawdown_pct,
            "sharpe_ratio": row.sharpe_ratio,
            "profit_factor": row.profit_factor,
            "final_capital": row.final_capital,
            "total_fees_paid": row.total_fees_paid,
            "liquidated": row.liquidated,
            "trend_filter_enabled": row.trend_filter_enabled,
            "trend_blocked_count": row.trend_blocked_count,
            "label": row.label,
            "config": row.config,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        })

    return {
        "items": items,
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": (total + per_page - 1) // per_page,
    }


@router.get("/backtest/history/{backtest_id}")
async def get_backtest_detail(
    backtest_id: str,
    _admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get full backtest result by ID (includes trades, equity curve, etc.)."""
    import uuid as uuid_module
    try:
        bt_uuid = uuid_module.UUID(backtest_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid backtest ID")

    result = await db.execute(
        select(BacktestHistory).where(BacktestHistory.id == bt_uuid)
    )
    entry = result.scalars().first()
    if not entry:
        raise HTTPException(status_code=404, detail="Backtest not found")

    return {
        "id": str(entry.id),
        "symbol": entry.symbol,
        "period_days": entry.period_days,
        "initial_capital": entry.initial_capital,
        "config": entry.config,
        "label": entry.label,
        "created_at": entry.created_at.isoformat() if entry.created_at else None,
        "full_result": entry.full_result,
    }


@router.delete("/backtest/history/{backtest_id}")
async def delete_backtest(
    backtest_id: str,
    _admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Delete a backtest result from history."""
    import uuid as uuid_module
    try:
        bt_uuid = uuid_module.UUID(backtest_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid backtest ID")

    result = await db.execute(
        select(BacktestHistory).where(BacktestHistory.id == bt_uuid)
    )
    entry = result.scalars().first()
    if not entry:
        raise HTTPException(status_code=404, detail="Backtest not found")

    await db.delete(entry)
    await db.commit()
    return {"status": "deleted"}
