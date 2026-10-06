#!/bin/bash
# Runs on every boot of the VM (from Terraform metadata). Safe to run again.
set -euo pipefail

# Docker Engine with the Compose plugin, from Docker's own repository.
if ! command -v docker >/dev/null; then
  apt-get update
  apt-get install -y ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable --now docker
fi

# Security updates install themselves.
if ! dpkg -s unattended-upgrades >/dev/null 2>&1; then
  apt-get install -y unattended-upgrades
fi

# 2 GB of swap: headroom for memory peaks.
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# The app lives here (deploy/ from the repo + a .env with the secrets, see infra/README.md).
mkdir -p /opt/doodle

# Nightly backups at 02:30 (database dump + uploaded images) to Cloud Storage.
echo "BACKUP_BUCKET=${backup_bucket}" > /etc/doodle-backup.env
cat > /etc/cron.d/doodle-backup <<'CRON'
30 2 * * * root [ -x /opt/doodle/backup.sh ] && /opt/doodle/backup.sh >> /var/log/doodle-backup.log 2>&1
CRON
