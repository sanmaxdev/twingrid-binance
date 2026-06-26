<p align="center">
  <h1 align="center">⚡ TWIN GRID</h1>
  <p align="center">
    Enterprise-grade autonomous grid trading platform for Binance USDT-M Futures
    <br />
    <a href="#quickstart"><strong>Get Started »</strong></a>
    ·
    <a href="#architecture"><strong>Architecture »</strong></a>
    ·
    <a href="docs/RUNBOOK.md"><strong>Runbook »</strong></a>
  </p>
</p>

---

## Overview

**TWIN GRID** is a self-hosted, multi-tenant SaaS platform that runs the TWIN GRID v2.0 adaptive grid trading strategy autonomously across multiple Binance Futures accounts. It features a modern Next.js dashboard, real-time equity tracking, workspace-based account organization, and enterprise security controls.

### Key Features

| Feature | Description |
|---|---|
| 🤖 **Autonomous Grid Bot** | Adaptive grid strategy with volatility-based spacing, ATR indicators, and auto-rebalancing |
| 📊 **Real-Time Dashboard** | Live wallet balance, PnL tracking, equity charts, and account sparklines |
| 🏢 **Multi-Tenant Workspaces** | Organize trading accounts into workspaces with instant context switching |
| 🔐 **Enterprise Security** | AES-256 API key encryption, JWT auth, RBAC, rate limiting, and full audit logging |
| 📈 **Equity Analytics** | Time-series equity history with interactive charts and performance metrics |
| 🛡️ **Risk Management** | Per-account drawdown limits, position size caps, and automatic kill switches |
| 🔄 **Trade Reconciliation** | Automatic order reconciliation between local state and Binance |
| 👤 **Onboarding Wizard** | Guided 4-step setup for first-time users |
| 🛠️ **Super Admin Panel** | Platform-wide user management, metrics, audit logs, and encryption controls |

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Python 3.11, FastAPI, SQLAlchemy 2.0, Alembic |
| **Frontend** | Next.js 14, TypeScript, Tailwind CSS, shadcn/ui, Recharts |
| **Database** | PostgreSQL 15 |
| **Cache / Queue** | Redis 7, Celery |
| **Deployment** | Docker Compose, Caddy (reverse proxy) |
| **CI/CD** | GitHub Actions |

---

## Project Structure

```
twingrid-binance/
├── backend/
│   ├── app/
│   │   ├── api/v1/endpoints/    # REST API routes (auth, accounts, workspaces, history, admin)
│   │   ├── core/                # Config, security, database, rate limiting, Redis
│   │   ├── models/              # SQLAlchemy ORM models
│   │   ├── schemas/             # Pydantic request/response schemas
│   │   ├── services/            # Business logic (grid bot, risk manager, reconciler, audit)
│   │   ├── strategy/            # Trading strategy (grid, indicators, liquidation, state machine)
│   │   ├── tasks/               # Celery async tasks (equity snapshots, trading loops)
│   │   └── main.py              # FastAPI application entry point
│   ├── alembic/                 # Database migrations
│   ├── tests/                   # Test suite
│   └── Dockerfile
├── frontend/
│   ├── app/
│   │   ├── auth/                # Login & registration pages
│   │   ├── dashboard/           # Main dashboard, accounts, workspaces, profile, guide
│   │   ├── admin/               # Super admin panel (users, accounts, metrics, audit, events)
│   │   └── page.tsx             # Landing page
│   ├── components/ui/           # Reusable UI components (shadcn/ui)
│   ├── lib/                     # API client, services, utilities
│   └── Dockerfile
├── docs/                        # Architecture, Security, Runbook, Changelog, Admin Handbook
├── scripts/                     # Deployment scripts
├── docker-compose.yml           # Development environment
├── docker-compose.prod.yml      # Production environment
├── Caddyfile                    # Reverse proxy configuration
└── .github/workflows/           # CI/CD pipelines
```

---

## Quickstart

### Prerequisites

- Docker & Docker Compose
- Binance account with USDT-M Futures API keys

### 1. Clone & Configure

```bash
git clone https://github.com/sanmaxdev/twingrid-binance.git
cd twingrid-binance
cp .env.example .env
```

Edit `.env` with your configuration. The key values to set:

```env
# Database
POSTGRES_PASSWORD=change_me_to_a_strong_random_password
DATABASE_URL=postgresql+asyncpg://app:change_me_to_a_strong_random_password@db:5432/twin_grid

# Cache / Queue
REDIS_URL=redis://redis:6379/0

# Security
JWT_SECRET=replace_with_a_64_byte_random_string
# Generate: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
MASTER_ENCRYPTION_KEY=

# Binance API keys are added per-account via the dashboard and
# encrypted at rest — they are never stored in .env.
```

See [.env.example](.env.example) for the full list of configurable variables.

### 2. Start Services

```bash
# Development
docker compose up -d

# Production (with Caddy reverse proxy)
docker compose -f docker-compose.prod.yml up -d
```

### 3. Access the Dashboard

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| API Docs (Swagger) | http://localhost:8000/docs |

### 4. First-Time Setup

1. Register a new account at `/auth/register`
2. Complete the onboarding wizard
3. Connect your Binance API credentials
4. Configure grid strategy parameters
5. Start trading

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                    Caddy (HTTPS)                     │
├────────────────────┬─────────────────────────────────┤
│   Next.js 14       │       FastAPI                   │
│   Dashboard UI     │       REST API                  │
│   :3000            │       :8000                     │
├────────────────────┴─────────────────────────────────┤
│                                                      │
│  ┌─────────┐  ┌─────────┐  ┌──────────────────────┐ │
│  │ Celery  │  │  Redis   │  │    PostgreSQL 15     │ │
│  │ Workers │◄─│  Queue   │  │  (encrypted at rest) │ │
│  │ + Beat  │  │  + Cache │  │                      │ │
│  └────┬────┘  └─────────┘  └──────────────────────┘ │
│       │                                              │
│       ▼                                              │
│  ┌─────────────────────┐                             │
│  │   Binance Futures   │                             │
│  │   WebSocket + REST  │                             │
│  └─────────────────────┘                             │
└──────────────────────────────────────────────────────┘
```

### Core Services

| Service | Responsibility |
|---|---|
| `grid_bot.py` | Main trading loop — places/cancels grid orders |
| `risk_manager.py` | Enforces drawdown limits and position size caps |
| `reconciler.py` | Syncs local order state with Binance exchange |
| `audit_service.py` | Logs all sensitive actions for compliance |
| `binance_client.py` | Encrypted API key management and Binance SDK wrapper |
| `equity_task.py` | Periodic equity snapshots for historical charts |

---

## Dashboard Pages

| Route | Description |
|---|---|
| `/dashboard` | Overview — aggregated stats, equity chart, quick actions |
| `/dashboard/accounts` | Connected Binance accounts with PnL sparklines |
| `/dashboard/accounts/[id]` | Account detail — bot controls, settings, risk parameters |
| `/dashboard/accounts/[id]/history` | Equity history with interactive time-range chart |
| `/dashboard/workspaces` | Create/manage workspaces for account organization |
| `/dashboard/profile` | User profile and session management |
| `/dashboard/guide` | Getting started documentation |
| `/admin` | Super admin — platform metrics, user management, audit logs |

---

## Security

- **API Key Encryption**: AES-256-GCM encryption at rest via `cryptography` library
- **Authentication**: JWT access + refresh tokens with secure httpOnly cookies
- **Authorization**: Role-based access control (User, Admin, Super Admin)
- **Rate Limiting**: Per-endpoint rate limiting with Redis-backed sliding window
- **Audit Logging**: All sensitive operations logged with user, IP, and timestamp
- **Tenant Isolation**: Workspace-scoped queries prevent cross-tenant data access
- **Input Validation**: Pydantic schema validation on all API endpoints

See [SECURITY.md](docs/SECURITY.md) for the full security model.

---

## API Overview

All endpoints are prefixed with `/api/v1/`.

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/auth/register` | Register new user |
| `POST` | `/auth/login` | Authenticate and receive tokens |
| `GET` | `/me` | Current user profile |
| `GET` | `/accounts/` | List accounts in active workspace |
| `POST` | `/accounts/` | Connect new Binance account |
| `GET` | `/accounts/{id}/dashboard` | Account metrics (balance, PnL) |
| `POST` | `/accounts/{id}/start` | Start grid bot |
| `POST` | `/accounts/{id}/stop` | Stop grid bot |
| `GET` | `/history/{id}/equity` | Equity time-series data |
| `GET` | `/workspaces/` | List user workspaces |
| `POST` | `/workspaces/` | Create workspace |

Full interactive docs available at `/docs` (Swagger UI).

---

## Development

### Backend (without Docker)

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate   # Windows
pip install -e ".[dev]"
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

### Frontend (without Docker)

```bash
cd frontend
npm install
npm run dev
```

### Running Tests

```bash
cd backend
pytest -v
```

---

## Documentation

| Document | Description |
|---|---|
| [Architecture](docs/ARCHITECTURE.md) | System design and component overview |
| [Security](docs/SECURITY.md) | Security model and threat mitigation |
| [Runbook](docs/RUNBOOK.md) | Operational procedures and troubleshooting |
| [Admin Handbook](docs/ADMIN_HANDBOOK.md) | Super admin guide |
| [Changelog](docs/CHANGELOG.md) | Version history |

---

## Contributing

Contributions are welcome! Please read the **[Contributing Guide](CONTRIBUTING.md)** before
opening a pull request, and note our **[Code of Conduct](CODE_OF_CONDUCT.md)**. Open an issue
to discuss substantial changes first. Run the test suite (`pytest -v` in `backend/`) and lint
the frontend (`npm run lint` in `frontend/`) before submitting.

Found a security issue? Please report it privately — see our **[Security Policy](.github/SECURITY.md)**.

---

## ⚠️ Disclaimer

**This software is provided for educational and informational purposes only and is _not_
financial advice.** Trading cryptocurrency futures involves substantial risk of loss and is
not suitable for every investor. Leverage can work against you as well as for you.

- You are solely responsible for any trading activity conducted with this software.
- Always test thoroughly on **Binance Testnet** before connecting live API keys.
- Use API keys **without withdrawal permissions**.
- The authors and contributors accept **no liability** for any financial losses, damages, or
  account actions resulting from the use of this software.

Use at your own risk.

---

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  Built with ⚡ by <a href="https://github.com/sanmaxdev">sanmaxdev</a>
</p>
