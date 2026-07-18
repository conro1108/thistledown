import { threatsFor } from './board';
import type { FightConfig, Spawn } from './fight';
import { mulberry32 } from './rng';
import type { AiDials, FightState, Kind, Piece, Rng, SpreadConfig } from './types';

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
  /** this run's ladder, rolled off the seed at newRun (see generateFights) */
  fights: FightSpec[];
  companions: Companion[];
  trinkets: TrinketId[];
  status: 'playing' | 'won' | 'lost';
  /**
   * Dev-only master difficulty knob: one number that scales every clearing's
   * authored bramble smarts instead of hand-tuning dials fight by fight. 1 (or
   * undefined) plays the ladder as authored; 0 makes the whole run naive; 2
   * maxes it out. Set from the dev panel; a set value marks the session dirty.
   */
  difficulty?: number;
}

export const ROSTER_CAP = 6;

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

/** One bramble creature in a fight spec, with its temperament. */
export interface EnemySpec {
  kind: Kind;
  fickle?: boolean;
  veiled?: boolean;
}

export interface FightSpec {
  name: string;
  intro: string;
  /** overrides the default catch-them-all goal line */
  objective?: string;
  w: number;
  h: number;
  acts: number;
  /** who appears — buildFightConfig rolls their actual squares fresh each run */
  enemies: EnemySpec[];
  /** how sharply the bramble plays here — omitted means naive (region 1 default) */
  dials?: Partial<AiDials>;
  /** the anti-stall reinforcement clock */
  spread?: SpreadConfig;
}

// ---------- the ladder: 4 regions × 4 clearings ----------

export const REGION_NAMES = ['The Meadow', 'The Thicket', 'The Tanglewood', 'The Deep Bramble', 'The Rotwood', 'The Worldroot'];
export const FIGHTS_PER_REGION = 4;

export function regionOf(fightIndex: number): number {
  return Math.min(REGION_NAMES.length - 1, Math.floor(fightIndex / FIGHTS_PER_REGION));
}

/**
 * A fight template: the authored part (the lesson — board, tempo, dials, and
 * the `core` enemies that ARE the lesson) plus a points `budget` of extra
 * bramble rolled fresh per run from `pool`. Costs are piece values, so the
 * threat level of a clearing holds steady while its shape varies run to run.
 */
interface FightTemplate extends Omit<FightSpec, 'enemies'> {
  core: EnemySpec[];
  budget: number;
  pool?: Kind[];
  /** chance a rolled extra comes out fickle / shrouded (region spice) */
  fickleChance?: number;
  veiledChance?: number;
}

const COST: Partial<Record<Kind, number>> = {
  thistle: 1,
  tumbleweed: 3,
  creeper: 3,
  golem: 5,
  gloom: 9,
};

const CORNER_HEART = 'Corner it — leave it nowhere safe to step.';

const TEMPLATES: FightTemplate[] = [
  // -------- The Meadow: a naive-ish bramble, one lesson each — fickle double-arrows creep in by fight 3 --------
  {
    name: 'Meadow Edge',
    intro: 'Thistles in the clover. An arrow marks the one about to move — and exactly where it’s going.',
    w: 6,
    h: 6,
    acts: 1,
    spread: { after: 12, every: 3, cap: 5 },
    core: [{ kind: 'thistle' }, { kind: 'thistle' }, { kind: 'thistle' }],
    budget: 1,
    pool: ['thistle'],
  },
  {
    name: 'The Warren',
    intro: 'Something out here bounces in an L shape. Right over your heads.',
    w: 6,
    h: 6,
    acts: 1,
    spread: { after: 12, every: 3, cap: 5 },
    core: [{ kind: 'thistle' }, { kind: 'thistle' }, { kind: 'tumbleweed' }],
    budget: 2,
    pool: ['thistle'],
    dials: { foresight: 0.1, caution: 0.1 },
  },
  {
    name: 'Hedgerow',
    intro:
      'The bramble is getting bolder — two of them move every turn now, and that one shows two arrows at once. It means both, and takes whichever looks tastier.',
    w: 7,
    h: 7,
    acts: 2,
    spread: { after: 10, every: 3, cap: 6 },
    core: [{ kind: 'thistle' }, { kind: 'tumbleweed' }, { kind: 'tumbleweed', fickle: true }],
    budget: 3,
    pool: ['thistle'],
    fickleChance: 0.4,
    dials: { foresight: 0.3, caution: 0.3 },
  },
  {
    name: 'The Heart Sapling',
    intro:
      'A young heart of the bramble, still soft. No paw can land on it — hem it in, friends covering every path, until it has nowhere safe to step.',
    objective: CORNER_HEART,
    w: 7,
    h: 7,
    acts: 2,
    spread: { after: 9, every: 3, cap: 6 },
    core: [{ kind: 'heart' }, { kind: 'thistle' }, { kind: 'thistle' }, { kind: 'tumbleweed' }],
    budget: 1,
    pool: ['thistle'],
    fickleChance: 0.4,
    dials: { foresight: 0.4, caution: 0.4 },
  },
  // -------- The Thicket: sliders everywhere, and fickle arrows in full swing --------
  {
    name: 'Bramble Gate',
    intro:
      'The Thicket closes in overhead. A creeper vine slides diagonally as far as it likes — mind the long lanes.',
    w: 7,
    h: 7,
    acts: 2,
    spread: { after: 10, every: 3, cap: 6 },
    core: [{ kind: 'creeper' }, { kind: 'thistle' }, { kind: 'thistle' }],
    budget: 3,
    pool: ['thistle', 'tumbleweed'],
    fickleChance: 0.4,
    dials: { foresight: 0.5, caution: 0.4 },
  },
  {
    name: 'Fickleweed Field',
    intro:
      'Fickle things grow here — two arrows each. They mean both, and take whichever looks tastier when they move. Plan for either.',
    w: 7,
    h: 7,
    acts: 2,
    spread: { after: 10, every: 3, cap: 6 },
    core: [{ kind: 'tumbleweed', fickle: true }, { kind: 'creeper', fickle: true }, { kind: 'thistle' }],
    budget: 3,
    pool: ['thistle', 'tumbleweed'],
    fickleChance: 0.7,
    dials: { foresight: 0.5, caution: 0.5 },
  },
  {
    name: 'Root Cellar',
    intro: 'A root golem grinds down the straight lanes. Never stand in its row with nothing between you.',
    w: 8,
    h: 8,
    acts: 2,
    spread: { after: 10, every: 3, cap: 7 },
    core: [{ kind: 'golem' }, { kind: 'creeper' }, { kind: 'thistle' }, { kind: 'thistle' }],
    budget: 4,
    pool: ['thistle', 'tumbleweed'],
    fickleChance: 0.6,
    dials: { foresight: 0.6, caution: 0.5 },
  },
  {
    name: 'Gloom Hollow',
    intro: 'The Gloom itself — anywhere, any distance. Do not let it see the Keeper.',
    w: 8,
    h: 8,
    acts: 2,
    spread: { after: 10, every: 3, cap: 7 },
    core: [{ kind: 'gloom' }, { kind: 'golem' }, { kind: 'thistle' }, { kind: 'thistle' }],
    budget: 4,
    pool: ['thistle', 'tumbleweed', 'creeper'],
    fickleChance: 0.6,
    dials: { foresight: 0.7, caution: 0.6 },
  },
  // -------- The Tanglewood: shrouded intent — read reaches, not arrows --------
  {
    name: 'Duskmoss',
    intro:
      'The Tanglewood, where the gloom pools. Shrouded things live here — no arrows, no promises. Tap any creature to light up everywhere it could strike.',
    w: 8,
    h: 8,
    acts: 2,
    spread: { after: 10, every: 3, cap: 7 },
    core: [
      { kind: 'creeper', veiled: true },
      { kind: 'tumbleweed', veiled: true },
      { kind: 'thistle' },
      { kind: 'thistle' },
    ],
    budget: 3,
    pool: ['thistle', 'tumbleweed'],
    fickleChance: 0.4,
    dials: { foresight: 0.7, caution: 0.6 },
  },
  {
    name: 'The Old Wall',
    intro:
      'Root golems built this wall, and shrouded ones still patrol it. The straight lanes are never safe — check them square by square.',
    w: 8,
    h: 8,
    acts: 2,
    spread: { after: 11, every: 3, cap: 8 },
    core: [{ kind: 'golem', veiled: true }, { kind: 'golem' }, { kind: 'thistle' }, { kind: 'thistle' }],
    budget: 4,
    pool: ['thistle', 'tumbleweed', 'creeper'],
    fickleChance: 0.4,
    veiledChance: 0.3,
    dials: { foresight: 0.8, caution: 0.7 },
  },
  {
    name: 'Tangle Deep',
    intro: 'Three of them move every turn now. Breathe. Count the arrows twice.',
    w: 8,
    h: 8,
    acts: 3,
    spread: { after: 10, every: 3, cap: 8 },
    core: [{ kind: 'golem' }, { kind: 'creeper' }, { kind: 'tumbleweed' }],
    budget: 5,
    pool: ['thistle', 'tumbleweed', 'creeper'],
    fickleChance: 0.5,
    veiledChance: 0.3,
    dials: { foresight: 0.9, caution: 0.8 },
  },
  {
    name: 'The Thorned Heart',
    intro:
      'An old heart, grown crooked and mean, with guards who answer when you press it. Cover its guards as well as its ground — a net with a loose knot is no net.',
    objective: CORNER_HEART,
    w: 8,
    h: 8,
    acts: 2,
    spread: { after: 10, every: 3, cap: 8 },
    core: [
      { kind: 'heart' },
      { kind: 'golem' },
      { kind: 'creeper', veiled: true },
      { kind: 'thistle', fickle: true },
      { kind: 'thistle' },
    ],
    budget: 2,
    pool: ['thistle'],
    fickleChance: 0.4,
    dials: { foresight: 0.9, caution: 0.8 },
  },
  // -------- The Deep Bramble: everything at once, no mercy left --------
  {
    name: 'Gloaming Field',
    intro: 'The Deep Bramble. A gloom hunts here unseen — no arrow will warn you. Check every lane before you stand in it.',
    w: 8,
    h: 8,
    acts: 2,
    spread: { after: 10, every: 3, cap: 8 },
    core: [{ kind: 'gloom', veiled: true }, { kind: 'creeper' }, { kind: 'thistle' }, { kind: 'thistle' }],
    budget: 4,
    pool: ['thistle', 'tumbleweed', 'creeper'],
    fickleChance: 0.4,
    veiledChance: 0.4,
    dials: { foresight: 0.9, caution: 0.8 },
  },
  {
    name: 'The Choir of Roots',
    intro: 'The old roots sing to each other down the lanes. Three move every turn, and some of them are lying.',
    w: 8,
    h: 8,
    acts: 3,
    spread: { after: 10, every: 3, cap: 8 },
    core: [{ kind: 'golem' }, { kind: 'golem', veiled: true }, { kind: 'creeper', fickle: true }],
    budget: 5,
    pool: ['thistle', 'tumbleweed', 'creeper'],
    fickleChance: 0.5,
    veiledChance: 0.3,
    dials: { foresight: 1, caution: 0.9 },
  },
  {
    name: 'Thornfall',
    intro: 'The last slope before the heart of it all. Everything the bramble ever learned is on this hill.',
    w: 8,
    h: 8,
    acts: 3,
    spread: { after: 10, every: 3, cap: 9 },
    core: [{ kind: 'gloom' }, { kind: 'golem' }, { kind: 'tumbleweed', veiled: true }, { kind: 'thistle' }],
    budget: 5,
    pool: ['thistle', 'tumbleweed', 'creeper'],
    fickleChance: 0.5,
    veiledChance: 0.3,
    dials: { foresight: 1, caution: 0.9 },
  },
  {
    name: 'The Bramble Heart',
    intro:
      'The heart of the Deep Bramble. It cannot be caught — no paw lands on it — and its guards will throw themselves into your net to save it. Cover everything. Leave it nothing. (You will learn it was not the last of them.)',
    objective: CORNER_HEART,
    w: 8,
    h: 8,
    acts: 3,
    spread: { after: 10, every: 3, cap: 9 },
    core: [
      { kind: 'heart' },
      { kind: 'golem' },
      { kind: 'creeper', veiled: true },
      { kind: 'thistle', fickle: true },
      { kind: 'thistle' },
    ],
    budget: 3,
    pool: ['thistle', 'tumbleweed'],
    fickleChance: 0.4,
    dials: { foresight: 1, caution: 1 },
  },
  // -------- The Rotwood: past the Heart, the wood has rotted mean. Three move every turn as a rule, most of them shrouded — read reaches, not arrows. --------
  {
    name: 'Witherreach',
    intro:
      'You thought the Heart was the end. The Rotwood begins where its roots rot. Three things move every turn here, and most keep their intent to themselves — tap and read every reach before you step.',
    w: 8,
    h: 8,
    acts: 3,
    spread: { after: 9, every: 3, cap: 9 },
    core: [
      { kind: 'golem', veiled: true },
      { kind: 'creeper', veiled: true },
      { kind: 'tumbleweed' },
      { kind: 'thistle' },
    ],
    budget: 5,
    pool: ['thistle', 'tumbleweed', 'creeper'],
    fickleChance: 0.5,
    veiledChance: 0.5,
    dials: { foresight: 1, caution: 1 },
  },
  {
    name: 'The Choking Vines',
    intro:
      'Creepers and golems knot every lane at once. Some are lying about where they go; none of them will show you at all. Count the long lines twice, then once more.',
    w: 8,
    h: 8,
    acts: 3,
    spread: { after: 9, every: 3, cap: 9 },
    core: [
      { kind: 'golem', veiled: true },
      { kind: 'creeper', veiled: true },
      { kind: 'creeper', fickle: true },
      { kind: 'thistle' },
    ],
    budget: 6,
    pool: ['thistle', 'tumbleweed', 'creeper'],
    fickleChance: 0.5,
    veiledChance: 0.5,
    dials: { foresight: 1, caution: 1 },
  },
  {
    name: 'Blightmaw',
    intro:
      'Two Glooms breathe in the Rotwood — each one reaches anywhere, any distance, and neither will warn you. Keep the Keeper off every open line. There is no safe square, only the ones you have checked.',
    w: 8,
    h: 8,
    acts: 3,
    spread: { after: 9, every: 3, cap: 9 },
    core: [
      { kind: 'gloom', veiled: true },
      { kind: 'gloom' },
      { kind: 'golem' },
      { kind: 'thistle' },
    ],
    budget: 4,
    pool: ['thistle', 'tumbleweed', 'creeper'],
    fickleChance: 0.5,
    veiledChance: 0.4,
    dials: { foresight: 1, caution: 1 },
  },
  {
    name: 'The Rotting Heart',
    intro:
      'A Gloom coils around this Heart like a second skin, and the whole clearing is shrouded. Corner the Heart — but do not let the Gloom take the Keeper while you do. Cover the guards, cover the lanes, leave the Heart nowhere.',
    objective: CORNER_HEART,
    w: 8,
    h: 8,
    acts: 3,
    spread: { after: 9, every: 3, cap: 9 },
    core: [
      { kind: 'heart' },
      { kind: 'gloom', veiled: true },
      { kind: 'golem' },
      { kind: 'creeper', veiled: true },
      { kind: 'thistle', fickle: true },
    ],
    budget: 2,
    pool: ['thistle', 'tumbleweed'],
    fickleChance: 0.4,
    veiledChance: 0.4,
    dials: { foresight: 1, caution: 1 },
  },
  // -------- The Worldroot: the true bottom. Four move every turn, glooms in the dark, nothing telegraphed. Everything the bramble ever was, and then the last Heart. --------
  {
    name: 'The Deepdark',
    intro:
      'Down past the Rotwood, where light never reached. Four things move every turn now, and the dark hides all of them. Slow down. Read every reach. One miss is the whole run.',
    w: 8,
    h: 8,
    acts: 4,
    spread: { after: 8, every: 3, cap: 10 },
    core: [
      { kind: 'gloom', veiled: true },
      { kind: 'golem', veiled: true },
      { kind: 'creeper', veiled: true },
      { kind: 'tumbleweed' },
    ],
    budget: 5,
    pool: ['thistle', 'tumbleweed', 'creeper'],
    fickleChance: 0.5,
    veiledChance: 0.6,
    dials: { foresight: 1, caution: 1 },
  },
  {
    name: 'Gallowsroot',
    intro:
      'The old root-golems hang here in the dark, and they still grind the lanes. Four move a turn, most of them shrouded, and every straight line is a threat until you have cleared it square by square.',
    w: 8,
    h: 8,
    acts: 4,
    spread: { after: 8, every: 3, cap: 10 },
    core: [
      { kind: 'golem', veiled: true },
      { kind: 'golem', veiled: true },
      { kind: 'gloom' },
      { kind: 'creeper' },
    ],
    budget: 6,
    pool: ['thistle', 'tumbleweed', 'creeper'],
    fickleChance: 0.5,
    veiledChance: 0.5,
    dials: { foresight: 1, caution: 1 },
  },
  {
    name: 'The Last Lanes',
    intro:
      'Everything the bramble ever learned, all at once, in the dark. Two Glooms, golems, creepers — four move every turn and not one will show its hand. This is the door to the bottom.',
    w: 8,
    h: 8,
    acts: 4,
    spread: { after: 8, every: 3, cap: 10 },
    core: [
      { kind: 'gloom', veiled: true },
      { kind: 'gloom', veiled: true },
      { kind: 'golem' },
      { kind: 'creeper' },
    ],
    budget: 5,
    pool: ['thistle', 'tumbleweed', 'creeper'],
    fickleChance: 0.5,
    veiledChance: 0.5,
    dials: { foresight: 1, caution: 1 },
  },
  {
    name: 'The Worldheart',
    intro:
      'The last Heart, at the bottom of everything, ringed by Glooms that will die to keep it. Four move every turn, all of them shrouded. Corner it. Leave it one square less than nothing. Then the wood is yours.',
    objective: CORNER_HEART,
    w: 8,
    h: 8,
    acts: 4,
    spread: { after: 8, every: 3, cap: 10 },
    core: [
      { kind: 'heart' },
      { kind: 'gloom', veiled: true },
      { kind: 'gloom', veiled: true },
      { kind: 'golem', veiled: true },
      { kind: 'creeper' },
      { kind: 'thistle', fickle: true },
    ],
    budget: 2,
    pool: ['thistle', 'tumbleweed'],
    fickleChance: 0.4,
    veiledChance: 0.5,
    dials: { foresight: 1, caution: 1 },
  },
];

/**
 * Roll the run's ladder off its own RNG stream (not the decision-log one, so
 * play choices never shift what the meadow contains). Same seed, same ladder —
 * daily seeds and mid-run saves both lean on this.
 */
export function generateFights(seed: number): FightSpec[] {
  const rng = mulberry32((seed ^ 0x5eed1e7) >>> 0);
  return TEMPLATES.map((t) => {
    const { core, budget, pool, fickleChance, veiledChance, ...spec } = t;
    const enemies = core.map((e) => ({ ...e }));
    let left = budget;
    for (;;) {
      const afford = (pool ?? []).filter((k) => (COST[k] ?? Infinity) <= left);
      if (!afford.length) break;
      const kind = afford[Math.floor(rng() * afford.length)];
      const e: EnemySpec = { kind };
      if (fickleChance && rng() < fickleChance) e.fickle = true;
      else if (veiledChance && rng() < veiledChance) e.veiled = true;
      enemies.push(e);
      left -= COST[kind]!;
    }
    return { ...spec, enemies };
  });
}

/**
 * Bend a clearing's authored dials by the run's master difficulty. Only the two
 * "how sharply it plays" dials (foresight, caution) scale — bloodlust and
 * temperature aren't per-fight difficulty knobs, so they pass through. `factor`
 * of 1 is a no-op; 0 flattens smarts to naive; >1 sharpens, clamped to 1.
 */
export function scaleDials(
  dials: Partial<AiDials> | undefined,
  factor: number,
): Partial<AiDials> | undefined {
  if (factor === 1 || dials === undefined) return dials;
  const out: Partial<AiDials> = { ...dials };
  if (out.foresight !== undefined) out.foresight = Math.min(1, out.foresight * factor);
  if (out.caution !== undefined) out.caution = Math.min(1, out.caution * factor);
  return out;
}

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
    fights: generateFights(seed),
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

/** Two distinct recruit offers, drawn from a pool that grows region by region. */
export function offerRecruits(run: RunState): Kind[] {
  const r = regionOf(run.fightIndex);
  const pool: Kind[] =
    run.fightIndex <= 1
      ? ['sprout', 'hopper']
      : r === 0
        ? ['sprout', 'hopper', 'slink', 'rumble']
        : r === 1
          ? ['hopper', 'slink', 'rumble']
          : r === 2
            ? ['slink', 'rumble']
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

export const TRINKETS: Record<TrinketId, { title: string; blurb: string }> = {
  cloak: {
    title: 'Dandelion Cloak',
    blurb: 'Once each clearing, a caught friend (never the Keeper) drifts safely back to your home row instead.',
  },
  whistle: {
    title: 'Acorn Whistle',
    blurb: 'Every Hopper can also take a plain one-step move, any direction.',
  },
  breakfast: {
    title: 'Second Breakfast',
    blurb: 'Once each clearing, your first move comes with a second helping — an extra move that can’t snatch anything.',
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

/** Camps sit before each region's boss — the last clearing of every region. */
export function campDue(run: RunState): boolean {
  return run.status === 'playing' && run.fightIndex % FIGHTS_PER_REGION === FIGHTS_PER_REGION - 1;
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

/** Every square the (already-placed) friends threaten, before the enemy side exists yet. */
function friendCoverAtSpawn(w: number, h: number, friends: Spawn[]): Set<string> {
  const pieces: Piece[] = friends.map((sp, i) => ({ id: i, side: 'friend', ...sp }));
  const view = { w, h, pieces } as FightState;
  const covered = new Set<string>();
  for (const p of pieces) for (const t of threatsFor(view, p)) covered.add(`${t.x},${t.y}`);
  return covered;
}

/**
 * Roll each enemy a fresh square in the top portion of the board — distinct
 * squares, real randomness off the run's seeded RNG each time a clearing is
 * entered. Same kinds every time (that's the mechanic the clearing teaches),
 * but the shape of the threat varies run to run instead of greeting the
 * player with an identical picture every time. The Bramble Heart never
 * spawns already in check — a long-range friend (rumble/duchess/slink)
 * happening to share its file/rank/diagonal shouldn't hand the boss fight
 * away, or start it, before the player has made a single move. Anything
 * worth more than a thistle gets the same courtesy: a free snipe the moment
 * a slider gets recruited would make that recruit feel like a fight-skip
 * instead of a tool, so cost >= 3 bramble avoids the opening threat picture
 * too — just a nibble-able thistle or two on turn one, not a heavy piece.
 */
function placeEnemies(spec: FightSpec, rng: Rng, friends: Spawn[]): Spawn[] {
  const zoneRows = Math.max(2, Math.floor(spec.h / 2) - 1);
  const anyProtected = spec.enemies.some((e) => e.kind === 'heart' || (COST[e.kind] ?? 0) >= 3);
  const cover = anyProtected ? friendCoverAtSpawn(spec.w, spec.h, friends) : null;
  const taken = new Set<string>();
  return spec.enemies.map((es) => {
    const protect = es.kind === 'heart' || (COST[es.kind] ?? 0) >= 3;
    let x = 0;
    let y = 0;
    let key = '';
    let bad: boolean;
    let tries = 0;
    do {
      x = Math.floor(rng() * spec.w);
      y = Math.floor(rng() * zoneRows);
      key = `${x},${y}`;
      bad = taken.has(key) || (protect && cover!.has(key));
      tries++;
    } while (bad && tries < 200); // give up steering clear rather than hang — a clash of constraints beats an infinite loop
    taken.add(key);
    return { ...es, x, y };
  });
}

/**
 * Keeper spawns bottom-center, active companions fan out on the row above.
 * Shaken companions sit this one out.
 */
export function buildFightConfig(run: RunState): BuiltFight {
  const spec = run.fights[run.fightIndex];
  const cx = Math.floor(spec.w / 2);
  const y = spec.h - 2;
  const friends: Spawn[] = [{ kind: 'keeper', x: cx, y: spec.h - 1 }];
  const lineup: number[] = [];
  // remaining fan-out slots, nearest-to-keeper first
  const remaining = [0, -1, 1, -2, 2, -3, 3];
  // a Slink only ever touches one square color, forever — two sharing a
  // color is a wasted recruit, so steer them onto different ones when we can
  const colorOf = (offset: number) => (cx + offset + y) % 2;
  const slinkColors: number[] = [];
  run.companions.forEach((c, i) => {
    if (c.shaken || remaining.length === 0) return;
    let idx = 0;
    if (c.kind === 'slink') {
      const diverse = remaining.findIndex((o) => !slinkColors.includes(colorOf(o)));
      if (diverse !== -1) idx = diverse;
    }
    const offset = remaining.splice(idx, 1)[0];
    const x = cx + offset;
    if (x < 0 || x >= spec.w) return;
    if (c.kind === 'slink') slinkColors.push(colorOf(offset));
    const whistled = run.trinkets.includes('whistle') && c.kind === 'hopper';
    friends.push({ kind: c.kind, x, y, spry: c.spry || whistled || undefined });
    lineup.push(i);
  });
  return {
    cfg: {
      name: spec.name,
      w: spec.w,
      h: spec.h,
      friends,
      enemies: placeEnemies(spec, run.rng, friends),
      actsPerTurn: spec.acts,
      dials: scaleDials(spec.dials, run.difficulty ?? 1),
      spread: spec.spread,
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
  if (run.fightIndex >= run.fights.length) run.status = 'won';
}
