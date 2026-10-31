// Окружение: плиты пола, блоки стен, колонны, надгробия, жаровни, обелиски, кристаллы.
import { Pix, ramp, col, mix, BAYER } from '../pixel.js';
import { hash2, mulberry32 } from '../util.js';

export const BIOMES = {
  crypt: {
    name: 'Склеп', floor: '#4f5a5c', floor2: '#3c4648', grout: '#1c2224', accent: '#4af0cc',
    wall: '#4a5254', wallTop: '#262c30', moss: '#3a5a3a', ambient: [78, 90, 106], fog: [40, 70, 72],
    void: '#07090c', particles: 'dust', light: [255, 196, 140],
  },
  forge: {
    name: 'Горнило', floor: '#56443a', floor2: '#3e302a', grout: '#1a1210', accent: '#ff9a3c',
    wall: '#4a3a32', wallTop: '#22181a', moss: '#7a2a10', ambient: [96, 68, 60], fog: [90, 40, 20],
    void: '#0c0605', particles: 'embers', light: [255, 170, 100],
  },
  frost: {
    name: 'Бездна', floor: '#4c5a74', floor2: '#36405a', grout: '#141a2a', accent: '#b48cff',
    wall: '#4a5470', wallTop: '#20243a', moss: '#a8d8f0', ambient: [72, 76, 114], fog: [60, 50, 110],
    void: '#06060e', particles: 'snow', light: [200, 210, 255],
  },
};

// Ромб 32×16: x∈[0,32), y∈[0,16)
function inDiamond(x, y) {
  const dx = Math.abs(x + 0.5 - 16) / 16, dy = Math.abs(y + 0.5 - 8) / 8;
  return dx + dy <= 1;
}

export function floorTiles(biomeKey, count = 14) {
  const B = BIOMES[biomeKey];
  const tiles = [];
  for (let v = 0; v < count; v++) {
    const r = mulberry32(v * 977 + biomeKey.length * 31);
    const p = new Pix(32, 16);
    const base = v % 3 === 0 ? B.floor2 : B.floor;
    const R = ramp(base, 6, 0.32, 0.3);
    const grout = col(B.grout);
    const kind = v < 6 ? 'slab' : v < 9 ? 'inset' : v < 11 ? 'crack' : v < 13 ? 'rubble' : 'rune';
    const tone = 0.35 + r() * 0.35;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) {
      if (!inDiamond(x, y)) continue;
      const dx = Math.abs(x + 0.5 - 16) / 16, dy = Math.abs(y + 0.5 - 8) / 8;
      const e = dx + dy;
      let t = tone + (hash2(x, y, v) - 0.5) * 0.18;
      // скос: верхние кромки светлее, нижние темнее
      if (e > 0.82) t += y < 8 ? 0.22 : -0.28;
      if (kind === 'inset') {
        const ie = e;
        if (ie > 0.45 && ie < 0.55) t -= 0.3;
        else if (ie >= 0.55 && ie < 0.62 && y > 8) t += 0.12;
      }
      p.set(x, y, p.pick(R, Math.max(0, Math.min(1, t)), x, y, 0.5));
      if (e > 0.94) p.set(x, y, grout);
    }
    if (kind === 'crack') {
      let cx = 8 + r() * 16, cy = 4 + r() * 8;
      for (let k = 0; k < 9; k++) {
        p.set(cx, cy, grout);
        cx += r() < 0.5 ? 1 : -1; cy += r() < 0.5 ? 0 : r() < 0.5 ? 1 : -1;
        if (!inDiamond(cx | 0, cy | 0)) break;
      }
    }
    if (kind === 'rubble') {
      for (let k = 0; k < 4; k++) {
        const x = 8 + r() * 16, y = 4 + r() * 7;
        p.set(x, y, R[4]); p.set(x + 1, y, R[3]); p.set(x, y + 1, R[1]); p.set(x + 1, y + 1, R[0]);
      }
    }
    if (kind === 'rune') {
      const a = col(B.accent, 140);
      for (let i = 0; i < 16; i++) {
        const ang = (i / 16) * Math.PI * 2;
        p.blend(16 + Math.cos(ang) * 7, 8 + Math.sin(ang) * 3.5, a, 0.6);
      }
      p.blend(16, 8, a, 0.7); p.blend(14, 8, a, 0.5); p.blend(18, 8, a, 0.5);
    }
    // мох / пепел / иней по краю
    if (r() < 0.35) {
      const mR = ramp(B.moss, 4, 0.3);
      const mx = r() * 32, my = r() * 16;
      for (let k = 0; k < 12; k++) {
        const x = mx + (r() - 0.5) * 8, y = my + (r() - 0.5) * 4;
        if (inDiamond(x | 0, y | 0)) p.set(x, y, mR[(r() * 4) | 0]);
      }
    }
    tiles.push(p.canvas());
  }
  return tiles;
}

// Блок стены: ромб сверху + две грани с кладкой
export function wallBlock(biomeKey, h, variant = 0) {
  const B = BIOMES[biomeKey];
  const p = new Pix(32, 16 + h);
  const RL = ramp(B.wall, 6, 0.36), RR = ramp(B.wall, 6, 0.36), RT = ramp(B.wallTop, 5, 0.3);
  const mortar = col(B.grout);
  const r = mulberry32(variant * 131 + h);
  const brick = (u, v, row) => (v % 6 === 0) || ((u + row * 5 + variant * 3) % 10 === 0);
  // левая грань: x 0..15, верх y = 8 + x*0.5
  for (let x = 0; x < 16; x++) {
    const y0 = 8 + x * 0.5;
    for (let v = 0; v < h; v++) {
      const y = Math.floor(y0 + v);
      const row = Math.floor(v / 6);
      let t = 0.62 - v / h * 0.32 + (hash2(x, v, variant) - 0.5) * 0.15;
      if (brick(x, v, row)) p.set(x, y, mortar);
      else p.set(x, y, p.pick(RL, t, x, y));
    }
  }
  // правая грань: x 16..31
  for (let x = 16; x < 32; x++) {
    const y0 = 16 - (x - 16) * 0.5;
    for (let v = 0; v < h; v++) {
      const y = Math.floor(y0 + v);
      const row = Math.floor(v / 6);
      let t = 0.32 - v / h * 0.24 + (hash2(x, v, variant + 9) - 0.5) * 0.15;
      if (brick(x - 16, v, row + 1)) p.set(x, y, mortar);
      else p.set(x, y, p.pick(RR, t, x, y));
    }
  }
  // верх
  for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) {
    if (!inDiamond(x, y)) continue;
    const dx = Math.abs(x + 0.5 - 16) / 16, dy = Math.abs(y + 0.5 - 8) / 8;
    let t = 0.45 + (hash2(x, y, variant + 3) - 0.5) * 0.3;
    if (dx + dy > 0.84) t = y < 8 ? 0.85 : 0.6;
    p.set(x, y, p.pick(RT, t, x, y));
  }
  // мох/иней сверху
  if (r() < 0.6) {
    const mR = ramp(B.moss, 4, 0.3);
    for (let k = 0; k < 10; k++) {
      const x = 4 + r() * 24, y = 4 + r() * 8 + (r() < 0.4 ? 6 + r() * 6 : 0);
      p.set(x, y, mR[(r() * 4) | 0]);
    }
  }
  p.outline(col('#05040a'));
  return p.canvas();
}

function propSet(w, h, draw, outline = true) {
  const p = new Pix(w, h);
  draw(p);
  p.rim(col('#fff0d0'), 0.3);
  if (outline) p.outline(col('#07050a'));
  return p.canvas();
}

export function buildProps(biomeKey) {
  const B = BIOMES[biomeKey];
  const stone = ramp(B.wall, 6, 0.4), stoneD = ramp(B.wallTop, 5, 0.35);
  const P = {};
  P.pillar = propSet(24, 62, (p) => {
    p.ell(12, 56, 10, 4.5, stoneD, 0.5);
    p.poly([[3, 54], [21, 54], [20, 49], [4, 49]], stone, 0.7, 0.4);
    for (let y = 14; y < 50; y++) {
      for (let x = 6; x < 18; x++) {
        const t = 0.75 - (x - 6) / 12 * 0.55 + (hash2(x, y, 5) - 0.5) * 0.1 - (y % 7 === 0 ? 0.25 : 0);
        p.set(x, y, p.pick(stone, t, x, y));
      }
    }
    p.poly([[4, 14], [20, 14], [21, 9], [3, 9]], stone, 0.85, 0.5);
    // сколотый верх
    p.poly([[5, 9], [9, 3], [12, 6], [15, 1], [19, 9]], stone, 0.8, 0.5);
  });
  P.pillarBroken = propSet(24, 40, (p) => {
    p.ell(12, 35, 10, 4.5, stoneD, 0.5);
    p.poly([[3, 34], [21, 34], [20, 29], [4, 29]], stone, 0.7, 0.4);
    for (let y = 12; y < 30; y++) for (let x = 6; x < 18; x++) {
      const t = 0.75 - (x - 6) / 12 * 0.55 + (hash2(x, y, 6) - 0.5) * 0.1;
      if (y < 15 && hash2(x, 0, 2) > 0.5 + (15 - y) * 0.1) continue;
      p.set(x, y, p.pick(stone, t, x, y));
    }
  });
  P.tomb = propSet(20, 26, (p) => {
    p.ell(10, 22, 8, 3, stoneD, 0.4);
    p.poly([[4, 22], [16, 22], [16, 8], [13, 4], [7, 4], [4, 8]], stone, 0.8, 0.35, 0.4);
    p.line(8, 10, 12, 10, col(B.grout)); p.line(10, 8, 10, 15, col(B.grout));
  });
  P.bones = propSet(18, 10, (p) => {
    const bone = ramp('#e4d8ba', 4, 0.35);
    p.limb(2, 6, 12, 4, 1, 1, bone); p.limb(5, 8, 15, 7, 1, 1, bone);
    p.ell(14, 4, 2.4, 2.2, bone, 0.6); p.set(14, 4, col('#201418')); p.set(15, 4, col('#201418'));
  });
  P.brazier = propSet(18, 22, (p) => {
    const iron = ramp('#4a4048', 5, 0.4), brass = ramp('#d6a548', 5, 0.4);
    p.limb(5, 20, 8, 11, 0.8, 0.8, iron); p.limb(13, 20, 10, 11, 0.8, 0.8, iron); p.limb(9, 21, 9, 11, 0.8, 0.8, iron);
    p.ell(9, 9, 7, 3, brass, 0.6);
    p.ell(9, 8, 5, 1.6, ramp('#3a1a0a', 3), 0.5);
  });
  P.crystal = propSet(22, 30, (p) => {
    const cr = ramp(biomeKey === 'forge' ? '#ff8a3a' : biomeKey === 'frost' ? '#b48cff' : '#4af0cc', 6, 0.6);
    p.poly([[9, 27], [13, 27], [14, 8], [11, 2], [8, 8]], cr, 0.9, 0.35, 0.6);
    p.poly([[3, 27], [8, 27], [7, 15], [4, 11], [2, 16]], cr, 0.8, 0.3, 0.6);
    p.poly([[14, 27], [19, 27], [20, 17], [17, 13], [15, 18]], cr, 0.85, 0.3, 0.6);
  });
  P.obelisk = propSet(24, 54, (p) => {
    const dark = ramp('#2a2236', 6, 0.4);
    p.ell(12, 49, 10, 4, stoneD, 0.4);
    p.poly([[4, 49], [20, 49], [17, 10], [12, 2], [7, 10]], dark, 0.75, 0.3, 0.6);
    const rune = col('#d6b4ff');
    for (let y = 14; y < 44; y += 7) { p.set(12, y, rune); p.set(11, y + 1, rune); p.set(13, y + 1, rune); p.set(12, y + 2, rune); }
  });
  P.obeliskBroken = propSet(24, 30, (p) => {
    const dark = ramp('#2a2236', 6, 0.4);
    p.ell(12, 25, 10, 4, stoneD, 0.4);
    p.poly([[4, 25], [20, 25], [18, 12], [13, 16], [9, 9], [6, 14]], dark, 0.6, 0.25, 0.6);
  });
  P.altar = propSet(34, 26, (p) => {
    const st = ramp('#8a7c68', 6, 0.4), brass = ramp('#d6a548', 5, 0.45);
    p.ell(17, 20, 15, 5.5, stoneD, 0.45);
    p.poly([[6, 19], [28, 19], [26, 10], [8, 10]], st, 0.8, 0.35);
    p.ell(17, 10, 10, 3.5, st, 0.75);
    p.ell(17, 9, 3, 2, brass, 0.8);
    p.limb(17, 7, 17, 2, 1, 0.5, brass);
  });
  P.ritual = propSet(30, 18, (p) => {
    const st = ramp('#5a5060', 5, 0.4);
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2;
      p.limb(15 + Math.cos(a) * 12, 12 + Math.sin(a) * 5, 15 + Math.cos(a) * 12, 6 + Math.sin(a) * 5, 1.3, 1, st);
    }
  }, true);
  P.chest = propSet(20, 18, (p) => {
    const wood = ramp('#6a4428', 5, 0.4), brass = ramp('#d6a548', 5, 0.45);
    p.poly([[3, 15], [17, 15], [17, 7], [3, 7]], wood, 0.7, 0.35);
    p.ell(10, 7, 7, 3, wood, 0.75);
    p.rect(3, 9, 14, 1, brass[2]); p.rect(9, 9, 2, 3, brass[4]);
  });
  return P;
}
