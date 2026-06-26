"""
AI Strategy Tuner — Admin API Endpoints
========================================
SSE-streaming endpoint for the Gemini-powered strategy optimization agent,
plus session management and leaderboard queries.
"""

import json
import uuid
import numpy as np
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import require_admin, require_super_admin
from app.models.user import User
from app.models.ai_tuner_session import AiTunerSession
from app.services.gemini_agent import run_agent

router = APIRouter()

# ─── Maintenance / Access Control ──────────────────────────────────────────────
# Set to True to block all AI tuner runs (even super_admin)
MAINTENANCE_MODE = True
MAINTENANCE_MESSAGE = "AI Strategy Tuner is under maintenance. We are upgrading the optimization engine for better results. Please check back soon."


@router.get("/ai-tuner/status")
async def ai_tuner_status(
    admin_user: User = Depends(require_admin),
):
    """Check AI tuner access: returns maintenance status and whether user can run."""
    from app.core.enums import Role
    user_role = Role(admin_user.role) if isinstance(admin_user.role, str) else admin_user.role
    is_super = user_role == Role.SUPER_ADMIN
    return {
        "maintenance": MAINTENANCE_MODE,
        "maintenance_message": MAINTENANCE_MESSAGE if MAINTENANCE_MODE else None,
        "can_run": is_super,
        "is_super_admin": is_super,
    }


# ─── Request / Response Models ─────────────────────────────────────────────────

class TunerRunRequest(BaseModel):
    goal: str = Field(..., min_length=5, max_length=1000, description="Optimization goal / instructions for the AI")
    symbol: str = Field(default="BTCUSDT", description="Trading pair to optimize")


class SessionSummary(BaseModel):
    id: str
    symbol: str
    goal: str
    status: str
    backtests_run: int
    best_sharpe: float
    best_pnl_pct: float
    created_at: str
    completed_at: Optional[str] = None


# ─── Helper: numpy-safe JSON serializer ─────────────────────────────────────────

def safe_json(obj):
    """Convert numpy types to native Python for JSON serialization."""
    if isinstance(obj, dict):
        return {k: safe_json(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple)):
        return [safe_json(v) for v in obj]
    elif isinstance(obj, (np.integer,)):
        return int(obj)
    elif isinstance(obj, (np.floating,)):
        return float(obj)
    elif isinstance(obj, (np.bool_,)):
        return bool(obj)
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    return obj


# ─── SSE Streaming Endpoint ─────────────────────────────────────────────────────

@router.post("/ai-tuner/run")
async def run_ai_tuner(
    request: TunerRunRequest,
    admin_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Start an AI optimization session. Returns Server-Sent Events (SSE) stream.

    Events:
    - session_start: {symbol, goal}
    - thinking: {content, turn}
    - function_call: {name, args, id, turn}
    - function_result: {name, result, id, backtest_count}
    - complete: {backtests_run, results, comparison, best_config}
    - error: {message}
    """
    # Check maintenance mode — super admins bypass this
    from app.core.enums import Role
    user_role = Role(admin_user.role) if isinstance(admin_user.role, str) else admin_user.role
    if MAINTENANCE_MODE and user_role != Role.SUPER_ADMIN:
        raise HTTPException(503, detail=MAINTENANCE_MESSAGE)

    # Validate symbol
    allowed = {"BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT"}
    if request.symbol not in allowed:
        raise HTTPException(400, f"Symbol must be one of: {allowed}")

    # Create session record
    session = AiTunerSession(
        run_by=admin_user.id,
        symbol=request.symbol,
        goal=request.goal,
        status="running",
        messages=[],
        results=[],
        backtests_run=0,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    session_id = str(session.id)

    async def event_stream():
        """Generate SSE events from the Gemini agent."""
        messages = []
        all_results = []
        best_config = None
        best_sharpe = 0.0
        best_pnl_pct = 0.0
        best_max_dd = 0.0
        backtests_run = 0
        final_status = "completed"

        try:
            # Send session ID first
            yield f"event: session_id\ndata: {json.dumps({'session_id': session_id})}\n\n"

            async for event in run_agent(goal=request.goal, symbol=request.symbol):
                event_type = event["event"]
                event_data = safe_json(event.get("data", {}))

                # Track state
                if event_type == "thinking":
                    messages.append({"role": "assistant", "content": event_data.get("content", "")})
                elif event_type == "function_call":
                    messages.append({"role": "function_call", "name": event_data.get("name"), "args": event_data.get("args")})
                elif event_type == "function_result":
                    result = event_data.get("result", {})
                    if event_data.get("name") == "run_backtest" and "error" not in result:
                        all_results.append(result)
                        backtests_run = event_data.get("backtest_count", backtests_run)
                        # Track best
                        sr = result.get("sharpe_ratio", 0)
                        if sr > best_sharpe:
                            best_sharpe = sr
                            best_pnl_pct = result.get("total_pnl_pct", 0)
                            best_max_dd = result.get("max_drawdown_pct", 0)
                            best_config = result.get("config_used")
                    messages.append({"role": "function_result", "name": event_data.get("name"), "result": result})
                elif event_type == "complete":
                    comp = event_data
                    best_config = comp.get("best_config", best_config)
                    best_sharpe = comp.get("best_sharpe", best_sharpe)
                elif event_type == "error":
                    final_status = "failed"

                # Yield SSE event
                yield f"event: {event_type}\ndata: {json.dumps(event_data, default=str)}\n\n"

        except Exception as e:
            final_status = "failed"
            yield f"event: error\ndata: {json.dumps({'message': str(e)})}\n\n"

        # Update session in DB
        try:
            result = await db.execute(
                select(AiTunerSession).where(AiTunerSession.id == uuid.UUID(session_id))
            )
            sess = result.scalar_one_or_none()
            if sess:
                sess.status = final_status
                sess.messages = safe_json(messages[-50:])  # Keep last 50 messages
                sess.results = safe_json(all_results)
                sess.backtests_run = backtests_run
                sess.best_config = safe_json(best_config) if best_config else None
                sess.best_sharpe = float(best_sharpe)
                sess.best_pnl_pct = float(best_pnl_pct)
                sess.best_max_drawdown = float(best_max_dd)
                sess.completed_at = datetime.now(timezone.utc)
                await db.commit()
        except Exception as e:
            # Non-critical — log but don't fail the stream
            import structlog
            structlog.get_logger().error(f"Failed to update AI session: {e}")

        yield f"event: done\ndata: {json.dumps({'session_id': session_id})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )


# ─── Session Management ─────────────────────────────────────────────────────────

@router.get("/ai-tuner/sessions")
async def list_sessions(
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(default=20, le=50),
):
    """List past AI tuner sessions."""
    result = await db.execute(
        select(AiTunerSession)
        .order_by(desc(AiTunerSession.created_at))
        .limit(limit)
    )
    sessions = result.scalars().all()

    return [
        {
            "id": str(s.id),
            "symbol": s.symbol,
            "goal": s.goal[:100] + "..." if len(s.goal) > 100 else s.goal,
            "status": s.status,
            "backtests_run": s.backtests_run,
            "best_sharpe": round(s.best_sharpe, 2),
            "best_pnl_pct": round(s.best_pnl_pct, 2),
            "best_max_drawdown": round(s.best_max_drawdown, 2),
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "completed_at": s.completed_at.isoformat() if s.completed_at else None,
        }
        for s in sessions
    ]


@router.get("/ai-tuner/sessions/{session_id}")
async def get_session(
    session_id: str,
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get full session details including messages and results."""
    result = await db.execute(
        select(AiTunerSession).where(AiTunerSession.id == uuid.UUID(session_id))
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(404, "Session not found")

    return {
        "id": str(session.id),
        "symbol": session.symbol,
        "goal": session.goal,
        "status": session.status,
        "messages": session.messages,
        "results": session.results,
        "backtests_run": session.backtests_run,
        "best_config": session.best_config,
        "best_sharpe": round(session.best_sharpe, 2),
        "best_pnl_pct": round(session.best_pnl_pct, 2),
        "best_max_drawdown": round(session.best_max_drawdown, 2),
        "created_at": session.created_at.isoformat() if session.created_at else None,
        "completed_at": session.completed_at.isoformat() if session.completed_at else None,
    }


@router.delete("/ai-tuner/sessions/{session_id}")
async def delete_session(
    session_id: str,
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Delete an AI tuner session."""
    result = await db.execute(
        select(AiTunerSession).where(AiTunerSession.id == uuid.UUID(session_id))
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(404, "Session not found")

    await db.delete(session)
    await db.commit()
    return {"detail": "Session deleted"}


@router.get("/ai-tuner/leaderboard")
async def get_leaderboard(
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(default=10, le=50),
):
    """Get top performing configs across all sessions, ranked by Sharpe ratio."""
    result = await db.execute(
        select(AiTunerSession)
        .where(AiTunerSession.status == "completed")
        .where(AiTunerSession.best_sharpe > 0)
        .order_by(desc(AiTunerSession.best_sharpe))
        .limit(limit)
    )
    sessions = result.scalars().all()

    leaderboard = []
    for s in sessions:
        if s.best_config:
            leaderboard.append({
                "session_id": str(s.id),
                "symbol": s.symbol,
                "sharpe_ratio": round(s.best_sharpe, 2),
                "pnl_pct": round(s.best_pnl_pct, 2),
                "max_drawdown": round(s.best_max_drawdown, 2),
                "config": s.best_config,
                "created_at": s.created_at.isoformat() if s.created_at else None,
            })

    return leaderboard
