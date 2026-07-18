/**
 * Chiptune sound effects — a tiny WebAudio synth, no assets.
 *
 * Split in two: `soundForEvent` is pure (a lookup table over FightEvent types,
 * unit-tested), and the rest is the side-effecting synth that main.ts drives.
 * Everything is scheduled with short gain envelopes so notes never click, and a
 * gentle master gain keeps the whole thing cozy rather than arcade-loud.
 */
import type { FightEvent } from './game/types';

export type SoundName =
  | 'move' // your piece settles onto a square
  | 'pop' // a bramble pops into flowers (capture / smother)
  | 'oof' // a friend gets shaken
  | 'thud' // a move blocked flat
  | 'sparkle' // something went your way (stolen tempo, rescue, a sprung trap)
  | 'fanfare' // a boss cornered
  | 'warn' // the spread clock stirs
  | 'alarm' // a thistle twisted into a gloom
  | 'ui' // picking a friend / tapping a card
  | 'win' // clearing won
  | 'lose'; // lantern out

/** Which sound a fight event makes. Pure — the whole point of the split. */
export function soundForEvent(type: FightEvent['type']): SoundName {
  switch (type) {
    case 'capture':
    case 'smothered':
      return 'pop';
    case 'shaken':
      return 'oof';
    case 'blocked':
      return 'thud';
    case 'tempo':
    case 'flee':
    case 'cloaked':
      return 'sparkle';
    case 'cornered':
      return 'fanfare';
    case 'stir':
    case 'sprouted':
      return 'warn';
    case 'twisted':
      return 'alarm';
  }
}

// ---------- the synth ----------

interface Note {
  /** frequency in Hz */
  f: number;
  /** start offset from the sound's trigger, seconds */
  t: number;
  /** duration, seconds */
  d: number;
  wave?: OscillatorType;
  /** per-note gain (0..1), before the master gain */
  g?: number;
}

// cozy pentatonic-ish set, Hz
const C4 = 262;
const E4 = 330;
const G4 = 392;
const A4 = 440;
const C5 = 523;
const E5 = 659;
const G5 = 784;
const C6 = 1047;
const E6 = 1319;
const G6 = 1568;
const A3 = 220;
const F3 = 175;

const SOUNDS: Record<SoundName, Note[]> = {
  move: [{ f: G4, t: 0, d: 0.05, wave: 'square', g: 0.16 }],
  pop: [
    { f: C6, t: 0, d: 0.045, wave: 'triangle', g: 0.3 },
    { f: G6, t: 0.035, d: 0.07, wave: 'triangle', g: 0.28 },
  ],
  oof: [
    { f: E4, t: 0, d: 0.07, wave: 'square', g: 0.2 },
    { f: A3, t: 0.06, d: 0.11, wave: 'square', g: 0.2 },
  ],
  thud: [{ f: F3, t: 0, d: 0.1, wave: 'square', g: 0.28 }],
  sparkle: [
    { f: C5, t: 0, d: 0.05, wave: 'triangle', g: 0.22 },
    { f: E5, t: 0.05, d: 0.05, wave: 'triangle', g: 0.22 },
    { f: G5, t: 0.1, d: 0.08, wave: 'triangle', g: 0.22 },
  ],
  fanfare: [
    { f: C5, t: 0, d: 0.08, wave: 'triangle', g: 0.26 },
    { f: E5, t: 0.08, d: 0.08, wave: 'triangle', g: 0.26 },
    { f: G5, t: 0.16, d: 0.08, wave: 'triangle', g: 0.26 },
    { f: C6, t: 0.24, d: 0.16, wave: 'triangle', g: 0.28 },
  ],
  warn: [
    { f: A3, t: 0, d: 0.09, wave: 'square', g: 0.16 },
    { f: A3, t: 0.13, d: 0.09, wave: 'square', g: 0.16 },
  ],
  alarm: [
    { f: E4, t: 0, d: 0.1, wave: 'sawtooth', g: 0.18 },
    { f: C4, t: 0.09, d: 0.12, wave: 'sawtooth', g: 0.18 },
    { f: A3, t: 0.18, d: 0.16, wave: 'sawtooth', g: 0.18 },
  ],
  ui: [{ f: E5, t: 0, d: 0.03, wave: 'square', g: 0.1 }],
  win: [
    { f: C5, t: 0, d: 0.09, wave: 'triangle', g: 0.24 },
    { f: E5, t: 0.09, d: 0.09, wave: 'triangle', g: 0.24 },
    { f: G5, t: 0.18, d: 0.09, wave: 'triangle', g: 0.24 },
    { f: C6, t: 0.27, d: 0.09, wave: 'triangle', g: 0.26 },
    { f: E6, t: 0.36, d: 0.09, wave: 'triangle', g: 0.26 },
    { f: G6, t: 0.45, d: 0.22, wave: 'triangle', g: 0.28 },
  ],
  lose: [
    { f: A4, t: 0, d: 0.12, wave: 'triangle', g: 0.2 },
    { f: G4, t: 0.12, d: 0.12, wave: 'triangle', g: 0.2 },
    { f: E4, t: 0.24, d: 0.12, wave: 'triangle', g: 0.2 },
    { f: C4, t: 0.36, d: 0.28, wave: 'triangle', g: 0.2 },
  ],
};

const MASTER = 0.5;
const MUTE_KEY = 'overgrown.muted.v1';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

let muted = readMuted();

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function isMuted(): boolean {
  return muted;
}

/** Flip mute, persist it, and report the new state. */
export function toggleMute(): boolean {
  muted = !muted;
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    /* private mode — mute just won't persist */
  }
  return muted;
}

/** Create/resume the context. Call from a user gesture (iOS starts suspended). */
export function unlockAudio(): void {
  const c = ensureCtx();
  if (c && c.state === 'suspended') void c.resume();
}

function ensureCtx(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor: typeof AudioContext | undefined =
    typeof window !== 'undefined'
      ? window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      : undefined;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = MASTER;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
  return ctx;
}

/** Play a named sound. No-op when muted or when WebAudio is unavailable. */
export function playSfx(name: SoundName): void {
  if (muted) return;
  const c = ensureCtx();
  if (!c || !master) return;
  if (c.state === 'suspended') void c.resume();
  const now = c.currentTime;
  for (const n of SOUNDS[name]) {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = n.wave ?? 'square';
    osc.frequency.value = n.f;
    const peak = n.g ?? 0.2;
    const start = now + n.t;
    const end = start + n.d;
    // fast attack, exponential decay — no clicks, a little chiptune "pluck"
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(g).connect(master);
    osc.start(start);
    osc.stop(end + 0.02);
  }
}
