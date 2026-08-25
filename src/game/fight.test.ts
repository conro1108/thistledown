import { describe, expect, it } from 'vitest';
import {
  createFight,
  playerHasMove,
  playerMove,
  promote,
  resolveEnemyTurn,
  type FightConfig,
  type Spawn,
} from './fight';
import { mulberry32 } from './rng';
import type { FightState } from './types';

function fight(
  friends: Spawn[],
  enemies: Spawn[],
  actsPerTurn = 1,
  w = 6,
  h = 6,
  extra: Partial<FightConfig> = {},
): FightState {
  return createFight({ name: 't', w, h, friends, enemies, actsPerTurn, ...extra }, mulberry32(7));
}

function idAt(s: FightState, x: number, y: number): number {
  const p = s.pieces.find((q) => q.x === x && q.y === y);
  if (!p) throw new Error(`no piece at ${x},${y}`);
  return p.id;
}

describe('fight loop', () => {
  it('capturing the last enemy wins', () => {
    const s = fight(
      [{ kind: 'keeper', x: 0, y: 5 }, { kind: 'sprout', x: 2, y: 4 }],
      [{ kind: 'thistle', x: 3, y: 3 }],
    );
    expect(playerMove(s, idAt(s, 2, 4), { x: 3, y: 3 })).toBe(true);
    expect(s.status).toBe('won');
    expect(s.pieces.filter((p) => p.side === 'bramble')).toHaveLength(0);
  });

  it('cornering the Bramble Heart wins: covered square + no safe step', () => {
    // rumbles cover column 0 (incl. the heart), column 1, and row 1 — every
    // square the heart stands on or could step to is threatened.
    const s = fight(
      [
        { kind: 'keeper', x: 3, y: 3 },
        { kind: 'rumble', x: 0, y: 3 },
        { kind: 'rumble', x: 1, y: 3 },
        { kind: 'rumble', x: 3, y: 1 },
      ],
      [{ kind: 'heart', x: 0, y: 0 }],
      1,
      4,
      4,
    );
    expect(playerMove(s, idAt(s, 3, 3), { x: 2, y: 3 })).toBe(true);
    expect(s.status).toBe('won');
    expect(s.events.some((ev) => ev.type === 'cornered')).toBe(true);
    expect(s.pieces.some((p) => p.kind === 'heart')).toBe(false); // poofed
  });

  it('a heart with a safe square is not cornered', () => {
    const s = fight(
      [
        { kind: 'keeper', x: 3, y: 3 },
        { kind: 'rumble', x: 0, y: 3 }, // column 0 only
        { kind: 'rumble', x: 3, y: 1 }, // row 1 only
      ],
      [{ kind: 'heart', x: 0, y: 0 }],
      1,
      4,
      4,
    );
    // (1,0) is uncovered — the heart can still slip out
    playerMove(s, idAt(s, 3, 3), { x: 2, y: 3 });
    expect(s.status).toBe('playing');
  });

  it('playerHasMove detects a hemmed-in band (stalemate guard)', () => {
    // 1-wide corridor: keeper boxed by his own sprout, sprout blocked head-on
    // by a thistle it can't capture forward. Nobody on either side can move.
    const s = fight(
      [{ kind: 'keeper', x: 0, y: 2 }, { kind: 'sprout', x: 0, y: 1 }],
      [{ kind: 'thistle', x: 0, y: 0 }],
      1,
      1,
      3,
    );
    expect(playerHasMove(s)).toBe(false);
    // the wait is safe: enemy turn resolves (thistle is stuck too) and play continues
    resolveEnemyTurn(s);
    expect(s.status).toBe('playing');
    expect(s.turn).toBe(2);
  });

  it('an enemy telegraphing a friend captures it on resolve (friend becomes shaken, not game over)', () => {
    const s = fight(
      [{ kind: 'keeper', x: 0, y: 5 }, { kind: 'sprout', x: 4, y: 4 }],
      [{ kind: 'thistle', x: 3, y: 3 }],
    );
    // thistle's best option is capturing the sprout at (4,4)
    expect(s.telegraphs[0].to).toEqual({ x: 4, y: 4 });
    playerMove(s, idAt(s, 0, 5), { x: 0, y: 4 });
    expect(s.turn).toBe(1); // enemy turn hasn't resolved yet — that's a separate step now
    resolveEnemyTurn(s);
    expect(s.status).toBe('playing');
    expect(s.pieces.find((p) => p.kind === 'sprout')).toBeUndefined();
    expect(s.pieces.find((p) => p.kind === 'thistle')!.y).toBe(4);
    expect(s.events.some((ev) => ev.type === 'shaken')).toBe(true);
  });

  it('losing the keeper loses the fight', () => {
    const s = fight(
      [{ kind: 'keeper', x: 4, y: 4 }, { kind: 'sprout', x: 0, y: 4 }],
      [{ kind: 'thistle', x: 3, y: 3 }],
    );
    expect(s.telegraphs[0].to).toEqual({ x: 4, y: 4 });
    playerMove(s, idAt(s, 0, 4), { x: 0, y: 3 });
    resolveEnemyTurn(s);
    expect(s.status).toBe('lost');
  });

  it('blocking a thistle head-on stops it (telegraphs re-check legality)', () => {
    const s = fight(
      [{ kind: 'keeper', x: 5, y: 5 }, { kind: 'sprout', x: 2, y: 4 }],
      [{ kind: 'thistle', x: 2, y: 2 }],
    );
    expect(s.telegraphs[0].to).toEqual({ x: 2, y: 3 });
    playerMove(s, idAt(s, 2, 4), { x: 2, y: 3 }); // step into its path
    resolveEnemyTurn(s);
    const thistle = s.pieces.find((p) => p.kind === 'thistle')!;
    expect(thistle.x).toBe(2);
    expect(thistle.y).toBe(2); // it stayed put
    expect(s.pieces.find((p) => p.kind === 'sprout')).toBeDefined();
    // the game keeps going — and tells the player their block worked
    expect(s.events.some((ev) => ev.type === 'blocked' && ev.kind === 'thistle')).toBe(true);
    expect(s.turn).toBe(2);
    // the sole thistle is still walled in, so it has no legal move to telegraph —
    // no phantom null telegraph. It re-telegraphs the moment a lane opens up.
    expect(s.telegraphs).toHaveLength(0);
  });

  it('a sprout reaching the far edge freezes the turn until promotion', () => {
    const s = fight(
      [{ kind: 'keeper', x: 0, y: 5 }, { kind: 'sprout', x: 2, y: 1 }],
      [{ kind: 'thistle', x: 5, y: 4 }],
    );
    const sproutId = idAt(s, 2, 1);
    playerMove(s, sproutId, { x: 2, y: 0 });
    expect(s.pendingPromotion).toBe(sproutId);
    expect(s.turn).toBe(1); // enemy turn has not resolved
    expect(playerMove(s, idAt(s, 0, 5), { x: 0, y: 4 })).toBe(false); // input locked
    expect(promote(s, 'rumble')).toBe(true);
    expect(s.pieces.find((p) => p.id === sproutId)!.kind).toBe('rumble');
    expect(s.turn).toBe(1); // still separate: resolveEnemyTurn is its own step
    expect(s.pendingPromotion).toBeNull();
    resolveEnemyTurn(s);
    expect(s.turn).toBe(2);
  });

  it('capturing a telegraphed enemy is a stolen turn — a tempo event fires', () => {
    const s = fight(
      [{ kind: 'keeper', x: 0, y: 5 }, { kind: 'hopper', x: 2, y: 3 }],
      [
        { kind: 'thistle', x: 1, y: 1 }, // nearest the keeper: it gets the telegraph
        { kind: 'thistle', x: 4, y: 1 },
      ],
      1,
    );
    expect(s.telegraphs[0].pieceId).toBe(idAt(s, 1, 1));
    playerMove(s, idAt(s, 2, 3), { x: 1, y: 1 });
    expect(s.events.some((ev) => ev.type === 'tempo' && ev.kind === 'thistle')).toBe(true);
  });
});

/**
 * The spread clock: linger too long and the bramble sends reinforcements.
 * A marked square one turn ahead (fair warning), then a thistle sprouts.
 * This is what makes stalling — camping blocked pawns, farming promotions —
 * cost something, without putting a hard timer on anyone.
 */
describe('the bramble spreads', () => {
  // startAt: 1 opts out of the material gate — this is about the clock.
  const CLOCK = { spread: { after: 2, every: 2, cap: 5, startAt: 1 } };

  it('marks a square with fair warning, then sprouts a thistle there', () => {
    const s = fight(
      [{ kind: 'keeper', x: 0, y: 5 }],
      [{ kind: 'thistle', x: 5, y: 0 }],
      1,
      6,
      6,
      CLOCK,
    );
    expect(s.pendingSprout).toBeNull();
    resolveEnemyTurn(s); // turn becomes 2 = `after`: the warning appears
    expect(s.pendingSprout).not.toBeNull();
    expect(s.pendingSprout!.y).toBe(0);
    expect(s.events.some((ev) => ev.type === 'stir')).toBe(true);
    const spot = { ...s.pendingSprout! };
    s.events = [];
    resolveEnemyTurn(s); // and next turn it sprouts
    expect(s.pendingSprout).toBeNull();
    expect(s.events.some((ev) => ev.type === 'sprouted')).toBe(true);
    const sprouted = s.pieces.filter((p) => p.side === 'bramble' && p.kind === 'thistle');
    expect(sprouted.some((p) => p.x === spot.x && p.y === spot.y)).toBe(true);
    expect(sprouted).toHaveLength(2);
  });
});
