"""Admin cross-user audit log endpoint."""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import aliased

from app.api.deps import get_db, require_admin
from app.models.user import User
from app.models.audit_log import AuditLog

router = APIRouter()


@router.get("/audit-log")
async def list_audit_log(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    action: str = Query(None),
    user_id: str = Query(None),
    start_date: Optional[str] = Query(None, description="ISO date, e.g. 2026-04-01"),
    end_date: Optional[str] = Query(None, description="ISO date, e.g. 2026-04-30"),
):
    """Cross-user audit log for admins with user details and date range filtering."""

    # Alias User for actor and target joins
    ActorUser = aliased(User, flat=True)
    TargetUser = aliased(User, flat=True)

    stmt = (
        select(
            AuditLog,
            ActorUser.email.label("actor_email"),
            ActorUser.display_name.label("actor_name"),
            TargetUser.email.label("target_email"),
            TargetUser.display_name.label("target_name"),
        )
        .outerjoin(ActorUser, AuditLog.actor_user_id == ActorUser.id)
        .outerjoin(TargetUser, AuditLog.target_user_id == TargetUser.id)
    )

    if action:
        stmt = stmt.where(AuditLog.action == action)

    if user_id:
        import uuid as _uuid
        try:
            uid = _uuid.UUID(user_id)
            stmt = stmt.where(
                (AuditLog.actor_user_id == uid) | (AuditLog.target_user_id == uid)
            )
        except ValueError:
            pass

    # Date range filters
    if start_date:
        try:
            dt = datetime.fromisoformat(start_date)
            stmt = stmt.where(AuditLog.occurred_at >= dt)
        except ValueError:
            pass
    if end_date:
        try:
            dt = datetime.fromisoformat(end_date)
            # If only a date is given (no time), include the full day
            if "T" not in end_date:
                dt = dt.replace(hour=23, minute=59, second=59)
            stmt = stmt.where(AuditLog.occurred_at <= dt)
        except ValueError:
            pass

    # Count total (use subquery of just AuditLog IDs for accurate count)
    count_sub = stmt.with_only_columns(AuditLog.id).subquery()
    count_stmt = select(func.count()).select_from(count_sub)
    total = (await db.execute(count_stmt)).scalar()

    stmt = stmt.order_by(AuditLog.occurred_at.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(stmt)
    rows = result.all()

    return {
        "items": [
            {
                "id": row.AuditLog.id,
                "action": row.AuditLog.action,
                "actor_user_id": str(row.AuditLog.actor_user_id) if row.AuditLog.actor_user_id else None,
                "actor_email": row.actor_email,
                "actor_name": row.actor_name,
                "target_user_id": str(row.AuditLog.target_user_id) if row.AuditLog.target_user_id else None,
                "target_email": row.target_email,
                "target_name": row.target_name,
                "target_account_id": str(row.AuditLog.target_account_id) if row.AuditLog.target_account_id else None,
                "ip_address": row.AuditLog.ip_address,
                "occurred_at": row.AuditLog.occurred_at.isoformat() if row.AuditLog.occurred_at else None,
                "payload": row.AuditLog.payload,
                "impersonating": row.AuditLog.impersonating,
            }
            for row in rows
        ],
        "total": total,
        "page": page,
        "per_page": per_page,
    }
