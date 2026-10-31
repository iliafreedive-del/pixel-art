// Точка входа: сборка графики, цикл 60 FPS с фиксированным шагом, связь ввода и интерфейса.
import { G, loadSave, update, nearestEnemy } from './game.js';
import { buildAllSprites } from './art/sprites.js';
import { initRender, render, resize, screenToWorldPt, view } from './render.js';
import { initInput, pollInput, I } from './input.js';
import { UI, showMenu, tickUI, togglePause, toggleTree } from './ui.js';
import { initAudio, setMuted, isMuted } from './audio.js';

const canvas = document.getElementById('game');

function boot() {
  loadSave();
  buildAllSprites();
  initRender(canvas);
  initInput(canvas);
  G.input = I;
  G.ui = UI;
  addEventListener('resize', () => { resize(); setTimeout(resize, 200); });
  I.onKey = (code) => {
    initAudio();
    if (code === 'Escape' || code === 'KeyP') { if (G.state === 'tree') toggleTree(); else togglePause(); }
    if (code === 'KeyT' || code === 'Tab') toggleTree();
    if (code === 'KeyM') setMuted(!isMuted());
    if (code === 'KeyF') document.getElementById('fps').classList.toggle('hidden');
  };
  document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'play') togglePause(); });
  if (new URLSearchParams(location.search).has('fps')) document.getElementById('fps').classList.remove('hidden');
  document.getElementById('loading').remove();
  showMenu();
  requestAnimationFrame(loop);
}

// прицел: мышь на ПК, на телефоне — ближайший враг или направление бега
function updateAim() {
  const P = G.player;
  if (!P) return;
  const r = canvas.getBoundingClientRect();
  const k = view.w / r.width;
  if (I.touchAim) {
    const [x, y] = screenToWorldPt((I.touchAim.x - r.left) * k, (I.touchAim.y - r.top) * k);
    P.aimX = x; P.aimY = y;
  } else if (I.touch) {
    const e = nearestEnemy(P.x, P.y, 9);
    if (e) { P.aimX = e.x; P.aimY = e.y; }
    else if (I.mx || I.my) { P.aimX = P.x + I.mx * 4; P.aimY = P.y + I.my * 4; }
  } else if (I.mouse.has) {
    const [x, y] = screenToWorldPt((I.mouse.x - r.left) * k, (I.mouse.y - r.top) * k);
    P.aimX = x; P.aimY = y + 0.6; // курсор указывает на тело, а не на ноги
  }
}

const STEP = 1 / 60;
let last = performance.now(), acc = 0, fpsT = 0, frames = 0;
function loop(now) {
  let dt = (now - last) / 1000; last = now;
  if (dt > 0.25) dt = 0.25;
  acc += dt;
  pollInput();
  let n = 0;
  while (acc >= STEP && n < 5) {
    updateAim();
    update(STEP);
    acc -= STEP; n++;
  }
  if (n === 5) acc = 0;
  if (G.map && ['play', 'pause', 'tree', 'boon', 'dead', 'done'].includes(G.state)) render(dt);
  tickUI(dt);
  frames++; fpsT += dt;
  if (fpsT >= 0.5) {
    const el = document.getElementById('fps');
    if (!el.classList.contains('hidden')) el.textContent = `${Math.round(frames / fpsT)} FPS · ${view.w}×${view.h} ×${view.scale} · врагов ${G.enemies.length} · частиц ${G.parts.length}`;
    frames = 0; fpsT = 0;
  }
  requestAnimationFrame(loop);
}

try { boot(); } catch (e) {
  const l = document.getElementById('loading');
  if (l) l.innerHTML = 'Ошибка запуска<small>' + (e && e.message) + '</small>';
  throw e;
}
