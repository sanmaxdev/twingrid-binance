import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class FeeTransaction(Base):
    """Records every fee deduction, deposit credit, and admin balance adjustment."""

    __tablename__ = "fee_transactions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    basket_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("baskets.id"), nullable=True
    )
    type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # FEE_DEDUCTION, DEPOSIT, ADMIN_CREDIT, ADMIN_DEBIT
    amount: Mapped[float] = mapped_column(
        Numeric(24, 8), nullable=False
    )  # positive = credit, negative = debit
    balance_before: Mapped[float] = mapped_column(Numeric(24, 8), nullable=False)
    balance_after: Mapped[float] = mapped_column(Numeric(24, 8), nullable=False)
    fee_percentage: Mapped[float | None] = mapped_column(Numeric(8, 4), nullable=True)
    basket_pnl: Mapped[float | None] = mapped_column(Numeric(24, 8), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
