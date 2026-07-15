import type { FightConfig, Spawn } from './fight';
import { mulberry32 } from './rng';
import type { Kind, Rng } from './types';

export interface Companion {
  kind: Kind;
  name: string;
  shaken: boolean;
  /** ate a honeycake: permanent plain one-step move */
  spry?: boolean;
}

export interface RunState {
  seed: number;
  rng: Rng;
  fightIndex: number;
  companions: Companion[];
  trinkets: TrinketId[];
  status: 'playing' | 'won' | 'lost';
}

export const ROSTER_CAP = 5;

export const KIND_INFO: Record<Kind, { title: string; blurb: string }> = {
  keeper: {
    title: 'The Keeper',
    blurb: 'One careful step in any direction. If the lantern goes out, the run is over.',
  },
  sprout: {
    title: 'Sprout',
    blurb: 'Waddles one step forward; pokes diagonally forward.',
  },
  hopper: {
    title: 'Hopper',
    blurb: 'Leaps in an L — right over anything in the way.',
  },
  slink: {
    title: 'Slink',
    blurb: 'Slips any distance diagonally.',
  },
  rumble: {
    title: 'Rumble',
    blurb: 'Barrels any distance in straight lines.',
  },
  duchess: {
    title: 'Duchess',
    blurb: 'Any direction, any distance. The meadow bows.',
  },
  thistle: {
    title: 'Thistle',
    blurb: "Shuffles one step onward; snags diagonally. It can't bite what's straight ahead — block it!",
  },
  tumbleweed: {
    title: 'Tumbleweed',
    blurb: 'Bounces in an L, right over anything.',
  },
  creeper: {
    title: 'Creeper',
    blurb: 'Slides any distance diagonally.',
  },
  golem: {
    title: 'Root Golem',
    blurb: 'Grinds any distance in straight lines.',
  },
  gloom: {
    title: 'The Gloom',
    blurb: 'Any direction, any distance. Do not let it see the Keeper.',
  },
  heart: {
    title: 'Bramble Heart',
    blurb: 'One heavy step, any direction. It can’t be caught — pen it in until it has nowhere safe to step.',
  },
};

export interface FightSpec {
  name: string;
  intro: string;
  /** overrides the default catch-them-all goal line */
  objective?: string;
  w: number;
  h: number;
  acts: number;
  enemies: Spawn[];
}

function e(kind: Kind, x: number, y: number): Spawn {
  return { kind, x, y };
}

export const FIGHTS: FightSpec[] = [
  {
    name: 'Meadow Edge',
    intro: 'Thistles in the clover. An arrow marks the one about to move — and exactly where it’s going.',
    w: 6,
    h: 6,
    acts: 1,
    enemies: [e('thistle', 1, 1), e('thistle', 4, 1), e('thistle', 2, 0)],
  },
  {
    name: 'The Warren',
    intro: 'Something out here bounces in an L shape. Right over your heads.',
    w: 6,
    h: 6,
    acts: 1,
    enemies: [e('thistle', 1, 1), e('thistle', 4, 1), e('tumbleweed', 2, 0)],
  },
  {
    name: 'Hedgerow',
    intro: 'The bramble is getting bolder — two of them move every turn now.',
    w: 7,
    h: 7,
    acts: 2,
    enemies: [e('thistle', 1, 1), e('thistle', 5, 1), e('tumbleweed', 3, 0), e('tumbleweed', 6, 0)],
  },
  {
    name: 'Bramble Gate',
    intro: 'A creeper vine. It slides diagonally as far as it likes — mind the long lanes.',
    w: 7,
    h: 7,
    acts: 2,
    enemies: [e('creeper', 3, 0), e('thistle', 1, 1), e('thistle', 5, 1), e('tumbleweed', 6, 1)],
  },
  {
    name: 'Root Cellar',
    intro: 'A root golem grinds down the straight lanes. Never stand in its row with nothing between you.',
    w: 8,
    h: 8,
    acts: 2,
    enemies: [
      e('golem', 3, 0),
      e('creeper', 1, 0),
      e('creeper', 6, 0),
      e('thistle', 2, 1),
      e('thistle', 5, 1),
    ],
  },
  {
    name: 'Gloom Hollow',
    intro: 'The Gloom itself. It goes anywhere, any distance, and three things move every turn. Deep breath.',
    w: 8,
    h: 8,
    acts: 3,
    enemies: [
      e('gloom', 4, 0),
      e('golem', 1, 0),
      e('creeper', 6, 0),
      e('thistle', 2, 1),
      e('thistle', 5, 1),
    ],
  },
  {
    name: 'The Bramble Heart',
    intro:
      'The heart of it all. It cannot be caught — no paw lands on it. Hem it in, friends covering every path, until it has nowhere safe to step.',
    objective: 'Corner the Bramble Heart — leave it nowhere safe to step.',
    w: 8,
    h: 8,
    acts: 2,
    enemies: [
      e('heart', 4, 0),
      e('golem', 1, 0),
      e('creeper', 6, 0),
      e('thistle', 2, 1),
      e('thistle', 5, 1),
    ],
  },
];

const NAMES = [
  'Pickle',
  'Clover',
  'Biscuit',
  'Maple',
  'Toast',
  'Juniper',
  'Pebble',
  'Waffle',
  'Fig',
  'Tansy',
  'Conker',
  'Nettle',
];

export function newRun(seed: number): RunState {
  return {
    seed,
    rng: mulberry32(seed),
    fightIndex: 0,
    companions: [
      { kind: 'sprout', name: 'Pickle', shaken: false },
      { kind: 'sprout', name: 'Clover', shaken: false },
      { kind: 'hopper', name: 'Biscuit', shaken: false },
    ],
    trinkets: [],
    status: 'playing',
  };
}

export function makeName(run: RunState): string {
  const taken = new Set(run.companions.map((c) => c.name));
  for (let i = 0; i < 8; i++) {
    const n = NAMES[Math.floor(run.rng() * NAMES.length)];
    if (!taken.has(n)) return n;
    if (!taken.has('Other ' + n)) return 'Other ' + n;
  }
  return 'Kid ' + Math.floor(run.rng() * 100);
}

/** Two distinct recruit offers, drawn from a pool that grows with the run. */
export function offerRecruits(run: RunState): Kind[] {
  const pool: Kind[] =
    run.fightIndex <= 1
      ? ['sprout', 'hopper']
      : run.fightIndex <= 3
        ? ['sprout', 'hopper', 'slink', 'rumble']
        : ['slink', 'rumble', 'duchess'];
  const a = pool[Math.floor(run.rng() * pool.length)];
  let b = a;
  while (b === a) b = pool[Math.floor(run.rng() * pool.length)];
  return [a, b];
}

export function recruit(run: RunState, kind: Kind) {
  run.companions.push({ kind, name: makeName(run), shaken: false });
}

// ---------- trinkets ----------

export type TrinketId = 'cloak' | 'whistle' | 'breakfast';

export const TRINKETS: Record<TrinketId, { title: string; icon: string; blurb: string }> = {
  cloak: {
    title: 'Dandelion Cloak',
    icon: '🧣',
    blurb: 'Once each clearing, a caught friend drifts safely back to your home row instead.',
  },
  whistle: {
    title: 'Acorn Whistle',
    icon: '🌰',
    blurb: 'Every Hopper can also take a plain one-step move, any direction.',
  },
  breakfast: {
    title: 'Second Breakfast',
    icon: '🥞',
    blurb: 'Your first move each clearing can be two moves.',
  },
};

/** Up to n distinct trinkets the run doesn't own yet. */
export function offerTrinkets(run: RunState, n: number): TrinketId[] {
  const pool = (Object.keys(TRINKETS) as TrinketId[]).filter((t) => !run.trinkets.includes(t));
  const out: TrinketId[] = [];
  while (out.length < n && pool.length) {
    out.push(pool.splice(Math.floor(run.rng() * pool.length), 1)[0]);
  }
  return out;
}

export function takeTrinket(run: RunState, id: TrinketId) {
  if (!run.trinkets.includes(id)) run.trinkets.push(id);
}

// ---------- camp ----------

/** Camps sit before these clearings (0-based fightIndex). */
const CAMPS = new Set([2, 4]);

export function campDue(run: RunState): boolean {
  return run.status === 'playing' && CAMPS.has(run.fightIndex);
}

/** Warm mash: every shaken friend recovers right now. */
export function campHeal(run: RunState) {
  for (const c of run.companions) c.shaken = false;
}

/** Honeycake: one companion gains a permanent plain one-step move. */
export function campSnack(run: RunState, companionIdx: number) {
  const c = run.companions[companionIdx];
  if (c) c.spry = true;
}

export interface BuiltFight {
  cfg: FightConfig;
  /** lineup[j] = index into run.companions for friend spawn j+1 (spawn 0 is the keeper) */
  lineup: number[];
}

/**
 * Keeper spawns bottom-center, active companions fan out on the row above.
 * Shaken companions sit this one out.
 */
export function buildFightConfig(run: RunState): BuiltFight {
  const spec = FIGHTS[run.fightIndex];
  const cx = Math.floor(spec.w / 2);
  const friends: Spawn[] = [{ kind: 'keeper', x: cx, y: spec.h - 1 }];
  const lineup: number[] = [];
  const offsets = [0, -1, 1, -2, 2, -3, 3];
  let slot = 0;
  run.companions.forEach((c, i) => {
    if (c.shaken || slot >= offsets.length) return;
    const x = cx + offsets[slot++];
    if (x < 0 || x >= spec.w) return;
    const whistled = run.trinkets.includes('whistle') && c.kind === 'hopper';
    friends.push({ kind: c.kind, x, y: spec.h - 2, spry: c.spry || whistled || undefined });
    lineup.push(i);
  });
  return {
    cfg: {
      name: spec.name,
      w: spec.w,
      h: spec.h,
      friends,
      enemies: spec.enemies,
      actsPerTurn: spec.acts,
      cloak: run.trinkets.includes('cloak'),
      secondBreakfast: run.trinkets.includes('breakfast'),
      whistle: run.trinkets.includes('whistle'),
    },
    lineup,
  };
}

/**
 * Settle the roster after a won fight: fielded companions who were captured
 * become shaken (sit out the next fight); everyone who sat out recovers.
 */
export function afterFightWon(run: RunState, lineup: number[], aliveCompanionIdx: Set<number>) {
  run.companions.forEach((c, i) => {
    c.shaken = lineup.includes(i) ? !aliveCompanionIdx.has(i) : false;
  });
  run.fightIndex++;
  if (run.fightIndex >= FIGHTS.length) run.status = 'won';
}
