import { createArena, DEFAULT_MAX_HEALTH, TRAINING_DUMMY_HEALTH } from './config.mjs';
import { WEAPONS } from './weapons.mjs';

const SHIP_R = 24;
const HULL_FACING = 0;
const CHAIN_SEGMENTS = 5;
const GROUND_WEAPON_FLOOR = 14;

export function emptyInput(ship) {
  return {
    thrustX: 0,
    thrustY: 0,
    weaponToggle: false,
    isBot: ship?.isBot ?? false,
  };
}

function getPivot(ship) {
  return { x: ship.x, y: ship.y };
}

export function initHammerState(ship) {
  if (!ship.weaponId) {
    ship.chain = [];
    ship.weaponAngVel = 0;
    return;
  }

  const pivot = getPivot(ship);
  const w = WEAPONS[ship.weaponId] || WEAPONS.mace;

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

export function makeShip(x, y, slot, isBot = false) {
  const ship = {
    x,
    y,
    vx: 0,
    vy: 0,
    prevVx: 0,
    prevVy: 0,
    slot,
    isBot,
    health: DEFAULT_MAX_HEALTH,
    maxHealth: DEFAULT_MAX_HEALTH,
    facing: HULL_FACING,
    shieldAngle: 0,
    shieldAngVel: 0,
    hitFlash: 0,
    dmgFlash: 0,
    hitCooldown: {},
    isTrainingDummy: false,
    anchorX: x,
    anchorY: y,
    chain: [],
    chainSegLen: WEAPONS.mace.ropeLen / CHAIN_SEGMENTS,
    lastChainDt: 1 / 30,
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

function createGroundWeapon(id, weaponId, x, y, vx = 0, vy = 0, angle = Math.PI / 2, spin = 0) {
  return {
    id,
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

export function createMatchWorld(mode = 'duel') {
  const arena = createArena();
  const aw = arena.arenaRight - arena.arenaLeft;
  const cx = (arena.arenaLeft + arena.arenaRight) * 0.5;
  const spawnY = arena.arenaY - arena.H * 0.28;

  const botInSlot1 = mode === 'solo' || mode === 'training';
  const ships = [
    makeShip(cx - aw * 0.28, spawnY, 0, false),
    makeShip(cx + aw * 0.28, spawnY, 1, botInSlot1),
  ];

  if (mode === 'training') {
    const dummy = ships[1];
    dummy.isTrainingDummy = true;
    dummy.anchorX = dummy.x;
    dummy.anchorY = dummy.y;
    dummy.health = TRAINING_DUMMY_HEALTH;
    dummy.maxHealth = TRAINING_DUMMY_HEALTH;
  }

  const ground = spawnGroundWeapons();

  return {
    tick: 0,
    timeMs: 0,
    mode,
    arena,
    ships,
    groundWeapons: ground,
    nextGroundWeaponId: 5,
    sparks: [],
    ribbons: [],
    debris: [],
    shake: 0,
    matchResult: null,
    events: [],
  };
}
