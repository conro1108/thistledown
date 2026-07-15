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

  it('thistle moves down the board', () => {
    const s = fight([{ kind: 'keeper', x: 5, y: 5 }], [{ kind: 'thistle', x: 2, y: 1 }]);
    expect(has(movesFor(s, at(s, 2, 1)), 2, 2)).toBe(true);
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

  it('threats include defended friendly pieces; moves do not', () => {
    const s = fight(
      [{ kind: 'rumble', x: 0, y: 0 }, { kind: 'sprout', x: 0, y: 2 }, { kind: 'keeper', x: 5, y: 5 }],
      [{ kind: 'thistle', x: 4, y: 0 }],
    );
    const r = at(s, 0, 0);
    expect(has(threatsFor(s, r), 0, 2)).toBe(true);
    expect(has(movesFor(s, r), 0, 2)).toBe(false);
  });

  it('spry adds plain one-step moves onto empty squares only — threats unchanged', () => {
    const s = fight(
      [{ kind: 'sprout', x: 2, y: 4, spry: true }, { kind: 'keeper', x: 5, y: 5 }],
      [{ kind: 'thistle', x: 1, y: 4 }, { kind: 'thistle', x: 2, y: 3 }],
    );
    const p = at(s, 2, 4);
    const moves = movesFor(s, p);
    expect(has(moves, 3, 4)).toBe(true); // sidestep onto empty
    expect(has(moves, 2, 5)).toBe(true); // even backward
    expect(has(moves, 1, 4)).toBe(false); // spry steps never capture
    expect(has(moves, 2, 3)).toBe(false); // still can't take head-on
    // attack pattern is untouched: still only the forward diagonals
    const threats = threatsFor(s, p);
    expect(has(threats, 1, 3)).toBe(true);
    expect(has(threats, 3, 3)).toBe(true);
    expect(threats.length).toBe(2);
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

  it('keeper steps one square, clipped to the board', () => {
    const s = fight([{ kind: 'keeper', x: 0, y: 0 }], [{ kind: 'thistle', x: 4, y: 4 }]);
    expect(movesFor(s, at(s, 0, 0))).toHaveLength(3);
  });
});
