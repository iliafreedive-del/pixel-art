// Иконки умений и даров 24×24, нарисованные кодом. Отдаются как dataURL для интерфейса.
import { Pix, ramp, col, mix } from '../pixel.js';

const cache = {};
const TAU = Math.PI * 2;

function bg(p, hex) {
  const R = ramp(hex, 5, 0.35);
  for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
    const dx = x + 0.5 - 12, dy = y + 0.5 - 12, d = Math.sqrt(dx * dx + dy * dy);
    if (d > 11.5) continue;
    p.set(x, y, p.pick(R, 0.15 + (1 - d / 12) * 0.5 - dy / 40, x, y, 0.8));
  }
}

function glowDot(p, x, y, r, R) { p.ell(x, y, r, r, R, 0.8, 0.5, 0.3); }

const DRAW = {
  slash(p, c) { for (let i = 0; i < 14; i++) { const a = -2.4 + i * 0.16; p.limb(12 + Math.cos(a) * 8, 13 + Math.sin(a) * 8, 12 + Math.cos(a + 0.16) * 8, 13 + Math.sin(a + 0.16) * 8, 1.6 - i * 0.08, 1.5 - i * 0.08, c.R); } p.limb(6, 18, 18, 6, 1, 0.5, ramp('#e8f0ff', 4)); },
  leap(p, c) { p.limb(6, 18, 12, 6, 1.6, 1.2, c.R); p.limb(12, 6, 18, 18, 1.2, 0.8, c.R); p.ell(12, 19, 8, 2.5, ramp('#ffd070', 4), 0.7); },
  whirl(p, c) { for (let i = 0; i < 26; i++) { const a = i * 0.45, r = 2 + i * 0.32; p.ell(12 + Math.cos(a) * r, 12 + Math.sin(a) * r * 0.8, 1.2, 1.2, c.R, 0.7, 0.4, 0.2); } },
  cry(p, c) { p.ell(10, 12, 4, 5, ramp('#c8a080', 4), 0.6); for (let i = 0; i < 3; i++) { for (let k = -3; k <= 3; k++) { const a = k * 0.25; p.set(14 + i * 3 + Math.cos(a) * 2, 12 + Math.sin(a) * (3 + i * 2), c.R[3]); } } },
  bolt(p, c) { p.limb(4, 18, 13, 11, 0.6, 2.5, ramp('#ff7020', 4)); glowDot(p, 15, 9, 4.5, c.R); p.set(14, 7, col('#ffffff')); },
  meteor(p, c) { for (let i = 0; i < 6; i++) p.limb(3 + i, 3 + i * 0.6, 12, 12, 0.5, 2.5, ramp('#ff6020', 4)); glowDot(p, 14, 14, 6, c.R); p.set(12, 12, col('#ffffff')); p.set(13, 12, col('#fff0c0')); },
  blink(p, c) { p.ell(8, 14, 3, 5, ramp('#3a2a6a', 4), 0.4); p.ell(16, 11, 3.5, 6, c.R, 0.7); for (let i = 0; i < 6; i++) p.set(9 + i, 13 - i * 0.4, c.R[4]); },
  orbs(p, c) { for (let i = 0; i < 4; i++) { const a = i / 4 * TAU; glowDot(p, 12 + Math.cos(a) * 7, 12 + Math.sin(a) * 7, 2.6, c.R); } glowDot(p, 12, 12, 2, ramp('#ffffff', 3)); },
  arrow(p, c) { p.line(4, 20, 18, 6, col('#e8dcc0')); p.line(5, 20, 19, 6, col('#a89a7c')); p.poly([[19, 3], [21, 9], [15, 7]], c.R, 0.9, 0.5); p.line(4, 17, 6, 21, c.R[2]); p.line(7, 20, 3, 18, c.R[2]); },
  trap(p, c) { const g = ramp('#8a8a90', 4); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; p.limb(12, 13, 12 + Math.cos(a) * 8, 13 + Math.sin(a) * 6, 1.2, 0.4, g); } glowDot(p, 12, 13, 3, c.R); },
  roll(p, c) { for (let i = 0; i < 18; i++) { const a = i * 0.32; p.ell(12 + Math.cos(a) * 6, 12 + Math.sin(a) * 6, 1.4, 1.4, c.R, 0.4 + i * 0.03); } p.limb(3, 16, 9, 16, 0.6, 0.6, ramp('#ffffff', 3)); },
  rain(p, c) { for (let i = 0; i < 6; i++) { const x = 4 + i * 3; p.line(x, 3 + (i % 2) * 3, x - 2, 12 + (i % 2) * 3, col('#e8dcc0')); p.set(x - 2, 13 + (i % 2) * 3, c.R[4]); } p.ell(12, 19, 8, 2.5, c.R, 0.6); },
  heart(p, c) { p.ell(9, 10, 4, 4, c.R, 0.65); p.ell(15, 10, 4, 4, c.R, 0.65); p.poly([[5, 11], [19, 11], [12, 20]], c.R, 0.6, 0.3); },
  fist(p, c) { p.ell(12, 12, 6, 5, c.R, 0.6); for (let i = 0; i < 4; i++) p.line(8 + i * 2.5, 9, 8 + i * 2.5, 12, c.R[0]); },
  eye(p, c) { p.ell(12, 12, 8, 4.5, ramp('#e8e0f0', 4), 0.7); glowDot(p, 12, 12, 3, c.R); p.set(12, 12, col('#000000')); },
  boot(p, c) { p.poly([[8, 4], [14, 4], [14, 16], [20, 17], [20, 20], [8, 20]], c.R, 0.75, 0.35); p.line(4, 10, 7, 10, c.R[4]); p.line(3, 14, 7, 14, c.R[4]); },
  hourglass(p, c) { p.poly([[6, 4], [18, 4], [12, 12]], c.R, 0.8, 0.4); p.poly([[12, 12], [18, 20], [6, 20]], c.R, 0.6, 0.3); p.line(6, 4, 18, 4, col('#d6a548')); p.line(6, 20, 18, 20, col('#d6a548')); },
  fang(p, c) { p.poly([[6, 5], [11, 5], [8, 19]], ramp('#f0e8d8', 4), 0.8, 0.4); p.poly([[13, 5], [18, 5], [16, 17]], ramp('#f0e8d8', 4), 0.8, 0.4); p.set(8, 18, c.R[3]); p.set(8, 20, c.R[4]); },
  magnet(p, c) { for (let i = 0; i < 12; i++) { const a = Math.PI + i / 11 * Math.PI; p.ell(12 + Math.cos(a) * 6, 13 + Math.sin(a) * 6, 1.8, 1.8, c.R, 0.6); } p.rect(5, 13, 3, 5, col('#e8e8f0')); p.rect(16, 13, 3, 5, col('#e8e8f0')); },
  flame(p, c) { p.poly([[12, 2], [18, 12], [17, 18], [12, 21], [7, 18], [6, 12], [10, 9]], c.R, 0.9, 0.35); p.poly([[12, 9], [15, 15], [12, 19], [9, 15]], ramp('#fff4b0', 4), 0.9, 0.6); },
  chain(p, c) { const pts = [[5, 4], [10, 10], [8, 12], [14, 16], [12, 18], [19, 21]]; for (let i = 0; i < pts.length - 1; i++) p.limb(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 1.2, 1.2, c.R); },
  frost(p, c) { for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; p.limb(12, 12, 12 + Math.cos(a) * 9, 12 + Math.sin(a) * 9, 1.2, 0.5, c.R); p.limb(12 + Math.cos(a) * 5, 12 + Math.sin(a) * 5, 12 + Math.cos(a + 0.5) * 7, 12 + Math.sin(a + 0.5) * 7, 0.6, 0.4, c.R); } },
  vamp(p, c) { p.ell(12, 13, 6, 7, c.R, 0.6); p.set(10, 11, col('#ffffff')); p.poly([[9, 15], [11, 15], [10, 18]], ramp('#ffffff', 2), 0.9, 0.9); p.poly([[13, 15], [15, 15], [14, 18]], ramp('#ffffff', 2), 0.9, 0.9); },
  burst(p, c) { for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; p.limb(12 + Math.cos(a) * 3, 12 + Math.sin(a) * 3, 12 + Math.cos(a) * 10, 12 + Math.sin(a) * 10, 1.3, 0.3, c.R); } glowDot(p, 12, 12, 3, ramp('#ffffff', 3)); },
  shield(p, c) { p.poly([[5, 4], [19, 4], [19, 12], [12, 21], [5, 12]], c.R, 0.8, 0.35); p.poly([[9, 7], [15, 7], [15, 11], [12, 16], [9, 11]], ramp('#ffffff', 3), 0.6, 0.4); },
  wind(p, c) { for (let k = 0; k < 3; k++) for (let i = 0; i < 14; i++) p.set(4 + i, 7 + k * 5 + Math.sin(i * 0.5 + k) * 1.5, c.R[2 + (i % 3)]); },
  double(p, c) { p.limb(5, 18, 13, 6, 1.2, 0.6, c.R); p.limb(11, 18, 19, 6, 1.2, 0.6, c.R); },
  coin(p, c) { p.ell(12, 12, 8, 8, ramp('#ffd040', 5, 0.5), 0.65); p.ell(12, 12, 5, 5, ramp('#d69a20', 4), 0.4); p.line(12, 8, 12, 16, col('#fff0a0')); },
  storm(p, c) { p.ell(12, 7, 8, 4, ramp('#5a5a7a', 4), 0.5); p.line(12, 10, 9, 15, c.R[4]); p.line(9, 15, 13, 15, c.R[4]); p.line(13, 15, 10, 21, c.R[4]); },
  skull(p, c) { p.ell(12, 11, 7, 7, ramp('#e8dcc4', 4), 0.65); p.ell(9, 11, 2, 2, ramp('#200810', 2), 0.3); p.ell(15, 11, 2, 2, ramp('#200810', 2), 0.3); p.rect(9, 17, 6, 3, col('#c8bc9c')); p.set(9, 11, c.R[4]); p.set(15, 11, c.R[4]); },
  portal(p, c) { for (let i = 0; i < 30; i++) { const a = i / 30 * TAU; p.ell(12 + Math.cos(a) * 7, 12 + Math.sin(a) * 9, 1.4, 1.4, c.R, 0.7); } },
};

export function icon(kind, hex = '#ff9a3c', bgHex = '#2a1e2e') {
  const key = kind + hex + bgHex;
  if (cache[key]) return cache[key];
  const p = new Pix(24, 24);
  bg(p, bgHex);
  (DRAW[kind] || DRAW.burst)(p, { R: ramp(hex, 5, 0.55, 0.4) });
  p.outline(col('#08060c'));
  const url = p.canvas().toDataURL();
  cache[key] = url;
  return url;
}
