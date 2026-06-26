"""Basket history and forensics endpoints per Phase 6."""

from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.api.deps import get_db, get_current_user, get_tenant_scope
from app.models.user import User
from app.models.account import Account
from app.models.basket import Basket
from app.models.order import Order
from app.services.tenant_scope import TenantScope

router = APIRouter()


def _compute_duration(opened_at, closed_at) -> str | None:
    """Compute human-readable duration between opened and closed timestamps."""
    if not opened_at or not closed_at:
        return None
    delta = closed_at - opened_at
    total_seconds = int(delta.total_seconds())
    if total_seconds < 0:
        return None
    days = total_seconds // 86400
    hours = (total_seconds % 86400) // 3600
    mins = (total_seconds % 3600) // 60
    if days > 0:
        return f"{days}d {hours}h {mins}m"
    if hours > 0:
        return f"{hours}h {mins}m"
    return f"{mins}m"


@router.get("/accounts/{account_id}/baskets")
async def list_baskets(
    account_id: UUID,
    scope: TenantScope = Depends(get_tenant_scope),
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
    status: str = Query(None),
    side: str = Query(None),
    symbol: str = Query(None),
    exit_reason: str = Query(None),
):
    """List baskets for an account with filters."""
    # Verify account access
    acc_result = await db.execute(
        scope.filter_user_owned(
            select(Account).where(Account.id == account_id, Account.deleted_at == None),
            Account,
        )
    )
    account = acc_result.scalars().first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    stmt = select(Basket).where(Basket.account_id == account_id)
    if status:
        stmt = stmt.where(Basket.status == status)
    if side:
        stmt = stmt.where(Basket.side == side)
    if symbol:
        stmt = stmt.where(Basket.symbol == symbol)
    if exit_reason:
        stmt = stmt.where(Basket.exit_reason == exit_reason)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar()

    stmt = stmt.order_by(Basket.opened_at.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(stmt)
    baskets = result.scalars().all()

    return {
        "items": [
            {
                "id": str(b.id),
                "symbol": b.symbol,
                "side": b.side,
                "status": b.status,
                "bo_price": float(b.bo_price) if b.bo_price else None,
                "bo_margin": float(b.bo_margin) if b.bo_margin else None,
                "leverage": b.leverage,
                "sos_filled": b.sos_filled,
                "avg_entry": float(b.avg_entry) if b.avg_entry is not None else None,
                "qty": float(b.qty) if b.qty is not None else None,
                "tp_price": float(b.tp_price) if b.tp_price is not None else None,
                "realized_pnl": float(b.realized_pnl) if b.realized_pnl is not None else None,
                "fees_paid": float(b.fees_paid) if b.fees_paid is not None else None,
                "exit_reason": b.exit_reason,
                "opened_at": b.opened_at.isoformat() if b.opened_at else None,
                "closed_at": b.closed_at.isoformat() if b.closed_at else None,
                "duration": _compute_duration(b.opened_at, b.closed_at),
            }
            for b in baskets
        ],
        "total": total,
        "page": page,
        "per_page": per_page,
    }


@router.get("/accounts/{account_id}/baskets/{basket_id}")
async def get_basket_forensics(
    account_id: UUID,
    basket_id: UUID,
    scope: TenantScope = Depends(get_tenant_scope),
    db: AsyncSession = Depends(get_db),
):
    """Basket forensics — full detail with order timeline."""
    # Verify account access
    acc_result = await db.execute(
        scope.filter_user_owned(
            select(Account).where(Account.id == account_id, Account.deleted_at == None),
            Account,
        )
    )
    if not acc_result.scalars().first():
        raise HTTPException(status_code=404, detail="Account not found")

    result = await db.execute(
        select(Basket).where(
            Basket.id == basket_id, Basket.account_id == account_id,
        ).options(selectinload(Basket.orders))
    )
    basket = result.scalars().first()
    if not basket:
        raise HTTPException(status_code=404, detail="Basket not found")

    orders = sorted(basket.orders, key=lambda o: o.placed_at or o.filled_at or basket.opened_at)

    return {
        "id": str(basket.id),
        "symbol": basket.symbol,
        "side": basket.side,
        "status": basket.status,
        "config_snapshot": basket.config_snapshot,
        "bo_price": float(basket.bo_price) if basket.bo_price is not None else None,
        "bo_margin": float(basket.bo_margin) if basket.bo_margin is not None else None,
        "leverage": basket.leverage,
        "grid_levels": basket.grid_levels,
        "sos_filled": basket.sos_filled,
        "avg_entry": float(basket.avg_entry) if basket.avg_entry is not None else None,
        "qty": float(basket.qty) if basket.qty is not None else None,
        "notional_total": float(basket.notional_total) if basket.notional_total is not None else None,
        "tp_target_usd": float(basket.tp_target_usd) if basket.tp_target_usd is not None else None,
        "tp_price": float(basket.tp_price) if basket.tp_price is not None else None,
        "liquidation_price": float(basket.liquidation_price) if basket.liquidation_price is not None else None,
        "realized_pnl": float(basket.realized_pnl) if basket.realized_pnl is not None else None,
        "funding_paid": float(basket.funding_paid) if basket.funding_paid is not None else None,
        "fees_paid": float(basket.fees_paid) if basket.fees_paid is not None else None,
        "exit_reason": basket.exit_reason,
        "opened_at": basket.opened_at.isoformat() if basket.opened_at else None,
        "closed_at": basket.closed_at.isoformat() if basket.closed_at else None,
        "duration": _compute_duration(basket.opened_at, basket.closed_at),
        "orders": [
            {
                "id": str(o.id),
                "role": o.role,
                "side": o.side,
                "type": o.type,
                "qty": float(o.qty) if o.qty is not None else None,
                "price": float(o.price) if o.price is not None else None,
                "status": o.status,
                "filled_qty": float(o.filled_qty) if o.filled_qty is not None else None,
                "avg_fill_price": float(o.avg_fill_price) if o.avg_fill_price is not None else None,
                "commission": float(o.commission) if o.commission is not None else None,
                "placed_at": o.placed_at.isoformat() if o.placed_at else None,
                "filled_at": o.filled_at.isoformat() if o.filled_at else None,
            }
            for o in orders
        ],
    }


@router.get("/accounts/{account_id}/orders")
async def list_orders(
    account_id: UUID,
    scope: TenantScope = Depends(get_tenant_scope),
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
):
    """List all orders for an account."""
    acc_result = await db.execute(
        scope.filter_user_owned(
            select(Account).where(Account.id == account_id, Account.deleted_at == None),
            Account,
        )
    )
    if not acc_result.scalars().first():
        raise HTTPException(status_code=404, detail="Account not found")

    stmt = select(Order).where(Order.account_id == account_id)
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar()

    stmt = stmt.order_by(Order.placed_at.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(stmt)
    orders = result.scalars().all()

    return {
        "items": [
            {
                "id": str(o.id),
                "basket_id": str(o.basket_id),
                "role": o.role,
                "side": o.side,
                "type": o.type,
                "qty": float(o.qty) if o.qty else None,
                "price": float(o.price) if o.price else None,
                "status": o.status,
                "filled_qty": float(o.filled_qty) if o.filled_qty else None,
                "avg_fill_price": float(o.avg_fill_price) if o.avg_fill_price else None,
                "commission": float(o.commission) if o.commission else None,
                "placed_at": o.placed_at.isoformat() if o.placed_at else None,
                "filled_at": o.filled_at.isoformat() if o.filled_at else None,
            }
            for o in orders
        ],
        "total": total,
        "page": page,
        "per_page": per_page,
    }


@router.get("/accounts/{account_id}/equity")
async def get_equity_history(
    account_id: UUID,
    scope: TenantScope = Depends(get_tenant_scope),
    db: AsyncSession = Depends(get_db),
    hours: int = Query(24, ge=1, le=720),
):
    """Get equity snapshots for charting."""
    from datetime import datetime, timedelta, timezone
    from app.models.equity_snapshot import EquitySnapshot

    acc_result = await db.execute(
        scope.filter_user_owned(
            select(Account).where(Account.id == account_id, Account.deleted_at == None),
            Account,
        )
    )
    if not acc_result.scalars().first():
        raise HTTPException(status_code=404, detail="Account not found")

    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    result = await db.execute(
        select(EquitySnapshot).where(
            EquitySnapshot.account_id == account_id,
            EquitySnapshot.recorded_at >= since,
        ).order_by(EquitySnapshot.recorded_at.asc())
    )
    snapshots = result.scalars().all()

    return [
        {
            "wallet_balance": float(s.wallet_balance),
            "total_equity": float(s.total_equity),
            "unrealized_pnl": float(s.unrealized_pnl),
            "margin_used": float(s.margin_used),
            "recorded_at": s.recorded_at.isoformat(),
        }
        for s in snapshots
    ]


@router.get("/accounts/{account_id}/pnl-summary")
async def get_pnl_summary(
    account_id: UUID,
    scope: TenantScope = Depends(get_tenant_scope),
    db: AsyncSession = Depends(get_db),
):
    """Aggregated PnL summary for an account."""
    acc_result = await db.execute(
        scope.filter_user_owned(
            select(Account).where(Account.id == account_id, Account.deleted_at == None),
            Account,
        )
    )
    if not acc_result.scalars().first():
        raise HTTPException(status_code=404, detail="Account not found")

    # Total PnL
    total_pnl = (await db.execute(
        select(func.coalesce(func.sum(Basket.realized_pnl), 0)).where(
            Basket.account_id == account_id, Basket.realized_pnl != None
        )
    )).scalar()

    total_fees = (await db.execute(
        select(func.coalesce(func.sum(Basket.fees_paid), 0)).where(
            Basket.account_id == account_id
        )
    )).scalar()

    total_funding = (await db.execute(
        select(func.coalesce(func.sum(Basket.funding_paid), 0)).where(
            Basket.account_id == account_id
        )
    )).scalar()

    # Exclude ERROR baskets from total — they are failed attempts, not real trades
    total_baskets = (await db.execute(
        select(func.count()).select_from(Basket).where(
            Basket.account_id == account_id,
            Basket.status != "ERROR",
        )
    )).scalar()

    error_baskets = (await db.execute(
        select(func.count()).select_from(Basket).where(
            Basket.account_id == account_id,
            Basket.status == "ERROR",
        )
    )).scalar()

    closed_baskets = (await db.execute(
        select(func.count()).select_from(Basket).where(
            Basket.account_id == account_id, Basket.status == "CLOSED"
        )
    )).scalar()

    winning_baskets = (await db.execute(
        select(func.count()).select_from(Basket).where(
            Basket.account_id == account_id,
            Basket.status == "CLOSED",
            Basket.realized_pnl > 0,
        )
    )).scalar()

    # External closure stats
    manual_close_count = (await db.execute(
        select(func.count()).select_from(Basket).where(
            Basket.account_id == account_id,
            Basket.exit_reason == "MANUAL_CLOSE",
        )
    )).scalar()

    liquidation_count = (await db.execute(
        select(func.count()).select_from(Basket).where(
            Basket.account_id == account_id,
            Basket.exit_reason.in_(["LIQUIDATION", "ADL"]),
        )
    )).scalar()

    risk_stop_count = (await db.execute(
        select(func.count()).select_from(Basket).where(
            Basket.account_id == account_id,
            Basket.exit_reason == "RISK_STOP",
        )
    )).scalar()

    return {
        "total_realized_pnl": float(total_pnl),
        "total_fees_paid": float(total_fees),
        "total_funding_paid": float(total_funding),
        "net_pnl": float(total_pnl) - float(total_fees) - float(total_funding),
        "total_baskets": total_baskets,
        "closed_baskets": closed_baskets,
        "error_baskets": error_baskets,
        "winning_baskets": winning_baskets,
        "win_rate": round(winning_baskets / closed_baskets * 100, 1) if closed_baskets > 0 else 0,
        "manual_close_count": manual_close_count,
        "risk_stop_count": risk_stop_count,
        "liquidation_count": liquidation_count,
    }


@router.get("/accounts/{account_id}/export.csv")
async def export_csv(
    account_id: UUID,
    scope: TenantScope = Depends(get_tenant_scope),
    db: AsyncSession = Depends(get_db),
):
    """Export baskets and orders as CSV."""
    from fastapi.responses import StreamingResponse
    import csv
    import io

    acc_result = await db.execute(
        scope.filter_user_owned(
            select(Account).where(Account.id == account_id, Account.deleted_at == None),
            Account,
        )
    )
    if not acc_result.scalars().first():
        raise HTTPException(status_code=404, detail="Account not found")

    result = await db.execute(
        select(Basket).where(Basket.account_id == account_id)
        .options(selectinload(Basket.orders))
        .order_by(Basket.opened_at.desc())
    )
    baskets = result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "basket_id", "symbol", "side", "status", "bo_price", "avg_entry",
        "qty", "tp_price", "realized_pnl", "fees_paid", "sos_filled",
        "opened_at", "closed_at", "exit_reason",
        "order_id", "order_role", "order_side", "order_type",
        "order_qty", "order_price", "order_status", "order_filled_qty",
        "order_avg_fill", "order_commission", "order_placed_at", "order_filled_at",
    ])

    for b in baskets:
        if b.orders:
            for o in b.orders:
                writer.writerow([
                    str(b.id), b.symbol, b.side, b.status,
                    b.bo_price, b.avg_entry, b.qty, b.tp_price,
                    b.realized_pnl, b.fees_paid, b.sos_filled,
                    b.opened_at, b.closed_at, b.exit_reason,
                    str(o.id), o.role, o.side, o.type,
                    o.qty, o.price, o.status, o.filled_qty,
                    o.avg_fill_price, o.commission, o.placed_at, o.filled_at,
                ])
        else:
            writer.writerow([
                str(b.id), b.symbol, b.side, b.status,
                b.bo_price, b.avg_entry, b.qty, b.tp_price,
                b.realized_pnl, b.fees_paid, b.sos_filled,
                b.opened_at, b.closed_at, b.exit_reason,
                "", "", "", "", "", "", "", "", "", "", "", "",
            ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=account_{account_id}_export.csv"},
    )
