// Персонажи и монстры, нарисованные кодом. Каждый набор кадров собирается один раз
// при загрузке: затенение → подсветка края → контур → копии (зеркало, белая вспышка).
import { Pix, ramp, col, mix, flipCanvas, tintCanvas } from '../pixel.js';

const TAU = Math.PI * 2;
const OUT = col('#0b0812');

function darker(R, k = 1) { const o = R.slice(); for (let i = 0; i < k; i++) { o.pop(); o.unshift(o[0]); } return o; }

export function buildSet(w, h, draw, counts = { idle: 4, walk: 6, atk: 4 }, opt = {}) {
  const set = { w, h, ax: w / 2, ay: h - 3, anims: {} };
  for (const anim in counts) {
    const n = counts[anim], arr = [];
    for (let i = 0; i < n; i++) {
      const p = new Pix(w, h);
      draw(p, anim, i / n, i);
      if (opt.rim !== false) p.rim(opt.rimColor || col('#ffe6c0'), opt.rimT ?? 0.4);
      if (opt.outline !== false) p.outline(opt.outlineColor || OUT);
      const c = p.canvas();
      arr.push({ c, f: flipCanvas(c), w: null, wf: null });
    }
    set.anims[anim] = arr;
  }
  // белые силуэты для вспышки попадания создаются лениво
  set.white = (fr, flip) => {
    if (!fr.w) { fr.w = tintCanvas(fr.c, '#ffffff'); fr.wf = flipCanvas(fr.w); }
    return flip ? fr.wf : fr.w;
  };
  return set;
}

// ───────────────────────── Гуманоид ─────────────────────────
function humanoid(P) {
  const s = P.scale || 1;
  const W = Math.ceil((P.wide || 36) * s), H = Math.ceil((P.tall || 40) * s);
  const legL = 8 * s, torsoH = 9 * s * (P.torsoK || 1), headR = 3.7 * s * (P.headK || 1);
  const bulk = P.bulk || 1;
  return buildSet(W, H, (p, anim, t) => {
    const fy = H - 3;
    let cx = W / 2 - 1 * s;
    let walk = 0, lift = 0, bob = 0, armF = 0.35, armB = 0.25, atk = -1;
    if (anim === 'walk') {
      walk = Math.sin(t * TAU); lift = Math.cos(t * TAU);
      bob = -Math.abs(Math.sin(t * TAU)) * s;
      armF = 0.35 - walk * 0.6; armB = 0.25 + walk * 0.6;
    } else if (anim === 'idle') {
      bob = Math.sin(t * TAU) > 0 ? -1 : 0;
      armF = 0.35 + Math.sin(t * TAU) * 0.06;
    } else if (anim === 'atk') {
      atk = t;
    }
    const hunch = (P.hunch || 0) * s;
    const hipY = fy - legL + bob * 0.5;
    const shY = hipY - torsoH + 1 * s + bob * 0.5;
    const headY = shY - headR + 0.5 * s + bob * 0.3;
    const headX = cx + hunch * 1.4 + 0.5 * s;
    const R = P.R;

    // плащ
    if (R.cape) {
      const flow = anim === 'walk' ? 2 + Math.abs(walk) * 2 : anim === 'atk' ? 3 : 1 + (t > 0.5 ? 0.6 : 0);
      p.poly([[cx - 2 * s, shY - 0.5 * s], [cx + 1.5 * s, shY - 1 * s], [cx + 0.5 * s, fy - 3 * s],
        [cx - 3 * s - flow * s, fy - 1 * s], [cx - 6 * s - flow * s, fy - 2.5 * s]], R.cape, 0.55, 0.15, 0.4);
    }
    // задняя рука
    const shBX = cx - 2.2 * s * bulk + hunch, shFX = cx + 2.4 * s * bulk + hunch;
    const armL = 7 * s;
    const backA = P.armsForward ? 1.25 + walk * 0.15 : armB;
    const bhx = shBX + Math.sin(backA) * armL, bhy = shY + 1 * s + Math.cos(backA) * armL;
    p.limb(shBX, shY + 1 * s, bhx, bhy, 1.4 * s, 1.2 * s, darker(R.arm, 1), 0.4);
    p.ell(bhx, bhy, 1.3 * s, 1.3 * s, darker(R.hand, 1), 0.4);
    // ноги
    const legSp = 1.6 * s * bulk;
    const bfx = cx - legSp + walk * -2.6 * s, ffx = cx + legSp * 0.6 + walk * 2.6 * s;
    const bLift = anim === 'walk' ? Math.max(0, -lift) * 1.6 * s : 0;
    const fLift = anim === 'walk' ? Math.max(0, lift) * 1.6 * s : 0;
    p.limb(cx - legSp * 0.6, hipY, bfx, fy - 1 * s - bLift, 1.7 * s, 1.4 * s, darker(R.leg, 1), 0.42);
    p.ell(bfx + 0.8 * s, fy - 0.8 * s - bLift, 2 * s, 1.3 * s, darker(R.boot, 1), 0.4);
    p.limb(cx + legSp * 0.4, hipY, ffx, fy - 1 * s - fLift, 1.8 * s, 1.5 * s, R.leg, 0.55);
    p.ell(ffx + 0.9 * s, fy - 0.8 * s - fLift, 2.1 * s, 1.4 * s, R.boot, 0.55);
    // туловище
    const tcy = (hipY + shY) / 2;
    p.ell(cx + hunch * 0.6, tcy, 4 * s * bulk, torsoH / 2 + 1 * s, R.body, 0.55);
    if (R.body2) { // пояс / юбка
      p.ell(cx, hipY - 0.5 * s, 3.8 * s * bulk, 2 * s, R.body2, 0.5);
    }
    if (P.chest) P.chest(p, cx + hunch * 0.6, tcy, s, t, anim);
    // голова
    drawHead(p, P, headX, headY, headR, s, t, anim);
    if (R.pauldron) {
      p.ell(shFX - 0.4 * s, shY + 0.6 * s, 2.6 * s, 2 * s, R.pauldron, 0.6);
      p.ell(shBX + 0.2 * s, shY + 0.4 * s, 2.2 * s, 1.8 * s, darker(R.pauldron, 1), 0.45);
    }
    // передняя рука + оружие
    let fa = P.armsForward ? 1.35 - walk * 0.15 : armF;
    let wa = null;
    if (atk >= 0) {
      if (P.weapon === 'bow' || P.weapon === 'staff' || P.cast) {
        fa = 1.2 + Math.sin(atk * Math.PI) * 0.4;
      } else {
        const k = atk < 0.35 ? atk / 0.35 : 1;
        fa = atk < 0.35 ? 0.3 - k * 2.9 : -2.6 + Math.min(1, (atk - 0.35) / 0.3) * 4.3;
        wa = fa;
      }
    }
    const hx = shFX + Math.sin(fa) * armL, hy = shY + 1 * s + Math.cos(fa) * armL;
    const drawArm = () => {
      p.limb(shFX, shY + 1 * s, hx, hy, 1.5 * s, 1.3 * s, R.arm, 0.58);
      p.ell(hx, hy, 1.4 * s, 1.4 * s, R.hand, 0.6);
    };
    if (P.weapon) drawWeapon(p, P, hx, hy, wa ?? fa, s, t, anim, atk, drawArm);
    else drawArm();
  }, P.counts || { idle: 4, walk: 6, atk: 4 }, P.opt || {});
}

function drawHead(p, P, x, y, r, s, t, anim) {
  const R = P.R, kind = P.head;
  if (kind === 'helm') {
    p.ell(x, y, r * 1.05, r, R.helm, 0.6);
    p.rect(Math.round(x), Math.round(y - 0.2 * s), Math.round(r * 1.1), Math.max(1, Math.round(1 * s)), col('#140c18'));
    p.set(x + r * 0.55, y, P.eye); p.set(x + r * 0.55 + 1, y, P.eye);
    if (R.plume) {
      const sway = anim === 'walk' ? Math.sin(t * TAU) : 0;
      p.limb(x - 0.5 * s, y - r, x - 4 * s - sway, y - r - 3 * s, 1.4 * s, 0.8 * s, R.plume, 0.6);
    }
    if (P.horns) {
      p.limb(x - r * 0.4, y - r * 0.6, x - r * 0.9, y - r * 1.9, 1.1 * s, 0.4 * s, P.horns, 0.7);
      p.limb(x + r * 0.5, y - r * 0.6, x + r * 1.1, y - r * 1.8, 1.1 * s, 0.4 * s, P.horns, 0.7);
    }
  } else if (kind === 'hood') {
    p.ell(x - 0.4 * s, y - 0.3 * s, r * 1.2, r * 1.15, R.hood, 0.55);
    p.ell(x + r * 0.45, y + 0.5 * s, r * 0.6, r * 0.65, R.face, 0.35);
    p.set(x + r * 0.6, y + 0.2 * s, P.eye);
    p.set(x + r * 0.6 + 1, y + 0.2 * s, mix(P.eye, R.face[1], 0.4));
    p.poly([[x - r, y - r * 0.6], [x - r * 1.9, y + r * 1.4], [x - r * 0.4, y + r * 0.8]], R.hood, 0.45, 0.2);
  } else if (kind === 'hair') {
    p.ell(x, y, r * 0.95, r, R.face, 0.6);
    p.set(x + r * 0.5, y + 0.2 * s, P.eye);
    // волосы: сзади и сверху; пламенные — мерцают
    const fl = P.fireHair;
    const n = fl ? 7 : 4;
    for (let i = 0; i < n; i++) {
      const a = -2.6 + i * (2.2 / n);
      const flick = fl ? Math.sin(t * TAU * 2 + i * 1.7) * 1.2 * s : 0;
      const len = (fl ? 4.5 : 3) * s + (i % 2) * s + flick;
      const bx = x + Math.cos(a) * r * 0.6, by = y + Math.sin(a) * r * 0.6;
      p.limb(bx, by, bx - 2 * s - len * 0.6, by - len * 0.7, 1.5 * s, 0.4 * s, R.hair, 0.65, 0.8);
    }
    p.ell(x - 0.8 * s, y - r * 0.45, r * 0.95, r * 0.6, R.hair, 0.62);
    p.limb(x - r * 0.5, y, x - r * 1.0, y + r * 1.6, 1.4 * s, 0.6 * s, R.hair, 0.5);
  } else if (kind === 'skull') {
    p.ell(x, y, r, r * 0.95, R.bone, 0.62);
    p.rect(Math.round(x - r * 0.3), Math.round(y + r * 0.45), Math.round(r * 1.1), Math.max(1, Math.round(1.2 * s)), darker(R.bone, 2)[1]);
    p.set(x + r * 0.15, y, col('#140a14')); p.set(x + r * 0.65, y, col('#140a14'));
    p.set(x + r * 0.15, y - 1, P.eye); p.set(x + r * 0.65, y - 1, P.eye);
    if (P.crown) {
      for (let i = -1; i <= 1; i++) p.limb(x + i * r * 0.55, y - r * 0.8, x + i * r * 0.7, y - r * 1.8, 0.9 * s, 0.4 * s, P.crown, 0.8);
    }
  } else if (kind === 'zombie') {
    p.ell(x, y, r * 1.05, r * 0.95, R.face, 0.5);
    p.set(x + r * 0.2, y - 0.3 * s, P.eye); p.set(x + r * 0.7, y - 0.3 * s, P.eye);
    p.rect(Math.round(x + r * 0.1), Math.round(y + r * 0.45), Math.round(r * 0.8), 1, col('#200c10'));
    if (R.hair) p.ell(x - r * 0.4, y - r * 0.55, r * 0.8, r * 0.45, R.hair, 0.4);
  }
}

function drawWeapon(p, P, hx, hy, a, s, t, anim, atk, drawArm) {
  const R = P.R;
  if (P.weapon === 'sword' || P.weapon === 'cleaver' || P.weapon === 'icesword') {
    const L = (P.weapon === 'cleaver' ? 9 : 12) * s;
    const dx = Math.sin(a), dy = Math.cos(a);
    // острие продолжает руку
    const tx = hx + dx * L, ty = hy + dy * L;
    drawArm();
    p.limb(hx + dx * 1.5 * s, hy + dy * 1.5 * s, tx, ty, (P.weapon === 'cleaver' ? 2.2 : 1.2) * s, (P.weapon === 'cleaver' ? 2.4 : 0.6) * s, R.blade, 0.72, 0.5);
    if (P.bladeGlow) p.line(hx + dx * 3 * s, hy + dy * 3 * s, tx - dx * s, ty - dy * s, P.bladeGlow);
    p.limb(hx - dy * 2.2 * s, hy + dx * 2.2 * s, hx + dy * 2.2 * s, hy - dx * 2.2 * s, 0.8 * s, 0.8 * s, R.guard, 0.7);
  } else if (P.weapon === 'staff') {
    drawArm();
    const top = hy - 13 * s;
    p.limb(hx, hy + 5 * s, hx + 0.5 * s, top, 0.9 * s, 0.9 * s, R.staff, 0.6);
    const fl = atk >= 0 ? 1 + Math.sin(atk * Math.PI) * 0.6 : 1;
    p.ell(hx + 0.5 * s, top - 1.5 * s, 2.4 * s * fl, 2.4 * s * fl, R.orb, 0.75, 0.6, 0.2);
    p.set(hx - 0.3 * s, top - 2.4 * s, col('#ffffff'));
  } else if (P.weapon === 'bow') {
    const draw = atk >= 0 ? Math.sin(atk * Math.PI) : 0;
    const bx = hx + 1 * s;
    const top = [bx - 1 * s, hy - 7 * s], bot = [bx - 1 * s, hy + 7 * s];
    for (let i = 0; i <= 14; i++) {
      const k = i / 14, yy = hy - 7 * s + k * 14 * s;
      const xx = bx + Math.sin(k * Math.PI) * 3 * s;
      p.ell(xx, yy, 0.9 * s, 0.9 * s, R.bow, 0.6, 0.5, 0.1);
    }
    const sx = bx - 1 * s - draw * 4 * s;
    p.line(top[0], top[1], sx, hy, R.string); p.line(sx, hy, bot[0], bot[1], R.string);
    if (draw > 0.2) p.line(sx, hy, bx + 5 * s, hy, P.arrowCol || col('#e8f4ff'));
    drawArm();
  } else if (P.weapon === 'claws') {
    drawArm();
    for (let i = -1; i <= 1; i++) p.line(hx, hy, hx + 3 * s, hy + i * 1.5 * s + 2 * s, R.claw);
  } else drawArm();
}

// ───────────────────────── Другие тела ─────────────────────────
function quadruped(P) {
  const s = P.scale || 1, W = Math.ceil(34 * s), H = Math.ceil(26 * s);
  return buildSet(W, H, (p, anim, t) => {
    const fy = H - 3, cx = W / 2, R = P.R;
    const w = anim === 'walk' ? Math.sin(t * TAU) : 0;
    const bob = anim === 'walk' ? -Math.abs(Math.cos(t * TAU)) * s : anim === 'idle' && t > 0.5 ? -0.5 : 0;
    const lunge = anim === 'atk' ? Math.sin(t * Math.PI) * 3 * s : 0;
    const by = fy - 7 * s + bob;
    // хвост
    p.limb(cx - 6 * s, by - 1 * s, cx - 10 * s, by - 4 * s - w * s, 1.2 * s, 0.5 * s, R.body, 0.4);
    const legs = [[-4, 0.6, 1], [4, -0.6, 1], [-3, -0.6, 0], [5, 0.6, 0]];
    for (const [lx, ph, back] of legs) {
      const sw = w * ph * 2.5 * s;
      p.limb(cx + lx * s + lunge * 0.5, by + 1 * s, cx + lx * s + sw + lunge * 0.5, fy - 0.5, 1.4 * s, 1.0 * s, back ? darker(R.body, 1) : R.body, back ? 0.35 : 0.5);
    }
    p.ell(cx + lunge * 0.5, by - 1 * s, 7 * s, 3.6 * s, R.body, 0.55);
    if (R.spine) for (let i = -4; i <= 3; i += 2) p.limb(cx + i * s + lunge * 0.5, by - 4 * s, cx + (i - 1) * s + lunge * 0.5, by - 6.5 * s, 0.9 * s, 0.3 * s, R.spine, 0.7);
    const hx = cx + 7 * s + lunge, hy = by - 3 * s;
    p.ell(hx, hy, 3.6 * s, 2.8 * s, R.head || R.body, 0.6);
    p.ell(hx + 2.6 * s, hy + 1.2 * s, 2.2 * s, 1.5 * s, R.head || R.body, 0.5);
    p.set(hx + 1 * s, hy - 0.8 * s, P.eye); p.set(hx + 1 * s + 1, hy - 0.8 * s, P.eye);
    if (anim === 'atk') p.rect(Math.round(hx + 2 * s), Math.round(hy + 2 * s), Math.round(3 * s), 1, col('#2a0a10'));
    p.limb(hx - 1 * s, hy - 2 * s, hx - 2.5 * s, hy - 5 * s, 1 * s, 0.4 * s, R.head || R.body, 0.5);
  }, { idle: 2, walk: 6, atk: 3 }, P.opt || {});
}

function floater(P) {
  const s = P.scale || 1, W = Math.ceil((P.wide || 30) * s), H = Math.ceil((P.tall || 36) * s);
  return buildSet(W, H, (p, anim, t) => {
    const R = P.R, cx = W / 2;
    const hover = Math.sin(t * TAU) * 1.5 * s;
    const cy = H * 0.5 + hover - 2 * s;
    // хвост-шлейф
    for (let i = 0; i < 5; i++) {
      const k = i / 5;
      const wx = Math.sin(t * TAU + i) * 1.5 * s * k;
      p.ell(cx - k * 2 * s + wx, cy + 4 * s + k * 8 * s, (4.5 - k * 3.5) * s * (P.bulk || 1), 2.5 * s, R.tail || R.body, 0.45 - k * 0.15, 0.4);
    }
    if (P.wings) {
      const f = Math.sin(t * TAU * 2) * 2 * s;
      p.poly([[cx - 1 * s, cy - 2 * s], [cx - 10 * s, cy - 8 * s - f], [cx - 8 * s, cy + 1 * s - f * 0.3], [cx - 3 * s, cy + 2 * s]], darker(R.wing, 1), 0.5, 0.2);
      p.poly([[cx + 1 * s, cy - 2 * s], [cx + 9 * s, cy - 9 * s - f], [cx + 8 * s, cy - f * 0.3], [cx + 3 * s, cy + 2 * s]], R.wing, 0.65, 0.25);
    }
    p.ell(cx, cy, 4.5 * s * (P.bulk || 1), 5 * s, R.body, 0.55);
    const atk = anim === 'atk' ? Math.sin(t * Math.PI) : 0;
    // руки
    p.limb(cx + 3 * s, cy - 1 * s, cx + 6 * s + atk * 3 * s, cy + 2 * s - atk * 4 * s, 1.2 * s, 0.9 * s, R.arm || R.body, 0.55);
    p.limb(cx - 3 * s, cy - 1 * s, cx - 6 * s, cy + 3 * s, 1.1 * s, 0.8 * s, darker(R.arm || R.body, 1), 0.4);
    if (atk > 0 && P.castCol) p.ell(cx + 7 * s, cy - 3 * s, 1.6 * s + atk * 1.2 * s, 1.6 * s + atk * 1.2 * s, P.castCol, 0.8, 0.4, 0.2);
    const hy = cy - 6 * s;
    p.ell(cx + 0.5 * s, hy, 3.4 * s, 3.2 * s, R.head || R.body, 0.6);
    if (P.horns) {
      p.limb(cx - 1.5 * s, hy - 2 * s, cx - 3 * s, hy - 5.5 * s, 1 * s, 0.3 * s, P.horns, 0.7);
      p.limb(cx + 2 * s, hy - 2 * s, cx + 3.5 * s, hy - 5.5 * s, 1 * s, 0.3 * s, P.horns, 0.7);
    }
    if (P.hoodless === false) p.ell(cx - 0.5 * s, hy - 1 * s, 3.8 * s, 3.4 * s, R.hood, 0.5);
    p.set(cx + 1 * s, hy, P.eye); p.set(cx + 2.6 * s, hy, P.eye);
    if (s > 1.3) { p.set(cx + 1 * s + 1, hy, P.eye); p.set(cx + 2.6 * s + 1, hy, P.eye); }
  }, { idle: 4, walk: 4, atk: 3 }, P.opt || {});
}

function blob(P) {
  const s = P.scale || 1, W = Math.ceil(26 * s), H = Math.ceil(24 * s);
  return buildSet(W, H, (p, anim, t) => {
    const R = P.R, cx = W / 2, fy = H - 3;
    const sq = anim === 'walk' ? Math.sin(t * TAU) * 0.18 : anim === 'atk' ? -0.25 * Math.sin(t * Math.PI) : Math.sin(t * TAU) * 0.05;
    const rx = 6 * s * (1 + sq), ry = 5.5 * s * (1 - sq);
    p.ell(cx, fy - ry, rx, ry, R.body, 0.55);
    // трещины-свечение
    const g = P.glow;
    p.line(cx - rx * 0.5, fy - ry * 1.2, cx, fy - ry * 0.8, g);
    p.line(cx, fy - ry * 0.8, cx + rx * 0.4, fy - ry * 1.4, g);
    p.line(cx, fy - ry * 0.8, cx + rx * 0.1, fy - ry * 0.2, g);
    p.ell(cx + rx * 0.35, fy - ry * 1.2, 1.4 * s, 1.2 * s, R.core, 0.9, 0.3, 0.1);
    p.set(cx + rx * 0.2, fy - ry * 1.3, P.eye); p.set(cx + rx * 0.55, fy - ry * 1.3, P.eye);
  }, { idle: 4, walk: 6, atk: 4 }, P.opt || {});
}

function golem(P) {
  const s = P.scale || 1, W = Math.ceil(40 * s), H = Math.ceil(42 * s);
  return buildSet(W, H, (p, anim, t) => {
    const R = P.R, cx = W / 2, fy = H - 3;
    const w = anim === 'walk' ? Math.sin(t * TAU) : 0;
    const bob = anim === 'walk' ? -Math.abs(w) * s : 0;
    const atk = anim === 'atk' ? t : -1;
    // ноги
    p.limb(cx - 3.5 * s, fy - 8 * s, cx - 4 * s - w * 2 * s, fy - 1, 2.8 * s, 2.4 * s, darker(R.body, 1), 0.4);
    p.limb(cx + 3.5 * s, fy - 8 * s, cx + 4 * s + w * 2 * s, fy - 1, 2.9 * s, 2.5 * s, R.body, 0.55);
    const ty = fy - 17 * s + bob;
    // задняя рука
    p.limb(cx - 7 * s, ty - 3 * s, cx - 9 * s, ty + 6 * s + w * s, 2.6 * s, 3 * s, darker(R.body, 1), 0.4);
    p.ell(cx, ty, 8.5 * s, 8 * s, R.body, 0.55, 0.6);
    p.ell(cx - 2 * s, ty - 4 * s, 5 * s, 4 * s, R.body, 0.65, 0.5);
    // трещины
    const g = P.glow;
    p.line(cx - 4 * s, ty - 2 * s, cx + 1 * s, ty + 1 * s, g);
    p.line(cx + 1 * s, ty + 1 * s, cx + 4 * s, ty - 3 * s, g);
    p.line(cx + 1 * s, ty + 1 * s, cx, ty + 6 * s, g);
    p.ell(cx + 1 * s, ty + 0.5 * s, 1.6 * s, 1.6 * s, R.core, 0.9, 0.3, 0.1);
    // голова
    p.ell(cx + 2 * s, ty - 9 * s, 3.5 * s, 3 * s, R.body, 0.6);
    p.set(cx + 3 * s, ty - 9.5 * s, P.eye); p.set(cx + 4.6 * s, ty - 9.5 * s, P.eye);
    if (s > 1.4) { p.set(cx + 3 * s + 1, ty - 9.5 * s, P.eye); p.set(cx + 4.6 * s + 1, ty - 9.5 * s, P.eye); }
    // передняя рука — удар кулаком
    let a = 0.4 + w * 0.3;
    if (atk >= 0) a = atk < 0.5 ? 0.4 - atk * 5 : -2.1 + (atk - 0.5) * 6;
    const hx = cx + 7 * s + Math.sin(a) * 9 * s, hy = ty - 3 * s + Math.cos(a) * 9 * s;
    p.limb(cx + 7 * s, ty - 3 * s, hx, hy, 2.8 * s, 3.2 * s, R.body, 0.6);
    p.ell(hx, hy, 3.4 * s, 3 * s, R.body, 0.62);
    if (P.spikes) for (let i = 0; i < 3; i++) p.limb(cx - 5 * s + i * 4 * s, ty - 7 * s, cx - 6 * s + i * 4 * s, ty - 12 * s, 1.4 * s, 0.4 * s, P.spikes, 0.7);
  }, { idle: 2, walk: 6, atk: 4 }, P.opt || {});
}

function abyssEye(P) {
  const s = P.scale || 1, W = Math.ceil(60 * s), H = Math.ceil(60 * s);
  return buildSet(W, H, (p, anim, t) => {
    const R = P.R, cx = W / 2, cy = H * 0.42 + Math.sin(t * TAU) * 2 * s;
    for (let i = 0; i < 7; i++) {
      const a0 = Math.PI * 0.15 + i * (Math.PI * 0.7 / 6);
      let px = cx + Math.cos(a0) * 8 * s, py = cy + Math.sin(a0) * 8 * s;
      for (let k = 0; k < 5; k++) {
        const a = a0 + Math.sin(t * TAU + i + k * 0.8) * 0.35;
        const nx = px + Math.cos(a) * 4 * s, ny = py + Math.sin(a) * 4 * s;
        p.limb(px, py, nx, ny, (2.2 - k * 0.35) * s, (1.9 - k * 0.35) * s, i % 2 ? darker(R.tent, 1) : R.tent, 0.5);
        px = nx; py = ny;
      }
    }
    p.ell(cx, cy, 13 * s, 12 * s, R.body, 0.55, 0.6);
    const open = anim === 'atk' ? 1 : 0.75;
    p.ell(cx + 2 * s, cy - 1 * s, 7.5 * s, 6 * s * open, R.white, 0.7, 0.4, 0.2);
    p.ell(cx + 3 * s, cy - 1 * s, 3.6 * s, 3.6 * s * open, R.iris, 0.7, 0.5, 0.2);
    p.ell(cx + 3.4 * s, cy - 1 * s, 1.4 * s, 2.4 * s * open, [col('#05020a')], 0.5);
    p.set(cx + 1.8 * s, cy - 2.6 * s, col('#ffffff'));
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI * 0.9 + i * 0.4;
      p.limb(cx + Math.cos(a) * 11 * s, cy + Math.sin(a) * 11 * s, cx + Math.cos(a) * 17 * s, cy + Math.sin(a) * 17 * s, 1.6 * s, 0.4 * s, P.spikes, 0.7);
    }
  }, { idle: 4, walk: 4, atk: 3 }, P.opt || {});
}

// ───────────────────────── Каталог ─────────────────────────
const C = {};
export const SPR = C;

export function buildAllSprites() {
  const eyeV = col('#d6b4ff'), eyeY = col('#ffe066'), eyeR = col('#ff5040'), eyeC = col('#8ff8ff');
  // ГЕРОИ
  C.warrior = humanoid({
    head: 'helm', eye: col('#ffb24a'), weapon: 'sword', bulk: 1.15,
    bladeGlow: col('#ffd08a'), horns: ramp('#e8dcc0', 4),
    R: {
      helm: ramp('#6c7390'), plume: ramp('#c8332e'), body: ramp('#4a4f68'), body2: ramp('#6e3a24'),
      leg: ramp('#3a3448'), boot: ramp('#3e2a22'), arm: ramp('#5a6080'), hand: ramp('#7a8098'),
      cape: ramp('#9a2a2a', 5, 0.5), pauldron: ramp('#8a92ae'), blade: ramp('#c8d4e8'), guard: ramp('#d6a548'),
    },
    chest: (p, x, y, s) => { p.line(x - 1, y - 2, x + 1, y + 1, col('#ff9a3c')); p.set(x + 1, y - 1, col('#ffd070')); },
    opt: { rimColor: col('#ffcf9a'), rimT: 0.45 },
  });
  C.mage = humanoid({
    head: 'hair', fireHair: true, eye: col('#ffffff'), weapon: 'staff', cast: true, torsoK: 1.1,
    R: {
      face: ramp('#e8b896'), hair: ramp('#ff7a2a', 5, 0.55, 0.6), body: ramp('#3b2a5e'), body2: ramp('#2a8a7a'),
      leg: ramp('#2a2040'), boot: ramp('#2a1a2a'), arm: ramp('#46306e'), hand: ramp('#e8b896'),
      cape: ramp('#1f6a68', 5, 0.5), staff: ramp('#6a4a2e'), orb: ramp('#ffb040', 5, 0.6),
    },
    chest: (p, x, y, s) => { p.line(x - 2, y + 2, x + 2, y - 3, col('#4af0cc')); },
    opt: { rimColor: col('#ffc890'), rimT: 0.45 },
  });
  C.hunter = humanoid({
    head: 'hood', eye: col('#bff4ff'), weapon: 'bow', arrowCol: col('#d8f4ff'),
    R: {
      hood: ramp('#2c7a6a'), face: ramp('#c89a80'), body: ramp('#24564e'), body2: ramp('#6a4a30'),
      leg: ramp('#2a3438'), boot: ramp('#4a3424'), arm: ramp('#2c6a5e'), hand: ramp('#c89a80'),
      cape: ramp('#1a3e3a', 5, 0.45), bow: ramp('#8a5a32'), string: col('#e8e0c8'),
    },
    opt: { rimColor: col('#c8fff0'), rimT: 0.45 },
  });

  // СКЛЕП
  C.ghoul = humanoid({
    head: 'zombie', eye: eyeY, hunch: 1.6, armsForward: true, wide: 32, tall: 34,
    R: { face: ramp('#6d8070'), hair: ramp('#3a3a2a'), body: ramp('#4e5a44'), body2: ramp('#5a4030'), leg: ramp('#46503e'), boot: ramp('#3a3028'), arm: ramp('#6a7a64'), hand: ramp('#7a8c70') },
    opt: { rimColor: col('#d8ffb0'), rimT: 0.35 },
  });
  C.skelArcher = humanoid({
    head: 'skull', eye: eyeV, weapon: 'bow', wide: 32, tall: 36, bulk: 0.8,
    R: { bone: ramp('#e4d8ba'), body: ramp('#b8ab8c'), body2: ramp('#5a3a2c'), leg: ramp('#c8bc9c'), boot: ramp('#8a7c60'), arm: ramp('#d4c8a8'), hand: ramp('#e4d8ba'), bow: ramp('#5a4a3a'), string: col('#c8c0a8') },
    opt: { rimColor: col('#ffe2b8'), rimT: 0.4 },
  });
  C.skelWarrior = humanoid({
    head: 'skull', eye: eyeV, weapon: 'sword', wide: 34, tall: 36, bulk: 0.9,
    R: { bone: ramp('#e4d8ba'), body: ramp('#8a5a3c'), body2: ramp('#5a3a2c'), leg: ramp('#c8bc9c'), boot: ramp('#6a5a48'), arm: ramp('#d4c8a8'), hand: ramp('#e4d8ba'), blade: ramp('#9a8a7a'), guard: ramp('#6a4a2a') },
    opt: { rimColor: col('#ffe2b8'), rimT: 0.4 },
  });
  C.hound = quadruped({ eye: eyeR, R: { body: ramp('#5a5048'), head: ramp('#6a5a50'), spine: ramp('#e4d8ba', 4) }, opt: { rimColor: col('#ffd0b0'), rimT: 0.35 } });
  C.brute = humanoid({
    head: 'zombie', eye: eyeR, hunch: 1.2, weapon: 'cleaver', scale: 1.55, bulk: 1.5, wide: 40, tall: 40,
    R: { face: ramp('#7a6a62'), body: ramp('#6a5a58'), body2: ramp('#4a2a22'), leg: ramp('#4a4040'), boot: ramp('#2e2420'), arm: ramp('#7a6c66'), hand: ramp('#8a7a72'), blade: ramp('#8a8a90'), guard: ramp('#4a3020') },
    opt: { rimColor: col('#ffc0a0'), rimT: 0.35 },
  });
  C.shepherd = humanoid({
    head: 'skull', eye: col('#9affd0'), crown: ramp('#d6a548', 4), weapon: 'staff', cast: true, scale: 2.2, bulk: 1.1, wide: 38, tall: 42,
    R: { bone: ramp('#e8dcc4'), body: ramp('#2c1f5c'), body2: ramp('#d6a548'), leg: ramp('#2c1f5c'), boot: ramp('#1a1430'), arm: ramp('#3a2a6a'), hand: ramp('#e4d8ba'), cape: ramp('#1c1440'), staff: ramp('#4a3a2a'), orb: ramp('#4af0cc', 5, 0.6) },
    opt: { rimColor: col('#c9aaff'), rimT: 0.5 },
  });

  // ГОРНИЛО
  C.imp = floater({ eye: col('#fff0a0'), wings: true, horns: ramp('#2a1a1a', 4), castCol: ramp('#ffb040'), scale: 0.9, R: { body: ramp('#b8382a'), head: ramp('#c8442e'), wing: ramp('#6a1a1a'), tail: ramp('#8a2a20'), arm: ramp('#b8382a') }, opt: { rimColor: col('#ffd090'), rimT: 0.45 } });
  C.magmaGolem = golem({ eye: col('#fff0a0'), glow: col('#ffb030'), R: { body: ramp('#4a3a36'), core: ramp('#ffd060', 4, 0.4) }, scale: 1.0, spikes: ramp('#2a2224', 4), opt: { rimColor: col('#ff9a50'), rimT: 0.4 } });
  C.cinder = blob({ eye: col('#fff8d0'), glow: col('#ffc040'), R: { body: ramp('#5a2a1a'), core: ramp('#fff080', 4, 0.3) }, opt: { rimColor: col('#ff8040'), rimT: 0.5 } });
  C.ashHound = quadruped({ eye: col('#ffe060'), R: { body: ramp('#3a2a26'), head: ramp('#4a322a'), spine: ramp('#ff8a3a', 4) }, opt: { rimColor: col('#ff9a50'), rimT: 0.45 } });
  C.crucible = golem({ eye: col('#ffffff'), glow: col('#ffd040'), R: { body: ramp('#3a2a2a'), core: ramp('#fff4a0', 4, 0.3) }, scale: 2.1, spikes: ramp('#ff9040', 4), opt: { rimColor: col('#ffb060'), rimT: 0.5 } });

  // БЕЗДНА
  C.wraith = floater({ eye: eyeC, R: { body: ramp('#3a6a8a'), head: ramp('#4a7a9a'), tail: ramp('#2a4a6a'), arm: ramp('#4a7a9a') }, castCol: ramp('#8ff8ff'), opt: { rimColor: col('#c8ffff'), rimT: 0.55 } });
  C.frostGuard = humanoid({
    head: 'helm', eye: eyeC, weapon: 'icesword', bulk: 1.2, scale: 1.15, bladeGlow: col('#d0ffff'),
    R: { helm: ramp('#7a9ab8'), body: ramp('#4a6a8a'), body2: ramp('#2a3a5a'), leg: ramp('#3a4a6a'), boot: ramp('#2a3048'), arm: ramp('#5a7a9a'), hand: ramp('#8aa8c8'), pauldron: ramp('#a8d0f0'), blade: ramp('#a8f0ff'), guard: ramp('#5a7aa8') },
    opt: { rimColor: col('#e0ffff'), rimT: 0.5 },
  });
  C.voidCaster = floater({ eye: col('#ff80ff'), hoodless: false, castCol: ramp('#b48cff'), R: { body: ramp('#2a1a4a'), head: ramp('#1a1030'), hood: ramp('#3a2066'), tail: ramp('#1a1030'), arm: ramp('#3a2a5a') }, opt: { rimColor: col('#c9a8ff'), rimT: 0.55 } });
  C.shade = quadruped({ eye: col('#ff80ff'), R: { body: ramp('#2a2040'), head: ramp('#3a2a55'), spine: ramp('#b48cff', 4) }, scale: 1.05, opt: { rimColor: col('#c9a8ff'), rimT: 0.5 } });
  C.abyss = abyssEye({ R: { body: ramp('#2a1640'), tent: ramp('#3a2060'), white: ramp('#e8d8f0', 4), iris: ramp('#ff50c0', 4, 0.5) }, spikes: ramp('#b48cff', 4), scale: 1.5, opt: { rimColor: col('#e0b0ff'), rimT: 0.5 } });

  // союзник: призрачный воин
  C.ghostWarrior = humanoid({
    head: 'helm', eye: col('#ffffff'), weapon: 'sword', bulk: 1.1, bladeGlow: col('#ffffff'),
    R: { helm: ramp('#7ad8ff'), body: ramp('#4aa8e0'), body2: ramp('#3a88c0'), leg: ramp('#3a88c0'), boot: ramp('#2a68a0'), arm: ramp('#5ab8f0'), hand: ramp('#8ae0ff'), pauldron: ramp('#a8f0ff'), blade: ramp('#e8ffff'), guard: ramp('#8ae0ff') },
    opt: { rimColor: col('#ffffff'), rimT: 0.5 },
  });
  return C;
}
