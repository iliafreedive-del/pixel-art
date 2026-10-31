// Звук синтезом WebAudio: без файлов. Короткие удары, взрывы, звон добычи и тихий гул подземелья.
let ac = null, master = null, muted = false, droneNode = null;
const last = {};

export function initAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.gain.value = muted ? 0 : 0.5; master.connect(ac.destination);
    drone();
  } catch (e) { ac = null; }
}
export function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.5; }
export function isMuted() { return muted; }

let noiseBuf = null;
function noise() {
  if (noiseBuf) return noiseBuf;
  noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

function env(g, t, a, d, v) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function burst({ f = 800, q = 1, d = 0.15, v = 0.3, type = 'lowpass', sweep = 0 }) {
  const t = ac.currentTime;
  const s = ac.createBufferSource(); s.buffer = noise();
  const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
  if (sweep) fl.frequency.exponentialRampToValueAtTime(Math.max(40, f * sweep), t + d);
  const g = ac.createGain(); env(g, t, 0.005, d, v);
  s.connect(fl); fl.connect(g); g.connect(master);
  s.start(t, Math.random() * 0.5); s.stop(t + d + 0.05);
}
function tone({ f = 440, f2 = 0, d = 0.12, v = 0.2, type = 'square' }) {
  const t = ac.currentTime;
  const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
  const g = ac.createGain(); env(g, t, 0.004, d, v);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + d + 0.05);
}

const SFX = {
  swing: () => burst({ f: 2400, q: 0.8, d: 0.09, v: 0.12, type: 'bandpass', sweep: 0.4 }),
  hit: () => { burst({ f: 900, q: 1, d: 0.07, v: 0.22 }); tone({ f: 140, f2: 60, d: 0.07, v: 0.12, type: 'triangle' }); },
  crit: () => { burst({ f: 1600, q: 2, d: 0.1, v: 0.25, type: 'bandpass' }); tone({ f: 880, f2: 440, d: 0.08, v: 0.08 }); },
  fire: () => burst({ f: 600, q: 0.7, d: 0.18, v: 0.16, sweep: 3 }),
  shoot: () => { tone({ f: 900, f2: 300, d: 0.07, v: 0.06, type: 'triangle' }); burst({ f: 3000, q: 3, d: 0.05, v: 0.06, type: 'bandpass' }); },
  boom: () => { burst({ f: 400, q: 0.5, d: 0.45, v: 0.5, sweep: 0.2 }); tone({ f: 90, f2: 30, d: 0.4, v: 0.3, type: 'sine' }); },
  zap: () => { tone({ f: 1800, f2: 200, d: 0.12, v: 0.08, type: 'sawtooth' }); burst({ f: 4000, q: 4, d: 0.08, v: 0.1, type: 'bandpass' }); },
  ice: () => { tone({ f: 2200, f2: 1200, d: 0.2, v: 0.07, type: 'sine' }); burst({ f: 5000, q: 6, d: 0.15, v: 0.08, type: 'bandpass' }); },
  gem: () => tone({ f: 1320 + Math.random() * 200, f2: 1800, d: 0.05, v: 0.04, type: 'sine' }),
  coin: () => { tone({ f: 1500, d: 0.05, v: 0.05, type: 'square' }); setTimeout(() => ac && tone({ f: 2000, d: 0.08, v: 0.05, type: 'square' }), 50); },
  heal: () => tone({ f: 500, f2: 900, d: 0.25, v: 0.08, type: 'sine' }),
  hurt: () => { burst({ f: 500, q: 1, d: 0.12, v: 0.3 }); tone({ f: 200, f2: 90, d: 0.12, v: 0.15, type: 'sawtooth' }); },
  die: () => burst({ f: 700, q: 0.8, d: 0.2, v: 0.15, sweep: 0.3 }),
  level: () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => ac && tone({ f, d: 0.22, v: 0.08, type: 'triangle' }), i * 90)); },
  portal: () => { tone({ f: 200, f2: 800, d: 0.6, v: 0.1, type: 'sine' }); burst({ f: 1200, q: 3, d: 0.6, v: 0.08, type: 'bandpass', sweep: 2 }); },
  leap: () => burst({ f: 1200, q: 1, d: 0.2, v: 0.1, type: 'bandpass', sweep: 0.3 }),
  ui: () => tone({ f: 660, d: 0.05, v: 0.06, type: 'triangle' }),
  boss: () => { tone({ f: 60, f2: 40, d: 1.2, v: 0.3, type: 'sawtooth' }); burst({ f: 200, q: 1, d: 1.2, v: 0.2 }); },
};

export function sfx(name, minGap = 0.03) {
  if (!ac || muted) return;
  const t = ac.currentTime;
  if (last[name] && t - last[name] < minGap) return;
  last[name] = t;
  try { SFX[name]?.(); } catch (e) { /* звук не критичен */ }
}

function drone() {
  const t = ac.currentTime;
  const g = ac.createGain(); g.gain.value = 0.05; g.connect(master);
  const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 300; fl.connect(g);
  [55, 82.4, 110.5].forEach((f, i) => {
    const o = ac.createOscillator(); o.type = i === 1 ? 'triangle' : 'sawtooth'; o.frequency.value = f;
    const og = ac.createGain(); og.gain.value = i === 0 ? 0.5 : 0.25;
    const lfo = ac.createOscillator(); lfo.frequency.value = 0.07 + i * 0.03;
    const lg = ac.createGain(); lg.gain.value = 0.2; lfo.connect(lg); lg.connect(og.gain); lfo.start(t);
    o.connect(og); og.connect(fl); o.start(t);
  });
  droneNode = g;
}
