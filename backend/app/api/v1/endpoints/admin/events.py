"""Admin event feed endpoint."""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.api.deps import get_db, require_admin
from app.models.user import User
from app.models.event import Event

router = APIRouter()


@router.get("/events")
async def list_events(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    severity: str = Query(None),
    event_type: str = Query(None),
    start_date: Optional[str] = Query(None, description="ISO date, e.g. 2026-04-01"),
    end_date: Optional[str] = Query(None, description="ISO date, e.g. 2026-04-30"),
):
    """Filterable system event feed for admins with date range support."""
    stmt = select(Event)

    if severity:
        stmt = stmt.where(Event.severity == severity)
    if event_type:
        stmt = stmt.where(Event.type == event_type)

    # Date range filters
    if start_date:
        try:
            dt = datetime.fromisoformat(start_date)
            stmt = stmt.where(Event.occurred_at >= dt)
        except ValueError:
            pass
    if end_date:
        try:
            dt = datetime.fromisoformat(end_date)
            if "T" not in end_date:
                dt = dt.replace(hour=23, minute=59, second=59)
            stmt = stmt.where(Event.occurred_at <= dt)
        except ValueError:
            pass

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar()

    stmt = stmt.order_by(Event.occurred_at.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(stmt)
    events = result.scalars().all()

    return {
        "items": [
            {
                "id": str(e.id),
                "type": e.type,
                "severity": e.severity,
                "title": e.title,
                "message": e.message,
                "user_id": str(e.user_id) if e.user_id else None,
                "account_id": str(e.account_id) if e.account_id else None,
                "payload": e.payload,
                "occurred_at": e.occurred_at.isoformat() if e.occurred_at else None,
            }
            for e in events
        ],
        "total": total,
        "page": page,
        "per_page": per_page,
    }
