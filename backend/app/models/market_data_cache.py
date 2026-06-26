"""Market data cache — stores pre-downloaded klines and funding rates from Binance."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import BigInteger, DateTime, Index, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class MarketDataCache(Base):
    """
    Stores monthly chunks of market data for offline backtest usage.

    Data types:
      - 'klines': OHLCV candle data
      - 'funding_rate': Historical funding rate snapshots

    Intervals (for klines): '1m', '5m', '15m', '1h', '4h', '1d'
    Intervals (for funding_rate): '8h' (fixed — Binance funding period)
    """

    __tablename__ = "market_data_cache"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    symbol: Mapped[str] = mapped_column(String(20), nullable=False)
    data_type: Mapped[str] = mapped_column(String(20), nullable=False)  # 'klines' or 'funding_rate'
    interval: Mapped[str] = mapped_column(String(10), nullable=False)  # '1m', '5m', '1h', etc.

    # Monthly chunk boundaries (UTC)
    year_month: Mapped[str] = mapped_column(String(7), nullable=False)  # e.g. '2024-01'
    date_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    date_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # The actual data — array of candle/rate objects
    data: Mapped[dict] = mapped_column(JSONB, nullable=False)

    # Metadata
    candle_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    file_size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    downloaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    __table_args__ = (
        # Unique constraint: one chunk per symbol+type+interval+month
        Index(
            "uq_market_data_chunk",
            "symbol",
            "data_type",
            "interval",
            "year_month",
            unique=True,
        ),
        # Fast lookups by symbol + interval for backtest queries
        Index("ix_market_data_lookup", "symbol", "data_type", "interval"),
    )
