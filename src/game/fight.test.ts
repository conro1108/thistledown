import { describe, expect, it } from 'vitest';
import { createFight, playerMove, promote, resolveEnemyTurn, type Spawn } from './fight';
import { mulberry32 } from './rng';
import type { FightState } from './types';

function fight(friends: Spawn[], enemies: Spawn[], actsPerTurn = 1, w = 6, h = 6): FightState {
  return createFight({ name: 't', w, h, friends, enemies, actsPerTurn }, mulberry32(7));
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
