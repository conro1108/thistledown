// Run flow: which screen the session's stage calls for, and every card on the
// path — title, clearing intro, aftermath/recruit, trinket, campfire, promotion.
import { movesFor } from '../game/board';
import { REGION_NAMES, regionOf } from '../game/ladder';
import type { PromotionKind } from '../game/fight';
import { isSpry, KIND_INFO, ROSTER_CAP, TEMP_LIFESPAN, TRINKETS, UPGRADES } from '../game/run';
import { movesThisClearing, newSession, retryFight, totalMoves } from '../game/session';
import { iconHTML, type IconName } from '../render/icons';
import { TILE } from '../render/scene';
import { themeFor } from '../render/themes';
import { canvas, hintEl, historyBar } from './dom';
import { cap, listKinds, plural, refreshHud } from './hud';
import { applyRegionTheme, rainPetals, showChoiceScene, showOverlay, showTitle, type Choice, type SceneOption } from './overlay';
import { sizeCanvas } from './render';
import { DEFAULT_HINT, MOVE_TAG, OBJECTIVE, S, TRINKET_ICONS, UPGRADE_ICONS } from './state';
import { doEntry, loadSave, persist, recordClearing, recordRun } from './storage';
import { beginEnemyTurn, cancelBeat, drainEvents, proceedAfterPlayerAction, scheduleBeat } from './turn';

// ---------- run flow ----------

export function title() {
  applyRegionTheme(themeFor(0)); // the title sits at the meadow's edge
  // a run you never actually played (no moves yet) isn't worth resuming —
  // don't make the player choose between two identical fresh starts
  const loaded = loadSave();
  const saved = loaded && loaded.log.some((e) => e.t === 'move') ? loaded : null;
  const choices: Choice[] = [];
  if (saved) {
    const friends = saved.run.companions.filter((c) => !c.shaken).length + 1;
    choices.push({
      label: 'Keep going',
      sub: `Clearing ${saved.run.fightIndex + 1} of ${saved.run.fights.length}, ${friends} of you on the path.`,
      fn: () => {
        S.sess = saved;
        stageUi();
      },
    });
  }
  choices.push({
    label: saved ? 'Start fresh' : 'Set out',
    sub: saved ? 'The old path grows over.' : undefined,
    fn: startRun,
  });
  showTitle(choices);
}



function startRun() {
  S.sess = newSession(Date.now() % 2147483647);
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
  applyRegionTheme(themeFor(regionOf(S.run.fightIndex)));
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
    case 'over':
      endOfRunUi();
      break;
  }
}

function fightIntro() {
  if (!S.run) return;
  const spec = S.run.fights[S.run.fightIndex];
  showOverlay(
    `${REGION_NAMES[regionOf(S.run.fightIndex)]} · ${spec.name}`,
    `${spec.intro}<span class="objective">${iconHTML('daisy')} ${spec.objective ?? OBJECTIVE}</span>`,
    [
      {
        label: 'Onward',
        fn: () => {
          doEntry({ t: 'begin' });
          enterFight(false);
        },
      },
    ],
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
  hintEl.innerHTML = DEFAULT_HINT;
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
  // stage 'post': clearing won, maybe a recruit is watching
  const shaken = S.run.companions.filter((c) => c.shaken).map((c) => c.kind);
  const shakenNote = shaken.length
    ? `${cap(listKinds(shaken))} ${shaken.length > 1 ? 'sit' : 'sits'} the next one out.`
    : '';
  // fewest-moves record for the clearing that just fell
  const moves = movesThisClearing(S.sess);
  const rec = recordClearing(S.fight?.name ?? 'this clearing', moves);
  const movesNote = rec.improved
    ? `Cleared in ${plural(moves, 'move')} — a new best! ${iconHTML('sparkle')}`
    : rec.best !== undefined
      ? `Cleared in ${plural(moves, 'move')} (best ${rec.best}).`
      : `Cleared in ${plural(moves, 'move')}.`;
  // a quiet secondary line: the record, then who's sitting out
  const note = [movesNote, shakenNote].filter(Boolean).join(' ');
  const noteLine = note ? `<span class="scene-note">${note}</span>` : '';

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

/** Capitalize the first letter — for notes that used to sit mid-sentence. */


function endOfRunUi() {
  if (!S.run) return;
  if (S.run.status === 'lost') {
    showOverlay(
      'The lantern goes out',
      `The brambles got the Keeper in ${S.fight?.name ?? 'the meadow'}. Everyone walks home for tea.`,
      [
        {
          label: 'Retry this clearing',
          sub: 'Back to the start of this fight — same friends, same meadow.',
          fn: retryClearing,
        },
        { label: 'Start over', sub: 'A whole new meadow from the top.', fn: startRun },
      ],
    );
    return;
  }
  const friends = S.run.companions.filter((c) => !c.shaken).length;
  const moves = S.sess ? totalMoves(S.sess) : 0;
  const rec = recordRun(moves);
  const runNote = rec.improved
    ? ` And in just ${plural(moves, 'move')} — a new record! ${iconHTML('trophy')}`
    : rec.best !== undefined
      ? ` You did it in ${plural(moves, 'move')} (best ${rec.best}).`
      : ` You did it in ${plural(moves, 'move')}.`;
  showOverlay(
    `The meadow is quiet ${iconHTML('daisy', 'p2')}`,
    'The Bramble Heart bursts into a thousand flowers. Somewhere behind you, someone puts a kettle on. ' +
      `You won the whole thing — ${S.run.fights.length} clearings taken back, ` +
      `and ${friends + 1} of you walking home for tea.${runNote}`,
    [{ label: 'New run', fn: startRun }],
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
  const snackable = S.run.companions.some((c) => !isSpry(S.run!, c));
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
  if (snackable) {
    choices.push({
      icon: 'honey',
      label: 'Honeycake',
      detail: `One friend gets a spring in their step for the next ${TEMP_LIFESPAN} clearings. (A plain sidestep, any direction.)`,
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

function honeycakeChoice() {
  if (!S.run) return;
  showChoiceScene(
    `Honeycake ${iconHTML('honey', 'p2')}`,
    'Who gets it? (No take-backs — it is a very good cake.)',
    S.run.companions
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => !isSpry(S.run!, c))
      .map(({ c, i }) => ({
        kind: c.kind,
        label: c.name,
        detail: `${c.name} the ${KIND_INFO[c.kind].title} gains a plain one-step move in any direction, for the next ${TEMP_LIFESPAN} clearings.`,
        fn: () => {
          doEntry({ t: 'snack', idx: i });
          stageUi();
        },
      })),
  );
}



export function promotionChoice() {
  const options: PromotionKind[] = ['hopper', 'slink', 'rumble'];
  // the Duchess only answers late in the run
  if (S.run && S.run.fightIndex >= 4) options.push('duchess');
  // Penning the Heart in takes straight lanes: a band of nothing but leapers
  // and diagonal slinkers can chase it around a clearing forever without ever
  // building a wall. When the player has no lane-holder on the field, lead with
  // the Rumble and say plainly why — this is the choice that decides whether a
  // beginner's run stays winnable.
  const laneHolder = S.fight?.pieces.some(
    (p) => p.side === 'friend' && (p.kind === 'rumble' || p.kind === 'duchess'),
  );
  if (!laneHolder) options.sort((a, b) => (a === 'rumble' ? -1 : b === 'rumble' ? 1 : 0));
  showChoiceScene(
    `Something blossoms ${iconHTML('sparkle', 'p2')}`,
    'Crossing the whole meadow changes a critter. Who do they become?',
    options.map((kind) => ({
      kind,
      label:
        !laneHolder && kind === 'rumble'
          ? `${KIND_INFO[kind].title} — the safe pick`
          : KIND_INFO[kind].title,
      detail:
        !laneHolder && kind === 'rumble'
          ? `${KIND_INFO[kind].blurb} Straight lanes are what fence the Heart in — right now nobody in your band holds one.`
          : KIND_INFO[kind].blurb,
      fn: () => {
        doEntry({ t: 'promote', kind });
        drainEvents();
        refreshHud();
        proceedAfterPlayerAction();
      },
    })),
  );
}
