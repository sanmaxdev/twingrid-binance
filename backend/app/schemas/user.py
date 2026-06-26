from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict, EmailStr, Field

class UserBase(BaseModel):
    email: EmailStr
    display_name: str | None = Field(None, min_length=1, max_length=100)

class UserCreate(UserBase):
    password: str
    invite_code: str

class UserUpdate(BaseModel):
    display_name: str | None = Field(None, min_length=1, max_length=100)
    # Cannot change email directly for security

class UserResponse(UserBase):
    id: UUID
    role: str
    is_active: bool
    is_email_verified: bool
    totp_enabled: bool = False
    invite_code: str
    created_at: datetime
    updated_at: datetime
    last_login_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)
