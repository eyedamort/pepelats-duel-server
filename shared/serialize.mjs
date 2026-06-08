export function serializeWorld(world) {
  return {
    tick: world.tick,
    timeMs: world.timeMs,
    matchResult: world.matchResult,
    shake: world.shake,
    ships: world.ships.map(serializeShip),
    groundWeapons: world.groundWeapons.map((gw) => ({ ...gw })),
    sparks: world.sparks.map((s) => ({ ...s })),
    debris: world.debris.map((d) => ({ ...d })),
    events: world.events.map((e) => ({ ...e })),
  };
}

function serializeShip(ship) {
  return {
    slot: ship.slot,
    isBot: ship.isBot,
    isTrainingDummy: Boolean(ship.isTrainingDummy),
    x: ship.x,
    y: ship.y,
    vx: ship.vx,
    vy: ship.vy,
    health: ship.health,
    maxHealth: ship.maxHealth,
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

export function applySnapshotToDisplay(display, snapshot, alpha = 0) {
  display.tick = snapshot.tick;
  display.matchResult = snapshot.matchResult;
  display.shake = snapshot.shake;
  display.events = snapshot.events || [];
  display.groundWeapons = snapshot.groundWeapons;
  display.sparks = snapshot.sparks;
  display.debris = snapshot.debris;

  if (!display.ships) display.ships = [{}, {}];
  snapshot.ships.forEach((src, i) => {
    const dst = display.ships[i] || (display.ships[i] = {});
    if (alpha <= 0 || !dst.x) {
      Object.assign(dst, structuredClone(src));
      if (src.chain) dst.chain = src.chain.map((p) => ({ ...p }));
      return;
    }
    dst.x = dst.x + (src.x - dst.x) * alpha;
    dst.y = dst.y + (src.y - dst.y) * alpha;
    dst.vx = src.vx;
    dst.vy = src.vy;
    dst.health = src.health;
    dst.weaponId = src.weaponId;
    dst.weaponAngle = dst.weaponAngle + (src.weaponAngle - dst.weaponAngle) * alpha;
    dst.shieldAngle = dst.shieldAngle + (src.shieldAngle - dst.shieldAngle) * alpha;
    dst.shields = src.shields;
    dst.chain = src.chain;
    dst.hitFlash = src.hitFlash;
    dst.dmgFlash = src.dmgFlash;
    dst.slot = src.slot;
    dst.isBot = src.isBot;
  });
}
