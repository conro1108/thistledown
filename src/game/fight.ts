import { inBounds, isPawn, isSlider, movesFor, pieceAt, threatsFor } from './board';
import type { AiDials, FightState, Kind, Piece, Rng, SpreadConfig, Telegraph, UpgradeId, Vec } from './types';

export interface Spawn {
  kind: Kind;
  x: number;
  y: number;
  spry?: boolean;
  /** movement upgrades (friend-only), applied by kind in buildFightConfig */
  upgrades?: UpgradeId[];
  /** telegraphs two options, resolves the better one (later-region spice) */
  fickle?: boolean;
  /** shrouded: commits without showing the player its arrow */
  veiled?: boolean;
}

export const NAIVE_DIALS: AiDials = { foresight: 0, caution: 0, bloodlust: 1, temperature: 0.5 };

/** Spread stays dormant until the bramble is thinned to this share of its opening. */
export const DEFAULT_SPREAD_GATE = 0.6;

/** Chess piece values in disguise — the exchange math the dials reason with. */
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

export interface FightConfig {
  name: string;
  w: number;
  h: number;
  friends: Spawn[];
  enemies: Spawn[];
  actsPerTurn: number;
  /** how sharply the bramble plays; omitted pieces of it stay naive */
  dials?: Partial<AiDials>;
  /** reinforcement clock — stalling past `after` turns grows fresh thistles */
  spread?: SpreadConfig;
  /** trinkets along for this fight */
  cloak?: boolean;
  secondBreakfast?: boolean;
  whistle?: boolean;
  /** Bramble Ward: negate the first capture this clearing (Keeper included) */
  ward?: boolean;
  /** Early Riser: bank a second first-move stretch on top of Second Breakfast */
  riser?: boolean;
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
    dials: { ...NAIVE_DIALS, ...cfg.dials },
    spread: cfg.spread,
    pendingSprout: null,
    startMaterial: pieces.reduce((m, p) => m + (p.side === 'bramble' ? PIECE_VALUE[p.kind] : 0), 0),
    nextId: id,
    turn: 1,
    status: 'playing',
    rng,
    events: [],
    pendingPromotion: null,
    cloakLeft: cfg.cloak ? 1 : 0,
    wardLeft: cfg.ward ? 1 : 0,
    // Second Breakfast banks one first-move stretch; Early Riser banks another (they stack).
    freeMoves: (cfg.secondBreakfast ? 1 : 0) + (cfg.riser ? 1 : 0),
    freeMoveActive: false,
    whistle: !!cfg.whistle,
  };
  assignTelegraphs(s);
  return s;
}

export function enemies(s: FightState): Piece[] {
  return s.pieces.filter((p) => p.side === 'bramble');
}

/** Current bramble material — the spread gate compares this against startMaterial. */
export function brambleMaterial(s: FightState): number {
  return enemies(s).reduce((m, p) => m + PIECE_VALUE[p.kind], 0);
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
  s.freeMoveActive = false;

  const occ = pieceAt(s, to.x, to.y);
  if (occ) {
    // catching an enemy mid-lunge steals the bramble's move — worth celebrating
    const hadPlan = s.telegraphs.some((t) => t.pieceId === occ.id && t.to != null);
    s.pieces = s.pieces.filter((q) => q.id !== occ.id);
    s.telegraphs = s.telegraphs.filter((t) => t.pieceId !== occ.id);
    s.events.push({ type: 'capture', at: { x: to.x, y: to.y }, kind: occ.kind });
    if (hadPlan) s.events.push({ type: 'tempo', at: { x: to.x, y: to.y }, kind: occ.kind });
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
  s.freeMoveActive = true; // the extra move can't capture — see movesFor
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
  s.freeMoveActive = false; // an unspent stretch doesn't outlive the turn
  resolveTelegraphs(s);
  if (s.status !== 'playing') return;
  // a minion can wall off the heart's last free escape mid-turn
  if (settleCornered(s)) return;
  settleSprout(s);
  s.turn++;
  markSprout(s);
  assignTelegraphs(s);
  announceStuck(s);
}

/**
 * A bramble piece the player has walled in — one that would move but has no
 * legal square — re-announces its stuckness every turn it stays that way, so
 * holding a thistle in place stays loud feedback and not a one-time note that
 * scrolls away. The Heart is exempt (its own null telegraph already reads as
 * "digging in"), and we don't double up on a piece resolveTelegraphs just
 * reported blocked this same turn.
 */
function announceStuck(s: FightState) {
  const already = new Set(
    s.events.filter((e) => e.type === 'blocked').map((e) => `${e.at.x},${e.at.y}`),
  );
  for (const e of enemies(s)) {
    if (e.kind === 'heart') continue;
    if (already.has(`${e.x},${e.y}`)) continue;
    if (movesFor(s, e).length === 0) {
      s.events.push({ type: 'blocked', at: { x: e.x, y: e.y }, kind: e.kind });
    }
  }
}

// ---------- the spread clock ----------

/** The warned square sprouts a thistle — unless a friend is smothering it. */
function settleSprout(s: FightState) {
  const spot = s.pendingSprout;
  if (!spot) return;
  s.pendingSprout = null;
  if (pieceAt(s, spot.x, spot.y)) {
    s.events.push({ type: 'smothered', at: spot, kind: 'thistle' });
    return;
  }
  s.pieces.push({ id: s.nextId++, side: 'bramble', kind: 'thistle', x: spot.x, y: spot.y });
  s.events.push({ type: 'sprouted', at: spot, kind: 'thistle' });
}

/**
 * Every `every` turns past `after`, warn a free far-edge square (up to the
 * cap). The warning lands a full player turn before anything grows — standing
 * on the square smothers it, so even the clock is a tactical surface.
 */
function markSprout(s: FightState) {
  const c = s.spread;
  if (!c || s.turn < c.after || (s.turn - c.after) % c.every !== 0) return;
  if (enemies(s).length >= c.cap) return;
  // hold reinforcements until the player has actually thinned the clearing —
  // a full-strength bramble spreading on a beginner is pure pile-on
  const gate = c.startAt ?? DEFAULT_SPREAD_GATE;
  if (brambleMaterial(s) > gate * s.startMaterial) return;
  const free: Vec[] = [];
  for (let x = 0; x < s.w; x++) if (!pieceAt(s, x, 0)) free.push({ x, y: 0 });
  if (!free.length) return;
  s.pendingSprout = free[Math.floor(s.rng() * free.length)];
  s.events.push({ type: 'stir', at: s.pendingSprout, kind: 'thistle' });
}

// ---------- the Bramble Heart ----------

/**
 * Every square the friend side covers (threatens or defends). Evaluated with
 * the Heart removed from the board so a slider's ray reads *through* the square
 * it stands on: the square directly behind a checked Heart is no refuge — the
 * lane still reaches it once the Heart steps off. Removing the Heart only ever
 * extends rays (it was a blocker), so no genuinely safe square is lost.
 */
function friendCover(s: FightState): Set<number> {
  const set = new Set<number>();
  const view = { ...s, pieces: s.pieces.filter((p) => p.kind !== 'heart') };
  for (const p of view.pieces) {
    if (p.side !== 'friend') continue;
    for (const t of threatsFor(view, p)) set.add(t.y * 64 + t.x);
  }
  return set;
}

/**
 * Bramble moves (never the Heart's own) that would leave the Heart's square
 * uncovered: capturing the checker, or stepping into a slider's lane. The
 * chess escape hatch the cornering rule must honor — a check the bramble can
 * answer is pressure, not the end.
 */
function heartRescues(s: FightState): { piece: Piece; to: Vec }[] {
  const h = s.pieces.find((p) => p.kind === 'heart');
  if (!h) return [];
  const out: { piece: Piece; to: Vec }[] = [];
  for (const p of s.pieces) {
    if (p.side !== 'bramble' || p.kind === 'heart') continue;
    for (const to of movesFor(s, p)) {
      // the mover leaves its square; whatever it landed on is captured
      const pieces = s.pieces
        .filter((q) => q.id !== p.id && !(q.x === to.x && q.y === to.y))
        .concat([{ ...p, x: to.x, y: to.y }]);
      if (!friendCover({ ...s, pieces }).has(h.y * 64 + h.x)) out.push({ piece: p, to });
    }
  }
  return out;
}

/**
 * The boss rule (checkmate, never named): the Heart is beaten when the square
 * it stands on is covered, every square it could step to is too, and no other
 * bramble piece can take the checker or block the lane. Anything less is an
 * escapable check — the net has to cover the defenders as well.
 */
export function heartCornered(s: FightState): boolean {
  const h = s.pieces.find((p) => p.kind === 'heart');
  if (!h) return false;
  const cover = friendCover(s);
  if (!cover.has(h.y * 64 + h.x)) return false;
  if (!movesFor(s, h).every((m) => cover.has(m.y * 64 + m.x))) return false;
  return heartRescues(s).length === 0;
}

/**
 * A checked Heart that can't flee presses one defender into service: the
 * telegraph that answers the check, ahead of every other appetite. Checks
 * force the whole side — that's what makes the mating net a real hunt.
 * Prefers taking the checker; blocks with the cheapest body otherwise.
 */
function forcedRescue(s: FightState): Telegraph | null {
  const h = s.pieces.find((p) => p.kind === 'heart');
  if (!h) return null;
  const cover = friendCover(s);
  if (!cover.has(h.y * 64 + h.x)) return null;
  if (movesFor(s, h).some((m) => !cover.has(m.y * 64 + m.x))) return null; // it can flee on its own
  let best: Telegraph | null = null;
  let bestScore = -Infinity;
  for (const { piece, to } of heartRescues(s)) {
    const victim = pieceAt(s, to.x, to.y);
    const score = (victim ? 100 * PIECE_VALUE[victim.kind] : 0) - PIECE_VALUE[piece.kind];
    if (score > bestScore) {
      bestScore = score;
      best = { pieceId: piece.id, to };
      if (victim) best.target = victim.id;
      if (piece.veiled) best.veiled = true;
    }
  }
  return best;
}

/** The friend a telegraph lands on, if any — the piece a red attack is aimed at. */
function friendTarget(s: FightState, v: Vec | null): number | undefined {
  if (!v) return undefined;
  const occ = pieceAt(s, v.x, v.y);
  return occ && occ.side === 'friend' ? occ.id : undefined;
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
 * Each telegraph re-checks legality at resolve time and resolves against the
 * board as it stands now — see landingFor. Blocking a thistle head-on still
 * stops it (pawns can't capture forward), but you can't cheat a slider by
 * feeding a piece into its lane or by sliding the target along it.
 */
function resolveTelegraphs(s: FightState) {
  // Resolve the Heart last, against the *settled* board. Its guards move on the
  // same turn, and a guard running its committed move can vacate the Heart's one
  // flight square (or shift a checking lane). If the Heart decided first it could
  // freeze a beat too early — find every square blocked, give up its move — and
  // then a defender walks off its escape, stranding it in check at the end of its
  // own turn. Moving it last lets it flee onto whatever its defenders just cleared.
  const order = [...s.telegraphs];
  order.sort((a, b) => heartTurnOrder(s, a) - heartTurnOrder(s, b));
  for (const t of order) {
    const e = s.pieces.find((p) => p.id === t.pieceId);
    if (!e) continue;
    if (e.kind === 'heart') {
      resolveHeart(s, e, t);
      if (s.status !== 'playing') return;
      continue;
    }
    if (!t.to) continue;
    let to = landingFor(s, e, t.to);
    if (t.alt) {
      // fickle: two committed options — take whichever is better right now
      const altTo = landingFor(s, e, t.alt);
      if (prize(s, altTo) > prize(s, to)) to = altTo;
    }
    // a red attack is on a piece, not a square: a target that sidesteps into
    // another square this enemy can still reach gets taken there anyway
    const chase = chaseTarget(s, e, t);
    if (chase) to = chase;
    if (!to) {
      s.events.push({ type: 'blocked', at: { x: e.x, y: e.y }, kind: e.kind });
      continue;
    }
    land(s, e, to);
    if (s.status !== 'playing') return;
  }
  s.telegraphs = [];
}

/** Sort key that pushes the Heart's telegraph to the back of the resolve order. */
function heartTurnOrder(s: FightState, t: Telegraph): number {
  return s.pieces.find((p) => p.id === t.pieceId)?.kind === 'heart' ? 1 : 0;
}

/**
 * A red telegraph attacks a *piece*, not a square. If that piece is still on
 * the board and this enemy can still legally capture it at wherever it stands
 * now, return that square — the threat follows a target that only sidestepped
 * within reach. Null when the target is gone or dodged clear of the attack.
 */
function chaseTarget(s: FightState, e: Piece, t: Telegraph): Vec | null {
  if (t.target == null) return null;
  const victim = s.pieces.find((p) => p.id === t.target && p.side === 'friend');
  if (!victim) return null;
  return movesFor(s, e).some((m) => m.x === victim.x && m.y === victim.y)
    ? { x: victim.x, y: victim.y }
    : null;
}

/** What a landing is worth at resolve time: the friend on it, or mere legality. */
function prize(s: FightState, v: Vec | null): number {
  if (!v) return -1;
  const occ = pieceAt(s, v.x, v.y);
  return occ && occ.side === 'friend' ? PIECE_VALUE[occ.kind] : 0;
}

/** Land e on `to`, catching (or sparing) any friend standing there. */
function land(s: FightState, e: Piece, to: Vec) {
  const occ = pieceAt(s, to.x, to.y);
  if (occ && occ.side === 'friend') {
    // the Cloak spares a companion, never the Keeper — losing the Keeper always ends the fight
    const spot = occ.kind !== 'keeper' && s.cloakLeft > 0 ? cloakSpot(s, to) : null;
    if (spot) {
      // Dandelion Cloak: the friend drifts home instead of being caught
      s.cloakLeft--;
      occ.x = spot.x;
      occ.y = spot.y;
      s.events.push({ type: 'cloaked', at: { x: to.x, y: to.y }, kind: occ.kind });
    } else if (s.wardLeft > 0) {
      // Bramble Ward: the capture is shrugged off — the friend stands (the Keeper
      // too), and the attacker recoils rather than completing its move.
      s.wardLeft--;
      s.events.push({ type: 'warded', at: { x: to.x, y: to.y }, kind: occ.kind });
      return;
    } else {
      s.pieces = s.pieces.filter((p) => p.id !== occ.id);
      s.events.push({ type: 'shaken', at: { x: to.x, y: to.y }, kind: occ.kind });
      if (occ.kind === 'keeper') s.status = 'lost';
    }
  }
  e.x = to.x;
  e.y = to.y;
  // the promotion rule cuts both ways: a bramble pawn that walks the whole
  // meadow twists into a gloom — a passed pawn is never safe to ignore
  if (e.side === 'bramble' && isPawn(e.kind) && e.y === s.h - 1) {
    e.kind = 'gloom';
    s.events.push({ type: 'twisted', at: { x: e.x, y: e.y }, kind: 'gloom' });
  }
}

/**
 * The king rule, at resolve time: the Heart re-reads the board after your
 * move. Checked, it abandons its plan and flees to the best uncovered square;
 * and it never steps onto a square that became covered after it committed —
 * it balks instead. (Checked with no way out never reaches here: that's
 * cornered, and settleCornered has already ended the fight.)
 */
function resolveHeart(s: FightState, h: Piece, t: Telegraph) {
  const cover = friendCover(s);
  if (cover.has(h.y * 64 + h.x)) {
    const outs = movesFor(s, h).filter((m) => !cover.has(m.y * 64 + m.x));
    const to = pickBest(s, outs).to;
    if (!to) return; // walled in mid-resolve; settleCornered will judge it
    s.events.push({ type: 'flee', at: { x: h.x, y: h.y }, kind: 'heart' });
    land(s, h, to);
    return;
  }
  if (!t.to) return; // dug in on purpose
  // the Heart's bite tracks its target too — but it still never steps onto a
  // covered square, so a target that dodges behind its own defenders is safe
  const to = chaseTarget(s, h, t) ?? landingFor(s, h, t.to);
  if (to && !cover.has(to.y * 64 + to.x)) {
    land(s, h, to);
  } else {
    s.events.push({ type: 'blocked', at: { x: h.x, y: h.y }, kind: 'heart' });
  }
}

/**
 * Where a committed telegraph actually resolves against the current board, or
 * null if the piece is genuinely walled off (it stays put — "blocked").
 *
 * A slider travels its committed ray and takes the *first* friend on the lane:
 * one that stepped into the path (interposition) or the target that slid along
 * the lane to dodge — you can't escape a lane by staying on it, and it reaches a
 * far one no stepper could. The first own-side piece (or the board edge) ends
 * the lane. With no friend to catch, it lands on the telegraphed square if that
 * move is still legal.
 *
 * Steppers and leapers (including the Heart) have no lane to chase along, but
 * a stale quiet aim still shouldn't blind them to a bite that opened up
 * elsewhere in reach — a piece that carelessly steps next to a "quiet" mover
 * gets taken, not spared because it wasn't the square that was planned for.
 * Prefer the aimed square if it's a bite, else the juiciest bite available
 * now, else the aim (a genuinely quiet move). A *red* attack tracks its
 * target across squares one level up, in chaseTarget — this is only the
 * fallback for when there's no live target to chase (a quiet move, or a
 * target that dodged clear of reach).
 *
 * A pawn aiming a diagonal capture has no lane to chase along — if the target
 * stepped away, it pushes forward instead of standing idle (that's a dodge,
 * not a block). A pawn aiming straight ahead that gets walled off head-on
 * stays genuinely blocked — that's the block tactic, and it stays a tactic.
 */
function landingFor(s: FightState, e: Piece, aim: Vec): Vec | null {
  const legal = movesFor(s, e);
  const aimHit = legal.some((m) => m.x === aim.x && m.y === aim.y) ? aim : null;
  if (isPawn(e.kind)) {
    // A pawn's diagonal bite is a standing threat, not a plan. Whatever it
    // telegraphed, if a friend is sitting on a forward diagonal now, take it —
    // a piece that steps into the diagonal steps into the bite. Prefer the
    // square it aimed at, then the juiciest of any others.
    const diag = legal.filter((m) => m.x !== e.x); // pawn diagonals are legal only when a friend sits there
    if (diag.length) {
      return (
        diag.find((m) => m.x === aim.x && m.y === aim.y) ??
        diag.reduce((a, b) => (prize(s, b) > prize(s, a) ? b : a))
      );
    }
    if (aim.x === e.x) return aimHit; // forward push: its square, or null if walled off head-on
    return legal.find((m) => m.x === e.x) ?? null; // aimed diagonal emptied out: push forward
  }

  if (!isSlider(e.kind)) {
    const bites = legal.filter((m) => pieceAt(s, m.x, m.y));
    if (bites.length) {
      return (
        bites.find((m) => m.x === aim.x && m.y === aim.y) ??
        bites.reduce((a, b) => (prize(s, b) > prize(s, a) ? b : a))
      );
    }
    return aimHit;
  }

  const dx = Math.sign(aim.x - e.x);
  const dy = Math.sign(aim.y - e.y);
  let x = e.x + dx;
  let y = e.y + dy;
  while (inBounds(s, x, y)) {
    const occ = pieceAt(s, x, y);
    if (occ) {
      // reach only matters for a slider; the legal check gates steppers/pawns out
      if (occ.side === 'friend' && legal.some((m) => m.x === x && m.y === y)) return { x, y };
      break; // own side, or a friend it can't take: the lane ends here
    }
    x += dx;
    y += dy;
  }
  return aimHit;
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
  let n = Math.min(s.actsPerTurn, es.length);
  // a check on the Heart outranks every appetite: the rescue goes first
  const rescue = forcedRescue(s);
  if (rescue) {
    s.telegraphs.push(rescue);
    n--;
  }
  // The whole bramble side plays its strongest hand: score every enemy's best
  // move and telegraph the n meanest. Not round-robin — a capture on the table
  // gets taken by whoever can take it, not left because it "isn't their turn."
  const ranked = es
    .filter((e) => e.id !== rescue?.pieceId)
    .map((e) => ({ e, ...bestMove(s, e) }))
    .filter((r) => r.to != null)
    .sort((a, b) => b.score - a.score);
  for (const r of ranked.slice(0, Math.max(0, n))) {
    const t: Telegraph = { pieceId: r.id, to: r.to };
    const tgt = friendTarget(s, r.to);
    if (tgt != null) t.target = tgt;
    if (r.alt) t.alt = r.alt;
    if (r.e.veiled) t.veiled = true;
    s.telegraphs.push(t);
  }
  // the Heart holding still is information — keep a null telegraph so the
  // renderer can show it digging in rather than nothing at all
  const heart = es.find((p) => p.kind === 'heart');
  if (heart && !s.telegraphs.some((t) => t.pieceId === heart.id)) {
    s.telegraphs.push({ pieceId: heart.id, to: null });
  }
}

/**
 * The best move by the fight's dials. The Heart is its own mind: it never
 * plans onto a covered square and would rather stand still than step into
 * danger — that's what makes penning it in a real hunt.
 */
function bestMove(
  s: FightState,
  e: Piece,
): { id: number; to: Vec | null; score: number; alt?: Vec | null } {
  let opts = movesFor(s, e);
  if (e.kind === 'heart') {
    const cover = friendCover(s);
    opts = opts.filter((m) => !cover.has(m.y * 64 + m.x));
    if (opts.length === 0 && !cover.has(e.y * 64 + e.x)) {
      return { id: e.id, to: null, score: -Infinity }; // safer right here — don't move
    }
    return { id: e.id, ...pickBest(s, opts) };
  }
  const pre = preemptable(s, e);
  let best: Vec | null = null;
  let bestScore = -Infinity;
  let second: Vec | null = null;
  let secondScore = -Infinity;
  for (const o of opts) {
    const score = scoreMove(s, e, o, pre);
    if (score > bestScore) {
      second = best;
      secondScore = bestScore;
      best = o;
      bestScore = score;
    } else if (score > secondScore) {
      second = o;
      secondScore = score;
    }
  }
  return { id: e.id, to: best, score: bestScore, alt: e.fickle ? second : undefined };
}

/**
 * One candidate move, weighed by the dials. A capture is worth its victim,
 * minus (foresight permitting) the mover when the landing square is covered —
 * a recapture is coming — and discounted when the player can simply take the
 * mover first at a profit: a telegraph the player is happy to preempt is a
 * tempo gift, and the pawn-chain ride was made of exactly those. Quiet moves
 * drift toward the keeper, and caution keeps them off covered squares.
 */
function scoreMove(s: FightState, e: Piece, to: Vec, preempted: boolean): number {
  const d = s.dials;
  const victim = pieceAt(s, to.x, to.y); // legality means friend or empty
  let score: number;
  if (victim) {
    let gain = d.bloodlust * PIECE_VALUE[victim.kind];
    if (preempted) gain *= 1 - 0.8 * d.foresight;
    score = gain - (exposedAt(s, e, to, victim.id) ? d.foresight * PIECE_VALUE[e.kind] : 0);
  } else {
    const k = keeper(s);
    score = k ? -(Math.abs(to.x - k.x) + Math.abs(to.y - k.y)) : 0;
    if (d.caution > 0 && exposedAt(s, e, to)) score -= d.caution * PIECE_VALUE[e.kind];
  }
  return score + s.rng() * d.temperature; // jitter so equal moves aren't robotic
}

/** Would a friend cover (be able to land on) `to` with e standing there? */
function exposedAt(s: FightState, e: Piece, to: Vec, victimId?: number): boolean {
  const pieces = s.pieces
    .filter((p) => p.id !== e.id && p.id !== victimId)
    .concat([{ ...e, x: to.x, y: to.y }]);
  const view = { ...s, pieces };
  return pieces.some(
    (p) => p.side === 'friend' && threatsFor(view, p).some((t) => t.x === to.x && t.y === to.y),
  );
}

/**
 * Whether the player can profitably capture e before its telegraph fires —
 * they always move first, so an attacked enemy never gets to dodge. Profitable
 * means e is undefended, or worth more than the cheapest friend attacking it.
 */
function preemptable(s: FightState, e: Piece): boolean {
  let cheapest = Infinity;
  let defended = false;
  for (const p of s.pieces) {
    if (p.id === e.id) continue;
    if (!threatsFor(s, p).some((t) => t.x === e.x && t.y === e.y)) continue;
    if (p.side === 'friend') cheapest = Math.min(cheapest, PIECE_VALUE[p.kind]);
    else defended = true;
  }
  if (cheapest === Infinity) return false;
  return !defended || PIECE_VALUE[e.kind] > cheapest;
}

/** The Heart's taste in squares: keeper capture > any capture > drift toward the keeper. */
function pickBest(s: FightState, opts: Vec[]): { to: Vec | null; score: number } {
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
  return { to: best, score: bestScore };
}
