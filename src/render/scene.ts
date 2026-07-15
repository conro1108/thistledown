import { movesFor, pieceAt, threatsFor } from '../game/board';
import type { FightState, Vec } from '../game/types';
import { drawSprite } from './sprites';

export const TILE = 16;

export interface FX {
  at: Vec;
  kind: 'poof' | 'shaken';
  t: number; // frames elapsed
}

export interface View {
  selected: number | null;
  hover: Vec | null;
  fx: FX[];
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

  // enemy telegraphs: dotted path + marked target square
  for (const t of s.telegraphs) {
    const e = s.pieces.find((p) => p.id === t.pieceId);
    if (!e || !t.to) continue;
    const targetsFriend = pieceAt(s, t.to.x, t.to.y)?.side === 'friend';
    const col = targetsFriend ? '#e05252' : '#7a5fae';
    dottedPath(ctx, e, t.to, col);
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
    const bob = (Math.floor(time / 450) + p.id) % 2 === 0 ? 0 : -1;
    drawSprite(ctx, p.kind, p.x * TILE + 2, p.y * TILE + 2 + bob);
  }

  // capture / shaken effects
  for (const f of v.fx) {
    const cx = f.at.x * TILE + 8;
    const cy = f.at.y * TILE + 8;
    const r = 1 + Math.floor(f.t / 4);
    const cols = f.kind === 'poof' ? ['#f0b0c0', '#f2f0e4', '#ffd966'] : ['#b8c4d8', '#8a94a8'];
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

function dottedPath(ctx: CanvasRenderingContext2D, from: Vec, to: Vec, col: string) {
  const ax = from.x * TILE + 8;
  const ay = from.y * TILE + 8;
  const bx = to.x * TILE + 8;
  const by = to.y * TILE + 8;
  const dist = Math.hypot(bx - ax, by - ay);
  const n = Math.max(2, Math.floor(dist / 4));
  ctx.fillStyle = col;
  for (let i = 1; i < n; i++) {
    if (i % 2 === 0) continue;
    const px = Math.round(ax + ((bx - ax) * i) / n);
    const py = Math.round(ay + ((by - ay) * i) / n);
    ctx.fillRect(px, py, 1, 1);
  }
}
