// Генерация локации: цепочка залов от входа к цели, коридоры, стены, декор.
// Пол запекается в один большой холст; стены и предметы рисуются с сортировкой по глубине.
import { mulberry32, hash2, fbm, clamp, HW, HH } from './util.js';
import { floorTiles, wallBlock, buildProps, BIOMES } from './art/env.js';
import { makeCanvas } from './pixel.js';

export const VOID = 0, FLOOR = 1, WALL = 2, SOLID = 3;

const artCache = {};
export function biomeArt(biome) {
  if (artCache[biome]) return artCache[biome];
  const a = {
    floor: floorTiles(biome),
    wallHi: [0, 1, 2, 3].map((v) => wallBlock(biome, 26, v)),
    wallLo: [0, 1].map((v) => wallBlock(biome, 7, v)),
    props: buildProps(biome),
  };
  artCache[biome] = a;
  return a;
}

export function generateMap(area, seed) {
  const r = mulberry32(seed);
  const N = area.size;
  const g = new Uint8Array(N * N);
  const at = (x, y) => (x < 0 || y < 0 || x >= N || y >= N ? VOID : g[y * N + x]);
  const set = (x, y, v) => { if (x > 1 && y > 1 && x < N - 2 && y < N - 2) g[y * N + x] = v; };

  const carveBlob = (cx, cy, rad) => {
    const s = r() * 100;
    for (let y = Math.floor(cy - rad - 2); y <= cy + rad + 2; y++) for (let x = Math.floor(cx - rad - 2); x <= cx + rad + 2; x++) {
      const a = Math.atan2(y - cy, x - cx);
      const rr = rad * (0.82 + 0.36 * fbm(Math.cos(a) * 1.5 + s, Math.sin(a) * 1.5 + s));
      if ((x - cx) ** 2 + (y - cy) ** 2 <= rr * rr) set(x, y, FLOOR);
    }
  };
  const carveLine = (x0, y0, x1, y1, w) => {
    const L = Math.hypot(x1 - x0, y1 - y0), steps = Math.ceil(L * 2);
    const s = r() * 50;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const wig = (fbm(t * 3 + s, s) - 0.5) * 4;
      const nx = -(y1 - y0) / L, ny = (x1 - x0) / L;
      const x = x0 + (x1 - x0) * t + nx * wig, y = y0 + (y1 - y0) * t + ny * wig;
      for (let dy = -w; dy <= w; dy++) for (let dx = -w; dx <= w; dx++) if (dx * dx + dy * dy <= w * w + 0.5) set(Math.round(x + dx), Math.round(y + dy), FLOOR);
    }
  };

  // главный путь: от левого края к правому, зигзагом
  const rooms = [];
  let x = 9, y = N / 2 + (r() - 0.5) * N * 0.4;
  const boss = !!area.boss;
  const target = boss ? 5 : 7 + Math.floor(N / 16);
  let ang = 0;
  for (let i = 0; i < target; i++) {
    const last = i === target - 1;
    const rad = i === 0 ? 4.5 : last && boss ? 10 : 3.6 + r() * 3.4;
    rooms.push({ x, y, r: rad, i, main: true });
    const step = 9 + r() * 5 + (last ? 0 : 0);
    ang = clamp(ang + (r() - 0.5) * 1.6, -1.1, 1.1);
    // держимся внутри карты
    if (y < N * 0.25) ang = Math.abs(ang) * 0.8;
    if (y > N * 0.75) ang = -Math.abs(ang) * 0.8;
    x += Math.cos(ang) * step; y += Math.sin(ang) * step;
    if (x > N - 10) break;
  }
  // боковые залы
  const side = [];
  for (let i = 1; i < rooms.length - 1; i++) {
    if (r() < 0.55) {
      const a = (r() < 0.5 ? -1 : 1) * (Math.PI / 2 + (r() - 0.5) * 0.8);
      const d = 8 + r() * 5;
      const sx = clamp(rooms[i].x + Math.cos(a) * d, 7, N - 7), sy = clamp(rooms[i].y + Math.sin(a) * d, 7, N - 7);
      side.push({ x: sx, y: sy, r: 3 + r() * 2.5, i: rooms.length + side.length, from: i, main: false });
    }
  }
  for (const rm of rooms) carveBlob(rm.x, rm.y, rm.r);
  for (let i = 1; i < rooms.length; i++) carveLine(rooms[i - 1].x, rooms[i - 1].y, rooms[i].x, rooms[i].y, r() < 0.5 ? 1.6 : 2.2);
  for (const sr of side) { carveBlob(sr.x, sr.y, sr.r); carveLine(rooms[sr.from].x, rooms[sr.from].y, sr.x, sr.y, 1.4); }
  // сглаживание
  for (let it = 0; it < 2; it++) {
    const copy = g.slice();
    for (let yy = 2; yy < N - 2; yy++) for (let xx = 2; xx < N - 2; xx++) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (copy[(yy + dy) * N + xx + dx] === FLOOR) n++;
      if (copy[yy * N + xx] !== FLOOR && n >= 6) g[yy * N + xx] = FLOOR;
      else if (copy[yy * N + xx] === FLOOR && n <= 2) g[yy * N + xx] = VOID;
    }
  }
  // стены
  for (let yy = 1; yy < N - 1; yy++) for (let xx = 1; xx < N - 1; xx++) {
    if (g[yy * N + xx] !== VOID) continue;
    let f = false;
    for (let dy = -1; dy <= 1 && !f; dy++) for (let dx = -1; dx <= 1; dx++) if (g[(yy + dy) * N + xx + dx] === FLOOR) { f = true; break; }
    if (f) g[yy * N + xx] = WALL;
  }

  const allRooms = rooms.concat(side);
  const props = [];
  const free = (cx, cy, rad) => {
    for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) if (at(cx + dx, cy + dy) !== FLOOR) return false;
    return true;
  };
  // колонны в больших залах (кольцом), надгробия, кости, жаровни, кристаллы
  for (const rm of allRooms) {
    const cx = Math.round(rm.x), cy = Math.round(rm.y);
    if (rm.i === 0) continue;
    if (rm.r > 5.2 && !(boss && rm === rooms[rooms.length - 1])) {
      const n = 4 + Math.floor(r() * 3), off = r() * 6;
      for (let k = 0; k < n; k++) {
        const a = off + (k / n) * Math.PI * 2;
        const px = Math.round(cx + Math.cos(a) * rm.r * 0.55), py = Math.round(cy + Math.sin(a) * rm.r * 0.55);
        if (free(px, py, 1)) { g[py * N + px] = SOLID; props.push({ kind: r() < 0.7 ? 'pillar' : 'pillarBroken', x: px + 0.5, y: py + 0.5, solid: true }); }
      }
    }
    if (boss && rm === rooms[rooms.length - 1]) {
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + 0.3;
        const px = Math.round(cx + Math.cos(a) * (rm.r + 0.4)), py = Math.round(cy + Math.sin(a) * (rm.r + 0.4));
        if (at(px, py) === FLOOR) { g[py * N + px] = SOLID; props.push({ kind: 'pillar', x: px + 0.5, y: py + 0.5, solid: true }); }
      }
    }
    const deco = Math.floor(rm.r * 1.4);
    for (let k = 0; k < deco; k++) {
      const a = r() * Math.PI * 2, d = rm.r * (0.4 + r() * 0.6);
      const px = Math.round(cx + Math.cos(a) * d), py = Math.round(cy + Math.sin(a) * d);
      if (at(px, py) !== FLOOR) continue;
      const roll = r();
      if (roll < 0.25 && free(px, py, 1)) { g[py * N + px] = SOLID; props.push({ kind: area.biome === 'crypt' ? 'tomb' : 'crystal', x: px + 0.5, y: py + 0.5, solid: true }); }
      else if (roll < 0.6) props.push({ kind: 'bones', x: px + r(), y: py + r(), solid: false });
    }
  }
  // жаровни у стен — источники тёплого света
  for (const rm of allRooms) {
    if (r() < 0.75) {
      for (let tries = 0; tries < 10; tries++) {
        const a = r() * Math.PI * 2, d = rm.r * 0.85;
        const px = Math.round(rm.x + Math.cos(a) * d), py = Math.round(rm.y + Math.sin(a) * d);
        if (at(px, py) === FLOOR && free(px, py, 0)) { g[py * N + px] = SOLID; props.push({ kind: 'brazier', x: px + 0.5, y: py + 0.5, solid: true, light: true }); break; }
      }
    }
  }
  return { N, g, at, rooms, side, allRooms, props, seed, biome: area.biome };
}

// ───────────── Запекание пола ─────────────
export function bakeFloor(map) {
  const { N, g, biome } = map;
  const art = biomeArt(biome);
  const W = N * 2 * HW + 64, H = N * 2 * HH + 64;
  const cv = makeCanvas(W, H), cx = cv.getContext('2d');
  const B = BIOMES[biome];
  cx.fillStyle = B.void; cx.fillRect(0, 0, W, H);
  const ox = N * HW + 32, oy = 32;
  map.ox = ox; map.oy = oy;
  const diamond = (sx, sy) => { cx.beginPath(); cx.moveTo(sx, sy); cx.lineTo(sx + HW, sy + HH); cx.lineTo(sx, sy + HH * 2); cx.lineTo(sx - HW, sy + HH); cx.closePath(); };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const v = g[j * N + i];
    if (v === VOID) continue;
    const sx = (i - j) * HW + ox, sy = (i + j) * HH + oy;
    // большие плиты 2×2: соседние клетки берут один вариант
    const h = hash2(i >> 1, j >> 1, map.seed);
    let vi = Math.floor(h * 11);
    if (hash2(i, j, map.seed + 1) > 0.965) vi = 13; // руна
    else if (hash2(i, j, map.seed + 2) > 0.85) vi = 11 + (hash2(i, j, 4) > 0.5 ? 1 : 0);
    cx.drawImage(art.floor[vi], sx - HW, sy);
    // крупные пятна света/тени
    const n = fbm(i * 0.11, j * 0.11, map.seed % 997);
    if (n < 0.45) { cx.fillStyle = `rgba(0,0,0,${(0.45 - n) * 0.9})`; diamond(sx, sy); cx.fill(); }
    else if (n > 0.6) { cx.fillStyle = `rgba(255,240,220,${(n - 0.6) * 0.25})`; diamond(sx, sy); cx.fill(); }
    // затенение у стен
    if (v === FLOOR) {
      let w = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (map.at(i + dx, j + dy) === WALL) w++;
      if (w) { cx.fillStyle = `rgba(4,2,8,${Math.min(0.55, w * 0.09)})`; diamond(sx, sy); cx.fill(); }
    }
  }
  // декали: трещины света/лавы/инея
  const r = mulberry32(map.seed + 77);
  for (let k = 0; k < N * 2; k++) {
    const i = Math.floor(r() * N), j = Math.floor(r() * N);
    if (g[j * N + i] !== FLOOR) continue;
    const sx = (i - j) * HW + ox, sy = (i + j) * HH + oy + HH;
    if (biome === 'forge' && r() < 0.6) {
      cx.strokeStyle = 'rgba(255,120,40,0.85)'; cx.lineWidth = 1;
      cx.beginPath(); let px = sx, py = sy; cx.moveTo(px, py);
      for (let s = 0; s < 5; s++) { px += (r() - 0.5) * 10; py += (r() - 0.5) * 5; cx.lineTo(Math.round(px), Math.round(py)); }
      cx.stroke();
      (map.glows || (map.glows = [])).push({ x: i + 0.5, y: j + 0.5, c: [255, 120, 40], r: 26 });
    } else if (biome === 'frost' && r() < 0.5) {
      cx.fillStyle = 'rgba(180,220,255,0.18)';
      cx.beginPath(); cx.ellipse(sx, sy, 10 + r() * 14, 5 + r() * 6, 0, 0, Math.PI * 2); cx.fill();
    } else {
      cx.fillStyle = 'rgba(20,10,14,0.35)';
      for (let s = 0; s < 6; s++) cx.fillRect(Math.round(sx + (r() - 0.5) * 16), Math.round(sy + (r() - 0.5) * 8), 2, 1);
    }
  }
  map.floor = cv;
  map.fctx = cx;
  map.art = art;
  map.wallKind = new Uint8Array(N * N);
  // короткие «передние» стены не заслоняют героя
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    if (g[j * N + i] !== WALL) continue;
    const front = map.at(i - 1, j) === FLOOR || map.at(i, j - 1) === FLOOR || map.at(i - 1, j - 1) === FLOOR;
    const back = map.at(i + 1, j) === FLOOR || map.at(i, j + 1) === FLOOR || map.at(i + 1, j + 1) === FLOOR;
    map.wallKind[j * N + i] = front && !back ? 1 : 2;
  }
  return cv;
}

// Пятно на полу (кровь, пепел, ожог) — рисуется прямо в запечённый пол
export function stain(map, x, y, color, size = 6, n = 6) {
  const cx = map.fctx; if (!cx) return;
  const sx = (x - y) * HW + map.ox, sy = (x + y) * HH + map.oy;
  cx.fillStyle = color;
  for (let k = 0; k < n; k++) {
    const a = Math.random() * Math.PI * 2, d = Math.random() * size;
    const w = 1 + Math.floor(Math.random() * 3);
    cx.fillRect(Math.round(sx + Math.cos(a) * d), Math.round(sy + Math.sin(a) * d * 0.5), w, Math.max(1, w - 1));
  }
}

// ───────────── Навигация ─────────────
export function isSolid(map, x, y) {
  const v = map.at(Math.floor(x), Math.floor(y));
  return v !== FLOOR;
}

// Поле расстояний от героя (BFS) — орды обходят стены
export function flowField(map, tx, ty, maxD = 48) {
  const { N, g } = map;
  if (!map.flow) map.flow = new Int16Array(N * N);
  const f = map.flow; f.fill(-1);
  const q = new Int32Array(N * N);
  let h = 0, t = 0;
  const s = ty * N + tx;
  if (g[s] !== FLOOR) return f;
  f[s] = 0; q[t++] = s;
  while (h < t) {
    const c = q[h++], cx = c % N, cy = (c / N) | 0, d = f[c];
    if (d >= maxD) continue;
    for (let k = 0; k < 8; k++) {
      const dx = DX[k], dy = DY[k];
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
      const ni = ny * N + nx;
      if (g[ni] !== FLOOR || f[ni] >= 0) continue;
      if (dx && dy && (g[cy * N + nx] !== FLOOR || g[ny * N + cx] !== FLOOR)) continue;
      f[ni] = d + 1; q[t++] = ni;
    }
  }
  return f;
}
const DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1];

export function flowDir(map, x, y) {
  const { N, flow: f } = map;
  const cx = Math.floor(x), cy = Math.floor(y);
  const c = f[cy * N + cx];
  if (c < 0) return null;
  let best = c, bx = 0, by = 0;
  for (let k = 0; k < 8; k++) {
    const nx = cx + DX[k], ny = cy + DY[k];
    if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
    const v = f[ny * N + nx];
    if (v >= 0 && v < best) { best = v; bx = nx + 0.5 - x; by = ny + 0.5 - y; }
  }
  if (best === c) return null;
  const l = Math.hypot(bx, by) || 1;
  return [bx / l, by / l];
}

export function los(map, x0, y0, x1, y1) {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (isSolid(map, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false;
  }
  return true;
}

// Выталкивание круга из твёрдых клеток
export function collide(map, e) {
  const r = e.r;
  const x0 = Math.floor(e.x - r), x1 = Math.floor(e.x + r), y0 = Math.floor(e.y - r), y1 = Math.floor(e.y + r);
  for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
    if (map.at(i, j) === FLOOR) continue;
    const nx = Math.max(i, Math.min(e.x, i + 1)), ny = Math.max(j, Math.min(e.y, j + 1));
    const dx = e.x - nx, dy = e.y - ny, d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2), push = r - d;
        e.x += (dx / d) * push; e.y += (dy / d) * push;
      } else {
        // центр внутри клетки — выталкиваем к ближайшей грани
        const l = e.x - i, rr = i + 1 - e.x, t = e.y - j, b = j + 1 - e.y;
        const m = Math.min(l, rr, t, b);
        if (m === l) e.x = i - r; else if (m === rr) e.x = i + 1 + r; else if (m === t) e.y = j - r; else e.y = j + 1 + r;
      }
    }
  }
}

export function randomFloorNear(map, x, y, rmin, rmax, tries = 30) {
  for (let k = 0; k < tries; k++) {
    const a = Math.random() * Math.PI * 2, d = rmin + Math.random() * (rmax - rmin);
    const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
    if (map.at(Math.floor(px), Math.floor(py)) === FLOOR && map.at(Math.floor(px + 0.4), Math.floor(py)) === FLOOR && map.at(Math.floor(px - 0.4), Math.floor(py)) === FLOOR && map.at(Math.floor(px), Math.floor(py + 0.4)) === FLOOR && map.at(Math.floor(px), Math.floor(py - 0.4)) === FLOOR) return [px, py];
  }
  return null;
}
