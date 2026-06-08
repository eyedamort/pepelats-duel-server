const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayText = document.getElementById('overlay-text');
const overlaySub = document.getElementById('overlay-sub');
const lobbyActions = document.getElementById('lobby-actions');
const inviteBox = document.getElementById('invite-box');
const inviteLink = document.getElementById('invite-link');
const inviteWait = document.getElementById('invite-wait');
const btnTraining = document.getElementById('btn-training');
const btnLocal = document.getElementById('btn-local');
const btnCreate = document.getElementById('btn-create');
const btnCopy = document.getElementById('btn-copy');
const pauseMenu = document.getElementById('pause-menu');
const btnResume = document.getElementById('btn-resume');
const btnExit = document.getElementById('btn-exit');
const hintEl = document.getElementById('hint');
const playerHpEl = document.getElementById('player-hp');
const playerNeedleEl = document.getElementById('player-needle');
const enemyCountEl = document.getElementById('enemy-count');
const enemyNeedleEl = document.getElementById('enemy-needle');

const SHIP_R = 24;
const GROUND_PICKUP_RANGE = 58;
const GROUND_WEAPON_FLOOR = 14;
const GROUND_WEAPON_BOUNCE = 0.42;
const GROUND_WEAPON_FRICTION = 0.82;
const GROUND_WEAPON_RESTITUTION = 0.55;
const GROUND_WEAPON_PAIR_RESTITUTION = 0.68;
const SHIP_COLLISION_MASS = 50;
const GROUND_WEAPON_COLLISION_ITERS = 3;
const ATTACHED_WEAPON_COLLISION_ITERS = 3;
const ATTACHED_WEAPON_RESTITUTION = 0.62;

const WEAPONS = {
  mace: {
    id: 'mace',
    name: 'Булава',
    mount: 'chain',
    ropeLen: 96,
    headR: 17,
    mass: 3.2,
    inertia: 3.2,
    maxAngVel: 14,
    damageMult: 1,
    color: '#aaa090',
  },
  flail: {
    id: 'flail',
    name: 'Цеп',
    mount: 'chain',
    ropeLen: 108,
    headR: 15,
    mass: 2.5,
    inertia: 2.6,
    maxAngVel: 15,
    damageMult: 1.15,
    color: '#989080',
  },
  axe: {
    id: 'axe',
    name: 'Топор',
    mount: 'chain',
    ropeLen: 90,
    headR: 20,
    mass: 4.5,
    inertia: 3.9,
    maxAngVel: 12,
    damageMult: 1.45,
    color: '#9098a8',
  },
  halberd: {
    id: 'halberd',
    name: 'Алебарда',
    mount: 'chain',
    ropeLen: 118,
    headR: 15,
    mass: 3.7,
    inertia: 2.8,
    maxAngVel: 13,
    damageMult: 1.2,
    color: '#a0a8b8',
  },
  greatsword: {
    id: 'greatsword',
    name: 'Большой меч',
    mount: 'pivot',
    handleLen: 14,
    bladeLen: 76,
    bladeW: 24,
    headR: 30,
    mass: 5.2,
    inertia: 4.2,
    maxAngVel: 10,
    bearingDamp: 0.993,
    damageMult: 1.35,
    color: '#b8c8e0',
  },
};
const THRUST = 2200;
const MAX_SPEED = 580;
const ENEMY_THRUST = 1300;
const ENEMY_MAX_SPEED = 340;
const ENEMY_DAMAGE_MULT = 0.5;
const DRAG = 0.991;
const PLAYER_COAST_DRAG = 0.986;
const MOUSE_THRUST_SENS = 0.035;
const MOUSE_THRUST_DECAY = 5.5;
const MOUSE_THRUST_DEADZONE = 0.04;
const SHIP_CONTROL_MASS = 8;
const WEAPON_CONTROL_MASS_FACTOR = 0.55;
const WEAPON_PULL_COUPLING = 0.18;
const WEAPON_PULL_MAX_ACCEL = 480;
const CHAIN_SEGMENTS = 5;
const CONSTRAINT_ITERS = 10;
const VERLET_DAMP = 0.998;
const CHAIN_GRAVITY = 400;
const HEAD_GRAVITY_MULT = 1.6;
const LINK_GRAVITY_MULT = 0.55;
const MIN_HIT_SPEED = 45;
const DAMAGE_PER_SPEED = 0.16;
const MIN_DAMAGE = 3;
const MAX_DAMAGE = 70;
const DEFAULT_MAX_HEALTH = 1000;
const HIT_COOLDOWN_MS = 280;

const VIEW_ZOOM = 1.3;
const LOGICAL_W = 1400;
const LOGICAL_H = 900;
const CAMERA_WORLD_W = 740;
const CAMERA_WORLD_H = 500;
const ENEMY_POINTER_MARGIN = 42;
const ARENA_MARGIN_X = 0.02;
const HULL_FACING = 0;
const SHIELD_ORBIT_R = SHIP_R + 5;
const SHIELD_BEARING_DAMP = 0.994;
const SHIELD_MAX_ANG_VEL = 8;

let W, H, arenaY, arenaLeft, arenaRight, arenaTop;
let viewScale = 1;
let viewOffsetX = 0;
let viewOffsetY = 0;
let mouse = { x: 0, y: 0, thrustX: 0, thrustY: 0 };
let state = 'menu';
let player;
let enemies = [];
let sparks = [];
let ribbons = [];
let debris = [];
let groundWeapons = [];
let nextGroundWeaponId = 1;
let shake = 0;
let lastTime = 0;
let gameMode = 'solo';
let netSlot = 0;
let pendingWeaponToggle = false;
let lastEventTick = -1;

function getW(ship) {
  if (!ship.weaponId) return null;
  return WEAPONS[ship.weaponId] || WEAPONS.mace;
}

function weaponMass(weaponId) {
  return WEAPONS[weaponId]?.mass ?? WEAPONS[weaponId]?.inertia ?? 2.5;
}

function weaponInertia(weaponId) {
  return WEAPONS[weaponId]?.inertia ?? weaponMass(weaponId);
}

function shipControlMass(ship) {
  if (!ship?.weaponId) return SHIP_CONTROL_MASS;
  return SHIP_CONTROL_MASS + weaponMass(ship.weaponId) * WEAPON_CONTROL_MASS_FACTOR;
}

function isPivotMount(ship) {
  return getW(ship)?.mount === 'pivot';
}

function hasEquippedWeapon(ship) {
  return Boolean(ship?.weaponId && (isPivotMount(ship) || ship.chain.length));
}

function weaponReachLen(w) {
  if (w.mount === 'pivot') return (w.handleLen || 14) + w.bladeLen;
  return w.ropeLen;
}

function weaponComDist(w) {
  if (w.mount === 'pivot') return (w.handleLen || 14) + (w.bladeLen || 76) * 0.62;
  return w.ropeLen * 0.82;
}

function floorY() {
  return arenaY - GROUND_WEAPON_FLOOR;
}

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  W = LOGICAL_W;
  H = LOGICAL_H;
  arenaLeft = W * ARENA_MARGIN_X;
  arenaRight = W * (1 - ARENA_MARGIN_X);
  arenaY = H * 0.88;
  arenaTop = H * 0.1;
  updateViewLayout();
}

function updateViewLayout() {
  const contentW = LOGICAL_W * VIEW_ZOOM;
  const contentH = LOGICAL_H * VIEW_ZOOM;
  viewScale = Math.min(canvas.width / contentW, canvas.height / contentH);
  viewOffsetX = (canvas.width - contentW * viewScale) / 2;
  viewOffsetY = (canvas.height - contentH * viewScale) / 2;
}

function getCameraTransform() {
  if (!player || (state !== 'playing' && state !== 'paused')) {
    updateViewLayout();
    return {
      mode: 'full',
      pixelScale: VIEW_ZOOM * viewScale,
      offsetX: viewOffsetX,
      offsetY: viewOffsetY,
      camX: W * 0.5,
      camY: H * 0.5,
    };
  }

  const fitScale = Math.min(
    canvas.width / (CAMERA_WORLD_W * VIEW_ZOOM),
    canvas.height / (CAMERA_WORLD_H * VIEW_ZOOM),
  );
  const pixelScale = VIEW_ZOOM * fitScale;
  const viewWorldW = canvas.width / pixelScale;
  const viewWorldH = canvas.height / pixelScale;

  let camX = Number.isFinite(player.x) ? player.x : arenaCenterX();
  let camY = Number.isFinite(player.y) ? player.y : arenaY * 0.55;
  camX = Math.max(arenaLeft + viewWorldW * 0.5, Math.min(arenaRight - viewWorldW * 0.5, camX));
  camY = Math.max(arenaTop + viewWorldH * 0.5, Math.min(arenaY - viewWorldH * 0.5, camY));

  return {
    mode: 'follow',
    pixelScale,
    offsetX: canvas.width * 0.5 - camX * pixelScale,
    offsetY: canvas.height * 0.5 - camY * pixelScale,
    camX,
    camY,
    viewWorldW,
    viewWorldH,
  };
}

function worldToScreen(wx, wy, cam) {
  return {
    x: wx * cam.pixelScale + cam.offsetX,
    y: wy * cam.pixelScale + cam.offsetY,
  };
}

function rayToScreenEdge(cx, cy, angle, hw, hh) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const tx = Math.abs(cos) < 0.001 ? Infinity : hw / Math.abs(cos);
  const ty = Math.abs(sin) < 0.001 ? Infinity : hh / Math.abs(sin);
  const t = Math.min(tx, ty);
  return { x: cx + cos * t, y: cy + sin * t };
}

function drawEnemyPointers(cam) {
  if (!player || cam.mode !== 'follow') return;

  const margin = ENEMY_POINTER_MARGIN;
  const cx = canvas.width * 0.5;
  const cy = canvas.height * 0.5;
  const hw = canvas.width * 0.5 - margin;
  const hh = canvas.height * 0.5 - margin;

  for (const enemy of enemies) {
    if (!enemy || enemy.health <= 0) continue;

    const screen = worldToScreen(enemy.x, enemy.y, cam);
    const onScreen = screen.x >= margin && screen.x <= canvas.width - margin
      && screen.y >= margin && screen.y <= canvas.height - margin;
    if (onScreen) continue;

    const angle = Math.atan2(enemy.y - cam.camY, enemy.x - cam.camX);
    const edge = rayToScreenEdge(cx, cy, angle, hw, hh);
    const pulse = 0.75 + Math.sin(performance.now() * 0.008) * 0.25;

    ctx.save();
    ctx.translate(edge.x, edge.y);
    ctx.rotate(angle);

    ctx.fillStyle = `rgba(255, 70, 40, ${0.85 * pulse})`;
    ctx.strokeStyle = 'rgba(255, 220, 160, 0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-10, -9);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-10, 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffe8c8';
    ctx.font = 'bold 13px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(enemy.isTrainingDummy ? '∞' : String(Math.max(0, Math.ceil(enemy.health))), 0, 0);
    ctx.restore();
  }
}

function arenaWidth() {
  return arenaRight - arenaLeft;
}

function arenaCenterX() {
  return (arenaLeft + arenaRight) * 0.5;
}

function makeShip(x, y, team, id) {
  const ship = {
    x, y,
    vx: 0, vy: 0,
    prevVx: 0, prevVy: 0,
    team,
    id,
    health: DEFAULT_MAX_HEALTH,
    maxHealth: DEFAULT_MAX_HEALTH,
    facing: HULL_FACING,
    shieldAngle: 0,
    shieldAngVel: 0,
    hitFlash: 0,
    dmgFlash: 0,
    hitCooldown: {},
    chain: [],
    chainSegLen: WEAPONS.mace.ropeLen / CHAIN_SEGMENTS,
    lastChainDt: 0.016,
    aiTimer: 0,
    aiDir: 1,
    prevPivotX: x,
    prevPivotY: y,
    weaponAngle: Math.PI / 2,
    weaponAngVel: 0,
    prevWeaponAngle: Math.PI / 2,
    shields: [
      { side: -1, intact: true },
      { side: 1, intact: true },
    ],
    weaponId: 'mace',
  };
  initHammerState(ship);
  return ship;
}

function initHammerState(ship) {
  if (!ship.weaponId) {
    ship.chain = [];
    ship.weaponAngVel = 0;
    return;
  }

  const pivot = getPivot(ship);
  const w = getW(ship);

  if (w.mount === 'pivot') {
    ship.chain = [];
    ship.weaponAngle = Math.PI / 2;
    ship.weaponAngVel = 0;
    ship.prevWeaponAngle = ship.weaponAngle;
    ship.prevPivotX = pivot.x;
    ship.prevPivotY = pivot.y;
    return;
  }

  const segLen = w.ropeLen / CHAIN_SEGMENTS;
  ship.chainSegLen = segLen;
  ship.chain = [];

  for (let i = 0; i <= CHAIN_SEGMENTS; i++) {
    const px = pivot.x;
    const py = pivot.y + segLen * i;
    ship.chain.push({ x: px, y: py, ox: px, oy: py });
  }

  ship.prevPivotX = pivot.x;
  ship.prevPivotY = pivot.y;
}

function isOnline() {
  return gameMode === 'duel';
}

function initDisplayShips() {
  const aw = arenaWidth();
  const cx = arenaCenterX();
  const spawnY = arenaY - H * 0.28;
  const myLeft = netSlot === 0;
  player = makeShip(cx + (myLeft ? -aw * 0.28 : aw * 0.28), spawnY, 'player', 1);
  enemies = [makeShip(cx + (myLeft ? aw * 0.28 : -aw * 0.28), spawnY, 'enemy', 2)];
  sparks = [];
  ribbons = [];
  debris = [];
  groundWeapons = [];
  shake = 0;
}

function copyShipFromSnapshot(dst, src) {
  dst.x = src.x;
  dst.y = src.y;
  dst.vx = src.vx;
  dst.vy = src.vy;
  dst.health = src.health;
  dst.maxHealth = src.maxHealth ?? DEFAULT_MAX_HEALTH;
  dst.weaponId = src.weaponId;
  dst.weaponAngle = src.weaponAngle;
  dst.weaponAngVel = src.weaponAngVel;
  dst.shieldAngle = src.shieldAngle;
  dst.shieldAngVel = src.shieldAngVel;
  dst.hitFlash = src.hitFlash ?? 0;
  dst.dmgFlash = src.dmgFlash ?? 0;
  dst.chainSegLen = src.chainSegLen ?? dst.chainSegLen;
  dst.shields = (src.shields || []).map((s) => ({ side: s.side, intact: s.intact }));
  dst.isTrainingDummy = Boolean(src.isTrainingDummy);
  dst.chain = (src.chain || []).map((p) => ({
    x: p.x,
    y: p.y,
    ox: p.ox ?? p.x,
    oy: p.oy ?? p.y,
  }));
  dst.prevPivotX = src.x;
  dst.prevPivotY = src.y;
  dst.lastChainDt = 1 / 30;
}

function applyServerState(serverState) {
  if (!serverState) return;
  const my = serverState.ships.find((s) => s.slot === netSlot);
  const opp = serverState.ships.find((s) => s.slot !== netSlot);
  if (my && player) copyShipFromSnapshot(player, my);
  if (opp && enemies[0]) copyShipFromSnapshot(enemies[0], opp);
  groundWeapons = (serverState.groundWeapons || []).map((gw) => ({ ...gw }));
  sparks = (serverState.sparks || []).map((s) => ({ ...s }));
  debris = (serverState.debris || []).map((d) => ({ ...d }));
  shake = serverState.shake || 0;
}

function processServerEvents(events, tick) {
  if (!events?.length || tick === lastEventTick) return;
  lastEventTick = tick;
  for (const ev of events) {
    if (!window.Audio) continue;
    switch (ev.type) {
      case 'hit':
        window.Audio.playHit((ev.damage || 30) / MAX_DAMAGE);
        break;
      case 'shield_break':
        window.Audio.playShield(0.6);
        break;
      case 'pickup':
        window.Audio.playPickup();
        break;
      case 'throw':
        window.Audio.playThrow();
        break;
      case 'bump':
        window.Audio.playBump((ev.strength || 80) / 200);
        break;
      default:
        break;
    }
  }
}

function serializeShip(ship) {
  return {
    x: ship.x,
    y: ship.y,
    vx: ship.vx,
    vy: ship.vy,
    health: ship.health,
    weaponId: ship.weaponId,
    chain: ship.chain.map((p) => ({ x: p.x, y: p.y, ox: p.ox, oy: p.oy })),
    chainSegLen: ship.chainSegLen,
    weaponAngle: ship.weaponAngle,
    weaponAngVel: ship.weaponAngVel,
    shieldAngle: ship.shieldAngle,
    shieldAngVel: ship.shieldAngVel,
    shields: ship.shields.map((s) => ({ side: s.side, intact: s.intact })),
    hitFlash: ship.hitFlash,
    dmgFlash: ship.dmgFlash,
  };
}

function applyShipSnapshot(ship, data, blend) {
  const k = blend ?? 1;
  const lerp = (a, b) => a + (b - a) * k;

  ship.x = lerp(ship.x, data.x);
  ship.y = lerp(ship.y, data.y);
  ship.vx = data.vx;
  ship.vy = data.vy;
  ship.health = data.health;
  ship.weaponId = data.weaponId;
  ship.chainSegLen = data.chainSegLen;
  ship.weaponAngle = lerp(ship.weaponAngle, data.weaponAngle ?? ship.weaponAngle);
  ship.weaponAngVel = data.weaponAngVel ?? 0;
  ship.shieldAngle = lerp(ship.shieldAngle, data.shieldAngle ?? 0);
  ship.shieldAngVel = data.shieldAngVel ?? 0;
  ship.hitFlash = data.hitFlash ?? 0;
  ship.dmgFlash = data.dmgFlash ?? 0;

  if (data.shields) {
    for (const s of ship.shields) {
      const remote = data.shields.find((r) => r.side === s.side);
      if (remote) s.intact = remote.intact;
    }
  }

  if (data.chain?.length) {
    if (ship.chain.length !== data.chain.length) {
      ship.chain = data.chain.map((p) => ({ ...p }));
    } else {
      for (let i = 0; i < ship.chain.length; i++) {
        ship.chain[i].x = lerp(ship.chain[i].x, data.chain[i].x);
        ship.chain[i].y = lerp(ship.chain[i].y, data.chain[i].y);
        ship.chain[i].ox = data.chain[i].ox;
        ship.chain[i].oy = data.chain[i].oy;
      }
    }
  } else if (!data.weaponId) {
    ship.chain = [];
  }
}

function resetGame() {
  const aw = arenaWidth();
  const cx = arenaCenterX();
  const spawnY = arenaY - H * 0.28;

  if (isOnline()) {
    const myLeft = netSlot === 0;
    player = makeShip(cx + (myLeft ? -aw * 0.28 : aw * 0.28), spawnY, 'player', 1);
    enemies = [makeShip(cx + (myLeft ? aw * 0.28 : -aw * 0.28), spawnY, 'enemy', 2)];
  } else {
    player = makeShip(cx - aw * 0.28, spawnY, 'player', 1);
    enemies = [makeShip(cx + aw * 0.28, spawnY, 'enemy', 2)];
  }

  sparks = [];
  ribbons = [];
  debris = [];
  nextGroundWeaponId = 1;
  groundWeapons = spawnGroundWeapons();
  shake = 0;
  remoteSnapshot = null;
  stateSendAcc = 0;
  updateHud();
}

function sendLocalState() {
  if (!isOnline() || state !== 'playing' || !player) return;
  window.Net.sendState(serializeShip(player));
}

function applyShieldBreak(defender, side, hammerSpeed, attacker) {
  const shield = defender.shields.find((s) => s.side === side && s.intact);
  if (!shield) return false;

  shield.intact = false;
  spawnShieldDebris(defender, side, hammerSpeed);
  defender.hitFlash = 0.15;

  if (attacker) {
    const nx = defender.x - attacker.x;
    const ny = defender.y - attacker.y;
    const len = Math.hypot(nx, ny) || 1;
    defender.vx += (nx / len) * hammerSpeed * 0.025;
    defender.vy += (ny / len) * hammerSpeed * 0.025;
  }

  if (window.Audio) window.Audio.playShield(hammerSpeed / 220);
  return true;
}

function applyRemoteHit(msg) {
  if (!player || state !== 'playing') return;
  if (msg.hammerSpeed < MIN_HIT_SPEED) return;

  const attacker = {
    id: 2,
    team: 'enemy',
    x: enemies[0]?.x ?? player.x,
    y: enemies[0]?.y ?? player.y,
    weaponId: msg.weaponId || 'mace',
  };

  if (msg.blocked) {
    applyShieldBreak(player, msg.shieldSide, msg.hammerSpeed, attacker);
    return;
  }

  const dist = Math.hypot(msg.hitX - player.x, msg.hitY - player.y);
  if (dist > SHIP_R + 55) return;

  resolveBodyHit(attacker, player, msg.hammerSpeed, msg.hitX, msg.hitY);
}

function shouldDealDamage(attacker) {
  return !isOnline() || attacker.team === 'player';
}

function applyRemoteGround(action, data) {
  if (action === 'drop') {
    groundWeapons.push({
      id: data.id,
      weaponId: data.weaponId,
      x: data.x,
      y: data.y,
      vx: data.vx,
      vy: data.vy,
      angle: data.angle,
      spin: data.spin,
      grounded: Math.abs(data.vx) < 30 && Math.abs(data.vy) < 30,
    });
    if (data.id >= nextGroundWeaponId) nextGroundWeaponId = data.id + 1;
  } else if (action === 'remove') {
    groundWeapons = groundWeapons.filter((w) => w.id !== data.id);
  } else if (action === 'sync') {
    groundWeapons = data.groundWeapons.map((gw) => ({ ...gw }));
    nextGroundWeaponId = data.nextId;
  }
}

function createGroundWeapon(weaponId, x, y, vx = 0, vy = 0, angle = Math.PI / 2, spin = 0) {
  return {
    id: nextGroundWeaponId++,
    weaponId,
    x,
    y,
    vx,
    vy,
    angle,
    spin,
    grounded: Math.abs(vx) < 30 && Math.abs(vy) < 30,
  };
}

function spawnGroundWeapons() {
  return [];
}

function updatePlayerHint() {
  if (!player || state !== 'playing') return;
  const w = getW(player);
  const weaponName = w ? w.name : 'без оружия';
  hintEl.textContent = `Движение мыши — тяга | E — выбросить/подобрать | ${weaponName}`;
}

function findNearbyGroundWeapon(ship) {
  let best = null;
  let bestDist = GROUND_PICKUP_RANGE;

  for (const gw of groundWeapons) {
    if (!gw.grounded && Math.hypot(gw.vx, gw.vy) > 50) continue;
    const dist = Math.hypot(ship.x - gw.x, ship.y - gw.y);
    if (dist < bestDist) {
      bestDist = dist;
      best = gw;
    }
  }

  return best;
}

function dropGroundWeapon(weaponId, x, y, vx, vy, angle, spin) {
  groundWeapons.push(createGroundWeapon(weaponId, x, y, vx, vy, angle, spin));
}

function throwPlayerWeapon() {
  if (!player.weaponId) return;

  const head = getHammerHead(player);
  const dt = Math.max(0.001, player.lastChainDt || 0.016);
  let hvx = (head.x - head.prev.x) / dt;
  let hvy = (head.y - head.prev.y) / dt;
  if (!Number.isFinite(hvx)) hvx = 0;
  if (!Number.isFinite(hvy)) hvy = 0;
  const throwVx = hvx * 0.95 + player.vx * 0.55;
  const throwVy = hvy * 0.95 + player.vy * 0.55;
  const speed = Math.hypot(throwVx, throwVy);
  const angle = speed > 40 ? Math.atan2(throwVy, throwVx) : 0;
  const spin = speed * 0.04;

  dropGroundWeapon(
    player.weaponId,
    head.x,
    head.y,
    throwVx,
    throwVy,
    angle,
    spin,
  );

  if (isOnline()) {
    const gw = groundWeapons[groundWeapons.length - 1];
    window.Net.sendGround('drop', {
      id: gw.id,
      weaponId: gw.weaponId,
      x: gw.x,
      y: gw.y,
      vx: gw.vx,
      vy: gw.vy,
      angle: gw.angle,
      spin: gw.spin,
    });
  }

  player.weaponId = null;
  player.chain = [];
  player.weaponAngVel = 0;
  player.prevPivotX = player.x;
  player.prevPivotY = player.y;
  addSparks(head.x, head.y, 8, '#ccaa66');
  if (window.Audio) window.Audio.playThrow();
  updatePlayerHint();
}

function pickupGroundWeapon(gw) {
  if (player.weaponId) {
    dropGroundWeapon(
      player.weaponId,
      player.x,
      player.y + SHIP_R * 0.4,
      player.vx * 0.25,
      player.vy * 0.25,
      0,
      0,
    );
    if (isOnline()) {
      const dropped = groundWeapons[groundWeapons.length - 1];
      window.Net.sendGround('drop', {
        id: dropped.id,
        weaponId: dropped.weaponId,
        x: dropped.x,
        y: dropped.y,
        vx: dropped.vx,
        vy: dropped.vy,
        angle: dropped.angle,
        spin: dropped.spin,
      });
    }
  }

  player.weaponId = gw.weaponId;
  initHammerState(player);
  groundWeapons = groundWeapons.filter((w) => w.id !== gw.id);
  if (isOnline()) {
    window.Net.sendGround('remove', { id: gw.id });
  }
  addSparks(player.x, player.y, 10, '#ffdd88');
  if (window.Audio) window.Audio.playPickup();
  updatePlayerHint();
}

function handleWeaponInteract() {
  if (state !== 'playing' || !player) return;
  pendingWeaponToggle = true;
}

function updateGroundWeapons(dt) {
  const floor = floorY();

  for (const gw of groundWeapons) {
    gw.vy += CHAIN_GRAVITY * 0.9 * dt;
    gw.x += gw.vx * dt;
    gw.y += gw.vy * dt;
    gw.angle += gw.spin * dt;
    gw.spin *= 0.992;

    if (gw.y >= floor) {
      gw.y = floor;
      if (gw.vy > 0) {
        gw.vy *= -GROUND_WEAPON_BOUNCE;
        gw.spin += gw.vx * 0.008;
      }
      gw.vx *= GROUND_WEAPON_FRICTION;
      gw.grounded = Math.abs(gw.vx) < 25 && Math.abs(gw.vy) < 20;
      if (gw.grounded) {
        gw.angle = Math.PI / 2 + (gw.weaponId === 'greatsword' ? 0.1 : 0);
        gw.spin *= 0.85;
      }
    }

  }
}

function applyElasticBounce(ax, ay, bx, by, nx, ny, massA, massB, restitution) {
  const relVn = (ax - bx) * nx + (ay - by) * ny;
  if (relVn >= 0) return 0;

  const invA = 1 / massA;
  const invB = 1 / massB;
  const impulse = -(1 + restitution) * relVn / (invA + invB);
  return impulse;
}

function applyTipImpulse(tip, ship, ix, iy) {
  const dt = Math.max(0.001, ship.lastChainDt || 0.016);
  tip.ox -= ix * dt;
  tip.oy -= iy * dt;
}

function nudgePivotHead(ship, nx, ny, dist) {
  const w = getW(ship);
  const len = weaponReachLen(w);
  const tgx = -Math.sin(ship.weaponAngle);
  const tgy = Math.cos(ship.weaponAngle);
  const along = tgx * nx + tgy * ny;
  ship.weaponAngle += (dist / len) * along;
}

function separateWeaponHead(ship, nx, ny, dist) {
  if (isPivotMount(ship)) {
    nudgePivotHead(ship, nx, ny, dist);
    return;
  }
  const tip = ship.chain[ship.chain.length - 1];
  tip.x += nx * dist;
  tip.y += ny * dist;
}

function applyHeadImpulse(ship, ix, iy) {
  if (isPivotMount(ship)) {
    const w = getW(ship);
    const len = weaponReachLen(w);
    const rx = Math.cos(ship.weaponAngle) * len;
    const ry = Math.sin(ship.weaponAngle) * len;
    const torque = rx * iy - ry * ix;
    ship.weaponAngVel += torque / (weaponInertia(ship.weaponId) * len * 0.85);
    return;
  }
  const tip = ship.chain[ship.chain.length - 1];
  applyTipImpulse(tip, ship, ix, iy);
}

function bounceAttachedHeads(shipA, shipB, restitution) {
  if (!hasEquippedWeapon(shipA) || !hasEquippedWeapon(shipB)) {
    return 0;
  }

  const headA = getHammerHead(shipA);
  const headB = getHammerHead(shipB);
  const wA = getW(shipA);
  const wB = getW(shipB);
  const dist = Math.hypot(headA.x - headB.x, headA.y - headB.y);
  const minD = wA.headR + wB.headR;
  if (dist >= minD || dist < 0.001) return 0;

  const nx = (headA.x - headB.x) / dist;
  const ny = (headA.y - headB.y) / dist;
  const overlap = minD - dist;
  const mA = weaponMass(shipA.weaponId);
  const mB = weaponMass(shipB.weaponId);
  const invA = 1 / mA;
  const invB = 1 / mB;

  separateWeaponHead(shipA, nx, ny, overlap * (invA / (invA + invB)));
  separateWeaponHead(shipB, -nx, -ny, overlap * (invB / (invA + invB)));

  const relVn = (headA.vx - headB.vx) * nx + (headA.vy - headB.vy) * ny;
  const impactSpeed = Math.max(0, -relVn);
  const impulse = applyElasticBounce(
    headA.vx, headA.vy, headB.vx, headB.vy, nx, ny, mA, mB, restitution,
  );
  if (!impulse) return impactSpeed;

  applyHeadImpulse(shipA, impulse * nx / mA, impulse * ny / mA);
  applyHeadImpulse(shipB, -impulse * nx / mB, -impulse * ny / mB);

  if (impactSpeed > 30) {
    addSparks((headA.x + headB.x) / 2, (headA.y + headB.y) / 2, 5 + Math.floor(impactSpeed / 45), '#ffffff');
    shake = Math.min(14, shake + impactSpeed * 0.04);
    if (window.Audio) window.Audio.playClash(impactSpeed / 280);
  }

  return impactSpeed;
}

function resolveAttachedWeaponCollisions() {
  const armed = [player, ...enemies.filter((e) => e.health > 0 && e.weaponId)].filter(Boolean);

  for (let iter = 0; iter < ATTACHED_WEAPON_COLLISION_ITERS; iter++) {
    for (let i = 0; i < armed.length; i++) {
      for (let j = i + 1; j < armed.length; j++) {
        bounceAttachedHeads(armed[i], armed[j], ATTACHED_WEAPON_RESTITUTION);
      }
    }
  }
}

function resolveGroundWeaponCollisions() {
  const ships = [player, ...enemies.filter((e) => e.health > 0)].filter(Boolean);
  const wallPad = 12;

  for (let iter = 0; iter < GROUND_WEAPON_COLLISION_ITERS; iter++) {
    for (const gw of groundWeapons) {
      const w = WEAPONS[gw.weaponId];
      const rGw = w.headR;
      const mGw = weaponMass(gw.weaponId);

      if (gw.x - rGw < arenaLeft + wallPad) {
        gw.x = arenaLeft + wallPad + rGw;
        if (gw.vx < 0) gw.vx *= -GROUND_WEAPON_RESTITUTION;
      } else if (gw.x + rGw > arenaRight - wallPad) {
        gw.x = arenaRight - wallPad - rGw;
        if (gw.vx > 0) gw.vx *= -GROUND_WEAPON_RESTITUTION;
      }

      if (gw.y - rGw < arenaTop) {
        gw.y = arenaTop + rGw;
        if (gw.vy < 0) gw.vy *= -GROUND_WEAPON_RESTITUTION * 0.7;
        gw.grounded = false;
      }

      for (const ship of ships) {
        if (hasEquippedWeapon(ship)) {
          const head = getHammerHead(ship);
          const tR = getW(ship).headR;
          if (Math.hypot(gw.x - head.x, gw.y - head.y) < rGw + tR) continue;
        }

        const dx = gw.x - ship.x;
        const dy = gw.y - ship.y;
        const dist = Math.hypot(dx, dy);
        const minD = rGw + SHIP_R;
        if (dist >= minD || dist < 0.001) continue;

        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = minD - dist;
        gw.x += nx * overlap;
        gw.y += ny * overlap;
        gw.grounded = false;

        const relVn = (gw.vx - ship.vx) * nx + (gw.vy - ship.vy) * ny;
        const impactSpeed = Math.max(0, -relVn);
        const impulse = applyElasticBounce(
          gw.vx, gw.vy, ship.vx, ship.vy, nx, ny, mGw, SHIP_COLLISION_MASS, GROUND_WEAPON_RESTITUTION,
        );
        if (impulse) {
          gw.vx += impulse * nx / mGw;
          gw.vy += impulse * ny / mGw;
          ship.vx -= impulse * nx / SHIP_COLLISION_MASS * 0.4;
          ship.vy -= impulse * ny / SHIP_COLLISION_MASS * 0.4;
          gw.spin += impactSpeed * 0.01;
          if (impactSpeed > 35) {
            addSparks((gw.x + ship.x) / 2, (gw.y + ship.y) / 2, 4 + Math.floor(impactSpeed / 40), '#ccaa88');
            if (window.Audio) window.Audio.playBump(impactSpeed / 250);
          }
        }
      }

      for (const ship of ships) {
        if (!hasEquippedWeapon(ship)) continue;

        const head = getHammerHead(ship);
        const tR = getW(ship).headR;
        const dx = gw.x - head.x;
        const dy = gw.y - head.y;
        const dist = Math.hypot(dx, dy);
        const minD = rGw + tR;
        if (dist >= minD || dist < 0.001) continue;

        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = minD - dist;
        gw.x += nx * overlap;
        gw.y += ny * overlap;
        gw.grounded = false;

        const mHead = weaponMass(ship.weaponId) * 1.4;
        const relVn = (gw.vx - head.vx) * nx + (gw.vy - head.vy) * ny;
        const impactSpeed = Math.max(0, -relVn);
        const impulse = applyElasticBounce(
          gw.vx, gw.vy, head.vx, head.vy, nx, ny, mGw, mHead, GROUND_WEAPON_PAIR_RESTITUTION,
        );
        if (impulse) {
          gw.vx += impulse * nx / mGw;
          gw.vy += impulse * ny / mGw;
          applyHeadImpulse(ship, -impulse * nx / mHead, -impulse * ny / mHead);
          gw.spin += impactSpeed * 0.012;
          if (impactSpeed > 35) {
            addSparks((gw.x + head.x) / 2, (gw.y + head.y) / 2, 5, '#ddeeff');
            if (window.Audio) window.Audio.playClash(impactSpeed / 260);
          }
        }
      }
    }

    for (let i = 0; i < groundWeapons.length; i++) {
      for (let j = i + 1; j < groundWeapons.length; j++) {
        const a = groundWeapons[i];
        const b = groundWeapons[j];
        const wA = WEAPONS[a.weaponId];
        const wB = WEAPONS[b.weaponId];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.hypot(dx, dy);
        const minD = wA.headR + wB.headR;
        if (dist >= minD || dist < 0.001) continue;

        const nx = dx / dist;
        const ny = dy / dist;
        const sepNx = -nx;
        const sepNy = -ny;
        const overlap = minD - dist;
        const mA = weaponMass(a.weaponId);
        const mB = weaponMass(b.weaponId);
        const invA = 1 / mA;
        const invB = 1 / mB;

        a.x += sepNx * overlap * (invA / (invA + invB));
        a.y += sepNy * overlap * (invA / (invA + invB));
        b.x -= sepNx * overlap * (invB / (invA + invB));
        b.y -= sepNy * overlap * (invB / (invA + invB));
        a.grounded = false;
        b.grounded = false;

        const relVn = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        const impactSpeed = Math.max(0, -relVn);
        const impulse = applyElasticBounce(
          a.vx, a.vy, b.vx, b.vy, nx, ny, mA, mB, GROUND_WEAPON_PAIR_RESTITUTION,
        );
        if (impulse) {
          a.vx += impulse * nx / mA;
          a.vy += impulse * ny / mA;
          b.vx -= impulse * nx / mB;
          b.vy -= impulse * ny / mB;
          a.spin += impactSpeed * 0.008 * (Math.random() > 0.5 ? 1 : -1);
          b.spin -= impactSpeed * 0.008 * (Math.random() > 0.5 ? 1 : -1);
          if (impactSpeed > 40) {
            addSparks((a.x + b.x) / 2, (a.y + b.y) / 2, 6, '#ffcc88');
            if (window.Audio) window.Audio.playClash(impactSpeed / 280);
          }
        }
      }
    }
  }
}

function getPivot(ship) {
  return { x: ship.x, y: ship.y };
}

function getShieldSlotAngle(ship, side) {
  return ship.shieldAngle + (side < 0 ? -Math.PI / 2 : Math.PI / 2);
}

function getChainPoints(ship) {
  return ship.chain.map((p) => ({ x: p.x, y: p.y }));
}

function getHammerHead(ship) {
  if (!ship.weaponId) {
    return { x: ship.x, y: ship.y, vx: 0, vy: 0, speed: 0, prev: { x: ship.x, y: ship.y } };
  }

  if (isPivotMount(ship)) {
    const w = getW(ship);
    const pivot = getPivot(ship);
    const len = weaponReachLen(w);
    const hx = pivot.x + Math.cos(ship.weaponAngle) * len;
    const hy = pivot.y + Math.sin(ship.weaponAngle) * len;
    const dt = Math.max(0.001, ship.lastChainDt || 0.016);
    const pivotVx = (pivot.x - ship.prevPivotX) / dt;
    const pivotVy = (pivot.y - ship.prevPivotY) / dt;
    const tangVx = -Math.sin(ship.weaponAngle) * ship.weaponAngVel * len;
    const tangVy = Math.cos(ship.weaponAngle) * ship.weaponAngVel * len;
    const vx = pivotVx + tangVx;
    const vy = pivotVy + tangVy;
    const prevAngle = ship.prevWeaponAngle ?? ship.weaponAngle;
    return {
      x: hx,
      y: hy,
      vx,
      vy,
      speed: Math.hypot(vx, vy),
      prev: {
        x: pivot.x + Math.cos(prevAngle) * len,
        y: pivot.y + Math.sin(prevAngle) * len,
      },
    };
  }

  if (!ship.chain.length) {
    return { x: ship.x, y: ship.y, vx: 0, vy: 0, speed: 0, prev: { x: ship.x, y: ship.y } };
  }

  const head = ship.chain[ship.chain.length - 1];
  const dt = Math.max(0.001, ship.lastChainDt || 0.016);
  const vx = (head.x - head.ox) / dt;
  const vy = (head.y - head.oy) / dt;
  return {
    x: head.x,
    y: head.y,
    vx,
    vy,
    speed: Math.hypot(vx, vy),
    prev: { x: head.ox, y: head.oy },
  };
}

function satisfyChainConstraints(ship, pivot, segLen) {
  const chain = ship.chain;

  for (let iter = 0; iter < CONSTRAINT_ITERS; iter++) {
    chain[0].x = pivot.x;
    chain[0].y = pivot.y;

    for (let i = 0; i < chain.length - 1; i++) {
      const a = chain[i];
      const b = chain[i + 1];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 0.001;
      const diff = (dist - segLen) / dist;
      const offX = dx * diff;
      const offY = dy * diff;
      const invA = i === 0 ? 0 : 1;
      const invB = i + 1 === chain.length - 1 ? 1 / Math.max(1, weaponMass(ship.weaponId) * 0.85) : 1;
      const invSum = invA + invB || 1;

      if (i > 0) {
        a.x += offX * (invA / invSum);
        a.y += offY * (invA / invSum);
      }
      b.x -= offX * (invB / invSum);
      b.y -= offY * (invB / invSum);
    }

    chain[0].x = pivot.x;
    chain[0].y = pivot.y;
  }
}

function updatePivotWeaponPhysics(ship, dt) {
  const w = getW(ship);
  const pivot = getPivot(ship);
  ship.lastChainDt = dt;

  const pivotVx = (pivot.x - ship.prevPivotX) / dt;
  const pivotVy = (pivot.y - ship.prevPivotY) / dt;
  const pivotSpeed = Math.hypot(pivotVx, pivotVy);
  const shipSpeed = Math.hypot(ship.vx, ship.vy);
  const comDist = weaponComDist(w);
  const inertia = weaponInertia(ship.weaponId);
  const inertiaResponse = 3 / inertia;
  const hangAngle = Math.PI / 2;

  const phi = ship.weaponAngle - hangAngle;
  const restStrength = (3 * CHAIN_GRAVITY / (2 * comDist)) * (shipSpeed < 40 ? 1.45 : 1);
  let angAccel = restStrength * Math.sin(-phi);

  const spinFactor = Math.max(0.18, 1 - Math.abs(ship.weaponAngVel) / (w.maxAngVel * 1.15));
  angAccel *= spinFactor * inertiaResponse;

  let swingTorque = 0;
  if (pivotSpeed > 18) {
    const moveAngle = Math.atan2(pivotVy, pivotVx);
    swingTorque = Math.sin(moveAngle - ship.weaponAngle) * pivotSpeed * 0.022 * inertiaResponse;
  }

  const shipDvX = (ship.vx - ship.prevVx) / dt;
  const shipDvY = (ship.vy - ship.prevVy) / dt;
  const shipAcc = Math.hypot(shipDvX, shipDvY);
  if (shipAcc > 120) {
    const accAngle = Math.atan2(shipDvY, shipDvX);
    swingTorque += Math.sin(accAngle - ship.weaponAngle) * shipAcc * 0.00032 * inertiaResponse;
  }

  ship.prevWeaponAngle = ship.weaponAngle;
  ship.weaponAngVel += (angAccel + swingTorque) * dt;
  const bearingDamp = w.bearingDamp ?? 0.993;
  const heavyDamp = 1 - (1 - bearingDamp) / Math.sqrt(Math.max(0.7, inertia / 3));
  ship.weaponAngVel *= shipSpeed < 35 ? 0.988 : heavyDamp;
  ship.weaponAngVel = Math.max(-w.maxAngVel, Math.min(w.maxAngVel, ship.weaponAngVel));
  ship.weaponAngle += ship.weaponAngVel * dt;

  ship.prevPivotX = pivot.x;
  ship.prevPivotY = pivot.y;
}

function updateHammerPhysics(ship, dt) {
  if (!ship.weaponId) return;

  if (isPivotMount(ship)) {
    updatePivotWeaponPhysics(ship, dt);
    return;
  }

  if (!ship.chain.length) return;

  const w = getW(ship);
  const pivot = getPivot(ship);
  const chain = ship.chain;
  const segLen = ship.chainSegLen;
  const dtSq = dt * dt;
  const mass = weaponMass(ship.weaponId);
  const headDamp = 1 - (1 - VERLET_DAMP) / Math.sqrt(Math.max(0.7, mass / 3));

  ship.lastChainDt = dt;

  const pivotDx = pivot.x - ship.prevPivotX;
  const pivotDy = pivot.y - ship.prevPivotY;

  chain[0].x = pivot.x;
  chain[0].y = pivot.y;
  chain[0].ox += pivotDx;
  chain[0].oy += pivotDy;

  const shipSpeed = Math.hypot(ship.vx, ship.vy);
  const gravBoost = shipSpeed < 40 ? 1.35 : 1;

  for (let i = 1; i < chain.length; i++) {
    const p = chain[i];
    const isHead = i === chain.length - 1;
    const grav = CHAIN_GRAVITY * gravBoost * (isHead ? HEAD_GRAVITY_MULT * Math.sqrt(mass / 3) : LINK_GRAVITY_MULT);
    const damp = isHead ? headDamp : VERLET_DAMP;
    const vx = (p.x - p.ox) * damp;
    const vy = (p.y - p.oy) * damp;

    p.ox = p.x;
    p.oy = p.y;
    p.x += vx;
    p.y += vy + grav * dtSq;
  }

  satisfyChainConstraints(ship, pivot, segLen);

  ship.prevPivotX = pivot.x;
  ship.prevPivotY = pivot.y;
}

function applyWeaponPull(ship, dt) {
  if (!hasEquippedWeapon(ship)) return;

  const head = getHammerHead(ship);
  const relVx = head.vx - ship.vx;
  const relVy = head.vy - ship.vy;
  const relSpeed = Math.hypot(relVx, relVy);
  if (relSpeed < 10) return;

  const mass = weaponMass(ship.weaponId);
  let pullAx = relVx * mass * WEAPON_PULL_COUPLING;
  let pullAy = relVy * mass * WEAPON_PULL_COUPLING;
  const pull = Math.hypot(pullAx, pullAy);
  if (pull > WEAPON_PULL_MAX_ACCEL) {
    pullAx = (pullAx / pull) * WEAPON_PULL_MAX_ACCEL;
    pullAy = (pullAy / pull) * WEAPON_PULL_MAX_ACCEL;
  }

  ship.vx += pullAx * dt;
  ship.vy += pullAy * dt;
}

function updateShipPhysics(ship, dt, target) {
  ship.prevVx = ship.vx;
  ship.prevVy = ship.vy;

  const controlMass = shipControlMass(ship);
  const accelScale = SHIP_CONTROL_MASS / controlMass;
  const maxControlAccel = (ship.team === 'enemy' ? ENEMY_THRUST : THRUST) * accelScale;

  let ax = 0;
  let ay = 0;

  if (ship.team === 'player' && target) {
    const input = Math.hypot(target.thrustX, target.thrustY);
    if (input > MOUSE_THRUST_DEADZONE) {
      const power = Math.min(1, input);
      ax = (target.thrustX / input) * maxControlAccel * power;
      ay = (target.thrustY / input) * maxControlAccel * power;
    }

    const decay = Math.exp(-MOUSE_THRUST_DECAY * dt);
    target.thrustX *= decay;
    target.thrustY *= decay;
  } else if (ship.team === 'enemy' && target) {
    ship.aiTimer -= dt;
    const dx = target.x - ship.x;
    const dy = target.y - ship.y;
    const dist = Math.hypot(dx, dy) || 1;
    const px = -dy / dist;
    const py = dx / dist;

    if (ship.aiTimer <= 0) {
      ship.aiTimer = 0.8 + Math.random() * 1.4;
      ship.aiDir = Math.random() > 0.45 ? 1 : -1;
    }

    const aw = arenaWidth();
    const chase = dist > aw * 0.5 ? 0.75 : dist < aw * 0.3 ? -0.25 : 0.15;
    const strafe = ship.aiDir * 0.65;
    ax = ((dx / dist) * chase + px * strafe) * ENEMY_THRUST;
    ay = ((dy / dist) * chase + py * strafe) * ENEMY_THRUST;

    if (Math.random() < 0.012) {
      ax += (Math.random() - 0.5) * ENEMY_THRUST * 1.2;
      ay += (Math.random() - 0.5) * ENEMY_THRUST * 1.2;
    }
  }

  const accel = Math.hypot(ax, ay);
  if (accel > maxControlAccel) {
    ax = (ax / accel) * maxControlAccel;
    ay = (ay / accel) * maxControlAccel;
  }

  ship.vx += ax * dt;
  ship.vy += ay * dt;
  applyWeaponPull(ship, dt);
  const drag = ship.team === 'player' ? PLAYER_COAST_DRAG : DRAG;
  ship.vx *= drag;
  ship.vy *= drag;

  const speed = Math.hypot(ship.vx, ship.vy);
  const baseMaxSpeed = ship.team === 'enemy' ? ENEMY_MAX_SPEED : MAX_SPEED;
  const maxSpeed = baseMaxSpeed * (0.88 + accelScale * 0.12);
  if (speed > maxSpeed) {
    ship.vx = (ship.vx / speed) * maxSpeed;
    ship.vy = (ship.vy / speed) * maxSpeed;
  }

  ship.x += ship.vx * dt;
  ship.y += ship.vy * dt;

  if (ship.x < arenaLeft + SHIP_R) { ship.x = arenaLeft + SHIP_R; ship.vx *= -0.4; }
  if (ship.x > arenaRight - SHIP_R) { ship.x = arenaRight - SHIP_R; ship.vx *= -0.4; }
  if (ship.y < arenaTop + SHIP_R) { ship.y = arenaTop + SHIP_R; ship.vy *= -0.4; }
  if (ship.y > arenaY - SHIP_R - 10) { ship.y = arenaY - SHIP_R - 10; ship.vy *= -0.4; }

  if (ship.hitFlash > 0) ship.hitFlash -= dt;
}

function updateShieldPhysics(ship, dt) {
  const speed = Math.hypot(ship.vx, ship.vy);
  let swingTorque = 0;

  if (speed > 4) {
    const moveAngle = Math.atan2(ship.vy, ship.vx);
    swingTorque = Math.sin(moveAngle - ship.shieldAngle) * speed * 0.022;
  }

  const shipDvX = (ship.vx - ship.prevVx) / dt;
  const shipDvY = (ship.vy - ship.prevVy) / dt;
  const shipAcc = Math.hypot(shipDvX, shipDvY);
  if (shipAcc > 80) {
    const accAngle = Math.atan2(shipDvY, shipDvX);
    swingTorque += Math.sin(accAngle - ship.shieldAngle) * shipAcc * 0.00035;
  }

  ship.shieldAngVel += swingTorque * dt;
  ship.shieldAngVel *= SHIELD_BEARING_DAMP;
  ship.shieldAngVel = Math.max(-SHIELD_MAX_ANG_VEL, Math.min(SHIELD_MAX_ANG_VEL, ship.shieldAngVel));
  ship.shieldAngle += ship.shieldAngVel * dt;
}

function distPointSeg(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / (abx * abx + aby * aby + 0.001)));
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  return { dist: Math.hypot(px - cx, py - cy), cx, cy, t };
}

function addSparks(x, y, count, color) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 80 + Math.random() * 260;
    sparks.push({
      x, y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: 0.25 + Math.random() * 0.35,
      color,
    });
  }
}

function addRibbon(ship) {
  if (!ship.weaponId) return;

  const head = getHammerHead(ship);
  if (head.speed < 14) return;
  ribbons.push({
    x: head.x,
    y: head.y,
    angle: Math.atan2(head.y - head.prev.y, head.x - head.prev.x),
    life: 0.35,
    width: Math.min(28, head.speed * 0.8),
    color: ship.team === 'player' ? 'rgba(255,200,80,' : 'rgba(255,90,50,',
  });
}

function calcHammerDamage(hammerSpeed, attacker) {
  if (hammerSpeed < MIN_HIT_SPEED) return 0;
  const w = getW(attacker);
  if (!w) return 0;
  const excess = hammerSpeed - MIN_HIT_SPEED;
  const base = Math.min(MAX_DAMAGE, MIN_DAMAGE + excess * DAMAGE_PER_SPEED);
  let dmg = base * w.damageMult;
  if (attacker.team === 'enemy') dmg *= ENEMY_DAMAGE_MULT;
  return dmg;
}

function getShieldWorldPos(ship, side) {
  const slotAngle = getShieldSlotAngle(ship, side);
  return {
    x: ship.x + Math.cos(slotAngle) * SHIELD_ORBIT_R,
    y: ship.y + Math.sin(slotAngle) * SHIELD_ORBIT_R,
  };
}

function spawnShieldDebris(ship, side, hammerSpeed) {
  const pos = getShieldWorldPos(ship, side);
  const baseAngle = getShieldSlotAngle(ship, side);

  for (let i = 0; i < 8; i++) {
    const angle = baseAngle + (Math.random() - 0.5) * 1.4;
    const speed = 140 + hammerSpeed * 0.12 + Math.random() * 200;
    debris.push({
      x: pos.x + (Math.random() - 0.5) * 14,
      y: pos.y + (Math.random() - 0.5) * 22,
      vx: Math.cos(angle) * speed + ship.vx * 0.5,
      vy: Math.sin(angle) * speed + ship.vy * 0.5,
      rotation: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 14,
      w: 5 + Math.random() * 9,
      h: 7 + Math.random() * 12,
      life: 1.1 + Math.random() * 0.9,
      color: Math.random() > 0.5 ? '#6a6a78' : '#8a8a98',
    });
  }

  addSparks(pos.x, pos.y, 14, '#aab0c0');
  shake = Math.min(10, shake + 3);
}

function tryShieldBlock(defender, hitX, hitY, hammerSpeed) {
  const hitR = isOnline() ? 34 : 26;

  for (const shield of defender.shields) {
    if (!shield.intact) continue;

    const pos = getShieldWorldPos(defender, shield.side);
    const dist = Math.hypot(hitX - pos.x, hitY - pos.y);
    if (dist > hitR) continue;

    return shield.side;
  }

  return false;
}

function resolveBodyHit(attacker, defender, hammerSpeed, hitX, hitY) {
  const now = performance.now();
  const cdKey = String(attacker.id);
  if (defender.hitCooldown[cdKey] && defender.hitCooldown[cdKey] > now) return;

  const dmg = calcHammerDamage(hammerSpeed, attacker);
  if (dmg <= 0) return;

  defender.hitCooldown[cdKey] = now + HIT_COOLDOWN_MS;

  const blockedSide = tryShieldBlock(defender, hitX, hitY, hammerSpeed);
  if (blockedSide !== false) {
    if (isOnline() && attacker === player && defender.team === 'enemy') {
      const enemyShield = defender.shields.find((s) => s.side === blockedSide);
      if (enemyShield) enemyShield.intact = false;
      window.Net.sendHit({
        blocked: true,
        shieldSide: blockedSide,
        hitX,
        hitY,
        hammerSpeed,
        weaponId: attacker.weaponId,
      });
    } else {
      applyShieldBreak(defender, blockedSide, hammerSpeed, attacker);
    }
    if (isOnline() && attacker === player && defender.team === 'enemy' && window.Audio) {
      window.Audio.playShield(hammerSpeed / 220);
    }
    return;
  }

  defender.health = Math.max(0, defender.health - dmg);
  defender.hitFlash = 0.2;
  defender.dmgFlash = 1;

  if (isOnline() && attacker === player && defender.team === 'enemy') {
    window.Net.sendHit({
      blocked: false,
      hitX,
      hitY,
      hammerSpeed,
      weaponId: attacker.weaponId,
    });
  }

  const nx = defender.x - attacker.x;
  const ny = defender.y - attacker.y;
  const len = Math.hypot(nx, ny) || 1;
  defender.vx += (nx / len) * hammerSpeed * 0.04;
  defender.vy += (ny / len) * hammerSpeed * 0.04;
  attacker.vx -= (nx / len) * hammerSpeed * 0.01;
  attacker.vy -= (ny / len) * hammerSpeed * 0.01;
  addSparks(defender.x, defender.y, 8 + Math.floor(dmg / 8), '#ffcc66');
  shake = Math.min(12, shake + dmg * 0.15);
  if (window.Audio) window.Audio.playHit(dmg / MAX_DAMAGE);
}

function checkHammerHits(attacker, targets) {
  if (!attacker.weaponId) return;

  const head = getHammerHead(attacker);
  const chain = getChainPoints(attacker);
  const hSpeed = head.speed;
  const hitR = getW(attacker).headR;

  for (const target of targets) {
    const bodyDist = Math.hypot(head.x - target.x, head.y - target.y);
    if (bodyDist < hitR + SHIP_R) {
      if (shouldDealDamage(attacker)) {
        resolveBodyHit(attacker, target, hSpeed, head.x, head.y);
      } else if (hSpeed > MIN_HIT_SPEED) {
        addSparks(target.x, target.y, 6, '#ffaa66');
      }
    }

    const tWeapon = getW(target);
    if (tWeapon) {
      const tHead = getHammerHead(target);
      const tHitR = tWeapon.headR;
      const headDist = Math.hypot(head.x - tHead.x, head.y - tHead.y);
      if (headDist < hitR + tHitR && headDist > 0.001) {
        if (shouldDealDamage(attacker)) {
          resolveBodyHit(attacker, target, hSpeed, head.x, head.y);
        }
        if (shouldDealDamage(target) && tHead.speed >= MIN_HIT_SPEED) {
          resolveBodyHit(target, attacker, tHead.speed, tHead.x, tHead.y);
        }
        if (hSpeed > 60 || tHead.speed > 60) {
          addSparks((head.x + tHead.x) / 2, (head.y + tHead.y) / 2, 8, '#ffffff');
          if (window.Audio) window.Audio.playClash((hSpeed + tHead.speed) / 400);
        }
        shake = Math.min(14, shake + 4);
      }
    }

    if (!target.weaponId) continue;

    const tChain = getChainPoints(target);
    for (let i = 1; i < chain.length; i++) {
      for (let j = 1; j < tChain.length; j++) {
        const a = chain[i - 1];
        const b = chain[i];
        const c = tChain[j - 1];
        const d = tChain[j];
        const midA = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const midB = { x: (c.x + d.x) / 2, y: (c.y + d.y) / 2 };
        const cd = Math.hypot(midA.x - midB.x, midA.y - midB.y);
        if (cd < 20 && hSpeed > 100) {
          addSparks((midA.x + midB.x) / 2, (midA.y + midB.y) / 2, 6, '#ffaa44');
        }
      }
    }
  }
}

function resolveShipCollisions(ships) {
  for (let i = 0; i < ships.length; i++) {
    for (let j = i + 1; j < ships.length; j++) {
      const a = ships[i];
      const b = ships[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      const minD = SHIP_R * 2;
      if (dist < minD && dist > 0) {
        const overlap = minD - dist;
        const nx = dx / dist;
        const ny = dy / dist;
        a.x -= nx * overlap * 0.5;
        a.y -= ny * overlap * 0.5;
        b.x += nx * overlap * 0.5;
        b.y += ny * overlap * 0.5;
        const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (rel > 0) {
          a.vx -= nx * rel * 0.35;
          a.vy -= ny * rel * 0.35;
          b.vx += nx * rel * 0.35;
          b.vy += ny * rel * 0.35;
          if (window.Audio) window.Audio.playBump(rel / 200);
        }
      }
    }
  }
}

function updateHud() {
  if (!player) return;

  playerHpEl.textContent = Math.max(0, Math.ceil(player.health));
  playerNeedleEl.style.transform = `rotate(${-120 + (player.health / player.maxHealth) * 240}deg)`;

  const trainingDummy = enemies.find((e) => e.isTrainingDummy);
  if (trainingDummy) {
    enemyCountEl.textContent = '∞';
    enemyNeedleEl.style.transform = 'rotate(120deg)';
    return;
  }

  const alive = enemies.filter((e) => e.health > 0).length;
  enemyCountEl.textContent = alive;
  const avgHp = enemies.length
    ? enemies.reduce((s, e) => s + Math.max(0, e.health), 0) / enemies.length
    : 0;
  const avgMaxHp = enemies.length
    ? enemies.reduce((s, e) => s + (e.maxHealth || DEFAULT_MAX_HEALTH), 0) / enemies.length
    : DEFAULT_MAX_HEALTH;
  enemyNeedleEl.style.transform = `rotate(${-120 + (avgHp / avgMaxHp) * 240}deg)`;
}

function startCombatAudio() {
  if (!window.Audio) return;
  window.Audio.ensure().then(() => window.Audio.startBattleMusic());
}

function stopCombatAudio() {
  window.Audio?.stopBattleMusic();
}

function resetMouseInput() {
  mouse.thrustX = 0;
  mouse.thrustY = 0;
}

function requestGameplayPointerLock() {
  const lock = canvas.requestPointerLock?.();
  if (lock?.catch) lock.catch(() => {});
}

function enterGameplayInput() {
  resetMouseInput();
  document.body.style.cursor = 'none';
  requestGameplayPointerLock();
}

function leaveGameplayInput() {
  resetMouseInput();
  document.body.style.cursor = '';
  if (document.pointerLockElement === canvas) {
    document.exitPointerLock?.();
  }
}

function closePauseMenu() {
  pauseMenu?.classList.add('hidden');
  if (state === 'paused') {
    state = 'playing';
    enterGameplayInput();
  }
}

function openPauseMenu() {
  if (state !== 'playing') return;
  leaveGameplayInput();
  state = 'paused';
  pauseMenu?.classList.remove('hidden');
}

function exitMatchToMenu() {
  pauseMenu?.classList.add('hidden');
  stopCombatAudio();
  leaveGameplayInput();
  window.Net?.disconnect();
  const url = new URL(location.href);
  url.searchParams.delete('room');
  history.replaceState(null, '', url);
  showLobby();
}

function checkGameEnd() {
  if (player.health <= 0) {
    state = 'defeat';
    leaveGameplayInput();
    if (window.Audio) window.Audio.playDefeat();
    overlayTitle.textContent = 'ПОРАЖЕНИЕ';
    overlayText.textContent = isOnline() ? 'Кликните для реванша' : 'Кликните для реванша';
    overlaySub.textContent = isOnline() ? 'Соперник победил' : '';
    overlaySub.classList.toggle('hidden', !isOnline());
    lobbyActions.classList.add('hidden');
    inviteBox.classList.add('hidden');
    overlay.classList.remove('hidden');
    hintEl.textContent = '';
    return;
  }
  if (enemies.every((e) => e.health <= 0)) {
    state = 'victory';
    leaveGameplayInput();
    if (window.Audio) window.Audio.playVictory();
    overlayTitle.textContent = 'ПОБЕДА';
    overlayText.textContent = 'Кликните для реванша';
    overlaySub.textContent = isOnline() ? 'Онлайн-дуэль' : '';
    overlaySub.classList.toggle('hidden', !isOnline());
    lobbyActions.classList.add('hidden');
    inviteBox.classList.add('hidden');
    overlay.classList.remove('hidden');
    hintEl.textContent = '';
  }
}

function update(dt) {
  if (state !== 'playing') return;

  const thrustDecay = Math.exp(-MOUSE_THRUST_DECAY * dt);
  mouse.thrustX *= thrustDecay;
  mouse.thrustY *= thrustDecay;
  if (Math.hypot(mouse.thrustX, mouse.thrustY) < MOUSE_THRUST_DEADZONE) {
    mouse.thrustX = 0;
    mouse.thrustY = 0;
  }

  window.Net?.sendInput({
    thrustX: mouse.thrustX,
    thrustY: mouse.thrustY,
    weaponToggle: pendingWeaponToggle,
  });
  pendingWeaponToggle = false;

  if (player) addRibbon(player);
  for (const enemy of enemies) {
    if (enemy.health > 0) addRibbon(enemy);
  }

  for (let i = ribbons.length - 1; i >= 0; i--) {
    ribbons[i].life -= dt;
    if (ribbons[i].life <= 0) ribbons.splice(i, 1);
  }

  if (player?.dmgFlash > 0) player.dmgFlash -= dt * 3;
  for (const enemy of enemies) {
    if (enemy.dmgFlash > 0) enemy.dmgFlash -= dt * 3;
  }

  updateHud();
}

function drawBackground() {
  const sky = ctx.createLinearGradient(0, 0, 0, arenaY);
  sky.addColorStop(0, '#1a0a08');
  sky.addColorStop(0.35, '#6b2010');
  sky.addColorStop(0.7, '#c45a20');
  sky.addColorStop(1, '#8b4020');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, arenaY);

  for (let i = 0; i < 6; i++) {
    const cx = (W / 6) * i + Math.sin(i * 2.1) * 50;
    const cy = arenaTop + 30 + i * 22;
    const grd = ctx.createRadialGradient(cx, cy, 10, cx, cy, 160 + i * 26);
    grd.addColorStop(0, 'rgba(255,120,40,0.35)');
    grd.addColorStop(1, 'rgba(255,60,10,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, arenaTop, W, arenaY - arenaTop);
  }

  ctx.fillStyle = '#2a1810';
  ctx.fillRect(0, arenaY - 4, W, H - arenaY + 4);

  ctx.fillStyle = '#1a1008';
  for (let i = 0; i < 9; i++) {
    const px = W * 0.04 + i * (W * 0.115);
    ctx.fillRect(px, arenaY, 28, H - arenaY);
    ctx.beginPath();
    ctx.ellipse(px + 14, arenaY, 20, 8, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = 'rgba(10,5,3,0.75)';
  for (let i = 0; i < 32; i++) {
    const bx = (i / 32) * W + (i % 3) * 8;
    const bh = 28 + (i % 5) * 11;
    ctx.fillRect(bx, arenaY - bh - 18, 8, bh);
    ctx.beginPath();
    ctx.arc(bx + 4, arenaY - bh - 18, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, arenaY - 48, W, 48);
}

function drawRibbons() {
  for (const r of ribbons) {
    const alpha = r.life / 0.35;
    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.rotate(r.angle);
    const w = r.width * alpha;
    const grad = ctx.createLinearGradient(-w, 0, w * 0.5, 0);
    grad.addColorStop(0, r.color + '0)');
    grad.addColorStop(0.4, r.color + (0.35 * alpha) + ')');
    grad.addColorStop(1, r.color + '0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-w, -4 * alpha);
    ctx.quadraticCurveTo(w * 0.3, 0, w * 0.5, 0);
    ctx.quadraticCurveTo(w * 0.3, 0, -w, 4 * alpha);
    ctx.fill();
    ctx.restore();
  }
}

function drawWeaponHead(weaponId, team) {
  const tint = team === 'player' ? 1 : 0.85;
  const w = WEAPONS[weaponId];

  ctx.fillStyle = w.color;

  if (weaponId === 'mace') {
    ctx.fillRect(-8, -5, 22, 10);
    ctx.beginPath();
    ctx.arc(16, 0, w.headR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#666050';
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(16 + Math.cos(a) * (w.headR - 4), Math.sin(a) * (w.headR - 4));
      ctx.lineTo(16 + Math.cos(a) * (w.headR + 5), Math.sin(a) * (w.headR + 5));
      ctx.stroke();
    }
    return;
  }

  if (weaponId === 'greatsword') {
    const bw = w.bladeW || 24;
    const bl = w.bladeLen || 76;
    const blade = ctx.createLinearGradient(0, -bw / 2, bl, bw / 2);
    blade.addColorStop(0, `rgba(235,242,255,${tint})`);
    blade.addColorStop(0.55, `rgba(190,200,220,${tint})`);
    blade.addColorStop(1, `rgba(130,140,165,${tint})`);
    ctx.fillStyle = blade;
    ctx.fillRect(0, -bw / 2, bl, bw);
    ctx.fillStyle = '#707888';
    ctx.fillRect(-5, -bw * 0.75, 10, bw * 1.5);
    ctx.beginPath();
    ctx.moveTo(bl, -bw / 3);
    ctx.lineTo(bl + 16, 0);
    ctx.lineTo(bl, bw / 3);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${0.35 * tint})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(bl * 0.15, 0);
    ctx.lineTo(bl * 0.85, 0);
    ctx.stroke();
    return;
  }

  if (weaponId === 'flail') {
    ctx.fillStyle = '#5a4028';
    ctx.fillRect(-12, -3, 24, 6);
    ctx.strokeStyle = '#4a3828';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(10, 0);
    for (let i = 0; i < 4; i++) {
      const sx = 10 + i * 5;
      const sy = (i % 2 === 0 ? 1 : -1) * 2;
      ctx.lineTo(sx, sy);
    }
    ctx.stroke();
    ctx.fillStyle = w.color;
    ctx.beginPath();
    ctx.arc(30, 0, w.headR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#666050';
    ctx.lineWidth = 2;
    ctx.stroke();
    return;
  }

  if (weaponId === 'axe') {
    ctx.fillStyle = '#5a4028';
    ctx.fillRect(-10, -4, 28, 8);
    ctx.fillStyle = `rgba(170,180,195,${tint})`;
    ctx.beginPath();
    ctx.moveTo(10, -w.headR);
    ctx.quadraticCurveTo(30, 0, 10, w.headR);
    ctx.lineTo(6, 0);
    ctx.fill();
    ctx.strokeStyle = '#888';
    ctx.stroke();
    return;
  }

  if (weaponId === 'halberd') {
    ctx.fillStyle = '#5a4028';
    ctx.fillRect(-18, -3, 50, 6);
    ctx.fillStyle = `rgba(180,190,205,${tint})`;
    ctx.beginPath();
    ctx.moveTo(20, -w.headR - 6);
    ctx.lineTo(34, 0);
    ctx.lineTo(20, w.headR + 6);
    ctx.lineTo(16, 0);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(30, -10);
    ctx.lineTo(38, -10);
    ctx.lineTo(34, -2);
    ctx.fill();
  }
}

function drawPivotWeapon(ship) {
  const w = getW(ship);
  const pivot = getPivot(ship);
  const handleLen = w.handleLen || 14;

  ctx.save();
  ctx.translate(pivot.x, pivot.y);
  ctx.rotate(ship.weaponAngle);

  ctx.fillStyle = ship.team === 'player' ? '#686878' : '#585060';
  ctx.beginPath();
  ctx.arc(0, 0, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#a0a8b8';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#2a2830';
  ctx.beginPath();
  ctx.arc(0, 0, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#4a3420';
  ctx.fillRect(-5, -8, 10, 16);
  ctx.fillStyle = '#6a5030';
  ctx.fillRect(0, -5, handleLen, 10);
  ctx.fillStyle = '#3a2818';
  ctx.fillRect(-2, -6, 6, 12);

  ctx.translate(handleLen, 0);
  drawWeaponHead(ship.weaponId, ship.team);
  ctx.restore();
}

function drawWeapon(ship) {
  if (!ship.weaponId) return;

  if (isPivotMount(ship)) {
    drawPivotWeapon(ship);
    return;
  }

  if (!ship.chain.length) return;

  const chain = getChainPoints(ship);
  const head = chain[chain.length - 1];
  const prev = chain[chain.length - 2];
  const headAngle = Math.atan2(head.y - prev.y, head.x - prev.x);

  const pivot = chain[0];

  ctx.fillStyle = ship.team === 'player' ? '#686878' : '#585060';
  ctx.beginPath();
  ctx.arc(pivot.x, pivot.y, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#a0a8b8';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#2a2830';
  ctx.beginPath();
  ctx.arc(pivot.x, pivot.y, 2.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = ship.team === 'player' ? '#6b4a20' : '#5a2818';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(pivot.x, pivot.y);
  for (let i = 1; i < chain.length; i++) {
    ctx.lineTo(chain[i].x, chain[i].y);
  }
  ctx.stroke();

  ctx.fillStyle = ship.team === 'player' ? '#8b6530' : '#7a4030';
  for (let i = 1; i < chain.length - 1; i++) {
    ctx.beginPath();
    ctx.arc(chain[i].x, chain[i].y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  ctx.translate(head.x, head.y);
  ctx.rotate(headAngle);
  drawWeaponHead(ship.weaponId, ship.team);
  ctx.restore();
}

function drawGroundWeapons() {
  for (const gw of groundWeapons) {
    const w = WEAPONS[gw.weaponId];

    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.beginPath();
    ctx.ellipse(gw.x, floorY() + 4, 18, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(gw.x, gw.y);
    ctx.rotate(gw.angle);
    drawWeaponHead(gw.weaponId, 'player');
    ctx.restore();

    if (gw.grounded) {
      ctx.fillStyle = 'rgba(255, 230, 160, 0.75)';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(w.name, gw.x, gw.y - 28);
    }
  }
}

function drawShieldPlate(ship, side) {
  const shield = ship.shields.find((s) => s.side === side);
  if (!shield || !shield.intact) return;

  const slotAngle = side < 0 ? -Math.PI / 2 : Math.PI / 2;

  ctx.save();
  ctx.translate(Math.cos(slotAngle) * SHIELD_ORBIT_R, Math.sin(slotAngle) * SHIELD_ORBIT_R);
  ctx.rotate(slotAngle + Math.PI / 2);

  const grad = ctx.createLinearGradient(-6, -20, 6, 20);
  grad.addColorStop(0, '#9a9aaa');
  grad.addColorStop(0.45, '#5a5a68');
  grad.addColorStop(1, '#3a3a44');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(-5, -20);
  ctx.lineTo(5, -20);
  ctx.quadraticCurveTo(8, 0, 5, 20);
  ctx.lineTo(-5, 20);
  ctx.quadraticCurveTo(-8, 0, -5, -20);
  ctx.fill();

  ctx.strokeStyle = '#b8b8c8';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = '#2a2a32';
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.arc(0, i * 12, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-3, -14);
  ctx.lineTo(3, -8);
  ctx.stroke();

  ctx.restore();
}

function drawDebris() {
  for (const d of debris) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, d.life);
    ctx.translate(d.x, d.y);
    ctx.rotate(d.rotation);
    ctx.fillStyle = d.color;
    ctx.fillRect(-d.w / 2, -d.h / 2, d.w, d.h);
    ctx.strokeStyle = 'rgba(30,30,40,0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(-d.w / 2, -d.h / 2, d.w, d.h);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawHealthBar(ship) {
  const barW = 54;
  const barH = 7;
  const x = ship.x - barW / 2;
  const y = ship.y - SHIP_R - 32;
  const pct = ship.isTrainingDummy ? 1 : Math.max(0, ship.health / ship.maxHealth);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(x - 1, y - 1, barW + 2, barH + 2);

  ctx.fillStyle = 'rgba(35, 18, 18, 0.9)';
  ctx.fillRect(x, y, barW, barH);

  const grad = ctx.createLinearGradient(x, y, x + barW, y);
  if (ship.team === 'player') {
    grad.addColorStop(0, '#1b5e20');
    grad.addColorStop(1, '#66bb6a');
  } else {
    grad.addColorStop(0, '#7f0000');
    grad.addColorStop(1, '#ef5350');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, barW * pct, barH);

  if (ship.dmgFlash > 0) {
    ctx.fillStyle = `rgba(255, 220, 120, ${ship.dmgFlash * 0.55})`;
    ctx.fillRect(x, y, barW * pct, barH);
  }

  ctx.strokeStyle = ship.team === 'player' ? 'rgba(200, 168, 80, 0.85)' : 'rgba(200, 90, 70, 0.85)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, barW, barH);

  ctx.fillStyle = 'rgba(255, 240, 200, 0.85)';
  ctx.font = 'bold 8px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(ship.isTrainingDummy ? '∞' : String(Math.ceil(ship.health)), ship.x, y - 3);
}

function drawShipHull(ship) {
  if (ship.health <= 0) return;

  drawHealthBar(ship);

  ctx.save();
  ctx.translate(ship.x, ship.y);

  if (ship.hitFlash > 0) {
    ctx.globalAlpha = 0.6 + Math.sin(ship.hitFlash * 40) * 0.4;
  }

  const bodyColor = ship.team === 'player' ? '#5a4a30' : '#4a2820';
  const trim = ship.team === 'player' ? '#8b7530' : '#8b3a20';

  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.ellipse(0, 0, SHIP_R + 4, SHIP_R, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = trim;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#2a2018';
  ctx.beginPath();
  ctx.ellipse(0, 0, 10, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  for (let i = -1; i <= 1; i++) {
    ctx.fillStyle = '#7a6a40';
    ctx.beginPath();
    ctx.arc(-SHIP_R * 0.2, i * 10, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(SHIP_R * 0.2, i * 10, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = ship.team === 'player' ? '#3060a0' : '#a03030';
  ctx.fillRect(-7, -SHIP_R - 16, 14, 10);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 9px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(String(ship.id), 0, -SHIP_R - 8);

  ctx.fillStyle = 'rgba(80,60,30,0.5)';
  ctx.beginPath();
  ctx.ellipse(-10, 4, 8, 5, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(10, 4, 8, 5, -0.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawShipShields(ship) {
  if (ship.health <= 0) return;

  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.rotate(ship.shieldAngle);
  drawShieldPlate(ship, -1);
  drawShieldPlate(ship, 1);
  ctx.restore();
}

function drawSparks() {
  for (const s of sparks) {
    ctx.globalAlpha = s.life / 0.35;
    ctx.fillStyle = s.color;
    ctx.fillRect(s.x - 2, s.y - 2, 4, 4);
  }
  ctx.globalAlpha = 1;
}

function draw() {
  const cam = getCameraTransform();

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0a0604';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(cam.pixelScale, 0, 0, cam.pixelScale, cam.offsetX, cam.offsetY);
  if (shake > 0.5) {
    ctx.translate(
      (Math.random() - 0.5) * shake,
      (Math.random() - 0.5) * shake,
    );
  }

  drawBackground();
  drawGroundWeapons();
  drawRibbons();

  if (player) {
    for (const enemy of enemies) drawShipHull(enemy);
    drawShipHull(player);

    for (const enemy of enemies) drawShipShields(enemy);
    drawShipShields(player);

    for (const enemy of enemies) drawWeapon(enemy);
    drawWeapon(player);
  }

  drawDebris();
  drawSparks();
  ctx.restore();

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawEnemyPointers(cam);
  ctx.restore();
}

function loop(timestamp) {
  const dt = Math.max(0.001, Math.min(0.033, (timestamp - lastTime) / 1000 || 0.016));
  lastTime = timestamp;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

function showLobby() {
  pauseMenu?.classList.add('hidden');
  stopCombatAudio();
  leaveGameplayInput();
  state = 'menu';
  gameMode = 'solo';
  overlayTitle.textContent = 'PEPELATS';
  overlayText.textContent = 'Выберите режим игры';
  overlaySub.classList.add('hidden');
  lobbyActions.classList.remove('hidden');
  inviteBox.classList.add('hidden');
  overlay.classList.remove('hidden');
  hintEl.textContent = '';
}

function beginMatch(slot, mode) {
  window.Audio?.ensure();
  netSlot = slot;
  gameMode = mode || 'duel';
  lastEventTick = -1;
  initDisplayShips();
  enterGameplayInput();
  state = 'playing';
  overlay.classList.add('hidden');
  inviteBox.classList.add('hidden');
  lobbyActions.classList.add('hidden');
  updatePlayerHint();
  const escHint = ' | Esc — меню';
  if (gameMode === 'duel') {
    hintEl.textContent = `Онлайн-дуэль | ${netSlot === 0 ? 'Хост' : 'Гость'} | движение мыши — тяга | E — оружие${escHint}`;
  } else if (gameMode === 'training') {
    hintEl.textContent = `Тренировка | неподвижная мишень с ∞ HP | движение мыши — тяга | E — оружие${escHint}`;
  } else {
    hintEl.textContent = `Движение мыши — тяга | E — выбросить/подобрать оружие${escHint}`;
  }
  startCombatAudio();
}

async function startLocalGame() {
  try {
    await window.Net.createRoom({ mode: 'solo' });
  } catch (err) {
    overlayTitle.textContent = 'ОШИБКА СЕРВЕРА';
    overlayText.textContent = err.message || 'Запустите server: npm start';
    overlay.classList.remove('hidden');
  }
}

async function startTrainingGame() {
  try {
    await window.Net.createRoom({ mode: 'training' });
  } catch (err) {
    overlayTitle.textContent = 'ОШИБКА СЕРВЕРА';
    overlayText.textContent = err.message || 'Запустите server: npm start';
    overlay.classList.remove('hidden');
  }
}

function showMatchEnd(winner) {
  pauseMenu?.classList.add('hidden');
  stopCombatAudio();
  leaveGameplayInput();
  if (winner === netSlot) {
    state = 'victory';
    if (window.Audio) window.Audio.playVictory();
    overlayTitle.textContent = 'ПОБЕДА';
  } else {
    state = 'defeat';
    if (window.Audio) window.Audio.playDefeat();
    overlayTitle.textContent = 'ПОРАЖЕНИЕ';
  }
  overlayText.textContent = 'Кликните для реванша';
  overlaySub.classList.toggle('hidden', gameMode === 'solo' || gameMode === 'training');
  overlaySub.textContent = gameMode === 'duel' ? 'Онлайн-дуэль' : gameMode === 'training' ? 'Тренировка' : '';
  lobbyActions.classList.add('hidden');
  inviteBox.classList.add('hidden');
  overlay.classList.remove('hidden');
  hintEl.textContent = '';
}

function tryStart() {
  if (state === 'victory' || state === 'defeat') {
    window.Net.requestRematch();
  }
}

function initNetHandlers() {
  window.Net.on('snapshot', (msg) => {
    applyServerState(msg.state);
    processServerEvents(msg.state.events, msg.tick);
  });

  window.Net.on('match_end', (msg) => {
    applyServerState(msg.state);
    showMatchEnd(msg.winner);
  });

  window.Net.on('start', (msg) => {
    beginMatch(msg.slot, msg.mode);
  });

  window.Net.on('opponent_joined', () => {
    inviteWait.textContent = 'Соперник подключился! Старт…';
  });

  window.Net.on('opponent_left', () => {
    if (state === 'playing') {
      stopCombatAudio();
      leaveGameplayInput();
      state = 'menu';
      overlayTitle.textContent = 'СОПЕРНИК ВЫШЕЛ';
      overlayText.textContent = 'Вернитесь в меню или создайте новую дуэль';
      overlay.classList.remove('hidden');
      lobbyActions.classList.remove('hidden');
      inviteBox.classList.add('hidden');
    }
  });

  window.Net.on('close', () => {
    if (state === 'playing') {
      stopCombatAudio();
      leaveGameplayInput();
      overlayTitle.textContent = 'СВЯЗЬ ПОТЕРЯНА';
      overlayText.textContent = 'Переподключитесь или начните локальный бой';
      overlay.classList.remove('hidden');
      lobbyActions.classList.remove('hidden');
      state = 'menu';
    }
  });
}

function initLobby() {
  initNetHandlers();

  if (window.Net.needsLocalServer()) {
    overlaySub.textContent = 'Онлайн: cd server → npm start, затем http://localhost:3000';
    overlaySub.classList.remove('hidden');
  }

  btnTraining?.addEventListener('click', (e) => {
    e.stopPropagation();
    window.Audio?.ensure();
    window.Audio?.playUi();
    startTrainingGame();
  });

  btnLocal?.addEventListener('click', (e) => {
    e.stopPropagation();
    window.Audio?.ensure();
    window.Audio?.playUi();
    startLocalGame();
  });

  btnCreate?.addEventListener('click', async (e) => {
    e.stopPropagation();
    window.Audio?.ensure();
    window.Audio?.playUi();
    btnCreate.disabled = true;
    overlayText.textContent = 'Создание комнаты…';
    try {
      const { roomId, inviteUrl } = await window.Net.createRoom();
      gameMode = 'duel';
      netSlot = 0;
      state = 'waiting';
      lobbyActions.classList.add('hidden');
      inviteBox.classList.remove('hidden');
      inviteLink.value = inviteUrl;
      inviteWait.textContent = 'Ожидание соперника…';
      overlayTitle.textContent = 'ОЖИДАНИЕ';
      overlayText.textContent = `Комната ${roomId}`;
      const url = new URL(location.href);
      url.searchParams.set('room', roomId);
      history.replaceState(null, '', url);
    } catch (err) {
      overlayTitle.textContent = 'ОШИБКА';
      overlayText.textContent = err.message || 'Ошибка сервера';
      overlaySub.classList.add('hidden');
      lobbyActions.classList.remove('hidden');
      inviteBox.classList.add('hidden');
    }
    btnCreate.disabled = false;
  });

  btnCopy?.addEventListener('click', (e) => {
    e.stopPropagation();
    inviteLink.select();
    navigator.clipboard?.writeText(inviteLink.value);
    btnCopy.textContent = 'Скопировано!';
    setTimeout(() => { btnCopy.textContent = 'Копировать'; }, 1500);
  });

  btnResume?.addEventListener('click', (e) => {
    e.stopPropagation();
    window.Audio?.playUi();
    closePauseMenu();
  });

  btnExit?.addEventListener('click', (e) => {
    e.stopPropagation();
    window.Audio?.playUi();
    exitMatchToMenu();
  });

  overlay.addEventListener('click', (e) => {
    if (e.target.closest('.lobby-actions, .invite-box, .invite-row')) return;
    tryStart();
  });

  const roomCode = window.Net.roomFromQuery();
  if (roomCode) {
    gameMode = 'duel';
    state = 'waiting';
    overlayTitle.textContent = 'ПОДКЛЮЧЕНИЕ';
    overlayText.textContent = `Вход в комнату ${roomCode}…`;
    lobbyActions.classList.add('hidden');
    inviteBox.classList.add('hidden');
    window.Net.joinRoom(roomCode).catch((err) => {
      overlayTitle.textContent = 'ОШИБКА';
      overlayText.textContent = err.message;
      lobbyActions.classList.remove('hidden');
      const url = new URL(location.href);
      url.searchParams.delete('room');
      history.replaceState(null, '', url);
    });
  }
}

function onPointerMove(e) {
  if (state === 'playing') {
    mouse.thrustX += e.movementX * MOUSE_THRUST_SENS;
    mouse.thrustY += e.movementY * MOUSE_THRUST_SENS;
    const thrust = Math.hypot(mouse.thrustX, mouse.thrustY);
    if (thrust > 1) {
      mouse.thrustX /= thrust;
      mouse.thrustY /= thrust;
    }
    return;
  }

  mouse.x = e.clientX / VIEW_ZOOM;
  mouse.y = e.clientY / VIEW_ZOOM;
}

window.addEventListener('mousemove', onPointerMove);
window.addEventListener('mousedown', (e) => {
  if (state === 'playing' && document.pointerLockElement !== canvas) {
    requestGameplayPointerLock();
    return;
  }
  if (state !== 'menu' && state !== 'waiting') tryStart();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    if (state === 'playing') openPauseMenu();
    else if (state === 'paused') closePauseMenu();
    return;
  }

  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    if (state === 'victory' || state === 'defeat') tryStart();
    return;
  }

  if ((e.code === 'KeyE' || e.code === 'KeyУ') && !e.repeat && state === 'playing') {
    handleWeaponInteract();
  }
});

window.addEventListener('resize', resize);

resize();
mouse.x = W / 2;
mouse.y = H / 2;
initLobby();
requestAnimationFrame(loop);
