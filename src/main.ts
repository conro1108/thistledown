import './style.css';
import './ui/dom';
import './ui/dev';
import './ui/history';
import './ui/input';
import { frame } from './ui/render';
import { title } from './ui/screens';

requestAnimationFrame(frame);
title();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

