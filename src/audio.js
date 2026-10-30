// Synthesised sound effects with the Web Audio API. No sound files needed.
let AC = null, master = null, noiseBuf = null;
let muted = false;
const rand = (a, b) => a + Math.random() * (b - a);

export function initAudio() {
  if (AC) { if (AC.state !== 'running') AC.resume(); return; }
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return;
  AC = new Ctor();
  master = AC.createGain();
  master.gain.value = muted ? 0 : 0.8;
  master.connect(AC.destination);
  noiseBuf = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
export function setMuted(m) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.8;
}
function envelope(g, t, vol, attack, dur) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}
function tone(o) {
  if (!AC) return;
  const t = AC.currentTime + (o.at || 0);
  const osc = AC.createOscillator();
  osc.type = o.type || 'sine';
  if (o.curve) osc.frequency.setValueCurveAtTime(new Float32Array(o.curve), t, o.dur);
  else {
    osc.frequency.setValueAtTime(o.f0, t);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
  }
  let node = osc;
  if (o.lp || o.bp) {
    const f = AC.createBiquadFilter();
    f.type = o.lp ? 'lowpass' : 'bandpass';
    f.frequency.value = o.lp || o.bp;
    if (o.q) f.Q.value = o.q;
    node.connect(f); node = f;
  }
  const g = AC.createGain();
  envelope(g, t, o.vol || 0.2, o.attack || 0.01, o.dur);
  node.connect(g); g.connect(master);
  if (o.vib) {
    const l = AC.createOscillator(), lg = AC.createGain();
    l.frequency.value = o.vib[0]; lg.gain.value = o.vib[1];
    l.connect(lg); lg.connect(osc.frequency);
    l.start(t); l.stop(t + o.dur + 0.05);
  }
  osc.start(t); osc.stop(t + o.dur + 0.05);
}
function noise(o) {
  if (!AC) return;
  const t = AC.currentTime + (o.at || 0);
  const src = AC.createBufferSource();
  src.buffer = noiseBuf; src.loop = true;
  const f = AC.createBiquadFilter();
  f.type = 'bandpass'; f.frequency.value = o.f; f.Q.value = o.q || 1;
  const g = AC.createGain();
  envelope(g, t, o.vol || 0.1, o.attack || 0.005, o.dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t, Math.random()); src.stop(t + o.dur + 0.05);
}
const sfx = {
  click() { tone({ f0: 330, f1: 520, dur: 0.08, vol: 0.1, type: 'triangle' }); },
  chuff(i) { noise({ f: 380 + 250 * i, q: 0.9, dur: 0.12, vol: 0.06 + 0.1 * i }); },
  whistle() {
    for (const f of [440, 523, 622]) {
      tone({ type: 'triangle', f0: f, dur: 0.35, vol: 0.08, attack: 0.04, vib: [6, 6] });
      tone({ type: 'triangle', curve: [f, f * 1.06, f * 0.9], dur: 0.9, vol: 0.08, attack: 0.05, vib: [6, 8], at: 0.42 });
    }
    tone({ curve: [300, 620, 520, 260], dur: 1.4, vol: 0.07, attack: 0.2, vib: [5, 14], at: 0.1 });
    noise({ f: 2500, q: 0.8, dur: 1.3, vol: 0.035, attack: 0.05 });
  },
  bong(v = 1) {
    for (const at of [0, 0.7]) {
      tone({ f0: 196, dur: 2.2, vol: 0.22 * v, at, attack: 0.005 });
      tone({ f0: 392 * 1.19, dur: 1.4, vol: 0.06 * v, at });
      tone({ f0: 196 * 2.76, dur: 0.9, vol: 0.05 * v, at });
    }
  },
  hop() { tone({ f0: 250, f1: 700, dur: 0.18, vol: 0.16 }); },
  pop() { tone({ f0: 500, f1: 1000, dur: 0.09, vol: 0.14 }); },
  whee() { tone({ f0: 900, f1: 260, dur: 0.4, vol: 0.14, vib: [12, 30] }); },
  giggle() { [0, 0.11, 0.22, 0.33].forEach((at, i) => tone({ type: 'square', f0: 620 - i * 40, f1: 520 - i * 40, dur: 0.07, vol: 0.05, lp: 1800, at })); },
  cackle() { [0, 0.1, 0.2, 0.3, 0.42, 0.54].forEach((at, i) => tone({ type: 'sawtooth', f0: 1100 - i * 70, f1: 800 - i * 60, dur: 0.08, vol: 0.06, lp: 2500, at })); },
  cheer() { [440, 523, 659, 880].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.35, vol: 0.13, at: i * 0.12, vib: [6, 4] })); },
  sparkle() { const f = rand(900, 1500); tone({ f0: f, f1: f * 0.7, dur: 0.15, vol: 0.05, vib: [20, 30] }); },
  boo() { tone({ curve: [220, 440, 380, 180], dur: 1.1, vol: 0.18, attack: 0.15, vib: [6, 12] }); },
  howl() { tone({ type: 'triangle', curve: [300, 560, 640, 600, 380], dur: 1.8, vol: 0.14, attack: 0.25, vib: [5, 10] }); },
  hoot() { [0, 0.42].forEach(at => tone({ f0: 400, f1: 350, dur: 0.34, vol: 0.18, attack: 0.05, at })); },
  meow() { tone({ type: 'sawtooth', curve: [480, 820, 760, 520], dur: 0.6, vol: 0.09, lp: 2200, attack: 0.05 }); },
  ribbit() { [0, 0.16].forEach(at => tone({ type: 'square', f0: 180, f1: 130, dur: 0.11, vol: 0.12, lp: 800, at, vib: [40, 30] })); },
  squeak() { [0, 0.08, 0.16, 0.24].forEach(at => tone({ f0: rand(3000, 3600), f1: 4200, dur: 0.05, vol: 0.05, at })); },
  creak() { tone({ type: 'sawtooth', f0: 70, f1: 120, dur: 0.9, vol: 0.12, lp: 900, attack: 0.1, vib: [28, 18] }); },
  bubble() { for (let i = 0; i < 7; i++) tone({ f0: rand(250, 450), f1: rand(700, 1100), dur: 0.08, vol: 0.09, at: i * 0.09 + Math.random() * 0.04 }); },
  splash() { noise({ f: 1200, q: 0.6, dur: 0.45, vol: 0.22 }); tone({ f0: 450, f1: 140, dur: 0.2, vol: 0.09 }); },
  rustle() { noise({ f: 3800, q: 0.5, dur: 0.45, vol: 0.1, attack: 0.05 }); },
  tick() { tone({ f0: 1800, dur: 0.03, vol: 0.06 }); },
  wind() { noise({ f: 500, q: 0.4, dur: 3.5, vol: 0.025, attack: 1.4 }); },
  zap() { tone({ type: 'sawtooth', curve: [90, 1400, 300, 1800, 120], dur: 0.5, vol: 0.08, lp: 4000 }); noise({ f: 4000, q: 0.7, dur: 0.4, vol: 0.12 }); },
  boing() { tone({ f0: 160, f1: 600, dur: 0.3, vol: 0.15, vib: [18, 40] }); },
};
export function play(name, ...args) { if (AC && !muted && sfx[name]) sfx[name](...args); }
