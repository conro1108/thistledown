// The DOM shell: builds #app's markup once and exports every element the UI touches.
import { iconHTML } from '../render/icons';
import { isMuted } from '../audio';

export const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <canvas id="backdrop" width="1" height="1"></canvas>
  <header id="hud">
    <span id="fightname">Overgrown</span>
    <span id="hud-right"><button id="sound-btn" class="trinket" title="Sound">${iconHTML(isMuted() ? 'muted' : 'sound', 'p2')}</button><button id="dev-btn" class="trinket" title="Dev">${iconHTML('wrench', 'p2')}</button><button id="history-btn" class="trinket hidden" title="Look back">${iconHTML('rewind', 'p2')}</button><span id="trinkets"></span></span>
  </header>
  <div id="board-area">
    <div id="board-wrap" class="idle">
      <canvas id="board" width="96" height="96"></canvas>
    </div>
    <div id="history-bar" class="hidden">
      <button id="hist-prev">‹</button>
      <span id="hist-label"></span>
      <button id="hist-next">›</button>
      <button id="hist-live">Back to now</button>
    </div>
  </div>
  <div id="status">
    <div id="status-line"></div>
    <div id="hint"></div>
  </div>
  <div id="roster"></div>
  <div id="overlay" class="hidden"></div>
`;

export const canvas = document.querySelector<HTMLCanvasElement>('#board')!;
export const ctx = canvas.getContext('2d')!;
export const backdropEl = document.querySelector<HTMLCanvasElement>('#backdrop')!;
export const backdropCtx = backdropEl.getContext('2d')!;
export const boardAreaEl = document.querySelector<HTMLDivElement>('#board-area')!;
export const hudEl = document.querySelector<HTMLElement>('#hud')!;
export const hudName = document.querySelector<HTMLSpanElement>('#fightname')!;
export const trinketsEl = document.querySelector<HTMLSpanElement>('#trinkets')!;
export const statusEl = document.querySelector<HTMLDivElement>('#status')!;
export const statusLineEl = document.querySelector<HTMLDivElement>('#status-line')!;
export const hintEl = document.querySelector<HTMLDivElement>('#hint')!;
export const rosterEl = document.querySelector<HTMLDivElement>('#roster')!;
export const overlayEl = document.querySelector<HTMLDivElement>('#overlay')!;
export const historyBtn = document.querySelector<HTMLButtonElement>('#history-btn')!;
export const devBtn = document.querySelector<HTMLButtonElement>('#dev-btn')!;
export const soundBtn = document.querySelector<HTMLButtonElement>('#sound-btn')!;
export const historyBar = document.querySelector<HTMLDivElement>('#history-bar')!;
export const histPrev = document.querySelector<HTMLButtonElement>('#hist-prev')!;
export const histNext = document.querySelector<HTMLButtonElement>('#hist-next')!;
export const histLabel = document.querySelector<HTMLSpanElement>('#hist-label')!;
export const histLive = document.querySelector<HTMLButtonElement>('#hist-live')!;
