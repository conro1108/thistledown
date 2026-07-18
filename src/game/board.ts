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
 * Extra *step* directions a piece's upgrades graft on — full moves that can
 * capture and that genuinely threaten (unlike a pawn's quiet advance). Each is
 * gated to the kind it belongs to so an upgrade only bends its own critter.
 */
function upgradeSteps(p: Piece): Vec[] {
  if (!p.upgrades) return [];
  const out: Vec[] = [];
  if (p.kind === 'hopper' && hasUpgrade(p, 'springheel')) out.push(...DIAG);
  if (p.kind === 'slink' && hasUpgrade(p, 'sidestep')) out.push(...ORTHO);
  if (p.kind === 'rumble' && hasUpgrade(p, 'pivot')) out.push(...DIAG);
  return out;
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

/** Legal destinations: empty squares, or squares holding the other side. */
export function movesFor(s: FightState, p: Piece): Vec[] {
  const out = squaresFor(s, p, false);
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

function squaresFor(s: FightState, p: Piece, threats: boolean): Vec[] {
  const m = MOVERS[p.kind];
  const out: Vec[] = spryOut(s, p, threats);

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
        if (occ && canLand(p, occ)) out.push({ x, y });
        // Thornstep: advance diagonally forward onto empty ground too. A quiet
        // step, not a new bite — the diagonal is already threatened above.
        else if (!occ && hasUpgrade(p, 'thornstep')) out.push({ x, y });
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

  if (m.steps) {
    for (const d of m.steps) {
      const x = p.x + d.x;
      const y = p.y + d.y;
      if (!inBounds(s, x, y)) continue;
      const occ = pieceAt(s, x, y);
      if (threats || !occ || canLand(p, occ)) out.push({ x, y });
    }
  }

  if (m.slides) {
    // Underbrush: a Slink's diagonal glide slips over the first friendly plant
    // in the lane and keeps going. Only the one — a second body still stops it.
    const canHop = p.kind === 'slink' && hasUpgrade(p, 'underbrush');
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
        x += d.x;
        y += d.y;
      }
    }
  }

  // extra step-directions grafted on by upgrades (springheel / sidestep / pivot)
  for (const d of upgradeSteps(p)) {
    const x = p.x + d.x;
    const y = p.y + d.y;
    if (!inBounds(s, x, y)) continue;
    const occ = pieceAt(s, x, y);
    if (threats || !occ || canLand(p, occ)) out.push({ x, y });
  }

  return dedup(out);
}

/**
 * Honeycake bonus: plain one-step moves onto empty squares. Never a capture
 * and never a threat — a spry critter's attack pattern stays its own.
 */
function spryOut(s: FightState, p: Piece, threats: boolean): Vec[] {
  if (!p.spry || threats) return [];
  const out: Vec[] = [];
  for (const d of ALL8) {
    const x = p.x + d.x;
    const y = p.y + d.y;
    if (inBounds(s, x, y) && !pieceAt(s, x, y)) out.push({ x, y });
  }
  return out;
}

/** Spry steps can coincide with a piece's own moves; collapse repeats. */
function dedup(vs: Vec[]): Vec[] {
  const seen = new Set<number>();
  return vs.filter((v) => {
    const k = v.y * 64 + v.x;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
