import type { FightState, Kind, Piece, UpgradeId, Vec } from './types';

const ORTHO: Vec[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];
const DIAG: Vec[] = [
  { x: 1, y: 1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: -1, y: -1 },
];
const ALL8: Vec[] = [...ORTHO, ...DIAG];
const LEAP: Vec[] = [
  { x: 1, y: 2 },
  { x: 2, y: 1 },
  { x: -1, y: 2 },
  { x: -2, y: 1 },
  { x: 1, y: -2 },
  { x: 2, y: -1 },
  { x: -1, y: -2 },
  { x: -2, y: -1 },
];
/** Long Legs: the stretched L (three and one). */
const LONG_LEAP: Vec[] = [
  { x: 1, y: 3 },
  { x: 3, y: 1 },
  { x: -1, y: 3 },
  { x: -3, y: 1 },
  { x: 1, y: -3 },
  { x: 3, y: -1 },
  { x: -1, y: -3 },
  { x: -3, y: -1 },
];

/** Chess piece values in disguise — the exchange math the dials (and the pin) reason with. */
export const PIECE_VALUE: Record<Kind, number> = {
  keeper: 1000,
  sprout: 10,
  hopper: 30,
  slink: 30,
  rumble: 50,
  duchess: 90,
  thistle: 10,
  tumbleweed: 30,
  creeper: 30,
  golem: 50,
  gloom: 90,
  heart: 0, // can't be captured; it plays by the king rule instead
};

interface Mover {
  steps?: Vec[];
  slides?: Vec[];
  pawn?: boolean;
}

const MOVERS: Record<Kind, Mover> = {
  keeper: { steps: ALL8 },
  sprout: { pawn: true },
  hopper: { steps: LEAP },
  slink: { slides: DIAG },
  rumble: { slides: ORTHO },
  duchess: { slides: ALL8 },
  thistle: { pawn: true },
  tumbleweed: { steps: LEAP },
  creeper: { slides: DIAG },
  golem: { slides: ORTHO },
  gloom: { slides: ALL8 },
  heart: { steps: ALL8 },
};

function hasUpgrade(p: Piece, u: UpgradeId): boolean {
  return p.upgrades?.includes(u) ?? false;
}

/**
 * Whether p may land on (capture) occ. The Bramble Heart can never be landed
 * on — it is beaten by cornering, not capture.
 */
function canLand(p: Piece, occ: Piece): boolean {
  return occ.side !== p.side && occ.kind !== 'heart';
}

export function inBounds(s: FightState, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < s.w && y < s.h;
}

export function pieceAt(s: FightState, x: number, y: number): Piece | undefined {
  return s.pieces.find((p) => p.x === x && p.y === y);
}

/** Sprout/thistle: forward-only movers, diagonal-only capturers. */
export function isPawn(kind: Kind): boolean {
  return MOVERS[kind].pawn === true;
}

/** Sliders (slink/rumble/duchess/creeper/golem/gloom): threaten a whole ray. */
export function isSlider(kind: Kind): boolean {
  return MOVERS[kind].slides !== undefined;
}

/** Friends walk up the board (-y), the bramble creeps down (+y). */
function forward(p: Piece): number {
  return p.side === 'friend' ? -1 : 1;
}

/**
 * Legal destinations: empty squares, or squares holding the other side — and,
 * with the Acorn Whistle, a friend beside the Keeper (they trade places).
 * A bramble creature that's frozen by a fork or held by a pin has no moves at
 * all: it can't plan, can't flee, can't shield the Heart.
 */
export function movesFor(s: FightState, p: Piece): Vec[] {
  if (p.side === 'bramble' && (p.stunned || isPinned(s, p))) return [];
  const out = squaresFor(s, p, false);
  if (p.kind === 'keeper' && p.side === 'friend' && s.swapLeft > 0 && !s.freeMoveActive) {
    for (const d of ALL8) {
      const occ = pieceAt(s, p.x + d.x, p.y + d.y);
      // a Sprout swapped onto the far edge would arrive without blossoming — so it can't
      if (occ && occ.side === 'friend' && !(occ.kind === 'sprout' && p.y === 0)) out.push({ x: occ.x, y: occ.y });
    }
  }
  // Second Breakfast's extra move is a stretch, not a snatch — no captures
  if (s.freeMoveActive && p.side === 'friend') return out.filter((v) => !pieceAt(s, v.x, v.y));
  return out;
}

/**
 * Attacked squares — includes squares holding pieces of EITHER side (a friend
 * standing on one is defended). Pawns threaten only their forward diagonals.
 */
export function threatsFor(s: FightState, p: Piece): Vec[] {
  return squaresFor(s, p, true);
}

/**
 * The Thorn Pin, the real thing by another name: a bramble creature is held
 * fast when it's the first piece on a friend slider's ray and the next piece
 * behind it on that same ray is bramble worth more than it (the Heart counts
 * as beyond price). Moving would expose the dearer one, so it doesn't.
 */
export function isPinned(s: FightState, e: Piece): boolean {
  if (!s.pin || e.side !== 'bramble' || e.kind === 'heart') return false;
  for (const f of s.pieces) {
    if (f.side !== 'friend') continue;
    const dirs = MOVERS[f.kind].slides;
    if (!dirs) continue;
    for (const d of dirs) {
      const first = firstAlong(s, f, d);
      if (!first || first.id !== e.id) continue;
      const behind = firstAlong(s, e, d);
      if (behind && behind.side === 'bramble' && (behind.kind === 'heart' || PIECE_VALUE[behind.kind] > PIECE_VALUE[e.kind]))
        return true;
    }
  }
  return false;
}

/** The first piece on the ray from p in direction d, if any. */
function firstAlong(s: FightState, p: Piece, d: Vec): Piece | undefined {
  let x = p.x + d.x;
  let y = p.y + d.y;
  while (inBounds(s, x, y)) {
    const occ = pieceAt(s, x, y);
    if (occ) return occ;
    x += d.x;
    y += d.y;
  }
  return undefined;
}

function squaresFor(s: FightState, p: Piece, threats: boolean): Vec[] {
  const m = MOVERS[p.kind];
  const out: Vec[] = [];

  if (m.pawn) {
    const dy = forward(p);
    if (!threats) {
      const fx = p.x;
      const fy = p.y + dy;
      if (inBounds(s, fx, fy) && !pieceAt(s, fx, fy)) {
        out.push({ x: fx, y: fy });
        // Long Stride: from its home row a Sprout may take two steps at once
        // (the real rule, taught by bending nothing). Never a capture.
        if (hasUpgrade(p, 'longstride') && p.y === s.h - 2 && inBounds(s, fx, fy + dy) && !pieceAt(s, fx, fy + dy))
          out.push({ x: fx, y: fy + dy });
      }
    }
    for (const dx of [-1, 1]) {
      const x = p.x + dx;
      const y = p.y + dy;
      if (!inBounds(s, x, y)) continue;
      if (threats) {
        out.push({ x, y });
      } else {
        const occ = pieceAt(s, x, y);
        if (occ && canLand(p, occ)) out.push({ x, y });
      }
    }
    // Rootgrip: one plain step straight back, never a capture (a shy retreat).
    if (!threats && hasUpgrade(p, 'rootgrip')) {
      const bx = p.x;
      const by = p.y - dy;
      if (inBounds(s, bx, by) && !pieceAt(s, bx, by)) out.push({ x: bx, y: by });
    }
    return dedup(out);
  }

  const step = (d: Vec) => {
    const x = p.x + d.x;
    const y = p.y + d.y;
    if (!inBounds(s, x, y)) return;
    const occ = pieceAt(s, x, y);
    if (threats || !occ || canLand(p, occ)) out.push({ x, y });
  };
  if (m.steps) {
    for (const d of m.steps) step(d);
    // Long Legs: the Hopper's leap, stretched — a second, wider L
    if (p.kind === 'hopper' && hasUpgrade(p, 'longlegs')) for (const d of LONG_LEAP) step(d);
  }

  if (m.slides) {
    // Underbrush: a Slink's diagonal glide slips over the first friendly plant
    // in the lane and keeps going. Only the one — a second body still stops it.
    const canHop = p.kind === 'slink' && hasUpgrade(p, 'underbrush');
    // Cornering: a Rumble may turn one corner mid-charge — every empty square
    // it passes is a place it could swing ninety degrees and keep barrelling.
    const corners = p.kind === 'rumble' && hasUpgrade(p, 'cornering');
    for (const d of m.slides) {
      let hopped = false;
      let x = p.x + d.x;
      let y = p.y + d.y;
      while (inBounds(s, x, y)) {
        const occ = pieceAt(s, x, y);
        if (occ) {
          if (occ.side === p.side && canHop && !hopped) {
            if (threats) out.push({ x, y }); // still covers the friend it leaps
            hopped = true;
            x += d.x;
            y += d.y;
            continue;
          }
          if (threats || canLand(p, occ)) out.push({ x, y });
          break;
        }
        out.push({ x, y });
        if (corners) {
          for (const t of [{ x: d.y, y: d.x }, { x: -d.y, y: -d.x }]) slideFrom(s, p, x, y, t, threats, out);
        }
        x += d.x;
        y += d.y;
      }
    }
  }

  // Sidestep: a Slink may also take one plain square straight — the only way
  // it ever changes which colour it walks. A real step: it can catch.
  if (p.kind === 'slink' && hasUpgrade(p, 'sidestep')) for (const d of ORTHO) step(d);

  return dedup(out);
}

/** Slide from (x, y) in direction d until something's in the way. */
function slideFrom(s: FightState, p: Piece, x: number, y: number, d: Vec, threats: boolean, out: Vec[]) {
  x += d.x;
  y += d.y;
  while (inBounds(s, x, y)) {
    const occ = pieceAt(s, x, y);
    if (occ) {
      if (threats || canLand(p, occ)) out.push({ x, y });
      return;
    }
    out.push({ x, y });
    x += d.x;
    y += d.y;
  }
}

/** Upgrade steps can coincide with a piece's own moves; collapse repeats. */
function dedup(vs: Vec[]): Vec[] {
  const seen = new Set<number>();
  return vs.filter((v) => {
    const k = v.y * 64 + v.x;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
