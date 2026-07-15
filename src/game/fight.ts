import { movesFor, pieceAt, threatsFor } from './board';
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
  /** trinkets along for this fight */
  cloak?: boolean;
  secondBreakfast?: boolean;
  whistle?: boolean;
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
    cloakLeft: cfg.cloak ? 1 : 0,
    freeMoves: cfg.secondBreakfast ? 1 : 0,
    whistle: !!cfg.whistle,
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
  if (settleCornered(s)) return true;

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
  if (kind === 'hopper' && s.whistle) p.spry = true; // the Acorn Whistle greets them
  settleCornered(s); // fresh threats might complete the net
  return true;
}

/**
 * Second Breakfast: spend a banked extra move. The UI calls this after a
 * player move lands; true means stay in the player phase for one more.
 */
export function takeFreeMove(s: FightState): boolean {
  if (s.status !== 'playing' || s.freeMoves <= 0) return false;
  s.freeMoves--;
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
  // a minion can wall off the heart's last free escape mid-turn
  if (settleCornered(s)) return;
  s.turn++;
  assignTelegraphs(s);
}

// ---------- the Bramble Heart ----------

/** Every square the friend side covers (threatens or defends). */
function friendCover(s: FightState): Set<number> {
  const set = new Set<number>();
  for (const p of s.pieces) {
    if (p.side !== 'friend') continue;
    for (const t of threatsFor(s, p)) set.add(t.y * 64 + t.x);
  }
  return set;
}

/**
 * The boss rule (checkmate, never named): the Heart is beaten when the
 * square it stands on is covered and every square it could step to is too.
 */
export function heartCornered(s: FightState): boolean {
  const h = s.pieces.find((p) => p.kind === 'heart');
  if (!h) return false;
  const cover = friendCover(s);
  if (!cover.has(h.y * 64 + h.x)) return false;
  return movesFor(s, h).every((m) => cover.has(m.y * 64 + m.x));
}

/** If the heart is cornered, it bursts into flowers and the fight is won. */
function settleCornered(s: FightState): boolean {
  if (s.status !== 'playing' || !heartCornered(s)) return false;
  const h = s.pieces.find((p) => p.kind === 'heart')!;
  s.pieces = s.pieces.filter((p) => p.id !== h.id);
  s.telegraphs = s.telegraphs.filter((t) => t.pieceId !== h.id);
  s.events.push({ type: 'cornered', at: { x: h.x, y: h.y }, kind: 'heart' });
  s.status = 'won';
  return true;
}

/**
 * Each telegraph re-checks legality at resolve time. Blocking a thistle
 * head-on genuinely stops it — pawns can't capture forward. But a slider
 * whose committed square is walled off still lunges at the first critter that
 * stepped into its lane: interposing a capturable piece costs you that piece,
 * it isn't a free block.
 */
function resolveTelegraphs(s: FightState) {
  for (const t of s.telegraphs) {
    const e = s.pieces.find((p) => p.id === t.pieceId);
    if (!e || !t.to) continue;
    const legal = movesFor(s, e);
    let to = t.to;
    if (!legal.some((m) => m.x === to.x && m.y === to.y)) {
      const cut = interposer(s, e, t.to, legal);
      if (!cut) {
        s.events.push({ type: 'blocked', at: { x: e.x, y: e.y }, kind: e.kind });
        continue;
      }
      to = cut; // the slider stops on — and takes — whatever cut it off
    }
    const occ = pieceAt(s, to.x, to.y);
    if (occ && occ.side === 'friend') {
      const spot = s.cloakLeft > 0 ? cloakSpot(s, to) : null;
      if (spot) {
        // Dandelion Cloak: the friend drifts home instead of being caught
        s.cloakLeft--;
        occ.x = spot.x;
        occ.y = spot.y;
        s.events.push({ type: 'cloaked', at: { x: to.x, y: to.y }, kind: occ.kind });
      } else {
        s.pieces = s.pieces.filter((p) => p.id !== occ.id);
        s.events.push({ type: 'shaken', at: { x: to.x, y: to.y }, kind: occ.kind });
        if (occ.kind === 'keeper') {
          e.x = to.x;
          e.y = to.y;
          s.status = 'lost';
          return;
        }
      }
      e.x = to.x;
      e.y = to.y;
      continue;
    }
    e.x = to.x;
    e.y = to.y;
  }
  s.telegraphs = [];
}

/**
 * When a slider's committed square is unreachable, the friend it stops on: the
 * nearest one along the committed ray that it can legally take. Straight lines
 * only — a leaper can't be interposed at all, and a pawn's forward push isn't a
 * capture, so neither yields an interposer (both stay genuinely blocked).
 */
function interposer(s: FightState, e: Piece, aim: Vec, legal: Vec[]): Vec | null {
  const dx = Math.sign(aim.x - e.x);
  const dy = Math.sign(aim.y - e.y);
  const straight = dx === 0 || dy === 0 || Math.abs(aim.x - e.x) === Math.abs(aim.y - e.y);
  if (!straight) return null;
  let x = e.x + dx;
  let y = e.y + dy;
  for (;;) {
    const occ = pieceAt(s, x, y);
    if (occ) {
      // first blocker: take it only if it's a friend this piece can actually land on
      return occ.side === 'friend' && legal.some((m) => m.x === x && m.y === y) ? { x, y } : null;
    }
    if (x === aim.x && y === aim.y) return null; // reached the aim with nothing to hit
    x += dx;
    y += dy;
  }
}

/** First free square on the friends' home row (skipping where the enemy lands). */
function cloakSpot(s: FightState, landing: Vec): Vec | null {
  const y = s.h - 1;
  for (let x = 0; x < s.w; x++) {
    if (landing.x === x && landing.y === y) continue;
    if (!pieceAt(s, x, y)) return { x, y };
  }
  return null;
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
  // the Heart holding still is information — keep a null telegraph so the
  // renderer can show it digging in rather than nothing at all
  const heart = es.find((p) => p.kind === 'heart');
  if (heart && !s.telegraphs.some((t) => t.pieceId === heart.id)) {
    s.telegraphs.push({ pieceId: heart.id, to: null });
  }
}

/**
 * Prefer capturing the keeper, then any friend, else drift toward the keeper.
 * The Heart also dreads covered squares and would rather stand still than
 * step into danger — that's what makes penning it in a real hunt.
 */
function bestMove(s: FightState, e: Piece): { id: number; to: Vec | null; score: number } {
  const opts = movesFor(s, e);
  if (opts.length === 0) return { id: e.id, to: null, score: -Infinity };
  const dread = e.kind === 'heart' ? friendCover(s) : null;
  const k = keeper(s);
  let best: Vec | null = null;
  let bestScore = -Infinity;
  for (const o of opts) {
    const occ = pieceAt(s, o.x, o.y);
    let score = 0;
    if (occ) score = occ.kind === 'keeper' ? 1000 : 100;
    else if (k) score = -(Math.abs(o.x - k.x) + Math.abs(o.y - k.y));
    if (dread?.has(o.y * 64 + o.x)) score -= 500;
    score += s.rng() * 0.5; // shuffle ties so drift isn't robotic
    if (score > bestScore) {
      bestScore = score;
      best = o;
    }
  }
  if (dread && best && dread.has(best.y * 64 + best.x) && !dread.has(e.y * 64 + e.x)) {
    return { id: e.id, to: null, score: -Infinity }; // safer right here — don't move
  }
  return { id: e.id, to: best, score: bestScore };
}
