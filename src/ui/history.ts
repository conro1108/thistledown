// Look-back: replay the decision log's prefixes to step through this clearing.
import { replay } from '../game/session';
import type { FightState } from '../game/types';
import { hintEl, histLabel, histLive, histNext, histPrev, historyBar, historyBtn } from './dom';
import { refreshHud, restingHint } from './hud';
import { S } from './state';

// ---------- history: step back through the clearing ----------

/**
 * The decision log is the time machine: replaying its prefixes rebuilds every
 * board state this clearing has been through, exactly. View-only — the live
 * fight sits untouched underneath until "Back to now".
 */
function enterHistory() {
  if (!S.sess || !S.fight || S.phase !== 'player' || S.sess.stage !== 'fight') return;
  if (S.devDirty) return; // replay can't rebuild hand-tuned state
  let begin = -1;
  for (let i = S.sess.log.length - 1; i >= 0; i--) {
    if (S.sess.log[i].t === 'begin') {
      begin = i;
      break;
    }
  }
  if (begin < 0) return;
  const states: { f: FightState; label: string }[] = [];
  for (let k = begin + 1; k <= S.sess.log.length; k++) {
    const e = S.sess.log[k - 1];
    if (e.t !== 'begin' && e.t !== 'move' && e.t !== 'promote' && e.t !== 'resolve') continue;
    const rebuilt = replay(S.sess.run.seed, S.sess.log.slice(0, k));
    if (!rebuilt.fight) continue;
    const label =
      e.t === 'begin'
        ? 'the clearing, untouched'
        : e.t === 'resolve'
          ? `turn ${rebuilt.fight.turn - 1} · the bramble moved`
          : e.t === 'promote'
            ? `turn ${rebuilt.fight.turn} · something blossomed`
            : `turn ${rebuilt.fight.turn} · your move`;
    states.push({ f: rebuilt.fight, label });
  }
  if (states.length < 2) return; // nothing to look back on yet
  S.history = { states, idx: states.length - 1 };
  S.selected = null;
  S.inspect = null;
  historyBar.classList.remove('hidden');
  hintEl.innerHTML = 'Looking back. The meadow waits — nothing moves while you remember.';
  refreshHistoryBar();
  refreshHud();
}

function refreshHistoryBar() {
  if (!S.history) return;
  const last = S.history.states.length - 1;
  histPrev.disabled = S.history.idx === 0;
  histNext.disabled = S.history.idx === last;
  histLabel.textContent = S.history.idx === last ? 'now' : S.history.states[S.history.idx].label;
}

function exitHistory() {
  if (!S.history) return;
  S.history = null;
  historyBar.classList.add('hidden');
  hintEl.innerHTML = restingHint();
  refreshHud();
}

historyBtn.onclick = () => (S.history ? exitHistory() : enterHistory());
histPrev.onclick = () => {
  if (S.history && S.history.idx > 0) {
    S.history.idx--;
    refreshHistoryBar();
  }
};
histNext.onclick = () => {
  if (S.history && S.history.idx < S.history.states.length - 1) {
    S.history.idx++;
    refreshHistoryBar();
  }
};
histLive.onclick = exitHistory;
