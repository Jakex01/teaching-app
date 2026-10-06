#!/bin/bash
# Deploys the latest main on the server: pull, build, migrate, restart. Run on the VM:
#   sudo /opt/doodle/app/deploy/deploy.sh
set -euo pipefail

APP_DIR=/opt/doodle/app
ENV_FILE=/opt/doodle/.env
compose() { docker compose -f "$APP_DIR/deploy/docker-compose.prod.yml" --env-file "$ENV_FILE" "$@"; }

[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE (see deploy/.env.example)"; exit 1; }
chmod 600 "$ENV_FILE"

git -C "$APP_DIR" pull --ff-only
compose build
compose up -d --remove-orphans
ln -sf "$APP_DIR/deploy/backup.sh" /opt/doodle/backup.sh
docker image prune -f >/dev/null
compose ps
