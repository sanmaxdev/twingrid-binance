"""Admin platform metrics endpoint per §17.3."""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_admin
from app.models.account import Account
from app.models.basket import Basket
from app.models.event import Event
from app.models.user import User

router = APIRouter()


@router.get("/metrics")
async def get_platform_metrics(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Platform-wide metrics dashboard data."""
    now = datetime.now(UTC)
    last_24h = now - timedelta(hours=24)
    last_30d = now - timedelta(days=30)

    # User counts
    total_users = (
        await db.execute(select(func.count()).select_from(User).where(User.deleted_at == None))
    ).scalar()

    active_users_24h = (
        await db.execute(
            select(func.count())
            .select_from(User)
            .where(User.last_login_at >= last_24h, User.deleted_at == None)
        )
    ).scalar()

    suspended_users = (
        await db.execute(
            select(func.count())
            .select_from(User)
            .where(User.suspended_at != None, User.deleted_at == None)
        )
    ).scalar()

    # Account counts
    total_accounts = (
        await db.execute(
            select(func.count()).select_from(Account).where(Account.deleted_at == None)
        )
    ).scalar()

    running_accounts = (
        await db.execute(
            select(func.count())
            .select_from(Account)
            .where(Account.status == "RUNNING", Account.deleted_at == None)
        )
    ).scalar()

    # Basket counts
    total_baskets = (await db.execute(select(func.count()).select_from(Basket))).scalar()

    active_baskets = (
        await db.execute(
            select(func.count()).select_from(Basket).where(Basket.status.in_(["OPENING", "OPEN"]))
        )
    ).scalar()

    liquidations_30d = (
        await db.execute(
            select(func.count())
            .select_from(Basket)
            .where(
                Basket.status == "LIQUIDATED",
                Basket.closed_at >= last_30d,
            )
        )
    ).scalar()

    # PnL aggregates
    total_pnl = (
        await db.execute(
            select(func.coalesce(func.sum(Basket.realized_pnl), 0)).where(
                Basket.realized_pnl != None
            )
        )
    ).scalar()

    # Critical events in last 24h
    critical_events_24h = (
        await db.execute(
            select(func.count())
            .select_from(Event)
            .where(
                Event.severity == "CRITICAL",
                Event.occurred_at >= last_24h,
            )
        )
    ).scalar()

    # Role distribution
    role_counts = {}
    for role_val in ["USER", "ADMIN", "SUPER_ADMIN"]:
        count = (
            await db.execute(
                select(func.count())
                .select_from(User)
                .where(User.role == role_val, User.deleted_at == None)
            )
        ).scalar()
        role_counts[role_val] = count

    return {
        "users": {
            "total": total_users,
            "active_24h": active_users_24h,
            "suspended": suspended_users,
            "by_role": role_counts,
        },
        "accounts": {
            "total": total_accounts,
            "running": running_accounts,
        },
        "baskets": {
            "total": total_baskets,
            "active": active_baskets,
            "liquidations_30d": liquidations_30d,
        },
        "pnl": {
            "total_realized": float(total_pnl),
        },
        "system": {
            "critical_events_24h": critical_events_24h,
        },
    }
