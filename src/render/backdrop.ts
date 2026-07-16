/**
 * The overgrown swamp behind the board: a bruised dusk sky, a pale moon,
 * jagged pine silhouettes, fog, black water, and little will-o'-wisps. The
 * board is the one lit clearing in it — everything out here stays dark and
 * quiet so the fight reads bright against it.
 *
 * Drawn to a low-res buffer that shares the board's pixel density — main.ts
 * sizes the buffer so one backdrop pixel is exactly one board pixel on
 * screen (integer scaling only, as always).
 *
 * Render-only and deterministic: motion comes from the clock, variety from
 * integer hashes. Nothing here touches game state or the seeded RNG.
 */

// Sky ramp, zenith (0) → horizon (1): deep bruise-purple sinking into a
// sickly bog-green glow. Painted one 1px row at a time — canvas gradients
// dither, and the speckle survives the upscale as noise.
type SkyStop = [number, [number, number, number]];
const SKY_STOPS: SkyStop[] = [
  [0, [23, 20, 36]],
  [0.5, [41, 42, 62]],
  [0.82, [56, 71, 66]],
  [1, [88, 102, 70]],
];

const TREE_FAR = '#2c3d36'; // distant pines, half-swallowed by the murk
const TREE_NEAR = '#1c2823'; // near silhouettes, nearly black
const GROUND = '#46583a';
const GROUND_MOTTLE = '#3e4f33';
const TUFT = '#37472d';
const WATER = '#25383e';
const WATER_GLINT = '#4c6a6e';
const FOG = '#6d7d70';
const WISP = '#d8eea6';

// Round pixel discs as half-widths per 1px row.
const MOON_ROWS: [number, number][] = [
  [-3, 2], [-2, 3], [-1, 3], [0, 3], [1, 3], [2, 3], [3, 2],
];

// Fog banks — puffs of [dx, dy, w, h] riding on a base, long and low.
const FOG_SHAPES: [number, number, number, number][][] = [
  [[0, 2, 20, 2], [4, 0, 9, 2], [13, 1, 6, 1]],
  [[0, 1, 14, 2], [3, 0, 7, 1], [9, 2, 8, 1]],
  [[1, 2, 11, 2], [2, 0, 7, 2]],
];

/** Cheap deterministic 0..1 hash of an integer — variety without state. */
function hash(n: number): number {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

/** The sky's colour at row `y` of `h`, interpolated between the stops. */
function skyRow(y: number, h: number): string {
  const p = h > 1 ? y / (h - 1) : 0;
  let i = 1;
  while (i < SKY_STOPS.length - 1 && p > SKY_STOPS[i][0]) i++;
  const [p0, c0] = SKY_STOPS[i - 1];
  const [p1, c1] = SKY_STOPS[i];
  const k = p1 === p0 ? 0 : (p - p0) / (p1 - p0);
  const mix = (a: number, b: number) => Math.round(a + (b - a) * k);
  return `rgb(${mix(c0[0], c1[0])},${mix(c0[1], c1[1])},${mix(c0[2], c1[2])})`;
}

export function drawBackdrop(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  floorY: number,
  timeMs: number,
) {
  const t = timeMs / 1000;

  // --- sky ---------------------------------------------------------------
  for (let y = 0; y < floorY; y++) {
    ctx.fillStyle = skyRow(y, floorY);
    ctx.fillRect(0, y, w, 1);
  }

  // a few cold stars, twinkling out of phase
  ctx.fillStyle = '#c6cbe4';
  for (let i = 0; i < Math.ceil(w / 22); i++) {
    const sx = (i * 41 + 9) % w;
    const sy = 3 + Math.floor(hash(i * 7 + 3) * Math.max(4, floorY * 0.45));
    if (Math.sin(t * 1.6 + sx) > -0.2) ctx.fillRect(sx, sy, 1, 1);
  }

  // pale moon, top-right. Carve the crescent *before* the halo goes on: the
  // carve repaints the disc in the sky's own colour, and it has to match the
  // unlit sky exactly or it shows as a dark hole in the glow.
  const mx = w - 15;
  const my = 11;
  ctx.fillStyle = '#e9e4cc';
  for (const [dy, hw] of MOON_ROWS) ctx.fillRect(mx - hw, my + dy, hw * 2 + 1, 1);
  for (const [dy, hw] of MOON_ROWS) {
    ctx.fillStyle = skyRow(my + dy, floorY);
    ctx.fillRect(mx + 3 - hw, my + dy, hw * 2 + 1, 1);
  }
  const halo = ctx.createRadialGradient(mx, my, 2, mx, my, 14);
  halo.addColorStop(0, 'rgba(233,228,204,0.22)');
  halo.addColorStop(1, 'rgba(233,228,204,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(mx - 14, my - 14, 28, 28);

  // --- far treeline: a jagged wall of pines ------------------------------
  ctx.fillStyle = TREE_FAR;
  for (let i = 0; i * 10 < w + 12; i++) {
    const px = i * 10 - 4;
    const ph = 11 + Math.floor(hash(i * 5 + 2) * 8);
    pine(ctx, px, floorY, ph, 9);
  }
  ctx.fillRect(0, floorY - 4, w, 4); // solid base so valleys don't show seams

  // fog banks drifting through the trees, half-transparent
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = FOG;
  drawFog(ctx, w, floorY, t);
  ctx.globalAlpha = 1;

  // --- near silhouettes, nearly black -----------------------------------
  ctx.fillStyle = TREE_NEAR;
  pine(ctx, 6, floorY + 2, 22, 13); // one looming pine off the left shoulder
  pine(ctx, w - 8, floorY + 1, 17, 11);
  drawDeadTree(ctx, 17, floorY + 3); // a snag leaning out of the left cluster

  // --- swamp floor --------------------------------------------------------
  ctx.fillStyle = GROUND;
  ctx.fillRect(0, floorY, w, h - floorY);

  const grassH = h - floorY;
  ctx.fillStyle = GROUND_MOTTLE;
  for (let i = 0; i < Math.ceil(w / 5); i++) {
    const gx = (i * 29 + 7) % w;
    const gy = floorY + 2 + ((i * 17) % Math.max(1, grassH - 4));
    ctx.fillRect(gx, gy, 2 + (i % 2), 1);
  }
  ctx.fillStyle = TUFT;
  for (let i = 0; i < Math.ceil(w / 9); i++) {
    const gx = (i * 37 + 12) % w;
    const gy = floorY + 4 + ((i * 13) % Math.max(1, grassH - 7));
    ctx.fillRect(gx, gy, 1, 2);
    ctx.fillRect(gx + 1, gy - 1, 1, 2);
  }

  // black water pooling in the bottom-right, moonlight shivering on it
  drawPool(ctx, w - 16, h - 5, t);
  // …and a smaller, stiller one at the left edge
  drawPool(ctx, 4, floorY + Math.max(8, Math.floor(grassH * 0.35)), t + 40, true);

  // glowing mushrooms, huddled bottom-left
  drawShrooms(ctx, 6, h - 4, t);

  // will-o'-wisps: slow pale lights wandering the marsh
  ctx.fillStyle = WISP;
  for (let i = 0; i < 5; i++) {
    const bx = (i * 67 + 21) % Math.max(1, w - 8);
    const wx = bx + Math.sin(t * 0.4 + i * 2.2) * 5;
    const wy = floorY - 3 + hash(i * 9 + 4) * 10 + Math.sin(t * 0.9 + i * 1.7) * 3;
    if (Math.sin(t * 2.1 + i * 2.6) > -0.35) {
      ctx.fillRect(Math.round(wx), Math.round(wy), 1, 1);
    }
  }
}

/** A pine silhouette: a stepped triangle sitting on `baseY`. */
function pine(
  ctx: CanvasRenderingContext2D,
  cx: number,
  baseY: number,
  height: number,
  baseW: number,
) {
  for (let r = 0; r < height; r++) {
    const hw = Math.max(0, Math.round(((r / height) * baseW) / 2));
    ctx.fillRect(cx - hw, baseY - height + r, hw * 2 + 1, 1);
  }
}

/** A bare, crooked snag reaching over the near treeline. Kinked twice on the
 *  way up so it never reads as a pole. Uses the current fill style. */
function drawDeadTree(ctx: CanvasRenderingContext2D, x: number, baseY: number) {
  ctx.fillRect(x, baseY - 10, 2, 10); // base
  ctx.fillRect(x + 1, baseY - 15, 2, 6); // first kink, leaning right
  ctx.fillRect(x, baseY - 19, 2, 5); // second kink back
  // a crooked branch clawing right and up
  ctx.fillRect(x + 2, baseY - 14, 4, 1);
  ctx.fillRect(x + 5, baseY - 16, 2, 2);
  ctx.fillRect(x + 6, baseY - 17, 1, 1);
  // a low broken stub to the left
  ctx.fillRect(x - 3, baseY - 9, 3, 1);
  ctx.fillRect(x - 4, baseY - 10, 1, 1);
}

/** A murky pool: dark still water with a shivering moon-glint. `small` trims
 *  it down for a side puddle. */
function drawPool(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  t: number,
  small = false,
) {
  const rows: [number, number][] = small
    ? [[-1, 4], [0, 6], [1, 4]]
    : [[-2, 5], [-1, 9], [0, 11], [1, 9], [2, 5]];
  ctx.fillStyle = WATER;
  for (const [dy, hw] of rows) ctx.fillRect(cx - hw, cy + dy, hw * 2 + 1, 1);
  // the glint drifts back and forth like a slow ripple
  const gx = cx - 2 + Math.round(Math.sin(t * 0.7) * (small ? 1 : 3));
  ctx.fillStyle = WATER_GLINT;
  ctx.fillRect(gx, cy, small ? 2 : 4, 1);
  if (!small) ctx.fillRect(gx + 5, cy - 1, 2, 1);
  // reeds at the water's edge
  ctx.fillStyle = '#37472d';
  const rx = cx - (small ? 5 : 10);
  ctx.fillRect(rx, cy - 6, 1, 6);
  ctx.fillRect(rx + 2, cy - 5, 1, 5);
  ctx.fillStyle = '#5e4630'; // cattail heads
  ctx.fillRect(rx, cy - 8, 1, 2);
  ctx.fillRect(rx + 2, cy - 7, 1, 2);
}

/** A huddle of faintly glowing swamp mushrooms. They breathe: the glow
 *  swells and dims on a slow cycle. */
function drawShrooms(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  const breathe = 0.22 + 0.1 * Math.sin(t * 1.3);
  const g = ctx.createRadialGradient(x + 3, y - 3, 1, x + 3, y - 3, 8);
  g.addColorStop(0, `rgba(201,160,232,${breathe})`);
  g.addColorStop(1, 'rgba(201,160,232,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - 5, y - 11, 16, 14);
  ctx.fillStyle = '#7a7466';
  ctx.fillRect(x + 1, y - 3, 2, 3); // stems
  ctx.fillRect(x + 5, y - 2, 1, 2);
  ctx.fillStyle = '#8a5fae';
  ctx.fillRect(x, y - 5, 4, 2); // caps
  ctx.fillRect(x + 1, y - 6, 2, 1);
  ctx.fillRect(x + 4, y - 4, 3, 2);
  ctx.fillStyle = '#c9a0e8'; // the lit crowns
  ctx.fillRect(x + 1, y - 5, 1, 1);
  ctx.fillRect(x + 5, y - 4, 1, 1);
}

/** Fog banks sliding slowly through the treeline; each wrap re-rolls the
 *  bank's shape and height so the murk never repeats itself. */
function drawFog(ctx: CanvasRenderingContext2D, w: number, floorY: number, t: number) {
  const span = w + 50;
  const tracks = [
    { speed: 1.6, salt: 5 },
    { speed: 1.0, salt: 17 },
  ];
  for (const tr of tracks) {
    const dist = t * tr.speed + tr.salt * 43;
    const wrap = Math.floor(dist / span);
    const x = w + 25 - Math.round(dist % span);
    const shape = FOG_SHAPES[Math.floor(hash(wrap * 7 + tr.salt) * FOG_SHAPES.length)];
    const y = floorY - 9 + Math.floor(hash(wrap * 13 + tr.salt) * 7);
    for (const [dx, dy, fw, fh] of shape) ctx.fillRect(x + dx, y + dy, fw, fh);
  }
}
