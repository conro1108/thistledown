import { threatsFor } from './board';
import type { FightConfig, Spawn } from './fight';
import { mulberry32 } from './rng';
import type { AiDials, FightState, Kind, Piece, Rng, SpreadConfig, UpgradeId } from './types';

export interface Companion {
  kind: Kind;
  name: string;
  shaken: boolean;
  /**
   * Ate a honeycake: a plain one-step move, but only for a while. Holds the
   * clearing index the spring wears off *before* (active while
   * `fightIndex < spryUntil`) — comforts are temporary now, not run-long.
   */
  spryUntil?: number;
}

/** A movement upgrade the band carries, and the clearing index it fades before. */
export interface OwnedUpgrade {
  id: UpgradeId;
  until: number;
}

/**
 * Movement upgrades and honeycakes are temporary: they last this many clearings
 * from the campfire they're picked up at, then fade. Trinkets stay run-long —
 * they're the run-defining relics; these smaller bends are the fast-spent treats.
 */
export const TEMP_LIFESPAN = 3;

export interface RunState {
  seed: number;
  rng: Rng;
  fightIndex: number;
  /** this run's ladder, rolled off the seed at newRun (see generateFights) */
  fights: FightSpec[];
  companions: Companion[];
  trinkets: TrinketId[];
  /**
   * Movement upgrades the band has picked up, each with the clearing it fades
   * before. Run-level and applied to every companion of the matching kind while
   * live — but temporary now (see TEMP_LIFESPAN), so an id can appear more than
   * once across a run as it's re-earned at later campfires.
   */
  upgrades: OwnedUpgrade[];
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
    upgrades: [],
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

/**
 * Recruits no longer wander in after every single clearing — the band grew to
 * cap almost immediately that way. A friend is watching after every *other*
 * clearing instead (call this after `afterFightWon` has advanced the index, so
 * the clearing just won is `fightIndex - 1`). The first clearing still ends in
 * a recruit, keeping the early on-ramp intact.
 */
export function recruitDue(run: RunState): boolean {
  return (run.fightIndex - 1) % 2 === 0;
}

/**
 * Distinct recruit offers, drawn from a pool that grows region by region. Two
 * by default; Beginner's Luck adds a third (capped at what the pool can spare).
 */
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
  const want = Math.min(run.trinkets.includes('luck') ? 3 : 2, pool.length);
  const bag = [...pool];
  const out: Kind[] = [];
  while (out.length < want && bag.length) {
    out.push(bag.splice(Math.floor(run.rng() * bag.length), 1)[0]);
  }
  return out;
}

export function recruit(run: RunState, kind: Kind) {
  run.companions.push({ kind, name: makeName(run), shaken: false });
}

// ---------- trinkets ----------

export type TrinketId =
  | 'cloak'
  | 'whistle'
  | 'breakfast'
  | 'ward'
  | 'riser'
  | 'luck'
  | 'dew'
  | 'map'
  | 'trail';

/** `region` gates a trinket behind ladder progress — new relics keep surfacing. */
export const TRINKETS: Record<TrinketId, { title: string; blurb: string; region: number }> = {
  cloak: {
    title: 'Dandelion Cloak',
    blurb: 'Once each clearing, a caught friend (never the Keeper) drifts safely back to your home row instead.',
    region: 0,
  },
  whistle: {
    title: 'Acorn Whistle',
    blurb: 'Every Hopper can also take a plain one-step move, any direction.',
    region: 0,
  },
  breakfast: {
    title: 'Second Breakfast',
    blurb: 'Once each clearing, your first move comes with a second helping — an extra move that can’t snatch anything.',
    region: 0,
  },
  ward: {
    title: 'Bramble Ward',
    blurb: 'Once each clearing, the first friend the bramble would catch — the Keeper too — shrugs it off; the attacker recoils.',
    region: 0,
  },
  riser: {
    title: 'Early Riser',
    blurb: 'Your opening move each clearing is followed by a free stretch — an extra, non-snatching move. Stacks with Second Breakfast for two.',
    region: 0,
  },
  luck: {
    title: 'Beginner’s Luck',
    blurb: 'Every recruit shows a third friend to choose from.',
    region: 1,
  },
  map: {
    title: 'Wanderer’s Map',
    blurb: 'Every campfire lays out two comforts from the wilds to pick between, not one.',
    region: 1,
  },
  dew: {
    title: 'Morning Dew',
    blurb: 'Friends caught in a fight are never left shaken — they rejoin the band ready for the next clearing.',
    region: 2,
  },
  trail: {
    title: 'Trailmarker',
    blurb: 'The bramble is slower to reinforce — the spread clock gives you three extra turns before it stirs.',
    region: 2,
  },
};

/** Up to n distinct trinkets the run doesn't own yet and has unlocked by region. */
export function offerTrinkets(run: RunState, n: number): TrinketId[] {
  const r = regionOf(run.fightIndex);
  const pool = (Object.keys(TRINKETS) as TrinketId[]).filter(
    (t) => !run.trinkets.includes(t) && TRINKETS[t].region <= r,
  );
  const out: TrinketId[] = [];
  while (out.length < n && pool.length) {
    out.push(pool.splice(Math.floor(run.rng() * pool.length), 1)[0]);
  }
  return out;
}

export function takeTrinket(run: RunState, id: TrinketId) {
  if (!run.trinkets.includes(id)) run.trinkets.push(id);
}

// ---------- movement upgrades ----------

/**
 * Each upgrade bends one kind's movement. `kind` gates both who it helps and
 * when it's offered (only if you have that critter); `region` gates it behind
 * ladder progress so new tricks keep surfacing as you push deeper.
 */
export const UPGRADES: Record<UpgradeId, { title: string; blurb: string; kind: Kind; region: number }> = {
  thornstep: {
    title: 'Thornstep',
    blurb: 'Every Sprout can waddle one step diagonally forward onto open ground — not just poke.',
    kind: 'sprout',
    region: 0,
  },
  rootgrip: {
    title: 'Rootgrip',
    blurb: 'Every Sprout can take one plain step straight back. A shy retreat, never a snatch.',
    kind: 'sprout',
    region: 1,
  },
  springheel: {
    title: 'Springheel',
    blurb: 'Every Hopper can also make a short one-step diagonal hop, in addition to its long leap.',
    kind: 'hopper',
    region: 1,
  },
  sidestep: {
    title: 'Sidestep',
    blurb: 'Every Slink can also step one square straight — the only way it ever changes which colour it walks.',
    kind: 'slink',
    region: 1,
  },
  underbrush: {
    title: 'Underbrush',
    blurb: 'A Slink’s diagonal glide slips right over the first friend in its lane and keeps going.',
    kind: 'slink',
    region: 2,
  },
  pivot: {
    title: 'Pivot',
    blurb: 'Every Rumble can also take one short diagonal step, off its straight lanes.',
    kind: 'rumble',
    region: 2,
  },
};

/** Distinct upgrades still live this clearing (fade at `until`), newest kept. */
export function activeUpgrades(run: RunState): UpgradeId[] {
  const live = new Set<UpgradeId>();
  for (const u of run.upgrades) if (run.fightIndex < u.until) live.add(u.id);
  return [...live];
}

/** Clearings an upgrade has left before it fades, or 0 if it isn't live. */
export function upgradeClearingsLeft(run: RunState, id: UpgradeId): number {
  let left = 0;
  for (const u of run.upgrades) if (u.id === id) left = Math.max(left, u.until - run.fightIndex);
  return Math.max(0, left);
}

/** Which live upgrades a companion of `kind` currently carries (by kind). */
export function upgradesForKind(run: RunState, kind: Kind): UpgradeId[] {
  return activeUpgrades(run).filter((u) => UPGRADES[u].kind === kind);
}

/**
 * Up to n distinct upgrades the run can actually use right now: not already
 * owned, unlocked by region, and for a kind the band currently fields. Offering
 * a Slink trick to a band with no Slink would just be a dead card.
 */
export function offerUpgrades(run: RunState, n: number): UpgradeId[] {
  const r = regionOf(run.fightIndex);
  const have = new Set(run.companions.map((c) => c.kind));
  // temporary now, so a faded upgrade can surface again — only *live* ones are withheld
  const live = new Set(activeUpgrades(run));
  const pool = (Object.keys(UPGRADES) as UpgradeId[]).filter(
    (u) => !live.has(u) && UPGRADES[u].region <= r && have.has(UPGRADES[u].kind),
  );
  const out: UpgradeId[] = [];
  while (out.length < n && pool.length) {
    out.push(pool.splice(Math.floor(run.rng() * pool.length), 1)[0]);
  }
  return out;
}

/** Learn (or re-learn) an upgrade at the fire; it fades TEMP_LIFESPAN clearings on. */
export function takeUpgrade(run: RunState, id: UpgradeId) {
  run.upgrades.push({ id, until: run.fightIndex + TEMP_LIFESPAN });
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

/** Whether a companion's honeycake spring is still in their step this clearing. */
export function isSpry(run: RunState, c: Companion): boolean {
  return c.spryUntil !== undefined && run.fightIndex < c.spryUntil;
}

/** Honeycake: one companion gains a plain one-step move for TEMP_LIFESPAN clearings. */
export function campSnack(run: RunState, companionIdx: number) {
  const c = run.companions[companionIdx];
  if (c) c.spryUntil = run.fightIndex + TEMP_LIFESPAN;
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
    const ups = upgradesForKind(run, c.kind);
    friends.push({
      kind: c.kind,
      x,
      y,
      spry: isSpry(run, c) || whistled || undefined,
      upgrades: ups.length ? ups : undefined,
    });
    lineup.push(i);
  });
  // Trailmarker slows the reinforcement clock: three extra turns before it stirs.
  const spread =
    spec.spread && run.trinkets.includes('trail')
      ? { ...spec.spread, after: spec.spread.after + 3 }
      : spec.spread;
  return {
    cfg: {
      name: spec.name,
      w: spec.w,
      h: spec.h,
      friends,
      enemies: placeEnemies(spec, run.rng, friends),
      actsPerTurn: spec.acts,
      dials: scaleDials(spec.dials, run.difficulty ?? 1),
      spread,
      cloak: run.trinkets.includes('cloak'),
      secondBreakfast: run.trinkets.includes('breakfast'),
      whistle: run.trinkets.includes('whistle'),
      ward: run.trinkets.includes('ward'),
      riser: run.trinkets.includes('riser'),
    },
    lineup,
  };
}

/**
 * Settle the roster after a won fight: fielded companions who were captured
 * become shaken (sit out the next fight); everyone who sat out recovers.
 */
export function afterFightWon(run: RunState, lineup: number[], aliveCompanionIdx: Set<number>) {
  // Morning Dew spares the shakes entirely — a caught friend just walks it off.
  const dew = run.trinkets.includes('dew');
  run.companions.forEach((c, i) => {
    c.shaken = !dew && lineup.includes(i) ? !aliveCompanionIdx.has(i) : false;
  });
  run.fightIndex++;
  if (run.fightIndex >= run.fights.length) run.status = 'won';
}
