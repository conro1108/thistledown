// The trail: where the run is on its path, drawn instead of told — plus the
// faces that go with it (who's in this clearing, what the journal has met).
import {
  DEEP_FIGHTS,
  FIGHTS_PER_REGION,
  isBossIndex,
  isDeep,
  REGION_NAMES,
  regionOf,
  SURFACE_FIGHTS,
  SURFACE_REGIONS,
  type FightSpec,
} from '../game/ladder';
import { KIND_INFO, type RunState } from '../game/run';
import type { Kind } from '../game/types';
import { iconEl } from '../render/icons';
import { drawSprite, SPRITE_SIZE } from '../render/sprites';
import { plural } from './hud';
import { met, type Journal } from './storage';

/** Every bramble creature there is, in the order the run meets them. */
export const BRAMBLE_KINDS: Kind[] = ['thistle', 'tumbleweed', 'creeper', 'golem', 'gloom', 'heart'];

/** "Clearing 7 of 16" / "Clearing 2 of 8 below the Heart" — the one way to say where. */
export function whereLabel(fightIndex: number): string {
  return isDeep(fightIndex)
    ? `Clearing ${fightIndex - SURFACE_FIGHTS + 1} of ${DEEP_FIGHTS} below the Heart`
    : `Clearing ${fightIndex + 1} of ${SURFACE_FIGHTS}`;
}

/** A critter face on its own little canvas; an unmet one is a dark silhouette. */
export function face(kind: Kind, isMet = true): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = SPRITE_SIZE;
  cv.height = SPRITE_SIZE;
  cv.setAttribute('role', 'img');
  cv.setAttribute('aria-label', isMet ? KIND_INFO[kind].title : 'an unmet creature');
  const c = cv.getContext('2d')!;
  drawSprite(c, kind, 0, 0);
  if (!isMet) {
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = '#4a4360';
    c.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
  }
  return cv;
}

/**
 * The path through the regions, one row each: cleared clearings are flowers,
 * the Keeper stands on the current one, the campfire and each region's Heart
 * sit where they fall. The rows past the Bramble Heart only appear once the
 * player has chosen to go down there — until then it's a single dim "below",
 * except at the crossroads itself (`showDeep`), where the choice gets its picture.
 */
export function trailEl(run: RunState, opts: { still?: boolean; showDeep?: boolean } = {}): HTMLElement {
  const el = document.createElement('div');
  el.className = 'trail' + (opts.still ? ' still' : '');
  const regions = run.deep || opts.showDeep ? REGION_NAMES.length : SURFACE_REGIONS;
  const hereRegion = regionOf(run.fightIndex);
  for (let r = 0; r < regions; r++) {
    const row = document.createElement('div');
    const beyond = !run.deep && r >= SURFACE_REGIONS;
    row.className = 'trail-row' + (r === hereRegion && !beyond ? ' here' : beyond ? ' beyond' : '');
    const name = document.createElement('span');
    name.className = 'trail-name';
    name.textContent = REGION_NAMES[r].replace(/^The /, '');
    const path = document.createElement('span');
    path.className = 'trail-path';
    for (let k = 0; k < FIGHTS_PER_REGION; k++) {
      const i = r * FIGHTS_PER_REGION + k;
      if (k > 0) path.append(seg());
      if (isBossIndex(i)) {
        // the campfire sits on the path just before the Heart
        path.append(node('camp', i, run, beyond), seg());
      }
      path.append(node(isBossIndex(i) ? 'boss' : 'clearing', i, run, beyond));
    }
    row.append(name, path);
    el.append(row);
  }
  if (regions === SURFACE_REGIONS) {
    const row = document.createElement('div');
    row.className = 'trail-row beyond';
    const name = document.createElement('span');
    name.className = 'trail-name';
    name.textContent = '…and below';
    const path = document.createElement('span');
    path.className = 'trail-path';
    const n = document.createElement('span');
    n.className = 'node';
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

function node(what: 'clearing' | 'boss' | 'camp', i: number, run: RunState, beyond: boolean): HTMLElement {
  const n = document.createElement('span');
  n.className = 'node';
  if (what === 'camp') {
    // the fire is lit once the band has sat at it — that's on the way to clearing i
    n.append(iconEl('fire'));
    if (run.fightIndex < i && !beyond) n.classList.add('dim');
    return n;
  }
  if (i < run.fightIndex) {
    // cleared: it bloomed. A fallen Heart earns the bigger flower.
    n.append(iconEl(what === 'boss' ? 'bloom' : 'daisy'));
  } else if (i === run.fightIndex && !beyond) {
    n.classList.add('here');
    n.append(face('keeper'));
  } else if (what === 'boss') {
    if (!beyond) n.classList.add('dim');
    n.append(face('heart'));
  } else {
    const dot = document.createElement('span');
    dot.className = 'dot';
    n.append(dot);
  }
  return n;
}

/** A row of named faces: `tag` marks the ones that deserve the lantern. */
function facesRow(kinds: { kind: Kind; count: number; isNew: boolean }[]): HTMLElement {
  const el = document.createElement('div');
  el.className = 'cast-here';
  for (const { kind, count, isNew } of kinds) {
    const who = document.createElement('span');
    who.className = 'who' + (isNew ? ' new' : '');
    who.append(face(kind));
    const name = document.createElement('span');
    name.textContent = `${isNew ? 'new! ' : ''}${KIND_INFO[kind].title}${count > 1 ? ` ×${count}` : ''}`;
    who.append(name);
    el.append(who);
  }
  return el;
}

/**
 * Who's waiting in this clearing: one face per kind (with a count), and the
 * lantern on any kind the journal hasn't met yet — the "new creature" moment.
 */
export function castHere(spec: FightSpec, journal: Journal): HTMLElement {
  const counts = new Map<Kind, number>();
  for (const e of spec.enemies) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
  return facesRow([...counts].map(([kind, count]) => ({ kind, count, isNew: !met(journal, kind) })));
}

/** The creatures first met on this run — the loss recap's consolation. */
export function metRow(kinds: Kind[]): HTMLElement {
  return facesRow(kinds.map((kind) => ({ kind, count: 1, isNew: true })));
}

/**
 * The title's journal: every bramble creature, filled in as it's met (tap one
 * you've met to hear how it moves), and a line of totals.
 */
export function journalStrip(journal: Journal, onFace: (kind: Kind) => void): HTMLElement | null {
  if (journal.runs === 0) return null;
  const el = document.createElement('div');
  el.className = 'journal';
  const faces = document.createElement('div');
  faces.className = 'faces';
  for (const k of BRAMBLE_KINDS) {
    const isMet = met(journal, k);
    const f = face(k, isMet);
    if (isMet) {
      f.classList.add('tap');
      f.onclick = () => onFace(k);
    }
    faces.append(f);
  }
  el.append(faces);
  const line = document.createElement('span');
  line.className = 'scene-note';
  const metCount = BRAMBLE_KINDS.filter((k) => met(journal, k)).length;
  const bits = [`${metCount} of ${BRAMBLE_KINDS.length} creatures met`];
  if (journal.deepest >= 0) bits.push(`deepest: ${whereLabel(journal.deepest).toLowerCase()}`);
  bits.push(plural(journal.runs, 'run'));
  if (journal.wins) bits.push(journal.deepWins ? `${plural(journal.wins, 'win')}, ${journal.deepWins} to the bottom` : plural(journal.wins, 'win'));
  line.textContent = bits.join(' · ');
  el.append(line);
  if (journal.wins > 0 && journal.deepWins === 0) {
    const tease = document.createElement('span');
    tease.className = 'scene-note';
    tease.textContent = 'The path below the Heart is still unwalked.';
    el.append(tease);
  }
  return el;
}
