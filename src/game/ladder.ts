// The authored ladder: every clearing's template (board, lesson, dials, spread
// clock) and how a run rolls its concrete fight list off the seed.
import { mulberry32 } from './rng';
import type { AiDials, Kind, SpreadConfig } from './types';

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

export const COST: Partial<Record<Kind, number>> = {
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
    spread: { after: 18, every: 5, cap: 5 },
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
    spread: { after: 18, every: 5, cap: 5 },
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
    spread: { after: 16, every: 5, cap: 6 },
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
    spread: { after: 15, every: 5, cap: 6 },
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
    spread: { after: 16, every: 5, cap: 6 },
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
    spread: { after: 16, every: 5, cap: 6 },
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
    spread: { after: 16, every: 5, cap: 7 },
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
    spread: { after: 16, every: 5, cap: 7 },
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
    spread: { after: 16, every: 5, cap: 7 },
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
    spread: { after: 17, every: 5, cap: 8 },
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
    spread: { after: 16, every: 5, cap: 8 },
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
    spread: { after: 16, every: 5, cap: 8 },
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
    spread: { after: 16, every: 5, cap: 8 },
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
    spread: { after: 16, every: 5, cap: 8 },
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
    spread: { after: 16, every: 5, cap: 9 },
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
    spread: { after: 16, every: 5, cap: 9 },
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
    spread: { after: 15, every: 5, cap: 9 },
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
    spread: { after: 15, every: 5, cap: 9 },
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
    spread: { after: 15, every: 5, cap: 9 },
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
    spread: { after: 15, every: 5, cap: 9 },
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
    spread: { after: 14, every: 5, cap: 10 },
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
    spread: { after: 14, every: 5, cap: 10 },
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
    spread: { after: 14, every: 5, cap: 10 },
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
    spread: { after: 14, every: 5, cap: 10 },
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
