from pydantic import BaseModel, Field, model_validator
from uuid import UUID
from datetime import datetime
from typing import Optional, Any, Literal

from app.core.enums import AccountStatus


# Allowed config keys for strategy settings (whitelist approach)
ALLOWED_CONFIG_KEYS = {
    "active_symbol", "active_symbols", "margin_type", "margin_mode", "leverage",
    "sizing_mode", "base_order_usd", "base_order_pct",
    "compounding_enabled", "compounding_pct", "initial_capital",
    "max_safety_orders", "take_profit_pct", "tp_mode", "tp_fixed_amount",
    "volume_scale", "step_scale",
    "rsi_long_threshold", "rsi_short_threshold", "signal_threshold",
    "allow_long", "allow_short",
    "max_basket_age_hours",
    "trend_filter_enabled", "trend_timeframes", "trend_mode",
    "trend_ema_fast", "trend_ema_slow",
    # Risk controller
    "risk_controller_enabled", "rc_max_so_trigger",
    "rc_margin_usage_pct", "rc_max_basket_loss_pct",
    "rc_max_basket_loss_usd", "rc_loss_mode", "rc_loss_direction",
    "rc_margin_guard_enabled",
}


class AccountBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    is_testnet: bool = True
    exchange: str = "BINANCE_FUTURES"


class AccountCreate(AccountBase):
    api_key: str = Field(..., min_length=10, max_length=256)
    api_secret: str = Field(..., min_length=10, max_length=256)


class AccountUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    api_key: Optional[str] = Field(None, min_length=10, max_length=256)
    api_secret: Optional[str] = Field(None, min_length=10, max_length=256)
    # Note: status removed intentionally — status changes must go through
    # dedicated endpoints (/start, /stop, /emergency-close) which enforce
    # platform trading checks


class AccountSettingsBase(BaseModel):
    config: dict[str, Any]


class AccountSettingsResponse(AccountSettingsBase):
    account_id: UUID
    version: int
    updated_at: datetime
    updated_by: Optional[UUID] = None

    class Config:
        from_attributes = True


class AccountResponse(AccountBase):
    id: UUID
    workspace_id: UUID
    user_id: UUID
    status: AccountStatus
    auto_trade_enabled: bool = False
    created_at: datetime
    updated_at: datetime
    
    settings: Optional[AccountSettingsResponse] = None

    class Config:
        from_attributes = True


class ConnectionTestRequest(BaseModel):
    api_key: str = Field(..., min_length=10, max_length=256)
    api_secret: str = Field(..., min_length=10, max_length=256)
    is_testnet: bool = True


class AccountSettingsUpdate(BaseModel):
    config: dict[str, Any]

    @model_validator(mode="after")
    def validate_config_keys(self):
        """Only allow known strategy config keys to prevent injection."""
        unknown = set(self.config.keys()) - ALLOWED_CONFIG_KEYS
        if unknown:
            raise ValueError(f"Unknown config keys: {', '.join(sorted(unknown))}")
        # Validate value ranges for critical fields
        if "leverage" in self.config:
            lev = self.config["leverage"]
            if not isinstance(lev, (int, float)) or lev < 1 or lev > 125:
                raise ValueError("leverage must be between 1 and 125")
        if "max_safety_orders" in self.config:
            mso = self.config["max_safety_orders"]
            if not isinstance(mso, int) or mso < 0 or mso > 20:
                raise ValueError("max_safety_orders must be between 0 and 20")
        if "take_profit_pct" in self.config:
            tp = self.config["take_profit_pct"]
            if not isinstance(tp, (int, float)) or tp < 0.01 or tp > 100:
                raise ValueError("take_profit_pct must be between 0.01 and 100")
        return self


class AutoTradeToggle(BaseModel):
    enabled: bool


class PlatformSettingsResponse(BaseModel):
    trading_enabled: bool
