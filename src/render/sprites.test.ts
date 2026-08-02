import { describe, expect, it } from 'vitest';
import { RANK_BADGE, SPRITE_SIZE, SPRITES } from './sprites';

describe('sprite pixel maps', () => {
  for (const [kind, spr] of Object.entries(SPRITES)) {
    it(`${kind} is ${SPRITE_SIZE}×${SPRITE_SIZE} with a complete palette`, () => {
      expect(spr.rows).toHaveLength(SPRITE_SIZE);
      for (const row of spr.rows) {
        expect(row).toHaveLength(SPRITE_SIZE);
        for (const ch of row) {
          if (ch !== '.') expect(spr.colors[ch], `char '${ch}'`).toBeTruthy();
        }
      }
    });
  }
});

describe('rank badges', () => {
  /** Two critters that move alike must wear the same pip — that's the whole point. */
  const PAIRS = [
    ['sprout', 'thistle'],
    ['hopper', 'tumbleweed'],
    ['slink', 'creeper'],
    ['rumble', 'golem'],
    ['duchess', 'gloom'],
  ] as const;

  it('paired kinds share a pip and different ranks never collide', () => {
    const shapes = new Set<string>();
    for (const [friend, foe] of PAIRS) {
      const a = RANK_BADGE[friend];
      const b = RANK_BADGE[foe];
      expect(a, friend).toBeTruthy();
      expect(a!.join('/')).toBe(b!.join('/'));
      shapes.add(a!.join('/'));
    }
    expect(shapes.size).toBe(PAIRS.length);
  });

  it('every pip is a 3×3 map of set/clear pixels', () => {
    for (const [kind, rows] of Object.entries(RANK_BADGE)) {
      expect(rows, kind).toHaveLength(3);
      for (const row of rows!) {
        expect(row).toHaveLength(3);
        expect(/^[#.]+$/.test(row)).toBe(true);
      }
    }
  });

  it('the one-of-a-kind pieces stay unbadged', () => {
    expect(RANK_BADGE.keeper).toBeUndefined();
    expect(RANK_BADGE.heart).toBeUndefined();
  });
});
