"""Equity snapshot model — tracks account balance/equity over time."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Numeric, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class EquitySnapshot(Base):
    """Periodic snapshot of account balance and equity for charting."""

    __tablename__ = "equity_snapshots"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    wallet_balance: Mapped[float] = mapped_column(Numeric(24, 8), nullable=False)
    total_equity: Mapped[float] = mapped_column(Numeric(24, 8), nullable=False)
    unrealized_pnl: Mapped[float] = mapped_column(
        Numeric(24, 8), nullable=False, server_default=text("0")
    )
    margin_used: Mapped[float] = mapped_column(
        Numeric(24, 8), nullable=False, server_default=text("0")
    )
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    __table_args__ = (Index("ix_equity_snapshots_account_recorded", "account_id", "recorded_at"),)
