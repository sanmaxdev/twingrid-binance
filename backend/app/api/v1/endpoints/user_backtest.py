"""
User Backtest Endpoint (Pro/Elite only)
=======================================
POST /user-backtest/run   - Run a backtest (checks quota + plan access)
GET  /user-backtest/usage - Get today's usage and quota info
GET  /user-backtest/history - Get user's backtest history
"""
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.api.deps import get_db, get_current_user
from app.models.user import User
from app.models.backtest_history import BacktestHistory
from app.services.subscription_service import (
    check_backtest_access, increment_backtest_usage, get_user_plan
)

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/usage")
async def get_backtest_usage(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get today's backtest usage and plan limits."""
    access = await check_backtest_access(db, current_user.id)
    return {
        "has_access": access["daily_limit"] is not None and access["daily_limit"] > 0,
        "used_today": access["used_today"],
        "daily_limit": access["daily_limit"],
        "remaining_today": max(0, (access["daily_limit"] or 0) - access["used_today"]),
        "max_backtest_days": access["max_backtest_days"],
        "plan": access["plan"],
    }


@router.post("/run")
async def run_user_backtest(
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Run a backtest for the current user.
    Enforces:
    - Plan must be Pro or Elite (has backtest access)
    - Daily limit check
    - Max backtest period (in days)
    """
    # Check access
    access = await check_backtest_access(db, current_user.id)
    if not access["allowed"]:
        if access["reason"] == "no_backtest_access":
            raise HTTPException(
                403,
                detail={
                    "code": "no_backtest_access",
                    "message": "Backtest Engine requires a Pro or Elite subscription.",
                    "plan": access["plan"],
                }
            )
        elif access["reason"] == "daily_limit_reached":
            raise HTTPException(
                429,
                detail={
                    "code": "daily_limit_reached",
                    "message": f"You have used all {access['daily_limit']} backtests for today. Limit resets at midnight UTC.",
                    "used_today": access["used_today"],
                    "daily_limit": access["daily_limit"],
                }
            )

    # Validate period_days against plan max
    period_days = int(body.get("period_days", 30))
    max_days = access.get("max_backtest_days") or 180
    if period_days > max_days:
        raise HTTPException(
            400,
            detail={
                "code": "period_too_long",
                "message": f"Your plan allows a maximum backtest period of {max_days} days.",
                "max_days": max_days,
                "requested": period_days,
            }
        )

    # Increment usage BEFORE running (prevents gaming)
    new_count = await increment_backtest_usage(db, current_user.id)

    # Run the backtest using the shared engine
    try:
        from app.services.backtester import Backtester

        config = body.get("config", {})
        symbol = body.get("symbol", "BTCUSDT")
        initial_capital = float(body.get("initial_capital", 1000))

        backtester = Backtester()
        result = await backtester.run(
            symbol=symbol,
            period_days=period_days,
            initial_capital=initial_capital,
            config=config,
        )

        # Persist to backtest_history
        record = BacktestHistory(
            run_by=current_user.id,
            symbol=symbol,
            period_days=period_days,
            initial_capital=initial_capital,
            config=config,
            total_trades=result.get("total_trades", 0),
            winning_trades=result.get("winning_trades", 0),
            losing_trades=result.get("losing_trades", 0),
            win_rate=result.get("win_rate", 0),
            total_pnl=result.get("total_pnl", 0),
            total_pnl_pct=result.get("total_pnl_pct", 0),
            max_drawdown_pct=result.get("max_drawdown_pct", 0),
            sharpe_ratio=result.get("sharpe_ratio", 0),
            profit_factor=result.get("profit_factor", 0),
            final_capital=result.get("final_capital", initial_capital),
            total_fees_paid=result.get("total_fees_paid", 0),
            liquidated=result.get("liquidated", False),
            trend_filter_enabled=config.get("trend_filter_enabled", False),
            trend_blocked_count=result.get("trend_blocked_count", 0),
            full_result=result,
        )
        db.add(record)
        await db.commit()

        return {
            "success": True,
            "backtest_id": str(record.id),
            "result": result,
            "quota": {
                "used_today": new_count,
                "daily_limit": access["daily_limit"],
                "remaining_today": max(0, (access["daily_limit"] or 0) - new_count),
            }
        }

    except Exception as e:
        logger.error(f"User backtest failed for {current_user.id}: {e}")
        raise HTTPException(500, detail="Backtest execution failed. Please try again.")


@router.get("/history")
async def get_user_backtest_history(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return user's own backtest history."""
    plan = await get_user_plan(db, current_user.id)
    if not plan.daily_backtest_limit:
        raise HTTPException(403, detail="Backtest Engine requires a Pro or Elite subscription.")

    result = await db.execute(
        select(BacktestHistory)
        .where(BacktestHistory.run_by == current_user.id)
        .order_by(desc(BacktestHistory.created_at))
        .limit(100)
    )
    history = result.scalars().all()

    return [
        {
            "id": str(h.id),
            "symbol": h.symbol,
            "period_days": h.period_days,
            "initial_capital": h.initial_capital,
            "total_trades": h.total_trades,
            "win_rate": h.win_rate,
            "total_pnl_pct": h.total_pnl_pct,
            "max_drawdown_pct": h.max_drawdown_pct,
            "sharpe_ratio": h.sharpe_ratio,
            "profit_factor": h.profit_factor,
            "final_capital": h.final_capital,
            "liquidated": h.liquidated,
            "created_at": h.created_at.isoformat(),
        }
        for h in history
    ]
