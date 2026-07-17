import type { Sprite } from './sprites';

/**
 * 12×12 pixel-art UI icons, same char-map format as the critter sprites.
 * These replace emoji everywhere in the DOM so the whole interface shares
 * one pixel grid. Rendered once to data-URL <img>s (cached) so they can sit
 * inline in text, titles, and buttons.
 */
export const ICON_SIZE = 12;

export type IconName =
  | 'daisy'
  | 'blossom'
  | 'bloom'
  | 'tulip'
  | 'sparkle'
  | 'trophy'
  | 'leaf'
  | 'stew'
  | 'honey'
  | 'fire'
  | 'zzz'
  | 'sprout'
  | 'fern'
  | 'cloak'
  | 'acorn'
  | 'pancakes'
  | 'teacup'
  | 'scales'
  | 'wolf'
  | 'wrench'
  | 'rewind'
  | 'warning'
  | 'question';

// the daisy shape is the game's whole motif, so three flowers share it in
// different meadow colorways (white, pink, pale) — cheap variety for petals
const FLOWER_ROWS = [
  '............',
  '.....pp.....',
  '.p..pppp..p.',
  '.pp.pppp.pp.',
  '..ppccccpp..',
  '..ppccccpp..',
  '..ppccccpp..',
  '.pp.pppp.pp.',
  '.p..pppp..p.',
  '.....pp.....',
  '............',
  '............',
];

export const ICONS: Record<IconName, Sprite> = {
  daisy: { colors: { p: '#f6f3e8', c: '#ffd166' }, rows: FLOWER_ROWS },
  blossom: { colors: { p: '#f0a8c0', c: '#d86a90' }, rows: FLOWER_ROWS },
  bloom: { colors: { p: '#cdb8f0', c: '#f6f3e8' }, rows: FLOWER_ROWS },
  tulip: {
    colors: { r: '#e87a90', g: '#5d8f4a' },
    rows: [
      '............',
      '...r.rr.r...',
      '...rrrrrr...',
      '...rrrrrr...',
      '...rrrrrr...',
      '....rrrr....',
      '.....gg.....',
      '..g..gg.....',
      '..gg.gg.....',
      '...gggg.....',
      '.....gg.....',
      '............',
    ],
  },
  sparkle: {
    colors: { y: '#ffd166', W: '#fff6d8' },
    rows: [
      '............',
      '.....yy.....',
      '.....yy.....',
      '....yyyy....',
      '.yyyyWWyyyy.',
      '.yyyyWWyyyy.',
      '....yyyy....',
      '.....yy.....',
      '.....yy.....',
      '..y......y..',
      '............',
      '............',
    ],
  },
  trophy: {
    colors: { y: '#ffd166', d: '#b5821f' },
    rows: [
      '............',
      '.dyyyyyyyyd.',
      '.dyyyyyyyyd.',
      '.d.yyyyyy.d.',
      '..d.yyyy.d..',
      '...dyyyyd...',
      '....yyyy....',
      '.....yy.....',
      '.....yy.....',
      '....dddd....',
      '...dddddd...',
      '............',
    ],
  },
  leaf: {
    colors: { g: '#7fae64', l: '#a8d087' },
    rows: [
      '............',
      '.........g..',
      '.......ggg..',
      '.....ggggg..',
      '....gglggg..',
      '...gglgggg..',
      '..ggglggg...',
      '..gglgg.....',
      '..glgg......',
      '..gg........',
      '.g..........',
      '............',
    ],
  },
  stew: {
    colors: { c: '#d8d2c0', o: '#b5764a', r: '#e08a5a', d: '#8a5a33' },
    rows: [
      '...c..c.....',
      '..c..c......',
      '...c..c.....',
      '............',
      '.oooooooooo.',
      '.orrrrrrrro.',
      '..oooooooo..',
      '..oooooooo..',
      '...oooooo...',
      '....oooo....',
      '...dddddd...',
      '............',
    ],
  },
  honey: {
    colors: { d: '#8a5a33', h: '#c98a4b', y: '#ffd166' },
    rows: [
      '............',
      '....dddd....',
      '...dddddd...',
      '....hhhh....',
      '..hhhhhhhh..',
      '.hhhhhhhhhh.',
      '.hhyyyyyyhh.',
      '.hhhhhhhhhh.',
      '..hhhhhhhh..',
      '...hhhhhh...',
      '............',
      '............',
    ],
  },
  fire: {
    colors: { r: '#d96a3a', y: '#ffd166', W: '#fff6d8' },
    rows: [
      '............',
      '.....r......',
      '.....rr.....',
      '....rrr.....',
      '...rrrrr....',
      '...rryrr....',
      '..rryyyrr...',
      '..ryyyyyr...',
      '..ryyWyyr...',
      '..ryyWyyr...',
      '...ryyyr....',
      '....rrr.....',
    ],
  },
  zzz: {
    colors: { z: '#cdb8f0', Z: '#a89ac8' },
    rows: [
      '............',
      '..zzzz......',
      '.....z......',
      '....z.......',
      '...z........',
      '..zzzz......',
      '......ZZZ...',
      '........Z...',
      '.......Z....',
      '......ZZZ...',
      '............',
      '............',
    ],
  },
  sprout: {
    colors: { l: '#a8d087', g: '#5d8f4a', d: '#6d4930' },
    rows: [
      '............',
      '............',
      '..ll...gg...',
      '.llll.gggg..',
      '.llll.gggg..',
      '..lll.ggg...',
      '....l.gg....',
      '.....gg.....',
      '.....gg.....',
      '....dddd....',
      '...dddddd...',
      '............',
    ],
  },
  fern: {
    colors: { g: '#5d8f4a', l: '#7fae64' },
    rows: [
      '............',
      '.........g..',
      '....l...gg..',
      '...lll.gg...',
      '....l.gg.l..',
      '..l..gg.ll..',
      '.lll.gg.....',
      '..l.gg......',
      '...gg.......',
      '..gg........',
      '.gg.........',
      '............',
    ],
  },
  cloak: {
    colors: { y: '#ffd166', d: '#d8a35a' },
    rows: [
      '............',
      '...yyyyyy...',
      '..yyyyyyyy..',
      '..yydyydyy..',
      '..yyyyyyyy..',
      '...yyyyyy...',
      '.....yyy....',
      '.....yyy....',
      '.....ydy....',
      '.....yyy....',
      '....y.y.y...',
      '............',
    ],
  },
  acorn: {
    colors: { b: '#8a5a33', d: '#6d4930', n: '#c98a4b' },
    rows: [
      '............',
      '.....bb.....',
      '...bbbbbb...',
      '..bbbbbbbb..',
      '..bdbdbdbb..',
      '..nnnnnnnn..',
      '..nnnnnnnn..',
      '...nnnnnn...',
      '...nnnnnn...',
      '....nnnn....',
      '.....nn.....',
      '............',
    ],
  },
  pancakes: {
    colors: { y: '#ffd166', p: '#f7cfa0', d: '#d8a35a', w: '#eae6dc' },
    rows: [
      '............',
      '.....yy.....',
      '....yyyy....',
      '..pppppppp..',
      '.pppppppppp.',
      '.dddddddddd.',
      '.pppppppppp.',
      '.dddddddddd.',
      '..pppppppp..',
      '.wwwwwwwwww.',
      '............',
      '............',
    ],
  },
  teacup: {
    colors: { c: '#d8d2c0', w: '#f6f3e8', g: '#7fae64', d: '#b5764a' },
    rows: [
      '...c..c.....',
      '..c..c......',
      '...c..c.....',
      '............',
      '.wwwwwwww...',
      '.wggggggw.w.',
      '.wggggggwww.',
      '.wwwwwwwww..',
      '..wwwwww....',
      '...wwww.....',
      '..dddddd....',
      '............',
    ],
  },
  scales: {
    colors: { y: '#ffd166' },
    rows: [
      '.....yy.....',
      '.y...yy...y.',
      '.yyyyyyyyyy.',
      '.y...yy...y.',
      '.y...yy...y.',
      'yyy..yy..yyy',
      'y.y..yy..y.y',
      'yyy..yy..yyy',
      '.....yy.....',
      '.....yy.....',
      '...yyyyyy...',
      '............',
    ],
  },
  wolf: {
    colors: { g: '#8a8f9a', k: '#26242c', w: '#eae6dc' },
    rows: [
      '............',
      '..g.....g...',
      '..gg...gg...',
      '..ggg.ggg...',
      '..ggggggg...',
      '..ggggggg...',
      '..gkggkgg...',
      '..ggggggg...',
      '...gwwwg....',
      '...gwkwg....',
      '....ggg.....',
      '............',
    ],
  },
  wrench: {
    colors: { s: '#a8adb8' },
    rows: [
      '............',
      '..ss....ss..',
      '..ss....ss..',
      '..ssssssss..',
      '...ssssss...',
      '.....ss.....',
      '.....ss.....',
      '.....ss.....',
      '.....ss.....',
      '....ssss....',
      '....ssss....',
      '............',
    ],
  },
  rewind: {
    colors: { a: '#e8e2cf' },
    rows: [
      '............',
      '............',
      '....a....a..',
      '...aa...aa..',
      '..aaa..aaa..',
      '.aaaa.aaaa..',
      '..aaa..aaa..',
      '...aa...aa..',
      '....a....a..',
      '............',
      '............',
      '............',
    ],
  },
  warning: {
    colors: { y: '#ffd166', k: '#33303b' },
    rows: [
      '.....yy.....',
      '.....yy.....',
      '....yyyy....',
      '....ykky....',
      '...yykkyy...',
      '...yykkyy...',
      '..yyykkyyy..',
      '..yyyyyyyy..',
      '..yyykkyyy..',
      '.yyyyyyyyyy.',
      '.yyyyyyyyyy.',
      '............',
    ],
  },
  question: {
    colors: { y: '#ffd166' },
    rows: [
      '............',
      '...yyyyyy...',
      '..yy....yy..',
      '..yy....yy..',
      '........yy..',
      '......yyy...',
      '.....yy.....',
      '.....yy.....',
      '............',
      '.....yy.....',
      '.....yy.....',
      '............',
    ],
  },
};

const urlCache = new Map<IconName, string>();

/** Data URL of an icon rendered 1 canvas px per cell (CSS scales it up). */
export function iconDataUrl(name: IconName): string {
  let url = urlCache.get(name);
  if (url) return url;
  const icon = ICONS[name];
  const cv = document.createElement('canvas');
  cv.width = ICON_SIZE;
  cv.height = ICON_SIZE;
  const c = cv.getContext('2d')!;
  for (let y = 0; y < icon.rows.length; y++) {
    const row = icon.rows[y];
    for (let x = 0; x < row.length; x++) {
      const col = icon.colors[row[x]];
      if (col) {
        c.fillStyle = col;
        c.fillRect(x, y, 1, 1);
      }
    }
  }
  url = cv.toDataURL();
  urlCache.set(name, url);
  return url;
}

/** An <img> for the icon. Extra classes size it: p2 = 24px, p3 = 36px. */
export function iconEl(name: IconName, cls = ''): HTMLImageElement {
  const img = document.createElement('img');
  img.className = cls ? `picon ${cls}` : 'picon';
  img.src = iconDataUrl(name);
  img.alt = '';
  img.draggable = false;
  return img;
}

/** Icon as an HTML string, for splicing into innerHTML template text. */
export function iconHTML(name: IconName, cls = ''): string {
  return iconEl(name, cls).outerHTML;
}
