export interface Vec {
  x: number;
  y: number;
}

export type Kind =
  | 'keeper'
  | 'sprout'
  | 'hopper'
  | 'slink'
  | 'rumble'
  | 'duchess'
  | 'thistle'
  | 'tumbleweed'
  | 'creeper'
  | 'golem'
  | 'gloom'
  | 'heart';

export type Side = 'friend' | 'bramble';

/**
 * Movement upgrades: variant moves grafted onto a real piece. Each is a bend
 * of the base pattern (a Sprout that advances diagonally, a Slink that changes
 * colour) — seeing the piece bent is how players end up understanding the
 * straight version. Run-level and keyed by kind: owning one lifts every
 * companion of that kind, exactly like the Acorn Whistle lifts every Hopper.
 */
export type UpgradeId =
  | 'thornstep' // sprout: may advance one step diagonally forward (not just capture)
  | 'rootgrip' // sprout: may also step one square straight back
  | 'springheel' // hopper: may also step one square diagonally
  | 'sidestep' // slink: may also step one square orthogonally (change colour)
  | 'underbrush' // slink: its diagonal glide slips over the first friendly in the way
  | 'pivot'; // rumble: may also step one square diagonally

export interface Piece {
  id: number;
  side: Side;
  kind: Kind;
  x: number;
  y: number;
  /** honeycake'd: may also take a plain (non-capturing) one-step move */
  spry?: boolean;
  /** movement upgrades this piece carries (see UpgradeId) */
  upgrades?: UpgradeId[];
  /** commits to two squares and takes whichever is better when it moves */
  fickle?: boolean;
  /** commits like anyone else, but the player isn't shown the arrow */
  veiled?: boolean;
}

/** An enemy's committed next move. `to: null` means it has nowhere to go. */
export interface Telegraph {
  pieceId: number;
  to: Vec | null;
  /**
   * The friend this telegraph is a red *attack* on (the piece sitting on `to`
   * at telegraph time). A red projection means "I am attacking this piece," not
   * "I am moving to this square": if the target relocates but stays somewhere
   * this enemy can still legally capture it, the threat follows it there.
   */
  target?: number;
  /** fickle enemies: the committed second option */
  alt?: Vec | null;
  /** shrouded: the renderer draws a question, not an arrow */
  veiled?: boolean;
}

export type Rng = () => number;

/**
 * How sharply the bramble side weighs its moves. All zeros is the naive
 * greedy mind of region 1 — it gifts tempo and walks into danger, and being
 * punished for that is exactly what those early fights teach. Later regions
 * turn these up; strength-of-play is a difficulty dial like any other.
 */
export interface AiDials {
  /** 0..1 — sees the player's reply: recaptures after landing, free pre-captures */
  foresight: number;
  /** 0..1 — reluctance to finish a quiet move on a square the friends cover */
  caution: number;
  /** multiplier on capture appetite (1 = normal) */
  bloodlust: number;
  /** score jitter that keeps move choice from being robotic (0 = none) */
  temperature: number;
}

export interface FightEvent {
  type:
    | 'capture'
    | 'shaken'
    | 'blocked'
    | 'cloaked'
    | 'warded' // the Bramble Ward shrugged off a capture; the attacker recoiled
    | 'cornered'
    | 'tempo'
    | 'flee'
    | 'stir' // the spread clock marks a square — fair warning
    | 'sprouted' // …and a thistle grows there
    | 'smothered' // …unless a friend was standing on it
    | 'twisted'; // a thistle reached the friends' home row and promoted
  at: Vec;
  kind: Kind;
}

/**
 * The spread clock: linger past `after` turns and a thistle reinforcement
 * sprouts at the far edge every `every` turns (never past `cap` bramble
 * pieces). The anti-stall valve — camping a dead position stops being free.
 *
 * `startAt` gates it on progress, not just the clock: reinforcements stay
 * dormant until the bramble side has been thinned to this fraction of its
 * opening material. Beginners who take a while to line up their first captures
 * shouldn't get piled on while the clearing is still at full strength — the
 * spread is meant to punish camping a *winning* position, not a slow start.
 */
export interface SpreadConfig {
  after: number;
  every: number;
  cap: number;
  /** fraction (0..1) of opening bramble material to fall below first; default DEFAULT_SPREAD_GATE */
  startAt?: number;
}

export interface FightState {
  name: string;
  w: number;
  h: number;
  pieces: Piece[];
  telegraphs: Telegraph[];
  actsPerTurn: number;
  dials: AiDials;
  /** reinforcement clock, if this fight has one */
  spread?: SpreadConfig;
  /** where the next reinforcement will sprout (telegraphed one turn ahead) */
  pendingSprout: Vec | null;
  /** bramble material at the opening bell — the yardstick the spread gate reads */
  startMaterial: number;
  /** next fresh piece id (reinforcements need ids nothing else wears) */
  nextId: number;
  turn: number;
  status: 'playing' | 'won' | 'lost';
  rng: Rng;
  /** transient, drained by the renderer each frame */
  events: FightEvent[];
  /** a sprout reached the far edge — the turn is frozen until promote() is called */
  pendingPromotion: number | null;
  /** Dandelion Cloak charges left this fight */
  cloakLeft: number;
  /** Bramble Ward charges left this fight (negates a capture, Keeper included) */
  wardLeft: number;
  /** Second Breakfast: extra player moves banked for this fight */
  freeMoves: number;
  /** mid-extra-move: the Second Breakfast step is a stretch, not a snatch — no captures */
  freeMoveActive: boolean;
  /** Acorn Whistle is along (mid-fight promotions to hopper come out spry) */
  whistle: boolean;
}
