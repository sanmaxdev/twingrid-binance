"""Auth request/response schemas."""

from pydantic import BaseModel, EmailStr, Field


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=128)
    display_name: str | None = Field(None, min_length=1, max_length=100)
    invite_code: str = Field(..., min_length=1, max_length=20)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=128)
    totp_code: str | None = Field(None, max_length=6)
    remember_me: bool = False


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    otp: str = Field(..., min_length=6, max_length=6)
    new_password: str = Field(..., min_length=1, max_length=128)


class VerifyEmailRequest(BaseModel):
    email: EmailStr
    otp: str = Field(..., min_length=6, max_length=6)


class ResendVerificationRequest(BaseModel):
    email: EmailStr


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=128)
    new_password: str = Field(..., min_length=1, max_length=128)


class ChangeEmailRequest(BaseModel):
    new_email: EmailStr
    password: str  # Require password confirmation for email change


class TOTPSetupResponse(BaseModel):
    secret: str
    uri: str


class TOTPVerifyRequest(BaseModel):
    code: str
    secret: str | None = None
