import { describe, expect, it } from 'vitest';
import { movesFor, threatsFor } from './board';
import { createFight, type Spawn } from './fight';
import { mulberry32 } from './rng';
import type { FightState, Piece } from './types';

function fight(friends: Spawn[], enemies: Spawn[], w = 6, h = 6): FightState {
  return createFight({ name: 't', w, h, friends, enemies, actsPerTurn: 1 }, mulberry32(1));
}

function at(s: FightState, x: number, y: number): Piece {
  const p = s.pieces.find((q) => q.x === x && q.y === y);
  if (!p) throw new Error(`no piece at ${x},${y}`);
  return p;
}

function has(list: { x: number; y: number }[], x: number, y: number) {
  return list.some((v) => v.x === x && v.y === y);
}

describe('movement', () => {
  it('sprout: forward when empty, diagonal only to capture', () => {
    const s = fight(
      [{ kind: 'sprout', x: 2, y: 4 }, { kind: 'keeper', x: 5, y: 5 }],
      [{ kind: 'thistle', x: 2, y: 3 }, { kind: 'thistle', x: 3, y: 3 }],
    );
    const moves = movesFor(s, at(s, 2, 4));
    expect(has(moves, 2, 3)).toBe(false); // blocked head-on, no forward capture
    expect(has(moves, 3, 3)).toBe(true); // diagonal capture
    expect(has(moves, 1, 3)).toBe(false); // empty diagonal is not a move
  });

  it('hopper leaps in Ls and cannot land on a friend', () => {
    const s = fight(
      [{ kind: 'hopper', x: 0, y: 5 }, { kind: 'keeper', x: 2, y: 4 }],
      [{ kind: 'thistle', x: 1, y: 3 }],
    );
    const moves = movesFor(s, at(s, 0, 5));
    expect(has(moves, 1, 3)).toBe(true); // capture
    expect(has(moves, 2, 4)).toBe(false); // friend occupies
    expect(moves.every((m) => m.x >= 0 && m.y >= 0)).toBe(true);
  });

  it('sliders stop at the first piece and may capture it', () => {
    const s = fight(
      [{ kind: 'rumble', x: 0, y: 0 }, { kind: 'keeper', x: 5, y: 5 }],
      [{ kind: 'thistle', x: 0, y: 3 }],
    );
    const moves = movesFor(s, at(s, 0, 0));
    expect(has(moves, 0, 1)).toBe(true);
    expect(has(moves, 0, 3)).toBe(true); // capture square
    expect(has(moves, 0, 4)).toBe(false); // beyond the blocker
  });

  it('the Bramble Heart cannot be landed on; sliders stop short of it', () => {
    const s = fight(
      [{ kind: 'keeper', x: 2, y: 5 }, { kind: 'rumble', x: 2, y: 3 }],
      [{ kind: 'heart', x: 2, y: 0 }],
    );
    const moves = movesFor(s, at(s, 2, 3));
    expect(has(moves, 2, 1)).toBe(true); // may pull right up next to it
    expect(has(moves, 2, 0)).toBe(false); // but never onto it
    expect(has(movesFor(s, at(s, 2, 5)), 2, 0)).toBe(false);
    // its square still counts as covered — that's how cornering is measured
    expect(has(threatsFor(s, at(s, 2, 3)), 2, 0)).toBe(true);
  });
});

describe('movement upgrades', () => {
  it('Cornering: a Rumble turns one corner mid-charge; Long Stride doubles from home', () => {
    const s = createFight(
      {
        name: 't', w: 6, h: 6, actsPerTurn: 1,
        friends: [
          { kind: 'keeper', x: 5, y: 5 },
          { kind: 'rumble', x: 0, y: 5, upgrades: ['cornering'] },
          { kind: 'sprout', x: 3, y: 4, upgrades: ['longstride'] },
        ],
        enemies: [{ kind: 'thistle', x: 2, y: 0 }],
      },
      mulberry32(1),
    );
    const rumble = s.pieces.find((p) => p.kind === 'rumble')!;
    const rm = movesFor(s, rumble);
    expect(has(rm, 2, 0)).toBe(true); // up the file, then along the rank: the thistle
    expect(has(rm, 4, 4)).toBe(true); // along the rank, then up
    expect(has(rm, 1, 4)).toBe(true); // a plain diagonal-looking square, reached by cornering
    const sprout = s.pieces.find((p) => p.kind === 'sprout')!;
    expect(has(movesFor(s, sprout), 3, 2)).toBe(true);
    sprout.y = 3; // off the home row: back to one step
    expect(has(movesFor(s, sprout), 3, 1)).toBe(false);
  });
});
