// Интерфейс в DOM: выбор героя, путь локаций, HUD, дерево умений, дары, итоги.
import { G, hero, stats, startArea, writeSave, skillState, canAlloc, alloc, respecSkill, allocPassive, takeBoon, rollBoons, ensureStarter } from './game.js';
import { CLASSES, SKILLS, PASSIVES, BOONS, AREAS, OBJ_TEXT, xpForLevel, TIER_REQ } from './data.js';
import { SPR } from './art/sprites.js';
import { icon } from './art/icons.js';
import { BIOMES } from './art/env.js';
import { Pix, ramp, col, makeCanvas, lightSprite } from './pixel.js';
import { sfx, setMuted, isMuted, initAudio } from './audio.js';
import { touchCast } from './input.js';
import { maxCharges } from './skills.js';
import { hash2 } from './util.js';

const $ = (s, r = document) => r.querySelector(s);
const scr = () => $('#screens');
const hud = () => $('#hud');
let anims = [];

function screen(html, cls = '') {
  scr().innerHTML = `<div class="screen ${cls}">${html}</div>`;
  return scr().firstElementChild;
}
function closeScreens() { scr().innerHTML = ''; anims = []; }

export const UI = {
  onAreaStart() { closeScreens(); buildHud(); },
  toast(text, kind = 'n') {
    const el = document.createElement('div');
    el.className = 'toast ' + kind; el.textContent = text;
    $('#toasts').appendChild(el);
    while ($('#toasts').children.length > 4) $('#toasts').firstChild.remove();
    setTimeout(() => el.remove(), 2700);
  },
  levelUp(lvl) {
    UI.toast(`Новый уровень ${lvl}! +1 очко умений`, 'big');
  },
  bossBar(e) {
    const el = $('.bossbar', hud());
    if (!el) return;
    if (!e) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    $('.nm', el).textContent = e.name;
  },
  showBoons,
  showDeath,
  showComplete,
  showTree,
};

// ───────────── Фон таверны (пиксельный, рисуется кодом) ─────────────
function tavernBg(canvas) {
  const W = 320, H = 180;
  canvas.width = W; canvas.height = H;
  const c = canvas.getContext('2d');
  const base = makeCanvas(W, H), b = base.getContext('2d');
  const p = new Pix(W, H);
  const wood = ramp('#5a3a22', 6, 0.4), wood2 = ramp('#3a2416', 5, 0.35), stone = ramp('#4a4038', 5, 0.35);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v;
    if (y < 110) { // стена из досок
      const plank = Math.floor(x / 14);
      v = 0.35 + hash2(plank, 0, 3) * 0.2 + (x % 14 === 0 ? -0.3 : 0) + (hash2(x, y >> 2, 1) - 0.5) * 0.1 - (110 - y) / 110 * 0.25;
      p.set(x, y, p.pick(wood2, Math.max(0, Math.min(1, v)), x, y));
    } else { // пол
      const row = Math.floor((y - 110) / (3 + (y - 110) * 0.12));
      v = 0.4 + hash2(Math.floor((x + row * 23) / 40), row, 5) * 0.25 + ((y - 110) % 6 === 0 ? -0.25 : 0) + (y - 110) / 70 * 0.2;
      p.set(x, y, p.pick(wood, Math.max(0, Math.min(1, v)), x, y));
    }
  }
  // полки с бутылками
  for (const [sx0, sy0] of [[20, 40], [20, 70], [236, 40], [236, 70]]) {
    for (let x = sx0; x < sx0 + 64; x++) { p.set(x, sy0, wood[4]); p.set(x, sy0 + 1, wood[1]); }
    for (let k = 0; k < 7; k++) {
      const bx = sx0 + 4 + k * 9, bc = ramp(['#3a8a5a', '#8a2a3a', '#d6a548', '#4a6ab8', '#7a4ab8'][(k + sy0) % 5], 4, 0.5);
      p.ell(bx, sy0 - 5, 2.5, 4, bc, 0.6); p.rect(bx - 1, sy0 - 12, 2, 3, bc[1]);
    }
  }
  // камин
  p.poly([[128, 110], [192, 110], [188, 50], [132, 50]], stone, 0.7, 0.3);
  p.poly([[140, 110], [180, 110], [176, 76], [144, 76]], ramp('#140a08', 3), 0.3, 0.2);
  p.rect(124, 46, 72, 5, stone[4]);
  // бочки
  for (const bx of [36, 60, 262]) { p.ell(bx, 128, 11, 14, wood, 0.55); p.rect(bx - 11, 122, 22, 1, col('#2a1a0c')); p.rect(bx - 11, 134, 22, 1, col('#2a1a0c')); }
  // стол
  p.poly([[70, 140], [250, 140], [262, 152], [58, 152]], wood, 0.85, 0.5);
  p.outline(col('#0a0608'));
  b.drawImage(p.canvas(), 0, 0);
  const lightL = lightSprite(64, [255, 160, 80], 7);
  let t = 0;
  const draw = (dt) => {
    t += dt;
    c.globalCompositeOperation = 'source-over';
    c.drawImage(base, 0, 0);
    c.fillStyle = 'rgba(10,5,10,0.55)'; c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = 'lighter';
    const fl = 0.75 + Math.sin(t * 9) * 0.06 + Math.random() * 0.06;
    c.globalAlpha = fl * 0.6; c.drawImage(lightL, 160 - 110, 96 - 80, 220, 160);
    for (const [x, y] of [[40, 30], [280, 30]]) { c.globalAlpha = 0.35 + Math.random() * 0.05; c.drawImage(lightL, x - 40, y - 30, 80, 60); }
    c.globalAlpha = 1;
    // огонь в камине
    for (let i = 0; i < 18; i++) {
      const h = 6 + ((t * 14 + i * 2.3) % 14);
      c.fillStyle = i % 3 === 0 ? '#fff0a0' : i % 2 ? '#ff7a2a' : '#ffb040';
      c.fillRect(146 + i * 1.6 + Math.sin(t * 7 + i) * 1.2, 108 - h, 2, h);
    }
    // свечи
    for (const [x, y] of [[40, 30], [280, 30]]) { c.fillStyle = '#e8dcc0'; c.fillRect(x - 1, y, 3, 8); c.fillStyle = Math.random() < 0.5 ? '#ffd060' : '#ff9a3c'; c.fillRect(x, y - 3 - Math.round(Math.random()), 1, 3); }
    // искры
    for (let i = 0; i < 6; i++) { const k = (t * 0.6 + i / 6) % 1; c.fillStyle = 'rgba(255,170,80,0.8)'; c.fillRect(160 + Math.sin(t * 2 + i * 4) * 12, 100 - k * 60, 1, 1); }
    c.globalCompositeOperation = 'source-over';
  };
  return draw;
}

function spriteAnimator(canvas, set, scale = 5) {
  canvas.width = set.w * scale; canvas.height = set.h * scale;
  const c = canvas.getContext('2d'); c.imageSmoothingEnabled = false;
  let t = Math.random() * 4;
  return (dt) => {
    t += dt;
    const arr = set.anims.idle, fr = arr[Math.floor(t * 4) % arr.length];
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.drawImage(fr.c, 0, 0, set.w * scale, set.h * scale);
  };
}

export function tickUI(dt) {
  for (const a of anims) a(dt);
  if (G.state === 'play' || G.state === 'boon' || G.state === 'pause' || G.state === 'tree') updateHud(dt);
}

// ───────────── Выбор героя ─────────────
export function showMenu() {
  G.state = 'menu';
  hud().classList.add('hidden');
  const s = G.save;
  const el = screen(`
    <canvas class="bg"></canvas>
    <h1 class="logo">Пепел Бездны</h1>
    <div class="sub">пиксельный экшен-RPG · орды, задачи, ветки умений</div>
    <div class="ribbon">Выберите героя</div>
    <div class="heroes">${Object.entries(CLASSES).map(([k, C]) => {
      const h = s.heroes[k], up = h.upgrades || 0, cost = upgradeCost(h);
      const st = C.hp + (h.level - 1) * 9 + up * 12;
      const sk = SKILLS[C.skills[0]];
      return `<div class="hero ${s.cls === k ? 'sel' : ''}" data-c="${k}">
        <div class="card">
          <div class="name">${C.name}</div>
          <div class="stat">Уровень: <b>${h.level}</b> · ${C.title}</div>
          <div class="stat">Здоровье: <b>${st}</b> · Скорость: <b>${Math.round(C.speed * 50)}</b></div>
          <div class="stat s">Закалка: <b>${up}</b> · Пройдено: <b>${h.progress}/${AREAS.length}</b></div>
          <div class="weap"><img class="px" src="${icon(sk.icon, sk.color)}"><span>Оружие:<br><b>${sk.name}</b></span></div>
          <div class="lore">${C.lore}</div>
        </div>
        <canvas class="spr"></canvas>
        <div class="btns"><button class="btn gold small up" data-c="${k}" ${s.gold < cost ? 'disabled' : ''}>Закалить · ${cost}</button></div>
      </div>`;
    }).join('')}</div>
    <div class="bottomrow">
      <div class="goldbox frame"><span class="coin"></span>${s.gold}</div>
      <button class="btn play">Играть</button>
      <button class="btn gray small snd">${isMuted() ? 'Звук: выкл' : 'Звук: вкл'}</button>
    </div>
    <div class="help"><kbd>WASD</kbd> — бег · <kbd>ЛКМ</kbd> — атака · <kbd>ПКМ</kbd>/<kbd>Q</kbd> — умение 2 · <kbd>Пробел</kbd> — умение 3 · <kbd>E</kbd> — умение 4 · <kbd>T</kbd> — дерево умений · <kbd>Esc</kbd> — пауза<br>На телефоне: левый палец — бег, касание справа — удар, кнопки — умения.</div>
  `);
  anims = [tavernBg($('canvas.bg', el))];
  el.querySelectorAll('.hero').forEach((h) => {
    const k = h.dataset.c;
    anims.push(spriteAnimator($('canvas.spr', h), SPR[CLASSES[k].sprite], 5));
    h.addEventListener('click', (e) => {
      if (e.target.closest('.up')) return;
      initAudio(); sfx('ui');
      if (s.cls === k) return showPath();
      s.cls = k; writeSave(); showMenu();
    });
  });
  el.querySelectorAll('.up').forEach((b) => b.addEventListener('click', () => {
    const h = s.heroes[b.dataset.c], cost = upgradeCost(h);
    if (s.gold < cost) return;
    s.gold -= cost; h.upgrades = (h.upgrades || 0) + 1; writeSave(); sfx('coin'); showMenu();
  }));
  $('.play', el).addEventListener('click', () => { initAudio(); sfx('ui'); showPath(); });
  $('.snd', el).addEventListener('click', (e) => { initAudio(); setMuted(!isMuted()); e.target.textContent = isMuted() ? 'Звук: выкл' : 'Звук: вкл'; });
}
const upgradeCost = (h) => Math.round(60 * Math.pow(1.6, h.upgrades || 0));

// ───────────── Путь ─────────────
export function showPath() {
  G.state = 'path';
  G.boons = {}; // дары сгорают, когда возвращаешься в лагерь
  hud().classList.add('hidden');
  ensureStarter();
  const h = hero(), C = CLASSES[G.save.cls];
  const acts = [['crypt', 'Акт I · Склеп'], ['forge', 'Акт II · Горнило'], ['frost', 'Акт III · Бездна']];
  const el = screen(`
    <canvas class="bg"></canvas>
    <div class="ribbon" style="margin-top:8px">Путь в Бездну</div>
    <div class="sub">${C.name} · уровень ${h.level} · очков умений: <b style="color:#ffd070">${h.points}</b></div>
    <div class="path">${acts.map(([b, t], ai) => `<div class="act frame"><h3 style="color:${BIOMES[b].accent}">${t}</h3>${AREAS.map((a, i) => a.biome !== b ? '' : `
      <div class="area ${i > h.progress ? 'locked' : ''} ${i < h.progress ? 'done' : ''}" data-i="${i}">
        <img class="px" src="${icon(a.boss ? 'skull' : i % 3 === 1 ? 'portal' : 'burst', BIOMES[b].accent)}">
        <div><div class="nm">${a.name}</div><div class="lv">Ур. монстров ${a.lvl}${a.boss ? ' · босс' : ''} · ${a.obj.map((o) => ({ obelisk: 'обелиски', elite: 'вожак', ritual: 'ритуал', boss: 'босс' })[o]).join(', ')}</div></div>
      </div>`).join('')}</div>`).join('')}</div>
    ${h.progress >= AREAS.length ? `<div class="area frame" data-i="${Math.max(AREAS.length, h.progress)}" style="max-width:420px;width:100%"><img class="px" src="${icon('portal', '#b48cff')}"><div><div class="nm">Глубина Бездны ${Math.max(AREAS.length, h.progress) - AREAS.length + 1}</div><div class="lv">Бесконечный спуск: каждая глубина сильнее</div></div></div>` : ''}
    <div class="bottomrow">
      <button class="btn gray small back">← К героям</button>
      <button class="btn gold small tree">Дерево умений ${h.points ? `(${h.points})` : ''}</button>
      <div class="goldbox frame"><span class="coin"></span>${G.save.gold}</div>
    </div>
  `);
  anims = [tavernBg($('canvas.bg', el))];
  el.querySelectorAll('.area').forEach((a) => a.addEventListener('click', () => {
    if (a.classList.contains('locked')) return;
    sfx('portal');
    startArea(+a.dataset.i);
  }));
  $('.back', el).addEventListener('click', () => { sfx('ui'); showMenu(); });
  $('.tree', el).addEventListener('click', () => { sfx('ui'); showTree(() => showPath()); });
}

// ───────────── HUD ─────────────
let hudEls = null, mmT = 0, mmBase = null;
function buildHud() {
  const C = CLASSES[G.save.cls];
  const keys = ['ЛКМ', 'ПКМ', 'Пробел', 'E'];
  hud().innerHTML = `
    <div class="tl">
      <div class="lvl">1</div>
      <div class="bars">
        <div class="bar hp"><i></i><s></s><b></b></div>
        <div class="bar xp"><i></i></div>
      </div>
    </div>
    <div class="boons"></div>
    <div class="bossbar hidden"><div class="nm"></div><div class="bar"><i></i></div></div>
    <div class="tr">
      <div class="minimap frame"><canvas></canvas></div>
      <div class="objs frame"><h4></h4><div class="list"></div></div>
    </div>
    <div class="timer">00:00</div>
    <div class="skillbar">${C.skills.map((id, i) => `<div class="slot" data-i="${i}"><img class="px" src="${icon(SKILLS[id].icon, SKILLS[id].color)}"><div class="cd"></div><div class="key">${keys[i]}</div><div class="ch"></div></div>`).join('')}</div>
    <div class="br">
      <div class="pill frame"><span class="coin"></span><span class="gold">0</span></div>
      <div class="pill frame">☠ <span class="kills">0</span></div>
      <div class="iconbtn treeb" title="Дерево умений (T)">✦<span class="badge hidden"></span></div>
      <div class="iconbtn pauseb" title="Пауза (Esc)">❚❚</div>
    </div>`;
  hud().classList.remove('hidden');
  hudEls = {
    lvl: $('.lvl', hud()), hp: $('.bar.hp i', hud()), sh: $('.bar.hp s', hud()), hpt: $('.bar.hp b', hud()), xp: $('.bar.xp i', hud()),
    boons: $('.boons', hud()), boss: $('.bossbar .bar i', hud()), mm: $('.minimap canvas', hud()), objH: $('.objs h4', hud()), objL: $('.objs .list', hud()),
    timer: $('.timer', hud()), slots: [...hud().querySelectorAll('.slot')], gold: $('.gold', hud()), kills: $('.kills', hud()), treeb: $('.treeb', hud()), badge: $('.treeb .badge', hud()),
  };
  hudEls.slots.forEach((s, i) => {
    const on = (e) => { e.preventDefault(); touchCast[i] = true; };
    const off = (e) => { e.preventDefault(); touchCast[i] = false; };
    s.addEventListener('touchstart', on, { passive: false }); s.addEventListener('touchend', off); s.addEventListener('touchcancel', off);
    s.addEventListener('mousedown', (e) => { if (i > 0) { touchCast[i] = true; setTimeout(() => (touchCast[i] = false), 80); } });
  });
  hudEls.treeb.addEventListener('click', () => toggleTree());
  $('.pauseb', hud()).addEventListener('click', () => togglePause());
  const N = G.map.N;
  hudEls.mm.width = N * 2; hudEls.mm.height = N + 2;
  mmBase = null; mmT = 0;
  hudEls.lastBoons = '';
}

function updateHud(dt) {
  if (!hudEls || !G.player) return;
  const P = G.player, h = hero(), S = G.stats || stats();
  hudEls.lvl.textContent = h.level;
  hudEls.hp.style.width = (Math.max(0, P.hp) / P.maxHp * 100) + '%';
  hudEls.sh.style.width = (P.shield / P.maxHp * 100) + '%';
  hudEls.hpt.textContent = `${Math.ceil(Math.max(0, P.hp))} / ${P.maxHp}`;
  hudEls.xp.style.width = (h.xp / xpForLevel(h.level) * 100) + '%';
  hudEls.gold.textContent = G.save.gold;
  hudEls.kills.textContent = G.kills;
  const t = Math.floor(G.runTime);
  hudEls.timer.textContent = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  hudEls.badge.classList.toggle('hidden', !h.points);
  hudEls.badge.textContent = h.points;
  hudEls.treeb.classList.toggle('glow', h.points > 0);
  // умения
  const skills = CLASSES[G.save.cls].skills;
  skills.forEach((id, i) => {
    const s = hudEls.slots[i], m = skillState(id);
    s.classList.toggle('locked', !m.base);
    const cd = P.cds[id] || 0, mx = (P.cdMax && P.cdMax[id]) || SKILLS[id].cd;
    const mc = maxCharges(id), ch = P.charges[id] ?? mc;
    const k = mc > 1 && ch > 0 ? 0 : Math.max(0, Math.min(1, cd / mx));
    s.querySelector('.cd').style.setProperty('--a', (k * 360) + 'deg');
    s.querySelector('.ch').textContent = mc > 1 ? ch : '';
    s.classList.toggle('ready', !!m.base && k === 0);
  });
  // дары
  const bk = JSON.stringify(G.boons);
  if (bk !== hudEls.lastBoons) {
    hudEls.lastBoons = bk;
    hudEls.boons.innerHTML = Object.entries(G.boons).map(([id, l]) => { const b = BOONS.find((x) => x.id === id); return `<div class="boon" title="${b.name}: ${b.desc(l)}"><img class="px" src="${icon(b.icon, b.color)}"><b>${l}</b></div>`; }).join('');
  }
  if (G.boss) hudEls.boss.style.width = (Math.max(0, G.boss.hp) / G.boss.maxHp * 100) + '%';
  // задачи
  hudEls.objH.textContent = G.area.name;
  hudEls.objL.innerHTML = G.objs.map((o) => `<div class="${o.done >= o.need ? 'ok' : ''}">◆ ${OBJ_TEXT[o.type](o.done, o.need, o.name)}</div>`).join('') +
    (G.portal ? '<div class="portal">◆ Войти в портал</div>' : '') +
    (G.map.props.some((p) => p.altar && !p.used) ? '<div style="color:#ffd070;opacity:.8">◇ Найти алтарь даров (по желанию)</div>' : '');
  // мини-карта
  mmT -= dt;
  if (mmT <= 0) { mmT = 0.15; drawMinimap(); }
}

function drawMinimap() {
  const map = G.map, N = map.N, c = hudEls.mm.getContext('2d');
  if (!mmBase || G.mapDirty) {
    G.mapDirty = false;
    mmBase = mmBase || makeCanvas(N * 2, N + 2);
    const b = mmBase.getContext('2d');
    b.clearRect(0, 0, N * 2, N + 2);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      if (!map.explored[j * N + i]) continue;
      const v = map.g[j * N + i];
      if (!v) continue;
      b.fillStyle = v === 1 ? 'rgba(170,160,150,0.55)' : v === 3 ? 'rgba(120,110,100,0.6)' : 'rgba(230,210,170,0.85)';
      b.fillRect(i - j + N, ((i + j) >> 1), 2, 1);
    }
  }
  c.clearRect(0, 0, N * 2, N + 2);
  c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(0, 0, N * 2, N + 2);
  c.drawImage(mmBase, 0, 0);
  const dot = (x, y, col, s = 2) => { c.fillStyle = col; c.fillRect(Math.round(x - y + N) - (s >> 1), Math.round((x + y) / 2) - (s >> 1), s, s); };
  for (const ob of G.objs) {
    if (ob.done >= ob.need) continue;
    if (ob.type === 'obelisk') ob.items.forEach((e) => { if (!e.dead && map.explored[Math.floor(e.y) * N + Math.floor(e.x)]) dot(e.x, e.y, '#c9a8ff', 3); });
    if (ob.type === 'ritual') dot(ob.x, ob.y, '#b48cff', 4);
    if ((ob.type === 'elite' || ob.type === 'boss') && !ob.target.dead) dot(ob.target.x, ob.target.y, '#ff5a3a', 3);
  }
  for (const p of map.props) if (p.altar && !p.used && map.explored[Math.floor(p.y) * N + Math.floor(p.x)]) dot(p.x, p.y, '#ffd070', 3);
  for (const e of G.enemies) if (e.active && !e.obelisk) dot(e.x, e.y, 'rgba(255,60,60,0.8)', 1);
  if (G.portal) dot(G.portal.x, G.portal.y, '#e0c8ff', 4);
  dot(G.player.x, G.player.y, '#ffffff', 3);
}

// ───────────── Пауза ─────────────
export function togglePause() {
  if (G.state === 'play') {
    G.state = 'pause';
    const el = screen(`<div class="result frame"><h2>Пауза</h2>
      <div class="btns" style="flex-direction:column;align-items:center">
        <button class="btn res">Продолжить</button>
        <button class="btn gold small tr">Дерево умений</button>
        <button class="btn gray small snd">${isMuted() ? 'Звук: выкл' : 'Звук: вкл'}</button>
        <button class="btn red small quit">Покинуть локацию</button>
      </div><div class="help" style="margin-top:10px">Покинув локацию, вы потеряете дары алтарей.</div></div>`, 'dim');
    $('.res', el).addEventListener('click', () => togglePause());
    $('.tr', el).addEventListener('click', () => { G.state = 'play'; toggleTree(); });
    $('.snd', el).addEventListener('click', (e) => { setMuted(!isMuted()); e.target.textContent = isMuted() ? 'Звук: выкл' : 'Звук: вкл'; });
    $('.quit', el).addEventListener('click', () => { closeScreens(); showPath(); });
  } else if (G.state === 'pause') { closeScreens(); G.state = 'play'; }
}

export function toggleTree() {
  if (G.state === 'play') { G.state = 'tree'; showTree(() => { closeScreens(); G.state = 'play'; }); }
  else if (G.state === 'tree') { closeScreens(); G.state = 'play'; }
}

// ───────────── Дерево умений ─────────────
function showTree(onClose) {
  let tab = 'skills', sel = null;
  const render = () => {
    const h = hero(), C = CLASSES[G.save.cls];
    const el = screen(`<div class="tree frame">
      <div class="hd"><h2>Дерево умений · ${C.name}</h2>
        <div class="tabs"><div class="tab ${tab === 'skills' ? 'on' : ''}" data-t="skills">Умения</div><div class="tab ${tab === 'pas' ? 'on' : ''}" data-t="pas">Пассивы</div></div>
        <div class="pts">Уровень ${h.level} · очков: <b>${h.points}</b></div>
        <button class="btn small close">Готово</button></div>
      ${tab === 'skills' ? `<div class="cols">${C.skills.map((id) => skillCol(id)).join('')}</div>` : `<div class="passives">${PASSIVES.map((p) => `<div class="pas" data-p="${p.id}"><div class="node ${(h.passives[p.id] || 0) > 0 ? 'own' : ''} ${h.points && (h.passives[p.id] || 0) < p.max ? 'can' : ''}"><img class="px" src="${icon(p.icon, p.color)}"></div><div>${p.name}</div><div class="pips">${Array.from({ length: p.max }, (_, i) => `<i class="${i < (h.passives[p.id] || 0) ? 'on' : ''}"></i>`).join('')}</div><div class="bname">${p.desc}</div></div>`).join('')}</div>`}
      <div class="info frame">${sel || 'Нажмите на узел, чтобы прочитать описание. Подсвеченный зелёным можно изучить. Из трёх веток умения выбирается одна — как руна; её можно сбросить и выбрать другую.'}</div>
    </div>`, 'dim');
    el.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => { tab = t.dataset.t; sel = null; sfx('ui'); render(); }));
    $('.close', el).addEventListener('click', () => { sfx('ui'); onClose(); });
    el.querySelectorAll('.node[data-s]').forEach((n) => n.addEventListener('click', () => {
      const id = n.dataset.s, node = n.dataset.n === 'base' ? 'base' : n.dataset.n.split(',').map(Number);
      sel = describe(id, node);
      if (alloc(id, node)) { sfx('level'); sel = '<b>Изучено!</b> ' + sel; }
      render();
    }));
    el.querySelectorAll('.respec').forEach((b) => b.addEventListener('click', () => { respecSkill(b.dataset.s); sfx('ui'); render(); }));
    el.querySelectorAll('.pas').forEach((p) => p.addEventListener('click', () => {
      const def = PASSIVES.find((x) => x.id === p.dataset.p);
      sel = `<b>${def.name}</b> — ${def.desc} за очко. Максимум ${def.max}.`;
      if (allocPassive(def.id)) sfx('level');
      render();
    }));
  };
  render();
}

function skillCol(id) {
  const def = SKILLS[id], s = skillState(id), h = hero();
  const nodeCls = (own, can) => `node ${own ? 'own' : ''} ${can ? 'can' : ''}`;
  return `<div class="col">
    <div class="${nodeCls(s.base, canAlloc(id, 'base'))} big" data-s="${id}" data-n="base"><img class="px" src="${icon(def.icon, def.color)}"></div>
    <div class="cname">${def.name}</div><div class="ckey">${def.key}${!s.base && h.level < def.req ? ` · с ур. ${def.req}` : ''}</div>
    <div class="branches">${def.runes.map((r, ri) => `<div class="br3 ${s.rune === ri ? 'on' : ''}">
      ${[1, 2, 3].map((t) => `<div class="${nodeCls(s.rune === ri && s.tier >= t, canAlloc(id, [ri, t]))}" data-s="${id}" data-n="${ri},${t}"><img class="px" src="${icon(r.icon, r.color)}"><div class="rn">${['I', 'II', 'III'][t - 1]}</div></div>`).join('')}
      <div class="bname">${r.name}</div></div>`).join('')}</div>
    ${s.rune >= 0 ? `<button class="btn gray small respec" data-s="${id}" style="margin-top:6px">Сбросить ветку</button>` : ''}
  </div>`;
}

function describe(id, node) {
  const def = SKILLS[id], h = hero();
  if (node === 'base') return `<b>${def.name}</b> (${def.key}) — ${def.desc} Перезарядка ${def.cd} с.${h.level < def.req ? ` <span class="req">Нужен уровень ${def.req}.</span>` : ''}`;
  const [ri, t] = node, r = def.runes[ri];
  const txt = t === 1 ? r.desc : t === 2 ? r.t2 : r.t3;
  const s = skillState(id);
  let req = '';
  if (!s.base) req = ' <span class="req">Сначала изучите само умение.</span>';
  else if (h.level < TIER_REQ[t]) req = ` <span class="req">Нужен уровень ${TIER_REQ[t]}.</span>`;
  else if (t === 1 && s.rune >= 0 && s.rune !== ri) req = ' <span class="req">Выбрана другая ветка — сбросьте её.</span>';
  return `<b>${r.name} ${['I', 'II', 'III'][t - 1]}</b> — ${txt}${req}`;
}

// ───────────── Дары ─────────────
function showBoons() {
  const opts = rollBoons();
  if (!opts.length) { G.state = 'play'; return; }
  sfx('level');
  const el = screen(`<div class="ribbon">Дар Бездны</div>
    <div class="cards">${opts.map((b) => { const l = (G.boons[b.id] || 0) + 1; return `<div class="bcard" data-b="${b.id}">
      <div class="orb"><img class="px" src="${icon(b.icon, b.color, '#1a1220')}"></div>
      <div class="lvtag ${l === 1 ? 'new' : ''}">${l === 1 ? 'Новое!' : 'Уровень ' + l}</div>
      <div class="t">${b.name}</div><div class="d">${b.desc(l)}</div></div>`; }).join('')}</div>
    <div class="help">Дары действуют до гибели героя или возвращения в лагерь.</div>`, 'dim');
  el.querySelectorAll('.bcard').forEach((c) => c.addEventListener('click', () => { takeBoon(c.dataset.b); sfx('portal'); closeScreens(); }));
}

// ───────────── Итоги ─────────────
function fmtTime(t) { t = Math.floor(t); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; }
function showDeath() {
  const el = screen(`<div class="result dead frame"><h2>Вы пали</h2>
    <div class="row">${G.area.name}</div>
    <div class="row">Убито: ${G.kills} · Время: ${fmtTime(G.runTime)} · Золото: ${G.runGold}</div>
    <div class="help">Опыт и уровень сохранены. Дары алтарей потеряны.</div>
    <div class="btns"><button class="btn again">Ещё раз</button><button class="btn gray path">В лагерь</button></div></div>`, 'dim');
  writeSave();
  $('.again', el).addEventListener('click', () => { G.boons = {}; G.runGold = 0; startArea(G.areaIndex); });
  $('.path', el).addEventListener('click', () => showPath());
}
function showComplete(bonus) {
  const next = G.areaIndex + 1;
  const name = next < AREAS.length ? AREAS[next].name : `Глубина Бездны ${next - AREAS.length + 1}`;
  const el = screen(`<div class="result frame"><h2>Локация очищена</h2>
    <div class="row">${G.area.name}</div>
    <div class="row">Убито: ${G.kills} · Время: ${fmtTime(G.runTime)}</div>
    <div class="row" style="color:#ffd070">Награда: +${bonus} золота</div>
    <div class="btns"><button class="btn next">Дальше: ${name}</button><button class="btn gray path">В лагерь</button></div>
    <div class="help" style="margin-top:8px">Идёте дальше — дары остаются с вами.</div></div>`, 'dim');
  $('.next', el).addEventListener('click', () => { sfx('portal'); startArea(next); });
  $('.path', el).addEventListener('click', () => showPath());
}
