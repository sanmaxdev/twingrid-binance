#!/bin/bash
set -e

# ─── TWIN GRID Deploy Script ───
# Usage: ./scripts/deploy.sh [message]
# Runs from project root on your local machine.
# Commits, pushes, SSHs into EC2, pulls, rebuilds, and cleans up.

# ── Config (override via environment variables) ──
EC2_HOST="${DEPLOY_HOST:?Set DEPLOY_HOST, e.g. ubuntu@your-server-ip}"
PEM_KEY="${DEPLOY_KEY:?Set DEPLOY_KEY, path to your SSH private key}"
REMOTE_DIR="${DEPLOY_DIR:-twingrid-binance}"
BRANCH="${DEPLOY_BRANCH:-master}"
COMPOSE_CMD="docker compose -f docker-compose.yml -f docker-compose.prod.yml"

# ── Colors ──
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

step() { echo -e "\n${CYAN}━━━ $1 ━━━${NC}"; }
ok()   { echo -e "${GREEN}✓ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠ $1${NC}"; }
fail() { echo -e "${RED}✗ $1${NC}"; exit 1; }

SSH_CMD="ssh -i $PEM_KEY -o StrictHostKeyChecking=no -o ConnectTimeout=10 $EC2_HOST"

# ── 1. Commit & Push ──
step "Committing & pushing to GitHub"

COMMIT_MSG="${1:-deploy: update production}"

git add -A
if git diff --cached --quiet; then
    warn "No changes to commit — pushing existing commits"
else
    git commit -m "$COMMIT_MSG"
    ok "Committed: $COMMIT_MSG"
fi

git push origin $BRANCH
ok "Pushed to origin/$BRANCH"

# ── 2. Deploy on EC2 ──
step "Pulling latest code on EC2"
$SSH_CMD "cd $REMOTE_DIR && git pull origin $BRANCH"
ok "Code updated on server"

step "Building & restarting containers"
$SSH_CMD "cd $REMOTE_DIR && $COMPOSE_CMD up -d --build"
ok "Containers rebuilt and started"

# ── 3. Cleanup ──
step "Cleaning Docker build cache"
$SSH_CMD "docker builder prune -af --filter 'until=1h' 2>/dev/null; docker image prune -f 2>/dev/null"
ok "Build cache cleaned"

# ── 4. Health Check ──
step "Verifying deployment"
$SSH_CMD "cd $REMOTE_DIR && $COMPOSE_CMD ps --format 'table {{.Name}}\t{{.Status}}'"

# Check disk usage
DISK_USAGE=$($SSH_CMD "df -h / | tail -1 | awk '{print \$5}'")
echo -e "\n${GREEN}━━━ DEPLOYMENT COMPLETE ━━━${NC}"
echo -e "Disk usage: ${YELLOW}$DISK_USAGE${NC}"
echo -e "Server: ${CYAN}$EC2_HOST${NC}"
