// Отрисовка: пол → земляные эффекты → сортировка по глубине (стены, предметы, существа)
// → карта света (умножение) → аддитивное свечение снарядов и частиц → цифры урона → виньетка.
import { G } from './game.js';
import { SPR } from './art/sprites.js';
import { BIOMES } from './art/env.js';
import { lightSprite, glowSprite, makeCanvas, tintCanvas, flipCanvas, Pix, col } from './pixel.js';
import { isoX, isoY, HW, HH, screenToWorld, clamp, rand, TAU } from './util.js';
import { CLASSES } from './data.js';

let cv, ctx, lcv, lctx, W = 320, H = 180, vign = null;
export const view = { scale: 3, w: 320, h: 180, camX: 0, camY: 0 };

const lightCache = {}, glowCache = {};
function lightFor(c) {
  const k = c.join(',');
  return lightCache[k] || (lightCache[k] = lightSprite(64, c, 7));
}
function glowFor(c, r = 24) {
  const k = c + r;
  if (glowCache[k]) return glowCache[k];
  const n = parseInt(c.slice(1), 16);
  return (glowCache[k] = glowSprite(r, [(n >> 16) & 255, (n >> 8) & 255, n & 255]));
}

// Шрифт для цифр 3×5
const FONT = {
  0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001',
  5: '111100111001111', 6: '111100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001111', '+': '000010111010000',
};
const digitCache = {};
function digit(ch, color) {
  const k = ch + color;
  if (digitCache[k]) return digitCache[k];
  const p = new Pix(5, 7), c = col(color), o = col('#120a10');
  const bits = FONT[ch] || FONT[0];
  for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) if (bits[y * 3 + x] === '1') p.set(x + 1, y + 1, c);
  p.outline(o);
  return (digitCache[k] = p.canvas());
}
const TXT = { n: '#ffffff', crit: '#ffd040', dot: '#ffa060', hurt: '#ff4848', heal: '#70ff90' };

let shadowSpr = null, gemSpr, goldSpr, healSpr, trapSpr, hawkSpr;
function buildMisc() {
  shadowSpr = makeCanvas(32, 16);
  const s = shadowSpr.getContext('2d');
  s.fillStyle = 'rgba(0,0,0,0.45)'; s.beginPath(); s.ellipse(16, 8, 15, 7, 0, 0, TAU); s.fill();
  s.fillStyle = 'rgba(0,0,0,0.25)'; s.beginPath(); s.ellipse(16, 8, 10, 4.5, 0, 0, TAU); s.fill();
  const g = new Pix(5, 7), gc = [col('#1a8a3a'), col('#3ae070'), col('#a8ffc0')];
  [[2, 0, 2], [1, 1, 1], [2, 1, 2], [3, 1, 0], [0, 2, 1], [1, 2, 2], [2, 2, 2], [3, 2, 1], [4, 2, 0], [1, 3, 1], [2, 3, 1], [3, 3, 0], [2, 4, 0]].forEach(([x, y, i]) => g.set(x, y + 1, gc[i]));
  g.outline(col('#08140c')); gemSpr = g.canvas();
  const c = new Pix(6, 6); c.ell(3, 3, 2.4, 2.4, [col('#a86a10'), col('#e0a020'), col('#ffd040'), col('#fff0a0')], 0.6); c.outline(col('#2a1a04')); goldSpr = c.canvas();
  const h = new Pix(8, 8); h.ell(4, 4, 3, 3, [col('#6a0a10'), col('#c81e28'), col('#ff4a4a'), col('#ffb0b0')], 0.6); h.outline(col('#1a0408')); healSpr = h.canvas();
  const t = new Pix(14, 8); t.ell(7, 4, 6, 3, [col('#3a3a40'), col('#6a6a74'), col('#9a9aa8')], 0.5);
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; t.set(7 + Math.cos(a) * 6, 4 + Math.sin(a) * 3 - 1, col('#d8d8e0')); }
  t.outline(col('#08080c')); trapSpr = t.canvas();
  const k = new Pix(9, 5), kc = col('#ffd080'), kd = col('#a07040');
  [[0, 0], [1, 1], [2, 2], [3, 2], [4, 3], [5, 2], [6, 2], [7, 1], [8, 0], [4, 2], [4, 4]].forEach(([x, y]) => k.set(x, y, y > 2 ? kd : kc));
  k.outline(col('#1a1008')); hawkSpr = k.canvas();
}

export function initRender(canvas) {
  cv = canvas; ctx = cv.getContext('2d', { alpha: false });
  lcv = makeCanvas(16, 16); lctx = lcv.getContext('2d');
  buildMisc();
  resize();
}

export function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const pw = window.innerWidth * dpr, ph = window.innerHeight * dpr;
  const scale = Math.max(1, Math.round(Math.min(pw, ph) / 340));
  W = Math.ceil(pw / scale); H = Math.ceil(ph / scale);
  cv.width = W; cv.height = H;
  lcv.width = W; lcv.height = H;
  view.scale = scale; view.w = W; view.h = H;
  ctx.imageSmoothingEnabled = false; lctx.imageSmoothingEnabled = false;
  vign = makeCanvas(W, H);
  const v = vign.getContext('2d');
  const g = v.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.72);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.6)');
  v.fillStyle = g; v.fillRect(0, 0, W, H);
}

// мир → экран
const sx = (x, y) => Math.round(isoX(x, y) - view.camX);
const sy = (x, y) => Math.round(isoY(x, y) - view.camY);
export function screenToWorldPt(px, py) {
  // px,py — в пикселях холста
  const [wx, wy] = screenToWorld(px + view.camX, py + view.camY);
  return [wx, wy];
}

const ambient = [];
function ambientParticles(dt, B) {
  const want = Math.round((W * H) / 2600);
  while (ambient.length < want) ambient.push({ x: Math.random() * W, y: Math.random() * H, vx: 0, vy: 0, t: Math.random() * 10, s: Math.random() });
  for (const a of ambient) {
    a.t += dt;
    if (B.particles === 'embers') { a.vy = -8 - a.s * 10; a.vx = Math.sin(a.t + a.s * 9) * 5; }
    else if (B.particles === 'snow') { a.vy = 5 + a.s * 6; a.vx = Math.sin(a.t * 0.7 + a.s * 9) * 4 - 2; }
    else { a.vy = Math.sin(a.t * 0.5 + a.s * 7) * 2; a.vx = Math.cos(a.t * 0.4 + a.s * 5) * 2.5; }
    a.x += a.vx * dt; a.y += a.vy * dt;
    if (a.x < -4) a.x += W + 8; if (a.x > W + 4) a.x -= W + 8;
    if (a.y < -4) a.y += H + 8; if (a.y > H + 4) a.y -= H + 8;
  }
}

let lastCamX = 0, lastCamY = 0;
export function render(dt) {
  const map = G.map, P = G.player;
  if (!map || !P) return;
  const B = BIOMES[map.biome];
  // камера
  const tx = isoX(P.x, P.y) + clamp((isoX(P.aimX, P.aimY) - isoX(P.x, P.y)) * 0.12, -24, 24);
  const ty = isoY(P.x, P.y) - 10 + clamp((isoY(P.aimX, P.aimY) - isoY(P.x, P.y)) * 0.12, -16, 16);
  const cam = G.cam;
  if (!cam.init) { cam.x = tx; cam.y = ty; cam.init = true; }
  const k = Math.min(1, dt * 7);
  cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
  const sh = G.shake * 7;
  view.camX = Math.round(cam.x - W / 2 + (sh ? rand(-sh, sh) : 0));
  view.camY = Math.round(cam.y - H / 2 + (sh ? rand(-sh, sh) : 0));
  lastCamX = view.camX; lastCamY = view.camY;

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = B.void; ctx.fillRect(0, 0, W, H);
  // пол
  {
    let x0 = view.camX + map.ox, y0 = view.camY + map.oy, dx = 0, dy = 0, w = W, h = H;
    if (x0 < 0) { dx = -x0; w += x0; x0 = 0; }
    if (y0 < 0) { dy = -y0; h += y0; y0 = 0; }
    w = Math.min(w, map.floor.width - x0); h = Math.min(h, map.floor.height - y0);
    if (w > 0 && h > 0) ctx.drawImage(map.floor, x0, y0, w, h, dx, dy, w, h);
  }
  const lights = G.lights.slice();
  // ── земляной слой
  drawGround(lights);
  // ── сортировка
  const items = [];
  const c1 = screenToWorld(view.camX - 40, view.camY - 40), c2 = screenToWorld(view.camX + W + 40, view.camY - 40);
  const c3 = screenToWorld(view.camX - 40, view.camY + H + 80), c4 = screenToWorld(view.camX + W + 40, view.camY + H + 80);
  const i0 = Math.max(0, Math.floor(Math.min(c1[0], c2[0], c3[0], c4[0]))), i1 = Math.min(map.N - 1, Math.ceil(Math.max(c1[0], c2[0], c3[0], c4[0])));
  const j0 = Math.max(0, Math.floor(Math.min(c1[1], c2[1], c3[1], c4[1]))), j1 = Math.min(map.N - 1, Math.ceil(Math.max(c1[1], c2[1], c3[1], c4[1])));
  const pd = P.x + P.y, psx = sx(P.x, P.y), psy = sy(P.x, P.y);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const wk = map.wallKind[j * map.N + i];
    if (!wk) continue;
    const x = (i - j) * HW - view.camX, y = (i + j) * HH - view.camY;
    if (x < -HW - 4 || x > W + HW + 4 || y < -40 || y > H + 20) continue;
    items.push({ d: i + j + 1, t: 0, i, j, wk, x, y });
  }
  for (const pr of map.props) {
    const x = sx(pr.x, pr.y), y = sy(pr.x, pr.y);
    if (x < -40 || x > W + 40 || y < -10 || y > H + 70) continue;
    if (pr.kind === 'ritual') continue;
    items.push({ d: pr.x + pr.y, t: 1, o: pr, x, y });
    if (pr.kind === 'brazier') {
      const fl = 0.85 + Math.sin(G.time * 13 + pr.x * 3) * 0.08 + Math.random() * 0.07;
      lights.push({ x: pr.x, y: pr.y, z: 14, r: 95, c: B.light, i: fl });
    } else if (pr.kind === 'crystal') lights.push({ x: pr.x, y: pr.y, z: 10, r: 50, c: map.biome === 'forge' ? [255, 140, 60] : map.biome === 'frost' ? [180, 140, 255] : [80, 240, 200], i: 0.7 });
    else if (pr.altar && !pr.used) lights.push({ x: pr.x, y: pr.y, z: 10, r: 70, c: [255, 210, 120], i: 0.9 + Math.sin(G.time * 3) * 0.1 });
  }
  for (const e of G.enemies) {
    const x = sx(e.x, e.y), y = sy(e.x, e.y);
    if (x < -60 || x > W + 60 || y < -20 || y > H + 90) continue;
    items.push({ d: e.x + e.y, t: 2, o: e, x, y });
    if (e.obelisk) lights.push({ x: e.x, y: e.y, z: 20, r: 60, c: [180, 120, 255], i: 0.8 });
    if (e.isBoss) lights.push({ x: e.x, y: e.y, z: 20, r: 90, c: e.def.boss === 'crucible' ? [255, 150, 60] : e.def.boss === 'abyss' ? [220, 120, 255] : [120, 255, 200], i: 0.7 });
  }
  for (const a of G.allies) { const x = sx(a.x, a.y), y = sy(a.x, a.y); items.push({ d: a.x + a.y, t: 3, o: a, x, y }); }
  if (!P.dead) items.push({ d: P.x + P.y, t: 4, o: P, x: psx, y: psy });
  items.sort((a, b) => a.d - b.d);
  const art = map.art;
  for (const it of items) {
    if (it.t === 0) {
      const tall = it.wk === 2;
      const img = tall ? art.wallHi[(it.i * 7 + it.j * 13) & 3] : art.wallLo[(it.i + it.j) & 1];
      const hgt = tall ? 26 : 7;
      // стена перед героем — полупрозрачная
      let a = 1;
      if (tall && it.d > pd + 0.5 && Math.abs(it.x - psx) < 26 && it.y - hgt < psy && it.y + 16 > psy - 30) a = 0.35;
      ctx.globalAlpha = a;
      ctx.drawImage(img, it.x - HW, it.y - hgt);
      ctx.globalAlpha = 1;
    } else if (it.t === 1) {
      // высокий предмет перед героем — полупрозрачный
      const tallP = it.o.kind === 'pillar' || it.o.kind === 'obelisk' || it.o.kind === 'pillarBroken';
      if (tallP && it.d > pd && Math.abs(it.x - psx) < 16 && it.y > psy - 4 && it.y - 56 < psy) ctx.globalAlpha = 0.4;
      drawProp(it.o, it.x, it.y);
      ctx.globalAlpha = 1;
    }
    else if (it.t === 2) drawEnemy(it.o, it.x, it.y);
    else if (it.t === 3) drawAlly(it.o, it.x, it.y);
    else drawPlayer(P, it.x, it.y);
  }
  // ── свет
  for (const pr of G.projs) lights.push({ x: pr.x, y: pr.y, z: pr.z, r: pr.team === 'e' ? 34 : 40, c: hexRgb(pr.color || '#ffd070'), i: 0.7 });
  if (map.glows) for (const g of map.glows) lights.push({ x: g.x, y: g.y, z: 0, r: g.r, c: g.c, i: 0.45 + Math.sin(G.time * 2 + g.x) * 0.1 });
  if (G.portal) lights.push({ x: G.portal.x, y: G.portal.y, z: 16, r: 90, c: [190, 140, 255], i: 1.1 });
  for (const e of G.enemies) if (e.elite) lights.push({ x: e.x, y: e.y, z: 10, r: 36, c: eliteColor(e), i: 0.6 });
  for (const p of G.pickups) if (p.kind === 'heal') lights.push({ x: p.x, y: p.y, z: 4, r: 18, c: [255, 80, 80], i: 0.6 });
  if (!P.dead) lights.push({ x: P.x, y: P.y, z: 12, r: 150, c: [255, 222, 186], i: 1 });
  lctx.globalCompositeOperation = 'source-over';
  const amb = B.ambient;
  lctx.fillStyle = `rgb(${amb[0]},${amb[1]},${amb[2]})`;
  lctx.fillRect(0, 0, W, H);
  lctx.globalCompositeOperation = 'lighter';
  for (const L of lights) {
    const x = sx(L.x, L.y), y = sy(L.x, L.y) - (L.z || 0) * 0.5;
    if (x < -L.r || x > W + L.r || y < -L.r || y > H + L.r) continue;
    lctx.globalAlpha = Math.min(1, L.i);
    lctx.drawImage(lightFor(L.c), x - L.r, y - L.r * 0.75, L.r * 2, L.r * 1.5);
    if (L.i > 1) { lctx.globalAlpha = Math.min(1, L.i - 1); lctx.drawImage(lightFor(L.c), x - L.r, y - L.r * 0.75, L.r * 2, L.r * 1.5); }
  }
  lctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(lcv, 0, 0);
  // ── свечение
  ctx.globalCompositeOperation = 'lighter';
  drawGlow();
  ctx.globalCompositeOperation = 'source-over';
  drawOverlay();
  // атмосферные частицы
  ambientParticles(dt, B);
  ctx.globalCompositeOperation = 'lighter';
  const pc = B.particles === 'embers' ? 'rgba(255,150,60,0.8)' : B.particles === 'snow' ? 'rgba(220,230,255,0.55)' : 'rgba(200,230,220,0.28)';
  ctx.fillStyle = pc;
  for (const a of ambient) ctx.fillRect(Math.round(a.x), Math.round(a.y), a.s > 0.8 ? 2 : 1, a.s > 0.8 ? 2 : 1);
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(vign, 0, 0);
  // красная пульсация при низком здоровье
  if (!P.dead && P.hp / P.maxHp < 0.3) {
    ctx.globalAlpha = 0.18 + Math.sin(G.time * 6) * 0.1;
    ctx.fillStyle = '#a00010'; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }
}

function hexRgb(h) { const n = parseInt(h.slice(1, 7), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function eliteColor(e) {
  const a = e.elite;
  if (a.includes('fire')) return [255, 130, 40];
  if (a.includes('frost')) return [130, 220, 255];
  if (a.includes('vamp')) return [255, 50, 60];
  if (a.includes('summ')) return [180, 120, 255];
  return [255, 210, 90];
}

// круг в изометрии
function isoEllipse(c, x, y, r) { r = Math.max(0.02, r); c.beginPath(); c.ellipse(sx(x, y), sy(x, y), r * HW * 1.414, r * HH * 1.414, 0, 0, TAU); }

function drawGround(lights) {
  // тени
  const P = G.player;
  for (const e of G.enemies) {
    const x = sx(e.x, e.y), y = sy(e.x, e.y);
    if (x < -40 || x > W + 40 || y < -20 || y > H + 20) continue;
    const w = Math.round(e.r * 40 + 6);
    if (!e.obelisk) ctx.drawImage(shadowSpr, x - w / 2, y - w / 4, w, w / 2);
    // замах — предупреждение
    if (e.state === 'windup') {
      const k = clamp(1 - e.t / (e.wd || 0.4), 0, 1);
      ctx.globalAlpha = 0.25 + k * 0.4;
      ctx.fillStyle = '#ff2a20';
      const r = e.ai === 'exploder' ? 1.8 : e.isBoss ? e.def.range + 1 : e.def.range * 0.9 + e.r;
      if (e.ai !== 'ranged') { isoEllipse(ctx, e.x, e.y, r * Math.min(1, k + 0.3)); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
  }
  if (!P.dead) { const w = 18; ctx.drawImage(shadowSpr, sx(P.x, P.y) - w / 2, sy(P.x, P.y) - w / 4 + (P.z ? 0 : 0), w, w / 2); }
  for (const a of G.allies) if (a.kind !== 'hawk') ctx.drawImage(shadowSpr, sx(a.x, a.y) - 8, sy(a.x, a.y) - 4, 16, 8);
  // ритуальный круг
  for (const ob of G.objs) {
    if (ob.type !== 'ritual') continue;
    const k = ob.done / 100;
    ctx.globalAlpha = 0.5 + Math.sin(G.time * 3) * 0.15;
    ctx.strokeStyle = ob.done >= 100 ? '#ffd070' : '#b48cff'; ctx.lineWidth = 1;
    isoEllipse(ctx, ob.x, ob.y, ob.r); ctx.stroke();
    isoEllipse(ctx, ob.x, ob.y, ob.r * 0.8); ctx.stroke();
    ctx.fillStyle = 'rgba(140,90,255,0.18)';
    isoEllipse(ctx, ob.x, ob.y, ob.r * k); ctx.fill();
    for (let i = 0; i < 8; i++) {
      const a = G.time * 0.4 + i * TAU / 8;
      const x = sx(ob.x + Math.cos(a) * ob.r * 0.9, ob.y + Math.sin(a) * ob.r * 0.9), y = sy(ob.x + Math.cos(a) * ob.r * 0.9, ob.y + Math.sin(a) * ob.r * 0.9);
      ctx.fillStyle = '#d6b4ff'; ctx.fillRect(x - 1, y - 1, 3, 1); ctx.fillRect(x, y - 2, 1, 3);
    }
    ctx.globalAlpha = 1;
  }
  for (const f of G.fx) {
    if (!f.ground) continue;
    if (f.kind === 'tele') {
      const k = 1 - f.t / f.max;
      ctx.globalAlpha = 0.35 + k * 0.3;
      ctx.strokeStyle = f.color; ctx.lineWidth = 1;
      isoEllipse(ctx, f.x, f.y, f.r); ctx.stroke();
      ctx.fillStyle = f.color; ctx.globalAlpha = 0.18 + k * 0.25;
      isoEllipse(ctx, f.x, f.y, f.r * k); ctx.fill();
      ctx.globalAlpha = 1;
    } else if (f.kind === 'meteor') {
      const k = 1 - f.t / f.max;
      ctx.globalAlpha = 0.3 + k * 0.4;
      ctx.strokeStyle = f.ice ? '#9af0ff' : '#ff9a3c';
      isoEllipse(ctx, f.x, f.y, f.r); ctx.stroke();
      ctx.fillStyle = f.ice ? 'rgba(150,240,255,0.25)' : 'rgba(255,120,40,0.25)';
      isoEllipse(ctx, f.x, f.y, f.r * k); ctx.fill();
      ctx.globalAlpha = 1;
    } else if (f.kind === 'zone') {
      const k = Math.min(1, f.t / 0.5);
      ctx.globalAlpha = 0.3 * k;
      ctx.fillStyle = f.color === '#ff8a3a' ? '#6a1a04' : f.color;
      isoEllipse(ctx, f.x, f.y, f.r); ctx.fill();
      ctx.globalAlpha = 1;
    } else if (f.kind === 'trap') {
      ctx.drawImage(trapSpr, sx(f.x, f.y) - 7, sy(f.x, f.y) - 4);
      if (f.arm <= 0 && (G.time * 4 | 0) % 2) { ctx.fillStyle = f.color; ctx.fillRect(sx(f.x, f.y), sy(f.x, f.y) - 1, 1, 1); }
    } else if (f.kind === 'rain') {
      ctx.globalAlpha = 0.5; ctx.strokeStyle = f.color;
      isoEllipse(ctx, f.x, f.y, f.r); ctx.stroke(); ctx.globalAlpha = 1;
    }
  }
  // добыча
  for (const p of G.pickups) {
    const x = sx(p.x, p.y), y = sy(p.x, p.y) - Math.round(p.z) - (p.kind === 'gem' ? Math.round(Math.sin(G.time * 4 + p.x * 3) * 1.5 + 2) : 1);
    if (x < -8 || x > W + 8 || y < -8 || y > H + 8) continue;
    const img = p.kind === 'gem' ? gemSpr : p.kind === 'gold' ? goldSpr : healSpr;
    ctx.drawImage(img, x - (img.width >> 1), y - img.height);
  }
}

function frameOf(set, anim, t) {
  const arr = set.anims[anim] || set.anims.idle;
  const i = Math.floor(t) || 0;
  return arr[((i % arr.length) + arr.length) % arr.length];
}

function drawProp(pr, x, y) {
  const P = G.map.art.props;
  const img = P[pr.kind];
  if (!img) return;
  const ay = pr.kind === 'pillar' ? 56 : pr.kind === 'pillarBroken' ? 35 : pr.kind === 'tomb' ? 22 : pr.kind === 'bones' ? 6 : pr.kind === 'brazier' ? 20 : pr.kind === 'crystal' ? 27 : pr.kind === 'obeliskBroken' ? 25 : pr.kind === 'altar' ? 20 : pr.kind === 'chest' ? 15 : img.height - 4;
  ctx.drawImage(img, x - (img.width >> 1), y - ay);
  if (pr.kind === 'brazier') {
    // пламя
    for (let i = 0; i < 5; i++) {
      const h = 3 + ((G.time * 10 + i * 1.7 + pr.x) % 4);
      ctx.fillStyle = i % 2 ? '#ffd060' : '#ff7a2a';
      ctx.fillRect(x - 3 + i + Math.round(Math.sin(G.time * 9 + i) * 0.6), y - 13 - h, 1, h);
    }
    ctx.fillStyle = '#fff4c0'; ctx.fillRect(x - 1, y - 15, 2, 2);
  }
  if (pr.altar && !pr.used) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.35 + Math.sin(G.time * 3) * 0.1;
    ctx.drawImage(glowFor('#ffd070', 14), x - 14, y - 34);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
}

function drawEnemy(e, x, y) {
  if (e.obelisk) {
    const img = G.map.art.props.obelisk;
    const P = G.player;
    if (e.x + e.y > P.x + P.y && Math.abs(x - sx(P.x, P.y)) < 16 && y > sy(P.x, P.y) - 4 && y - 50 < sy(P.x, P.y)) ctx.globalAlpha = 0.4;
    const fl = e.flash > 0;
    ctx.drawImage(img, x - 12, y - 49);
    if (fl) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.6; ctx.drawImage(img, x - 12, y - 49); ctx.globalCompositeOperation = 'source-over'; }
    ctx.globalAlpha = 1;
    return;
  }
  const set = SPR[e.sprite];
  if (!set) return;
  let anim = 'idle', t = e.animT * 4;
  if (e.state === 'windup') { anim = 'atk'; t = clamp(1 - e.t / (e.wd || 0.4), 0, 1) * (set.anims.atk.length - 1); }
  else if (e.active && (e.moving || e.ai === 'ranged')) { anim = 'walk'; t = e.animT * e.speed * 3; }
  e.moving = false;
  const fr = frameOf(set, anim, t);
  const flip = e.face < 0;
  let img = flip ? fr.f : fr.c;
  if (e.flash > 0) img = set.white(fr, flip);
  const bob = e.def.fly ? Math.round(Math.sin(e.animT * 3) * 2) - 4 : 0;
  if (e.spawnT > 0) { ctx.globalAlpha = 1 - e.spawnT / 0.5; }
  if (e.ai === 'exploder' && e.state === 'windup' && (G.time * 16 | 0) % 2) img = set.white(fr, flip);
  ctx.drawImage(img, x - set.ax, y - set.ay + bob);
  ctx.globalAlpha = 1;
  if (e.st.freeze > 0) {
    ctx.globalAlpha = 0.55;
    ctx.drawImage(tinted(set, fr, flip, '#a8f4ff'), x - set.ax, y - set.ay + bob);
    ctx.globalAlpha = 1;
  }
}
function tinted(set, fr, flip, color) {
  const k = 't' + color + (flip ? 'f' : '');
  if (!fr[k]) fr[k] = tintCanvas(flip ? fr.f : fr.c, color);
  return fr[k];
}

function drawAlly(a, x, y) {
  if (a.kind === 'hawk') {
    const fl = (G.time * 10 | 0) % 2;
    ctx.drawImage(hawkSpr, x - 4, y - a.z - (fl ? 1 : 0));
    return;
  }
  const set = SPR[a.sprite];
  const anim = a.swing > 0 ? 'atk' : a.moving ? 'walk' : 'idle';
  const fr = frameOf(set, anim, anim === 'atk' ? (1 - a.swing / 0.25) * 3 : a.animT * 10);
  a.moving = false;
  ctx.globalAlpha = a.kind === 'ghost' ? 0.8 : 0.55;
  ctx.drawImage(a.face < 0 ? fr.f : fr.c, x - set.ax, y - set.ay);
  if (a.kind === 'decoy') ctx.drawImage(tinted(set, fr, a.face < 0, '#b48cff'), x - set.ax, y - set.ay);
  ctx.globalAlpha = 1;
}

function drawPlayer(P, x, y) {
  const set = SPR[CLASSES[G.save.cls].sprite];
  let anim = 'idle', t = P.animT * 5;
  if (P.atkT > 0) { anim = 'atk'; t = clamp(1 - P.atkT / (P.atkMax || 0.26), 0, 0.99) * 4; }
  else if (P.moving || P.dash) { anim = 'walk'; t = P.animT * 11; }
  if (P.jump) { anim = 'atk'; t = 0; }
  let flip = P.face < 0;
  if (P.whirl) { flip = (G.time * 12 | 0) % 2 === 0; anim = 'atk'; t = 3; }
  const fr = frameOf(set, anim, t);
  let img = flip ? fr.f : fr.c;
  if (P.flash > 0) img = set.white(fr, flip);
  if (P.buffs.stealth > 0) ctx.globalAlpha = 0.4;
  else if (P.invuln > 0 && P.dash) ctx.globalAlpha = 0.7;
  ctx.drawImage(img, x - set.ax, y - set.ay - Math.round(P.z || 0));
  ctx.globalAlpha = 1;
  if (P.buffs.cry > 0) {
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.25 + Math.sin(G.time * 8) * 0.1;
    ctx.drawImage(tinted(set, fr, flip, '#ff8a3a'), x - set.ax, y - set.ay - Math.round(P.z || 0));
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
}

function drawGlow() {
  // частицы
  for (const p of G.parts) {
    const x = sx(p.x, p.y), y = sy(p.x, p.y) - Math.round(p.z * 0.6);
    if (x < -4 || x > W + 4 || y < -4 || y > H + 4) continue;
    const a = Math.min(1, p.life / (p.max * 0.5));
    if (p.add) {
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.flashP) { ctx.drawImage(glowFor('#ffffff', 8), x - 8, y - 14, 16, 16); continue; }
      ctx.fillRect(x, y, p.size, p.size);
    }
  }
  ctx.globalAlpha = 1;
  // снаряды
  for (const p of G.projs) {
    const x = sx(p.x, p.y), y = sy(p.x, p.y) - p.z;
    if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
    const c = p.color || '#ffd070';
    if (p.kind === 'arrow' || p.kind === 'star') {
      const vx = (p.vx - p.vy) * HW, vy = (p.vx + p.vy) * HH, l = Math.hypot(vx, vy) || 1;
      ctx.strokeStyle = c; ctx.lineWidth = 1; ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.moveTo(x - vx / l * 7, y - vy / l * 7); ctx.lineTo(x, y); ctx.stroke();
      ctx.globalAlpha = 0.6; ctx.drawImage(glowFor(c, 8), x - 8, y - 8);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, 1, 1);
    } else if (p.kind === 'wave') {
      const vx = (p.vx - p.vy), vy = (p.vx + p.vy) * 0.5, l = Math.hypot(vx, vy) || 1;
      const nx = -vy / l, ny = vx / l;
      ctx.globalAlpha = Math.min(1, p.life * 3);
      ctx.strokeStyle = c; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = -5; i <= 5; i++) { const k = i / 5; const px = x + nx * k * 12 * (p.r / 0.55) - vx / l * (1 - k * k) * -4, py = y + ny * k * 12 * (p.r / 0.55) - vy / l * (1 - k * k) * -4; i === -5 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
      ctx.stroke();
      ctx.drawImage(glowFor(c, 16), x - 16, y - 16);
    } else if (p.kind === 'tornado') {
      ctx.globalAlpha = 0.7; ctx.drawImage(glowFor(c, 14), x - 14, y - 18);
    } else {
      const big = p.team === 'e' ? 12 : p.kind === 'lance' ? 14 : p.kind === 'spark' ? 7 : 11;
      ctx.globalAlpha = 0.85;
      ctx.drawImage(glowFor(c, big), x - big, y - big);
      ctx.globalAlpha = 1;
      if (p.team === 'e') {
        ctx.fillStyle = '#2a0010'; ctx.fillRect(x - 2, y - 2, 4, 4);
        ctx.fillStyle = c; ctx.fillRect(x - 1, y - 1, 2, 2);
      } else {
        ctx.fillStyle = '#fff6d0'; ctx.fillRect(x - 1, y - 1, 2, 2);
      }
      if (Math.random() < 0.7) G.parts.push({ x: p.x, y: p.y, z: p.z / 0.6, vx: -p.vx * 0.05, vy: -p.vy * 0.05, vz: rand(-5, 10), g: 0, life: 0.25, max: 0.3, size: 1, color: c, add: true });
    }
  }
  ctx.globalAlpha = 1;
  // эффекты
  for (const f of G.fx) {
    if (f.kind === 'ring') {
      const k = 1 - f.t / f.max;
      ctx.globalAlpha = (1 - k) * 0.9; ctx.strokeStyle = f.color; ctx.lineWidth = 2;
      isoEllipse(ctx, f.x, f.y, f.r * (0.3 + k * 0.7)); ctx.stroke();
    } else if (f.kind === 'slash') {
      const k = 1 - f.t / f.max;
      ctx.globalAlpha = 1 - k; ctx.strokeStyle = f.color; ctx.lineWidth = 3;
      ctx.beginPath();
      const n = 12;
      for (let i = 0; i <= n; i++) {
        const a = f.ang - f.arc + (i / n) * f.arc * 2 * Math.min(1, k * 2.5);
        const wx = f.x + Math.cos(a) * f.r, wy = f.y + Math.sin(a) * f.r;
        const px = sx(wx, wy), py = sy(wx, wy) - 10;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.stroke();
      ctx.lineWidth = 1; ctx.strokeStyle = '#ffffff'; ctx.stroke();
    } else if (f.kind === 'bolt') {
      ctx.globalAlpha = Math.min(1, f.t * 8);
      ctx.strokeStyle = f.color; ctx.lineWidth = 2;
      ctx.beginPath();
      f.pts.forEach(([wx, wy], i) => { const px = sx(wx, wy), py = sy(wx, wy) - 10; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
      ctx.stroke(); ctx.lineWidth = 1; ctx.strokeStyle = '#ffffff'; ctx.stroke();
    } else if (f.kind === 'meteor') {
      const k = f.t / f.max;
      const x = sx(f.x, f.y), y = sy(f.x, f.y) - k * 140;
      const c = f.ice ? '#9af0ff' : '#ff8a30';
      ctx.globalAlpha = 1;
      ctx.drawImage(glowFor(c, 18), x - 18 + k * 30, y - 18);
      ctx.fillStyle = '#fff4d0'; ctx.fillRect(x - 2 + k * 30, y - 2, 4, 4);
      for (let i = 1; i < 6; i++) { ctx.globalAlpha = 0.5 - i * 0.08; ctx.drawImage(glowFor(c, 10), x - 10 + k * 30 + i * 5, y - 10 - i * 8); }
    } else if (f.kind === 'orbs' && f.pts) {
      ctx.globalAlpha = 1;
      for (const [wx, wy] of f.pts) { const x = sx(wx, wy), y = sy(wx, wy) - 12; ctx.drawImage(glowFor('#ffa040', 12), x - 12, y - 12); ctx.fillStyle = '#fff4c0'; ctx.fillRect(x - 1, y - 1, 3, 3); }
    } else if (f.kind === 'arrowFall') {
      const k = f.t / f.max, x = sx(f.x, f.y), y = sy(f.x, f.y);
      ctx.globalAlpha = 1; ctx.strokeStyle = '#e8f4ff'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x - 2, y - 8 - k * 40); ctx.lineTo(x, y - k * 40); ctx.stroke();
    } else if (f.kind === 'zone' || f.kind === 'tele') {
      // свечение у края
      ctx.globalAlpha = 0.18; ctx.strokeStyle = f.color; ctx.lineWidth = 1;
      isoEllipse(ctx, f.x, f.y, f.r); ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  // портал
  if (G.portal) {
    const p = G.portal, x = sx(p.x, p.y), y = sy(p.x, p.y);
    const k = Math.min(1, p.t * 1.5);
    ctx.globalAlpha = 0.9;
    for (let i = 0; i < 28; i++) {
      const a = G.time * 2.2 + i * TAU / 28;
      const rx = 10 * k, ry = 18 * k;
      ctx.fillStyle = i % 3 ? '#b48cff' : '#ffffff';
      ctx.fillRect(Math.round(x + Math.cos(a) * rx), Math.round(y - 18 + Math.sin(a) * ry), i % 4 ? 1 : 2, i % 4 ? 1 : 2);
    }
    ctx.drawImage(glowFor('#9a62ff', 24), x - 24, y - 42);
  }
  // аура элиты и босса
  for (const e of G.enemies) {
    if (!e.elite) continue;
    const x = sx(e.x, e.y), y = sy(e.x, e.y);
    const c = eliteColor(e);
    ctx.globalAlpha = 0.35 + Math.sin(G.time * 5) * 0.1;
    ctx.drawImage(glowFor('#' + c.map((v) => v.toString(16).padStart(2, '0')).join(''), 20), x - 20, y - 30);
  }
  ctx.globalAlpha = 1;
}

function drawOverlay() {
  // полоски здоровья
  for (const e of G.enemies) {
    if (e.isBoss) continue;
    if (e.hp >= e.maxHp && !e.elite && !e.obelisk) continue;
    const set = SPR[e.sprite];
    const x = sx(e.x, e.y), y = sy(e.x, e.y) - (e.obelisk ? 54 : set ? set.ay - 4 : 30);
    if (x < -20 || x > W + 20 || y < -10 || y > H) continue;
    const w = e.elite ? 22 : e.obelisk ? 20 : 14, h = e.elite ? 3 : 2;
    const k = Math.max(0, e.hp / e.maxHp);
    ctx.fillStyle = '#0a0608'; ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = e.elite ? '#d6a548' : '#3a1418'; ctx.fillRect(x - w / 2, y, w, h);
    ctx.fillStyle = e.obelisk ? '#b48cff' : e.elite ? '#ff5a2a' : '#e0303a'; ctx.fillRect(x - w / 2, y, Math.round(w * k), h);
    if (e.elite) { ctx.fillStyle = '#ffd070'; ctx.fillRect(x - 1, y - 4, 2, 2); }
  }
  // цифры урона
  for (const t of G.texts) {
    const s = String(t.v);
    const x = sx(t.x, t.y), y = sy(t.x, t.y) - Math.round(t.z);
    const sc = t.scale >= 2 ? 2 : 1;
    const pop = t.t < 0.1 && sc === 2 ? 3 : sc;
    const cw = 4 * pop, total = s.length * cw;
    ctx.globalAlpha = t.t > 0.6 ? 1 - (t.t - 0.6) / 0.3 : 1;
    const color = TXT[t.kind] || '#ffffff';
    for (let i = 0; i < s.length; i++) {
      const d = digit(s[i], color);
      ctx.drawImage(d, Math.round(x - total / 2 + i * cw), y, 5 * pop, 7 * pop);
    }
  }
  ctx.globalAlpha = 1;
  // стрелка к цели задачи, если она за экраном
  const P = G.player;
  const tgt = currentTargetPoint();
  if (tgt && !P.dead) {
    const x = sx(tgt[0], tgt[1]), y = sy(tgt[0], tgt[1]);
    if (x < 8 || x > W - 8 || y < 8 || y > H - 8) {
      const cx = W / 2, cy = H / 2, a = Math.atan2(y - cy, x - cx);
      const ex = cx + Math.cos(a) * (W / 2 - 14), ey = cy + Math.sin(a) * (H / 2 - 14);
      const bx = clamp(ex, 10, W - 10), by = clamp(ey, 10, H - 10);
      ctx.fillStyle = tgt[2];
      for (let i = 0; i < 5; i++) for (let j = -i; j <= i; j++) ctx.fillRect(Math.round(bx + Math.cos(a) * (5 - i) * 1.2 - Math.sin(a) * j), Math.round(by + Math.sin(a) * (5 - i) * 1.2 + Math.cos(a) * j), 1, 1);
    }
  }
}

export function currentTargetPoint() {
  if (G.portal) return [G.portal.x, G.portal.y, '#c9a8ff'];
  const P = G.player;
  let best = null, bd = 1e9;
  for (const ob of G.objs) {
    if (ob.done >= ob.need) continue;
    let pts = [];
    if (ob.type === 'obelisk') pts = ob.items.filter((e) => !e.dead).map((e) => [e.x, e.y]);
    else if (ob.type === 'elite' || ob.type === 'boss') pts = ob.target.dead ? [] : [[ob.target.x, ob.target.y]];
    else if (ob.type === 'ritual') pts = [[ob.x, ob.y]];
    for (const [x, y] of pts) { const d = (x - P.x) ** 2 + (y - P.y) ** 2; if (d < bd) { bd = d; best = [x, y, '#ffd070']; } }
  }
  return best;
}
