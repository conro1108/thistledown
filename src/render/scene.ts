import { isPawn, movesFor, pieceAt, threatsFor } from '../game/board';
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

const GRASS_A = '#87aa56';
const GRASS_B = '#7b9e4b';

export function draw(ctx: CanvasRenderingContext2D, s: FightState, v: View, time: number) {
  // ground — plain grass for now; decorate later
  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? GRASS_A : GRASS_B;
      ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
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
    // red only for a real attack: a friend on the target square that this
    // enemy actually threatens. A friend merely blocking a pawn's forward
    // step stays purple — that arrow is going to bonk, not bite.
    const occ = pieceAt(s, t.to.x, t.to.y);
    const targetsFriend =
      occ?.side === 'friend' && threatsFor(s, e).some((q) => q.x === t.to!.x && q.y === t.to!.y);
    const col = targetsFriend ? '#e05252' : '#7a5fae';
    const from = v.posOverrides?.get(e.id) ?? e;
    arrow(ctx, from, t.to, col);
    corners(ctx, t.to.x, t.to.y, col);
  }

  // the spread clock's warning: a thistle will sprout here next turn
  if (s.pendingSprout) {
    const p = s.pendingSprout;
    corners(ctx, p.x, p.y, '#8fc460');
    // a tiny wiggling shoot, breaking soil on the pixel grid
    const wob = Math.floor(time / 300) % 2;
    ctx.fillStyle = '#8fc460';
    ctx.fillRect(p.x * TILE + 7, p.y * TILE + 9, 2, 4);
    ctx.fillRect(p.x * TILE + 5 + wob, p.y * TILE + 7, 2, 2);
    ctx.fillRect(p.x * TILE + 9 - wob, p.y * TILE + 8, 2, 2);
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

  // hover: everywhere the tapped creature could reach — deliberately styled
  // apart from the committed-attack marker (soft wash + center dot, no
  // corners/arrow) so "could pounce here" never reads as "will move here".
  // Pawns' empty diagonals aren't shown — an empty square nothing can be
  // taken from reads as noise, not information.
  if (v.hover) {
    const p = pieceAt(s, v.hover.x, v.hover.y);
    if (p) {
      const bramble = p.side === 'bramble';
      const wash = bramble ? 'rgba(224, 122, 82, 0.22)' : 'rgba(120, 170, 255, 0.22)';
      const dot = bramble ? '#e07a52' : '#78aaff';
      for (const t of threatsFor(s, p)) {
        if (isPawn(p.kind) && t.x !== p.x && !pieceAt(s, t.x, t.y)) continue;
        ctx.fillStyle = wash;
        ctx.fillRect(t.x * TILE + 1, t.y * TILE + 1, TILE - 2, TILE - 2);
        ctx.fillStyle = dot;
        ctx.fillRect(t.x * TILE + 7, t.y * TILE + 7, 2, 2);
      }
    }
  }

  // pieces, with a 1px integer idle bob (never fractional — pixel grid is sacred)
  for (const p of s.pieces) {
    const pos = v.posOverrides?.get(p.id) ?? p;
    const px = Math.round(pos.x * TILE);
    const py = Math.round(pos.y * TILE);
    // no ground marker — the sprites themselves carry the team read
    // (warm critters vs. dusky plants), and anything painted under the feet
    // ends up looking like a plinth
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

/**
 * Chunky dotted telegraph path. Leapers get their true L — the long leg,
 * then the turn — so the shape of the hop is the thing players memorize.
 * Every leg is axis-aligned or a perfect diagonal, so the dots and the
 * arrowhead always sit crisply on the pixel grid.
 */
function arrow(ctx: CanvasRenderingContext2D, from: Vec, to: Vec, col: string) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const cells: Vec[] =
    dx !== 0 && dy !== 0 && Math.abs(dx) !== Math.abs(dy)
      ? Math.abs(dx) > Math.abs(dy)
        ? [from, { x: to.x, y: from.y }, to]
        : [from, { x: from.x, y: to.y }, to]
      : [from, to];
  const pts = cells.map((c) => ({ x: c.x * TILE + 8, y: c.y * TILE + 8 }));
  ctx.fillStyle = col;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    if (dist < 1) continue;
    const ux = (b.x - a.x) / dist;
    const uy = (b.y - a.y) / dist;
    const last = i === pts.length - 2;
    const start = i === 0 ? 6 : 3; // clear the mover's own sprite first
    const end = last ? dist - 7 : dist - 2; // leave room for the head / elbow
    for (let d = start; d <= end; d += 4) {
      ctx.fillRect(Math.round(a.x + ux * d) - 1, Math.round(a.y + uy * d) - 1, 2, 2);
    }
    if (!last) ctx.fillRect(Math.round(b.x) - 1, Math.round(b.y) - 1, 2, 2); // the elbow
    else arrowHead(ctx, b, Math.sign(Math.round(b.x - a.x)), Math.sign(Math.round(b.y - a.y)));
  }
}

/** Crisp pixel arrowhead pointing along an axis or diagonal (sx,sy ∈ -1..1). */
function arrowHead(ctx: CanvasRenderingContext2D, at: Vec, sx: number, sy: number) {
  const tx = at.x - sx * 4;
  const ty = at.y - sy * 4;
  const px = -sy;
  const py = sx;
  for (let i = 0; i < 4; i++) {
    const w = Math.min(i, 2);
    for (let j = -w; j <= w; j++) {
      ctx.fillRect(tx - sx * i + px * j, ty - sy * i + py * j, 1, 1);
    }
  }
}

/** A "zZ" over an enemy that is holding still this round. */
function sleepGlyph(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const px = x * TILE + 9;
  const py = y * TILE + 1;
  const z = (ox: number, oy: number, w: number) => {
    ctx.fillRect(ox, oy, w, 1);
    for (let i = 0; i < w - 2; i++) ctx.fillRect(ox + w - 2 - i, oy + 1 + i, 1, 1);
    ctx.fillRect(ox, oy + w - 1, w, 1);
  };
  ctx.fillStyle = '#241533'; // shadow so it reads on bright grass
  z(px + 1, py + 2, 4);
  z(px + 5, py, 3);
  ctx.fillStyle = '#efe9f7';
  z(px, py + 1, 4);
  z(px + 4, py - 1, 3);
}
