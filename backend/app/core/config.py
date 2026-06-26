from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    APP_ENV: str = "development"
    APP_DEBUG: bool = True
    APP_NAME: str = "TWIN GRID Console"

    DATABASE_URL: str
    REDIS_URL: str

    NEXT_PUBLIC_API_BASE_URL: str = "http://localhost:3000/api/v1"
    FRONTEND_URL: str = "http://localhost:3000"

    # Binance API
    BINANCE_TESTNET_BASE_URL: str = "https://testnet.binancefuture.com"
    BINANCE_LIVE_BASE_URL: str = "https://fapi.binance.com"
    BINANCE_DEMO_BASE_URL: str = "https://demo-fapi.binance.com"

    # Binance WebSocket (User Data Streams)
    BINANCE_WS_LIVE_URL: str = "wss://fstream.binance.com"
    BINANCE_WS_TESTNET_URL: str = "wss://fstream.binancefuture.com"

    # Security
    JWT_SECRET: str
    JWT_ACCESS_TTL_MINUTES: int = 15
    JWT_REFRESH_TTL_DAYS: int = 30
    MASTER_ENCRYPTION_KEY: str
    PASSWORD_MIN_LENGTH: int = 12
    BCRYPT_COST: int = 12

    # Email (SMTP)
    SMTP_HOST: str = "mailpit"
    SMTP_PORT: int = 1025
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    SMTP_FROM_EMAIL: str = "noreply@example.com"
    SMTP_FROM_NAME: str = "TWIN GRID Console"
    SMTP_USE_TLS: bool = False

    # Public base URL of the deployment (used in emails, referral links, CSP)
    APP_PUBLIC_URL: str = "http://localhost"

    # Extra CORS origins, comma-separated (FRONTEND_URL and APP_PUBLIC_URL are
    # always allowed). Example: "https://app.example.com,https://example.com"
    CORS_ORIGINS: str = ""

    # Resend API (production email)
    RESEND_API_KEY: str | None = None
    EMAIL_FROM: str = "Twin Grid <noreply@example.com>"

    # Telegram Notifications
    TELEGRAM_BOT_TOKEN: str | None = None
    TELEGRAM_CHAT_ID: str | None = None
    TELEGRAM_WEBHOOK_SECRET: str = "twingrid-tg-webhook"

    # Bootstrap (used only on first start)
    BOOTSTRAP_SUPER_ADMIN_EMAIL: str | None = None
    BOOTSTRAP_SUPER_ADMIN_PASSWORD: str | None = None

    # Gemini AI (Strategy Tuner)
    GEMINI_API_KEY: str | None = None
    GEMINI_MODEL: str = "gemini-2.5-flash"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()
