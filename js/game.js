// Ядро: состояние, сохранение, герой, монстры, бой, задачи локации, добыча.
import { CLASSES, SKILLS, PASSIVES, BOONS, ENEMIES, ELITE_AFFIX, ELITE_NAMES, BIOME_MOBS, AREAS, xpForLevel, MAX_LEVEL, TIER_REQ } from './data.js';
import { generateMap, bakeFloor, flowField, flowDir, los, collide, randomFloorNear, stain, FLOOR } from './world.js';
import { rand, randi, choice, clamp, dist, dist2, shuffle, TAU } from './util.js';
import { sfx } from './audio.js';
import { castSkill, updateSkillsPassive } from './skills.js';
import { BIOMES } from './art/env.js';

export const G = {
  state: 'menu', time: 0, shake: 0, hitstop: 0, slowmo: 0,
  map: null, player: null, enemies: [], projs: [], fx: [], parts: [], texts: [], pickups: [], allies: [], objs: [],
  lights: [], portal: null, boss: null, area: null, areaIndex: 0, kills: 0, runGold: 0, runTime: 0,
  boons: {}, msgs: [], cam: { x: 0, y: 0 }, input: null, ui: null, pendingBoon: 0,
};

// ───────────── Сохранение ─────────────
const KEY = 'ashes-abyss-save-v1';
export function newHero() {
  return { level: 1, xp: 0, points: 0, alloc: {}, passives: {}, progress: 0, upgrades: 0 };
}
export function loadSave() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { s = null; }
  if (!s || !s.heroes) s = { gold: 0, cls: 'warrior', heroes: {} };
  for (const c in CLASSES) if (!s.heroes[c]) s.heroes[c] = newHero();
  G.save = s;
  return s;
}
export function writeSave() { try { localStorage.setItem(KEY, JSON.stringify(G.save)); } catch (e) { /* нет хранилища — играем без сохранения */ } }
export const hero = () => G.save.heroes[G.save.cls];

// ───────────── Характеристики ─────────────
export function skillState(id) {
  const h = hero();
  return h.alloc[id] || { base: 0, rune: -1, tier: 0 };
}
export function stats() {
  const h = hero(), C = CLASSES[G.save.cls];
  const ps = (id) => h.passives[id] || 0;
  const b = (id) => G.boons[id] || 0;
  const up = h.upgrades || 0;
  const s = {
    maxHp: Math.round((C.hp + (h.level - 1) * 9 + up * 12) * (1 + ps('vit') * 0.12)),
    dmg: (1 + (h.level - 1) * 0.09 + up * 0.05) * (1 + ps('pow') * 0.08) * (1 + b('might') * 0.15),
    crit: 0.05 + ps('crit') * 0.04,
    cdr: Math.max(0.4, (1 - ps('cdr') * 0.05) * (1 - b('haste') * 0.05)),
    speed: C.speed * (1 + ps('spd') * 0.05 + b('haste') * 0.08),
    leech: ps('leech') * 0.015,
    pickup: 2.2 * (1 + ps('mag') * 0.4),
    armor: C.armor,
    greed: 1 + b('greed') * 0.25,
  };
  const P = G.player;
  if (P && P.buffs.cry > 0) { s.dmg *= 1.3; s.armor = Math.min(0.8, s.armor + 0.2); }
  return s;
}

// ───────────── Начало локации ─────────────
export function startArea(index) {
  const area = index < AREAS.length ? AREAS[index] : endlessArea(index);
  G.area = area; G.areaIndex = index;
  const seed = (Date.now() & 0xffffff) ^ (index * 7919);
  const map = generateMap(area, seed);
  bakeFloor(map);
  G.map = map;
  G.enemies = []; G.projs = []; G.fx = []; G.parts = []; G.texts = []; G.pickups = []; G.allies = []; G.objs = [];
  G.portal = null; G.boss = null; G.kills = 0; G.runTime = 0; G.spawnT = 6; G.msgs = [];
  G.mlvl = area.lvl + Math.max(0, hero().level - area.lvl - 2) * 0.5; // уровень монстров
  const start = map.rooms[0];
  const st = stats();
  G.player = {
    x: start.x, y: start.y, r: 0.3, hp: st.maxHp, maxHp: st.maxHp, face: 1, aimX: start.x + 1, aimY: start.y,
    anim: 'idle', animT: 0, atkT: 0, cds: {}, charges: {}, invuln: 0, flash: 0, moving: false,
    buffs: { cry: 0, fury: 0, shadowShots: 0, stealth: 0 }, shield: 0, shieldT: 0, swing: 0, z: 0,
    jump: null, dash: null, whirl: null, regenT: 0, dead: false,
  };
  map.explored = new Uint8Array(map.N * map.N);
  setupObjectives(area);
  populate(area);
  flowField(map, Math.floor(G.player.x), Math.floor(G.player.y));
  G.flowTile = -1;
  G.state = 'play';
  G.ui?.onAreaStart();
  pushMsg(area.name, 'big');
}

function endlessArea(index) {
  const k = index - AREAS.length + 1;
  const biome = ['crypt', 'forge', 'frost'][k % 3];
  const objs = shuffle(['obelisk', 'elite', 'ritual']).slice(0, 2);
  return { name: `Глубина Бездны ${k}`, biome, lvl: 17 + k * 2, obj: k % 3 === 0 ? ['boss'] : objs, boss: k % 3 === 0 ? ['shepherd', 'crucible', 'abyss'][(k / 3) % 3] : null, size: 76, endless: true };
}

function setupObjectives(area) {
  const map = G.map;
  const rooms = map.rooms.slice(2);
  const far = map.rooms.slice(Math.floor(map.rooms.length / 2));
  shuffle(rooms);
  for (const o of area.obj) {
    if (o === 'obelisk') {
      const n = 3;
      const ob = { type: 'obelisk', need: n, done: 0, items: [] };
      const pool = shuffle(map.allRooms.slice(2));
      for (let i = 0; i < n && i < pool.length; i++) {
        const p = randomFloorNear(map, pool[i].x, pool[i].y, 0, 1.5) || [pool[i].x, pool[i].y];
        const e = spawnObelisk(p[0], p[1]);
        ob.items.push(e);
      }
      G.objs.push(ob);
    } else if (o === 'elite') {
      const rm = choice(far);
      const p = randomFloorNear(map, rm.x, rm.y, 0, 2) || [rm.x, rm.y];
      const common = BIOME_MOBS[area.biome];
      const e = spawnEnemy(choice(common.heavy), p[0], p[1], { elite: true, affixes: 2 });
      e.objective = true;
      for (let k = 0; k < 6; k++) { const q = randomFloorNear(map, p[0], p[1], 1, 3); if (q) spawnEnemy(choice(common.common), q[0], q[1]); }
      G.objs.push({ type: 'elite', need: 1, done: 0, name: e.name, target: e });
    } else if (o === 'ritual') {
      const rm = rooms.find((r) => r.r > 4.5) || rooms[0] || map.rooms[1];
      G.objs.push({ type: 'ritual', need: 100, done: 0, x: rm.x, y: rm.y, r: 2.6, spawnT: 0, active: false });
      map.props.push({ kind: 'ritual', x: rm.x, y: rm.y, solid: false, ritual: true });
    } else if (o === 'boss') {
      const rm = map.rooms[map.rooms.length - 1];
      const e = spawnEnemy(area.boss, rm.x, rm.y, { boss: true });
      e.objective = true;
      G.objs.push({ type: 'boss', need: 1, done: 0, name: e.name, target: e });
    }
  }
  // алтарь даров — в боковом зале (или в середине пути)
  const altRoom = map.side.length ? choice(map.side) : map.rooms[Math.floor(map.rooms.length / 2)];
  const ap = randomFloorNear(map, altRoom.x, altRoom.y, 0, 1) || [altRoom.x, altRoom.y];
  map.props.push({ kind: 'altar', x: ap[0], y: ap[1], solid: false, altar: true, used: false, light: true });
}

function populate(area) {
  const map = G.map, M = BIOME_MOBS[area.biome];
  const dens = 0.9 + Math.min(1.2, area.lvl * 0.05);
  for (const rm of map.allRooms) {
    if (rm.i === 0) continue;
    if (area.boss && rm === map.rooms[map.rooms.length - 1]) continue;
    const packs = Math.max(1, Math.round(rm.r / 2.6 * dens));
    for (let k = 0; k < packs; k++) {
      const c = randomFloorNear(map, rm.x, rm.y, 0, rm.r * 0.8);
      if (!c) continue;
      const type = choice(M.common);
      const n = randi(4, 7);
      for (let m = 0; m < n; m++) {
        const q = randomFloorNear(map, c[0], c[1], 0, 1.8);
        if (q) spawnEnemy(m === 0 && Math.random() < 0.4 ? choice(M.common) : type, q[0], q[1]);
      }
      if (Math.random() < 0.18 + area.lvl * 0.01) {
        const q = randomFloorNear(map, c[0], c[1], 0, 1.5);
        if (q) spawnEnemy(choice(M.heavy), q[0], q[1], Math.random() < 0.35 ? { elite: true, affixes: 1 } : {});
      }
    }
  }
}

// ───────────── Монстры ─────────────
export function spawnEnemy(type, x, y, o = {}) {
  const d = ENEMIES[type];
  const L = G.mlvl || 1;
  const hpK = 1 + (L - 1) * 0.32, dK = 1 + (L - 1) * 0.16;
  const e = {
    type, def: d, sprite: d.sprite, x, y, r: d.r, hp: d.hp * hpK, maxHp: d.hp * hpK, dmg: d.dmg * dK, speed: d.speed * rand(0.92, 1.08),
    ai: d.ai, state: 'idle', t: 0, atkCd: rand(0.5, 1.5), face: Math.random() < 0.5 ? 1 : -1, flash: 0, kx: 0, ky: 0,
    st: { burn: 0, burnD: 0, bleed: 0, bleedD: 0, chill: 0, chillA: 0, freeze: 0, stun: 0, fear: 0, poison: 0, poisonD: 0, slow: 0 },
    animT: Math.random() * 10, active: false, dead: false, xp: d.xp, elite: null, bossT: {}, summons: 0,
  };
  if (o.elite) {
    const af = shuffle(ELITE_AFFIX.slice()).slice(0, o.affixes || 1);
    e.elite = af.map((a) => a.id);
    e.name = choice(ELITE_NAMES) + ' ' + af.map((a) => a.name).join(', ').toLowerCase();
    e.hp = e.maxHp = e.maxHp * (4 + (e.elite.includes('tough') ? 3 : 0));
    e.dmg *= 1.4; e.xp *= 6;
    if (e.elite.includes('fast')) e.speed *= 1.45;
    e.active = true;
  }
  if (o.boss) {
    e.isBoss = true; e.name = d.name;
    e.hp = e.maxHp = d.hp * (1 + (L - 1) * 0.22);
    e.dmg = d.dmg * dK;
  }
  if (o.active) e.active = true;
  G.enemies.push(e);
  return e;
}

function spawnObelisk(x, y) {
  const e = spawnEnemy('ghoul', x, y);
  Object.assign(e, { type: 'obelisk', sprite: null, ai: 'obelisk', r: 0.55, speed: 0, xp: 25, obelisk: true, waves: 0, name: 'Обелиск порчи' });
  e.hp = e.maxHp = 220 * (1 + (G.mlvl - 1) * 0.3);
  return e;
}

export function spawnWave(x, y, n, rmin = 4, rmax = 8) {
  const M = BIOME_MOBS[G.area.biome];
  for (let i = 0; i < n; i++) {
    const p = randomFloorNear(G.map, x, y, rmin, rmax);
    if (!p) continue;
    const e = spawnEnemy(Math.random() < 0.06 ? choice(M.heavy) : choice(M.common), p[0], p[1], { active: true });
    e.spawnT = 0.5;
    burstParts(p[0], p[1], 8, BIOMES[G.area.biome].accent, 2, true);
  }
}

// ───────────── Пространственная сетка ─────────────
const CELL = 2;
let grid = null, gw = 0;
function rebuildGrid() {
  const N = G.map.N; gw = Math.ceil(N / CELL);
  if (!grid || grid.length !== gw * gw) grid = Array.from({ length: gw * gw }, () => []);
  for (const c of grid) c.length = 0;
  for (const e of G.enemies) {
    if (e.dead) continue;
    const ci = Math.floor(e.y / CELL) * gw + Math.floor(e.x / CELL);
    if (grid[ci]) grid[ci].push(e);
  }
}
export function query(x, y, r, cb) {
  const x0 = Math.max(0, Math.floor((x - r - 1) / CELL)), x1 = Math.min(gw - 1, Math.floor((x + r + 1) / CELL));
  const y0 = Math.max(0, Math.floor((y - r - 1) / CELL)), y1 = Math.min(gw - 1, Math.floor((y + r + 1) / CELL));
  for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
    const c = grid[j * gw + i];
    for (let k = 0; k < c.length; k++) {
      const e = c[k];
      if (e.dead) continue;
      const rr = r + e.r;
      if (dist2(x, y, e.x, e.y) <= rr * rr) if (cb(e) === false) return;
    }
  }
}
export function nearestEnemy(x, y, maxR = 12, filter) {
  let best = null, bd = maxR * maxR;
  query(x, y, maxR, (e) => {
    if (filter && !filter(e)) return;
    const d = dist2(x, y, e.x, e.y);
    if (d < bd) { bd = d; best = e; }
  });
  return best;
}

// ───────────── Урон ─────────────
export function hitEnemy(e, dmg, o = {}) {
  if (e.dead || e.spawnT > 0) return 0;
  const S = G.stats;
  let crit = false;
  if (o.crit || (o.canCrit !== false && Math.random() < S.crit)) { dmg *= 2; crit = true; }
  if (e.st.freeze > 0 && G.frozenBonus) dmg *= 2;
  if (e.st.fear > 0 && G.fearBonus) dmg *= 1.5;
  dmg = Math.max(1, Math.round(dmg));
  e.hp -= dmg;
  e.flash = 0.09;
  e.active = true;
  if (o.kx !== undefined && !e.obelisk) {
    const k = (o.knock || 1) * (e.isBoss ? 0.05 : e.def.heavy ? 0.3 : 1);
    e.kx += o.kx * k * 6; e.ky += o.ky * k * 6;
  }
  if (o.burn) { e.st.burn = 3; e.st.burnD = Math.max(e.st.burnD, o.burn); }
  if (o.bleed) { e.st.bleed = 3; e.st.bleedD = Math.max(e.st.bleedD, o.bleed); e.bleedSpread = o.bleedSpread; }
  if (o.chill) { e.st.chill = 2; e.st.chillA = Math.max(e.st.chillA, o.chill); }
  if (o.freeze && !e.isBoss) e.st.freeze = Math.max(e.st.freeze, o.freeze);
  if (o.stun && !e.isBoss) e.st.stun = Math.max(e.st.stun, o.stun);
  if (o.poison) { e.st.poison = 4; e.st.poisonD = Math.max(e.st.poisonD, o.poison); }
  if (o.slow) e.st.slow = Math.max(e.st.slow, o.slow);
  addText(e.x, e.y, dmg, crit ? 'crit' : o.dot ? 'dot' : 'n', e.isBoss ? 1.6 : 1);
  if (!o.dot) {
    sfx(crit ? 'crit' : 'hit', 0.04);
    if (!o.noProc) procOnHit(e, dmg);
    hitParts(e, o);
  }
  if (e.obelisk) obeliskHit(e);
  if (e.hp <= 0) killEnemy(e, o);
  return dmg;
}

function procOnHit(e, dmg) {
  const b = G.boons, P = G.player;
  if (b.burn) { e.st.burn = 3; e.st.burnD = Math.max(e.st.burnD, 4 * b.burn * G.stats.dmg); }
  if (b.chill) { e.st.chill = 2; e.st.chillA = Math.max(e.st.chillA, 0.15 + b.chill * 0.1); }
  if (b.vamp) healPlayer(dmg * b.vamp * 0.006, true);
  if (b.chain && Math.random() < 0.1 + b.chain * 0.05) chainLightning(e, 2 + b.chain, dmg * 0.6);
}

export function chainLightning(from, n, dmg, o = {}) {
  const hit = new Set([from]);
  let cur = from;
  for (let i = 0; i < n; i++) {
    const nx = nearestEnemy(cur.x, cur.y, 5, (e) => !hit.has(e));
    if (!nx) break;
    hit.add(nx);
    G.fx.push(boltFx(cur.x, cur.y, nx.x, nx.y, o.color || '#bfe8ff'));
    hitEnemy(nx, dmg, { noProc: true, canCrit: false, stun: o.stun });
    cur = nx;
  }
  sfx('zap', 0.05);
}

export function boltFx(x0, y0, x1, y1, color) {
  const pts = [];
  const n = 6;
  for (let i = 0; i <= n; i++) pts.push([x0 + (x1 - x0) * i / n + (i && i < n ? rand(-0.3, 0.3) : 0), y0 + (y1 - y0) * i / n + (i && i < n ? rand(-0.3, 0.3) : 0)]);
  return { t: 0.18, kind: 'bolt', pts, color, update(dt) { this.t -= dt; return this.t > 0; } };
}

function killEnemy(e, o) {
  e.dead = true;
  const P = G.player, S = G.stats;
  G.kills++;
  sfx('die', 0.05);
  const mul = S.greed;
  // добыча
  const gems = e.isBoss ? 30 : e.elite ? 10 : e.def.heavy ? 4 : 1;
  for (let i = 0; i < gems; i++) dropPickup('gem', e.x + rand(-0.4, 0.4), e.y + rand(-0.4, 0.4), (e.xp * (1 + G.mlvl * 0.1) * mul) / gems);
  if (Math.random() < (e.elite || e.isBoss ? 1 : 0.12)) {
    const n = e.isBoss ? 20 : e.elite ? 6 : 1;
    for (let i = 0; i < n; i++) dropPickup('gold', e.x + rand(-0.6, 0.6), e.y + rand(-0.6, 0.6), Math.ceil(randi(1, 3) * (1 + G.mlvl * 0.15) * mul));
  }
  if (Math.random() < (e.elite ? 0.6 : 0.035)) dropPickup('heal', e.x, e.y, 0.15);
  // эффекты смерти
  const kind = e.obelisk ? 'void' : e.sprite?.startsWith('skel') || e.sprite === 'shepherd' ? 'bone' : ['imp', 'cinder', 'magmaGolem', 'ashHound', 'crucible'].includes(e.sprite) ? 'ash' : ['wraith', 'voidCaster', 'shade', 'abyss'].includes(e.sprite) ? 'void' : 'flesh';
  deathParts(e, kind);
  stain(G.map, e.x, e.y, kind === 'flesh' ? 'rgba(70,14,18,0.7)' : kind === 'ash' ? 'rgba(20,12,10,0.7)' : kind === 'bone' ? 'rgba(200,190,160,0.5)' : 'rgba(120,80,200,0.35)', e.r * 14, 10);
  if (e.isBoss || e.elite) { G.shake = Math.max(G.shake, e.isBoss ? 1.2 : 0.4); G.hitstop = e.isBoss ? 0.25 : 0.08; G.slowmo = e.isBoss ? 1.2 : 0; }
  if (S.leech) healPlayer(P.maxHp * S.leech, true);
  if (G.boons.burst) {
    const r = 1.6, d = 8 * G.boons.burst * S.dmg;
    G.fx.push(ringFx(e.x, e.y, r, '#e8dcc0', 0.25));
    query(e.x, e.y, r, (x) => { if (x !== e) hitEnemy(x, d, { noProc: true, canCrit: false }); });
  }
  if (e.bleedSpread) query(e.x, e.y, 2.5, (x) => { if (x !== e) { x.st.bleed = 3; x.st.bleedD = e.st.bleedD; x.bleedSpread = true; } });
  if (P.buffs.cry > 0 && G.cryExtend) P.buffs.cry = Math.min(P.buffs.cry + 0.5, 20);
  // задачи
  for (const ob of G.objs) {
    if ((ob.type === 'elite' || ob.type === 'boss') && ob.target === e) { ob.done = 1; pushMsg(ob.type === 'boss' ? `${e.name} повержен!` : `Вожак ${e.name.split(' ')[0]} убит`, 'gold'); }
    if (ob.type === 'obelisk' && e.obelisk && ob.items.includes(e)) { ob.done++; pushMsg(`Обелиск разрушен ${ob.done}/${ob.need}`, 'gold'); }
  }
  if (e.isBoss) { G.boss = null; G.ui?.bossBar(null); }
  if (e.obelisk) G.map.props.push({ kind: 'obeliskBroken', x: e.x, y: e.y, solid: false });
  checkObjectives();
}

export function healPlayer(v, quiet) {
  const P = G.player;
  if (P.dead) return;
  const before = P.hp;
  P.hp = Math.min(P.maxHp, P.hp + v);
  if (!quiet && P.hp - before >= 1) { addText(P.x, P.y, Math.round(P.hp - before), 'heal'); sfx('heal'); }
}

export function hurtPlayer(dmg, src) {
  const P = G.player;
  if (P.dead || P.invuln > 0 || G.state !== 'play') return;
  if (P.whirl && P.whirl.invuln) return;
  const S = G.stats;
  dmg *= 1 - S.armor;
  if (P.shield > 0) { const a = Math.min(P.shield, dmg); P.shield -= a; dmg -= a; P.shieldT = 4; if (dmg <= 0) { sfx('ice', 0.1); return; } }
  dmg = Math.max(1, Math.round(dmg));
  P.hp -= dmg;
  P.flash = 0.12;
  P.invuln = 0.12;
  addText(P.x, P.y, dmg, 'hurt');
  sfx('hurt', 0.08);
  G.shake = Math.max(G.shake, 0.25);
  if (src && src.x !== undefined) { const d = Math.hypot(P.x - src.x, P.y - src.y) || 1; P.kx = (P.x - src.x) / d * 3; P.ky = (P.y - src.y) / d * 3; }
  if (P.hp <= 0) playerDie();
}

function playerDie() {
  const P = G.player;
  P.dead = true; P.hp = 0;
  G.slowmo = 1.5;
  sfx('boom');
  deathParts(P, 'flesh');
  setTimeout(() => { G.state = 'dead'; G.ui?.showDeath(); }, 1200);
}

// ───────────── Опыт и уровень ─────────────
export function gainXp(v) {
  const h = hero();
  if (h.level >= MAX_LEVEL) return;
  h.xp += v;
  while (h.xp >= xpForLevel(h.level) && h.level < MAX_LEVEL) {
    h.xp -= xpForLevel(h.level);
    h.level++;
    h.points++;
    const st = stats();
    const P = G.player;
    P.maxHp = st.maxHp; P.hp = P.maxHp;
    sfx('level');
    G.fx.push(ringFx(P.x, P.y, 3, '#ffd070', 0.6));
    burstParts(P.x, P.y, 40, '#ffd070', 4, true);
    G.ui?.levelUp(h.level);
  }
}

// ───────────── Добыча ─────────────
function dropPickup(kind, x, y, v) {
  const a = Math.random() * TAU, s = rand(1, 3);
  G.pickups.push({ kind, x, y, v, vx: Math.cos(a) * s, vy: Math.sin(a) * s, z: 0, vz: rand(3, 6), t: 0, magnet: false });
}

function updatePickups(dt) {
  const P = G.player, R = G.stats.pickup;
  for (const p of G.pickups) {
    p.t += dt;
    if (p.z > 0 || p.vz > 0) { p.vz -= 18 * dt; p.z = Math.max(0, p.z + p.vz * dt); if (p.z === 0) p.vz = 0; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.9; p.vy *= 0.9;
    if (P.dead) continue;
    const d = dist(p.x, p.y, P.x, P.y);
    if (p.t > 0.35 && (d < R || p.magnet || (p.kind !== 'heal' && G.vacuum))) {
      p.magnet = true;
      const sp = 9 + p.t * 4;
      p.vx = (P.x - p.x) / (d || 1) * sp; p.vy = (P.y - p.y) / (d || 1) * sp;
    }
    if (d < 0.45 && p.t > 0.3) {
      if (p.kind === 'heal' && P.hp >= P.maxHp && !p.magnet) continue;
      p.dead = true;
      if (p.kind === 'gem') { gainXp(p.v); sfx('gem', 0.03); }
      else if (p.kind === 'gold') { G.runGold += p.v; G.save.gold += p.v; sfx('coin', 0.05); }
      else if (p.kind === 'heal') { healPlayer(P.maxHp * p.v); burstParts(P.x, P.y, 10, '#ff5050', 2, true); }
    }
  }
  G.pickups = G.pickups.filter((p) => !p.dead);
}

// ───────────── Задачи ─────────────
function obeliskHit(e) {
  if (e.waves === 0) { e.waves = 1; spawnWave(e.x, e.y, 8 + Math.floor(G.mlvl)); pushMsg('Обелиск пробуждает мёртвых!', 'red'); }
  else if (e.waves === 1 && e.hp < e.maxHp * 0.5) { e.waves = 2; spawnWave(e.x, e.y, 6 + Math.floor(G.mlvl)); }
}

function updateRitual(ob, dt) {
  const P = G.player;
  const inside = dist(P.x, P.y, ob.x, ob.y) < ob.r;
  if (ob.done >= 100) return;
  if (inside) {
    if (!ob.active) { ob.active = true; pushMsg('Ритуал начат — держись в круге!', 'red'); }
    ob.done = Math.min(100, ob.done + dt * (100 / 28));
    ob.spawnT -= dt;
    if (ob.spawnT <= 0) { ob.spawnT = 2.6; spawnWave(ob.x, ob.y, 3 + Math.floor(G.mlvl / 3), 5, 8); }
    if (ob.done >= 100) {
      pushMsg('Ритуал завершён: дар Бездны!', 'gold');
      G.pendingBoon++;
      for (let i = 0; i < 6; i++) dropPickup('gold', ob.x, ob.y, Math.ceil(5 * (1 + G.mlvl * 0.2)));
      checkObjectives();
    }
  }
  G.lights.push({ x: ob.x, y: ob.y, z: 0, r: 70, c: [180, 120, 255], i: inside ? 1 : 0.6 });
}

export function checkObjectives() {
  if (G.portal) return;
  if (G.objs.every((o) => o.done >= o.need)) {
    const P = G.player;
    const p = randomFloorNear(G.map, P.x, P.y, 1.5, 3) || [P.x + 1, P.y];
    G.portal = { x: p[0], y: p[1], t: 0 };
    pushMsg('Задачи выполнены — открыт портал!', 'gold');
    sfx('portal');
    G.vacuum = true;
  }
}

export function pushMsg(text, kind = 'n') { G.ui?.toast(text, kind); }

// ───────────── Частицы и тексты ─────────────
export function addPart(p) { if (G.parts.length < 1400) G.parts.push(p); }
export function burstParts(x, y, n, color, speed = 3, add = false, z = 6) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, s = rand(0.3, 1) * speed;
    addPart({ x, y, z: z + rand(-2, 4), vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: rand(10, 40), g: 60, life: rand(0.3, 0.8), max: 0.8, size: Math.random() < 0.3 ? 2 : 1, color, add });
  }
}
function hitParts(e, o) {
  const c = e.sprite?.startsWith('skel') ? '#e8dcc0' : e.obelisk ? '#b48cff' : ['imp', 'cinder', 'magmaGolem', 'ashHound', 'crucible'].includes(e.sprite) ? '#ff9a3c' : ['wraith', 'voidCaster', 'shade', 'abyss'].includes(e.sprite) ? '#b48cff' : '#8a1a20';
  for (let i = 0; i < 4; i++) {
    const a = Math.random() * TAU;
    addPart({ x: e.x, y: e.y, z: 10, vx: Math.cos(a) * 2 + (o.kx || 0) * 3, vy: Math.sin(a) * 2 + (o.ky || 0) * 3, vz: rand(10, 30), g: 80, life: 0.4, max: 0.4, size: 1, color: c });
  }
  addPart({ x: e.x, y: e.y, z: 10, vx: 0, vy: 0, vz: 0, g: 0, life: 0.08, max: 0.08, size: 5, color: '#ffffff', add: true, flashP: true });
}
function deathParts(e, kind) {
  const cols = kind === 'bone' ? ['#e8dcc0', '#c8bc9c', '#a89a7c'] : kind === 'ash' ? ['#ff9a3c', '#3a2a26', '#ffd060'] : kind === 'void' ? ['#b48cff', '#6b3fd0', '#e0c8ff'] : ['#6a1a20', '#4e5a44', '#8a2a2a'];
  const n = e.isBoss ? 120 : e.elite ? 40 : 16;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, s = rand(1, e.isBoss ? 8 : 4);
    addPart({ x: e.x, y: e.y, z: rand(4, 16), vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: rand(20, 60), g: 120, life: rand(0.4, 1.1), max: 1.1, size: Math.random() < 0.4 ? 2 : 1, color: choice(cols), add: kind === 'void' || (kind === 'ash' && i % 2 === 0), bounce: true });
  }
  if (kind === 'void' || e.elite || e.isBoss) G.fx.push(ringFx(e.x, e.y, e.isBoss ? 4 : 1.5, kind === 'ash' ? '#ff9a3c' : '#b48cff', 0.4));
}
export function ringFx(x, y, r, color, t = 0.3) {
  return { kind: 'ring', x, y, r, color, t, max: t, update(dt) { this.t -= dt; return this.t > 0; } };
}

export function addText(x, y, v, kind, scale = 1) {
  if (G.texts.length > 80) G.texts.shift();
  G.texts.push({ x: x + rand(-0.2, 0.2), y: y + rand(-0.2, 0.2), z: 22, v, kind, t: 0, scale: kind === 'crit' ? 2 : scale });
}

// ───────────── Снаряды ─────────────
export function spawnProj(p) {
  const d = { r: 0.2, life: 2, pierce: 0, hit: null, team: 'p', z: 10, trail: null, ...p };
  d.hit = new Set();
  G.projs.push(d);
  return d;
}

function updateProjs(dt) {
  const P = G.player, map = G.map;
  for (const p of G.projs) {
    if (p.update && p.update(p, dt) === false) { p.dead = true; continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    if (p.trail) p.trail(p, dt);
    if (p.life <= 0) { p.dead = true; p.onEnd?.(p); continue; }
    if (!p.ghost && map.at(Math.floor(p.x), Math.floor(p.y)) !== FLOOR) {
      p.dead = true; p.onEnd?.(p, true);
      burstParts(p.x, p.y, 5, p.color || '#ffd070', 2, true);
      continue;
    }
    if (p.team === 'p') {
      query(p.x, p.y, p.r, (e) => {
        if (p.hit.has(e) || p.dead) return;
        p.hit.add(e);
        const [kx, ky] = [p.vx / (Math.hypot(p.vx, p.vy) || 1), p.vy / (Math.hypot(p.vx, p.vy) || 1)];
        const dealt = p.dmg ? hitEnemy(e, p.dmg, { kx, ky, knock: p.knock ?? 0.5, ...(p.hitOpts || {}) }) : 0;
        p.onHit?.(p, e, dealt);
        if (p.pierce-- <= 0) { p.dead = true; p.onEnd?.(p); return false; }
      });
    } else {
      // по герою и союзникам-приманкам
      if (!P.dead && dist2(p.x, p.y, P.x, P.y) < (p.r + P.r) ** 2 && P.z < 6) {
        p.dead = true; hurtPlayer(p.dmg, p);
        burstParts(p.x, p.y, 8, p.color || '#ff5050', 2, true);
      }
      for (const a of G.allies) if (a.decoy && dist2(p.x, p.y, a.x, a.y) < 0.4) { p.dead = true; a.hp -= p.dmg; }
    }
  }
  G.projs = G.projs.filter((p) => !p.dead);
}

function enemyShoot(e, tx, ty) {
  const kind = e.def.proj;
  const a = Math.atan2(ty - e.y, tx - e.x);
  const sp = kind === 'bone' ? 8 : 6.5;
  const color = kind === 'fire' ? '#ff8a3a' : kind === 'void' ? '#d080ff' : '#e8dcc0';
  spawnProj({ x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 0.22, dmg: e.dmg, team: 'e', kind: 'e_' + kind, color, life: 3 });
  sfx('shoot', 0.06);
}

// ───────────── ИИ монстров ─────────────
function enemyTarget(e) {
  const P = G.player;
  let tx = P.x, ty = P.y, best = P.buffs.stealth > 0 ? 1e9 : dist2(e.x, e.y, P.x, P.y), tgt = P;
  for (const a of G.allies) {
    if (!a.decoy && !a.taunt) continue;
    const d = dist2(e.x, e.y, a.x, a.y) * (a.decoy ? 0.5 : 1);
    if (d < best) { best = d; tx = a.x; ty = a.y; tgt = a; }
  }
  return { tx, ty, d: Math.sqrt(best), tgt };
}

function updateEnemies(dt) {
  const P = G.player, map = G.map;
  let active = 0;
  for (const e of G.enemies) {
    if (e.dead) continue;
    e.animT += dt;
    e.flash -= dt;
    if (e.spawnT > 0) { e.spawnT -= dt; continue; }
    const st = e.st;
    // статусы
    if (st.burn > 0) { st.burn -= dt; e.dotT = (e.dotT || 0) + dt; }
    if (st.bleed > 0) st.bleed -= dt;
    if (st.poison > 0) st.poison -= dt;
    if ((st.burn > 0 || st.bleed > 0 || st.poison > 0) && (e.dotTick = (e.dotTick || 0) - dt) <= 0) {
      e.dotTick = 0.5;
      const d = (st.burn > 0 ? st.burnD : 0) + (st.bleed > 0 ? st.bleedD : 0) + (st.poison > 0 ? st.poisonD : 0);
      if (d > 0) hitEnemy(e, d * 0.5, { dot: true, canCrit: false, noProc: true });
      if (st.burn > 0) for (let i = 0; i < 2; i++) addPart({ x: e.x + rand(-0.2, 0.2), y: e.y + rand(-0.2, 0.2), z: rand(4, 14), vx: 0, vy: 0, vz: rand(10, 20), g: -10, life: 0.5, max: 0.5, size: 1, color: '#ff9a3c', add: true });
      if (e.dead) continue;
    }
    st.chill -= dt; st.freeze -= dt; st.stun -= dt; st.fear -= dt; st.slow -= dt;
    // откидывание
    if (e.kx || e.ky) {
      e.x += e.kx * dt; e.y += e.ky * dt; e.kx *= 0.82; e.ky *= 0.82;
      if (Math.abs(e.kx) < 0.05 && Math.abs(e.ky) < 0.05) e.kx = e.ky = 0;
    }
    if (e.obelisk) { collideE(e); continue; }
    const dP = dist(e.x, e.y, P.x, P.y);
    if (!e.active) {
      if (dP < 11 && (dP < 6 || los(map, e.x, e.y, P.x, P.y))) {
        e.active = true;
        query(e.x, e.y, 5, (o) => { o.active = true; });
      } else continue;
    }
    if (dP > 32 && !e.isBoss && !e.objective) { e.active = false; continue; }
    active++;
    if (st.freeze > 0 || st.stun > 0) { collideE(e); continue; }
    if (P.dead) continue;
    let spd = e.speed * (st.chill > 0 ? 1 - st.chillA : 1) * (st.slow > 0 ? 0.5 : 1);
    if (e.elite?.includes('frost')) spd *= 1;
    const { tx, ty, d, tgt } = enemyTarget(e);
    e.atkCd -= dt;
    if (e.isBoss) { bossAI(e, dt, tx, ty, d, spd); collideE(e); continue; }
    if (st.fear > 0) {
      moveE(e, e.x - tx, e.y - ty, spd * 0.9, dt);
      collideE(e); continue;
    }
    // элитные свойства
    if (e.elite) eliteAffix(e, dt, d);
    if (e.state === 'windup') {
      e.t -= dt;
      if (e.t <= 0) {
        e.state = 'chase'; e.atkCd = e.ai === 'ranged' ? rand(1.6, 2.4) : rand(0.9, 1.3);
        if (e.ai === 'ranged') enemyShoot(e, tx, ty);
        else if (e.ai === 'exploder') {
          G.fx.push(ringFx(e.x, e.y, 1.8, '#ff9a3c', 0.3));
          burstParts(e.x, e.y, 30, '#ffb040', 5, true);
          G.lights.push({ x: e.x, y: e.y, z: 0, r: 80, c: [255, 160, 60], i: 1.5 });
          sfx('boom', 0.05);
          if (dist(e.x, e.y, P.x, P.y) < 1.8) hurtPlayer(e.dmg, e);
          e.hp = 0; killEnemy(e, {});
        } else if (dist(e.x, e.y, tx, ty) < e.def.range + 0.6) {
          if (tgt === P) hurtPlayer(e.dmg, e); else tgt.hp -= e.dmg;
          if (e.elite?.includes('vamp')) e.hp = Math.min(e.maxHp, e.hp + e.dmg * 2);
          if (e.elite?.includes('frost') && tgt === P) G.playerChill = 1.5;
          sfx('swing', 0.05);
        }
      }
      collideE(e);
      continue;
    }
    const range = e.def.range;
    if (e.ai === 'ranged') {
      const sight = d < range + 1 && los(map, e.x, e.y, tx, ty);
      if (sight && e.atkCd <= 0) { e.state = 'windup'; e.t = 0.5; e.face = tx > e.x - ty + e.y ? 1 : -1; }
      else if (d < 3.5 && sight) moveE(e, e.x - tx, e.y - ty, spd * 0.8, dt);
      else if (!sight || d > range - 1) chase(e, tx, ty, d, spd, dt);
    } else {
      if (d < range && e.atkCd <= 0) { e.state = 'windup'; e.t = e.ai === 'exploder' ? 0.6 : e.def.heavy ? 0.65 : 0.38; }
      else if (d > range * 0.8) chase(e, tx, ty, d, spd, dt);
    }
    collideE(e);
  }
  G.activeEnemies = active;
  G.enemies = G.enemies.filter((e) => !e.dead);
}

function chase(e, tx, ty, d, spd, dt) {
  if (d < 5 && (d < 1.5 || los(G.map, e.x, e.y, tx, ty))) moveE(e, tx - e.x, ty - e.y, spd, dt);
  else {
    const f = flowDir(G.map, e.x, e.y);
    if (f) moveE(e, f[0], f[1], spd, dt);
    else moveE(e, tx - e.x, ty - e.y, spd, dt);
  }
}
function moveE(e, dx, dy, spd, dt) {
  const l = Math.hypot(dx, dy) || 1;
  e.x += (dx / l) * spd * dt; e.y += (dy / l) * spd * dt;
  // направление на экране: x−y
  const sx = dx - dy;
  if (Math.abs(sx) > 0.05) e.face = sx > 0 ? 1 : -1;
  e.moving = true;
}
function collideE(e) {
  // расталкивание соседей
  query(e.x, e.y, e.r + 0.4, (o) => {
    if (o === e) return;
    const dx = e.x - o.x, dy = e.y - o.y, d = Math.hypot(dx, dy), m = e.r + o.r;
    if (d < m && d > 0.001) {
      const push = (m - d) * 0.5;
      const we = o.isBoss || o.obelisk ? 1 : e.isBoss ? 0 : 0.5;
      e.x += (dx / d) * push * we * 2; e.y += (dy / d) * push * we * 2;
    }
  });
  if (!e.def.fly || true) collide(G.map, e);
}

function eliteAffix(e, dt, d) {
  e.affT = (e.affT || 0) - dt;
  if (e.affT > 0) return;
  e.affT = 0.5;
  const P = G.player;
  if (e.elite.includes('fire') && d < 1.6) hurtPlayer(e.dmg * 0.25, e);
  if (e.elite.includes('summ') && e.summons < 8 && Math.random() < 0.12) {
    e.summons += 2;
    spawnWave(e.x, e.y, 2, 1, 2.5);
  }
}

// ───────────── Боссы ─────────────
function bossAI(e, dt, tx, ty, d, spd) {
  const P = G.player, T = e.bossT;
  if (!e.awake) {
    if (d < 10) { e.awake = true; G.boss = e; G.ui?.bossBar(e); sfx('boss'); G.shake = 0.8; pushMsg(e.name, 'boss'); }
    else return;
  }
  for (const k of ['a', 'b', 'c']) T[k] = (T[k] ?? rand(1, 3)) - dt;
  const enraged = e.hp < e.maxHp * 0.5;
  if (e.state === 'windup') {
    e.t -= dt;
    if (e.t <= 0) { e.state = 'chase'; e.atkCd = 1.4; if (dist(e.x, e.y, P.x, P.y) < e.def.range + 1) hurtPlayer(e.dmg, e); G.shake = 0.3; sfx('hit'); }
    return;
  }
  if (d < e.def.range && e.atkCd <= 0) { e.state = 'windup'; e.t = 0.6; return; }
  if (e.boss === undefined) e.boss = e.def.boss;
  const b = e.def.boss;
  if (b === 'shepherd') {
    if (T.a <= 0) { T.a = enraged ? 5 : 8; spawnWave(e.x, e.y, enraged ? 7 : 5, 1.5, 4); pushMsg('Пастырь зовёт своё стадо', 'red'); }
    if (T.b <= 0) { T.b = enraged ? 3.2 : 4.5; radial(e, enraged ? 18 : 12, 6, '#d8ffe8', 'bone'); }
    if (T.c <= 0) { T.c = 7; for (let i = 0; i < 3; i++) telegraphBlast(P.x + rand(-2, 2), P.y + rand(-2, 2), 1.4, e.dmg * 1.2, '#9affd0', 1.0 + i * 0.3); }
  } else if (b === 'crucible') {
    if (T.a <= 0) { T.a = enraged ? 4 : 6; telegraphBlast(e.x, e.y, 3.4, e.dmg * 1.5, '#ff9a3c', 1.1); }
    if (T.b <= 0) { T.b = enraged ? 2.2 : 3.4; for (let i = 0; i < (enraged ? 6 : 4); i++) telegraphBlast(P.x + rand(-3, 3), P.y + rand(-3, 3), 1.3, e.dmg, '#ffb040', 0.9 + Math.random() * 0.6); }
    if (T.c <= 0) { T.c = 9; spawnWaveType(e, 'cinder', enraged ? 6 : 4); }
  } else if (b === 'abyss') {
    e.spin = (e.spin || 0) + dt * (enraged ? 2.4 : 1.6);
    if (T.a <= 0) { T.a = enraged ? 0.12 : 0.2; for (let k = 0; k < (enraged ? 3 : 2); k++) { const a = e.spin + k * TAU / (enraged ? 3 : 2); spawnProj({ x: e.x, y: e.y, vx: Math.cos(a) * 5, vy: Math.sin(a) * 5, r: 0.25, dmg: e.dmg * 0.5, team: 'e', kind: 'e_void', color: '#ff70e0', life: 4 }); } }
    if (T.b <= 0) { T.b = 6; for (let i = 0; i < 5; i++) telegraphBlast(P.x + rand(-2.5, 2.5), P.y + rand(-2.5, 2.5), 1.5, e.dmg, '#b48cff', 1.0 + i * 0.15); }
    if (T.c <= 0) { T.c = 10; spawnWaveType(e, 'shade', enraged ? 6 : 4); }
  }
  if (d > e.def.range * 0.8) chase(e, tx, ty, d, spd, dt);
}
function spawnWaveType(e, type, n) {
  for (let i = 0; i < n; i++) { const p = randomFloorNear(G.map, e.x, e.y, 1.5, 4); if (p) { const m = spawnEnemy(type, p[0], p[1], { active: true }); m.spawnT = 0.5; } }
}
function radial(e, n, sp, color, kind) {
  const off = Math.random() * TAU;
  for (let i = 0; i < n; i++) { const a = off + i * TAU / n; spawnProj({ x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 0.25, dmg: e.dmg * 0.6, team: 'e', kind: 'e_' + kind, color, life: 3 }); }
  sfx('shoot');
}
export function telegraphBlast(x, y, r, dmg, color, delay) {
  if (G.map.at(Math.floor(x), Math.floor(y)) !== FLOOR) return;
  G.fx.push({
    kind: 'tele', x, y, r, color, t: delay, max: delay, ground: true,
    update(dt) {
      this.t -= dt;
      if (this.t <= 0) {
        const P = G.player;
        if (dist(P.x, P.y, x, y) < r + P.r) hurtPlayer(dmg, { x, y });
        G.fx.push(ringFx(x, y, r, color, 0.3));
        burstParts(x, y, 20, color, 4, true);
        G.lights.push({ x, y, z: 0, r: 70, c: [255, 180, 120], i: 1.2 });
        G.shake = Math.max(G.shake, 0.2);
        sfx('boom', 0.08);
        return false;
      }
      return true;
    },
  });
}

// ───────────── Союзники (призраки, ястребы, приманки) ─────────────
function updateAllies(dt) {
  for (const a of G.allies) {
    a.life -= dt;
    if (a.hp !== undefined && a.hp <= 0) a.life = 0;
    a.update?.(a, dt);
    if (a.life <= 0) { a.dead = true; a.onEnd?.(a); burstParts(a.x, a.y, 12, a.color || '#8ae0ff', 2, true); }
  }
  G.allies = G.allies.filter((a) => !a.dead);
}

// ───────────── Герой ─────────────
function updatePlayer(dt) {
  const P = G.player, I = G.input, S = G.stats;
  if (P.dead) return;
  P.animT += dt;
  P.flash -= dt; P.invuln -= dt;
  for (const k in P.buffs) if (P.buffs[k] > 0 && k !== 'shadowShots') P.buffs[k] -= dt;
  // щит Эгиды
  if (G.boons.aegis) {
    const mx = 15 * G.boons.aegis;
    P.shieldT -= dt;
    if (P.shieldT <= 0) P.shield = Math.min(mx, P.shield + mx * 0.25 * dt);
  }
  // медленная регенерация вне боя
  P.regenT += dt;
  if (P.regenT > 1) { P.regenT = 0; if (G.activeEnemies < 2) healPlayer(P.maxHp * 0.01, true); }
  // гроза
  if (G.boons.storm) {
    G.stormT = (G.stormT || 0) - dt;
    if (G.stormT <= 0) {
      G.stormT = 5 - G.boons.storm;
      const e = nearestEnemy(P.x, P.y, 7);
      if (e) { G.fx.push(boltFx(e.x - 0.5, e.y - 3, e.x, e.y, '#d0b0ff')); hitEnemy(e, 20 * S.dmg * G.boons.storm, { noProc: true, stun: 0.3 }); G.lights.push({ x: e.x, y: e.y, z: 0, r: 60, c: [200, 160, 255], i: 1.4 }); sfx('zap'); }
    }
  }
  // движение
  let mx = I.mx, my = I.my;
  const busy = P.jump || P.dash;
  if (!busy) {
    let spd = S.speed * (P.whirl ? 1.2 : 1) * (G.playerChill > 0 ? 0.6 : 1);
    if (P.atkT > 0 && !P.whirl) spd *= 0.55;
    G.playerChill = (G.playerChill || 0) - dt;
    P.moving = mx !== 0 || my !== 0;
    if (P.moving) {
      P.x += mx * spd * dt; P.y += my * spd * dt;
      // шаги — пыль
      if (Math.random() < dt * 8) addPart({ x: P.x, y: P.y, z: 1, vx: -mx, vy: -my, vz: 6, g: 20, life: 0.4, max: 0.4, size: 1, color: 'rgba(200,190,170,0.5)' });
    }
    if (P.kx) { P.x += P.kx * dt; P.y += P.ky * dt; P.kx *= 0.85; P.ky *= 0.85; if (Math.abs(P.kx) < 0.05) P.kx = P.ky = 0; }
  }
  // взгляд: при атаке — на прицел, иначе — по движению
  const ax = P.aimX - P.x, ay = P.aimY - P.y;
  if (P.atkT > 0 || I.fire) { const s = ax - ay; if (Math.abs(s) > 0.01) P.face = s > 0 ? 1 : -1; }
  else if (P.moving) { const s = mx - my; if (Math.abs(s) > 0.01) P.face = s > 0 ? 1 : -1; }
  P.atkT -= dt;
  // перезарядки
  for (const k in P.cds) if (P.cds[k] > 0) P.cds[k] -= dt;
  updateSkillsPassive(P, dt);
  // умения
  const skills = CLASSES[G.save.cls].skills;
  if (!busy) {
    for (let i = 0; i < 4; i++) if (I.cast[i]) castSkill(i, skills[i]);
  }
  collide(G.map, P);
  // открытая карта
  const N = G.map.N;
  const px = Math.floor(P.x), py = Math.floor(P.y);
  for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) {
    if (dx * dx + dy * dy > 64) continue;
    const x = px + dx, y = py + dy;
    if (x >= 0 && y >= 0 && x < N && y < N && !G.map.explored[y * N + x]) { G.map.explored[y * N + x] = 1; G.mapDirty = true; }
  }
  // алтарь
  for (const pr of G.map.props) {
    if (pr.altar && !pr.used && dist(P.x, P.y, pr.x, pr.y) < 1.3) { pr.used = true; G.pendingBoon++; sfx('portal'); burstParts(pr.x, pr.y, 40, '#ffd070', 4, true); }
  }
  // портал
  if (G.portal) {
    G.portal.t += dt;
    if (G.portal.t > 0.8 && dist(P.x, P.y, G.portal.x, G.portal.y) < 0.9) { areaComplete(); }
  }
}

function areaComplete() {
  const h = hero();
  if (G.areaIndex + 1 > h.progress) h.progress = G.areaIndex + 1;
  const bonus = Math.round(30 * (1 + G.areaIndex * 0.5));
  G.save.gold += bonus;
  G.runGold += bonus;
  writeSave();
  G.state = 'done';
  sfx('portal');
  G.ui?.showComplete(bonus);
}

// ───────────── Фоновые орды ─────────────
function ambientSpawns(dt) {
  if (G.area.boss) return;
  G.spawnT -= dt;
  if (G.spawnT > 0) return;
  G.spawnT = rand(7, 11) - Math.min(4, G.mlvl * 0.15);
  if ((G.activeEnemies || 0) > 40) return;
  const P = G.player;
  spawnWave(P.x, P.y, randi(3, 5) + Math.floor(G.mlvl / 4), 9, 13);
}

// ───────────── Частицы ─────────────
function updateParts(dt) {
  for (const p of G.parts) {
    p.life -= dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vz -= (p.g || 0) * dt; p.z += p.vz * dt;
    if (p.z < 0) { if (p.bounce && p.vz < -10) { p.vz *= -0.35; p.z = 0; p.vx *= 0.5; p.vy *= 0.5; } else { p.z = 0; p.vx *= 0.8; p.vy *= 0.8; p.vz = 0; } }
    if (p.drag) { p.vx *= p.drag; p.vy *= p.drag; }
  }
  G.parts = G.parts.filter((p) => p.life > 0);
  for (const t of G.texts) { t.t += dt; t.z += dt * 18 * (1 - t.t); }
  G.texts = G.texts.filter((t) => t.t < 0.9);
}

// ───────────── Главный шаг ─────────────
export function update(dt) {
  if (G.state !== 'play') return;
  if (G.hitstop > 0) { G.hitstop -= dt; return; }
  if (G.slowmo > 0) { G.slowmo -= dt; dt *= 0.35; }
  G.time += dt; G.runTime += dt;
  G.lights.length = 0;
  G.stats = stats();
  const P = G.player;
  rebuildGrid();
  updatePlayer(dt);
  // поле путей — когда герой сменил клетку
  const ft = Math.floor(P.y) * G.map.N + Math.floor(P.x);
  if (ft !== G.flowTile) { G.flowTile = ft; flowField(G.map, Math.floor(P.x), Math.floor(P.y)); }
  updateEnemies(dt);
  rebuildGrid();
  updateAllies(dt);
  updateProjs(dt);
  G.fx = G.fx.filter((f) => f.update(dt) !== false);
  updatePickups(dt);
  updateParts(dt);
  for (const ob of G.objs) if (ob.type === 'ritual') updateRitual(ob, dt);
  ambientSpawns(dt);
  if (G.pendingBoon > 0 && !P.dead && G.state === 'play') { G.pendingBoon--; G.state = 'boon'; G.ui?.showBoons(); }
  G.shake = Math.max(0, G.shake - dt * 2.5);
}

export function rollBoons() {
  const pool = BOONS.filter((b) => (G.boons[b.id] || 0) < b.max);
  return shuffle(pool.slice()).slice(0, 3);
}
export function takeBoon(id) {
  G.boons[id] = (G.boons[id] || 0) + 1;
  G.stats = stats();
  if (id === 'aegis') G.player.shield = 15 * G.boons.aegis;
  G.state = 'play';
}

// Дерево умений
export function canAlloc(skillId, node) {
  const h = hero(), s = skillState(skillId), def = SKILLS[skillId];
  if (h.points <= 0) return false;
  if (node === 'base') return !s.base && h.level >= def.req;
  const [rune, tier] = node; // [0..2, 1..3]
  if (!s.base) return false;
  if (h.level < TIER_REQ[tier]) return false;
  if (tier === 1) return s.rune === -1;
  return s.rune === rune && s.tier === tier - 1;
}
export function alloc(skillId, node) {
  if (!canAlloc(skillId, node)) return false;
  const h = hero();
  const s = h.alloc[skillId] || (h.alloc[skillId] = { base: 0, rune: -1, tier: 0 });
  if (node === 'base') s.base = 1;
  else { s.rune = node[0]; s.tier = node[1]; }
  h.points--;
  writeSave();
  return true;
}
export function respecSkill(skillId) {
  const h = hero(), s = h.alloc[skillId];
  if (!s || s.rune < 0) return;
  h.points += s.tier; s.rune = -1; s.tier = 0;
  writeSave();
}
export function allocPassive(id) {
  const h = hero(), def = PASSIVES.find((p) => p.id === id);
  if (h.points <= 0 || (h.passives[id] || 0) >= def.max) return false;
  h.passives[id] = (h.passives[id] || 0) + 1; h.points--;
  writeSave();
  if (G.player) { const st = stats(); const k = G.player.hp / G.player.maxHp; G.player.maxHp = st.maxHp; G.player.hp = st.maxHp * k; }
  return true;
}
export function ensureStarter() {
  const h = hero(), first = CLASSES[G.save.cls].skills[0];
  if (!h.alloc[first]) h.alloc[first] = { base: 1, rune: -1, tier: 0 };
}
