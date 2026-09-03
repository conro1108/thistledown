// Run flow: which screen the session's stage calls for, and every card on the
// path — title, clearing intro, aftermath/recruit, trinket, campfire, promotion.
import { movesFor } from '../game/board';
import { DEEP_FIGHTS, REGION_NAMES, regionOf, themeRegion } from '../game/ladder';
import type { PromotionKind } from '../game/fight';
import { KIND_INFO, ROSTER_CAP, TEMP_LIFESPAN, TRINKETS, UPGRADES } from '../game/run';
import { movesThisClearing, newSession, retryFight, totalMoves } from '../game/session';
import { iconHTML, type IconName } from '../render/icons';
import { TILE } from '../render/scene';
import { themeFor } from '../render/themes';
import { canvas, hintEl, historyBar } from './dom';
import { cap, listKinds, plural, refreshHud, restingHint } from './hud';
import { applyRegionTheme, rainPetals, showChoiceScene, showOverlay, showTitle, type Choice, type SceneOption } from './overlay';
import { sizeCanvas } from './render';
import { MOVE_TAG, OBJECTIVE, S, TRINKET_ICONS, UPGRADE_ICONS } from './state';
import type { Kind } from '../game/types';
import {
  deepestIsThisRun,
  doEntry,
  loadJournal,
  loadSave,
  metThisRun,
  noteFight,
  noteRunStart,
  noteRunWon,
  persist,
  recordClearing,
  recordRun,
} from './storage';
import { castHere, journalStrip, metRow, trailEl, whereLabel } from './trail';
import { beginEnemyTurn, cancelBeat, drainEvents, proceedAfterPlayerAction, scheduleBeat } from './turn';

// ---------- run flow ----------

export function title() {
  applyRegionTheme(themeFor(0)); // the title sits at the meadow's edge
  // a run you never actually played (no moves yet) isn't worth resuming —
  // don't make the player choose between two identical fresh starts
  const loaded = loadSave();
  const saved = loaded && loaded.log.some((e) => e.t === 'move') ? loaded : null;
  const journal = loadJournal();
  const choices: Choice[] = [];
  if (saved) {
    const friends = saved.run.companions.filter((c) => !c.shaken).length + 1;
    const daily = saved.run.seed === dailySeed() ? 'Today’s meadow · ' : '';
    choices.push({
      label: 'Keep going',
      sub: `${daily}${whereLabel(saved.run.fightIndex)}, ${friends} of you on the path.`,
      fn: () => {
        S.sess = saved;
        stageUi();
      },
    });
  }
  choices.push({
    label: saved ? 'Start fresh' : 'Set out',
    sub: saved ? 'The old path grows over.' : undefined,
    fn: () => startRun(),
  });
  // the shared daily path is for the returning player; a first-timer gets one door
  if (journal.runs > 0) {
    choices.push({
      label: 'Today’s meadow',
      sub: `One shared path for everyone, just for today.${saved ? ' The old path grows over.' : ''}`,
      fn: () => startRun(dailySeed()),
    });
  }
  showTitle(choices, journalStrip(journal, bestiaryCard));
}

/** Tap a met creature on the title: how it moves, then back to the meadow's edge. */
function bestiaryCard(kind: Kind) {
  showOverlay(KIND_INFO[kind].title, KIND_INFO[kind].blurb, [{ label: 'Back', fn: title }], [metRow([kind])]);
}

/** The same meadow for everyone today — a small hash of the local date. */
function dailySeed(): number {
  const d = new Date();
  const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  let h = 2166136261;
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) % 2147483647;
}



function startRun(seed = Date.now() % 2147483647) {
  S.sess = newSession(seed);
  persist();
  stageUi();
}

/** Rewind to the top of the clearing that just went wrong and try it again. */
function retryClearing() {
  if (!S.sess) return;
  S.sess = retryFight(S.sess);
  persist();
  stageUi();
}

/** Show whatever screen the session's stage calls for. */


export function stageUi() {
  if (!S.sess) return;
  S.run = S.sess.run;
  S.fight = S.sess.fight;
  applyRegionTheme(themeFor(themeRegion(S.run.fightIndex, S.run.deep)));
  switch (S.sess.stage) {
    case 'intro':
      fightIntro();
      break;
    case 'fight':
    case 'promotion':
      enterFight(true);
      break;
    case 'post':
      endOfFightUi();
      break;
    case 'found':
      trinketFound();
      break;
    case 'camp':
      campStop();
      break;
    case 'crossroads':
      crossroadsUi();
      break;
    case 'over':
      endOfRunUi();
      break;
  }
}

/**
 * The clearing's edge: the trail (where you are, what's ahead), the faces
 * waiting in this clearing, then the one line of lesson. The map is the
 * picture; the text is the caption.
 */
function fightIntro() {
  if (!S.run) return;
  const run = S.run;
  const spec = run.fights[run.fightIndex];
  showOverlay(
    spec.name,
    `${spec.intro}<span class="objective">${iconHTML('daisy')} ${spec.objective ?? OBJECTIVE}</span>`,
    [
      {
        label: 'Onward',
        fn: () => {
          // a run counts from its first step in, not from the title button
          if (S.sess && S.sess.log.length === 0) noteRunStart();
          noteFight(run, spec);
          doEntry({ t: 'begin' });
          enterFight(false);
        },
      },
    ],
    [trailEl(run), castHere(spec, loadJournal())],
  );
}

/** Set up the board UI for the session's current fight (fresh or resumed). */
function enterFight(resume: boolean) {
  if (!S.sess || !S.sess.fight) return;
  S.fight = S.sess.fight;
  S.companionPieceId = new Map(S.sess.lineup.map((compIdx, j) => [compIdx, 2 + j]));
  S.phase = 'player';
  S.selected = null;
  S.inspect = null;
  S.fx = [];
  S.tweens = [];
  cancelBeat(); // a beat left over from the last clearing must never fire into this one
  S.frozenTelegraphs = null;
  S.blockedNote = null;
  S.savedBy = null;
  S.tempoKind = null;
  S.history = null;
  historyBar.classList.add('hidden');
  canvas.width = S.fight.w * TILE;
  canvas.height = S.fight.h * TILE;
  document.querySelector('#board-wrap')!.classList.remove('idle');
  requestAnimationFrame(sizeCanvas);
  hintEl.innerHTML = restingHint();
  refreshHud();
  if (resume && S.sess.stage === 'promotion') {
    promotionChoice();
    return;
  }
  if (resume && S.sess.resolveDue) {
    beginEnemyTurn();
    return;
  }
  maybeAutoWait();
}

/**
 * Stalemate guard: if nobody can move, say so loudly and let the bramble
 * take its turn rather than soft-locking the fight.
 */
export function maybeAutoWait() {
  if (!S.sess || !S.fight || S.fight.status !== 'playing' || S.phase !== 'player') return;
  if (S.sess.resolveDue || S.sess.stage !== 'fight') return;
  if (S.fight.pieces.some((p) => p.side === 'friend' && movesFor(S.fight!, p).length > 0)) return;
  hintEl.innerHTML = 'Everyone is hemmed in — nowhere to step! Hold tight…';
  scheduleBeat(900, beginEnemyTurn); // tappable-through, like the rest of the beat
}

/** The fight just ended in the session — show the aftermath. */
export function endOfFightUi() {
  if (!S.sess || !S.run) return;
  if (S.sess.stage === 'over') {
    endOfRunUi();
    return;
  }
  if (S.sess.stage === 'crossroads') {
    crossroadsUi();
    return;
  }
  // stage 'post': clearing won, maybe a recruit is watching
  const noteLine = clearingNote();

  if (!S.sess.recruitOffers) {
    const why =
      S.run.companions.length >= ROSTER_CAP
        ? 'Camp is full of friends already.'
        : 'The grass is quiet — no one new is watching this time.';
    showOverlay('Clearing won!', `${why}${noteLine}`, [
      {
        label: 'Onward',
        fn: () => {
          doEntry({ t: 'skip' });
          stageUi();
        },
      },
    ]);
    return;
  }

  showChoiceScene(
    'Clearing won!',
    `Someone shy is watching from the tall grass…${noteLine}`,
    [
      ...S.sess.recruitOffers.map((kind) => ({
        kind,
        label: KIND_INFO[kind].title,
        detail: KIND_INFO[kind].blurb,
        caption: MOVE_TAG[kind] ?? '',
        fn: () => {
          doEntry({ t: 'recruit', kind });
          stageUi();
        },
      })),
      {
        icon: 'leaf' as IconName,
        label: 'Travel light',
        detail: 'No new friends this time — a smaller band moves quicker through the grass.',
        caption: 'Smaller band, quicker going',
        fn: () => {
          doEntry({ t: 'skip' });
          stageUi();
        },
      },
    ],
    'row',
  );
}



/** The quiet line under a won clearing: the fewest-moves record, then who's sitting out. */
function clearingNote(): string {
  if (!S.sess || !S.run) return '';
  const shaken = S.run.companions.filter((c) => c.shaken).map((c) => c.kind);
  const shakenNote = shaken.length
    ? `${cap(listKinds(shaken))} ${shaken.length > 1 ? 'sit' : 'sits'} the next one out.`
    : '';
  const moves = movesThisClearing(S.sess);
  const rec = recordClearing(S.fight?.name ?? 'this clearing', moves);
  const movesNote = rec.improved
    ? `Cleared in ${plural(moves, 'move')} — a new best! ${iconHTML('sparkle')}`
    : rec.best !== undefined
      ? `Cleared in ${plural(moves, 'move')} (best ${rec.best}).`
      : `Cleared in ${plural(moves, 'move')}.`;
  const note = [movesNote, shakenNote].filter(Boolean).join(' ');
  return note ? `<span class="scene-note">${note}</span>` : '';
}

/** A lost run still leaves something behind: how far, and who you met. */
function endOfRunUi() {
  if (!S.run || !S.sess) return;
  const run = S.run;
  if (run.status === 'lost') {
    const journal = loadJournal();
    const i = run.fightIndex;
    const record = deepestIsThisRun(journal) && journal.deepest === i;
    const fresh = metThisRun(journal);
    const daily = run.seed === dailySeed() ? 'Today’s meadow · ' : '';
    const where = `${daily}${whereLabel(i)} — ${REGION_NAMES[regionOf(i)]}.`;
    const above = [trailEl(run, { still: true })];
    if (fresh.length) above.push(metRow(fresh));
    showOverlay(
      'The lantern goes out',
      `The brambles got the Keeper in ${S.fight?.name ?? 'the meadow'}.` +
        (record ? `<span class="objective">${iconHTML('trophy')} Your deepest yet — ${where}</span>` : `<span class="scene-note">${where}</span>`),
      [
        {
          label: 'Retry this clearing',
          sub: 'Back to the start of this fight — same friends, same meadow.',
          primary: true,
          fn: retryClearing,
        },
        { label: 'Start over', sub: 'A whole new meadow from the top.', fn: () => startRun() },
      ],
      above,
    );
    return;
  }
  const friends = run.companions.filter((c) => !c.shaken).length;
  const moves = totalMoves(S.sess);
  const rec = recordRun(moves, !!run.deep);
  noteRunWon(!!run.deep);
  const runNote = rec.improved
    ? ` And in just ${plural(moves, 'move')} — a new record! ${iconHTML('trophy')}`
    : rec.best !== undefined
      ? ` You did it in ${plural(moves, 'move')} (best ${rec.best}).`
      : ` You did it in ${plural(moves, 'move')}.`;
  const story = run.deep
    ? 'The Worldheart bursts into a thousand flowers, and light reaches the bottom of the wood for the first time in an age. ' +
      `Nobody has ever gone this deep. ${run.fightIndex} clearings taken back, and ${friends + 1} of you walking home for tea.`
    : 'Somewhere behind you, someone puts a kettle on. ' +
      `${run.fightIndex} clearings taken back, and ${friends + 1} of you walking home for tea.`;
  showOverlay(
    `The meadow is quiet ${iconHTML('daisy', 'p2')}`,
    story + runNote,
    [{ label: 'New run', fn: () => startRun() }],
    [trailEl(run, { still: true })],
  );
  rainPetals();
}

/**
 * The Bramble Heart just fell. That's the run — unless the player wants the
 * deep path. Both are a choice, neither is a nag: most people should walk
 * home with a win here, and the ones who want more know where it is.
 */
function crossroadsUi() {
  if (!S.run) return;
  showOverlay(
    `The Bramble Heart bursts into flowers ${iconHTML('bloom', 'p2')}`,
    'Every clearing in the meadow is yours. The path home is right there — and under the Heart’s roots, something colder is still breathing.' +
      clearingNote(),
    [
      {
        label: 'Home for tea',
        sub: 'Call it won. Everyone gets a biscuit.',
        primary: true,
        fn: () => {
          doEntry({ t: 'home' });
          stageUi();
        },
      },
      {
        label: 'Press on into the Rotwood',
        sub: `${DEEP_FIGHTS} more clearings below the Heart. Three and four move a turn, most of them shrouded. No mercy left.`,
        fn: () => {
          doEntry({ t: 'deeper' });
          stageUi();
        },
      },
    ],
    [trailEl(S.run, { showDeep: true })],
  );
  rainPetals();
}

function trinketFound() {
  if (!S.sess) return;
  showChoiceScene(
    `Something glints in the grass ${iconHTML('sparkle', 'p2')}`,
    'Half-buried by the path. It hums a little. You can only carry one more thing.',
    S.sess.trinketOffers.map((id) => ({
      icon: TRINKET_ICONS[id],
      label: TRINKETS[id].title,
      detail: TRINKETS[id].blurb,
      fn: () => {
        doEntry({ t: 'trinket', id });
        stageUi();
      },
    })),
  );
}

function campStop() {
  if (!S.sess || !S.run) return;
  const shaken = S.run.companions.filter((c) => c.shaken).map((c) => c.kind);
  const sprouts = S.run.companions.filter((c) => c.kind === 'sprout').length;
  const choices: SceneOption[] = [];
  if (shaken.length) {
    choices.push({
      icon: 'stew',
      label: 'Warm mash',
      detail: `${listKinds(shaken)} perk${shaken.length > 1 ? '' : 's'} right up and rejoin${shaken.length > 1 ? '' : 's'} the band.`,
      fn: () => {
        doEntry({ t: 'heal' });
        stageUi();
      },
    });
  }
  if (sprouts) {
    choices.push({
      icon: 'honey',
      label: 'Honeycake',
      detail: 'Feed a Sprout and it blossoms right here by the fire — a Hopper, a Slink, a Rumble — no far edge required.',
      fn: honeycakeChoice,
    });
  }
  for (const id of S.sess.trinketOffers) {
    choices.push({
      icon: TRINKET_ICONS[id],
      label: TRINKETS[id].title,
      detail: `Spotted at the edge of the firelight. ${TRINKETS[id].blurb}`,
      fn: () => {
        doEntry({ t: 'trinket', id });
        stageUi();
      },
    });
  }
  for (const id of S.sess.upgradeOffers) {
    choices.push({
      icon: UPGRADE_ICONS[id],
      label: UPGRADES[id].title,
      detail: `A trick learned by the fire — it holds for ${TEMP_LIFESPAN} clearings. ${UPGRADES[id].blurb}`,
      fn: () => {
        doEntry({ t: 'upgrade', id });
        stageUi();
      },
    });
  }
  choices.push({
    icon: 'fire',
    label: 'Rest quietly',
    detail: 'Just the crackle of the fire.',
    fn: () => {
      doEntry({ t: 'rest' });
      stageUi();
    },
  });
  showChoiceScene(
    'Campfire',
    'A quiet hollow off the path. The kettle whistles. There’s time for exactly one comfort.',
    choices,
  );
}

/** Honeycake: which Sprout, then what it becomes. One log entry, two taps. */
function honeycakeChoice() {
  if (!S.run) return;
  const sprouts = S.run.companions.map((c, i) => ({ c, i })).filter(({ c }) => c.kind === 'sprout');
  const pick = (idx: number) =>
    showChoiceScene(
      `Something blossoms ${iconHTML('sparkle', 'p2')}`,
      `${S.run!.companions[idx].name} eats the whole cake. Who do they become?`,
      blossomOptions((kind) => {
        doEntry({ t: 'snack', idx, kind });
        stageUi();
      }),
    );
  if (sprouts.length === 1) return pick(sprouts[0].i);
  showChoiceScene(
    `Honeycake ${iconHTML('honey', 'p2')}`,
    'Who gets it? (No take-backs — it is a very good cake.)',
    sprouts.map(({ c, i }) => ({
      kind: c.kind,
      label: c.name,
      detail: `${c.name} the Sprout blossoms into something new.`,
      fn: () => pick(i),
    })),
  );
}

/**
 * The forms a Sprout can take, in the order worth reading. Penning the Heart
 * in takes straight lanes: a band of nothing but leapers and diagonal slinkers
 * can chase it around a clearing forever without ever building a wall. When
 * the band has no lane-holder, lead with the Rumble and say plainly why — this
 * is the choice that decides whether a beginner's run stays winnable.
 */
function blossomOptions(choose: (kind: PromotionKind) => void): SceneOption[] {
  const options: PromotionKind[] = ['hopper', 'slink', 'rumble'];
  // the Duchess only answers late in the run
  if (S.run && S.run.fightIndex >= 4) options.push('duchess');
  const laneHolder = S.run?.companions.some((c) => c.kind === 'rumble' || c.kind === 'duchess');
  if (!laneHolder) options.sort((a, b) => (a === 'rumble' ? -1 : b === 'rumble' ? 1 : 0));
  return options.map((kind) => ({
    kind,
    label: !laneHolder && kind === 'rumble' ? `${KIND_INFO[kind].title} — the safe pick` : KIND_INFO[kind].title,
    detail:
      !laneHolder && kind === 'rumble'
        ? `${KIND_INFO[kind].blurb} Straight lanes are what fence the Heart in — right now nobody in your band holds one.`
        : KIND_INFO[kind].blurb,
    fn: () => choose(kind),
  }));
}

export function promotionChoice() {
  showChoiceScene(
    `Something blossoms ${iconHTML('sparkle', 'p2')}`,
    'Crossing the whole meadow changes a critter. Who do they become?',
    blossomOptions((kind) => {
      doEntry({ t: 'promote', kind });
      drainEvents();
      refreshHud();
      proceedAfterPlayerAction();
    }),
  );
}
