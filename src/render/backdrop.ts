/**
 * The meadow behind the board: sky, sun, drifting clouds, a rolling hill
 * ridge, and flowered grass. Drawn to a low-res buffer that shares the
 * board's pixel density — main.ts sizes the buffer so one backdrop pixel is
 * exactly one board pixel on screen (integer scaling only, as always).
 *
 * Render-only and deterministic: motion comes from the clock, variety from
 * integer hashes. Nothing here touches game state or the seeded RNG.
 */

const SKY = '#a8dcec';
const SKY_HORIZON = '#cfeef8';
const HILL = '#7ab35e';
const GRASS = '#8fbd58';
const TUFT = '#7cab47';

// Distant hill ridge: one soft cosine, so every mound has the same low crown.
// HILL_MIN is the ridge's lowest point; the light horizon band is sized to it
// so the hills always mask the band fully and no seam shows in the valleys.
const HILL_PERIOD = 38;
const HILL_PEAK_X = 18;
function hillHeightAt(x: number): number {
  return 12 + 4 * Math.cos((2 * Math.PI * (x - HILL_PEAK_X)) / HILL_PERIOD);
}
const HILL_MIN = 8;

// Round pixel discs as half-widths per 1px row — reads at this density where
// a hard square wouldn't.
const SUN_ROWS: [number, number][] = [
  [-4, 2], [-3, 3], [-2, 4], [-1, 4], [0, 4], [1, 4], [2, 4], [3, 3], [4, 2],
];

// Cloud variants — puffs of [dx, dy, w, h] riding on a base so none read flat.
// A cloud re-rolls its look and height every time it wraps the sky.
const CLOUD_SHAPES: [number, number, number, number][][] = [
  [[0, 2, 16, 3], [3, 0, 7, 3], [10, 1, 5, 2]],
  [[0, 2, 12, 3], [2, 0, 6, 3], [7, 0, 5, 3]],
  [[1, 2, 9, 2], [2, 0, 6, 3], [4, -1, 3, 2]],
  [[0, 3, 17, 2], [1, 1, 5, 2], [6, 0, 6, 3], [12, 1, 5, 2]],
];

const FLOWER_PETALS = ['#e8a7c8', '#f2d478', '#f5eede'];

/** Cheap deterministic 0..1 hash of an integer — variety without state. */
function hash(n: number): number {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

export function drawBackdrop(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  floorY: number,
  timeMs: number,
) {
  const t = timeMs / 1000;

  // --- sky -------------------------------------------------------------
  ctx.fillStyle = SKY;
  ctx.fillRect(0, 0, w, floorY);
  ctx.fillStyle = SKY_HORIZON;
  ctx.fillRect(0, floorY - HILL_MIN, w, HILL_MIN);

  // sun, top-right, with a glint on its shoulder
  const sx = w - 16;
  ctx.fillStyle = '#ffe9a3';
  for (const [dy, hw] of SUN_ROWS) ctx.fillRect(sx - hw, 12 + dy, hw * 2 + 1, 1);
  ctx.fillStyle = '#fff2c8';
  ctx.fillRect(sx - 3, 9, 3, 1);
  ctx.fillRect(sx - 2, 8, 2, 1);

  ctx.fillStyle = '#ffffff';
  drawClouds(ctx, w, t);

  // --- hills -----------------------------------------------------------
  ctx.fillStyle = HILL;
  for (let x = 0; x < w; x++) {
    const hh = Math.round(hillHeightAt(x));
    ctx.fillRect(x, floorY - hh, 1, hh);
  }

  // --- grass -----------------------------------------------------------
  ctx.fillStyle = GRASS;
  ctx.fillRect(0, floorY, w, h - floorY);

  const grassH = h - floorY;
  ctx.fillStyle = TUFT;
  for (let i = 0; i < Math.ceil(w / 7); i++) {
    const gx = (i * 37 + 11) % w;
    const gy = floorY + 3 + ((i * 13) % Math.max(1, grassH - 6));
    ctx.fillRect(gx, gy, 2, 1);
    ctx.fillRect(gx + 1, gy - 1, 1, 1);
  }

  // little blooms on stems, scattered by hash — most hide behind the board,
  // the rest peek around its edges
  for (let i = 0; i < Math.ceil(w / 16); i++) {
    const fx = (i * 53 + 7) % Math.max(1, w - 4);
    const fy = floorY + 8 + Math.floor(hash(i * 3 + 1) * Math.max(1, grassH - 14));
    ctx.fillStyle = '#5d8f4a';
    ctx.fillRect(fx + 1, fy, 1, 3);
    ctx.fillStyle = FLOWER_PETALS[i % FLOWER_PETALS.length];
    ctx.fillRect(fx, fy - 3, 3, 3);
    ctx.fillStyle = '#fdf6e3';
    ctx.fillRect(fx + 1, fy - 2, 1, 1);
  }

  drawFence(ctx, w, floorY);
  drawMushroom(ctx, 5, Math.min(h - 3, floorY + grassH - 6));
}

/** Two clouds drifting at different speeds in an upper and lower band. Each
 *  wrap re-rolls shape and height, so the sky never loops the same pair. */
function drawClouds(ctx: CanvasRenderingContext2D, w: number, t: number) {
  const span = w + 40;
  const tracks = [
    { speed: 2.4, band: 5, salt: 3 },
    { speed: 1.5, band: 20, salt: 11 },
  ];
  for (const tr of tracks) {
    const dist = t * tr.speed + tr.salt * 31;
    const wrap = Math.floor(dist / span);
    const x = w + 20 - Math.round(dist % span);
    const shape = CLOUD_SHAPES[Math.floor(hash(wrap * 7 + tr.salt) * CLOUD_SHAPES.length)];
    const y = tr.band + Math.floor(hash(wrap * 13 + tr.salt) * 7);
    for (const [dx, dy, cw, ch] of shape) ctx.fillRect(x + dx, y + dy, cw, ch);
  }
}

/** A stretch of garden fence straddling the horizon at the right edge. */
function drawFence(ctx: CanvasRenderingContext2D, w: number, floorY: number) {
  const rail = '#a97b50';
  const cap = '#96683f';
  for (let x = w - 24; x <= w - 3; x += 7) {
    ctx.fillStyle = rail;
    ctx.fillRect(x, floorY - 8, 3, 14);
    ctx.fillStyle = cap;
    ctx.fillRect(x, floorY - 8, 3, 2);
  }
  ctx.fillStyle = rail;
  ctx.fillRect(w - 26, floorY - 5, 26, 2);
  ctx.fillRect(w - 26, floorY + 1, 26, 2);
}

/** A toadstool tucked in the near grass, bottom-left. `y` is its base. */
function drawMushroom(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#efe2c8';
  ctx.fillRect(x + 2, y - 4, 3, 4); // stem
  ctx.fillStyle = '#c94f42';
  ctx.fillRect(x, y - 6, 7, 2); // cap brim
  ctx.fillRect(x + 1, y - 7, 5, 1);
  ctx.fillRect(x + 2, y - 8, 3, 1);
  ctx.fillStyle = '#f4e9d4'; // spots
  ctx.fillRect(x + 1, y - 6, 1, 1);
  ctx.fillRect(x + 4, y - 7, 1, 1);
  ctx.fillRect(x + 5, y - 5, 1, 1);
}
