// localStorage: the save (seed + decision log), fewest-moves bests, and the
// once-ever coach bubbles.
import type { FightSpec } from '../game/ladder';
import type { RunState } from '../game/run';
import { apply, replay, type LogEntry, type Session } from '../game/session';
import type { Kind } from '../game/types';
import { JOURNAL_KEY, S, SAVE_KEY, SCORES_KEY } from './state';

// ---------- session & save ----------

/** Apply a decision to the session and keep the save current. */
export function doEntry(e: LogEntry): boolean {
  if (!S.sess) return false;
  if (!apply(S.sess, e)) return false;
  S.run = S.sess.run;
  S.fight = S.sess.fight;
  persist();
  return true;
}

export function persist() {
  if (!S.sess || S.devDirty) return; // a hand-tuned log wouldn't replay
  try {
    if (S.sess.stage === 'over') localStorage.removeItem(SAVE_KEY);
    else localStorage.setItem(SAVE_KEY, JSON.stringify({ seed: S.sess.run.seed, log: S.sess.log }));
  } catch {
    /* storage full or blocked — the run just won't save */
  }
}

/** Rebuild the saved session, or null if there isn't one (or it won't replay). */
export function loadSave(): Session | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as { seed: number; log: LogEntry[] };
    if (typeof data.seed !== 'number' || !Array.isArray(data.log)) throw new Error('bad save');
    const s = replay(data.seed, data.log);
    return s.stage === 'over' ? null : s;
  } catch {
    localStorage.removeItem(SAVE_KEY);
    return null;
  }
}

// ---------- hiscores: fewest moves, per clearing and per whole run ----------

/** Personal bests, persisted across runs: fewest moves to clear each named
 * clearing, and fewest total moves to win a whole run. */
interface Scores {
  clearings: Record<string, number>;
  run?: number;
  /** fewest moves for a run that went all the way to the bottom */
  deep?: number;
}

export function loadScores(): Scores {
  try {
    const raw = localStorage.getItem(SCORES_KEY);
    const s = raw ? (JSON.parse(raw) as Partial<Scores>) : null;
    if (s && typeof s === 'object') {
      // only ever trust numbers out of storage: a tampered string here would
      // both render as markup on the title card and quietly break the
      // `moves < prev` record comparisons
      const clearings = Object.fromEntries(
        Object.entries(s.clearings ?? {}).filter(([, v]) => typeof v === 'number'),
      );
      return {
        clearings,
        run: typeof s.run === 'number' ? s.run : undefined,
        deep: typeof s.deep === 'number' ? s.deep : undefined,
      };
    }
  } catch {
    /* corrupt or blocked — start the board fresh */
  }
  return { clearings: {} };
}

function saveScores(s: Scores) {
  try {
    localStorage.setItem(SCORES_KEY, JSON.stringify(s));
  } catch {
    /* fine — the record just won't persist */
  }
}

/**
 * Fold a result into the saved bests. Returns the best now on file and whether
 * this run just set it. Hand-tuned (dev-dirty) sessions never touch the board —
 * a record you dialed up in the dev panel isn't a record.
 */
export function recordClearing(name: string, moves: number): { best?: number; improved: boolean } {
  const scores = loadScores();
  const prev = scores.clearings[name];
  if (S.devDirty) return { best: prev, improved: false };
  const improved = prev === undefined || moves < prev;
  if (improved) {
    scores.clearings[name] = moves;
    saveScores(scores);
  }
  return { best: improved ? moves : prev, improved };
}

export function recordRun(moves: number, deep: boolean): { best?: number; improved: boolean } {
  const scores = loadScores();
  const key = deep ? 'deep' : 'run';
  const prev = scores[key];
  if (S.devDirty) return { best: prev, improved: false };
  const improved = prev === undefined || moves < prev;
  if (improved) {
    scores[key] = moves;
    saveScores(scores);
  }
  return { best: improved ? moves : prev, improved };
}

// ---------- first-run coach: one bubble per concept, once ever ----------

const COACH_KEY = 'overgrown.coach.v1';
type CoachId = 'select' | 'arrows' | 'tap';
let coachSeen: Record<string, boolean> = {};
try {
  const parsed = JSON.parse(localStorage.getItem(COACH_KEY) ?? '{}');
  // a valid-JSON primitive under the key would make the assignment in coach()
  // throw on every friend tap — only ever accept an object
  if (parsed && typeof parsed === 'object') coachSeen = parsed;
} catch {
  /* corrupt — the coach just starts over */
}

/**
 * The line for a concept the player is meeting right now, or null if they've
 * met it before. Consuming it marks it seen forever (across runs — per
 * DESIGN.md the budget is one speech bubble per concept, ever).
 */
export function coach(id: CoachId, text: string): string | null {
  if (coachSeen[id]) return null;
  coachSeen[id] = true;
  try {
    localStorage.setItem(COACH_KEY, JSON.stringify(coachSeen));
  } catch {
    /* fine — they'll meet the bubble again next visit */
  }
  return text;
}

// ---------- the journal: what the Keeper has seen, across every run ----------

/**
 * The one thing that survives a lost run. Creatures met, friends fielded, how
 * deep the path has gone — so a loss on clearing 7 still leaves the player
 * with something (three new creatures, a deepest-yet) instead of nothing, and
 * the title screen shows a meadow slowly filling in rather than a blank card.
 *
 * Firsts are stamped with the run they happened on (`runs` at the time), so
 * "met this run" and "deepest yet" survive a reload and never re-fire on a
 * retry of the same clearing.
 */
export interface Journal {
  /** bramble kind → the run it was first met on */
  metOn: Partial<Record<Kind, number>>;
  /** friend kinds ever fielded */
  friends: Kind[];
  /** furthest clearing ever entered (fight index), or -1, and the run that set it */
  deepest: number;
  deepestOn: number;
  runs: number;
  wins: number;
  /** wins that carried on past the Bramble Heart to the very bottom */
  deepWins: number;
}

export function loadJournal(): Journal {
  const blank: Journal = { metOn: {}, friends: [], deepest: -1, deepestOn: 0, runs: 0, wins: 0, deepWins: 0 };
  try {
    const raw = localStorage.getItem(JOURNAL_KEY);
    const j = raw ? (JSON.parse(raw) as Partial<Journal>) : null;
    if (j && typeof j === 'object') {
      const num = (v: unknown, d: number) => (typeof v === 'number' ? v : d);
      const metOn: Journal['metOn'] = {};
      if (j.metOn && typeof j.metOn === 'object')
        for (const [k, v] of Object.entries(j.metOn)) if (typeof v === 'number') metOn[k as Kind] = v;
      return {
        metOn,
        friends: (Array.isArray(j.friends) ? j.friends.filter((k) => typeof k === 'string') : []) as Kind[],
        deepest: num(j.deepest, -1),
        deepestOn: num(j.deepestOn, 0),
        runs: num(j.runs, 0),
        wins: num(j.wins, 0),
        deepWins: num(j.deepWins, 0),
      };
    }
  } catch {
    /* corrupt or blocked — a fresh journal */
  }
  return blank;
}

function saveJournal(j: Journal) {
  try {
    localStorage.setItem(JOURNAL_KEY, JSON.stringify(j));
  } catch {
    /* fine — the journal just won't persist */
  }
}

export const met = (j: Journal, kind: Kind) => j.metOn[kind] !== undefined;
/** Creatures first met on the run in progress (the latest one). */
export const metThisRun = (j: Journal): Kind[] =>
  (Object.keys(j.metOn) as Kind[]).filter((k) => j.metOn[k] === j.runs);
export const deepestIsThisRun = (j: Journal) => j.deepest >= 0 && j.deepestOn === j.runs && j.runs > 1;

/** A run counts once it's actually walked into its first clearing. */
export function noteRunStart() {
  if (S.devDirty) return;
  const j = loadJournal();
  j.runs++;
  saveJournal(j);
}

/** Walking into a clearing: log who's there and how far this is. */
export function noteFight(run: RunState, spec: FightSpec) {
  if (S.devDirty) return; // a hand-jumped run isn't a memory
  const j = loadJournal();
  for (const e of spec.enemies) if (!met(j, e.kind)) j.metOn[e.kind] = j.runs;
  for (const k of ['keeper' as Kind, ...run.companions.map((c) => c.kind)]) {
    if (!j.friends.includes(k)) j.friends.push(k);
  }
  if (run.fightIndex > j.deepest) {
    j.deepest = run.fightIndex;
    j.deepestOn = j.runs;
  }
  saveJournal(j);
}

export function noteRunWon(deep: boolean) {
  if (S.devDirty) return;
  const j = loadJournal();
  j.wins++;
  if (deep) j.deepWins++;
  saveJournal(j);
}
