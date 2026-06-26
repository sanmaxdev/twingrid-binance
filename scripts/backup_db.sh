#!/bin/bash
# ─── TWIN GRID PostgreSQL Backup Script ───
# Creates daily compressed backups with 7-day retention
# Install: add to crontab with: crontab -e
# Schedule: 0 3 * * * /home/ubuntu/twingrid-binance/scripts/backup_db.sh >> /home/ubuntu/db-backups/backup.log 2>&1

set -e

BACKUP_DIR="/home/ubuntu/db-backups"
CONTAINER="twingrid-binance-db-1"
DB_NAME="twin_grid"
DB_USER="app"
RETENTION_DAYS=7
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/twin_grid_${TIMESTAMP}.sql.gz"

# Create backup directory
mkdir -p "$BACKUP_DIR"

echo "$(date '+%Y-%m-%d %H:%M:%S') - Starting backup..."

# Dump and compress
docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner --no-privileges | gzip > "$BACKUP_FILE"

# Verify backup
BACKUP_SIZE=$(stat --format=%s "$BACKUP_FILE" 2>/dev/null || stat -f%z "$BACKUP_FILE" 2>/dev/null)
if [ "$BACKUP_SIZE" -lt 1000 ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') - ERROR: Backup file too small (${BACKUP_SIZE} bytes), possible failure"
    exit 1
fi

echo "$(date '+%Y-%m-%d %H:%M:%S') - Backup complete: $BACKUP_FILE ($(du -sh "$BACKUP_FILE" | cut -f1))"

# Cleanup old backups
DELETED=$(find "$BACKUP_DIR" -name "twin_grid_*.sql.gz" -mtime +${RETENTION_DAYS} -delete -print | wc -l)
echo "$(date '+%Y-%m-%d %H:%M:%S') - Cleaned up $DELETED old backup(s)"

# Show remaining backups
echo "$(date '+%Y-%m-%d %H:%M:%S') - Current backups:"
ls -lh "$BACKUP_DIR"/twin_grid_*.sql.gz 2>/dev/null || echo "  (none)"
