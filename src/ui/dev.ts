// Dev panel: master difficulty, per-fight dials, run surgery, trinket toggles,
// seeded runs and repro export. ?dev in the URL or five taps on the clearing name.
import { NAIVE_DIALS } from '../game/fight';
import { scaleDials } from '../game/ladder';
import { TRINKETS } from '../game/run';
import { newSession } from '../game/session';
import { iconEl, iconHTML, type IconName } from '../render/icons';
import { devBtn, hudName, overlayEl } from './dom';
import { refreshHud } from './hud';
import { stageUi } from './screens';
import { S, SAVE_KEY, TRINKET_ICONS } from './state';
import { persist } from './storage';

// ---------- dev panel: see and tune everything ----------

/** Dev mode: ?dev in the URL, or five quick taps on the clearing name. */
let devMode =
  new URLSearchParams(location.search).has('dev') || localStorage.getItem('overgrown.dev') === '1';
let devTaps: number[] = [];

hudName.addEventListener('click', () => {
  const now = Date.now();
  devTaps = devTaps.filter((t) => now - t < 1800);
  devTaps.push(now);
  if (devTaps.length >= 5) {
    devTaps = [];
    devMode = !devMode;
    try {
      localStorage.setItem('overgrown.dev', devMode ? '1' : '0');
    } catch {
      /* fine */
    }
    refreshHud();
  }
});

function markDevDirty() {
  if (S.devDirty) return;
  S.devDirty = true;
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* fine */
  }
}

/** Jump the run to a clearing (dev only): session surgery, then the normal intro flow. */
function devJump(idx: number) {
  if (!S.sess) return;
  markDevDirty();
  S.sess.run.fightIndex = Math.max(0, Math.min(S.sess.run.fights.length - 1, idx));
  S.sess.run.status = 'playing';
  S.sess.fight = null;
  S.sess.stage = 'intro';
  S.run = S.sess.run;
  S.fight = null;
  stageUi();
}

interface DevField {
  label: string;
  get: () => number;
  set: (v: number) => void;
  step?: number;
}

function devRow(f: DevField): HTMLLabelElement {
  const row = document.createElement('label');
  row.className = 'dev-row';
  const span = document.createElement('span');
  span.textContent = f.label;
  const input = document.createElement('input');
  input.type = 'number';
  input.step = String(f.step ?? 0.1);
  input.value = String(Math.round(f.get() * 100) / 100);
  input.onchange = () => {
    const v = parseFloat(input.value);
    if (Number.isNaN(v)) return;
    markDevDirty();
    f.set(v);
    refreshHud();
  };
  row.append(span, input);
  return row;
}

function devSection(parent: HTMLElement, title: string): HTMLDivElement {
  const h = document.createElement('h3');
  h.textContent = title;
  const box = document.createElement('div');
  box.className = 'dev-grid';
  parent.append(h, box);
  return box;
}

function showDevPanel() {
  if (!S.sess || !S.run) return;
  overlayEl.innerHTML = `<div class="card dev"><h2>${iconHTML('wrench', 'p2')} Dev</h2><div class="dev-body"></div><div class="btns"><button class="close">Close</button></div></div>`;
  const body = overlayEl.querySelector<HTMLDivElement>('.dev-body')!;
  overlayEl.querySelector<HTMLButtonElement>('.close')!.onclick = () => {
    overlayEl.classList.add('hidden');
    refreshHud();
    // the dev panel can clobber a mandatory choice scene (trinket/camp/promotion)
    // that was showing underneath it — restore whatever the stage actually calls for
    if (S.sess && S.sess.stage !== 'fight') stageUi();
  };

  const note = document.createElement('p');
  note.className = 'dev-note';
  note.innerHTML = S.devDirty
    ? `${iconHTML('warning')} hand-tuned session: saving and look-back are off until a new run`
    : 'tuning anything turns off saving and look-back for this session';
  body.append(note);

  // High-level difficulty: one slider that bends every clearing's authored
  // bramble smarts, so you can feel out a play style without touching the
  // per-fight dials below (those still work for one-off tuning).
  const diffBox = devSection(body, 'master difficulty (scales every clearing’s smarts)');
  const diffRow = document.createElement('label');
  diffRow.className = 'dev-row dev-diff';
  const diffLabel = document.createElement('span');
  const diffSlider = document.createElement('input');
  diffSlider.type = 'range';
  diffSlider.min = '0';
  diffSlider.max = '2';
  diffSlider.step = '0.1';
  const readout = () => {
    const v = S.run!.difficulty ?? 1;
    diffLabel.textContent =
      v === 0 ? 'naive (0.0×)' : v < 1 ? `easier (${v.toFixed(1)}×)` : v === 1 ? 'as authored (1.0×)' : `sharper (${v.toFixed(1)}×)`;
    diffSlider.value = String(v);
  };
  readout();
  const setDifficulty = (v: number) => {
    markDevDirty();
    S.run!.difficulty = v;
    // reflect it on the live fight right away by re-deriving from this
    // clearing's authored dials; future clearings pick it up when they build
    if (S.fight && S.fight.status === 'playing') {
      const spec = S.run!.fights[S.run!.fightIndex];
      S.fight.dials = { ...NAIVE_DIALS, ...scaleDials(spec.dials, v) };
    }
    readout();
    refreshHud();
  };
  diffSlider.oninput = () => {
    const v = parseFloat(diffSlider.value);
    if (!Number.isNaN(v)) setDifficulty(v);
  };
  diffRow.append(diffLabel, diffSlider);
  diffBox.append(diffRow);
  // named style presets: one tap to a whole play-feel, no dial fiddling
  const STYLES: { icon: IconName; label: string; factor: number }[] = [
    { icon: 'teacup', label: 'Cozy', factor: 0 },
    { icon: 'fern', label: 'Gentle', factor: 0.5 },
    { icon: 'scales', label: 'Balanced', factor: 1 },
    { icon: 'fire', label: 'Sharp', factor: 1.5 },
    { icon: 'wolf', label: 'Relentless', factor: 2 },
  ];
  for (const st of STYLES) {
    const b = document.createElement('button');
    b.append(iconEl(st.icon), ` ${st.label}`);
    b.onclick = () => setDifficulty(st.factor);
    diffBox.append(b);
  }

  if (S.fight && S.fight.status === 'playing') {
    const f = S.fight;
    const dials = devSection(body, `${f.name} — bramble mind (applies from its next telegraph)`);
    dials.append(
      devRow({ label: 'foresight', get: () => f.dials.foresight, set: (v) => (f.dials.foresight = v) }),
      devRow({ label: 'caution', get: () => f.dials.caution, set: (v) => (f.dials.caution = v) }),
      devRow({ label: 'bloodlust', get: () => f.dials.bloodlust, set: (v) => (f.dials.bloodlust = v) }),
      devRow({ label: 'temperature', get: () => f.dials.temperature, set: (v) => (f.dials.temperature = v) }),
      devRow({ label: 'acts/turn', get: () => f.actsPerTurn, set: (v) => (f.actsPerTurn = Math.max(1, Math.round(v))), step: 1 }),
    );
    const clock = devSection(body, 'spread clock & charges');
    if (f.spread) {
      const c = f.spread;
      clock.append(
        devRow({ label: 'after turn', get: () => c.after, set: (v) => (c.after = Math.round(v)), step: 1 }),
        devRow({ label: 'every', get: () => c.every, set: (v) => (c.every = Math.max(1, Math.round(v))), step: 1 }),
        devRow({ label: 'cap', get: () => c.cap, set: (v) => (c.cap = Math.round(v)), step: 1 }),
        devRow({ label: 'gate (mat %)', get: () => c.startAt ?? 0.6, set: (v) => (c.startAt = Math.max(0, Math.min(1, v))), step: 0.1 }),
      );
    }
    clock.append(
      devRow({ label: 'cloak charges', get: () => f.cloakLeft, set: (v) => (f.cloakLeft = Math.max(0, Math.round(v))), step: 1 }),
      devRow({ label: 'ward charges', get: () => f.wardLeft, set: (v) => (f.wardLeft = Math.max(0, Math.round(v))), step: 1 }),
      devRow({ label: 'whistle swaps', get: () => f.swapLeft, set: (v) => (f.swapLeft = Math.max(0, Math.round(v))), step: 1 }),
      devRow({ label: 'free moves', get: () => f.freeMoves, set: (v) => (f.freeMoves = Math.max(0, Math.round(v))), step: 1 }),
    );
  }

  const runBox = devSection(body, `run — seed ${S.run.seed}, clearing ${S.run.fightIndex + 1}/${S.run.fights.length}`);
  const mkBtn = (label: string, fn: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = () => {
      overlayEl.classList.add('hidden');
      fn();
    };
    return b;
  };
  runBox.append(
    mkBtn('◀ prev clearing', () => devJump(S.run!.fightIndex - 1)),
    mkBtn('↻ restart clearing', () => devJump(S.run!.fightIndex)),
    mkBtn('next clearing ▶', () => devJump(S.run!.fightIndex + 1)),
    mkBtn('heal roster', () => {
      markDevDirty();
      for (const c of S.run!.companions) c.shaken = false;
      refreshHud();
    }),
  );

  const toggles = devSection(body, 'sight & trinkets');
  const veilBtn = document.createElement('button');
  const veilLabel = () => `shroud x-ray: ${S.revealVeiled ? 'ON' : 'off'}`;
  veilBtn.textContent = veilLabel();
  veilBtn.onclick = () => {
    S.revealVeiled = !S.revealVeiled; // render-only: the log stays replayable
    veilBtn.textContent = veilLabel();
  };
  toggles.append(veilBtn);
  for (const id of Object.keys(TRINKETS) as (keyof typeof TRINKETS)[]) {
    const b = document.createElement('button');
    const label = () => `${iconHTML(TRINKET_ICONS[id])} ${S.run!.trinkets.includes(id) ? 'ON' : 'off'}`;
    b.innerHTML = label();
    b.onclick = () => {
      markDevDirty();
      S.run!.trinkets = S.run!.trinkets.includes(id)
        ? S.run!.trinkets.filter((t) => t !== id)
        : [...S.run!.trinkets, id];
      b.innerHTML = label();
      refreshHud();
    };
    toggles.append(b);
  }

  const seedBox = devSection(body, 'new run from seed');
  const seedInput = document.createElement('input');
  seedInput.type = 'number';
  seedInput.value = String(S.run.seed);
  seedBox.append(
    seedInput,
    mkBtn('grow this meadow', () => {
      const seed = parseInt(seedInput.value, 10);
      S.sess = newSession(Number.isNaN(seed) ? Date.now() % 2147483647 : seed);
      S.devDirty = false; // a fresh seeded session replays fine
      persist();
      stageUi();
    }),
  );

  // Repro export: the whole run as seed + decision log. This replays to the
  // exact board — pieces, IDs, RNG and telegraphs — so a bug caught here comes
  // back precisely in a test. (A dev-dirtied session won't replay; say so.)
  const repro = devSection(
    body,
    S.devDirty ? 'repro export — ⚠ dev-tuned, will NOT replay' : 'repro export (seed + log → exact replay)',
  );
  const payload = () => JSON.stringify({ seed: S.sess!.run.seed, log: S.sess!.log });
  const ta = document.createElement('textarea');
  ta.className = 'dev-dump';
  ta.readOnly = true;
  ta.rows = 4;
  ta.value = payload();
  const copyBtn = document.createElement('button');
  const resetLabel = () => (copyBtn.textContent = '📋 Copy game');
  resetLabel();
  copyBtn.onclick = async () => {
    ta.value = payload();
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, ta.value.length); // iOS: select the whole field
    let ok = false;
    try {
      await navigator.clipboard.writeText(ta.value);
      ok = true;
    } catch {
      /* PWA clipboard can be blocked — fall back to the manual selection below */
    }
    copyBtn.textContent = ok ? '✓ Copied' : 'Selected ↑ — copy manually';
    setTimeout(resetLabel, 1600);
  };
  repro.append(copyBtn, ta);

  if (S.fight) {
    const dump = document.createElement('pre');
    dump.className = 'dev-dump';
    dump.textContent = JSON.stringify(
      {
        turn: S.fight.turn,
        status: S.fight.status,
        dials: S.fight.dials,
        spread: S.fight.spread ?? null,
        pendingSprout: S.fight.pendingSprout,
        telegraphs: S.fight.telegraphs,
        pieces: S.fight.pieces.map((p) => `#${p.id} ${p.side[0]} ${p.kind} @${p.x},${p.y}${p.stunned ? ' stunned' : ''}${p.fickle ? ' fickle' : ''}${p.veiled ? ' veiled' : ''}`),
      },
      null,
      1,
    );
    body.append(dump);
  }

  overlayEl.classList.remove('hidden');
}

devBtn.onclick = showDevPanel;
