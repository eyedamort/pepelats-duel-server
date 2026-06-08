import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { createRoomManager } from './gameRoom.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = process.env.PUBLIC_DIR || path.join(__dirname, 'public');
const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 3000);

const app = express();
app.use(express.static(PUBLIC_DIR));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'pepelats-duel-server', tickRate: 30 });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const roomManager = createRoomManager();

function send(ws, type, payload = {}) {
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ type, ...payload }));
  }
}

wss.on('connection', (ws) => {
  send(ws, 'hello', { tickRate: 30 });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.type === 'create') {
      const existing = roomManager.findBySocket(ws);
      if (existing) {
        const oldSlot = existing.slotOf(ws);
        existing.players[oldSlot] = null;
        existing.stop();
        const peer = existing.peerOf(ws);
        if (peer) send(peer, 'opponent_left');
        if (!existing.players[0] && !existing.players[1]) {
          roomManager.remove(existing.id);
        }
        ws.roomId = null;
        ws.slot = null;
      }

      const mode = msg.mode === 'training' ? 'training' : msg.mode === 'solo' ? 'solo' : 'duel';
      const room = roomManager.create(mode);
      room.onBroadcast = (payload) => {
        for (const player of room.players) {
          if (player) send(player, payload.type, payload);
        }
      };
      room.setPlayer(0, ws);
      ws.roomId = room.id;
      ws.slot = 0;

      send(ws, 'created', { roomId: room.id, slot: 0, mode });

      if (mode === 'solo' || mode === 'training') {
        room.start();
        send(ws, 'start', { slot: 0, mode });
      }
      return;
    }

    if (msg.type === 'join') {
      const existing = roomManager.findBySocket(ws);
      if (existing) {
        const oldSlot = existing.slotOf(ws);
        existing.players[oldSlot] = null;
        existing.stop();
        const peer = existing.peerOf(ws);
        if (peer) send(peer, 'opponent_left');
        if (!existing.players[0] && !existing.players[1]) {
          roomManager.remove(existing.id);
        }
        ws.roomId = null;
        ws.slot = null;
      }

      const room = roomManager.get(msg.roomId);
      if (!room) {
        send(ws, 'error', { message: 'Комната не найдена' });
        return;
      }
      if (room.players[1]) {
        send(ws, 'error', { message: 'Комната уже полная' });
        return;
      }

      room.setPlayer(1, ws);
      ws.roomId = room.id;
      ws.slot = 1;

      send(ws, 'joined', { roomId: room.id, slot: 1, mode: room.mode });
      send(room.players[0], 'opponent_joined', { slot: 1 });

      if (room.start()) {
        send(room.players[0], 'start', { slot: 0, mode: room.mode });
        send(room.players[1], 'start', { slot: 1, mode: room.mode });
      }
      return;
    }

    const room = roomManager.findBySocket(ws);
    if (!room || !room.started) return;

    const slot = ws.slot;
    if (slot == null || slot < 0) return;

    switch (msg.type) {
      case 'input':
        room.setInput(slot, msg);
        break;
      case 'rematch':
        if (room.canStart()) {
          room.rematch();
          for (const player of room.players) {
            if (player) send(player, 'start', { slot: player.slot, mode: room.mode });
          }
        }
        break;
      default:
        break;
    }
  });

  ws.on('close', () => {
    const room = roomManager.findBySocket(ws);
    if (!room) return;

    const slot = room.slotOf(ws);
    room.players[slot] = null;
    room.stop();

    const peer = room.peerOf(ws);
    if (peer) send(peer, 'opponent_left');

    if (!room.players[0] && !room.players[1]) {
      roomManager.remove(room.id);
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Pepelats Duel server → http://${HOST}:${PORT}`);
});
