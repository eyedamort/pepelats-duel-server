import {
  TICK_DT,
  LOGICAL_W,
  LOGICAL_H,
  ARENA_MARGIN_X,
  VIEW_ZOOM,
} from './config.mjs';
import { WEAPONS, weaponMass, weaponInertia } from './weapons.mjs';
import { createMatchWorld, emptyInput, initHammerState } from './world.mjs';

let W, H, arenaY, arenaLeft, arenaRight, arenaTop;
let player;
let enemies = [];
let sparks = [];
let ribbons = [];
let debris = [];
let groundWeapons = [];
let nextGroundWeaponId = 1;
let shake = 0;
let worldRef = null;

function bindWorld(world) {
  worldRef = world;
  ({ W, H, arenaY, arenaLeft, arenaRight, arenaTop } = world.arena);
  player = world.ships[0];
  enemies = world.ships.slice(1);
  sparks = world.sparks;
  ribbons = world.ribbons;
  debris = world.debris;
  groundWeapons = world.groundWeapons;
  nextGroundWeaponId = world.nextGroundWeaponId;
  shake = world.shake;
}

function syncWorld(world) {
  world.nextGroundWeaponId = nextGroundWeaponId;
  world.shake = shake;
}

function updateEffects(dt) {
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.vy += 420 * dt;
    s.life -= dt;
    if (s.life <= 0) sparks.splice(i, 1);
  }
  for (let i = ribbons.length - 1; i >= 0; i--) {
    ribbons[i].life -= dt;
    if (ribbons[i].life <= 0) ribbons.splice(i, 1);
  }
  for (let i = debris.length - 1; i >= 0; i--) {
    const d = debris[i];
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    d.vy += 380 * dt;
    d.vx *= 0.99;
    d.rotation += d.spin * dt;
    d.life -= dt;
    if (d.life <= 0 || d.y > arenaY + 20) debris.splice(i, 1);
  }
  if (shake > 0) shake *= 0.86;
}

function decayFlash(dt) {
  if (!player) return;
  if (player.dmgFlash > 0) player.dmgFlash -= dt * 3;
  for (const enemy of enemies) {
    if (enemy.dmgFlash > 0) enemy.dmgFlash -= dt * 3;
  }
}

function processWeaponActions(world, inputs) {
  for (const ship of world.ships) {
    if (ship.health <= 0) continue;
    const inp = inputs[ship.slot];
    if (!inp?.weaponToggle) continue;
    inp.weaponToggle = false;
    bindWorld(world);
    const nearby = findNearbyGroundWeapon(ship);
    if (nearby) {
      pickupGroundWeaponFor(ship, nearby);
    } else if (ship.weaponId) {
      throwWeaponFor(ship);
    }
    syncWorld(world);
  }
}



function throwWeaponFor(ship) {
  if (!ship.weaponId) return;
  const head = getHammerHead(ship);
  const dt = Math.max(0.001, ship.lastChainDt || TICK_DT);
  let hvx = (head.x - head.prev.x) / dt;
  let hvy = (head.y - head.prev.y) / dt;
  if (!Number.isFinite(hvx)) hvx = 0;
  if (!Number.isFinite(hvy)) hvy = 0;
  const throwVx = hvx * 0.95 + ship.vx * 0.55;
  const throwVy = hvy * 0.95 + ship.vy * 0.55;
  const speed = Math.hypot(throwVx, throwVy);
  const angle = speed > 40 ? Math.atan2(throwVy, throwVx) : 0;
  const spin = speed * 0.04;
  dropGroundWeapon(ship.weaponId, head.x, head.y, throwVx, throwVy, angle, spin);
  ship.weaponId = null;
  ship.chain = [];
  ship.weaponAngVel = 0;
  ship.prevPivotX = ship.x;
  ship.prevPivotY = ship.y;
  addSparks(head.x, head.y, 8, '#ccaa66');
  worldRef.events.push({ type: 'throw', slot: ship.slot });
}

function pickupGroundWeaponFor(ship, gw) {
  if (ship.weaponId) {
    dropGroundWeapon(
      ship.weaponId,
      ship.x,
      ship.y + SHIP_R * 0.4,
      ship.vx * 0.25,
      ship.vy * 0.25,
      0,
      0,
    );
  }
  ship.weaponId = gw.weaponId;
  initHammerState(ship);
  groundWeapons = groundWeapons.filter((w) => w.id !== gw.id);
  addSparks(ship.x, ship.y, 10, '#ffdd88');
  worldRef.events.push({ type: 'pickup', slot: ship.slot, weaponId: ship.weaponId });
}

const SHIP_R = 24;
const GROUND_PICKUP_RANGE = 58;
const GROUND_WEAPON_FLOOR = 14;
const GROUND_WEAPON_BOUNCE = 0.42;
const GROUND_WEAPON_FRICTION = 0.82;
const GROUND_WEAPON_RESTITUTION = 0.55;
const GROUND_WEAPON_PAIR_RESTITUTION = 0.68;
const SHIP_COLLISION_MASS = 50;
const SHIP_HULL_MASS = 9;
const SHIP_WEAPON_MASS_FACTOR = 0.7;
const SHIP_BUMP_RESTITUTION = 0.58;
const GROUND_WEAPON_COLLISION_ITERS = 3;
const ATTACHED_WEAPON_COLLISION_ITERS = 3;
const ATTACHED_WEAPON_RESTITUTION = 0.62;
const HEAD_SHIP_COLLISION_ITERS = 4;
const BODY_HIT_RESTITUTION = ATTACHED_WEAPON_RESTITUTION;
const CONTACT_HULL_COUPLING = 0.65;
const CONTACT_ATTACKER_RECOIL = 0.28;
const MAX_HEAD_IMPULSE = 200;
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
const HIT_COOLDOWN_MS = 280;
const HULL_FACING = 0;
const SHIELD_ORBIT_R = SHIP_R + 5;
const SHIELD_BEARING_DAMP = 0.994;
const SHIELD_MAX_ANG_VEL = 8;

function getW(ship) {
  if (!ship?.weaponId) return null;
  return WEAPONS[ship.weaponId] || WEAPONS.mace;
}

function shipControlMass(ship) {
  if (!ship?.weaponId) return SHIP_CONTROL_MASS;
  return SHIP_CONTROL_MASS + weaponMass(ship.weaponId) * WEAPON_CONTROL_MASS_FACTOR;
}

function shipHullMass(ship) {
  if (!ship?.weaponId) return SHIP_HULL_MASS;
  return SHIP_HULL_MASS + weaponMass(ship.weaponId) * SHIP_WEAPON_MASS_FACTOR;
}

function applyImpulse(ship, ix, iy) {
  if (ship?.isTrainingDummy) return;
  ship.vx += ix;
  ship.vy += iy;
}

function pinTrainingDummies(ships) {
  for (const ship of ships) {
    if (!ship.isTrainingDummy) continue;
    ship.x = ship.anchorX;
    ship.y = ship.anchorY;
    ship.vx = 0;
    ship.vy = 0;
    ship.prevVx = 0;
    ship.prevVy = 0;
    ship.prevPivotX = ship.x;
    ship.prevPivotY = ship.y;
  }
}

function shipMaxSpeed(ship) {
  const controlMass = shipControlMass(ship);
  const accelScale = SHIP_CONTROL_MASS / controlMass;
  const base = ship.isBot ? ENEMY_MAX_SPEED : MAX_SPEED;
  return base * (0.88 + accelScale * 0.12);
}

function clampShipVelocity(ship) {
  if (ship.isTrainingDummy) return;

  let vx = ship.vx;
  let vy = ship.vy;
  if (!Number.isFinite(vx)) vx = 0;
  if (!Number.isFinite(vy)) vy = 0;

  const maxSpd = shipMaxSpeed(ship);
  const spd = Math.hypot(vx, vy);
  if (spd > maxSpd) {
    vx = (vx / spd) * maxSpd;
    vy = (vy / spd) * maxSpd;
  }

  ship.vx = vx;
  ship.vy = vy;
}

function clampShipPosition(ship) {
  if (ship.isTrainingDummy) return;

  const minX = arenaLeft + SHIP_R;
  const maxX = arenaRight - SHIP_R;
  const minY = arenaTop + SHIP_R;
  const maxY = arenaY - SHIP_R - 10;
  const fallbackX = Number.isFinite(ship.anchorX) ? ship.anchorX : (arenaLeft + arenaRight) * 0.5;
  const fallbackY = Number.isFinite(ship.anchorY) ? ship.anchorY : arenaY - 200;

  if (!Number.isFinite(ship.x) || !Number.isFinite(ship.y)
    || ship.x < minX - 400 || ship.x > maxX + 400
    || ship.y < minY - 400 || ship.y > maxY + 400) {
    ship.x = Math.max(minX, Math.min(maxX, fallbackX));
    ship.y = Math.max(minY, Math.min(maxY, fallbackY));
    ship.vx = 0;
    ship.vy = 0;
    ship.prevVx = 0;
    ship.prevVy = 0;
    if (hasEquippedWeapon(ship)) initHammerState(ship);
    return;
  }

  ship.x = Math.max(minX, Math.min(maxX, ship.x));
  ship.y = Math.max(minY, Math.min(maxY, ship.y));
}

function stabilizeWeaponChain(ship) {
  if (!ship.weaponId || isPivotMount(ship) || !ship.chain.length) return;

  const pivot = getPivot(ship);
  const reach = weaponReachLen(getW(ship));
  const glitchDist = reach * 3.5;

  for (const p of ship.chain) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)
      || !Number.isFinite(p.ox) || !Number.isFinite(p.oy)) {
      initHammerState(ship);
      return;
    }
  }

  const tip = ship.chain[ship.chain.length - 1];
  if (Math.hypot(tip.x - pivot.x, tip.y - pivot.y) > glitchDist) {
    initHammerState(ship);
  }
}

function stabilizeShips(ships) {
  pinTrainingDummies(ships);
  for (const ship of ships) {
    if (ship.health <= 0) continue;
    clampShipVelocity(ship);
    clampShipPosition(ship);
    stabilizeWeaponChain(ship);
  }
}

function contactHeadMass(ship) {
  return weaponMass(ship.weaponId) + shipHullMass(ship) * CONTACT_HULL_COUPLING;
}

function arenaWidth() {
  return arenaRight - arenaLeft;
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





















function applyShieldBreak(defender, side, hammerSpeed, attacker) {
  const shield = defender.shields.find((s) => s.side === side && s.intact);
  if (!shield) return false;

  shield.intact = false;
  spawnShieldDebris(defender, side, hammerSpeed);
  defender.hitFlash = 0.15;

  return true;
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
  const mag = Math.hypot(ix, iy);
  if (mag > MAX_HEAD_IMPULSE) {
    const scale = MAX_HEAD_IMPULSE / mag;
    ix *= scale;
    iy *= scale;
  }

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
  }

  return impactSpeed;
}

function bounceHeadOffShip(ship, target, restitution) {
  if (!hasEquippedWeapon(ship) || target.health <= 0) return 0;

  const head = getHammerHead(ship);
  const w = getW(ship);
  const dx = head.x - target.x;
  const dy = head.y - target.y;
  const dist = Math.hypot(dx, dy);
  const minD = w.headR + SHIP_R;
  if (dist > minD || dist < 0.001) return 0;

  const nx = dx / dist;
  const ny = dy / dist;
  const overlap = minD - dist;
  const mHead = contactHeadMass(ship);
  const mShip = shipHullMass(target);
  const invHead = 1 / mHead;
  const invShip = 1 / mShip;
  const invSum = invHead + invShip;

  separateWeaponHead(ship, nx, ny, overlap * (invHead / invSum));
  if (!target.isTrainingDummy) {
    target.x -= nx * overlap * (invShip / invSum);
    target.y -= ny * overlap * (invShip / invSum);
  }

  const relVn = (head.vx - target.vx) * nx + (head.vy - target.vy) * ny;
  let impulse = 0;

  if (relVn < 0) {
    impulse = applyElasticBounce(
      head.vx, head.vy, target.vx, target.vy, nx, ny, mHead, mShip, restitution,
    );
  } else if (head.speed >= MIN_HIT_SPEED * 0.6 && overlap > 0.5) {
    const driveVn = Math.max(head.speed * 0.5, -relVn * 0.4);
    impulse = (1 + restitution * 0.45) * driveVn / invSum;
  }

  const impactSpeed = Math.max(0, -relVn, head.speed * Math.min(1, overlap / minD));

  if (impulse) {
    applyHeadImpulse(ship, impulse * nx / mHead, impulse * ny / mHead);
    applyImpulse(target, -impulse * nx / mShip, -impulse * ny / mShip);
    const mAtk = shipHullMass(ship);
    applyImpulse(ship, -impulse * nx / mAtk * CONTACT_ATTACKER_RECOIL, -impulse * ny / mAtk * CONTACT_ATTACKER_RECOIL);

    if (impactSpeed > 45) {
      addSparks((head.x + target.x) * 0.5, (head.y + target.y) * 0.5, 4 + Math.floor(impactSpeed / 45), '#ffcc88');
      shake = Math.min(14, shake + impactSpeed * 0.03);
      if (worldRef && impactSpeed > 55) {
        worldRef.events.push({
          type: 'bump',
          strength: impactSpeed,
          x: (head.x + target.x) * 0.5,
          y: (head.y + target.y) * 0.5,
        });
      }
    }
  }

  return impactSpeed;
}

function resolveHeadShipCollisions() {
  const ships = [player, ...enemies.filter((e) => e.health > 0)].filter(Boolean);

  for (let iter = 0; iter < HEAD_SHIP_COLLISION_ITERS; iter++) {
    for (const attacker of ships) {
      if (!hasEquippedWeapon(attacker)) continue;
      for (const target of ships) {
        if (target === attacker) continue;
        bounceHeadOffShip(attacker, target, BODY_HIT_RESTITUTION);
      }
    }
  }
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

function updateShipPhysics(ship, dt, target, world) {
  ship.prevVx = ship.vx;
  ship.prevVy = ship.vy;

  const controlMass = shipControlMass(ship);
  const accelScale = SHIP_CONTROL_MASS / controlMass;
  const maxControlAccel = (ship.isBot ? ENEMY_THRUST : THRUST) * accelScale;

  let ax = 0;
  let ay = 0;

  if (target && !target.isBot) {
    const input = Math.hypot(target.thrustX, target.thrustY);
    if (input > MOUSE_THRUST_DEADZONE) {
      const power = Math.min(1, input);
      ax = (target.thrustX / input) * maxControlAccel * power;
      ay = (target.thrustY / input) * maxControlAccel * power;
    }
    const decay = Math.exp(-MOUSE_THRUST_DECAY * dt);
    target.thrustX *= decay;
    target.thrustY *= decay;
  } else if (ship.isBot) {
    const opponent = world.ships.find((s) => s.slot !== ship.slot && s.health > 0);
    if (!opponent) return;
    ship.aiTimer -= dt;
    const dx = opponent.x - ship.x;
    const dy = opponent.y - ship.y;
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
  const drag = ship.slot === 0 ? PLAYER_COAST_DRAG : DRAG;
  ship.vx *= drag;
  ship.vy *= drag;

  const speed = Math.hypot(ship.vx, ship.vy);
  const baseMaxSpeed = ship.isBot ? ENEMY_MAX_SPEED : MAX_SPEED;
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
    color: ship.slot === 0 ? 'rgba(255,200,80,' : 'rgba(255,90,50,',
  });
}

function calcHammerDamage(hammerSpeed, attacker) {
  if (hammerSpeed < MIN_HIT_SPEED) return 0;
  const w = getW(attacker);
  if (!w) return 0;
  const excess = hammerSpeed - MIN_HIT_SPEED;
  const base = Math.min(MAX_DAMAGE, MIN_DAMAGE + excess * DAMAGE_PER_SPEED);
  let dmg = base * w.damageMult;
  if (attacker.isBot) dmg *= ENEMY_DAMAGE_MULT;
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
  const hitR = 26;

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
  const world = worldRef;
  const now = world.timeMs;
  const cdKey = String(attacker.slot);
  if (defender.hitCooldown[cdKey] && defender.hitCooldown[cdKey] > now) return;

  const blockedSide = tryShieldBlock(defender, hitX, hitY, hammerSpeed);
  if (blockedSide !== false) {
    defender.hitCooldown[cdKey] = now + HIT_COOLDOWN_MS;
    applyShieldBreak(defender, blockedSide, hammerSpeed, attacker);
    worldRef.events.push({ type: 'shield_break', defender: defender.slot, side: blockedSide });
    return;
  }

  const dmg = calcHammerDamage(hammerSpeed, attacker);
  if (dmg <= 0) return;

  defender.hitCooldown[cdKey] = now + HIT_COOLDOWN_MS;
  world.events.push({ type: 'hit', attacker: attacker.slot, defender: defender.slot, damage: dmg, x: hitX, y: hitY });

  if (!defender.isTrainingDummy) {
    defender.health = Math.max(0, defender.health - dmg);
  }
  defender.hitFlash = 0.2;
  defender.dmgFlash = 1;
  addSparks(defender.x, defender.y, 8 + Math.floor(dmg / 8), '#ffcc66');
  shake = Math.min(14, shake + dmg * 0.15);
}

function checkHammerHits(attacker, targets) {
  if (!attacker.weaponId) return;

  const head = getHammerHead(attacker);
  const chain = getChainPoints(attacker);
  const hSpeed = head.speed;
  const hitR = getW(attacker).headR;

  for (const target of targets) {
    const bodyDist = Math.hypot(head.x - target.x, head.y - target.y);
    if (bodyDist <= hitR + SHIP_R) {
      if (true) {
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
        if (true) {
          resolveBodyHit(attacker, target, hSpeed, head.x, head.y);
        }
        if (true && tHead.speed >= MIN_HIT_SPEED) {
          resolveBodyHit(target, attacker, tHead.speed, tHead.x, tHead.y);
        }
        if (hSpeed > 60 || tHead.speed > 60) {
          addSparks((head.x + tHead.x) / 2, (head.y + tHead.y) / 2, 8, '#ffffff');
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
      if (dist >= minD || dist < 0.001) continue;

      const nx = dx / dist;
      const ny = dy / dist;
      const overlap = minD - dist;
      const mA = shipHullMass(a);
      const mB = shipHullMass(b);
      const invA = 1 / mA;
      const invB = 1 / mB;
      const invSum = invA + invB;

      a.x -= nx * overlap * (invA / invSum);
      a.y -= ny * overlap * (invA / invSum);
      b.x += nx * overlap * (invB / invSum);
      b.y += ny * overlap * (invB / invSum);

      const relVn = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (relVn > 0) {
        const impulse = -(1 + SHIP_BUMP_RESTITUTION) * relVn / invSum;
        applyImpulse(a, impulse * nx * invA);
        applyImpulse(a, impulse * ny * invA);
        applyImpulse(b, -impulse * nx * invB);
        applyImpulse(b, -impulse * ny * invB);

        if (relVn > 55 && worldRef) {
          worldRef.events.push({
            type: 'bump',
            strength: relVn,
            x: (a.x + b.x) * 0.5,
            y: (a.y + b.y) * 0.5,
          });
        }
      } else if (overlap > 2) {
        const push = overlap * 18;
        applyImpulse(a, -nx * push / mA);
        applyImpulse(a, -ny * push / mA);
        applyImpulse(b, nx * push / mB);
        applyImpulse(b, ny * push / mB);
      }
    }
  }
}















function checkGameEnd(world) {
  const player = world.ships[0];
  const enemies = world.ships.slice(1);
  if (player.health <= 0) {
    world.matchResult = 1;
    world.events.push({ type: 'defeat', winner: 1 });
    return;
  }
  if (world.mode === 'training') return;
  if (enemies.every((e) => e.health <= 0)) {
    world.matchResult = 0;
    world.events.push({ type: 'victory', winner: 0 });
  }
}

function runSimulationTick(world, inputs, dt) {
  bindWorld(world);
  processWeaponActions(world, inputs);

  for (const ship of world.ships) {
    if (ship.health <= 0) continue;
    if (ship.isTrainingDummy) {
      if (ship.hitFlash > 0) ship.hitFlash -= dt;
      if (ship.dmgFlash > 0) ship.dmgFlash -= dt;
      continue;
    }
    const inp = inputs[ship.slot] || emptyInput(ship);
    updateShipPhysics(ship, dt, inp, world);
    updateShieldPhysics(ship, dt);
    updateHammerPhysics(ship, dt);
    addRibbon(ship);
  }

  const allShips = world.ships.filter((s) => s.health > 0);
  resolveShipCollisions(allShips);
  resolveAttachedWeaponCollisions();
  resolveHeadShipCollisions();

  const playerShip = world.ships[0];
  const enemyShips = world.ships.slice(1);
  for (const enemy of enemyShips) {
    if (enemy.health <= 0) continue;
    checkHammerHits(enemy, [playerShip]);
  }
  checkHammerHits(playerShip, enemyShips.filter((e) => e.health > 0));
  stabilizeShips(allShips);
  updateGroundWeapons(dt);
  resolveGroundWeaponCollisions();
  updateEffects(dt);
  decayFlash(dt);
  checkGameEnd(world);
  world.tick += 1;
  world.timeMs += dt * 1000;
}

export function simulateTick(world, inputs, dt = TICK_DT) {
  world.events = [];
  runSimulationTick(world, inputs, dt);
  syncWorld(world);
  return world;
}

export function createWorld(mode = 'duel') {
  return createMatchWorld(mode);
}

export { createArena } from './config.mjs';
export { TICK_DT };
