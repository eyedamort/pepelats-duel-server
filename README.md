# Pepelats Duel — Game Server

Authoritative tick-сервер (30 Hz) для Pepelats Duel. Раздаёт WebSocket API и статику клиента для браузера.

## Требования

- Node.js 20+
- Порт **3000** (TCP) открыт наружу

## Локальный запуск

```bash
npm install
npm start
```

Проверка: http://localhost:3000/health

## Деплой на VPS

1. Склонируйте репозиторий на сервер (например в `/root/pepelats-duel-server`)
2. Запустите установку:

```bash
cd pepelats-duel-server
sudo bash deploy/setup-vps.sh
```

3. Проверьте:

```bash
systemctl status pepelats-duel
curl http://127.0.0.1:3000/health
```

Игра в браузере: `http://ВАШ_IP:3000`

## Переменные окружения

| Переменная | По умолчанию | Описание |
|---|---|---|
| `HOST` | `0.0.0.0` | Адрес прослушивания |
| `PORT` | `3000` | Порт HTTP + WebSocket |
| `PUBLIC_DIR` | `./public` | Статика клиента |

## Обновление

```bash
cd /opt/pepelats-duel-server
git pull
npm ci --omit=dev
sudo systemctl restart pepelats-duel
```

## Desktop-клиент

Собирается из репозитория `vibeGame` (Electron). В `.exe` указывается `GAME_SERVER=http://ВАШ_IP:3000`.
