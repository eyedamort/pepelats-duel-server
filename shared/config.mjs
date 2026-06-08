export const TICK_RATE = 30;
export const TICK_DT = 1 / TICK_RATE;

export const LOGICAL_W = 1400;
export const LOGICAL_H = 900;
export const VIEW_ZOOM = 1.3;
export const ARENA_MARGIN_X = 0.02;
export const DEFAULT_MAX_HEALTH = 1000;
export const TRAINING_DUMMY_HEALTH = 99990;

export function createArena() {
  const W = LOGICAL_W;
  const H = LOGICAL_H;
  return {
    W,
    H,
    arenaLeft: W * ARENA_MARGIN_X,
    arenaRight: W * (1 - ARENA_MARGIN_X),
    arenaY: H * 0.88,
    arenaTop: H * 0.1,
  };
}
