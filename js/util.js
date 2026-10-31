// Общие помощники: случайные числа, математика, проекция изометрии.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export let rnd = Math.random;
export const rand = (a, b) => a + Math.random() * (b - a);
export const randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
export const choice = (arr, r = Math.random) => arr[Math.floor(r() * arr.length)];
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
export const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));
export const TAU = Math.PI * 2;

export function shuffle(arr, r = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Хэш-шум для детерминированных вариаций по координатам.
export function hash2(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function valueNoise(x, y, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s);
  const c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

export function fbm(x, y, s = 0) {
  return valueNoise(x, y, s) * 0.55 + valueNoise(x * 2.1, y * 2.1, s + 7) * 0.3 + valueNoise(x * 4.3, y * 4.3, s + 13) * 0.15;
}

// Изометрия 2:1. Мир в клетках, экран в пикселях низкого разрешения.
export const TW = 32, TH = 16;
export const HW = TW / 2, HH = TH / 2;
export const isoX = (x, y) => (x - y) * HW;
export const isoY = (x, y) => (x + y) * HH;
// Экранный вектор → мировой (для мыши и ввода)
export function screenToWorld(sx, sy) {
  return [(sx / HW + sy / HH) / 2, (sy / HH - sx / HW) / 2];
}

export function angleTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }
export function norm(x, y) { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; }
