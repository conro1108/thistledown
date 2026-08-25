// One turn of play: selecting and moving a friend, then the bramble's beat —
// timed, tap-to-skip steps — and turning fight events into hints, fx and sound.
import { KIND_INFO } from '../game/run';
import type { Vec } from '../game/types';
import { iconHTML } from '../render/icons';
import { playSfx, soundForEvent, type SoundName } from '../audio';
import { hintEl } from './dom';
import { refreshHud, tapHint } from './hud';
import { endOfFightUi, maybeAutoWait, promotionChoice } from './screens';
import { DEFAULT_HINT, PAUSE_MS, PLAYER_TWEEN_MS, S, SAVE_BEAT_MS, TWEEN_MS } from './state';
import { coach, doEntry } from './storage';

// ---------- selection & movement ----------

export function selectPiece(pieceId: number) {
  if (S.history || !S.fight || S.phase !== 'player' || S.fight.status !== 'playing') return;
  const p = S.fight.pieces.find((q) => q.id === pieceId);
  if (!p) return;
  S.inspect = { x: p.x, y: p.y };
  S.selected = p.side === 'friend' ? p.id : null;
  hintEl.innerHTML = tapHint(p);
  refreshHud();
}

export function attemptMove(pieceId: number, to: Vec) {
  if (!S.sess || !S.fight || S.phase !== 'player') return;
  const mover = S.fight.pieces.find((p) => p.id === pieceId);
  const from = mover ? { x: mover.x, y: mover.y } : null;
  if (!doEntry({ t: 'move', id: pieceId, to })) return;
  if (from) {
    S.tweens = [{ id: pieceId, from, to }];
    S.tweenStart = performance.now();
    S.tweenDur = PLAYER_TWEEN_MS;
  }
  S.selected = null;
  S.inspect = null;
  // a plain step gets a soft place-click; a capture speaks for itself in drainEvents
  if (!S.fight.events.some((e) => e.type === 'capture')) playSfx('move');
  drainEvents();
  refreshHud();
  proceedAfterPlayerAction();
}

/** After any player action settles: promotion first, then win/loss, then a
 * banked Second Breakfast move, then the bramble's turn. */
export function proceedAfterPlayerAction() {
  if (!S.sess || !S.fight) return;
  if (S.sess.stage === 'promotion') {
    promotionChoice();
    return;
  }
  if (S.sess.stage !== 'fight') {
    playOutcome();
    setTimeout(endOfFightUi, 650);
    return;
  }
  if (!S.sess.resolveDue) {
    hintEl.innerHTML = `Second Breakfast! ${iconHTML('pancakes')} One more move — a stretch, not a snatch.`;
    refreshHud();
    maybeAutoWait();
    return;
  }
  beginEnemyTurn();
}

// ---------- the enemy beat, and skipping it ----------

/**
 * The enemy turn plays out as timed steps. Each one is parked here as well as
 * on a timer, so a player who has already read the board can tap through it
 * instead of waiting — the "I went to grab a piece and it was too early" feel
 * was this animation holding the input lock.
 */
export let pendingBeat: (() => void) | null = null;
let beatTimer: number | null = null;

export function scheduleBeat(ms: number, step: () => void) {
  if (beatTimer != null) clearTimeout(beatTimer);
  pendingBeat = step;
  beatTimer = window.setTimeout(() => {
    beatTimer = null;
    pendingBeat = null;
    step();
  }, ms);
}

export function cancelBeat() {
  if (beatTimer != null) clearTimeout(beatTimer);
  beatTimer = null;
  pendingBeat = null;
}

/**
 * Set while skipEnemyBeat is driving the beat steps. The steps run
 * synchronously inside the very pointerdown that will overwrite the hint line
 * a moment later — so nothing shown during a skip is ever actually seen, and
 * a once-ever coach bubble must not let itself be consumed here.
 */
let skippingBeat = false;

/** Drop whatever the enemy beat is still waiting on and land on the result. */
export function skipEnemyBeat() {
  // each step can queue the next one; the chain is two long, so a small cap is
  // plenty and guarantees this can never spin
  skippingBeat = true;
  for (let i = 0; i < 4 && pendingBeat; i++) {
    const step = pendingBeat;
    if (beatTimer != null) clearTimeout(beatTimer);
    beatTimer = null;
    pendingBeat = null;
    step();
  }
  skippingBeat = false;
}

/**
 * Pause on the pre-resolve board so the player registers the threat, resolve
 * the enemy telegraphs, then tween pieces into their new squares — a
 * distinct, watchable "their turn" beat instead of an instant state swap.
 */
export function beginEnemyTurn() {
  if (!S.fight) return;
  S.phase = 'enemy';
  const snapTelegraphs = S.fight.telegraphs.map((t) => ({ ...t }));
  // "nothing will move" is its own beat: walled-off brambles, the Heart
  // digging in — or a mover you just caught. Say it out loud, don't play a
  // silent pause; a stolen turn especially deserves its fanfare.
  const anyAction = snapTelegraphs.some((t) => t.to);
  const stolen = S.tempoKind ? KIND_INFO[S.tempoKind].title : null;
  S.tempoKind = null;
  hintEl.innerHTML = stolen
    ? `You caught the ${stolen} mid-lunge! ${iconHTML('daisy')}`
    : anyAction
      ? "Watch the bramble's move…"
      : 'The bramble stirs…';
  refreshHud();

  const snapPositions = new Map<number, Vec>(
    S.fight.pieces.filter((p) => p.side === 'bramble').map((p) => [p.id, { x: p.x, y: p.y }]),
  );
  S.frozenTelegraphs = snapTelegraphs;

  scheduleBeat(PAUSE_MS, () => {
    if (!S.fight) return;
    S.blockedNote = anyAction
      ? stolen
        ? `You caught the ${stolen} mid-lunge — one less move against you!`
        : null
      : stolen
        ? `You caught the ${stolen} mid-lunge — the bramble loses its whole turn! ${iconHTML('daisy')}`
        : 'The bramble holds still — nothing moves this turn. Go!';
    S.savedBy = null; // only ever describes the turn that just resolved
    doEntry({ t: 'resolve' });
    drainEvents();

    // tween every bramble piece that actually ended up somewhere new — the
    // Heart can bolt off a null telegraph, so go by positions, not telegraphs
    S.tweens = [];
    for (const [id, from] of snapPositions) {
      const p = S.fight.pieces.find((q) => q.id === id);
      if (p && (p.x !== from.x || p.y !== from.y)) {
        S.tweens.push({ id, from, to: { x: p.x, y: p.y } });
      }
    }
    S.tweenStart = performance.now();
    S.tweenDur = TWEEN_MS;
    refreshHud();

    // a save gets its own beat: the burst, the drift and the badge pulse all
    // need a moment to land before the board goes back to waiting on you
    scheduleBeat(S.savedBy ? SAVE_BEAT_MS : S.tweens.length ? TWEEN_MS : 60, () => {
      S.tweens = [];
      S.frozenTelegraphs = null;
      S.phase = 'player';
      // the first enemy turn anyone ever watches earns the telegraph bubble —
      // unless something louder (a block, a save) already needs the line, or a
      // tap-to-skip is running this beat (the bubble would flash for zero
      // frames and be gone forever — hold it for the next enemy turn instead)
      if (S.fight!.status === 'playing')
        hintEl.innerHTML =
          S.blockedNote ??
          (skippingBeat
            ? null
            : coach(
                'arrows',
                'Every arrow is a promise: that creature moves exactly there next turn. Step clear, block the path — or catch it first!',
              )) ??
          DEFAULT_HINT;
      refreshHud();
      if (S.fight!.status !== 'playing') {
        playOutcome();
        setTimeout(endOfFightUi, 350);
      } else maybeAutoWait();
    });
  });
}

/** The outcome jingle, once, when a fight settles into won/lost. */
function playOutcome() {
  if (S.fight?.status === 'won') playSfx('win');
  else if (S.fight?.status === 'lost') playSfx('lose');
}

/**
 * How loudly each enemy-turn note deserves the single hint line when several
 * events land at once. A trinket save (Ward/Cloak) tops it: it's the one that
 * explains why a telegraphed capture didn't happen. Loss/threat escalation next,
 * then your own tactics, then ambient spread chatter.
 */
const NOTE_PRI = {
  saved: 6, // Ward / Cloak turned a capture aside — the confusing one to miss
  twisted: 5, // a Thistle promoted to a Gloom: a new danger you must see
  blocked: 4, // you walled a mover — the block tactic, kept loud
  smothered: 4, // you stamped out a sprout
  shielded: 4, // your check landed and a guard had to answer it — the forcing-move lesson
  flee: 3, // the Heart bolted from your net
  sprouted: 2, // a fresh Thistle broke soil
  stir: 1, // the spread clock ticked
} as const;

export function drainEvents() {
  if (!S.fight) return;
  // one sound per distinct kind this drain — a triple capture shouldn't triple-pop
  const sounds = new Set<SoundName>();
  for (const ev of S.fight.events) sounds.add(soundForEvent(ev.type));
  for (const s of sounds) playSfx(s);
  // Several notable things can share one enemy turn (a Ward shrugging off a bite
  // AND the Heart fleeing, say), but blockedNote is a single line. Surface the
  // loudest by priority instead of letting whichever event drained last win — a
  // trinket that just saved your piece explains an otherwise baffling "it didn't
  // take me," and must never be buried under a lesser note.
  let notePri = -1;
  const note = (pri: number, text: string) => {
    if (pri > notePri) {
      notePri = pri;
      S.blockedNote = text;
    }
  };
  for (const ev of S.fight.events) {
    if (ev.type === 'blocked') {
      S.fx.push({ at: ev.at, kind: 'bonk', t: 0 });
      note(
        NOTE_PRI.blocked,
        ev.kind === 'heart'
          ? 'The Bramble Heart balks — it won’t step where you’re watching!'
          : `You blocked the ${KIND_INFO[ev.kind].title}! It grumbles and stays put.`,
      );
    } else if (ev.type === 'tempo') {
      S.fx.push({ at: ev.at, kind: 'bonk', t: 0 });
      S.tempoKind = ev.kind;
    } else if (ev.type === 'shielded') {
      S.fx.push({ at: ev.at, kind: 'bonk', t: 0 });
      note(
        NOTE_PRI.shielded,
        `The Bramble Heart has nowhere to run — the ${KIND_INFO[ev.kind].title} throws itself in the way!`,
      );
    } else if (ev.type === 'flee') {
      S.fx.push({ at: ev.at, kind: 'shaken', t: 0 });
      note(NOTE_PRI.flee, 'Your trap springs — the Bramble Heart scrambles for safety!');
    } else if (ev.type === 'cornered') {
      S.fx.push({ at: ev.at, kind: 'poof', t: 0 });
    } else if (ev.type === 'stir') {
      note(NOTE_PRI.stir, 'The soil stirs — the bramble is spreading! Stand on the marked square to smother it.');
    } else if (ev.type === 'sprouted') {
      S.fx.push({ at: ev.at, kind: 'shaken', t: 0 });
      note(NOTE_PRI.sprouted, 'A fresh Thistle pushes up through the soil. The bramble won’t wait forever.');
    } else if (ev.type === 'twisted') {
      S.fx.push({ at: ev.at, kind: 'shaken', t: 0 });
      note(NOTE_PRI.twisted, 'The Thistle reaches your hedge and twists into a Gloom! Never let one walk the whole meadow.');
    } else if (ev.type === 'smothered') {
      S.fx.push({ at: ev.at, kind: 'bonk', t: 0 });
      note(NOTE_PRI.smothered, `Smothered underfoot — nothing grows there today! ${iconHTML('daisy')}`);
    } else if (ev.type === 'cloaked') {
      S.fx.push({ at: ev.at, kind: 'cloak', t: 0, to: ev.to });
      S.savedBy = 'cloak';
      S.savedAt = performance.now();
      note(
        NOTE_PRI.saved,
        `The Dandelion Cloak whisks ${
          ev.kind === 'keeper' ? 'the Keeper' : `the ${KIND_INFO[ev.kind].title}`
        } safely home! ${iconHTML('cloak')}`,
      );
    } else if (ev.type === 'warded') {
      S.fx.push({ at: ev.at, kind: 'ward', t: 0 });
      S.savedBy = 'ward';
      S.savedAt = performance.now();
      note(
        NOTE_PRI.saved,
        `The Bramble Ward turns the blow aside — ${
          ev.kind === 'keeper' ? 'the Keeper' : `your ${KIND_INFO[ev.kind].title}`
        } stands unshaken! ${iconHTML('leaf')}`,
      );
    } else {
      S.fx.push({ at: ev.at, kind: ev.type === 'capture' ? 'poof' : 'shaken', t: 0 });
    }
  }
  S.fight.events = [];
}
