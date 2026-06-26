"""Pydantic schemas for fee/wallet API request and response models."""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field
from uuid import UUID


# ── Request schemas ──

class DepositSubmitRequest(BaseModel):
    amount: float = Field(..., gt=0, description="Deposit amount in USDT")
    tx_hash: str = Field(..., min_length=64, max_length=66, pattern=r'^(0x)?[a-fA-F0-9]{64}$', description="Transaction hash")


class DepositReviewRequest(BaseModel):
    reject_reason: Optional[str] = Field(None, max_length=500)


class BalanceAdjustRequest(BaseModel):
    amount: float = Field(..., description="Positive = credit, negative = debit")
    note: str = Field(..., min_length=1, max_length=500, description="Reason for adjustment")


class FeeSettingsUpdateRequest(BaseModel):
    fee_percentage: Optional[float] = Field(None, ge=0, le=100)
    deposit_address: Optional[str] = Field(None, max_length=255)
    min_deposit: Optional[float] = Field(None, ge=0)
    min_balance_multiplier: Optional[float] = Field(None, ge=1, le=10)
    fee_enabled: Optional[bool] = None


class UserFeeOverrideRequest(BaseModel):
    fee_percentage_override: Optional[float] = Field(None, ge=0, le=100, description="Set to null to use global rate")


# ── Response schemas ──

class WalletBalanceResponse(BaseModel):
    balance: float
    minimum_required: float
    is_sufficient: bool
    fee_percentage: float
    fee_enabled: bool


class WalletSummaryResponse(BaseModel):
    balance: float
    total_deposited: float
    total_fees_paid: float
    pending_deposits: int
    fee_percentage: float


class FeeTransactionResponse(BaseModel):
    id: str
    user_id: str
    basket_id: Optional[str]
    type: str
    amount: float
    balance_before: float
    balance_after: float
    fee_percentage: Optional[float]
    basket_pnl: Optional[float]
    note: Optional[str]
    created_at: str
    created_by: Optional[str]


class DepositRequestResponse(BaseModel):
    id: str
    user_id: str
    user_email: Optional[str] = None
    amount: float
    tx_hash: str
    status: str
    reviewed_by: Optional[str]
    reviewed_at: Optional[str]
    reject_reason: Optional[str]
    created_at: str


class FeeSettingsResponse(BaseModel):
    fee_percentage: float
    deposit_address: str
    min_deposit: float
    min_balance_multiplier: float
    fee_enabled: bool


class FeeDashboardResponse(BaseModel):
    total_fees_collected: float
    total_deposits: float
    pending_deposit_count: int
    pending_deposit_amount: float
    active_users_with_balance: int
    total_negative_balances: float
