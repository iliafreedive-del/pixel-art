// Пиксельный художник: буфер Uint32, затенённые фигуры с дизерингом,
// палитры со сдвигом оттенка (тени в холод, свет в тепло), контур и подсветка края.

export const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

export function hex2rgb(h) {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const u32 = (r, g, b, a = 255) => ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
export function col(h, a = 255) { const [r, g, b] = hex2rgb(h); return u32(r, g, b, a); }
export function unpack(c) { return [c & 255, (c >>> 8) & 255, (c >>> 16) & 255, c >>> 24]; }
export function css(c) { const [r, g, b, a] = unpack(c); return `rgba(${r},${g},${b},${a / 255})`; }

function rgb2hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let h = 0, s = 0; const l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}
function hsl2rgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
}
function hueToward(h, target, k) {
  let d = ((target - h + 540) % 360) - 180;
  return h + d * k;
}

// Палитра из одного цвета: n ступеней от тени к свету.
export function ramp(hex, n = 5, spread = 0.42, shift = 0.35) {
  const [r, g, b] = hex2rgb(hex);
  const [h, s, l] = rgb2hsl(r, g, b);
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1) - 0.5;
    const L = Math.min(0.96, Math.max(0.03, l + t * spread * (t < 0 ? 1.1 : 0.9)));
    const H = hueToward(h, t < 0 ? 255 : 50, Math.abs(t) * shift * (s > 0.08 ? 1 : 0.4));
    const S = Math.min(1, Math.max(0, s * (1 - Math.abs(t) * 0.25) + (t < 0 ? 0.06 : 0)));
    const [rr, gg, bb] = hsl2rgb(H, S, L);
    out.push(u32(rr, gg, bb));
  }
  return out;
}

export function mix(c1, c2, t) {
  const a = unpack(c1), b = unpack(c2);
  return u32(
    Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t), Math.round(a[3] + (b[3] - a[3]) * t));
}

const LX = -0.55, LY = -0.75; // свет сверху-слева

export class Pix {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Uint32Array(w * h); }
  set(x, y, c) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || !c) return;
    this.d[y * this.w + x] = c;
  }
  get(x, y) { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0; return this.d[y * this.w + x]; }
  blend(x, y, c, t) { const o = this.get(x, y); if (o) this.set(x, y, mix(o, c, t)); }
  pick(R, t, x, y, dith = 0.55) {
    const n = R.length;
    let i = Math.floor(t * (n - 1) + 0.5 + (BAYER[(y & 3) * 4 + (x & 3)] - 0.5) * dith);
    return R[i < 0 ? 0 : i >= n ? n - 1 : i];
  }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); }
  // Затенённый эллипс (сфера)
  ell(cx, cy, rx, ry, R, amb = 0.52, k = 0.55, dith = 0.55) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
        const d = nx * nx + ny * ny;
        if (d > 1) continue;
        const nz = Math.sqrt(1 - d);
        const t = amb + (-(nx * LX + ny * LY) * 0.8 + (nz - 0.5) * 0.5) * k;
        this.set(x, y, this.pick(R, Math.max(0, Math.min(1, t)), x, y, dith));
      }
    }
  }
  // Цилиндр-«конечность» от p0 к p1 с радиусами r0..r1
  limb(x0, y0, x1, y1, r0, r1, R, amb = 0.5, k = 0.6) {
    const minx = Math.floor(Math.min(x0 - r0, x1 - r1)), maxx = Math.ceil(Math.max(x0 + r0, x1 + r1));
    const miny = Math.floor(Math.min(y0 - r0, y1 - r1)), maxy = Math.ceil(Math.max(y0 + r0, y1 + r1));
    const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1;
    const L = Math.sqrt(L2), px = -dy / L, py = dx / L;
    for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
      const qx = x + 0.5 - x0, qy = y + 0.5 - y0;
      let t = (qx * dx + qy * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const r = r0 + (r1 - r0) * t;
      const ex = qx - dx * t, ey = qy - dy * t;
      const dd = Math.sqrt(ex * ex + ey * ey);
      if (dd > r) continue;
      const side = (ex * px + ey * py) / (r || 1); // -1..1 поперёк
      const sgn = (px * LX + py * LY) < 0 ? 1 : -1;
      const v = amb + side * sgn * 0.5 * k + (1 - Math.abs(side)) * 0.25 * k - 0.12 * k;
      this.set(x, y, this.pick(R, Math.max(0, Math.min(1, v)), x, y));
    }
  }
  line(x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let n = 0; n < 400; n++) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  // Многоугольник с вертикальным градиентом
  poly(pts, R, top = 0.75, bot = 0.25, xk = 0.15) {
    let miny = 1e9, maxy = -1e9, minx = 1e9, maxx = -1e9;
    for (const [x, y] of pts) { miny = Math.min(miny, y); maxy = Math.max(maxy, y); minx = Math.min(minx, x); maxx = Math.max(maxx, x); }
    for (let y = Math.floor(miny); y <= Math.ceil(maxy); y++) {
      const yc = y + 0.5, xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
        if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.ceil(xs[k] - 0.5); x <= Math.floor(xs[k + 1] - 0.5); x++) {
          const ty = (yc - miny) / (maxy - miny || 1);
          const tx = (x - minx) / (maxx - minx || 1);
          const v = top + (bot - top) * ty + (0.5 - tx) * xk;
          this.set(x, y, this.pick(R, Math.max(0, Math.min(1, v)), x, y));
        }
      }
    }
  }
  // Подсветка края (rim): пиксели с пустым соседом сверху/справа
  rim(c, t = 0.55, dx = 1, dy = -1) {
    const src = this.d.slice();
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const p = src[y * this.w + x];
      if (!p) continue;
      const nx = x + dx, ny = y + dy;
      const n = nx < 0 || ny < 0 || nx >= this.w || ny >= this.h ? 0 : src[ny * this.w + nx];
      const n2 = x + dx < this.w && x + dx >= 0 ? src[y * this.w + x + dx] : 0;
      if (!n || !n2) this.d[y * this.w + x] = mix(p, c, t);
    }
  }
  // Внешний контур в 1 пиксель
  outline(c) {
    const src = this.d.slice(), w = this.w, h = this.h;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (src[y * w + x]) continue;
      if ((x > 0 && src[y * w + x - 1]) || (x < w - 1 && src[y * w + x + 1]) ||
          (y > 0 && src[(y - 1) * w + x]) || (y < h - 1 && src[(y + 1) * w + x])) this.d[y * w + x] = c;
    }
  }
  canvas() {
    const cv = document.createElement('canvas');
    cv.width = this.w; cv.height = this.h;
    const cx = cv.getContext('2d');
    const id = new ImageData(new Uint8ClampedArray(this.d.buffer.slice(0)), this.w, this.h);
    cx.putImageData(id, 0, 0);
    return cv;
  }
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export function flipCanvas(src) {
  const c = makeCanvas(src.width, src.height), x = c.getContext('2d');
  x.translate(src.width, 0); x.scale(-1, 1); x.drawImage(src, 0, 0);
  return c;
}

export function tintCanvas(src, color) {
  const c = makeCanvas(src.width, src.height), x = c.getContext('2d');
  x.drawImage(src, 0, 0);
  x.globalCompositeOperation = 'source-atop';
  x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
  return c;
}

// Светлое пятно со ступенчатыми кольцами и дизерингом — «пиксельный» свет.
export function lightSprite(radius, color = [255, 220, 170], steps = 6) {
  const s = radius * 2;
  const p = new Pix(s, s);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const dx = (x + 0.5 - radius) / radius, dy = (y + 0.5 - radius) / radius;
    let d = Math.sqrt(dx * dx + dy * dy);
    if (d >= 1) continue;
    let v = 1 - d; v = v * v * (3 - 2 * v);
    v = Math.floor(v * steps + BAYER[(y & 3) * 4 + (x & 3)] * 0.9) / steps;
    if (v <= 0) continue;
    p.d[y * s + x] = u32(Math.round(color[0] * v), Math.round(color[1] * v), Math.round(color[2] * v), 255);
  }
  return p.canvas();
}

// Мягкое свечение для аддитивного слоя (без ступеней).
export function glowSprite(radius, color = [255, 200, 120], power = 2) {
  const c = makeCanvas(radius * 2, radius * 2), x = c.getContext('2d');
  const g = x.createRadialGradient(radius, radius, 0, radius, radius, radius);
  const [r, gg, b] = color;
  g.addColorStop(0, `rgba(${r},${gg},${b},1)`);
  g.addColorStop(0.25, `rgba(${r},${gg},${b},${0.55 / power * 2})`);
  g.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  x.fillStyle = g; x.fillRect(0, 0, radius * 2, radius * 2);
  return c;
}
