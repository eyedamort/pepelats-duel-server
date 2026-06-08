const Net = (() => {
  const handlers = {};
  let ws = null;
  let slot = 0;
  let roomId = null;
  let connected = false;
  let mode = 'duel';

  function configuredServer() {
    const raw = String(window.GAME_SERVER || '').trim();
    if (!raw) return null;
    try {
      return new URL(raw.endsWith('/') ? raw : `${raw}/`);
    } catch {
      return null;
    }
  }

  function needsLocalServer() {
    if (configuredServer()) return false;
    return location.protocol === 'file:' || !location.hostname;
  }

  function pageBaseUrl() {
    const remote = configuredServer();
    if (remote) return remote.href;
    if (needsLocalServer()) return 'http://localhost:3000/';
    return `${location.origin}${location.pathname}`;
  }

  function wsUrl() {
    const remote = configuredServer();
    if (remote) {
      const proto = remote.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${proto}//${remote.host}`;
    }
    if (needsLocalServer()) return 'ws://localhost:3000';
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}`;
  }

  function inviteUrl(code) {
    const url = new URL(pageBaseUrl());
    url.searchParams.set('room', code);
    return url.toString();
  }

  function roomFromQuery() {
    return new URLSearchParams(location.search).get('room')?.toUpperCase().trim() || null;
  }

  function connect() {
    return new Promise((resolve, reject) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      ws = new WebSocket(wsUrl());

      ws.onopen = () => {
        connected = true;
        resolve();
      };

      ws.onerror = () => reject(new Error('Не удалось подключиться к серверу'));

      ws.onclose = () => {
        connected = false;
        handlers.close?.();
      };

      ws.onmessage = (ev) => {
        let msg;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        handlers[msg.type]?.(msg);
      };
    });
  }

  function send(type, payload = {}) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type, ...payload }));
  }

  function on(type, fn) {
    handlers[type] = fn;
  }

  async function createRoom(options = {}) {
    if (ws && ws.readyState === WebSocket.OPEN && roomId) {
      ws.close();
      ws = null;
      connected = false;
      roomId = null;
      await new Promise((r) => setTimeout(r, 120));
    }
    await connect();
    mode = options.mode || 'duel';
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Таймаут создания комнаты')), 8000);

      handlers.created = (msg) => {
        clearTimeout(timeout);
        slot = msg.slot;
        roomId = msg.roomId;
        mode = msg.mode || mode;
        resolve({ roomId: msg.roomId, inviteUrl: inviteUrl(msg.roomId), slot: msg.slot, mode });
      };

      handlers.error = (msg) => {
        clearTimeout(timeout);
        reject(new Error(msg.message || 'Ошибка'));
      };

      send('create', { mode });
    });
  }

  async function joinRoom(code) {
    await connect();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Таймаут входа в комнату')), 8000);

      handlers.joined = (msg) => {
        clearTimeout(timeout);
        slot = msg.slot;
        roomId = msg.roomId;
        mode = msg.mode || 'duel';
        resolve({ roomId: msg.roomId, slot: msg.slot, mode });
      };

      handlers.error = (msg) => {
        clearTimeout(timeout);
        reject(new Error(msg.message || 'Ошибка'));
      };

      send('join', { roomId: code });
    });
  }

  function sendInput(input) {
    send('input', {
      thrustX: input.thrustX ?? 0,
      thrustY: input.thrustY ?? 0,
      weaponToggle: Boolean(input.weaponToggle),
    });
  }

  function requestRematch() {
    send('rematch');
  }

  function getSlot() {
    return slot;
  }

  function getRoomId() {
    return roomId;
  }

  function getMode() {
    return mode;
  }

  function isConnected() {
    return connected;
  }

  function disconnect() {
    ws?.close();
    ws = null;
    connected = false;
    roomId = null;
  }

  return {
    on,
    createRoom,
    joinRoom,
    roomFromQuery,
    inviteUrl,
    needsLocalServer,
    pageBaseUrl,
    sendInput,
    requestRematch,
    getSlot,
    getRoomId,
    getMode,
    isConnected,
    disconnect,
    connect,
  };
})();

window.Net = Net;
