import uuid
from datetime import datetime
from typing import Optional, Any
from sqlalchemy import String, text, DateTime, ForeignKey, Boolean, Integer, BigInteger
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID, INET, JSONB
from app.models.base import Base

class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    actor_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    target_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    target_account_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True)) # no strict fkey right now to avoid schema cyclic deps before account model
    action: Mapped[str] = mapped_column(String, nullable=False)
    target: Mapped[Optional[str]] = mapped_column(String)
    payload: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB)
    impersonating: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    ip_address: Mapped[Optional[str]] = mapped_column(INET)
    user_agent: Mapped[Optional[str]] = mapped_column(String)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
