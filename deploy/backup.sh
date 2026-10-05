#!/bin/bash
# Nightly backup (cron from the VM's startup script): the database and the uploaded images
# go to the Cloud Storage bucket, which keeps them for 30 days.
set -euo pipefail

source /etc/doodle-backup.env  # BACKUP_BUCKET, written by the startup script
STAMP=$(date -u +%Y-%m-%dT%H%MZ)
compose() { docker compose -f /opt/doodle/app/deploy/docker-compose.prod.yml --env-file /opt/doodle/.env "$@"; }

compose exec -T db pg_dump -U teaching -d teaching --format=custom \
  | gcloud storage cp - "gs://$BACKUP_BUCKET/db/$STAMP.dump"
docker run --rm -v doodle_assets:/assets:ro alpine:3.22 tar czf - -C /assets . \
  | gcloud storage cp - "gs://$BACKUP_BUCKET/assets/$STAMP.tar.gz"
echo "$STAMP backup done"
