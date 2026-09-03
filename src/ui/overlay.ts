// Overlay cards: the plain dialog, the between-fights choice scene, the title,
// region theming of the card chrome, and petal confetti.
import type { Kind } from '../game/types';
import { iconEl, iconHTML, type IconName } from '../render/icons';
import { drawSprite } from '../render/sprites';
import type { RegionTheme } from '../render/themes';
import { overlayEl } from './dom';
import { plural } from './hud';
import { loadScores } from './storage';

// ---------- overlays ----------

export interface Choice {
  label: string;
  sub?: string;
  fn: () => void;
}

/** `above` slots built elements (a trail, a cast) between the title and the body. */
export function showOverlay(title: string, body: string, choices: Choice[], above: HTMLElement[] = []) {
  overlayEl.innerHTML = `<div class="card"><h2>${title}</h2><p>${body}</p><div class="btns"></div></div>`;
  overlayEl.querySelector('h2')!.after(...above);
  const btns = overlayEl.querySelector('.btns')!;
  for (const c of choices) {
    const b = document.createElement('button');
    b.innerHTML = c.sub ? `${c.label}<small>${c.sub}</small>` : c.label;
    b.onclick = () => {
      overlayEl.classList.add('hidden');
      c.fn();
    };
    btns.append(b);
  }
  overlayEl.classList.remove('hidden');
}

// ---------- choice scenes ----------

export interface SceneOption {
  /** the card's face: a critter sprite… */
  kind?: Kind;
  /** …or a pixel icon (trinkets, campfire comforts) */
  icon?: IconName;
  label: string;
  detail: string;
  /** short move phrase shown under the name in the compact 'row' layout */
  caption?: string;
  fn: () => void;
}

/**
 * The between-fights picker: one tap commits, no preview box, no confirm step.
 *
 * Two layouts share this builder. The default 'list' stacks wide rows (sprite +
 * name + blurb) — used by the campfire and trinket scenes. The 'row' layout
 * lays out square cards side by side (sprite + name + short caption), and for
 * critters that glide in straight lines it paints a faint +/×/✳ of movement
 * rays behind the sprite — a quiet, wordless hint of reach. Steppers and
 * leapers get no such background; their one-line caption already says it.
 */
export function showChoiceScene(
  title: string,
  body: string,
  options: SceneOption[],
  layout: 'list' | 'row' = 'list',
) {
  overlayEl.innerHTML = `<div class="card"><h2></h2><p class="scene-body"></p>
    <div class="opts"></div></div>`;
  // titles and bodies are app-authored strings that may carry inline icons
  overlayEl.querySelector('h2')!.innerHTML = title;
  overlayEl.querySelector('.scene-body')!.innerHTML = body;
  const optsEl = overlayEl.querySelector('.opts')!;
  if (layout === 'row') optsEl.classList.add('row');
  for (const o of options) {
    const b = document.createElement('button');
    b.className = 'opt';
    // a faint movement watermark behind slider critters (row layout only)
    const bgType = layout === 'row' && o.kind ? moveBgType(o.kind) : null;
    if (bgType) {
      const bg = document.createElement('canvas');
      bg.className = 'movebg';
      bg.width = 24;
      bg.height = 24;
      drawMoveBg(bg.getContext('2d')!, bgType);
      b.append(bg);
    }
    if (o.kind) {
      const cv = document.createElement('canvas');
      cv.className = 'face';
      cv.width = 12;
      cv.height = 12;
      drawSprite(cv.getContext('2d')!, o.kind, 0, 0);
      b.append(cv);
    } else {
      b.append(iconEl(o.icon ?? 'question', 'face'));
    }
    const nm = document.createElement('span');
    nm.className = 'name';
    nm.textContent = o.label;
    b.append(nm);
    if (layout === 'row') {
      if (o.caption) {
        const cap = document.createElement('span');
        cap.className = 'cap';
        cap.textContent = o.caption;
        b.append(cap);
      }
    } else {
      const blurb = document.createElement('span');
      blurb.className = 'blurb';
      blurb.textContent = o.detail;
      b.append(blurb);
    }
    b.onclick = () => {
      overlayEl.classList.add('hidden');
      o.fn();
    };
    optsEl.append(b);
  }
  overlayEl.classList.remove('hidden');
}

/** Which faint movement watermark, if any, a critter earns behind its card. */
function moveBgType(kind: Kind): '+' | 'x' | '*' | null {
  if (kind === 'rumble' || kind === 'golem') return '+'; // straight-line sliders
  if (kind === 'slink' || kind === 'creeper') return 'x'; // diagonal sliders
  if (kind === 'duchess' || kind === 'gloom') return '*'; // glide any direction
  return null; // steppers, leapers, kings: caption alone
}

/**
 * A faint background of movement rays for a card: '+' orthogonal, '×' diagonal,
 * '✳' both. Drawn center-out with little arrowheads on a 24×24 buffer, integer-
 * scaled and dimmed by CSS so it reads as a watermark, not a diagram.
 */
function drawMoveBg(c: CanvasRenderingContext2D, type: '+' | 'x' | '*') {
  const mid = 12;
  c.fillStyle = '#ffd966';
  const px = (x: number, y: number) => c.fillRect(x, y, 1, 1);
  const ray = (dx: number, dy: number) => {
    let x = mid;
    let y = mid;
    for (let i = 0; i < 9; i++) {
      x += dx;
      y += dy;
      px(x, y);
    }
    px(x - dx - dy, y - dy + dx); // arrowhead, flaring back from the tip
    px(x - dx + dy, y - dy - dx);
  };
  const dirs = type === '+' ? ORTHO_D : type === 'x' ? DIAG_D : [...ORTHO_D, ...DIAG_D];
  for (const [dx, dy] of dirs) ray(dx, dy);
}

const ORTHO_D = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const DIAG_D = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/** A 12×12 critter face for the title's cast strip. */
function castFace(kind: Kind): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.className = 'mini';
  cv.width = 12;
  cv.height = 12;
  drawSprite(cv.getContext('2d')!, kind, 0, 0);
  return cv;
}

/**
 * The title is a shop window, not a dialog box: a wordmark, the band itself
 * (art says "cozy critters" faster than any copy), one flavor line, and the
 * single rule a stranger needs before their first tap. showOverlay stays the
 * workhorse for every other card.
 */
export function showTitle(choices: Choice[], journal: HTMLElement | null) {
  overlayEl.innerHTML = `<div class="card title">
    <h1 class="wordmark">Overgrown</h1>
    <div class="cast"></div>
    <p class="scene-body">The meadow is overgrown. Lead your friends in and take it back.
      <span class="objective">${iconHTML('daisy')} Every bramble creature shows its next
      move. Catch one by landing on its square.</span></p>
    <div class="btns"></div></div>`;
  // the band on the path, and one thistle waiting across the gap
  const cast = overlayEl.querySelector('.cast')!;
  const band: Kind[] = ['sprout', 'hopper', 'keeper', 'slink', 'rumble'];
  for (const k of band) cast.append(castFace(k));
  const gap = document.createElement('span');
  gap.className = 'cast-gap';
  cast.append(gap, castFace('thistle'));
  if (journal) overlayEl.querySelector('.scene-body')!.after(journal);
  const runBest = loadScores().run;
  if (runBest !== undefined) {
    const best = document.createElement('span');
    best.className = 'scene-note';
    best.innerHTML = `${iconHTML('trophy')} Best run: ${plural(runBest, 'move')}`;
    (journal ?? overlayEl.querySelector('.scene-body')!).append(best);
  }
  const btns = overlayEl.querySelector('.btns')!;
  choices.forEach((c, i) => {
    const b = document.createElement('button');
    if (i === 0) b.className = 'primary'; // the lit path onward
    b.innerHTML = c.sub ? `${c.label}<small>${c.sub}</small>` : c.label;
    b.onclick = () => {
      overlayEl.classList.add('hidden');
      c.fn();
    };
    btns.append(b);
  });
  overlayEl.classList.remove('hidden');
}

/** Repaint the overlay/card chrome in the current region's palette. */
export function applyRegionTheme(theme: RegionTheme) {
  const root = document.documentElement.style;
  const c = theme.css;
  root.setProperty('--panel-solid', c.panel);
  root.setProperty('--panel-2', c.panel2);
  root.setProperty('--edge', c.edge);
  root.setProperty('--overlay-bg', c.scrim);
  root.setProperty('--accent', c.accent);
  root.setProperty('--ink', c.ink);
  root.setProperty('--ink-soft', c.inkSoft);
  const banner = (name: string, [edge, bg, ink]: [string, string, string]) => {
    root.setProperty(`--banner-${name}-edge`, edge);
    root.setProperty(`--banner-${name}-bg`, bg);
    root.setProperty(`--banner-${name}-ink`, ink);
  };
  banner('player', c.bannerPlayer);
  banner('enemy', c.bannerEnemy);
}

/** Flower confetti over the current overlay. Purely ceremonial. */
export function rainPetals() {
  const flowers: IconName[] = ['daisy', 'blossom', 'bloom', 'tulip'];
  for (let i = 0; i < 28; i++) {
    const p = document.createElement('span');
    p.className = 'petal';
    p.append(iconEl(flowers[i % flowers.length]));
    p.style.left = `${(i * 37 + 11) % 100}%`;
    p.style.animationDelay = `${(i % 7) * 0.45}s`;
    p.style.animationDuration = `${3 + (i % 5) * 0.6}s`;
    overlayEl.append(p);
  }
}
