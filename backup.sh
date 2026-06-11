#!/bin/bash
set -e
DIR=/opt/preventis/backups
TS=$(date +%Y%m%d_%H%M%S)
su postgres -c 'pg_dump -Fc preventis' > "$DIR/db_$TS.dump"
tar czf "$DIR/uploads_$TS.tgz" -C /opt/preventis/backend uploads 2>/dev/null || true
find "$DIR" -name 'db_*.dump' -mtime +14 -delete
find "$DIR" -name 'uploads_*.tgz' -mtime +14 -delete
echo "[$(date)] backup $TS OK"
