export const WEAPONS = {
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

export function weaponMass(weaponId) {
  return WEAPONS[weaponId]?.mass ?? WEAPONS[weaponId]?.inertia ?? 2.5;
}

export function weaponInertia(weaponId) {
  return WEAPONS[weaponId]?.inertia ?? weaponMass(weaponId);
}
