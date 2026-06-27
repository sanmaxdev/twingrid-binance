<div align="center">

# ⚡ TWIN GRID

### Open-source, self-hosted grid trading bot for Binance USDT-M Futures

A full-stack FastAPI and Next.js platform that runs an adaptive grid strategy autonomously across multiple Binance Futures accounts, with a real-time dashboard, backtesting, multi-account workspaces, and enterprise-grade security.

<p>
  <a href="https://twingridbot.com"><strong>🌐 Live Demo</strong></a>
  ·
  <a href="#-quickstart"><strong>Quickstart</strong></a>
  ·
  <a href="#-documentation"><strong>Docs</strong></a>
  ·
  <a href="#-contributing"><strong>Contributing</strong></a>
  ·
  <a href="https://github.com/sanmaxdev/twingrid-binance/issues/new/choose"><strong>Report a Bug</strong></a>
</p>

[![CI](https://github.com/sanmaxdev/twingrid-binance/actions/workflows/ci.yml/badge.svg)](https://github.com/sanmaxdev/twingrid-binance/actions/workflows/ci.yml)
[![CodeQL](https://github.com/sanmaxdev/twingrid-binance/actions/workflows/codeql.yml/badge.svg)](https://github.com/sanmaxdev/twingrid-binance/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

![Python](https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-14-000000?logo=next.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169E1?logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)

</div>

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Quickstart](#-quickstart)
- [Architecture](#-architecture)
- [Project Structure](#-project-structure)
- [Security](#-security)
- [API Overview](#-api-overview)
- [Development](#-development)
- [Documentation](#-documentation)
- [Contributing](#-contributing)
- [Disclaimer](#%EF%B8%8F-disclaimer)
- [License](#-license)

---

## 🔭 Overview

**TWIN GRID** is a self-hosted, multi-tenant platform that runs an adaptive grid trading
strategy autonomously across multiple Binance USDT-M Futures accounts. It pairs a robust
Python trading engine with a modern Next.js dashboard, giving you live equity tracking,
workspace-based account organization, and enterprise security controls in one package.

> If you find this project useful, please consider giving it a ⭐. It helps others discover it.

---

## ✨ Features

| Feature | Description |
|---|---|
| 🤖 **Autonomous Grid Bot** | Adaptive grid strategy with volatility-based spacing, ATR indicators, and auto-rebalancing |
| 📊 **Real-Time Dashboard** | Live wallet balance, PnL tracking, equity charts, and account sparklines |
| 🏢 **Multi-Tenant Workspaces** | Organize trading accounts into workspaces with instant context switching |
| 🔐 **Enterprise Security** | AES-256 API key encryption, JWT auth, RBAC, rate limiting, and full audit logging |
| 📈 **Equity Analytics** | Time-series equity history with interactive charts and performance metrics |
| 🛡️ **Risk Management** | Per-account drawdown limits, position size caps, and automatic kill switches |
| 🔄 **Trade Reconciliation** | Automatic order reconciliation between local state and Binance |
| 🧪 **Backtesting** | Replay strategies against historical market data before going live |
| 👤 **Onboarding Wizard** | Guided setup flow for first-time users |
| 🛠️ **Super Admin Panel** | Platform-wide user management, metrics, audit logs, and encryption controls |

---

## 🧱 Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Python 3.11, FastAPI, SQLAlchemy 2.0, Alembic |
| **Frontend** | Next.js 14, TypeScript, Tailwind CSS, shadcn/ui, Recharts |
| **Database** | PostgreSQL 15 |
| **Cache / Queue** | Redis 7, Celery |
| **Deployment** | Docker Compose, Caddy (reverse proxy) |
| **CI/CD** | GitHub Actions, CodeQL, Dependabot |

---

## 🚀 Quickstart

### Prerequisites

- Docker and Docker Compose
- A Binance account with USDT-M Futures API keys

### 1. Clone and configure

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
# Generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
MASTER_ENCRYPTION_KEY=
```

> Binance API keys are added per-account through the dashboard and encrypted at rest. They are
> never stored in `.env`. See [.env.example](.env.example) for the full list of variables.

### 2. Start the services

```bash
# Development
docker compose up -d

# Production (with the Caddy reverse proxy)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### 3. Open the dashboard

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| API Docs (Swagger) | http://localhost:8000/docs |

### 4. First-time setup

1. Register a new account at `/auth/register`
2. Complete the onboarding wizard
3. Connect your Binance API credentials (start on **Testnet**)
4. Configure your grid strategy parameters
5. Start trading

---

## 🏗 Architecture

```
┌──────────────────────────────────────────────────────┐
│                     Caddy (HTTPS)                    │
├────────────────────┬─────────────────────────────────┤
│   Next.js 14       │        FastAPI                  │
│   Dashboard UI     │        REST API                 │
│   :3000            │        :8000                    │
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

### Core services

| Service | Responsibility |
|---|---|
| `grid_bot.py` | Main trading loop that places and cancels grid orders |
| `risk_manager.py` | Enforces drawdown limits and position size caps |
| `reconciler.py` | Syncs local order state with the Binance exchange |
| `audit_service.py` | Logs all sensitive actions for compliance |
| `binance_client.py` | Encrypted API key management and Binance SDK wrapper |
| `equity_task.py` | Periodic equity snapshots for historical charts |

---

## 📁 Project Structure

```
twingrid-binance/
├── backend/
│   ├── app/
│   │   ├── api/v1/endpoints/    # REST API routes (auth, accounts, workspaces, history, admin)
│   │   ├── core/               # Config, security, database, rate limiting, Redis
│   │   ├── models/             # SQLAlchemy ORM models
│   │   ├── schemas/            # Pydantic request/response schemas
│   │   ├── services/           # Business logic (grid bot, risk manager, reconciler, audit)
│   │   ├── strategy/           # Trading strategy (grid, indicators, liquidation, state machine)
│   │   ├── tasks/              # Celery async tasks (equity snapshots, trading loops)
│   │   └── main.py             # FastAPI application entry point
│   ├── alembic/                # Database migrations
│   ├── tests/                  # Test suite
│   └── Dockerfile
├── frontend/
│   ├── app/
│   │   ├── auth/               # Login and registration pages
│   │   ├── dashboard/          # Main dashboard, accounts, workspaces, profile, guide
│   │   ├── admin/              # Super admin panel (users, accounts, metrics, audit, events)
│   │   └── page.tsx            # Landing page
│   ├── components/             # Reusable UI components (shadcn/ui)
│   ├── lib/                    # API client, services, utilities
│   └── Dockerfile
├── docs/                       # Architecture, Security, Runbook, Changelog, Admin Handbook
├── scripts/                    # Deployment and operations scripts
├── docker-compose.yml          # Development environment
├── docker-compose.prod.yml     # Production overrides
├── Caddyfile                   # Reverse proxy configuration
└── .github/                    # CI/CD workflows, issue templates, security policy
```

---

## 🔐 Security

- **API Key Encryption:** AES-256 encryption at rest via the `cryptography` library
- **Authentication:** JWT access and refresh tokens with secure httpOnly cookies
- **Authorization:** Role-based access control (User, Admin, Super Admin)
- **Rate Limiting:** Per-endpoint limits backed by a Redis sliding window
- **Audit Logging:** Sensitive operations logged with user, IP, and timestamp
- **Tenant Isolation:** Workspace-scoped queries prevent cross-tenant data access
- **Input Validation:** Pydantic schema validation on every API endpoint
- **Automated Scanning:** CodeQL, secret scanning, and dependency review run on every push and PR

See [docs/SECURITY.md](docs/SECURITY.md) for the full security model, and
[.github/SECURITY.md](.github/SECURITY.md) to report a vulnerability privately.

---

## 🔌 API Overview

All endpoints are prefixed with `/api/v1/`.

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/auth/register` | Register a new user |
| `POST` | `/auth/login` | Authenticate and receive tokens |
| `GET` | `/me` | Current user profile |
| `GET` | `/accounts/` | List accounts in the active workspace |
| `POST` | `/accounts/` | Connect a new Binance account |
| `GET` | `/accounts/{id}/dashboard` | Account metrics (balance, PnL) |
| `POST` | `/accounts/{id}/start` | Start the grid bot |
| `POST` | `/accounts/{id}/stop` | Stop the grid bot |
| `GET` | `/history/{id}/equity` | Equity time-series data |
| `GET` | `/workspaces/` | List user workspaces |
| `POST` | `/workspaces/` | Create a workspace |

Full interactive docs are available at `/docs` (Swagger UI).

---

## 💻 Development

### Backend (without Docker)

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

Lint and format the backend with `ruff check app` and `ruff format app`.

### Frontend (without Docker)

```bash
cd frontend
npm install
npm run dev
```

Lint the frontend with `npm run lint`.

### Running tests

```bash
cd backend
pytest -v
```

---

## 📚 Documentation

| Document | Description |
|---|---|
| [Architecture](docs/ARCHITECTURE.md) | System design and component overview |
| [Security](docs/SECURITY.md) | Security model and threat mitigation |
| [Runbook](docs/RUNBOOK.md) | Operational procedures and troubleshooting |
| [Admin Handbook](docs/ADMIN_HANDBOOK.md) | Super admin guide |
| [Changelog](docs/CHANGELOG.md) | Version history |

---

## 🤝 Contributing

Contributions are welcome and appreciated. Please read the
**[Contributing Guide](CONTRIBUTING.md)** and our **[Code of Conduct](CODE_OF_CONDUCT.md)**
before opening a pull request.

### 🌱 New here? Start with these

- Browse [**good first issues**](https://github.com/sanmaxdev/twingrid-binance/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) for newcomer-friendly tasks
- Check [**help wanted**](https://github.com/sanmaxdev/twingrid-binance/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22) for larger pieces
- Have a question or idea? Open a [**Discussion**](https://github.com/sanmaxdev/twingrid-binance/discussions)

Run the backend tests (`pytest -v`) and the linters before submitting. Found a security issue?
Please report it privately via our [Security Policy](.github/SECURITY.md).

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

## 📄 License

Distributed under the MIT License. See [LICENSE](LICENSE) for details.

---

<div align="center">
  Built with ⚡ by <a href="https://github.com/sanmaxdev">sanmaxdev</a>
  <br />
  <sub>If this project helped you, consider leaving a ⭐</sub>
</div>
