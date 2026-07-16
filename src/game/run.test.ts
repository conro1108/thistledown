import { describe, expect, it } from 'vitest';
import { threatsFor } from './board';
import {
  afterFightWon,
  buildFightConfig,
  campDue,
  campHeal,
  campSnack,
  FIGHTS_PER_REGION,
  generateFights,
  newRun,
  offerRecruits,
  offerTrinkets,
  recruit,
  REGION_NAMES,
  regionOf,
  takeTrinket,
} from './run';
import type { FightState, Piece } from './types';

describe('run', () => {
  it('every fight lineup fits the board with no overlaps', () => {
    const run = newRun(42);
    for (let i = 0; i < run.fights.length; i++) {
      run.fightIndex = i;
      const { cfg } = buildFightConfig(run);
      const seen = new Set<string>();
      for (const sp of [...cfg.friends, ...cfg.enemies]) {
        expect(sp.x).toBeGreaterThanOrEqual(0);
        expect(sp.y).toBeGreaterThanOrEqual(0);
        expect(sp.x).toBeLessThan(cfg.w);
        expect(sp.y).toBeLessThan(cfg.h);
        const key = `${sp.x},${sp.y}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
      expect(cfg.friends[0].kind).toBe('keeper');
    }
  });

  it('the Bramble Heart never spawns already in check — a long-range friend sharing its lane at kickoff would give the fight away for free', () => {
    for (let seed = 0; seed < 200; seed++) {
      const run = newRun(seed);
      run.fightIndex = run.fights.length - 1; // the boss clearing
      // stack long-range friends into the lineup so a shared file/rank/diagonal
      // with the Heart's roll is plausible, not a coincidence we'd rarely hit
      run.companions.push({ kind: 'rumble', name: 'a', shaken: false });
      run.companions.push({ kind: 'duchess', name: 'b', shaken: false });
      const { cfg } = buildFightConfig(run);
      const heart = cfg.enemies.find((e) => e.kind === 'heart')!;
      const pieces: Piece[] = cfg.friends.map((sp, i) => ({ id: i, side: 'friend', ...sp }));
      const view = { w: cfg.w, h: cfg.h, pieces } as FightState;
      const covered = new Set<string>();
      for (const p of pieces) for (const t of threatsFor(view, p)) covered.add(`${t.x},${t.y}`);
      expect(covered.has(`${heart.x},${heart.y}`)).toBe(false);
    }
  });

  it('shaken companions sit out, then recover', () => {
    const run = newRun(1);
    const { lineup } = buildFightConfig(run);
    // companion 0 was captured, others survived
    afterFightWon(run, lineup, new Set(lineup.slice(1)));
    expect(run.companions[0].shaken).toBe(true);
    const next = buildFightConfig(run);
    expect(next.lineup.includes(0)).toBe(false);
    afterFightWon(run, next.lineup, new Set(next.lineup));
    expect(run.companions[0].shaken).toBe(false);
  });

  it('recruit offers are two distinct kinds and names stay unique', () => {
    const run = newRun(9);
    for (let i = 0; i < 10; i++) {
      const [a, b] = offerRecruits(run);
      expect(a).not.toBe(b);
      recruit(run, a);
    }
    const names = run.companions.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('camp: due before each region boss, heal recovers everyone, honeycake sticks', () => {
    const run = newRun(5);
    expect(campDue(run)).toBe(false);
    run.fightIndex = 3;
    expect(campDue(run)).toBe(true);
    run.fightIndex = 7;
    expect(campDue(run)).toBe(true);
    run.fightIndex = 4;
    expect(campDue(run)).toBe(false);
    run.fightIndex = 3;
    run.companions[0].shaken = true;
    run.companions[1].shaken = true;
    campHeal(run);
    expect(run.companions.every((c) => !c.shaken)).toBe(true);
    campSnack(run, 2);
    expect(run.companions[2].spry).toBe(true);
    // the buff reaches the board
    const { cfg, lineup } = buildFightConfig(run);
    const j = lineup.indexOf(2);
    expect(cfg.friends[j + 1].spry).toBe(true);
  });

  it('trinkets: offers exclude owned ones and the whistle makes fielded hoppers spry', () => {
    const run = newRun(11);
    const offered = offerTrinkets(run, 2);
    expect(new Set(offered).size).toBe(2);
    takeTrinket(run, 'whistle');
    expect(offerTrinkets(run, 3).includes('whistle')).toBe(false);
    const { cfg, lineup } = buildFightConfig(run);
    const hopperIdx = run.companions.findIndex((c) => c.kind === 'hopper');
    expect(cfg.friends[lineup.indexOf(hopperIdx) + 1].spry).toBe(true);
    takeTrinket(run, 'cloak');
    takeTrinket(run, 'breakfast');
    const next = buildFightConfig(run).cfg;
    expect(next.cloak).toBe(true);
    expect(next.secondBreakfast).toBe(true);
  });

  it('winning the last fight wins the run', () => {
    const run = newRun(3);
    run.fightIndex = run.fights.length - 1;
    const { lineup } = buildFightConfig(run);
    afterFightWon(run, lineup, new Set(lineup));
    expect(run.status).toBe('won');
  });
});

describe('the ladder (generateFights)', () => {
  it('is three regions of four, deterministic per seed', () => {
    expect(generateFights(99)).toEqual(generateFights(99));
    const fights = generateFights(99);
    expect(fights).toHaveLength(REGION_NAMES.length * FIGHTS_PER_REGION);
    expect(regionOf(0)).toBe(0);
    expect(regionOf(3)).toBe(0);
    expect(regionOf(4)).toBe(1);
    expect(regionOf(11)).toBe(2);
  });

  it('different seeds grow different meadows (somewhere in the ladder)', () => {
    const a = JSON.stringify(generateFights(1));
    const b = JSON.stringify(generateFights(2));
    expect(a).not.toEqual(b);
  });

  it('bosses cap regions 1 and 3; the Gloom holds region 2', () => {
    const fights = generateFights(7);
    expect(fights[3].enemies.some((e) => e.kind === 'heart')).toBe(true);
    expect(fights[7].enemies.some((e) => e.kind === 'gloom')).toBe(true);
    expect(fights[11].enemies.some((e) => e.kind === 'heart')).toBe(true);
    // hearts nowhere else
    fights.forEach((f, i) => {
      if (i !== 3 && i !== 11) expect(f.enemies.some((e) => e.kind === 'heart')).toBe(false);
    });
  });

  it('the training wheels come off on schedule: no fickle before the Thicket, no shrouds before the Deep Bramble', () => {
    for (let seed = 0; seed < 60; seed++) {
      const fights = generateFights(seed);
      fights.forEach((f, i) => {
        if (i < 5) expect(f.enemies.some((e) => e.fickle)).toBe(false);
        if (i < 8) expect(f.enemies.some((e) => e.veiled)).toBe(false);
        expect(f.enemies.length).toBeGreaterThanOrEqual(3); // never an empty clearing
      });
    }
  });

  it('every fight fields a sane bramble for its board', () => {
    for (let seed = 0; seed < 60; seed++) {
      for (const f of generateFights(seed)) {
        // enemies must fit the spawn zone with room to breathe
        const zone = Math.max(2, Math.floor(f.h / 2) - 1) * f.w;
        expect(f.enemies.length).toBeLessThan(zone / 2);
      }
    }
  });
});
