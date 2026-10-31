// Умения героев: база + одна из трёх веток (рун) с усилениями II и III.
import { G, hero, skillState, spawnProj, hitEnemy, query, nearestEnemy, chainLightning, boltFx, ringFx, burstParts, addPart, healPlayer, hurtPlayer } from './game.js';
import { SKILLS } from './data.js';
import { FLOOR } from './world.js';
import { rand, dist, dist2, TAU, clamp } from './util.js';
import { sfx } from './audio.js';

const has = (m, rune, tier = 1) => m.rune === rune && m.tier >= tier;

function aimDir(P) {
  const dx = P.aimX - P.x, dy = P.aimY - P.y, l = Math.hypot(dx, dy) || 1;
  return [dx / l, dy / l, l];
}
// Точка на луче до первой стены
function rayTo(x, y, dx, dy, maxD) {
  let d = 0;
  while (d < maxD) {
    const nx = x + dx * (d + 0.1), ny = y + dy * (d + 0.1);
    if (G.map.at(Math.floor(nx), Math.floor(ny)) !== FLOOR) break;
    if (G.map.at(Math.floor(nx + 0.3), Math.floor(ny)) !== FLOOR || G.map.at(Math.floor(nx - 0.3), Math.floor(ny)) !== FLOOR || G.map.at(Math.floor(nx), Math.floor(ny + 0.3)) !== FLOOR || G.map.at(Math.floor(nx), Math.floor(ny - 0.3)) !== FLOOR) break;
    d += 0.1;
  }
  return [x + dx * d, y + dy * d, d];
}

export function maxCharges(id) {
  const m = skillState(id);
  if (id === 'leap' && m.rune === 2) return m.tier >= 3 ? 3 : 2;
  return 1;
}

function cdOf(id, m) {
  let cd = SKILLS[id].cd;
  const P = G.player;
  if (id === 'leap' && has(m, 2, 2)) cd *= 0.75;
  if (id === 'blink' && has(m, 0, 3)) cd -= 1;
  if (id === 'trap' && has(m, 0, 3)) cd *= 0.7;
  if (id === 'roll' && has(m, 0, 3)) cd -= 1;
  const primary = ['cleave', 'firebolt', 'arrow'].includes(id);
  if (primary) { if (P.buffs.fury > 0) cd *= 0.7; return cd * (G.boons.haste ? 1 - G.boons.haste * 0.05 : 1); }
  return cd * G.stats.cdr;
}

export function castSkill(slot, id) {
  const P = G.player, m = skillState(id);
  if (!m.base) return false;
  const mc = maxCharges(id);
  if (mc > 1) {
    if (P.charges[id] === undefined) P.charges[id] = mc;
    if (P.charges[id] <= 0) return false;
  } else if ((P.cds[id] || 0) > 0) return false;
  const def = SKILLS[id];
  const ctx = { ...m, dmg: def.dmg * G.stats.dmg };
  const ok = CAST[id](P, ctx);
  if (ok === false) return false;
  if (mc > 1) { P.charges[id]--; if (!(P.cds[id] > 0)) P.cds[id] = cdOf(id, m); }
  else P.cds[id] = cdOf(id, m);
  P.cdMax = P.cdMax || {}; P.cdMax[id] = cdOf(id, m);
  if (slot === 0 && G.boons.echo && Math.random() < G.boons.echo * 0.1) setTimeout(() => { if (G.state === 'play' && !P.dead) CAST[id](P, ctx); }, 110);
  return true;
}

// перезарядка зарядов
export function updateSkillsPassive(P, dt) {
  for (const id in P.charges) {
    const mc = maxCharges(id);
    if (P.charges[id] < mc && !(P.cds[id] > 0)) { P.charges[id]++; if (P.charges[id] < mc) P.cds[id] = cdOf(id, skillState(id)); }
  }
  // прыжок
  if (P.jump) {
    const J = P.jump;
    J.t += dt;
    const k = Math.min(1, J.t / J.dur);
    P.x = J.x0 + (J.x1 - J.x0) * k; P.y = J.y0 + (J.y1 - J.y0) * k;
    P.z = Math.sin(k * Math.PI) * 22;
    if (J.trail && Math.random() < 0.5) fireZone(P.x, P.y, 0.9, 2.5, J.dmg * 0.25);
    if (k >= 1) { P.jump = null; P.z = 0; J.land(); }
  }
  if (P.dash) {
    const D = P.dash;
    D.t += dt;
    const k = Math.min(1, D.t / D.dur);
    P.x = D.x0 + (D.x1 - D.x0) * k; P.y = D.y0 + (D.y1 - D.y0) * k;
    addPart({ x: P.x, y: P.y, z: 8, vx: 0, vy: 0, vz: 0, g: 0, life: 0.25, max: 0.25, size: 2, color: D.color || '#bff4ff', add: true });
    if (k >= 1) { P.dash = null; D.end?.(); }
  }
  if (P.whirl) {
    const W = P.whirl, m = W.m;
    W.t -= dt; W.tick -= dt; W.ang += dt * 18;
    if (W.tick <= 0) {
      W.tick = 0.2;
      sfx('swing', 0.1);
      query(P.x, P.y, 1.8, (e) => {
        if (has(m, 0)) { const d = Math.hypot(P.x - e.x, P.y - e.y) || 1; e.kx += (P.x - e.x) / d * 2.2; e.ky += (P.y - e.y) / d * 2.2; }
        hitEnemy(e, m.dmg, { knock: 0.1, kx: 0, ky: 0 });
        if (has(m, 1)) healPlayer(P.maxHp * (has(m, 1, 2) ? 0.01 : 0.005), true);
      });
      if (has(m, 2)) {
        W.torn = (W.torn || 0) + 1;
        if (W.torn % (has(m, 2, 2) ? 2 : 3) === 0) tornado(P.x, P.y, m.dmg * 0.8, has(m, 2, 3));
      }
    }
    for (let i = 0; i < 2; i++) {
      const a = W.ang + i * Math.PI;
      addPart({ x: P.x + Math.cos(a) * 1.4, y: P.y + Math.sin(a) * 1.4, z: 10, vx: 0, vy: 0, vz: 0, g: 0, life: 0.15, max: 0.15, size: 2, color: has(m, 2) ? '#ff9a3c' : has(m, 1) ? '#ff5050' : '#ffe8c0', add: true });
    }
    G.lights.push({ x: P.x, y: P.y, z: 8, r: 50, c: [255, 210, 160], i: 0.6 });
    if (W.t <= 0) {
      P.whirl = null;
      if (has(m, 0, 3)) explode(P.x, P.y, 3, m.dmg * 3, '#a0d0ff', { stun: 0.6 });
    }
  }
}

// ───────────── Общие эффекты ─────────────
export function explode(x, y, r, dmg, color, o = {}) {
  G.fx.push(ringFx(x, y, r, color, 0.3));
  burstParts(x, y, Math.round(14 + r * 8), color, r * 2.2, true);
  for (let i = 0; i < 6; i++) addPart({ x: x + rand(-r, r) * 0.4, y: y + rand(-r, r) * 0.4, z: rand(2, 10), vx: rand(-1, 1), vy: rand(-1, 1), vz: rand(8, 20), g: -4, life: rand(0.5, 0.9), max: 0.9, size: 3, color: 'rgba(40,30,30,0.55)', smoke: true });
  G.lights.push({ x, y, z: 0, r: 40 + r * 22, c: [255, 190, 120], i: 1.6 });
  G.shake = Math.max(G.shake, Math.min(0.5, r * 0.12));
  sfx('boom', 0.05);
  query(x, y, r, (e) => {
    const d = Math.hypot(e.x - x, e.y - y) || 1;
    hitEnemy(e, dmg, { kx: (e.x - x) / d, ky: (e.y - y) / d, knock: o.knock ?? 0.8, ...o });
  });
}

export function fireZone(x, y, r, dur, dps, o = {}) {
  G.fx.push({
    kind: 'zone', ground: true, x, y, r, t: dur, max: dur, tick: 0, color: o.color || '#ff8a3a',
    update(dt) {
      this.t -= dt; this.tick -= dt;
      if (o.poison && Math.random() < r * dt * 10) {
        // клубы ядовитого тумана
        const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * r * 0.9;
        addPart({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, z: rand(0, 6), vx: rand(-0.3, 0.3), vy: rand(-0.3, 0.3), vz: rand(2, 6), g: 0, life: rand(0.8, 1.4), max: 1.4, size: 4, color: 'rgba(120,255,80,0.35)', add: true, puff: true });
      }
      if (Math.random() < r * dt * 18) addPart({ x: x + rand(-r, r) * 0.8, y: y + rand(-r, r) * 0.8, z: 0, vx: 0, vy: 0, vz: rand(12, 30), g: -10, life: rand(0.3, 0.7), max: 0.7, size: Math.random() < 0.3 ? 2 : 1, color: Math.random() < 0.5 ? (o.c2 || '#ffd060') : this.color, add: true });
      G.lights.push({ x, y, z: 0, r: 26 + r * 14, c: o.light || [255, 140, 60], i: 0.7 });
      if (this.tick <= 0) {
        this.tick = 0.4;
        query(x, y, r, (e) => {
          if (o.pull) { const d = Math.hypot(e.x - x, e.y - y) || 1; e.kx -= (e.x - x) / d * 1.5; e.ky -= (e.y - y) / d * 1.5; }
          hitEnemy(e, dps * 0.4, { dot: true, canCrit: false, noProc: true, burn: o.poison ? 0 : dps * 0.2, poison: o.poison ? dps * 0.3 : 0, slow: o.slow ? 0.6 : 0 });
        });
      }
      return this.t > 0;
    },
  });
}

function slashFx(x, y, ang, arc, r, color) {
  G.fx.push({ kind: 'slash', x, y, ang, arc, r, color, t: 0.16, max: 0.16, update(dt) { this.t -= dt; return this.t > 0; } });
}

function tornado(x, y, dmg, homing) {
  const a = Math.random() * TAU;
  spawnProj({
    x, y, vx: Math.cos(a) * 3.5, vy: Math.sin(a) * 3.5, r: 0.5, dmg, pierce: 99, life: 2.5, kind: 'tornado', color: '#ff9a3c', ghost: false, knock: 0.2,
    update(p, dt) {
      if (homing) { const e = nearestEnemy(p.x, p.y, 6); if (e) { const d = Math.hypot(e.x - p.x, e.y - p.y) || 1; p.vx += (e.x - p.x) / d * 12 * dt; p.vy += (e.y - p.y) / d * 12 * dt; const s = Math.hypot(p.vx, p.vy); if (s > 4.5) { p.vx *= 4.5 / s; p.vy *= 4.5 / s; } } }
      p.rehit = (p.rehit || 0) - dt; if (p.rehit <= 0) { p.rehit = 0.35; p.hit.clear(); }
      if (Math.random() < 0.6) addPart({ x: p.x + rand(-0.3, 0.3), y: p.y + rand(-0.3, 0.3), z: rand(0, 16), vx: 0, vy: 0, vz: 20, g: 0, life: 0.3, max: 0.3, size: 1, color: Math.random() < 0.5 ? '#ffd060' : '#ff6a20', add: true });
      G.lights.push({ x: p.x, y: p.y, z: 6, r: 34, c: [255, 140, 60], i: 0.6 });
    },
  });
}

function bolt(P, dx, dy, o) {
  return spawnProj({ x: P.x + dx * 0.4, y: P.y + dy * 0.4, vx: dx * o.speed, vy: dy * o.speed, ...o });
}

// ───────────── Каталог умений ─────────────
const CAST = {
  // ─── Страж Пепла
  cleave(P, m) {
    const [dx, dy] = aimDir(P);
    const ang = Math.atan2(dy, dx);
    P.swing = (P.swing || 0) + 1;
    P.atkT = P.atkMax = 0.26; P.anim = 'atk'; P.animT = 0;
    const full = has(m, 0);
    const r = 1.7 * (has(m, 0, 2) ? 1.3 : 1);
    const arc = full ? Math.PI : 1.1;
    slashFx(P.x, P.y, ang, arc, r, has(m, 1) ? '#ff6060' : '#ffe6c0');
    sfx('swing');
    const stun = has(m, 0, 3) && P.swing % 4 === 0 ? 1 : 0;
    let heals = 0;
    query(P.x + dx * 0.3, P.y + dy * 0.3, r, (e) => {
      const ea = Math.atan2(e.y - P.y, e.x - P.x);
      let da = Math.abs(((ea - ang + Math.PI * 3) % TAU) - Math.PI);
      if (da > arc && Math.hypot(e.x - P.x, e.y - P.y) > 0.8) return;
      const d = Math.hypot(e.x - P.x, e.y - P.y) || 1;
      hitEnemy(e, m.dmg, { kx: (e.x - P.x) / d, ky: (e.y - P.y) / d, knock: 0.6, stun, bleed: has(m, 1) ? m.dmg * 0.5 : 0, bleedSpread: has(m, 1, 3) });
      if (has(m, 1, 2) && heals++ < 5) healPlayer(P.maxHp * 0.01, true);
    });
    if (has(m, 2) && P.swing % (has(m, 2, 3) ? 2 : 3) === 0) {
      const big = has(m, 2, 2);
      bolt(P, dx, dy, { speed: 11, r: big ? 0.8 : 0.55, dmg: m.dmg * (big ? 1.3 : 0.9), pierce: 99, life: 0.65, kind: 'wave', color: '#9ad8ff', knock: 0.8, ang });
    }
    G.shake = Math.max(G.shake, 0.05);
  },
  leap(P, m) {
    const [dx, dy, l] = aimDir(P);
    const [tx, ty] = rayTo(P.x, P.y, dx, dy, Math.min(7, Math.max(2, l)));
    sfx('leap');
    P.invuln = 0.6;
    P.jump = {
      x0: P.x, y0: P.y, x1: tx, y1: ty, t: 0, dur: 0.42, dmg: m.dmg, trail: has(m, 1, 3),
      land: () => {
        const r = 2.1 * (has(m, 0) ? 1.5 : 1);
        explode(P.x, P.y, r, m.dmg, '#ffd090', { stun: has(m, 0) ? (has(m, 0, 2) ? 2 : 1) : 0, knock: 1.2 });
        G.shake = 0.45; G.hitstop = 0.04;
        if (has(m, 1)) fireZone(P.x, P.y, 2, has(m, 1, 2) ? 5 : 3, m.dmg * 0.5);
        if (has(m, 0, 3)) { const x = P.x, y = P.y; G.fx.push({ t: 1, update(dt) { this.t -= dt; if (this.t <= 0) { explode(x, y, r * 1.1, m.dmg * 0.8, '#d8a060', { stun: 0.8 }); return false; } return true; } }); }
      },
    };
  },
  whirl(P, m) {
    P.whirl = { t: has(m, 0, 2) ? 3 : 2, tick: 0, ang: 0, m, invuln: has(m, 1, 3) };
  },
  cry(P, m) {
    P.buffs.cry = has(m, 0, 2) ? 12 : 8;
    if (has(m, 0)) P.buffs.fury = P.buffs.cry;
    G.cryExtend = has(m, 0, 3);
    G.fearBonus = has(m, 1, 3);
    G.fx.push(ringFx(P.x, P.y, 5, '#ffcf6a', 0.5));
    burstParts(P.x, P.y, 30, '#ffcf6a', 5, true);
    G.shake = 0.3;
    sfx('boss', 0.5);
    if (has(m, 1)) query(P.x, P.y, 6, (e) => { if (!e.isBoss) { e.st.fear = has(m, 1, 2) ? 3 : 2; if (has(m, 1, 2)) e.st.slow = 3; } });
    if (has(m, 2)) {
      const n = has(m, 2, 3) ? 3 : 2, str = has(m, 2, 2) ? 1.6 : 1;
      for (let i = 0; i < n; i++) {
        const a = i / n * TAU;
        G.allies.push({
          kind: 'ghost', sprite: 'ghostWarrior', x: P.x + Math.cos(a), y: P.y + Math.sin(a), r: 0.3, life: 15, face: 1, animT: 0, atk: 0, color: '#8ae0ff', taunt: true, hp: 99999,
          update(a, dt) {
            a.animT += dt; a.atk -= dt;
            const e = nearestEnemy(a.x, a.y, 8);
            const P = G.player;
            let tx = e ? e.x : P.x + 1, ty = e ? e.y : P.y;
            const d = Math.hypot(tx - a.x, ty - a.y);
            if (e && d < 1.1) {
              if (a.atk <= 0) { a.atk = 0.6; a.swing = 0.25; hitEnemy(e, m.dmg + 14 * G.stats.dmg * str, { kx: (e.x - a.x) / d, ky: (e.y - a.y) / d }); slashFx(a.x, a.y, Math.atan2(ty - a.y, tx - a.x), 1, 1.3, '#bff4ff'); }
            } else if (d > 0.9) { a.x += (tx - a.x) / d * 5 * dt; a.y += (ty - a.y) / d * 5 * dt; a.moving = true; }
            a.swing = (a.swing || 0) - dt;
            a.face = (tx - a.x) - (ty - a.y) > 0 ? 1 : -1;
            G.lights.push({ x: a.x, y: a.y, z: 10, r: 34, c: [140, 220, 255], i: 0.6 });
          },
        });
      }
    }
  },
  // ─── Пиромантка
  firebolt(P, m) {
    const [dx, dy] = aimDir(P);
    P.atkT = P.atkMax = 0.22; P.anim = 'atk'; P.animT = 0;
    sfx('fire', 0.06);
    const pierce = has(m, 1) ? 99 : 0;
    const speed = has(m, 1, 2) ? 18 : 13;
    const crit = P.buffs.shadowShots > 0;
    const p = bolt(P, dx, dy, {
      speed, r: 0.24, dmg: m.dmg, pierce, life: has(m, 1, 2) ? 1.2 : 0.9, kind: has(m, 1) ? 'lance' : 'fire', color: '#ffb040', knock: 0.3,
      hitOpts: { burn: has(m, 1, 3) ? m.dmg * 0.4 : 0 },
      onHit: (p, e) => {
        if (has(m, 0) && !p.child) {
          const n = has(m, 0, 3) ? 5 : 3;
          const base = Math.atan2(p.vy, p.vx);
          for (let i = 0; i < n; i++) {
            const a = base + (i - (n - 1) / 2) * 0.5;
            const c = spawnProj({ x: e.x, y: e.y, vx: Math.cos(a) * 11, vy: Math.sin(a) * 11, r: 0.18, dmg: m.dmg * (has(m, 0, 2) ? 0.75 : 0.5), life: 0.5, kind: 'spark', color: '#ffd060', child: true });
            c.hit.add(e);
          }
        }
      },
      onEnd: (p) => {
        if (has(m, 2)) {
          explode(p.x, p.y, has(m, 2, 2) ? 2.1 : 1.5, m.dmg * 0.7, '#ff7a2a', { knock: 0.5 });
          if (has(m, 2, 3)) fireZone(p.x, p.y, 1.3, 2.5, m.dmg * 0.6);
        }
      },
    });
  },
  meteor(P, m) {
    const [dx, dy, l] = aimDir(P);
    const tx = P.x + dx * Math.min(9, l), ty = P.y + dy * Math.min(9, l);
    P.atkT = P.atkMax = 0.3; P.anim = 'atk'; P.animT = 0;
    const ice = has(m, 2);
    const fall = (x, y, r, dmg, delay) => {
      if (G.map.at(Math.floor(x), Math.floor(y)) !== FLOOR) return;
      G.fx.push({
        kind: 'meteor', ground: true, x, y, r, t: delay, max: delay, ice,
        update(dt) {
          this.t -= dt;
          if (this.t <= 0) {
            explode(x, y, r, dmg, ice ? '#9af0ff' : '#ff9a3c', { freeze: ice ? (has(m, 2, 2) ? 3 : 2) : 0, burn: ice ? 0 : dmg * 0.2, knock: 1 });
            if (ice) { sfx('ice'); burstParts(x, y, 20, '#e0ffff', 4, true); }
            if (has(m, 1)) fireZone(x, y, has(m, 1, 2) ? 3 : 2.2, 4, m.dmg * 0.4, { pull: has(m, 1, 3) });
            if (has(m, 0, 3)) fireZone(x, y, 1.1, 2.5, m.dmg * 0.25);
            G.shake = Math.max(G.shake, 0.4);
            return false;
          }
          return true;
        },
      });
    };
    G.frozenBonus = has(m, 2, 3);
    if (has(m, 0)) {
      const n = has(m, 0, 2) ? 7 : 5;
      for (let i = 0; i < n; i++) fall(tx + rand(-2.2, 2.2), ty + rand(-2.2, 2.2), 1.3, m.dmg * 0.45, 0.5 + i * 0.12);
    } else fall(tx, ty, 2.2, m.dmg, 0.65);
  },
  blink(P, m) {
    const [dx, dy, l] = aimDir(P);
    const [tx, ty] = rayTo(P.x, P.y, dx, dy, Math.min(7, Math.max(1.5, l)));
    const x0 = P.x, y0 = P.y;
    burstParts(P.x, P.y, 20, '#c9a8ff', 3, true);
    if (has(m, 2, 3)) explode(x0, y0, 2.2, m.dmg * 1.5, '#ffe0a0', { knock: 1.3 });
    if (has(m, 1)) {
      G.allies.push({
        kind: 'decoy', sprite: 'mage', decoy: true, x: x0, y: y0, r: 0.3, life: 4, hp: 60 + G.stats.dmg * 30, face: P.face, animT: 0, color: '#b48cff', shoot: 0,
        update(a, dt) { a.animT += dt; if (has(m, 1, 3)) { a.shoot -= dt; if (a.shoot <= 0) { a.shoot = 0.5; const e = nearestEnemy(a.x, a.y, 7); if (e) { const d = Math.hypot(e.x - a.x, e.y - a.y) || 1; spawnProj({ x: a.x, y: a.y, vx: (e.x - a.x) / d * 12, vy: (e.y - a.y) / d * 12, r: 0.2, dmg: m.dmg * 0.6, life: 0.8, kind: 'spark', color: '#ffd060' }); } } } },
        onEnd(a) { if (has(m, 1, 2)) explode(a.x, a.y, 2.4, m.dmg * 3, '#b48cff'); },
      });
    }
    if (has(m, 0)) {
      const steps = Math.ceil(Math.hypot(tx - x0, ty - y0) / 0.9);
      for (let i = 0; i <= steps; i++) fireZone(x0 + (tx - x0) * i / steps, y0 + (ty - y0) * i / steps, 0.8, 2.5, m.dmg * (has(m, 0, 2) ? 1.4 : 0.8));
    }
    P.x = tx; P.y = ty; P.invuln = 0.25;
    burstParts(P.x, P.y, 20, '#c9a8ff', 3, true);
    G.fx.push(ringFx(P.x, P.y, 1, '#c9a8ff', 0.25));
    sfx('zap');
    if (has(m, 2)) explode(P.x, P.y, 2.4, m.dmg * 1.5, '#ffe0a0', { knock: has(m, 2, 2) ? 2.2 : 0.8 });
  },
  orbs(P, m) {
    const n = has(m, 0, 3) ? 7 : has(m, 0) ? 5 : 3;
    const R = has(m, 0, 2) ? 2.3 : 1.6;
    const dur = 10;
    G.fx.push({
      kind: 'orbs', t: dur, n, R, ang: 0, shoot: 0, top: true, m,
      update(dt) {
        this.t -= dt; this.ang += dt * 3.2;
        const P = G.player;
        this.pts = [];
        for (let i = 0; i < n; i++) {
          const a = this.ang + i * TAU / n;
          const x = P.x + Math.cos(a) * R, y = P.y + Math.sin(a) * R;
          this.pts.push([x, y]);
          G.lights.push({ x, y, z: 10, r: 26, c: [255, 160, 70], i: 0.6 });
          query(x, y, 0.35, (e) => { e.orbHit = e.orbHit || {}; if ((e.orbHit[i] || 0) < G.time) { e.orbHit[i] = G.time + 0.4; hitEnemy(e, m.dmg, { burn: m.dmg * 0.2, knock: 0.3, kx: (e.x - P.x) / R, ky: (e.y - P.y) / R }); } });
        }
        if (has(m, 1)) {
          this.shoot -= dt;
          if (this.shoot <= 0) {
            this.shoot = has(m, 1, 2) ? 0.35 : 0.6;
            const i = Math.floor(Math.random() * n), [x, y] = this.pts[i];
            const e = nearestEnemy(x, y, 7);
            if (e) { const d = Math.hypot(e.x - x, e.y - y) || 1; spawnProj({ x, y, vx: (e.x - x) / d * 13, vy: (e.y - y) / d * 13, r: 0.2, dmg: m.dmg * 0.9, life: 0.8, kind: 'spark', color: '#ffb040', onEnd: has(m, 1, 3) ? (p) => explode(p.x, p.y, 1.2, m.dmg * 0.6, '#ff8a3a', { knock: 0.3 }) : null }); }
          }
        }
        if (this.t <= 0) {
          if (has(m, 2)) for (const [x, y] of this.pts) explode(x, y, 2, m.dmg * (has(m, 2, 2) ? 5 : 3), '#fff0a0', { stun: has(m, 2, 3) ? 1.2 : 0 });
          return false;
        }
        return true;
      },
    });
    sfx('fire');
  },
  // ─── Охотница
  arrow(P, m) {
    const [dx, dy] = aimDir(P);
    P.atkT = P.atkMax = 0.2; P.anim = 'atk'; P.animT = 0;
    sfx('shoot', 0.05);
    const n = has(m, 0, 2) ? 5 : has(m, 0) ? 3 : 1;
    const base = Math.atan2(dy, dx);
    const crit = P.buffs.shadowShots > 0;
    if (crit) P.buffs.shadowShots--;
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * 0.16;
      const ux = Math.cos(a), uy = Math.sin(a);
      const star = has(m, 2);
      bolt(P, ux, uy, {
        speed: 19, r: 0.2, dmg: m.dmg * (star && has(m, 2, 2) ? 1.3 : 1), pierce: star ? 99 : has(m, 0, 3) ? 1 : 0, life: 0.75, kind: star ? 'star' : 'arrow', color: star ? '#c9a8ff' : '#bff4ff', knock: 0.35, bounces: has(m, 1) ? (has(m, 1, 2) ? 4 : 2) : 0,
        hitOpts: { crit },
        onHit: (p, e, dealt) => {
          if (star && has(m, 2, 3) && Math.random() < 0.25) chainLightning(e, 3, p.dmg * 0.8, { color: '#c9a8ff' });
          if (p.bounces > 0) {
            const nx = nearestEnemy(e.x, e.y, 5, (o) => !p.hit.has(o));
            if (nx) {
              const d = Math.hypot(nx.x - e.x, nx.y - e.y) || 1;
              const c = spawnProj({ x: e.x, y: e.y, vx: (nx.x - e.x) / d * 19, vy: (nx.y - e.y) / d * 19, r: 0.2, dmg: p.dmg * (has(m, 1, 3) ? 1.2 : 1), life: 0.5, kind: 'arrow', color: '#8af0d0', bounces: p.bounces - 1, onHit: p.onHit, hitOpts: p.hitOpts });
              for (const h of p.hit) c.hit.add(h);
            }
          }
        },
      });
    }
  },
  trap(P, m) {
    const [dx, dy, l] = aimDir(P);
    const [tx, ty] = rayTo(P.x, P.y, dx, dy, Math.min(7, l));
    const n = has(m, 0, 2) ? 5 : has(m, 0) ? 3 : 1;
    for (let i = 0; i < n; i++) {
      const x = tx + (i ? rand(-1.6, 1.6) : 0), y = ty + (i ? rand(-1.6, 1.6) : 0);
      if (G.map.at(Math.floor(x), Math.floor(y)) !== FLOOR) continue;
      let uses = has(m, 2, 3) ? 3 : 1;
      G.fx.push({
        kind: 'trap', ground: true, x, y, t: 20, arm: 0.4, cool: 0, color: has(m, 1) ? '#8aff60' : has(m, 2) ? '#9ad8ff' : '#4af0cc',
        update(dt) {
          this.t -= dt; this.arm -= dt; this.cool -= dt;
          G.lights.push({ x, y, z: 0, r: 18, c: [80, 240, 200], i: 0.5 });
          if (this.arm > 0 || this.cool > 0) return this.t > 0;
          let trig = false;
          query(x, y, 0.8, () => { trig = true; return false; });
          if (trig) {
            explode(x, y, 2, m.dmg, this.color);
            if (has(m, 1)) fireZone(x, y, has(m, 1, 2) ? 2.8 : 2, 4, m.dmg * 0.5, { poison: true, slow: has(m, 1, 3), color: '#6aff40', c2: '#c0ff80', light: [120, 255, 80] });
            if (has(m, 2)) { const e = nearestEnemy(x, y, 3); if (e) chainLightning(e, has(m, 2, 2) ? 8 : 5, m.dmg * 0.6); }
            uses--; this.cool = 0.8;
            if (uses <= 0) return false;
          }
          return this.t > 0;
        },
      });
    }
    sfx('ui');
  },
  roll(P, m) {
    let dx = G.input.mx, dy = G.input.my;
    if (!dx && !dy) [dx, dy] = aimDir(P);
    const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const [tx, ty] = rayTo(P.x, P.y, dx, dy, 4);
    P.invuln = 0.35;
    sfx('leap');
    P.dash = {
      x0: P.x, y0: P.y, x1: tx, y1: ty, t: 0, dur: 0.24, color: has(m, 2) ? '#9a8aff' : '#bff4ff',
      end: () => {
        if (has(m, 0)) fireZone((P.x + tx) / 2, (P.y + ty) / 2, 1.6, 4, has(m, 0, 2) ? 10 * G.stats.dmg : 1, { slow: true, color: '#c8c8d8', c2: '#ffffff', light: [160, 160, 180] });
        if (has(m, 1)) {
          const n = has(m, 1, 2) ? 12 : 8;
          for (let i = 0; i < n; i++) {
            const a = i * TAU / n;
            spawnProj({
              x: P.x, y: P.y, vx: Math.cos(a) * 15, vy: Math.sin(a) * 15, r: 0.2, dmg: 12 * G.stats.dmg, life: 0.6, kind: 'arrow', color: '#d8f8ff',
              update: has(m, 1, 3) ? (p, dt) => { const e = nearestEnemy(p.x, p.y, 4); if (e) { const d = Math.hypot(e.x - p.x, e.y - p.y) || 1; p.vx += (e.x - p.x) / d * 60 * dt; p.vy += (e.y - p.y) / d * 60 * dt; const s = Math.hypot(p.vx, p.vy); p.vx *= 15 / s; p.vy *= 15 / s; } } : null,
            });
          }
        }
        if (has(m, 2)) { P.buffs.shadowShots = has(m, 2, 2) ? 5 : 3; if (has(m, 2, 3)) P.buffs.stealth = 2; }
      },
    };
  },
  rain(P, m) {
    const [dx, dy, l] = aimDir(P);
    let x = P.x + dx * Math.min(8, l), y = P.y + dy * Math.min(8, l);
    if (has(m, 1)) {
      const n = has(m, 1, 3) ? 2 : 1;
      for (let i = 0; i < n; i++) {
        G.allies.push({
          kind: 'hawk', x: P.x, y: P.y, r: 0.2, life: 15, hp: 99999, ang: i * Math.PI, dive: 0, color: '#ffd080', z: 26,
          update(a, dt) {
            const P = G.player;
            a.ang += dt * 2.5; a.dive -= dt;
            const e = nearestEnemy(P.x, P.y, 8);
            let tx = P.x + Math.cos(a.ang) * 2, ty = P.y + Math.sin(a.ang) * 2;
            if (e && a.dive <= 0) { tx = e.x; ty = e.y; if (Math.hypot(e.x - a.x, e.y - a.y) < 0.5) { a.dive = has(m, 1, 2) ? 0.5 : 0.8; hitEnemy(e, 14 * G.stats.dmg, { kx: 0, ky: 0 }); burstParts(e.x, e.y, 6, '#ffd080', 2, true); } }
            const d = Math.hypot(tx - a.x, ty - a.y) || 1, sp = has(m, 1, 2) ? 14 : 10;
            a.x += (tx - a.x) / d * Math.min(d, sp * dt * (a.dive > 0 ? 0.6 : 1)); a.y += (ty - a.y) / d * Math.min(d, sp * dt);
            a.z = a.dive > 0 ? 26 : 10;
            if (Math.random() < 0.3) addPart({ x: a.x, y: a.y, z: a.z, vx: 0, vy: 0, vz: 0, g: 0, life: 0.2, max: 0.2, size: 1, color: '#ffd080', add: true });
          },
        });
      }
      sfx('ui');
      return;
    }
    const r = 2.5 * (has(m, 0) ? 1.5 : 1);
    const dur = has(m, 0, 2) ? 5 : 3;
    const lightning = has(m, 2);
    G.fx.push({
      kind: 'rain', ground: true, x, y, r, t: dur, max: dur, tick: 0, color: lightning ? '#c9a8ff' : '#bff4ff',
      update(dt) {
        this.t -= dt; this.tick -= dt;
        if (has(m, 0, 3)) { const P = G.player; this.x += (P.x - this.x) * Math.min(1, dt * 3); this.y += (P.y - this.y) * Math.min(1, dt * 3); }
        if (this.tick <= 0) {
          this.tick = lightning ? (has(m, 2, 2) ? 0.2 : 0.3) : 0.08;
          const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * this.r;
          const hx = this.x + Math.cos(a) * d, hy = this.y + Math.sin(a) * d;
          if (lightning) {
            G.fx.push(boltFx(hx - 0.6, hy - 3.5, hx, hy, '#d8c0ff'));
            G.lights.push({ x: hx, y: hy, z: 0, r: 50, c: [200, 160, 255], i: 1.2 });
            query(hx, hy, 1.1, (e) => hitEnemy(e, m.dmg * 2.5, { stun: has(m, 2, 3) ? 0.5 : 0, kx: 0, ky: 0 }));
            sfx('zap', 0.08);
          } else {
            G.fx.push({ kind: 'arrowFall', x: hx, y: hy, t: 0.15, max: 0.15, update(dt) { this.t -= dt; if (this.t <= 0) { burstParts(hx, hy, 4, '#d8f4ff', 1.5, true); G.lights.push({ x: hx, y: hy, z: 0, r: 20, c: [190, 240, 255], i: 0.6 }); query(hx, hy, 0.7, (e) => hitEnemy(e, m.dmg, { kx: 0, ky: 0, knock: 0.1 })); return false; } return true; } });
          }
        }
        return this.t > 0;
      },
    });
  },
};
