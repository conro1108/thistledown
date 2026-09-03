// Pointer input on the board (tap-tap and drag-to-move) and the sound toggle.
import { movesFor, pieceAt } from '../game/board';
import type { Vec } from '../game/types';
import { iconHTML } from '../render/icons';
import { TILE } from '../render/scene';
import { playSfx, toggleMute, unlockAudio } from '../audio';
import { canvas, hintEl, soundBtn } from './dom';
import { refreshHud, restingHint, tapHint } from './hud';
import { S } from './state';
import { attemptMove, pendingBeat, skipEnemyBeat } from './turn';

soundBtn.onclick = () => {
  unlockAudio();
  const nowMuted = toggleMute();
  soundBtn.innerHTML = iconHTML(nowMuted ? 'muted' : 'sound', 'p2');
  if (!nowMuted) playSfx('ui'); // a blip so you hear it come back on
};

// ---------- input ----------

function cellFromEvent(ev: MouseEvent): Vec | null {
  if (!S.fight) return null;
  const r = canvas.getBoundingClientRect();
  const x = Math.floor(((ev.clientX - r.left) / r.width) * S.fight.w);
  const y = Math.floor(((ev.clientY - r.top) / r.height) * S.fight.h);
  if (x < 0 || y < 0 || x >= S.fight.w || y >= S.fight.h) return null;
  return { x, y };
}

/** Pointer position in canvas (board) pixels — the drag's own coordinate space. */
function boardPixel(ev: PointerEvent): Vec | null {
  if (!S.fight) return null;
  const r = canvas.getBoundingClientRect();
  return {
    x: ((ev.clientX - r.left) / r.width) * S.fight.w * TILE,
    y: ((ev.clientY - r.top) / r.height) * S.fight.h * TILE,
  };
}

/** How far (in board pixels) a pointer must travel before it's a drag, not a tap. */
const DRAG_SLOP = 3;
/** How high the carried critter floats above the finger, so it stays visible. */
export const DRAG_LIFT = 6;

function legalTarget(pieceId: number, c: Vec): boolean {
  if (!S.fight) return false;
  const p = S.fight.pieces.find((q) => q.id === pieceId);
  return !!p && movesFor(S.fight, p).some((m) => m.x === c.x && m.y === c.y);
}

canvas.addEventListener('pointerdown', (ev) => {
  unlockAudio(); // first tap on the board is a valid gesture to start audio
  // A tap that lands mid-animation isn't "too early" any more: it lands the
  // bramble's move now and then does what it was going to do.
  if (pendingBeat) skipEnemyBeat();
  if (S.history || !S.fight || S.fight.status !== 'playing' || S.phase !== 'player') return;
  const c = cellFromEvent(ev);
  if (!c) return;

  const p = pieceAt(S.fight, c.x, c.y);
  // second tap of a tap-tap move: go on pointerdown, not on click — the wait
  // for the up-event is a good chunk of what read as sluggish. A tap on a
  // friend always just picks that friend up: the Whistle's swap (Keeper onto a
  // neighbour) is a drag, so it can never be spent by changing your mind.
  if (S.selected != null && p?.side !== 'friend' && legalTarget(S.selected, c)) {
    attemptMove(S.selected, c);
    return;
  }

  S.inspect = c;
  if (p) {
    S.selected = p.side === 'friend' ? p.id : null;
    if (p.side === 'friend') {
      playSfx('ui'); // picking a friend up
      const at = boardPixel(ev);
      if (at) S.drag = { id: p.id, from: at, at, moved: false };
      canvas.setPointerCapture(ev.pointerId);
    }
    hintEl.innerHTML = tapHint(p);
  } else {
    S.selected = null;
    S.inspect = null;
    hintEl.innerHTML = restingHint();
  }
  refreshHud();
});

canvas.addEventListener('pointermove', (ev) => {
  if (!S.fight || S.phase !== 'player') return;
  if (S.drag) {
    const at = boardPixel(ev);
    if (!at) return;
    S.drag.at = at;
    if (Math.hypot(at.x - S.drag.from.x, at.y - S.drag.from.y) > DRAG_SLOP) S.drag.moved = true;
    const c = cellFromEvent(ev);
    if (c) S.inspect = c;
    return;
  }
  const c = cellFromEvent(ev);
  if (c && S.selected == null) S.inspect = c;
});

canvas.addEventListener('pointerup', (ev) => {
  if (!S.drag) return;
  const d = S.drag;
  S.drag = null;
  if (canvas.hasPointerCapture(ev.pointerId)) canvas.releasePointerCapture(ev.pointerId);
  if (!d.moved) return; // a tap: the piece stays picked up, waiting for its square
  const c = cellFromEvent(ev);
  // dropped somewhere it can't go — the critter hops back and stays selected,
  // so a misjudged drag costs nothing
  if (c && legalTarget(d.id, c)) attemptMove(d.id, c);
});

canvas.addEventListener('pointercancel', () => {
  S.drag = null;
});
