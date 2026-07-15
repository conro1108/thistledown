import { movesFor, pieceAt, threatsFor } from '../game/board';
import type { FightState, Telegraph, Vec } from '../game/types';
import { drawSprite } from './sprites';

export const TILE = 16;

export interface FX {
  at: Vec;
  kind: 'poof' | 'shaken' | 'bonk';
  t: number; // frames elapsed
}

/** id -> fractional board-cell position, for the enemy-move tween. */
export type PosOverrides = Map<number, Vec>;

export interface View {
  selected: number | null;
  hover: Vec | null;
  fx: FX[];
  /** while set, drawn instead of s.pieces' real positions (mid-tween) */
  posOverrides?: PosOverrides;
  /** while set, drawn instead of s.telegraphs (the round that's resolving) */
  telegraphOverride?: Telegraph[];
}

const GRASS_A = '#8fbf6a';
const GRASS_B = '#83b45f';
const FLOWER = ['#f2f0e4', '#f0b0c0', '#ffd966'];

function hash(x: number, y: number, salt: number): number {
  let h = (x * 374761393 + y * 668265263 + salt * 987643211) >>> 0;
  h = (h ^ (h >> 13)) >>> 0;
  return (Math.imul(h, 1274126177) >>> 0) % 1000;
}

export function draw(ctx: CanvasRenderingContext2D, s: FightState, v: View, time: number) {
  const salt = s.name.length + s.w;

  // ground
  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? GRASS_A : GRASS_B;
      ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      const r = hash(x, y, salt);
      if (r < 90) {
        ctx.fillStyle = FLOWER[r % FLOWER.length];
        const fx = x * TILE + 3 + (r % 9);
        const fy = y * TILE + 3 + ((r >> 3) % 9);
        ctx.fillRect(fx, fy, 1, 1);
        ctx.fillRect(fx - 1, fy + 1, 1, 1);
      }
    }
  }

  // enemy telegraphs: arrow + marked target square
  const telegraphs = v.telegraphOverride ?? s.telegraphs;
  for (const t of telegraphs) {
    const e = s.pieces.find((p) => p.id === t.pieceId);
    if (!e) continue;
    if (!t.to) {
      // nowhere to go — snoozing, not broken
      sleepGlyph(ctx, e.x, e.y);
      continue;
    }
    const targetsFriend = pieceAt(s, t.to.x, t.to.y)?.side === 'friend';
    const col = targetsFriend ? '#e05252' : '#7a5fae';
    const from = v.posOverrides?.get(e.id) ?? e;
    arrow(ctx, from, t.to, col);
    corners(ctx, t.to.x, t.to.y, col);
  }

  // selected friend: its legal moves
  if (v.selected != null) {
    const p = s.pieces.find((q) => q.id === v.selected);
    if (p) {
      for (const m of movesFor(s, p)) {
        ctx.fillStyle = 'rgba(255, 217, 102, 0.35)';
        ctx.fillRect(m.x * TILE + 1, m.y * TILE + 1, TILE - 2, TILE - 2);
        ctx.fillStyle = '#ffd966';
        ctx.fillRect(m.x * TILE + 7, m.y * TILE + 7, 2, 2);
      }
      corners(ctx, p.x, p.y, '#ffd966');
    }
  }

  // hover: show what the hovered creature can reach
  if (v.hover) {
    const p = pieceAt(s, v.hover.x, v.hover.y);
    if (p) {
      const col = p.side === 'bramble' ? 'rgba(224, 82, 82, 0.30)' : 'rgba(120, 170, 255, 0.30)';
      for (const t of threatsFor(s, p)) {
        ctx.fillStyle = col;
        ctx.fillRect(t.x * TILE + 1, t.y * TILE + 1, TILE - 2, TILE - 2);
      }
    }
  }

  // pieces, with a 1px integer idle bob (never fractional — pixel grid is sacred)
  for (const p of s.pieces) {
    const pos = v.posOverrides?.get(p.id) ?? p;
    const px = Math.round(pos.x * TILE);
    const py = Math.round(pos.y * TILE);
    // team plate under the feet: warm for friends, dusky for the bramble
    ctx.fillStyle = p.side === 'friend' ? '#f2e2a0' : '#55437a';
    ctx.fillRect(px + 2, py + 14, 12, 1);
    ctx.fillRect(px + 3, py + 15, 10, 1);
    const bob = (Math.floor(time / 450) + p.id) % 2 === 0 ? 0 : -1;
    drawSprite(ctx, p.kind, px + 2, py + 2 + bob);
  }

  // capture / shaken / blocked effects
  for (const f of v.fx) {
    const cx = f.at.x * TILE + 8;
    const cy = f.at.y * TILE + 8;
    const r = 1 + Math.floor(f.t / 4);
    const cols =
      f.kind === 'poof'
        ? ['#f0b0c0', '#f2f0e4', '#ffd966']
        : f.kind === 'bonk'
          ? ['#ffd966', '#f2f0e4']
          : ['#b8c4d8', '#8a94a8'];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const px = cx + Math.round(Math.cos(a) * r);
      const py = cy + Math.round(Math.sin(a) * r);
      ctx.fillStyle = cols[(i + f.t) % cols.length];
      ctx.fillRect(px, py, 1, 1);
    }
  }
}

function corners(ctx: CanvasRenderingContext2D, x: number, y: number, col: string) {
  const px = x * TILE;
  const py = y * TILE;
  ctx.fillStyle = col;
  for (const [cx, cy, dx, dy] of [
    [px, py, 1, 1],
    [px + TILE - 1, py, -1, 1],
    [px, py + TILE - 1, 1, -1],
    [px + TILE - 1, py + TILE - 1, -1, -1],
  ] as const) {
    ctx.fillRect(cx, cy, 1, 1);
    ctx.fillRect(cx + dx, cy, 1, 1);
    ctx.fillRect(cx, cy + dy, 1, 1);
  }
}

/** Chunky pixel arrow from one cell's center toward another's. */
function arrow(ctx: CanvasRenderingContext2D, from: Vec, to: Vec, col: string) {
  const ax = from.x * TILE + 8;
  const ay = from.y * TILE + 8;
  const bx = to.x * TILE + 8;
  const by = to.y * TILE + 8;
  const dist = Math.hypot(bx - ax, by - ay);
  if (dist < 1) return;
  const ux = (bx - ax) / dist;
  const uy = (by - ay) / dist;
  // stop the tip short of the target's center so the head isn't hidden
  // under whatever is standing there
  const tipD = dist - 6;
  ctx.fillStyle = col;
  for (let d = 6; d < tipD - 4; d += 4) {
    ctx.fillRect(Math.round(ax + ux * d) - 1, Math.round(ay + uy * d) - 1, 2, 2);
  }
  const phx = -uy;
  const phy = ux;
  for (let i = 0; i < 4; i++) {
    const cx = ax + ux * (tipD - i * 1.3);
    const cy = ay + uy * (tipD - i * 1.3);
    const half = i * 0.9;
    for (let j = -2; j <= 2; j++) {
      const off = (half * j) / 2;
      ctx.fillRect(Math.round(cx + phx * off), Math.round(cy + phy * off), 1, 1);
    }
  }
}

/** Tiny "z" over an enemy that has no legal move this round. */
function sleepGlyph(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const px = x * TILE + 11;
  const py = y * TILE + 1;
  ctx.fillStyle = '#efe9f7';
  ctx.fillRect(px, py, 3, 1);
  ctx.fillRect(px + 1, py + 1, 1, 1);
  ctx.fillRect(px, py + 2, 3, 1);
}
