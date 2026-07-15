import { movesFor, pieceAt } from './board';
import type { FightState, Kind, Piece, Rng, Vec } from './types';

export interface Spawn {
  kind: Kind;
  x: number;
  y: number;
}

export interface FightConfig {
  name: string;
  w: number;
  h: number;
  friends: Spawn[];
  enemies: Spawn[];
  actsPerTurn: number;
}

export function createFight(cfg: FightConfig, rng: Rng): FightState {
  let id = 1;
  const pieces: Piece[] = [
    ...cfg.friends.map((sp) => ({ id: id++, side: 'friend' as const, ...sp })),
    ...cfg.enemies.map((sp) => ({ id: id++, side: 'bramble' as const, ...sp })),
  ];
  const s: FightState = {
    name: cfg.name,
    w: cfg.w,
    h: cfg.h,
    pieces,
    telegraphs: [],
    actsPerTurn: cfg.actsPerTurn,
    cursor: 0,
    turn: 1,
    status: 'playing',
    rng,
    events: [],
    pendingPromotion: null,
  };
  assignTelegraphs(s);
  return s;
}

export function enemies(s: FightState): Piece[] {
  return s.pieces.filter((p) => p.side === 'bramble');
}

export function keeper(s: FightState): Piece | undefined {
  return s.pieces.find((p) => p.kind === 'keeper');
}

/**
 * Move a friend, then resolve enemy telegraphs and set the next ones.
 * Returns false if the move was illegal (state untouched).
 */
export function playerMove(s: FightState, pieceId: number, to: Vec): boolean {
  if (s.status !== 'playing' || s.pendingPromotion != null) return false;
  const p = s.pieces.find((q) => q.id === pieceId);
  if (!p || p.side !== 'friend') return false;
  if (!movesFor(s, p).some((m) => m.x === to.x && m.y === to.y)) return false;

  const occ = pieceAt(s, to.x, to.y);
  if (occ) {
    s.pieces = s.pieces.filter((q) => q.id !== occ.id);
    s.telegraphs = s.telegraphs.filter((t) => t.pieceId !== occ.id);
    s.events.push({ type: 'capture', at: { x: to.x, y: to.y }, kind: occ.kind });
  }
  p.x = to.x;
  p.y = to.y;

  if (enemies(s).length === 0) {
    s.status = 'won';
    return true;
  }

  if (p.kind === 'sprout' && p.y === 0) {
    s.pendingPromotion = p.id;
    return true; // enemies hold their breath until promote() is called
  }

  finishTurn(s);
  return true;
}

export type PromotionKind = 'hopper' | 'slink' | 'rumble' | 'duchess';

/** Evolve the pending sprout, then let the enemy turn play out. */
export function promote(s: FightState, kind: PromotionKind): boolean {
  if (s.pendingPromotion == null) return false;
  const p = s.pieces.find((q) => q.id === s.pendingPromotion);
  s.pendingPromotion = null;
  if (!p) return false;
  p.kind = kind;
  finishTurn(s);
  return true;
}

function finishTurn(s: FightState) {
  resolveTelegraphs(s);
  if (s.status !== 'playing') return;
  s.turn++;
  assignTelegraphs(s);
}

/**
 * Each telegraph re-checks legality at resolve time. Blocking a thistle
 * head-on genuinely stops it — pawns can't capture forward.
 */
function resolveTelegraphs(s: FightState) {
  for (const t of s.telegraphs) {
    const e = s.pieces.find((p) => p.id === t.pieceId);
    if (!e || !t.to) continue;
    const to = t.to;
    if (!movesFor(s, e).some((m) => m.x === to.x && m.y === to.y)) continue;
    const occ = pieceAt(s, to.x, to.y);
    if (occ && occ.side === 'friend') {
      s.pieces = s.pieces.filter((p) => p.id !== occ.id);
      s.events.push({ type: 'shaken', at: { x: to.x, y: to.y }, kind: occ.kind });
      e.x = to.x;
      e.y = to.y;
      if (occ.kind === 'keeper') {
        s.status = 'lost';
        return;
      }
      continue;
    }
    e.x = to.x;
    e.y = to.y;
  }
  s.telegraphs = [];
}

function assignTelegraphs(s: FightState) {
  const es = enemies(s);
  s.telegraphs = [];
  if (es.length === 0) return;
  const n = Math.min(s.actsPerTurn, es.length);
  for (let i = 0; i < n; i++) {
    const e = es[(s.cursor + i) % es.length];
    s.telegraphs.push({ pieceId: e.id, to: chooseTarget(s, e) });
  }
  s.cursor = (s.cursor + n) % es.length;
}

/** Prefer capturing the keeper, then any friend, else drift toward the keeper. */
function chooseTarget(s: FightState, e: Piece): Vec | null {
  const opts = movesFor(s, e);
  if (opts.length === 0) return null;
  const k = keeper(s);
  let best: Vec | null = null;
  let bestScore = -Infinity;
  for (const o of opts) {
    const occ = pieceAt(s, o.x, o.y);
    let score = 0;
    if (occ) score = occ.kind === 'keeper' ? 1000 : 100;
    else if (k) score = -(Math.abs(o.x - k.x) + Math.abs(o.y - k.y));
    score += s.rng() * 0.5; // shuffle ties so drift isn't robotic
    if (score > bestScore) {
      bestScore = score;
      best = o;
    }
  }
  return best;
}
