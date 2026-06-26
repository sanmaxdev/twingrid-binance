from datetime import UTC, datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, Numeric, String, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from app.models.base import Base


class Basket(Base):
    __tablename__ = "baskets"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    account_id = Column(UUID(as_uuid=True), ForeignKey("accounts.id"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)

    symbol = Column(String, nullable=False)
    side = Column(String, nullable=False)  # LONG|SHORT
    status = Column(String, nullable=False)  # Will use BasketStatus enum strings

    config_snapshot = Column(JSONB, nullable=False)

    bo_price = Column(Numeric(24, 8), nullable=False)
    bo_margin = Column(Numeric(24, 8), nullable=False)
    leverage = Column(Integer, nullable=False)

    grid_levels = Column(JSONB, nullable=False)

    sos_filled = Column(Integer, nullable=False, default=0)
    avg_entry = Column(Numeric(24, 8))
    qty = Column(Numeric(24, 8))
    notional_total = Column(Numeric(24, 8))

    tp_target_usd = Column(Numeric(24, 8), nullable=False)
    tp_price = Column(Numeric(24, 8))
    liquidation_price = Column(Numeric(24, 8))

    realized_pnl = Column(Numeric(24, 8))
    funding_paid = Column(Numeric(24, 8), default=0)
    fees_paid = Column(Numeric(24, 8), default=0)

    exit_reason = Column(String)

    opened_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))
    closed_at = Column(DateTime(timezone=True))

    # Relationships
    account = relationship("Account", backref="baskets")
    user = relationship("User", backref="baskets")
    orders = relationship("Order", back_populates="basket", cascade="all, delete-orphan")
