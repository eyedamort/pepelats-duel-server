import { TICK_DT, TICK_RATE } from './shared/config.mjs';
import { createWorld, simulateTick } from './shared/simulate.mjs';
import { serializeWorld } from './shared/serialize.mjs';
import { emptyInput } from './shared/world.mjs';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function isSoloLike(mode) {
  return mode === 'solo' || mode === 'training';
}

function makeRoomId(rooms) {
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return rooms.has(id) ? makeRoomId(rooms) : id;
}

export class GameRoom {
  constructor(id, mode = 'duel') {
    this.id = id;
    this.mode = mode;
    this.players = [null, null];
    this.started = false;
    this.world = null;
    this.inputs = {
      0: emptyInput({ isBot: false }),
      1: emptyInput({ isBot: isSoloLike(mode) }),
    };
    this.timer = null;
    this.onBroadcast = null;
  }

  setPlayer(slot, ws) {
    this.players[slot] = ws;
  }

  hasPlayer(ws) {
    return this.players.includes(ws);
  }

  slotOf(ws) {
    return this.players.indexOf(ws);
  }

  peerOf(ws) {
    const slot = this.slotOf(ws);
    return slot === 0 ? this.players[1] : this.players[0];
  }

  canStart() {
    if (isSoloLike(this.mode)) return this.players[0] != null;
    return this.players[0] != null && this.players[1] != null;
  }

  start() {
    if (!this.canStart()) return false;
    this.world = createWorld(this.mode);
    this.started = true;
    this.inputs[0] = emptyInput({ isBot: false });
    this.inputs[1] = emptyInput({ isBot: isSoloLike(this.mode) });
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), Math.round(TICK_DT * 1000));
    return true;
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.started = false;
    this.world = null;
  }

  setInput(slot, payload) {
    const inp = this.inputs[slot] || emptyInput({ isBot: slot === 1 && isSoloLike(this.mode) });
    if (typeof payload.thrustX === 'number') inp.thrustX = payload.thrustX;
    if (typeof payload.thrustY === 'number') inp.thrustY = payload.thrustY;
    if (payload.weaponToggle) inp.weaponToggle = true;
    this.inputs[slot] = inp;
  }

  tick() {
    if (!this.world) return;

    simulateTick(this.world, this.inputs, TICK_DT);
    this.inputs[0].weaponToggle = false;
    this.inputs[1].weaponToggle = false;
    if (isSoloLike(this.mode)) this.inputs[1].isBot = true;

    this.broadcast({
      type: 'snapshot',
      tick: this.world.tick,
      tickRate: TICK_RATE,
      state: serializeWorld(this.world),
    });

    if (this.world.matchResult != null) {
      this.broadcast({
        type: 'match_end',
        winner: this.world.matchResult,
        state: serializeWorld(this.world),
      });
      this.stop();
    }
  }

  broadcast(msg) {
    this.onBroadcast?.(msg, this);
  }

  rematch() {
    this.stop();
    this.start();
  }
}

export function createRoomManager() {
  const rooms = new Map();

  return {
    rooms,
    create(mode = 'duel') {
      const id = makeRoomId(rooms);
      const room = new GameRoom(id, mode);
      rooms.set(id, room);
      return room;
    },
    get(id) {
      return rooms.get(String(id || '').toUpperCase().trim());
    },
    remove(id) {
      const room = rooms.get(id);
      room?.stop();
      rooms.delete(id);
    },
    findBySocket(ws) {
      for (const room of rooms.values()) {
        if (room.hasPlayer(ws)) return room;
      }
      return null;
    },
  };
}
