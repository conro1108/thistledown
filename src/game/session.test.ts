import { describe, expect, it } from 'vitest';
import { movesFor } from './board';
import { apply, newSession, replay, type Session } from './session';

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

  it('rejects entries that do not fit the stage, leaving the log clean', () => {
    const s = newSession(1);
    expect(apply(s, { t: 'resolve' })).toBe(false); // no fight yet
    expect(apply(s, { t: 'recruit', kind: 'hopper' })).toBe(false);
    expect(apply(s, { t: 'begin' })).toBe(true);
    // a second move before the bramble answers is refused
    const f = s.fight!;
    const friend = f.pieces.find((p) => p.side === 'friend' && movesFor(f, p).length)!;
    expect(apply(s, { t: 'move', id: friend.id, to: movesFor(f, friend)[0] })).toBe(true);
    expect(s.resolveDue).toBe(true);
    const again = f.pieces.find((p) => p.side === 'friend' && movesFor(f, p).length)!;
    expect(apply(s, { t: 'move', id: again.id, to: movesFor(f, again)[0] })).toBe(false);
    expect(s.log).toHaveLength(2); // begin + one move
  });

  it('an illegal move is refused and not logged', () => {
    const s = newSession(2);
    apply(s, { t: 'begin' });
    expect(apply(s, { t: 'move', id: 1, to: { x: 0, y: 0 } })).toBe(false);
    expect(s.log).toHaveLength(1);
  });
});
