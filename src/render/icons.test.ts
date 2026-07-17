import { describe, expect, it } from 'vitest';
import { ICON_SIZE, ICONS } from './icons';

describe('icon pixel maps', () => {
  for (const [name, icon] of Object.entries(ICONS)) {
    it(`${name} is ${ICON_SIZE}×${ICON_SIZE} with a complete palette`, () => {
      expect(icon.rows).toHaveLength(ICON_SIZE);
      for (const row of icon.rows) {
        expect(row, `${name} row "${row}"`).toHaveLength(ICON_SIZE);
        for (const ch of row) {
          if (ch !== '.') expect(icon.colors[ch], `char '${ch}'`).toBeTruthy();
        }
      }
    });
  }
});
