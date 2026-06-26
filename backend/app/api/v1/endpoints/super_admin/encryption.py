import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from cryptography.fernet import Fernet

from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.account import Account
from app.models.audit_log import AuditLog
from app.core.enums import Role
from app.core.security import decrypt_secret, encrypt_secret, decrypt_totp_secret

logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/rotate-encryption-key")
async def rotate_encryption_key(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if current_user.role != Role.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only super admins can rotate encryption keys")

    # Auto-generate a new key
    new_key = Fernet.generate_key()
    new_fernet = Fernet(new_key)

    try:
        # Rotate TOTP Secrets for Users
        users_result = await db.execute(select(User).where(User.totp_secret_encrypted.is_not(None)))
        users = users_result.scalars().all()
        rotated_users = 0
        for user in users:
            try:
                decrypted = decrypt_totp_secret(user.totp_secret_encrypted)
                if decrypted:
                    user.totp_secret_encrypted = new_fernet.encrypt(decrypted.encode())
                    rotated_users += 1
            except Exception as dec_err:
                logger.error(f"Failed to decrypt totp for user {user.id}: {dec_err}")

        # Rotate API Keys and Secrets for Accounts
        accounts_result = await db.execute(select(Account).where(Account.deleted_at.is_(None)))
        accounts = accounts_result.scalars().all()
        rotated_accounts = 0
        for account in accounts:
            try:
                dec_api = decrypt_secret(account.api_key_encrypted)
                dec_secret = decrypt_secret(account.api_secret_encrypted)
                if dec_api:
                    account.api_key_encrypted = new_fernet.encrypt(dec_api.encode())
                if dec_secret:
                    account.api_secret_encrypted = new_fernet.encrypt(dec_secret.encode())
                rotated_accounts += 1
            except Exception as dec_err:
                logger.error(f"Failed to decrypt api keys for account {account.id}: {dec_err}")

        # Audit Log
        audit = AuditLog(
            actor_user_id=current_user.id,
            action="ENCRYPTION_KEY_ROTATED",
            payload={"message": f"Rotated keys for {rotated_users} users and {rotated_accounts} accounts"}
        )
        db.add(audit)

        await db.commit()

        return {
            "status": "success",
            "new_key": new_key.decode(),
            "message": f"Encryption keys rotated successfully. Rotated {rotated_users} user secrets and {rotated_accounts} account credentials. IMPORTANT: Update MASTER_ENCRYPTION_KEY in your .env file with the new key and restart all services."
        }
    except Exception as e:
        await db.rollback()
        logger.exception("Failed to rotate encryption keys")
        raise HTTPException(status_code=500, detail="Key rotation failed")
