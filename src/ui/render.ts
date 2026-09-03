// Canvas sizing (integer scale, backdrop horizon) and the rAF draw loop.
import { themeRegion } from '../game/ladder';
import type { Vec } from '../game/types';
import { drawBackdrop } from '../render/backdrop';
import { draw, FX_LIFE, TILE, type PosOverrides } from '../render/scene';
import { themeFor } from '../render/themes';
import { app, backdropCtx, backdropEl, boardAreaEl, canvas, ctx, hudEl } from './dom';
import { DRAG_LIFT } from './input';
import { S } from './state';

// ---------- sizing & render loop ----------

/** Backdrop buffer state: same pixel size as the board's pixels, so the
 * meadow and the clearing share one pixel grid. floorY is the horizon row. */
let bgScale = 4;
let bgFloorY = 40;
let bgSkyTop = 0;

/** #board-area's vertical padding — must match the `padding` in style.css, as
 * the horizon is placed relative to the board's top edge. */
const BOARD_PAD_TOP = 16;
const BOARD_PAD_BOTTOM = 4;

export function sizeCanvas() {
  const area = boardAreaEl.getBoundingClientRect();
  const appRect = app.getBoundingClientRect();
  if (area.width < 1 || area.height < 1) return;
  let scale = bgScale;
  let boardTopCss: number | null = null;
  if (S.fight) {
    const availW = Math.max(60, area.width - 8);
    const availH = Math.max(60, area.height - 8);
    scale = Math.max(1, Math.floor(Math.min(availW / canvas.width, availH / canvas.height)));
    const w = `${canvas.width * scale}px`;
    if (canvas.style.width !== w) {
      // guarded: no-op rescales feed the ResizeObserver loop
      canvas.style.width = w;
      canvas.style.height = `${canvas.height * scale}px`;
    }
    // The board is centred in #board-area's content box, but the backdrop now
    // spans all of #app — so offset by where the area sits inside it.
    boardTopCss =
      area.top -
      appRect.top +
      BOARD_PAD_TOP +
      Math.max(0, (area.height - BOARD_PAD_TOP - BOARD_PAD_BOTTOM - canvas.height * scale) / 2);
  }
  // The backdrop runs behind the whole column — header and roster included —
  // so the meadow reaches every edge instead of being cut off by chrome.
  // Integer-scaled like everything else; the buffer rounds up to cover the
  // app box and the extra sliver is cropped by #app's overflow:hidden.
  const bw = Math.max(1, Math.ceil(appRect.width / scale));
  const bh = Math.max(1, Math.ceil(appRect.height / scale));
  if (backdropEl.width !== bw || backdropEl.height !== bh || bgScale !== scale) {
    backdropEl.width = bw;
    backdropEl.height = bh;
    backdropEl.style.width = `${bw * scale}px`;
    backdropEl.style.height = `${bh * scale}px`;
    bgScale = scale;
  }
  // horizon: a few pixels of meadow grass peeking above the board's top edge
  const floor = boardTopCss != null ? Math.round(boardTopCss / scale) - 4 : Math.round(bh * 0.42);
  bgFloorY = Math.max(18, Math.min(bh - 12, floor));
  // the sun/moon hangs below the header, not behind it
  bgSkyTop = Math.min(bgFloorY - 24, Math.round(hudEl.getBoundingClientRect().height / scale));
}

window.addEventListener('resize', sizeCanvas);
window.addEventListener('orientationchange', () => requestAnimationFrame(sizeCanvas));
// iOS resizes the visual viewport (toolbars, safe-area changes) without always
// firing a window resize — the backdrop has to follow or it leaves a gap.
window.visualViewport?.addEventListener('resize', () => requestAnimationFrame(sizeCanvas));
if ('ResizeObserver' in window) new ResizeObserver(sizeCanvas).observe(boardAreaEl);

let frameErrLogged = false;

export function frame(time: number) {
  // A render is pure per frame (it mutates only fx counters), so a thrown draw
  // must never be allowed to kill the rAF loop — that turns one bad frame into
  // a permanently frozen board. Catch, log once, and keep the loop alive.
  try {
    renderFrame(time);
  } catch (err) {
    if (!frameErrLogged) {
      frameErrLogged = true;
      console.error('render frame failed — recovering', err);
    }
  }
  requestAnimationFrame(frame);
}

function renderFrame(time: number) {
  const theme = themeFor(S.run ? themeRegion(S.run.fightIndex, S.run.deep) : 0);
  const ground: [string, string] = [theme.boardA, theme.boardB];
  drawBackdrop(backdropCtx, backdropEl.width, backdropEl.height, bgFloorY, time, theme, bgSkyTop);
  if (S.history) {
    // a remembered board: no selection, no effects, just the moment
    draw(ctx, S.history.states[S.history.idx].f, { selected: null, hover: null, fx: [], ground }, time);
  } else if (S.fight) {
    let overrides: PosOverrides | undefined;
    if (S.tweens.length) {
      const t = Math.min(1, (performance.now() - S.tweenStart) / S.tweenDur);
      overrides = new Map(S.tweens.map((tw) => [tw.id, lerp(tw.from, tw.to, t)]));
    }
    // a carried critter rides the pointer, centred and lifted clear of the
    // fingertip. Cell coords stay fractional here; the renderer rounds them
    // onto whole pixels, so the pixel grid survives the drag.
    if (S.drag?.moved) {
      overrides = new Map(overrides);
      overrides.set(S.drag.id, {
        x: (S.drag.at.x - TILE / 2) / TILE,
        y: (S.drag.at.y - TILE / 2 - DRAG_LIFT) / TILE,
      });
    }
    draw(
      ctx,
      S.fight,
      {
        selected: S.selected,
        hover: S.inspect,
        fx: S.fx,
        carried: S.drag?.moved ? S.drag.id : undefined,
        posOverrides: overrides,
        telegraphOverride: S.frozenTelegraphs ?? undefined,
        revealVeiled: S.revealVeiled || undefined,
        ground,
      },
      time,
    );
    for (const f of S.fx) f.t++;
    // per-kind lifetimes: a trinket save lingers well past a scuffle
    S.fx = S.fx.filter((f) => f.t < FX_LIFE[f.kind]);
  }
}

function lerp(a: Vec, b: Vec, t: number): Vec {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
