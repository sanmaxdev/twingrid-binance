# Contributing to TWIN GRID

First off — thank you for taking the time to contribute! 🎉

This document explains how to set up your environment, the standards we follow, and how to
submit changes. By participating, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

---

## Table of Contents

- [Ways to Contribute](#ways-to-contribute)
- [Development Setup](#development-setup)
- [Branching & Commits](#branching--commits)
- [Code Style](#code-style)
- [Testing](#testing)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Reporting Bugs](#reporting-bugs)
- [Security Issues](#security-issues)

---

## Ways to Contribute

- 🐛 **Report bugs** — open a [bug report](https://github.com/sanmaxdev/twingrid-binance/issues/new/choose).
- 💡 **Suggest features** — open a [feature request](https://github.com/sanmaxdev/twingrid-binance/issues/new/choose).
- 📖 **Improve docs** — typo fixes and clarifications are always welcome.
- 🧩 **Submit code** — pick up an open issue or propose a change.

For anything non-trivial, please **open an issue first** to discuss the approach before
investing time in a pull request.

---

## Development Setup

### Prerequisites

- Docker & Docker Compose
- Python 3.11+ (for backend work without Docker)
- Node.js 20+ (for frontend work without Docker)

### Quickstart

```bash
git clone https://github.com/sanmaxdev/twingrid-binance.git
cd twingrid-binance
cp .env.example .env   # then edit values
docker compose up -d
```

### Backend (without Docker)

```bash
cd backend
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
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

---

## Branching & Commits

- Branch off `master`: `git checkout -b feat/short-description` or `fix/short-description`.
- We follow [Conventional Commits](https://www.conventionalcommits.org/):
  - `feat:` a new feature
  - `fix:` a bug fix
  - `docs:` documentation only
  - `refactor:` code change that neither fixes a bug nor adds a feature
  - `test:` adding or fixing tests
  - `chore:` tooling, dependencies, build

Example: `fix: prevent duplicate grid orders on websocket reconnect`

---

## Code Style

### Backend (Python)

- Formatted and linted with [**ruff**](https://docs.astral.sh/ruff/) (config in `backend/pyproject.toml`).
- Type-checked with **mypy** (strict mode).

```bash
cd backend
ruff check app           # lint
ruff check --fix app     # auto-fix where possible
ruff format app          # format
mypy app                 # type check
```

> **Note:** `ruff check` and `ruff format --check` run in CI and must pass. Keep new and
> changed code ruff-clean and formatted.

### Frontend (TypeScript / React)

- Linted with ESLint (`eslint-config-next`).

```bash
cd frontend
npm run lint
```

---

## Testing

```bash
cd backend
pytest -v
```

The test suite is in its early stages — **new features and bug fixes should include tests.**
This is one of the most valuable ways to contribute right now.

---

## Submitting a Pull Request

1. Fork the repo and create your branch from `master`.
2. Make your changes, with tests where applicable.
3. Ensure the backend tests pass and your code is ruff-clean.
4. Update documentation if you changed behavior.
5. Open a PR using the template — fill in the description and check the boxes.
6. Link any related issues (`Closes #123`).

A maintainer will review your PR. CI must pass (the `Backend · Tests` check is required).

---

## Reporting Bugs

Use the [bug report template](https://github.com/sanmaxdev/twingrid-binance/issues/new/choose).
Include steps to reproduce, expected vs. actual behavior, and your environment.

---

## Security Issues

**Do not open public issues for security vulnerabilities.** Please follow the process in
[SECURITY.md](.github/SECURITY.md) to report them privately.

---

Thanks again for helping make TWIN GRID better! ⚡
