import { describe, it } from 'vitest';
import { draw, type PosOverrides } from './scene';
import { movesFor } from '../game/board';
import {
  createFight,
  resolveEnemyTurn,
  playerMove,
  promote,
  playerHasMove,
} from '../game/fight';
import { buildFightConfig, newRun } from '../game/run';
import { mulberry32 } from '../game/rng';
import type { FightState, Telegraph, Vec } from '../game/types';

// A no-op 2D context — draw() only sets fillStyle and calls fillRect.
function mockCtx(): CanvasRenderingContext2D {
  return new Proxy(
    { fillStyle: '' },
    {
      get: (t, k) => (k in t ? (t as Record<string, unknown>)[k as string] : () => {}),
      set: (t, k, v) => ((t as Record<string, unknown>)[k as string] = v) === v,
    },
  ) as unknown as CanvasRenderingContext2D;
}

const lerp = (a: Vec, b: Vec, t: number): Vec => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

// Render the enemy-turn beat exactly as main.ts does: snapshot the committed
// telegraphs, resolve, then draw the FROZEN telegraphs against the now-mutated
// board with interpolated (mid-tween) positions.
function renderEnemyTurn(f: FightState, ctx: CanvasRenderingContext2D) {
  const frozen: Telegraph[] = f.telegraphs.map((t) => ({ ...t }));
  const before = new Map(f.pieces.filter((p) => p.side === 'bramble').map((p) => [p.id, { x: p.x, y: p.y }]));
  resolveEnemyTurn(f);
  const tweens: { id: number; from: Vec; to: Vec }[] = [];
  for (const [id, from] of before) {
    const p = f.pieces.find((q) => q.id === id);
    if (p && (p.x !== from.x || p.y !== from.y)) tweens.push({ id, from, to: { x: p.x, y: p.y } });
  }
  for (const t of [0, 0.33, 0.5, 0.75, 1]) {
    const overrides: PosOverrides = new Map(tweens.map((tw) => [tw.id, lerp(tw.from, tw.to, t)]));
    draw(ctx, f, { selected: null, hover: null, fx: [], posOverrides: overrides, telegraphOverride: frozen }, 0);
  }
}

// Regression guard: rendering the FROZEN enemy telegraphs against the mutated,
// mid-tween board must never throw OR hang. A slider whose interpolated origin
// rounds onto its (now-empty) aim square once froze the whole app here — the
// `while` in sliderLane never advanced. If that class returns, this test hangs
// the runner instead of shipping a frozen game.
describe('render fuzz', () => {
  it('renders every fight through its enemy turns without throwing or hanging', () => {
    const ctx = mockCtx();
    const nFights = newRun(0).fights.length;
    for (let seed = 0; seed < 60; seed++) {
      for (let fi = 0; fi < nFights; fi++) {
        const run = newRun(seed);
        run.fightIndex = fi;
        const built = buildFightConfig(run);
        const f = createFight(built.cfg, run.rng);
        const rng = mulberry32((seed ^ (fi << 8) ^ 0x9999) >>> 0);
        let turns = 0;
        try {
          while (f.status === 'playing' && turns++ < 200) {
            if (f.pendingPromotion != null) {
              promote(f, 'duchess');
              continue;
            }
            draw(ctx, f, { selected: null, hover: f.pieces[0] ?? null, fx: [], telegraphOverride: undefined }, 0);
            const opts: { id: number; to: Vec }[] = [];
            for (const p of f.pieces)
              if (p.side === 'friend') for (const m of movesFor(f, p)) opts.push({ id: p.id, to: m });
            if (opts.length && playerHasMove(f)) {
              const mv = opts[Math.floor(rng() * opts.length)];
              playerMove(f, mv.id, mv.to);
            }
            if (f.status !== 'playing' || f.pendingPromotion != null) continue;
            renderEnemyTurn(f, ctx);
          }
        } catch (err) {
          throw new Error(`seed ${seed} fight ${fi} turn ${turns}: ${(err as Error).stack}`);
        }
      }
    }
  });
});
