import { describe, expect, it } from 'vitest';
import {
  createFight,
  playerHasMove,
  playerMove,
  promote,
  resolveEnemyTurn,
  takeFreeMove,
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

  it('telegraphs respect actsPerTurn', () => {
    const s = fight(
      [{ kind: 'keeper', x: 0, y: 5 }],
      [
        { kind: 'thistle', x: 0, y: 0 },
        { kind: 'thistle', x: 2, y: 0 },
        { kind: 'thistle', x: 4, y: 0 },
      ],
      2,
    );
    expect(s.telegraphs).toHaveLength(2);
  });

  it('Dandelion Cloak: the first caught friend retreats to the home row instead', () => {
    const s = fight(
      [{ kind: 'keeper', x: 0, y: 5 }, { kind: 'sprout', x: 4, y: 4 }],
      [{ kind: 'thistle', x: 3, y: 3 }],
      1,
      6,
      6,
      { cloak: true },
    );
    expect(s.telegraphs[0].to).toEqual({ x: 4, y: 4 });
    playerMove(s, idAt(s, 0, 5), { x: 0, y: 4 });
    resolveEnemyTurn(s);
    const sprout = s.pieces.find((p) => p.kind === 'sprout')!;
    expect(sprout.y).toBe(5); // whisked to the home row
    expect(s.cloakLeft).toBe(0);
    expect(s.events.some((ev) => ev.type === 'cloaked')).toBe(true);
    expect(s.events.some((ev) => ev.type === 'shaken')).toBe(false);
    // the thistle still lands where it was headed
    expect(s.pieces.find((p) => p.kind === 'thistle')).toMatchObject({ x: 4, y: 4 });
  });

  it('Dandelion Cloak saves the keeper from a run-ending capture — once', () => {
    const s = fight(
      [{ kind: 'keeper', x: 4, y: 4 }, { kind: 'sprout', x: 0, y: 4 }],
      [{ kind: 'thistle', x: 3, y: 3 }],
      1,
      6,
      6,
      { cloak: true },
    );
    expect(s.telegraphs[0].to).toEqual({ x: 4, y: 4 });
    playerMove(s, idAt(s, 0, 4), { x: 0, y: 3 });
    resolveEnemyTurn(s);
    expect(s.status).toBe('playing');
    expect(s.pieces.find((p) => p.kind === 'keeper')!.y).toBe(5);
  });

  it('Second Breakfast: takeFreeMove grants exactly one extra move', () => {
    const s = fight(
      [{ kind: 'keeper', x: 0, y: 5 }],
      [{ kind: 'thistle', x: 5, y: 0 }],
      1,
      6,
      6,
      { secondBreakfast: true },
    );
    expect(takeFreeMove(s)).toBe(true);
    expect(takeFreeMove(s)).toBe(false);
    const plain = fight([{ kind: 'keeper', x: 0, y: 5 }], [{ kind: 'thistle', x: 5, y: 0 }]);
    expect(takeFreeMove(plain)).toBe(false);
  });

  it('Acorn Whistle: a sprout promoting into a hopper comes out spry', () => {
    const s = fight(
      [{ kind: 'keeper', x: 0, y: 5 }, { kind: 'sprout', x: 5, y: 1 }],
      [{ kind: 'thistle', x: 0, y: 0 }],
      1,
      6,
      6,
      { whistle: true },
    );
    playerMove(s, idAt(s, 5, 1), { x: 5, y: 0 });
    expect(s.pendingPromotion).not.toBeNull();
    promote(s, 'hopper');
    expect(s.pieces.find((p) => p.kind === 'hopper')!.spry).toBe(true);
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

  it('playerHasMove is true in an ordinary fight', () => {
    const s = fight([{ kind: 'keeper', x: 0, y: 5 }], [{ kind: 'thistle', x: 5, y: 0 }]);
    expect(playerHasMove(s)).toBe(true);
  });

  it('the whole side plays its best move: a capture is telegraphed over a drift, even from a "not its turn" enemy', () => {
    const s = fight(
      [{ kind: 'keeper', x: 0, y: 5 }, { kind: 'sprout', x: 4, y: 4 }],
      [
        { kind: 'thistle', x: 0, y: 0 }, // spawned first, but can only drift
        { kind: 'thistle', x: 3, y: 3 }, // has a forward-diagonal capture on (4,4)
      ],
      1,
    );
    expect(s.telegraphs).toHaveLength(1);
    expect(s.telegraphs[0].to).toEqual({ x: 4, y: 4 });
    expect(s.telegraphs[0].pieceId).toBe(idAt(s, 3, 3));
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

  it('a hopper can capture a golem sitting on the back rank', () => {
    const s = fight(
      [{ kind: 'keeper', x: 0, y: 5 }, { kind: 'hopper', x: 2, y: 2 }],
      [{ kind: 'golem', x: 3, y: 0 }, { kind: 'thistle', x: 5, y: 3 }],
    );
    expect(playerMove(s, idAt(s, 2, 2), { x: 3, y: 0 })).toBe(true);
    expect(s.pieces.find((p) => p.kind === 'golem')).toBeUndefined();
    expect(s.status).toBe('playing'); // thistle still up
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

  it('capturing a telegraphed enemy cancels its telegraph', () => {
    const s = fight(
      [{ kind: 'keeper', x: 0, y: 5 }, { kind: 'hopper', x: 2, y: 3 }],
      [
        { kind: 'thistle', x: 1, y: 1 },
        { kind: 'thistle', x: 4, y: 1 },
      ],
      2,
    );
    playerMove(s, idAt(s, 2, 3), { x: 1, y: 1 });
    resolveEnemyTurn(s);
    expect(s.status).toBe('playing');
    expect(s.pieces.filter((p) => p.side === 'bramble')).toHaveLength(1);
    // new telegraphs only reference living enemies
    for (const t of s.telegraphs) {
      expect(s.pieces.some((p) => p.id === t.pieceId)).toBe(true);
    }
  });
});
