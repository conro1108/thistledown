/**
 * The overgrown wilds behind the board. Each region paints in its own palette
 * (see themes.ts): a golden meadow, a purple bog, the lightless Worldroot —
 * same silhouette geometry, different world. The board is always the one lit
 * clearing in it, so the fight reads bright against whatever surrounds it.
 *
 * Drawn to a low-res buffer that shares the board's pixel density — main.ts
 * sizes the buffer so one backdrop pixel is exactly one board pixel on
 * screen (integer scaling only, as always).
 *
 * Render-only and deterministic: motion comes from the clock, variety from
 * integer hashes. Nothing here touches game state or the seeded RNG.
 */

import type { RegionTheme, SkyStop } from './themes';

// Round pixel discs as half-widths per 1px row — the moon/sun body.
const ORB_ROWS: [number, number][] = [
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

/** The sky's colour at row `y` of `h`, interpolated between the theme's stops. */
function skyRow(stops: SkyStop[], y: number, h: number): string {
  const p = h > 1 ? y / (h - 1) : 0;
  let i = 1;
  while (i < stops.length - 1 && p > stops[i][0]) i++;
  const [p0, c0] = stops[i - 1];
  const [p1, c1] = stops[i];
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
  theme: RegionTheme,
  /** First buffer row not hidden behind the header. The sky ramp still fills
   * from 0 (the header is translucent), but the orb and stars hang below this
   * or they get sliced in half by the chrome. */
  skyTop = 0,
) {
  const t = timeMs / 1000;
  const sky = theme.sky;

  // --- sky ---------------------------------------------------------------
  for (let y = 0; y < floorY; y++) {
    ctx.fillStyle = skyRow(sky, y, floorY);
    ctx.fillRect(0, y, w, 1);
  }

  // cold stars, twinkling out of phase — only where the sky is dark enough
  if (theme.crescent) {
    ctx.fillStyle = '#c6cbe4';
    for (let i = 0; i < Math.ceil(w / 22); i++) {
      const sx = (i * 41 + 9) % w;
      const sy = skyTop + 3 + Math.floor(hash(i * 7 + 3) * Math.max(4, (floorY - skyTop) * 0.45));
      if (Math.sin(t * 1.6 + sx) > -0.2) ctx.fillRect(sx, sy, 1, 1);
    }
  }

  // the lone light, top-right. A crescent moon (dusk regions) is carved before
  // the halo goes on: the carve repaints the disc in the sky's own colour, so
  // it has to match the unlit sky exactly. A full sun (bright regions) skips
  // the carve.
  const mx = w - 15;
  const my = skyTop + 11;
  ctx.fillStyle = theme.orb;
  for (const [dy, hw] of ORB_ROWS) ctx.fillRect(mx - hw, my + dy, hw * 2 + 1, 1);
  if (theme.crescent) {
    for (const [dy, hw] of ORB_ROWS) {
      ctx.fillStyle = skyRow(sky, my + dy, floorY);
      ctx.fillRect(mx + 3 - hw, my + dy, hw * 2 + 1, 1);
    }
  }
  const halo = ctx.createRadialGradient(mx, my, 2, mx, my, 14);
  halo.addColorStop(0, `rgba(${theme.orbHalo},0.24)`);
  halo.addColorStop(1, `rgba(${theme.orbHalo},0)`);
  ctx.fillStyle = halo;
  ctx.fillRect(mx - 14, my - 14, 28, 28);

  // --- far treeline: a jagged wall of pines ------------------------------
  ctx.fillStyle = theme.treeFar;
  for (let i = 0; i * 10 < w + 12; i++) {
    const px = i * 10 - 4;
    const ph = 11 + Math.floor(hash(i * 5 + 2) * 8);
    pine(ctx, px, floorY, ph, 9);
  }
  ctx.fillRect(0, floorY - 4, w, 4); // solid base so valleys don't show seams

  // fog banks drifting through the trees, half-transparent
  ctx.globalAlpha = theme.fogAlpha;
  ctx.fillStyle = theme.fog;
  drawFog(ctx, w, floorY, t);
  ctx.globalAlpha = 1;

  // --- near silhouettes, nearly black -----------------------------------
  ctx.fillStyle = theme.treeNear;
  pine(ctx, 6, floorY + 2, 22, 13); // one looming pine off the left shoulder
  pine(ctx, w - 8, floorY + 1, 17, 11);
  drawDeadTree(ctx, 17, floorY + 3); // a snag leaning out of the left cluster

  // --- floor --------------------------------------------------------------
  ctx.fillStyle = theme.ground;
  ctx.fillRect(0, floorY, w, h - floorY);

  const grassH = h - floorY;
  ctx.fillStyle = theme.groundMottle;
  for (let i = 0; i < Math.ceil(w / 5); i++) {
    const gx = (i * 29 + 7) % w;
    const gy = floorY + 2 + ((i * 17) % Math.max(1, grassH - 4));
    ctx.fillRect(gx, gy, 2 + (i % 2), 1);
  }
  ctx.fillStyle = theme.tuft;
  for (let i = 0; i < Math.ceil(w / 9); i++) {
    const gx = (i * 37 + 12) % w;
    const gy = floorY + 4 + ((i * 13) % Math.max(1, grassH - 7));
    ctx.fillRect(gx, gy, 1, 2);
    ctx.fillRect(gx + 1, gy - 1, 1, 2);
  }

  // water pooling in the bottom-right, the light shivering on it
  drawPool(ctx, w - 16, h - 5, t, theme);
  // …and a smaller, stiller one at the left edge
  drawPool(ctx, 4, floorY + Math.max(8, Math.floor(grassH * 0.35)), t + 40, theme, true);

  // glowing flora, huddled bottom-left — only in the dusky/dark regions
  if (theme.glowFlora) drawShrooms(ctx, 6, h - 4, t, theme.glowFlora);

  // drifting motes: the region's signature little lights
  drawMotes(ctx, w, h, floorY, t, theme);
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

/** A pool: still water with a shivering light-glint. `small` trims it down. */
function drawPool(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  t: number,
  theme: RegionTheme,
  small = false,
) {
  const rows: [number, number][] = small
    ? [[-1, 4], [0, 6], [1, 4]]
    : [[-2, 5], [-1, 9], [0, 11], [1, 9], [2, 5]];
  ctx.fillStyle = theme.water;
  for (const [dy, hw] of rows) ctx.fillRect(cx - hw, cy + dy, hw * 2 + 1, 1);
  // the glint drifts back and forth like a slow ripple
  const gx = cx - 2 + Math.round(Math.sin(t * 0.7) * (small ? 1 : 3));
  ctx.fillStyle = theme.waterGlint;
  ctx.fillRect(gx, cy, small ? 2 : 4, 1);
  if (!small) ctx.fillRect(gx + 5, cy - 1, 2, 1);
  // reeds at the water's edge
  ctx.fillStyle = theme.reed;
  const rx = cx - (small ? 5 : 10);
  ctx.fillRect(rx, cy - 6, 1, 6);
  ctx.fillRect(rx + 2, cy - 5, 1, 5);
  ctx.fillStyle = theme.cattail; // cattail heads
  ctx.fillRect(rx, cy - 8, 1, 2);
  ctx.fillRect(rx + 2, cy - 7, 1, 2);
}

/** A huddle of faintly glowing flora. They breathe: the glow swells and dims
 *  on a slow cycle. Tinted to the region's accent. */
function drawShrooms(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, glow: string) {
  const breathe = 0.22 + 0.1 * Math.sin(t * 1.3);
  const [r, g, b] = hexRgb(glow);
  const grad = ctx.createRadialGradient(x + 3, y - 3, 1, x + 3, y - 3, 8);
  grad.addColorStop(0, `rgba(${r},${g},${b},${breathe})`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(x - 5, y - 11, 16, 14);
  ctx.fillStyle = '#7a7466';
  ctx.fillRect(x + 1, y - 3, 2, 3); // stems
  ctx.fillRect(x + 5, y - 2, 1, 2);
  ctx.fillStyle = shade(glow, 0.62);
  ctx.fillRect(x, y - 5, 4, 2); // caps
  ctx.fillRect(x + 1, y - 6, 2, 1);
  ctx.fillRect(x + 4, y - 4, 3, 2);
  ctx.fillStyle = glow; // the lit crowns
  ctx.fillRect(x + 1, y - 5, 1, 1);
  ctx.fillRect(x + 5, y - 4, 1, 1);
}

/**
 * The region's drifting lights. All share one wandering base but read very
 * differently: fireflies bob warm and low, wisps roam mid-air, spores sink,
 * ash rises, frost twinkles cold and slow. One pixel each, blinking out of
 * phase so the marsh never looks like a fixed constellation.
 */
function drawMotes(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  floorY: number,
  t: number,
  theme: RegionTheme,
) {
  ctx.fillStyle = theme.mote;
  const style = theme.moteStyle;
  const count = style === 'spore' || style === 'firefly' ? 7 : 5;
  for (let i = 0; i < count; i++) {
    const bx = (i * 67 + 21) % Math.max(1, w - 8);
    const speed = style === 'frost' ? 0.22 : style === 'wisp' ? 0.4 : 0.55;
    const wx = bx + Math.sin(t * speed + i * 2.2) * (style === 'firefly' ? 4 : 6);
    // vertical drift: spores sink, ash rises, the rest hover around a band
    const cycle = style === 'spore' ? -t * 3 : style === 'ash' ? t * 3 : 0;
    const band =
      style === 'firefly'
        ? floorY + 2 + hash(i * 9 + 4) * (h - floorY - 4)
        : floorY - 3 + hash(i * 9 + 4) * 10;
    const drift = ((band + cycle) % Math.max(1, h - 2) + h) % Math.max(1, h - 2);
    const wob = Math.sin(t * (style === 'frost' ? 0.5 : 0.9) + i * 1.7) * 3;
    const blink = Math.sin(t * (style === 'firefly' ? 2.6 : 2.1) + i * 2.6);
    if (blink > (style === 'firefly' ? -0.1 : -0.35)) {
      ctx.fillRect(Math.round(wx), Math.round(drift + wob), 1, 1);
    }
  }
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

/** #rrggbb → [r,g,b]. */
function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Darken a hex colour toward black by factor k (0..1 keeps k of it). */
function shade(hex: string, k: number): string {
  const [r, g, b] = hexRgb(hex);
  return `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})`;
}
