import { describe, expect, it } from 'vitest';
import { afterFightWon, buildFightConfig, FIGHTS, newRun, offerRecruits, recruit } from './run';

describe('run', () => {
  it('every fight lineup fits the board with no overlaps', () => {
    const run = newRun(42);
    for (let i = 0; i < FIGHTS.length; i++) {
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

  it('winning the last fight wins the run', () => {
    const run = newRun(3);
    run.fightIndex = FIGHTS.length - 1;
    const { lineup } = buildFightConfig(run);
    afterFightWon(run, lineup, new Set(lineup));
    expect(run.status).toBe('won');
  });
});
