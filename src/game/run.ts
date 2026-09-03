import { threatsFor } from './board';
import type { FightConfig, PromotionKind, Spawn } from './fight';
import { COST, FIGHTS_PER_REGION, generateFights, regionOf, scaleDials, type FightSpec } from './ladder';
import { mulberry32 } from './rng';
import type { FightState, Kind, Piece, Rng, UpgradeId } from './types';

export interface Companion {
  kind: Kind;
  name: string;
  shaken: boolean;
}

/** A movement upgrade the band carries, and the clearing index it fades before. */
export interface OwnedUpgrade {
  id: UpgradeId;
  until: number;
}

/**
 * Movement upgrades are temporary: they last this many clearings from the
 * campfire they're picked up at, then fade. Trinkets stay run-long — they're
 * the run-defining relics; these smaller bends are the fast-spent treats.
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
  /** chose to press on past the Bramble Heart into the deep regions */
  deep?: boolean;
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
  const want = Math.min(2, pool.length);
  const bag = [...pool];
  const out: Kind[] = [];
  while (out.length < want && bag.length) {
    out.push(bag.splice(Math.floor(run.rng() * bag.length), 1)[0]);
  }
  // A band with no straight-lane critter can chase the Heart around a clearing
  // forever without ever fencing it in — and the luck of the draw could deny one
  // for a whole region. Once the roster is short a lane-holder, one of the
  // offers is always a Rumble.
  if (
    pool.includes('rumble') &&
    !out.includes('rumble') &&
    !run.companions.some((c) => c.kind === 'rumble' || c.kind === 'duchess')
  ) {
    out[out.length - 1] = 'rumble';
  }
  return out;
}

export function recruit(run: RunState, kind: Kind) {
  run.companions.push({ kind, name: makeName(run), shaken: false });
}

// ---------- trinkets ----------

export type TrinketId = 'cloak' | 'ward' | 'breakfast' | 'fork' | 'pin' | 'whistle' | 'glow' | 'dew';

/**
 * Relics. Every one of them happens *on the board*, in a moment you can point
 * at — a rescue, a freeze, a swap — and no two share a mechanic. Three of them
 * are tactics with their real names (fork, pin) or their real shape (the
 * Keeper's swap): the trinket is how the name gets learned.
 * `region` gates a trinket behind ladder progress — new relics keep surfacing.
 */
export const TRINKETS: Record<TrinketId, { title: string; blurb: string; region: number }> = {
  cloak: {
    title: 'Dandelion Cloak',
    blurb: 'Once each clearing, a caught friend (never the Keeper) drifts safely back to your home row instead.',
    region: 0,
  },
  ward: {
    title: 'Bramble Ward',
    blurb: 'Once each clearing, the Keeper shrugs off a catch and stands its ground. The attacker recoils.',
    region: 0,
  },
  breakfast: {
    title: 'Second Breakfast',
    blurb: 'Catch a creature mid-lunge — arrow and all — and take a second step right away. A stretch, not a snatch.',
    region: 0,
  },
  fork: {
    title: 'Forked Twig',
    blurb: 'Land where you threaten two creatures at once and both freeze on the spot. A fork: they can only save one, and now not even that.',
    region: 0,
  },
  whistle: {
    title: 'Acorn Whistle',
    blurb: 'Once each clearing, the Keeper may trade places with a friend standing beside it. A quick duck behind a wall.',
    region: 1,
  },
  pin: {
    title: 'Thorn Pin',
    blurb: 'A creature caught in a Slink or Rumble’s lane with something dearer behind it is pinned — it cannot move at all.',
    region: 1,
  },
  dew: {
    title: 'Morning Dew',
    blurb: 'Friends caught in a fight are never left shaken — they rejoin the band ready for the next clearing.',
    region: 1,
  },
  glow: {
    title: 'Glowworm Jar',
    blurb: 'Shrouded creatures show their arrows after all. Nothing in the dark keeps a secret from a jar of glowworms.',
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
  longstride: {
    title: 'Long Stride',
    blurb: 'A Sprout still on its home row may take two steps forward at once. The first step is the eager one.',
    kind: 'sprout',
    region: 0,
  },
  rootgrip: {
    title: 'Rootgrip',
    blurb: 'Every Sprout can take one plain step straight back. A shy retreat, never a snatch.',
    kind: 'sprout',
    region: 1,
  },
  longlegs: {
    title: 'Long Legs',
    blurb: 'Every Hopper also leaps a stretched L — three along and one across — right over anything.',
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
  cornering: {
    title: 'Cornering',
    blurb: 'A Rumble may turn one corner mid-charge: barrel down a lane, swing ninety degrees, keep going.',
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

/** Honeycake: a Sprout blossoms by the fire, no far edge required. */
export function campBlossom(run: RunState, companionIdx: number, kind: PromotionKind): boolean {
  const c = run.companions[companionIdx];
  if (!c || c.kind !== 'sprout') return false;
  c.kind = kind;
  return true;
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
    const ups = upgradesForKind(run, c.kind);
    friends.push({ kind: c.kind, x, y, upgrades: ups.length ? ups : undefined });
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
      ward: run.trinkets.includes('ward'),
      breakfast: run.trinkets.includes('breakfast'),
      fork: run.trinkets.includes('fork'),
      pin: run.trinkets.includes('pin'),
      whistle: run.trinkets.includes('whistle'),
      glow: run.trinkets.includes('glow'),
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
