import uuid
from datetime import datetime, timezone
from sqlalchemy import Numeric, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID

from app.models.base import Base


class AffiliateCommission(Base):
    """Records each affiliate commission earned from a referral's fee."""
    __tablename__ = "affiliate_commissions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    referrer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    referral_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    fee_tx_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("fee_transactions.id"), nullable=False
    )
    fee_amount: Mapped[float] = mapped_column(Numeric(24, 8), nullable=False)
    commission_pct: Mapped[float] = mapped_column(Numeric(8, 4), nullable=False)
    commission_amount: Mapped[float] = mapped_column(Numeric(24, 8), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
