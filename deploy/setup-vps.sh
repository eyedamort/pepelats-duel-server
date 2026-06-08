#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/pepelats-duel-server"
APP_USER="pepelats"

if [[ $EUID -ne 0 ]]; then
  echo "Запустите от root: sudo bash deploy/setup-vps.sh"
  exit 1
fi

install_node_debian() {
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
}

install_node_rhel() {
  curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
  dnf install -y nodejs
}

open_firewall() {
  if command -v ufw >/dev/null 2>&1; then
    ufw allow OpenSSH
    ufw allow 3000/tcp
    ufw --force enable
  elif command -v firewall-cmd >/dev/null 2>&1; then
    systemctl enable --now firewalld 2>/dev/null || true
    firewall-cmd --permanent --add-service=ssh
    firewall-cmd --permanent --add-port=3000/tcp
    firewall-cmd --reload
  fi
}

if command -v apt-get >/dev/null 2>&1; then
  apt-get update
  apt-get install -y curl ca-certificates rsync git
  if ! command -v node >/dev/null 2>&1; then
    install_node_debian
  fi
elif command -v dnf >/dev/null 2>&1; then
  dnf install -y curl ca-certificates rsync git firewalld
  if ! command -v node >/dev/null 2>&1; then
    install_node_rhel
  fi
else
  echo "Неподдерживаемый дистрибутив. Нужен apt-get или dnf."
  exit 1
fi

id -u "$APP_USER" &>/dev/null || useradd --system --home "$APP_DIR" --shell /sbin/nologin "$APP_USER"

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

open_firewall

echo "Готово. Проверка: curl http://127.0.0.1:3000/health"
