import type { Kind } from '../game/types';

/**
 * 12×12 pixel maps, drawn 1 canvas px per cell inside a 16px tile.
 * '.' is transparent; every other char must exist in `colors`.
 * Row lengths are enforced by sprites.test.ts.
 */
export interface Sprite {
  rows: string[];
  colors: Record<string, string>;
}

export const SPRITE_SIZE = 12;

export const SPRITES: Record<Kind, Sprite> = {
  keeper: {
    colors: { h: '#f2e5c9', f: '#f7cfa0', k: '#33303b', r: '#b5764a', g: '#8a5a33', L: '#ffd966' },
    rows: [
      '............',
      '....hhhh....',
      '...hhhhhh...',
      '...hffffh...',
      '...hfkfkh...',
      '...hffffh...',
      '....rrrr....',
      '...rrrrrr...',
      '..grrrrrrg..',
      '..Lrrrrrr...',
      '..LL.rrrr...',
      '....r..r....',
    ],
  },
  sprout: {
    colors: { s: '#6d4930', b: '#a97c50', f: '#eecfa4', k: '#2f2a26', n: '#4a3428' },
    rows: [
      '............',
      '............',
      '..s..s..s...',
      '.sssssss....',
      '.sssssssss..',
      '.ssssssbff..',
      'ssssssbfkf..',
      'sssssbbfffn.',
      '.ssssbbbff..',
      '.bbbbbbbb...',
      '..bb...bb...',
      '............',
    ],
  },
  hopper: {
    colors: { w: '#eae6dc', p: '#f0b0c0', k: '#2f2a33' },
    rows: [
      '...w....w...',
      '..ww....ww..',
      '..wp....pw..',
      '..wp....pw..',
      '..ww....ww..',
      '...wwwwww...',
      '..wwwwwwww..',
      '..wkwwwwkw..',
      '..wwwpwwww..',
      '..wwwwwwww..',
      '...wwwwww...',
      '...ww..ww...',
    ],
  },
  slink: {
    colors: { o: '#c98a4b', m: '#5a4632', c: '#f0e0c8', k: '#2f2a26' },
    rows: [
      '............',
      '.m.m........',
      '.ccc........',
      '.mkmc.......',
      '.cccoo......',
      '..ooooooo...',
      '..oooooooo..',
      '...ooooooom.',
      '..oo....oo..',
      '............',
      '............',
      '............',
    ],
  },
  rumble: {
    colors: { g: '#7d7f88', w: '#f0f0ea', k: '#26242c', b: '#3c3a45' },
    rows: [
      '............',
      '..b......b..',
      '..gggggggg..',
      '..wbwwwwbw..',
      '..wbkwwkbw..',
      '..wwwwwwww..',
      '..gggggggg..',
      '.gggggggggg.',
      '.gggggggggg.',
      '..gggggggg..',
      '..bb....bb..',
      '............',
    ],
  },
  duchess: {
    colors: { w: '#f6f3fb', v: '#cfc3e8', k: '#33303b', y: '#e8c25a' },
    rows: [
      '...ww..w....',
      '...www......',
      '...wkwyy....',
      '....ww......',
      '....ww......',
      '...wwww.....',
      '..wwwwww....',
      '..vvwwww....',
      '..vvvwww....',
      '...vvww.....',
      '....y.......',
      '....y..y....',
    ],
  },
  thistle: {
    colors: { v: '#9a6bd0', k: '#2a2333', g: '#5d8f4a' },
    rows: [
      '..v..v..v...',
      '...vvvvv....',
      '..vvvvvvv...',
      '..vkvvvkv...',
      '..vvvvvvv...',
      '...vvvvv....',
      '....ggg.....',
      '...g.g.g....',
      '.....g......',
      '.....g......',
      '....ggg.....',
      '............',
    ],
  },
  tumbleweed: {
    colors: { t: '#c2a15e', d: '#8a7040', k: '#2f2a26' },
    rows: [
      '............',
      '............',
      '...t.tt.t...',
      '..tdtttdt...',
      '.ttttdtttt..',
      '.tdtkttktt..',
      '.ttttttttt..',
      '.tdttdtttd..',
      '..ttttttt...',
      '...tt.tt....',
      '............',
      '............',
    ],
  },
  creeper: {
    colors: { g: '#4f7d43', l: '#7fae64', y: '#e8e06a' },
    rows: [
      '.....ll.....',
      '....gg......',
      '...gygyg....',
      '....gg......',
      '.....gg.....',
      '..l...gg....',
      '....ggg.....',
      '...gg.......',
      '...gg...l...',
      '....ggg.....',
      '......gg....',
      '............',
    ],
  },
  golem: {
    colors: { b: '#6e4f33', d: '#4a3320', y: '#ffce54', g: '#6a8f4a' },
    rows: [
      '............',
      '..d.dddd.d..',
      '..dbbbbbbd..',
      '..bbbbbbbb..',
      '..bybbbbyb..',
      '..bbbbbbbb..',
      '..bbgbbgbb..',
      '..bbbbbbbb..',
      '...bbbbbb...',
      '..dd.dd.dd..',
      '..d...d..d..',
      '............',
    ],
  },
  gloom: {
    colors: { v: '#7a5fae', d: '#4a3670', y: '#f0e68c' },
    rows: [
      '............',
      '....dddd....',
      '...dvvvvd...',
      '..dvvvvvvd..',
      '..dvyvvyvd..',
      '..dvvvvvvd..',
      '..dvvvvvvd..',
      '...dvvvvd...',
      '..d.dvvd.d..',
      '....d..d....',
      '............',
      '............',
    ],
  },
};

export function drawSprite(ctx: CanvasRenderingContext2D, kind: Kind, px: number, py: number) {
  const spr = SPRITES[kind];
  for (let y = 0; y < spr.rows.length; y++) {
    const row = spr.rows[y];
    for (let x = 0; x < row.length; x++) {
      const c = spr.colors[row[x]];
      if (c) {
        ctx.fillStyle = c;
        ctx.fillRect(px + x, py + y, 1, 1);
      }
    }
  }
}
