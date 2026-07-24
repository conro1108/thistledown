import { describe, expect, it } from 'vitest';
import css from './style.css?raw';

/**
 * The chrome has to obey the same rule as the renderer: integer pixels only.
 * A 1.5px border or a 10.5px glyph is a blurred half-pixel next to sprites we
 * scale with `Math.floor`, and that mismatch is invisible one rule at a time
 * but reads as "slightly cheap" across a whole screen. These two tests keep
 * the CSS honest so the rule survives future tweaks.
 */

/** Rule blocks as [selector, body] pairs, comments stripped. */
function rules(): [string, string][] {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: [string, string][] = [];
  for (const m of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    out.push([m[1].trim().replace(/\s+/g, ' '), m[2]]);
  }
  return out;
}

describe('style.css stays on the pixel grid', () => {
  it('has no fractional px values', () => {
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const offenders: string[] = [];
    for (const line of stripped.split('\n')) {
      for (const m of line.matchAll(/-?\d+\.\d+px/g)) offenders.push(`${m[0]} in "${line.trim()}"`);
    }
    expect(offenders).toEqual([]);
  });

  /**
   * Sprites and icons are 12×12 sources. Any CSS size for one must be a whole
   * multiple of 12, or the browser resamples and the pixel art goes mushy —
   * exactly the bug that shipped in `.opt .face` (40px), `.picon.p15` (18px)
   * and `.petal .picon` (20px).
   */
  it('scales 12px pixel-art sources by whole multiples of 12', () => {
    const pixelArt = /\.picon|\.face|\.mini|\.movebg/;
    const offenders: string[] = [];
    for (const [selector, body] of rules()) {
      if (!pixelArt.test(selector)) continue;
      for (const m of body.matchAll(/\b(?:width|height)\s*:\s*(\d+)px/g)) {
        if (Number(m[1]) % 12 !== 0) offenders.push(`${selector} { ${m[0]} }`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
