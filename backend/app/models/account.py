import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, DateTime, ForeignKey, LargeBinary
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from app.models.base import Base
from app.core.enums import AccountStatus

class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("workspaces.id"), nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    exchange: Mapped[str] = mapped_column(String(50), nullable=False, default="BINANCE_FUTURES")
    status: Mapped[str] = mapped_column(String(50), nullable=False, default=AccountStatus.IDLE)
    auto_trade_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    api_key_encrypted: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    api_secret_encrypted: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    api_key_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    is_testnet: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    user = relationship("User", backref="accounts")
    workspace = relationship("Workspace", back_populates="accounts")
    settings = relationship("AccountSettings", back_populates="account", uselist=False, cascade="all, delete-orphan")
    settings_history = relationship("AccountSettingsHistory", back_populates="account", cascade="all, delete-orphan")
