import { movesFor, pieceAt } from './board';
import type { FightState, Kind, Piece, Rng, Vec } from './types';

export interface Spawn {
  kind: Kind;
  x: number;
  y: number;
  spry?: boolean;
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
 * Move a friend and settle the immediate consequences (capture, win,
 * promotion). Does NOT resolve the enemy turn — call resolveEnemyTurn()
 * separately once the UI has shown this move on its own. Returns false if
 * the move was illegal (state untouched).
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

  return true;
}

export type PromotionKind = 'hopper' | 'slink' | 'rumble' | 'duchess';

/** Evolve the pending sprout. Call resolveEnemyTurn() afterward. */
export function promote(s: FightState, kind: PromotionKind): boolean {
  if (s.pendingPromotion == null) return false;
  const p = s.pieces.find((q) => q.id === s.pendingPromotion);
  s.pendingPromotion = null;
  if (!p) return false;
  p.kind = kind;
  return true;
}

/**
 * Stalemate guard: true if any friend has at least one legal move. When
 * false, the UI lets the turn pass (a "wait") instead of soft-locking.
 */
export function playerHasMove(s: FightState): boolean {
  return s.pieces.some((p) => p.side === 'friend' && movesFor(s, p).length > 0);
}

/**
 * Resolve the enemy telegraphs into real moves, then set up the next round's
 * telegraphs. Split out from playerMove so the UI can show "your move
 * landed" and "the bramble's move" as two distinct, watchable beats.
 */
export function resolveEnemyTurn(s: FightState) {
  if (s.status !== 'playing' || s.pendingPromotion != null) return;
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
    if (!movesFor(s, e).some((m) => m.x === to.x && m.y === to.y)) {
      s.events.push({ type: 'blocked', at: { x: e.x, y: e.y }, kind: e.kind });
      continue;
    }
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
  // The whole bramble side plays its strongest hand: score every enemy's best
  // move and telegraph the n meanest. Not round-robin — a capture on the table
  // gets taken by whoever can take it, not left because it "isn't their turn."
  const ranked = es
    .map((e) => bestMove(s, e))
    .filter((r) => r.to != null)
    .sort((a, b) => b.score - a.score);
  for (const r of ranked.slice(0, n)) {
    s.telegraphs.push({ pieceId: r.id, to: r.to });
  }
}

/** Prefer capturing the keeper, then any friend, else drift toward the keeper. */
function bestMove(s: FightState, e: Piece): { id: number; to: Vec | null; score: number } {
  const opts = movesFor(s, e);
  if (opts.length === 0) return { id: e.id, to: null, score: -Infinity };
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
  return { id: e.id, to: best, score: bestScore };
}
