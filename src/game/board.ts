import type { FightState, Kind, Piece, Vec } from './types';

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
};

export function inBounds(s: FightState, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < s.w && y < s.h;
}

export function pieceAt(s: FightState, x: number, y: number): Piece | undefined {
  return s.pieces.find((p) => p.x === x && p.y === y);
}

/** Friends walk up the board (-y), the bramble creeps down (+y). */
function forward(p: Piece): number {
  return p.side === 'friend' ? -1 : 1;
}

/** Legal destinations: empty squares, or squares holding the other side. */
export function movesFor(s: FightState, p: Piece): Vec[] {
  return squaresFor(s, p, false);
}

/**
 * Attacked squares — includes squares holding pieces of EITHER side (a friend
 * standing on one is defended). Pawns threaten only their forward diagonals.
 */
export function threatsFor(s: FightState, p: Piece): Vec[] {
  return squaresFor(s, p, true);
}

function squaresFor(s: FightState, p: Piece, threats: boolean): Vec[] {
  const m = MOVERS[p.kind];
  const out: Vec[] = [];

  if (m.pawn) {
    const dy = forward(p);
    if (!threats) {
      const fx = p.x;
      const fy = p.y + dy;
      if (inBounds(s, fx, fy) && !pieceAt(s, fx, fy)) out.push({ x: fx, y: fy });
    }
    for (const dx of [-1, 1]) {
      const x = p.x + dx;
      const y = p.y + dy;
      if (!inBounds(s, x, y)) continue;
      if (threats) {
        out.push({ x, y });
      } else {
        const occ = pieceAt(s, x, y);
        if (occ && occ.side !== p.side) out.push({ x, y });
      }
    }
    return out;
  }

  if (m.steps) {
    for (const d of m.steps) {
      const x = p.x + d.x;
      const y = p.y + d.y;
      if (!inBounds(s, x, y)) continue;
      const occ = pieceAt(s, x, y);
      if (threats || !occ || occ.side !== p.side) out.push({ x, y });
    }
  }

  if (m.slides) {
    for (const d of m.slides) {
      let x = p.x + d.x;
      let y = p.y + d.y;
      while (inBounds(s, x, y)) {
        const occ = pieceAt(s, x, y);
        if (occ) {
          if (threats || occ.side !== p.side) out.push({ x, y });
          break;
        }
        out.push({ x, y });
        x += d.x;
        y += d.y;
      }
    }
  }

  return out;
}
