#!/usr/bin/env bash
set -euo pipefail

DATE=$(date +%F_%H%M)
OUT="/backups/pg_${DATE}.sql.gz"

pg_dump "${DATABASE_URL}" | gzip > "$OUT"

# S3 opcional (si tienes awscli y credenciales)
# aws s3 cp "$OUT" "s3://tubucket-backups/${HOSTNAME}/$DATE.sql.gz" --sse AES256

# borra locales > 14 días
find /backups -type f -name "pg_*.sql.gz" -mtime +14 -delete
