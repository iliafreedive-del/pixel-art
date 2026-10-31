// Ввод: клавиатура + мышь на ПК, джойстик под пальцем и кнопки умений на телефоне.
import { HW, HH } from './util.js';

export const I = {
  mx: 0, my: 0, fire: false, cast: [false, false, false, false],
  mouse: { x: 0, y: 0, has: false }, touch: false, keys: {}, autoAim: false,
  stick: null, touchAim: null, onKey: null,
};

const held = new Set();
let canvas;

function screenDirToWorld(dx, dy) {
  const wx = (dx / HW + dy / HH) / 2, wy = (dy / HH - dx / HW) / 2;
  const l = Math.hypot(wx, wy);
  return l < 1e-6 ? [0, 0] : [wx / l, wy / l];
}

export function initInput(cv) {
  canvas = cv;
  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    held.add(e.code);
    I.onKey?.(e.code, e);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
  });
  addEventListener('keyup', (e) => held.delete(e.code));
  addEventListener('blur', () => { held.clear(); I.mouseL = I.mouseR = false; });
  cv.addEventListener('mousemove', (e) => { I.mouse.x = e.clientX; I.mouse.y = e.clientY; I.mouse.has = true; I.touch = false; });
  cv.addEventListener('mousedown', (e) => {
    I.touch = false;
    I.mouse.x = e.clientX; I.mouse.y = e.clientY; I.mouse.has = true;
    if (e.button === 0) I.mouseL = true;
    if (e.button === 2) I.mouseR = true;
  });
  addEventListener('mouseup', (e) => { if (e.button === 0) I.mouseL = false; if (e.button === 2) I.mouseR = false; });
  cv.addEventListener('contextmenu', (e) => e.preventDefault());

  // касания: левая половина — джойстик, правая — удар в точку
  cv.addEventListener('touchstart', (e) => {
    I.touch = true;
    for (const t of e.changedTouches) {
      if (t.clientX < innerWidth * 0.45 && !I.stick) I.stick = { id: t.identifier, x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY };
      else if (!I.touchAim) I.touchAim = { id: t.identifier, x: t.clientX, y: t.clientY };
    }
    e.preventDefault();
  }, { passive: false });
  cv.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (I.stick && t.identifier === I.stick.id) { I.stick.x = t.clientX; I.stick.y = t.clientY; }
      if (I.touchAim && t.identifier === I.touchAim.id) { I.touchAim.x = t.clientX; I.touchAim.y = t.clientY; }
    }
    e.preventDefault();
  }, { passive: false });
  const end = (e) => {
    for (const t of e.changedTouches) {
      if (I.stick && t.identifier === I.stick.id) I.stick = null;
      if (I.touchAim && t.identifier === I.touchAim.id) I.touchAim = null;
    }
  };
  cv.addEventListener('touchend', end);
  cv.addEventListener('touchcancel', end);
}

// Кнопки умений на экране (телефон)
export const touchCast = [false, false, false, false];

export function pollInput() {
  let dx = 0, dy = 0;
  if (held.has('KeyW') || held.has('ArrowUp')) dy -= 1;
  if (held.has('KeyS') || held.has('ArrowDown')) dy += 1;
  if (held.has('KeyA') || held.has('ArrowLeft')) dx -= 1;
  if (held.has('KeyD') || held.has('ArrowRight')) dx += 1;
  if (I.stick) {
    const sx = I.stick.x - I.stick.x0, sy = I.stick.y - I.stick.y0, l = Math.hypot(sx, sy);
    if (l > 8) { dx = sx / l; dy = sy / l; }
    // джойстик «едет» за пальцем
    if (l > 70) { I.stick.x0 = I.stick.x - sx / l * 70; I.stick.y0 = I.stick.y - sy / l * 70; }
  }
  const l = Math.hypot(dx, dy);
  if (l > 0) { dx /= l; dy /= l; }
  [I.mx, I.my] = l > 0 ? screenDirToWorld(dx, dy) : [0, 0];
  I.screenMove = [dx, dy];
  const t = touchCast;
  I.cast[0] = I.mouseL || held.has('KeyJ') || t[0] || !!I.touchAim;
  I.cast[1] = I.mouseR || held.has('KeyQ') || held.has('Digit2') || held.has('KeyK') || t[1];
  I.cast[2] = held.has('Space') || held.has('ShiftLeft') || held.has('Digit3') || held.has('KeyL') || t[2];
  I.cast[3] = held.has('KeyE') || held.has('KeyR') || held.has('Digit4') || t[3];
  if (held.has('Digit1')) I.cast[0] = true;
  I.fire = I.cast[0];
  I.autoAim = I.touch;
}
