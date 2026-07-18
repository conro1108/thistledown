import {
  createFight,
  playerHasMove,
  playerMove,
  promote,
  resolveEnemyTurn,
  takeFreeMove,
  type PromotionKind,
} from './fight';
import {
  afterFightWon,
  buildFightConfig,
  campDue,
  campHeal,
  campSnack,
  isSpry,
  newRun,
  offerRecruits,
  offerTrinkets,
  offerUpgrades,
  recruit,
  recruitDue,
  ROSTER_CAP,
  takeTrinket,
  takeUpgrade,
  type RunState,
  type TrinketId,
} from './run';
import type { FightState, Kind, UpgradeId, Vec } from './types';

/**
 * The whole run as a decision log. Every choice — including the implicit
 * "resolve the bramble's turn" — flows through apply(), and all RNG use
 * happens inside those transitions. Replaying the log against the same seed
 * reconstructs the run exactly, which is what the mid-run save stores
 * (seed + log, never raw board state).
 */
export type LogEntry =
  | { t: 'begin' }
  | { t: 'move'; id: number; to: Vec }
  | { t: 'promote'; kind: PromotionKind }
  | { t: 'resolve' }
  | { t: 'recruit'; kind: Kind }
  | { t: 'skip' }
  | { t: 'trinket'; id: TrinketId }
  | { t: 'upgrade'; id: UpgradeId }
  | { t: 'heal' }
  | { t: 'snack'; idx: number }
  | { t: 'rest' };

export type Stage =
  | 'intro' // at the next clearing's edge: expect 'begin'
  | 'fight' // mid-fight: expect 'move' (or 'resolve' once one is due)
  | 'promotion' // a sprout is blossoming: expect 'promote'
  | 'post' // clearing won: expect 'recruit' | 'skip'
  | 'found' // something in the grass: expect 'trinket'
  | 'camp' // the campfire: expect 'heal' | 'snack' | 'trinket' | 'rest'
  | 'over'; // run won or lost

export interface Session {
  run: RunState;
  fight: FightState | null;
  /** lineup[j] = companion index for friend piece id 2+j (id 1 is the keeper) */
  lineup: number[];
  stage: Stage;
  /** the player has moved; the bramble's turn must resolve before the next move */
  resolveDue: boolean;
  /** offers drawn by the session (so display never consumes RNG) */
  recruitOffers: Kind[] | null;
  trinketOffers: TrinketId[];
  /** movement upgrades on offer at the current campfire (so display never rolls RNG) */
  upgradeOffers: UpgradeId[];
  log: LogEntry[];
}

export function newSession(seed: number): Session {
  return {
    run: newRun(seed),
    fight: null,
    lineup: [],
    stage: 'intro',
    resolveDue: false,
    recruitOffers: null,
    trinketOffers: [],
    upgradeOffers: [],
    log: [],
  };
}

/**
 * Player moves made in the clearing being fought right now — everything since
 * the last 'begin'. The scoreboard's "cleared in N moves" reads this the moment
 * a clearing falls. (Promotions, waits and camp choices aren't moves.)
 */
export function movesThisClearing(s: Session): number {
  let n = 0;
  for (let i = s.log.length - 1; i >= 0; i--) {
    const e = s.log[i];
    if (e.t === 'begin') break;
    if (e.t === 'move') n++;
  }
  return n;
}

/** Every player move logged across the whole run — the win screen's run total. */
export function totalMoves(s: Session): number {
  return s.log.reduce((n, e) => n + (e.t === 'move' ? 1 : 0), 0);
}

/** Apply one decision. Returns false (state untouched) if it doesn't fit the stage. */
export function apply(s: Session, e: LogEntry): boolean {
  if (!step(s, e)) return false;
  s.log.push(e);
  return true;
}

/** Rebuild a session by replaying its decision log against the seed. */
export function replay(seed: number, log: LogEntry[]): Session {
  const s = newSession(seed);
  for (const e of log) {
    if (!apply(s, e)) throw new Error(`save log does not replay: ${JSON.stringify(e)}`);
  }
  return s;
}

/**
 * Rewind to the top of the current clearing's fight: drop every decision since
 * the last 'begin' and replay. Roster, trinkets, and RNG all return to exactly
 * what they were walking in — a clean second attempt, not a whole new run.
 * Returns the session unchanged if no fight has started yet.
 */
export function retryFight(s: Session): Session {
  let i = s.log.length - 1;
  while (i >= 0 && s.log[i].t !== 'begin') i--;
  if (i < 0) return s;
  return replay(s.run.seed, s.log.slice(0, i + 1)); // keep 'begin' → land straight in a fresh fight
}

function step(s: Session, e: LogEntry): boolean {
  switch (e.t) {
    case 'begin': {
      if (s.stage !== 'intro') return false;
      const built = buildFightConfig(s.run);
      s.lineup = built.lineup;
      s.fight = createFight(built.cfg, s.run.rng);
      s.resolveDue = false;
      s.stage = 'fight';
      return true;
    }
    case 'move': {
      if (s.stage !== 'fight' || !s.fight || s.resolveDue) return false;
      if (!playerMove(s.fight, e.id, e.to)) return false;
      afterAction(s);
      return true;
    }
    case 'promote': {
      if (s.stage !== 'promotion' || !s.fight) return false;
      if (!promote(s.fight, e.kind)) return false;
      s.stage = 'fight';
      afterAction(s);
      return true;
    }
    case 'resolve': {
      // due after a move — or, stalemate guard, when nobody can move at all
      if (s.stage !== 'fight' || !s.fight) return false;
      if (!s.resolveDue && playerHasMove(s.fight)) return false;
      s.resolveDue = false;
      resolveEnemyTurn(s.fight);
      settleIfEnded(s);
      return true;
    }
    case 'recruit': {
      if (s.stage !== 'post' || !s.recruitOffers?.includes(e.kind)) return false;
      recruit(s.run, e.kind);
      leavePost(s);
      return true;
    }
    case 'skip': {
      if (s.stage !== 'post') return false;
      leavePost(s);
      return true;
    }
    case 'trinket': {
      if ((s.stage !== 'found' && s.stage !== 'camp') || !s.trinketOffers.includes(e.id)) return false;
      takeTrinket(s.run, e.id);
      leaveCamp(s);
      return true;
    }
    case 'upgrade': {
      if (s.stage !== 'camp' || !s.upgradeOffers.includes(e.id)) return false;
      takeUpgrade(s.run, e.id);
      leaveCamp(s);
      return true;
    }
    case 'heal': {
      if (s.stage !== 'camp') return false;
      campHeal(s.run);
      leaveCamp(s);
      return true;
    }
    case 'snack': {
      const c = s.run.companions[e.idx];
      if (s.stage !== 'camp' || !c || isSpry(s.run, c)) return false;
      campSnack(s.run, e.idx);
      leaveCamp(s);
      return true;
    }
    case 'rest': {
      if (s.stage !== 'camp') return false;
      leaveCamp(s);
      return true;
    }
  }
}

/** Taking any one comfort leaves the campfire: clear the offers, march on. */
function leaveCamp(s: Session) {
  s.trinketOffers = [];
  s.upgradeOffers = [];
  s.stage = 'intro';
}

/** After a player move or promotion settles: promotion, end, or free move. */
function afterAction(s: Session) {
  const f = s.fight!;
  if (f.pendingPromotion != null) {
    s.stage = 'promotion';
    return;
  }
  if (settleIfEnded(s)) return;
  // Second Breakfast: a banked move keeps the player phase open
  s.resolveDue = !takeFreeMove(f);
}

/** If the fight just ended, settle the roster and move the run along. */
function settleIfEnded(s: Session): boolean {
  const f = s.fight!;
  if (f.status === 'playing') return false;
  if (f.status === 'lost') {
    s.run.status = 'lost';
    s.stage = 'over';
    return true;
  }
  // keep mid-fight evolutions, mark the captured as shaken
  const alive = new Set<number>();
  s.lineup.forEach((compIdx, j) => {
    const piece = f.pieces.find((p) => p.id === 2 + j && p.side === 'friend');
    if (piece) {
      alive.add(compIdx);
      s.run.companions[compIdx].kind = piece.kind;
    }
  });
  afterFightWon(s.run, s.lineup, alive);
  if (s.run.status === 'won') {
    s.stage = 'over';
    return true;
  }
  s.recruitOffers =
    s.run.companions.length < ROSTER_CAP && recruitDue(s.run) ? offerRecruits(s.run) : null;
  s.stage = 'post';
  return true;
}

/** After the recruit choice: a find after clearing 1, campfires when due. */
function leavePost(s: Session) {
  s.recruitOffers = null;
  if (s.run.fightIndex === 1) {
    s.trinketOffers = offerTrinkets(s.run, 2);
    if (s.trinketOffers.length) {
      s.stage = 'found';
      return;
    }
  }
  if (campDue(s.run)) {
    // Wanderer's Map lays out two wild comforts to choose between instead of one.
    s.trinketOffers = offerTrinkets(s.run, s.run.trinkets.includes('map') ? 2 : 1);
    s.upgradeOffers = offerUpgrades(s.run, 1);
    s.stage = 'camp';
    return;
  }
  s.stage = 'intro';
}
