import { describe, expect, it } from 'vitest';
import { SPRITE_SIZE, SPRITES } from './sprites';

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
