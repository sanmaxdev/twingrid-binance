# ─── TWIN GRID Deploy Script (PowerShell) ───
# Usage: .\scripts\deploy.ps1 "commit message"
# Or just: .\scripts\deploy.ps1

param(
    [string]$Message = "deploy: update production"
)

# Config (override via environment variables)
$EC2_HOST = if ($env:DEPLOY_HOST) { $env:DEPLOY_HOST } else { throw "Set DEPLOY_HOST, e.g. ubuntu@your-server-ip" }
$PEM_KEY = if ($env:DEPLOY_KEY) { $env:DEPLOY_KEY } else { throw "Set DEPLOY_KEY, path to your SSH private key" }
$REMOTE_DIR = if ($env:DEPLOY_DIR) { $env:DEPLOY_DIR } else { "twingrid-binance" }
$BRANCH = if ($env:DEPLOY_BRANCH) { $env:DEPLOY_BRANCH } else { "master" }
$COMPOSE = "docker compose -f docker-compose.yml -f docker-compose.prod.yml"

function Step($text)  { Write-Host "`n━━━ $text ━━━" -ForegroundColor Cyan }
function Ok($text)    { Write-Host "✓ $text" -ForegroundColor Green }
function Warn($text)  { Write-Host "⚠ $text" -ForegroundColor Yellow }
function Fail($text)  { Write-Host "✗ $text" -ForegroundColor Red; exit 1 }

$ErrorActionPreference = "Stop"

# ── 1. Commit & Push ──
Step "Committing & pushing to GitHub"

git add -A
$diff = git diff --cached --quiet 2>&1
if ($LASTEXITCODE -eq 0) {
    Warn "No changes to commit — pushing existing commits"
} else {
    git commit -m $Message
    if ($LASTEXITCODE -ne 0) { Fail "Commit failed" }
    Ok "Committed: $Message"
}

git push origin $BRANCH
if ($LASTEXITCODE -ne 0) { Fail "Push failed" }
Ok "Pushed to origin/$BRANCH"

# ── 2. Deploy on EC2 ──
Step "Pulling & rebuilding on EC2"

ssh -i $PEM_KEY -o StrictHostKeyChecking=no $EC2_HOST "cd $REMOTE_DIR && git pull origin $BRANCH && $COMPOSE up -d --build"
if ($LASTEXITCODE -ne 0) { Fail "Deployment failed" }
Ok "Containers rebuilt and started"

# ── 3. Cleanup ──
Step "Cleaning Docker build cache"

ssh -i $PEM_KEY -o StrictHostKeyChecking=no $EC2_HOST "docker builder prune -af --filter 'until=1h' 2>/dev/null; docker image prune -f 2>/dev/null"
Ok "Build cache cleaned"

# ── 4. Health Check ──
Step "Verifying deployment"

ssh -i $PEM_KEY -o StrictHostKeyChecking=no $EC2_HOST "cd $REMOTE_DIR && $COMPOSE ps --format 'table {{.Name}}\t{{.Status}}' && echo '---' && df -h / | tail -1"

Write-Host "`n━━━ DEPLOYMENT COMPLETE ━━━" -ForegroundColor Green
