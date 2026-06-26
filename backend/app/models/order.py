from sqlalchemy import Column, String, Numeric, ForeignKey, DateTime, text, BigInteger
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from datetime import datetime, timezone

from app.models.base import Base

class Order(Base):
    __tablename__ = "orders"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    basket_id = Column(UUID(as_uuid=True), ForeignKey("baskets.id", ondelete="CASCADE"), nullable=False, index=True)
    account_id = Column(UUID(as_uuid=True), ForeignKey("accounts.id"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    
    binance_order_id = Column(BigInteger)
    binance_client_order_id = Column(String, unique=True)
    
    role = Column(String, nullable=False) # e.g. BO, SO1, SO2, TP
    side = Column(String, nullable=False) # BUY, SELL
    type = Column(String, nullable=False) # MARKET, LIMIT
    
    qty = Column(Numeric(24, 8), nullable=False)
    price = Column(Numeric(24, 8))
    
    status = Column(String, nullable=False) # NEW, PARTIALLY_FILLED, FILLED, CANCELED, EXPIRED
    
    filled_qty = Column(Numeric(24, 8), default=0)
    avg_fill_price = Column(Numeric(24, 8))
    
    commission = Column(Numeric(24, 8), default=0)
    commission_asset = Column(String)
    
    placed_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    filled_at = Column(DateTime(timezone=True))
    
    raw_response = Column(JSONB)
    
    # Relationships
    basket = relationship("Basket", back_populates="orders")
    account = relationship("Account")
    user = relationship("User")
