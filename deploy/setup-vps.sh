#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/pepelats-duel-server"
APP_USER="pepelats"

if [[ $EUID -ne 0 ]]; then
  echo "Запустите от root: sudo bash deploy/setup-vps.sh"
  exit 1
fi

apt-get update
apt-get install -y curl ca-certificates ufw rsync

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

id -u "$APP_USER" &>/dev/null || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"

mkdir -p "$APP_DIR"
rsync -a --delete \
  --exclude node_modules \
  --exclude .git \
  ./ "$APP_DIR/"

cd "$APP_DIR"
npm ci --omit=dev || npm install --omit=dev
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

cp deploy/pepelats-duel.service /etc/systemd/system/pepelats-duel.service
systemctl daemon-reload
systemctl enable pepelats-duel
systemctl restart pepelats-duel

ufw allow OpenSSH
ufw allow 3000/tcp
ufw --force enable

echo "Готово. Проверка: curl http://127.0.0.1:3000/health"
