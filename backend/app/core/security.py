import hashlib
import re
from datetime import UTC, datetime, timedelta
from typing import Any

import bcrypt
from cryptography.fernet import Fernet
from fastapi import HTTPException
from jose import jwt

from app.core.config import settings

fernet = Fernet(settings.MASTER_ENCRYPTION_KEY.encode())


def validate_password_strength(password: str) -> None:
    """Enforce password complexity rules. Raises HTTPException on failure."""
    if len(password) < settings.PASSWORD_MIN_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Password must be at least {settings.PASSWORD_MIN_LENGTH} characters",
        )
    if not re.search(r"[A-Z]", password):
        raise HTTPException(
            status_code=400, detail="Password must contain at least one uppercase letter"
        )
    if not re.search(r"[a-z]", password):
        raise HTTPException(
            status_code=400, detail="Password must contain at least one lowercase letter"
        )
    if not re.search(r"[0-9]", password):
        raise HTTPException(status_code=400, detail="Password must contain at least one digit")
    if not re.search(r'[!@#$%^&*(),.?":{}|<>\-_=+\[\]\\\/~`]', password):
        raise HTTPException(
            status_code=400, detail="Password must contain at least one special character"
        )


def _hash_for_bcrypt(password: str) -> bytes:
    # Hash with SHA256 and return hex digest to ensure it's always under 72 bytes
    return hashlib.sha256(password.encode("utf-8")).hexdigest().encode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(_hash_for_bcrypt(plain_password), hashed_password.encode("utf-8"))


def get_password_hash(password: str) -> str:
    salt = bcrypt.gensalt(rounds=settings.BCRYPT_COST)
    return bcrypt.hashpw(_hash_for_bcrypt(password), salt).decode("utf-8")


def create_access_token(subject: str | Any, expires_delta: timedelta = None) -> str:
    if expires_delta:
        expire = datetime.now(UTC) + expires_delta
    else:
        expire = datetime.now(UTC) + timedelta(minutes=settings.JWT_ACCESS_TTL_MINUTES)
    to_encode = {"exp": expire, "sub": str(subject), "type": "access"}
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET, algorithm="HS256")
    return encoded_jwt


def create_refresh_token(subject: str | Any, expires_delta: timedelta = None) -> str:
    if expires_delta:
        expire = datetime.now(UTC) + expires_delta
    else:
        expire = datetime.now(UTC) + timedelta(days=settings.JWT_REFRESH_TTL_DAYS)
    to_encode = {"exp": expire, "sub": str(subject), "type": "refresh"}
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET, algorithm="HS256")
    return encoded_jwt


def verify_token(token: str, token_type: str = "access") -> dict:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
        if payload.get("type") != token_type:
            return None
        return payload
    except jwt.JWTError:
        return None


def encrypt_totp_secret(secret: str) -> bytes:
    if not secret:
        return None
    return fernet.encrypt(secret.encode())


def decrypt_totp_secret(encrypted_secret: bytes) -> str:
    if not encrypted_secret:
        return None
    return fernet.decrypt(encrypted_secret).decode()


def encrypt_secret(secret: str) -> bytes | None:
    if not secret:
        return None
    return fernet.encrypt(secret.encode())


def decrypt_secret(encrypted_secret: bytes) -> str | None:
    if not encrypted_secret:
        return None
    return fernet.decrypt(encrypted_secret).decode()
