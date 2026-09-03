// The trail: where the run is on its path, drawn instead of told — plus the
// faces that go with it (who's in this clearing, what the journal has met).
import {
  FIGHTS_PER_REGION,
  isBossIndex,
  REGION_NAMES,
  regionOf,
  SURFACE_REGIONS,
  type FightSpec,
} from '../game/ladder';
import { KIND_INFO, type RunState } from '../game/run';
import type { Kind } from '../game/types';
import { iconEl } from '../render/icons';
import { drawSprite, SPRITE_SIZE } from '../render/sprites';
import { plural } from './hud';
import type { Journal } from './storage';

/** Every bramble creature there is, in the order the run meets them. */
export const BRAMBLE_KINDS: Kind[] = ['thistle', 'tumbleweed', 'creeper', 'golem', 'gloom', 'heart'];

/** A critter face on its own little canvas; an unmet one is a dark silhouette. */
export function face(kind: Kind, met = true): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = SPRITE_SIZE;
  cv.height = SPRITE_SIZE;
  const c = cv.getContext('2d')!;
  drawSprite(c, kind, 0, 0);
  if (!met) {
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = '#4a4360';
    c.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
  }
  return cv;
}

/**
 * The path through the regions, one row each: cleared clearings are flowers,
 * the Keeper stands on the current one, the campfire and each region's Heart
 * sit where they fall. Past the Bramble Heart the rows only appear once the
 * player has chosen to go down there — until then it's a single dim "below".
 */
export function trailEl(run: RunState): HTMLElement {
  const el = document.createElement('div');
  el.className = 'trail';
  const regions = run.deep ? REGION_NAMES.length : SURFACE_REGIONS;
  const hereRegion = regionOf(run.fightIndex);
  for (let r = 0; r < regions; r++) {
    const row = document.createElement('div');
    row.className = 'trail-row' + (r === hereRegion ? ' here' : r < hereRegion ? ' done' : '');
    const name = document.createElement('span');
    name.className = 'trail-name';
    name.textContent = REGION_NAMES[r];
    const path = document.createElement('span');
    path.className = 'trail-path';
    for (let k = 0; k < FIGHTS_PER_REGION; k++) {
      const i = r * FIGHTS_PER_REGION + k;
      if (k > 0) path.append(seg());
      if (isBossIndex(i)) {
        // the campfire sits on the path just before the Heart
        path.append(node('camp', i, run), seg());
      }
      path.append(node(isBossIndex(i) ? 'boss' : 'clearing', i, run));
    }
    row.append(name, path);
    el.append(row);
  }
  if (!run.deep) {
    const row = document.createElement('div');
    row.className = 'trail-row beyond';
    const name = document.createElement('span');
    name.className = 'trail-name';
    name.textContent = '…and below';
    const path = document.createElement('span');
    path.className = 'trail-path';
    const n = document.createElement('span');
    n.className = 'node dim';
    n.append(iconEl('question'));
    path.append(n);
    row.append(name, path);
    el.append(row);
  }
  return el;
}

function seg(): HTMLElement {
  const s = document.createElement('i');
  s.className = 'seg';
  return s;
}

function node(what: 'clearing' | 'boss' | 'camp', i: number, run: RunState): HTMLElement {
  const n = document.createElement('span');
  n.className = 'node';
  if (what === 'camp') {
    // the fire is lit once the band has sat at it — that's on the way to clearing i
    n.append(iconEl('fire'));
    if (run.fightIndex < i) n.classList.add('dim');
    return n;
  }
  if (i < run.fightIndex) {
    // cleared: it bloomed. A fallen Heart earns the bigger flower.
    n.classList.add('done');
    n.append(iconEl(what === 'boss' ? 'bloom' : 'daisy'));
  } else if (i === run.fightIndex) {
    n.classList.add('here');
    n.append(face('keeper'));
  } else if (what === 'boss') {
    n.classList.add('dim');
    n.append(face('heart'));
  } else {
    const dot = document.createElement('span');
    dot.className = 'dot';
    n.append(dot);
  }
  return n;
}

/**
 * Who's waiting in this clearing: one face per bramble creature, and a name
 * under any kind the journal hasn't met yet — the "new creature" moment.
 */
export function castHere(spec: FightSpec, journal: Journal): HTMLElement {
  const el = document.createElement('div');
  el.className = 'cast-here';
  const seen = new Set<Kind>();
  for (const e of spec.enemies) {
    const who = document.createElement('span');
    who.className = 'who';
    who.append(face(e.kind));
    if (!journal.met.includes(e.kind) && !seen.has(e.kind)) {
      seen.add(e.kind);
      who.classList.add('new');
      const tag = document.createElement('span');
      tag.textContent = `new: ${KIND_INFO[e.kind].title}`;
      who.append(tag);
    }
    el.append(who);
  }
  return el;
}

/** The title's journal: every bramble creature, filled in as it's met, and a line of totals. */
export function journalStrip(journal: Journal): HTMLElement | null {
  if (journal.runs === 0) return null;
  const el = document.createElement('div');
  el.className = 'journal';
  const faces = document.createElement('div');
  faces.className = 'faces';
  for (const k of BRAMBLE_KINDS) faces.append(face(k, journal.met.includes(k)));
  el.append(faces);
  const line = document.createElement('span');
  line.className = 'scene-note';
  const met = BRAMBLE_KINDS.filter((k) => journal.met.includes(k)).length;
  const bits = [`${met} of ${BRAMBLE_KINDS.length} creatures met`];
  if (journal.deepest >= 0)
    bits.push(`deepest: ${REGION_NAMES[regionOf(journal.deepest)]}, clearing ${journal.deepest + 1}`);
  bits.push(plural(journal.runs, 'run'));
  if (journal.wins) bits.push(plural(journal.wins, 'win'));
  line.textContent = bits.join(' · ');
  el.append(line);
  return el;
}
