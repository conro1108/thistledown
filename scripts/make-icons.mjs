// Hand-rolled PNG icon generator — no image-library dependency needed for a
// handful of flat pixel-art icons. Draws the thistle glyph (the game's icon:
// the thing that becomes flowers when you win) on a 16x16 grid, then
// nearest-neighbor upscales to each target size.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

// The scene: the thistle at golden hour — purple head against the gold horizon
// band, feet in meadow grass. Same palette family as the in-game Meadow theme,
// so the home-screen tile and the game it opens read as one thing.
const PALETTE = {
  A: [0x7e, 0xa7, 0xc4, 255], // upper sky
  B: [0xd9, 0xc9, 0x90, 255], // hazy mid sky
  C: [0xee, 0xc8, 0x7e, 255], // gold horizon
  G: [0x7b, 0xa2, 0x4f, 255], // meadow grass
  M: [0x6f, 0x96, 0x46, 255], // grass mottle
  L: [0xff, 0xf3, 0xc8, 255], // the low sun
  W: [0xff, 0xd9, 0x66, 255], // lantern-gold sparkle
  v: [0x9a, 0x6b, 0xd0, 255], // thistle petals
  k: [0x2a, 0x23, 0x33, 255], // eyes
  g: [0x45, 0x6e, 0x35, 255], // stem, dark enough to read on grass and gold
};

const BACKDROP = [
  'AAAAAAAAAAAAAAAA',
  'AAAAAAAAAAAALLAA',
  'AAAAAAAAAAAALLAA',
  'BBBBBBBBBBBBBBBB',
  'BBWBBBBBBBBBBBBB',
  'CCCCCCCCCCCCCCCC',
  'CCCCCCCCCCCCCWCC',
  'CCCCCCCCCCCCCCCC',
  'CCCCCCCCCCCCCCCC',
  'CCCCCCCCCCCCCCCC',
  'GGGGMGGGGGGMGGGG',
  'GGGGGGGGGGGGGGGG',
  'GMGGGGGGGGGMGGGG',
  'GGGGGGMGGGGGGGGG',
  'GGGGGGGGGGMGGGGG',
  'GGGGGGGGGGGGGGGG',
];

const THISTLE = [
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
];

const SRC = 16;
const grid = BACKDROP.map((row) => row.split(''));
for (let y = 0; y < THISTLE.length; y++) {
  for (let x = 0; x < THISTLE[y].length; x++) {
    if (THISTLE[y][x] !== '.') grid[y + 2][x + 2] = THISTLE[y][x];
  }
}

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let i = 0; i < 8; i++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(pixels, size) {
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 4);
    raw[rowStart] = 0; // no filter
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixels(x, y);
      const off = rowStart + 1 + x * 4;
      raw[off] = r;
      raw[off + 1] = g;
      raw[off + 2] = b;
      raw[off + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = deflateSync(raw);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function iconAt(size) {
  return (x, y) => {
    const sx = Math.min(SRC - 1, Math.floor((x * SRC) / size));
    const sy = Math.min(SRC - 1, Math.floor((y * SRC) / size));
    return PALETTE[grid[sy][sx]];
  };
}

mkdirSync('public/icons', { recursive: true });
for (const [name, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['maskable-512.png', 512],
  ['apple-touch-icon.png', 180],
  ['favicon-32.png', 32],
]) {
  writeFileSync(`public/icons/${name}`, encodePng(iconAt(size), size));
  console.log('wrote', name);
}
