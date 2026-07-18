/**
 * Per-region look. One palette drives both the swamp behind the board
 * (backdrop.ts), the grass under the pieces (scene.ts), and the overlay/card
 * chrome (CSS vars set from main.ts) — so each region reads as its own place
 * the moment you step into it, from the sky down to the campfire menu.
 *
 * Render-only: nothing here touches game state or the seeded RNG.
 */

export type SkyStop = [number, [number, number, number]];

/** How the drifting motes read: fireflies bob, spores sink, ash rises, etc. */
export type MoteStyle = 'firefly' | 'wisp' | 'spore' | 'ash' | 'frost';

export interface RegionTheme {
  /** sky ramp, zenith (0) → horizon (1) */
  sky: SkyStop[];
  treeFar: string;
  treeNear: string;
  ground: string;
  groundMottle: string;
  tuft: string;
  water: string;
  waterGlint: string;
  reed: string;
  cattail: string;
  fog: string;
  fogAlpha: number;
  /** the sky's lone light: a carved crescent (moon) or a full disc (sun) */
  orb: string;
  orbHalo: string; // "r,g,b" for the halo gradient
  crescent: boolean;
  /** drifting lights over the marsh */
  mote: string;
  moteStyle: MoteStyle;
  /** faintly glowing flora huddled bottom-left — off in the bright regions */
  glowFlora: string | null;
  /** the two checker greens the board tiles paint under the pieces */
  boardA: string;
  boardB: string;
  /** chrome: overlay scrim + card panel colours (the lantern accent stays global) */
  css: {
    panel: string;
    panel2: string;
    edge: string;
    scrim: string; // rgba behind the overlay cards
    accent: string; // secondary accent (objective/scene-note tint)
  };
}

// The Meadow — golden hour, warm and green, a low sun. The one bright, safe place.
const MEADOW: RegionTheme = {
  sky: [
    [0, [110, 154, 190]],
    [0.55, [176, 196, 168]],
    [0.82, [226, 206, 140]],
    [1, [236, 200, 120]],
  ],
  treeFar: '#6f9256',
  treeNear: '#4a6738',
  ground: '#7ba24f',
  groundMottle: '#6f9646',
  tuft: '#5f8a3c',
  water: '#5b86a0',
  waterGlint: '#bfe0e6',
  reed: '#5f8a3c',
  cattail: '#8a6a3a',
  fog: '#d8e0c4',
  fogAlpha: 0.28,
  orb: '#fff3c8',
  orbHalo: '255,238,180',
  crescent: false,
  mote: '#fff0a6',
  moteStyle: 'firefly',
  glowFlora: null,
  boardA: '#8fb45e',
  boardB: '#83a852',
  css: {
    panel: '#2c2a22',
    panel2: '#34301f',
    edge: '#5a5238',
    scrim: 'rgba(24, 20, 10, 0.78)',
    accent: '#a7c86a',
  },
};

// The Thicket — the wood closes in. Cooler, denser green under an overcast sky.
const THICKET: RegionTheme = {
  sky: [
    [0, [70, 96, 104]],
    [0.55, [92, 118, 108]],
    [0.85, [120, 146, 112]],
    [1, [140, 162, 118]],
  ],
  treeFar: '#3f6244',
  treeNear: '#26402c',
  ground: '#4d7248',
  groundMottle: '#446840',
  tuft: '#3a5c37',
  water: '#3f5f5a',
  waterGlint: '#7ba0a0',
  reed: '#3a5c37',
  cattail: '#6b5230',
  fog: '#aebfa6',
  fogAlpha: 0.34,
  orb: '#d7dcc4',
  orbHalo: '215,220,196',
  crescent: false,
  mote: '#cfe0a0',
  moteStyle: 'spore',
  glowFlora: null,
  boardA: '#6f9a4f',
  boardB: '#648f46',
  css: {
    panel: '#232a24',
    panel2: '#2a322a',
    edge: '#42513f',
    scrim: 'rgba(12, 20, 14, 0.8)',
    accent: '#84b271',
  },
};

// The Tanglewood — dusk pools purple-green, mist rising, a thin moon.
const TANGLEWOOD: RegionTheme = {
  sky: [
    [0, [44, 38, 62]],
    [0.5, [62, 58, 82]],
    [0.82, [82, 92, 88]],
    [1, [110, 116, 90]],
  ],
  treeFar: '#42504a',
  treeNear: '#26302e',
  ground: '#52603f',
  groundMottle: '#48563a',
  tuft: '#3d4c30',
  water: '#33454a',
  waterGlint: '#6a8a8c',
  reed: '#3d4c30',
  cattail: '#6e5236',
  fog: '#8b93a0',
  fogAlpha: 0.4,
  orb: '#e6e0d0',
  orbHalo: '230,224,208',
  crescent: true,
  mote: '#cdb8f0',
  moteStyle: 'wisp',
  glowFlora: '#c9a0e8',
  boardA: '#7a9a54',
  boardB: '#6f8f4a',
  css: {
    panel: '#282438',
    panel2: '#302a44',
    edge: '#463f5a',
    scrim: 'rgba(14, 10, 22, 0.82)',
    accent: '#b79ae0',
  },
};

// The Deep Bramble — the bog at the bottom of dusk. The game's original swamp.
const DEEP_BRAMBLE: RegionTheme = {
  sky: [
    [0, [23, 20, 36]],
    [0.5, [41, 42, 62]],
    [0.82, [56, 71, 66]],
    [1, [88, 102, 70]],
  ],
  treeFar: '#2c3d36',
  treeNear: '#1c2823',
  ground: '#46583a',
  groundMottle: '#3e4f33',
  tuft: '#37472d',
  water: '#25383e',
  waterGlint: '#4c6a6e',
  reed: '#37472d',
  cattail: '#5e4630',
  fog: '#6d7d70',
  fogAlpha: 0.4,
  orb: '#e9e4cc',
  orbHalo: '233,228,204',
  crescent: true,
  mote: '#d8eea6',
  moteStyle: 'wisp',
  glowFlora: '#c9a0e8',
  boardA: '#87aa56',
  boardB: '#7b9e4b',
  css: {
    panel: '#262233',
    panel2: '#2e2940',
    edge: '#443e58',
    scrim: 'rgba(10, 8, 16, 0.84)',
    accent: '#8fc460',
  },
};

// The Rotwood — the wood has gone sour. Sickly amber murk, drifting spores.
const ROTWOOD: RegionTheme = {
  sky: [
    [0, [34, 24, 26]],
    [0.5, [58, 40, 34]],
    [0.82, [92, 64, 40]],
    [1, [128, 92, 48]],
  ],
  treeFar: '#4a3b2c',
  treeNear: '#2a2018',
  ground: '#5a4a30',
  groundMottle: '#4f4029',
  tuft: '#6a5a2e',
  water: '#3a2e24',
  waterGlint: '#8a6a3e',
  reed: '#5a4a24',
  cattail: '#7a4a26',
  fog: '#9a8258',
  fogAlpha: 0.42,
  orb: '#d8b070',
  orbHalo: '216,176,112',
  crescent: true,
  mote: '#e0b060',
  moteStyle: 'spore',
  glowFlora: '#c8d060',
  boardA: '#8a8a44',
  boardB: '#7e7e3b',
  css: {
    panel: '#2c2318',
    panel2: '#352a1b',
    edge: '#564326',
    scrim: 'rgba(20, 12, 6, 0.84)',
    accent: '#c8b24e',
  },
};

// The Worldroot — the lightless bottom of everything. Cold indigo, pale roots.
const WORLDROOT: RegionTheme = {
  sky: [
    [0, [10, 10, 20]],
    [0.5, [18, 18, 34]],
    [0.82, [26, 30, 46]],
    [1, [34, 42, 56]],
  ],
  treeFar: '#20283a',
  treeNear: '#0f1420',
  ground: '#242c3a',
  groundMottle: '#1e2531',
  tuft: '#2c3550',
  water: '#141c2e',
  waterGlint: '#4a5a80',
  reed: '#2c3550',
  cattail: '#3a3352',
  fog: '#48506a',
  fogAlpha: 0.44,
  orb: '#cfe0ff',
  orbHalo: '180,200,255',
  crescent: true,
  mote: '#bcd0ff',
  moteStyle: 'frost',
  glowFlora: '#9fb8ff',
  boardA: '#4a6a6a',
  boardB: '#426060',
  css: {
    panel: '#1a1c2c',
    panel2: '#212436',
    edge: '#3a3f58',
    scrim: 'rgba(4, 6, 14, 0.88)',
    accent: '#8fa8e8',
  },
};

const THEMES: RegionTheme[] = [MEADOW, THICKET, TANGLEWOOD, DEEP_BRAMBLE, ROTWOOD, WORLDROOT];

export function themeFor(region: number): RegionTheme {
  return THEMES[Math.max(0, Math.min(THEMES.length - 1, region))];
}
