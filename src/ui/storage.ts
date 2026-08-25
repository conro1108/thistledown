// localStorage: the save (seed + decision log), fewest-moves bests, and the
// once-ever coach bubbles.
import { apply, replay, type LogEntry, type Session } from '../game/session';
import { S, SAVE_KEY, SCORES_KEY } from './state';

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
      return { clearings, run: typeof s.run === 'number' ? s.run : undefined };
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

export function recordRun(moves: number): { best?: number; improved: boolean } {
  const scores = loadScores();
  const prev = scores.run;
  if (S.devDirty) return { best: prev, improved: false };
  const improved = prev === undefined || moves < prev;
  if (improved) {
    scores.run = moves;
    saveScores(scores);
  }
  return { best: improved ? moves : prev, improved };
}

// ---------- first-run coach: one bubble per concept, once ever ----------

const COACH_KEY = 'overgrown.coach.v1';
type CoachId = 'select' | 'arrows';
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
