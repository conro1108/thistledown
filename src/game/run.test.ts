import { describe, expect, it } from 'vitest';
import { movesFor, pieceAt } from './board';
import { FIGHTS_PER_REGION, generateFights, REGION_NAMES, regionOf } from './ladder';
import { afterFightWon, buildFightConfig, newRun } from './run';
import { apply, newSession, replay, retryFight, type Session } from './session';

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

  it('winning the last fight wins the run', () => {
    const run = newRun(3);
    run.fightIndex = run.fights.length - 1;
    const { lineup } = buildFightConfig(run);
    afterFightWon(run, lineup, new Set(lineup));
    expect(run.status).toBe('won');
  });
});

describe('the ladder (generateFights)', () => {
  it('is six regions of four, deterministic per seed', () => {
    expect(generateFights(99)).toEqual(generateFights(99));
    const fights = generateFights(99);
    expect(fights).toHaveLength(REGION_NAMES.length * FIGHTS_PER_REGION);
    expect(regionOf(0)).toBe(0);
    expect(regionOf(3)).toBe(0);
    expect(regionOf(4)).toBe(1);
    expect(regionOf(11)).toBe(2);
    expect(regionOf(12)).toBe(3);
    expect(regionOf(15)).toBe(3);
    expect(regionOf(16)).toBe(4);
    expect(regionOf(19)).toBe(4);
    expect(regionOf(20)).toBe(5);
    expect(regionOf(23)).toBe(5);
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

/**
 * A deterministic headless player: always the first legal move of the first
 * movable friend, first recruit offer, first camp/found option. Board
 * iteration order is deterministic, so the same seed gives the same run.
 */
function botTurn(s: Session): boolean {
  switch (s.stage) {
    case 'intro':
      return apply(s, { t: 'begin' });
    case 'fight': {
      const f = s.fight!;
      if (s.resolveDue) return apply(s, { t: 'resolve' });
      for (const p of f.pieces) {
        if (p.side !== 'friend') continue;
        const ms = movesFor(f, p);
        if (ms.length) return apply(s, { t: 'move', id: p.id, to: ms[0] });
      }
      return apply(s, { t: 'resolve' }); // hemmed in — the wait
    }
    case 'promotion':
      return apply(s, { t: 'promote', kind: 'hopper' });
    case 'post':
      return s.recruitOffers
        ? apply(s, { t: 'recruit', kind: s.recruitOffers[0] })
        : apply(s, { t: 'skip' });
    case 'found':
    case 'camp':
      if (s.trinketOffers.length) return apply(s, { t: 'trinket', id: s.trinketOffers[0] });
      return apply(s, { t: 'rest' });
    case 'over':
      return false;
  }
}

/** Comparable snapshot: everything but the RNG closure and transient events. */
function snap(s: Session) {
  const { rng: _r, ...run } = s.run;
  const fight = s.fight ? { ...s.fight, rng: undefined, events: [] } : null;
  return JSON.parse(
    JSON.stringify({
      run,
      fight,
      lineup: s.lineup,
      stage: s.stage,
      resolveDue: s.resolveDue,
      recruitOffers: s.recruitOffers,
      trinketOffers: s.trinketOffers,
    }),
  );
}

describe('session', () => {
  it('a long bot run replays from its log to the identical state', () => {
    for (const seed of [7, 42, 1234]) {
      const live = newSession(seed);
      // play a few hundred decisions (several fights deep, or a full run)
      for (let i = 0; i < 400 && live.stage !== 'over'; i++) {
        expect(botTurn(live)).toBe(true);
      }
      const rebuilt = replay(seed, live.log);
      expect(snap(rebuilt)).toEqual(snap(live));
    }
  });

  it('retrying a lost clearing rewinds to that fight, not the start of the run', () => {
    // The idle bot never wins a fight; a capture-seeking one clears them, so we
    // can get genuinely several clearings deep before exercising the retry.
    // Enemy squares are randomized per run now, so "seek" also has to close
    // the distance when nothing is capturable yet — a fixed first-legal-move
    // fallback only worked by luck of a particular hardcoded layout. Track
    // each piece's previous square so a leaper (whose Manhattan distance to a
    // target doesn't shrink monotonically move-to-move) can't just ping-pong
    // between two equally-"close" squares forever.
    const lastPos = new Map<number, { x: number; y: number }>();
    const grab = (s: Session): boolean => {
      const f = s.fight!;
      if (s.resolveDue) return apply(s, { t: 'resolve' });
      for (const p of f.pieces) {
        if (p.side !== 'friend') continue;
        for (const m of movesFor(f, p)) {
          const occ = pieceAt(f, m.x, m.y);
          if (occ?.side === 'bramble' && occ.kind !== 'heart') return apply(s, { t: 'move', id: p.id, to: m });
        }
      }
      const foes = f.pieces.filter((p) => p.side === 'bramble');
      let best: { id: number; to: { x: number; y: number }; dist: number } | null = null;
      for (const p of f.pieces) {
        if (p.side !== 'friend') continue;
        const prev = lastPos.get(p.id);
        for (const m of movesFor(f, p)) {
          if (prev && prev.x === m.x && prev.y === m.y) continue; // don't just undo the last hop
          const dist = Math.min(...foes.map((e) => Math.abs(e.x - m.x) + Math.abs(e.y - m.y)));
          if (!best || dist < best.dist) best = { id: p.id, to: m, dist };
        }
      }
      if (!best) return botTurn(s); // hemmed in — wait
      const mover = f.pieces.find((p) => p.id === best!.id)!;
      lastPos.set(best.id, { x: mover.x, y: mover.y });
      return apply(s, { t: 'move', id: best.id, to: best.to });
    };
    const drive = (s: Session) => (s.stage === 'fight' ? grab(s) : botTurn(s));

    // get past the first clearing so a retry has real history behind it
    const live = newSession(7);
    for (let i = 0; i < 600 && live.run.fightIndex < 1; i++) expect(drive(live)).toBe(true);
    expect(live.run.fightIndex).toBeGreaterThanOrEqual(1); // genuinely a clearing deep

    // sit at the top of the current fight and snapshot the clean start
    while (live.stage !== 'fight') expect(drive(live)).toBe(true);
    const fightIndex = live.run.fightIndex;
    const companions = live.run.companions.length;
    const cleanStart = snap(live);

    // blunder a few moves into it, then bail out and retry
    for (let i = 0; i < 4 && live.stage === 'fight'; i++) drive(live);
    const retried = retryFight(live);

    expect(retried.run.fightIndex).toBe(fightIndex); // same clearing, not back to 0
    expect(retried.run.companions.length).toBe(companions); // roster carried in, not the newRun three
    expect(retried.stage).toBe('fight');
    expect(retried.resolveDue).toBe(false);
    expect(retried.log.at(-1)!.t).toBe('begin'); // parked at the top of the fight
    expect(snap(retried)).toEqual(cleanStart); // the exact board you first walked into
  });
});
