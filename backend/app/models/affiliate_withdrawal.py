import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class AffiliateWithdrawal(Base):
    """Tracks affiliate commission withdrawal requests."""

    __tablename__ = "affiliate_withdrawals"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    amount: Mapped[float] = mapped_column(Numeric(24, 8), nullable=False)
    method: Mapped[str] = mapped_column(String(20), nullable=False)  # BINANCE_ID or TRC20
    wallet_address: Mapped[str] = mapped_column(
        String(255), nullable=False
    )  # Binance ID or TRC20 address
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="PENDING"
    )  # PENDING, APPROVED, REJECTED
    tx_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reject_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    admin_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
