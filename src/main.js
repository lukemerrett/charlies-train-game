// Charlie's Spooky Train: the game. Three big buttons drive the train; click anything to see what it does.
import * as THREE from 'three';
import { basic, makeGlow, glowTexture, flatten } from './materials.js';
import * as MD from './models.js';
import { initAudio, play, setMuted } from './audio.js';
import { L, BOARD, tp, frame, mod, modDist, clamp } from './track.js';
import {
  buildWorld, redrawSigns, spotWorld, stationTarget, inTunnel, FACE_CAM,
  ENG_LEN, CAR_LEN, GAP, NCARS, MID, SPOT_OFF,
} from './world.js';
import { makeEngine, makeWagon, CAR_COLORS, SEAT_X, FLOOR_Y } from './train.js';

const MAXV = 20, ACC = 11, DEC = 16;
const SEATS = NCARS * 2;
const P_SCALE = 1.3, SEAT_SCALE = 1.1; // passengers are drawn big so little fingers can tap them
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// ---------------------------------------------------------------------------
// Renderer, scene, camera, lights
// ---------------------------------------------------------------------------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
const TOUCH = matchMedia('(pointer: coarse)').matches;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, TOUCH ? 1.75 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog('#1b0f2c', 330, 620);

const CAM_DIR = new THREE.Vector3(1, 1.25, 1).normalize();
const CAM_DIST = 360;
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 1200);
const cam = { target: new THREE.Vector3(), size: 80, mode: 'map', wantSize: 80, wantTarget: new THREE.Vector3() };

scene.add(new THREE.HemisphereLight('#8a7cff', '#1c2b1c', 1.25));
scene.add(new THREE.AmbientLight('#3a2a55', 0.5));
const moon = new THREE.DirectionalLight('#c9d4ff', 2.0);
moon.castShadow = true;
moon.shadow.mapSize.set(TOUCH ? 1024 : 2048, TOUCH ? 1024 : 2048);
moon.shadow.bias = -0.0006;
moon.shadow.normalBias = 0.05;
moon.shadow.camera.near = 1;
moon.shadow.camera.far = 600;
scene.add(moon, moon.target);
const MOON_OFF = new THREE.Vector3(30, 140, -110);

let cw = 1, ch = 1;
function resize() {
  cw = canvas.clientWidth || 1; ch = canvas.clientHeight || 1;
  renderer.setSize(cw, ch, false);
  if (cam.mode === 'map') cam.wantSize = mapSize();
  else cam.wantSize = followSize();
}
// follow view: about 46 units across the narrow side of the screen, so the train is always a good size
function followSize() { const a = cw / ch; return a >= 1 ? 46 : Math.min(46 / a, 110); }
function mapSize() {
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), CAM_DIR).normalize();
  const up = new THREE.Vector3().crossVectors(CAM_DIR, right).normalize();
  let r0 = Infinity, r1 = -Infinity, u0 = Infinity, u1 = -Infinity;
  for (const x of [BOARD.x0, BOARD.x1]) for (const z of [BOARD.z0, BOARD.z1]) for (const y of [-8, 12]) {
    const p = new THREE.Vector3(x, y, z);
    const a = p.dot(right), b = p.dot(up);
    r0 = Math.min(r0, a); r1 = Math.max(r1, a); u0 = Math.min(u0, b); u1 = Math.max(u1, b);
  }
  const c = right.clone().multiplyScalar((r0 + r1) / 2).add(up.clone().multiplyScalar((u0 + u1) / 2));
  // move the centre onto the ground plane along the view direction
  c.addScaledVector(CAM_DIR, -c.y / CAM_DIR.y);
  cam.mapTarget = c;
  return Math.max(u1 - u0, (r1 - r0) / (cw / ch)) * 1.02;
}
function applyCamera() {
  const a = cw / ch, h = cam.size / 2;
  camera.left = -h * a; camera.right = h * a; camera.top = h; camera.bottom = -h;
  camera.position.copy(cam.target).addScaledVector(CAM_DIR, CAM_DIST);
  camera.lookAt(cam.target);
  camera.updateProjectionMatrix();
  // shadows cover what's on screen
  const sc = moon.shadow.camera, ext = Math.min(cam.size * Math.max(1, a) * 0.75 + 10, 330);
  sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext;
  sc.updateProjectionMatrix();
  moon.target.position.copy(cam.target);
  moon.position.copy(cam.target).add(MOON_OFF);
}

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------
const S = {
  started: false, muted: false,
  s: 40 + MID, v: 0, mode: 'stopped', target: null,
  atStation: null, leftStation: null, leftAt: 0, approach: null, notified: null, readyToGo: false,
  time: 0, chuffAcc: 0, smokeAcc: 0, lastToot: -9,
  seats: new Array(SEATS).fill(null),
  seq: [], seqTimer: 0, nextBats: 5, nextWind: 8,
};

// ---------------------------------------------------------------------------
// Little helpers the world uses: clicks, tweens, speech bubbles, sparks
// ---------------------------------------------------------------------------
const proxies = [];
const proxyMat = new THREE.MeshBasicMaterial({ visible: false });
const proxyGeo = new THREE.SphereGeometry(1, 10, 8);
// make `obj` clickable with an invisible sphere of radius r at height y; r = 0 means click the object itself
function clickable(obj, r, y, fn, opts = {}) {
  let p;
  if (r === 0) { p = obj; p.userData.pr = opts.radius || 50; }
  else {
    p = new THREE.Mesh(proxyGeo, proxyMat);
    p.scale.setScalar(r); p.position.y = y;
    p.userData.proxy = true; p.userData.pr = r;
    obj.add(p);
  }
  p.userData.fn = fn;
  proxies.push(p);
  return p;
}
const tweens = [];
function tween(dur, fn, done) { tweens.push({ t0: S.time, dur, fn, done }); }
const now = () => S.time;

const bubbleLayer = document.getElementById('bubbles');
const bubbles = [];
const tmpV = new THREE.Vector3();
function say(what, text, life = 1.8) {
  const el = document.createElement('div');
  el.className = 'bubble';
  el.textContent = text;
  bubbleLayer.appendChild(el);
  let anchor;
  if (what.isObject3D) {
    if (what.userData.sayH == null) {
      const b = new THREE.Box3().setFromObject(what);
      what.userData.sayH = b.isEmpty() ? 2 : b.max.y - what.getWorldPosition(tmpV).y;
    }
    anchor = () => what.getWorldPosition(tmpV).add(new THREE.Vector3(0, what.userData.sayH + 0.8, 0));
  } else { const p = what.clone(); anchor = () => p; }
  bubbles.push({ el, anchor, t0: S.time, life });
}

// sparks: a pool of tiny glowing shapes
const sparkGeo = new THREE.OctahedronGeometry(0.28);
const sparks = [];
function burst(pos, n = 10, colors = ['#ff7b00', '#b05cff', '#7cff4f', '#ffd23f'], speed = 9) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(sparkGeo, basic(pick(colors)));
    m.position.copy(pos);
    const a = Math.random() * Math.PI * 2, e = rand(0.3, 1.2), sp = rand(speed * 0.4, speed);
    m.userData = { vx: Math.cos(a) * Math.cos(e) * sp, vy: Math.sin(e) * sp + 4, vz: Math.sin(a) * Math.cos(e) * sp, t0: S.time, life: rand(0.6, 1.1) };
    scene.add(m);
    sparks.push(m);
  }
}
function splash(pt, color = '#7fd4ff') { burst(pt.clone().setY(pt.y + 0.3), 14, [color, '#ffffff'], 6); }

// smoke puffs from the chimney
const smokeMat = (c) => new THREE.SpriteMaterial({ map: glowTexture(), color: c, transparent: true, depthWrite: false, opacity: 0.5 });
const smoke = [];
function spawnSmoke(pos, big) {
  const s = new THREE.Sprite(smokeMat(Math.random() < 0.3 ? '#9b6bd1' : '#b8b0c8'));
  s.position.copy(pos).add(new THREE.Vector3(rand(-0.3, 0.3), 0, rand(-0.3, 0.3)));
  s.userData = { vx: rand(-0.6, 0.6), vy: rand(3, 4.5) + (big ? 3 : 0), vz: rand(-0.6, 0.6), r: big ? 2.6 : 1.5, t0: S.time, life: big ? 2.4 : rand(1.6, 2.4) };
  scene.add(s);
  smoke.push(s);
}

// bats: a flock crossing the sky every so often, a few flying out of trees, and some circling the castle
const bats = [];
function makeFlyingBat(pos, vel, life) {
  const b = MD.makeBat();
  flatten(b, [b.userData.wingL, b.userData.wingR]);
  b.position.copy(pos);
  b.userData.vel = vel; b.userData.t0 = S.time; b.userData.life = life; b.userData.ph = Math.random() * 6;
  b.rotation.y = Math.atan2(vel.x, vel.z);
  scene.add(b);
  clickable(b, 2, 0, () => { play('squeak'); for (const o of bats) if (o.userData.vel) o.userData.vel.y += 8; });
  bats.push(b);
  return b;
}
function batsFrom(pos, n) {
  play('squeak');
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    makeFlyingBat(pos.clone(), new THREE.Vector3(Math.cos(a) * rand(5, 9), rand(3, 6), Math.sin(a) * rand(5, 9)), 3.5);
  }
}
function batRoost(center) {
  for (let i = 0; i < 4; i++) {
    const b = MD.makeBat();
    flatten(b, [b.userData.wingL, b.userData.wingR]);
    b.userData.roost = { c: center, r: rand(5, 9), sp: rand(0.8, 1.4) * (i % 2 ? 1 : -1), ph: i * 1.6, h: rand(-1.5, 1.5) };
    b.userData.ph = Math.random() * 6;
    scene.add(b);
    clickable(b, 2, 0, () => { play('squeak'); b.userData.roost.sp *= 2.5; setTimeout(() => { b.userData.roost.sp /= 2.5; }, 1500); });
    bats.push(b);
  }
}
function ghostlet(pos) {
  const g = flatten(MD.makePassenger('ghost'));
  g.scale.setScalar(0.6);
  g.position.copy(pos);
  g.rotation.y = FACE_CAM;
  scene.add(g);
  say(g, 'Boo!', 1.2);
  tween(1.6, (u) => { g.position.y = pos.y + u * 7; g.rotation.y = FACE_CAM + u * 6; g.scale.setScalar(0.6 * (1 - u * u)); }, () => scene.remove(g));
}

const api = { play, say, tween, burst, splash, clickable, now, bats: batsFrom, batRoost, ghostlet };

// ---------------------------------------------------------------------------
// Build the world and the train
// ---------------------------------------------------------------------------
const world = buildWorld(scene, api);
const { stations, anim } = world;

const engine = makeEngine();
const wagons = CAR_COLORS.map(makeWagon);
flatten(engine, [...engine.userData.wheels, ...engine.userData.rods, engine.userData.driver, engine.userData.light]);
for (const w of wagons) flatten(w, w.userData.wheels);
scene.add(engine, ...wagons);
clickable(engine, 5, 3.5, () => doWhistle());
wagons.forEach((w, i) => clickable(w, 4.4, 2.5, () => {
  play('giggle');
  for (const s of [i * 2, i * 2 + 1]) if (S.seats[s]) jump(S.seats[s]);
}));

// floating ghosts drifting about the board
const ghosts = [];
for (let i = 0; i < 6; i++) {
  const g = flatten(MD.makeFloatingGhost());
  const d = { cx: -150 + i * 62 + rand(-15, 15), cz: rand(-90, 100), R: rand(14, 26), sp: rand(0.12, 0.22) * (i % 2 ? 1 : -1), ph: rand(0, 6), gone: -9, spin: -9 };
  g.userData.ghost = d;
  scene.add(g);
  clickable(g, 3, 2.5, () => {
    if (S.time < d.gone) return;
    play('boo'); say(g, 'Boo!');
    d.spin = S.time;
    burst(g.position.clone().setY(g.position.y + 2), 12, ['#ffffff', '#d9ccff', '#b05cff']);
  });
  ghosts.push(g);
}

// shadows for everything solid
scene.traverse((o) => {
  if (o.isMesh && !o.userData.proxy && o.material && !o.material.transparent && o.material.visible !== false && !(o.material.isMeshBasicMaterial)) {
    o.castShadow = true; o.receiveShadow = true;
  }
});
function castShadows(obj) { obj.traverse((o) => { if (o.isMesh && !o.userData.proxy && !o.material.transparent && !o.material.isMeshBasicMaterial) o.castShadow = true; }); }

// ---------------------------------------------------------------------------
// Passengers
// ---------------------------------------------------------------------------
function newPassenger(st, spot, born = S.time - 9) {
  const obj = flatten(MD.makePassenger(pick(MD.PASSENGER_KINDS)));
  castShadows(obj);
  const p = { obj, jt: -9, ph: rand(0, 6), born, hidden: false, st: null, spot: -1, seat: -1, justArrived: false };
  clickable(obj, 1.8, 1.6, () => clickPassenger(p));
  if (st) putOnPlatform(p, st, spot);
  return p;
}
function putOnPlatform(p, st, spot) {
  p.st = st; p.spot = spot; p.seat = -1;
  scene.attach(p.obj);
  p.obj.position.copy(spotWorld(st, spot));
  p.obj.scale.setScalar(P_SCALE);
  p.obj.rotation.set(0, FACE_CAM, 0);
  st.people.push(p);
}
function putInSeat(p, s) {
  p.st = null; p.spot = -1; p.seat = s;
  S.seats[s] = p;
  const w = wagons[s >> 1];
  w.add(p.obj);
  p.obj.position.set(SEAT_X[s & 1], FLOOR_Y, 0);
  p.obj.scale.setScalar(SEAT_SCALE);
}
function jump(p) { p.jt = S.time; }
function clickPassenger(p) {
  if (p.hidden) return;
  if (p.st && S.atStation === p.st && S.mode === 'stopped' && freeSeat() >= 0) { boardPerson(p.st, p); return; }
  if (p.seat >= 0 && S.atStation && S.mode === 'stopped' && unloadSeat(S.atStation, p.seat)) return;
  jump(p); play('giggle');
}
for (const st of stations) {
  const spots = [0, 1, 2, 3, 4, 5].sort(() => Math.random() - 0.5);
  for (const spot of spots.slice(0, 2 + Math.floor(Math.random() * 2))) newPassenger(st, spot);
}

function freeSeat() {
  const free = [];
  for (let s = 0; s < SEATS; s++) if (!S.seats[s]) free.push(s);
  return free.length ? pick(free) : -1;
}
function freeSpot(st) {
  const used = new Set(st.people.map(q => q.spot));
  const free = [0, 1, 2, 3, 4, 5].filter(s => !used.has(s));
  return free.length ? pick(free) : -1;
}
const hoppers = [];
function hop(p, from, toFn, done) {
  p.hidden = true;
  scene.attach(p.obj);
  hoppers.push({ p, from: from.clone(), toFn, t0: S.time, dur: 0.7, done });
}
function seatWorldPos(s) { return wagons[s >> 1].localToWorld(new THREE.Vector3(SEAT_X[s & 1], FLOOR_Y, 0)); }
function boardPerson(st, p) {
  const s = freeSeat();
  if (s < 0) return false;
  st.people.splice(st.people.indexOf(p), 1);
  S.seats[s] = p;
  play('hop');
  hop(p, p.obj.position, () => seatWorldPos(s), () => {
    putInSeat(p, s);
    p.hidden = false; jump(p); play('pop');
    burst(seatWorldPos(s).setY(4), 8);
  });
  return true;
}
function unloadSeat(st, s) {
  const spot = freeSpot(st);
  const p = S.seats[s];
  if (spot < 0 || !p || p.hidden) return false;
  S.seats[s] = null;
  const from = seatWorldPos(s);
  p.st = st; p.spot = spot; p.seat = -1; p.justArrived = true;
  st.people.push(p);
  play('whee');
  hop(p, from, () => spotWorld(st, spot), () => {
    p.obj.position.copy(spotWorld(st, spot));
    p.obj.scale.setScalar(P_SCALE);
    p.obj.rotation.set(0, FACE_CAM, 0);
    p.hidden = false; jump(p);
    burst(spotWorld(st, spot).setY(3), 6);
  });
  return true;
}
function finishHoppers() {
  for (const h of hoppers.splice(0)) h.done();
  S.seq = [];
}

// ---------------------------------------------------------------------------
// Stations: arriving, the boarding sequence, leaving
// ---------------------------------------------------------------------------
function arriveStation(st) {
  S.atStation = st; S.mode = 'stopped'; S.v = 0; S.target = null; S.readyToGo = false;
  play('bong');
  st.jt = S.time;
  const onboard = S.seats.filter(Boolean).length;
  const waiting = st.people.filter(q => !q.justArrived);
  const free = SEATS - onboard, spots = 6 - st.people.length;
  let off = 0;
  if (onboard) off = Math.min(onboard, spots, Math.max(1, waiting.length - free, Math.floor(Math.random() * 3)));
  S.seq = [];
  for (let i = 0; i < off; i++) S.seq.push('off');
  for (const q of waiting) S.seq.push(q);
  S.seq.push('done');
  S.seqTimer = 1.0;
}
function runSeqStep(step) {
  const st = S.atStation;
  if (!st) return;
  if (step === 'off') {
    const filled = [];
    for (let s = 0; s < SEATS; s++) if (S.seats[s] && !S.seats[s].hidden) filled.push(s);
    if (filled.length) unloadSeat(st, pick(filled));
  } else if (step === 'done') {
    S.readyToGo = true;
    play('cheer');
    burst(wagons[1].position.clone().setY(6), 26, undefined, 12);
  } else if (st.people.includes(step)) {
    boardPerson(st, step);
  }
}
function departStation() {
  const st = S.atStation;
  finishHoppers();
  // everyone left on the platform wants a ride next time round, and newcomers keep it busy
  for (const q of st.people) q.justArrived = false;
  while (st.people.length < 2) {
    const spot = freeSpot(st);
    if (spot < 0) break;
    newPassenger(st, spot, S.time + 2);
  }
  S.atStation = null;
  S.leftStation = st; S.leftAt = S.s;
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------
function chimneyWorld() { return engine.localToWorld(engine.userData.chimneyTop.clone()); }
function doWhistle() {
  if (S.time - S.lastToot < 0.6) return;
  S.lastToot = S.time;
  play('whistle');
  if (!inTunnel(S.s + 2)) for (let i = 0; i < 7; i++) spawnSmoke(chimneyWorld(), true);
  say(engine, 'Whoo-oooo!');
}
function pressGo() {
  if (S.mode === 'go') return;
  if (S.atStation) { departStation(); doWhistle(); }
  S.mode = 'go'; S.target = null; S.readyToGo = false;
}
function pressStop() {
  if (S.mode !== 'go') return;
  S.mode = 'stopping'; S.target = null;
  // glide into the next station if it's close enough; otherwise just stop
  let bestD = Infinity;
  for (const st of stations) {
    if (st === S.leftStation) continue; // not the one we just left
    const d = modDist(stationTarget(st), S.s);
    if (d > 0 && d < 72 && d < bestD) bestD = d;
  }
  if (bestD < Infinity) S.target = S.s + bestD;
}
function checkStationHere() {
  for (const st of stations) {
    if (Math.abs(modDist(stationTarget(st), S.s)) < 26) { arriveStation(st); return; }
  }
  S.mode = 'stopped';
}
function bindButton(id, fn) {
  const el = document.getElementById(id);
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    initAudio();
    play('click');
    el.classList.add('pressed');
    setTimeout(() => el.classList.remove('pressed'), 140);
    if (S.started) fn();
  });
  return el;
}
const goBtn = bindButton('goBtn', pressGo);
const stopBtn = bindButton('stopBtn', pressStop);
bindButton('tootBtn', doWhistle);

const muteBtn = document.getElementById('muteBtn');
muteBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault(); e.stopPropagation();
  S.muted = !S.muted;
  muteBtn.classList.toggle('off', S.muted);
  setMuted(S.muted);
});
function goFullscreen() {
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (req && !document.fullscreenElement && !document.webkitFullscreenElement) {
    try { const p = req.call(el); if (p && p.catch) p.catch(() => {}); } catch (_) { /* not allowed here */ }
  }
}
document.getElementById('fsBtn').addEventListener('pointerdown', (e) => {
  e.preventDefault(); e.stopPropagation();
  if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  else goFullscreen();
});
const mapBtn = document.getElementById('mapBtn');
function setCamMode(m) {
  cam.mode = m;
  cam.wantSize = m === 'map' ? mapSize() : followSize();
  mapBtn.classList.toggle('on', m === 'map');
}
mapBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault(); e.stopPropagation();
  initAudio(); play('whee');
  setCamMode(cam.mode === 'map' ? 'follow' : 'map');
});
window.addEventListener('resize', resize);
document.addEventListener('fullscreenchange', () => setTimeout(resize, 50));
window.addEventListener('contextmenu', (e) => e.preventDefault());

document.getElementById('play').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  initAudio();
  goFullscreen();
  document.getElementById('start').classList.add('hide');
  setTimeout(resize, 60);
  if (!S.started) { S.started = true; setCamMode('follow'); arriveStation(stations[0]); }
});

document.getElementById('moon').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  initAudio();
  if (!S.started) return;
  play('howl');
  const m = document.getElementById('moon');
  m.classList.remove('wolf'); void m.offsetWidth; m.classList.add('wolf');
});

// clicking the 3D scene
const raycaster = new THREE.Raycaster();
canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (!S.started) return;
  initAudio();
  const r = canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(proxies.filter(isShown), false);
  if (hits.length) {
    // the smallest thing under the finger wins, so a frog beats the pond it sits in
    hits.sort((a, b) => a.object.userData.pr - b.object.userData.pr);
    const h = hits[0];
    h.object.userData.fn(h.point);
    return;
  }
  const g = raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
  if (g) burst(g.setY(0.5), 5, undefined, 5);
  play('sparkle');
});
function isShown(o) {
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return o.parent != null || o === scene;
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------
const UPV = new THREE.Vector3(0, 1, 0);
function poseCar(obj, sCenter, len) {
  const a = tp(sCenter + len * 0.35), b = tp(sCenter - len * 0.35);
  obj.position.set((a.x + b.x) / 2, 0, (a.z + b.z) / 2);
  obj.rotation.y = Math.atan2(-(a.z - b.z), a.x - b.x);
}
const carS = (i) => S.s - (ENG_LEN / 2 + GAP + CAR_LEN / 2) - i * (CAR_LEN + GAP);

function update(dt) {
  S.time += dt;
  const t = S.time;

  if (S.mode === 'go') {
    S.v = Math.min(MAXV, S.v + ACC * dt);
  } else if (S.mode === 'stopping') {
    if (S.target != null) {
      const d = S.target - S.s;
      if (d <= 0.05) { S.v = 0; checkStationHere(); }
      else {
        const want = Math.max(2.2, Math.sqrt(2 * 15 * d));
        S.v = Math.min(MAXV, S.v + ACC * dt, Math.max(want, S.v - 45 * dt));
        if (S.v * dt > d) S.v = d / dt;
      }
    } else {
      S.v = Math.max(0, S.v - DEC * dt);
      if (S.v === 0) checkStationHere();
    }
  }
  S.s = S.s + S.v * dt;
  if (S.s > L * 4) { S.s -= L; S.leftAt -= L; if (S.target != null) S.target -= L; }

  // train pose, wheels and rods
  poseCar(engine, S.s, ENG_LEN);
  wagons.forEach((w, i) => poseCar(w, carS(i), CAR_LEN));
  const roll = S.s;
  for (const w of engine.userData.wheels) w.rotation.z = -roll / 1.05;
  const ang = -roll / 1.05;
  for (const r of engine.userData.rods) { r.position.y = engine.userData.rodY + Math.sin(ang) * 0.5; r.position.x = 0.3 + Math.cos(ang) * 0.5; }
  for (const w of wagons) for (const wh of w.userData.wheels) wh.rotation.z = -roll / 0.75;
  engine.userData.glow.material.opacity = 0.45 + Math.sin(t * 8) * 0.06;
  // the driver waves at stations
  engine.userData.driver.rotation.y = Math.PI / 2 + Math.sin(t * 1.3) * 0.5;

  // sounds and smoke
  if (S.v > 0.6) {
    S.chuffAcc += S.v * dt;
    if (S.chuffAcc > 5.5) { S.chuffAcc = 0; play('chuff', S.v / MAXV); }
  }
  if (!inTunnel(S.s + 2)) {
    S.smokeAcc += dt * (1.4 + 8 * S.v / MAXV);
    while (S.smokeAcc > 1) { S.smokeAcc -= 1; spawnSmoke(chimneyWorld(), false); }
  }
  for (let i = smoke.length - 1; i >= 0; i--) {
    const s = smoke[i], d = s.userData, u = (t - d.t0) / d.life;
    if (u >= 1) { scene.remove(s); s.material.dispose(); smoke.splice(i, 1); continue; }
    s.position.x += d.vx * dt; s.position.y += d.vy * dt; s.position.z += d.vz * dt;
    const sc = d.r * (1 + u * 2.2);
    s.scale.set(sc, sc, 1);
    s.material.opacity = 0.5 * (1 - u);
  }

  // approaching a station: bong the bell and get everyone excited
  S.approach = null;
  if (S.leftStation && S.s - S.leftAt > 40) S.leftStation = null;
  if (S.mode === 'go') {
    for (const st of stations) {
      if (st === S.leftStation) continue;
      const d = modDist(stationTarget(st), S.s);
      if (d > 0 && d < 65) {
        S.approach = st;
        if (S.notified !== st) { S.notified = st; play('bong', 0.45); st.jt = t; }
      }
    }
  }
  for (const st of stations) {
    const want = S.approach === st || (S.atStation === st && !S.readyToGo) ? 1 : 0;
    st.excite = (st.excite || 0) + (want - (st.excite || 0)) * Math.min(1, dt * 4);
  }

  if (S.atStation && S.seq.length) {
    S.seqTimer -= dt;
    if (S.seqTimer <= 0) { runSeqStep(S.seq.shift()); S.seqTimer = 0.6; }
  }
  for (let i = hoppers.length - 1; i >= 0; i--) {
    const h = hoppers[i], u = (t - h.t0) / h.dur;
    if (u >= 1) { hoppers.splice(i, 1); h.done(); continue; }
    const to = h.toFn();
    h.p.obj.position.lerpVectors(h.from, to, u);
    h.p.obj.position.y += Math.sin(u * Math.PI) * 5;
    h.p.obj.rotation.y = FACE_CAM + u * Math.PI * 2;
  }

  // passengers bob about; on the platform they jump when the train is coming
  for (const st of stations) {
    for (const p of st.people) {
      if (p.hidden) continue;
      const base = spotWorld(st, p.spot);
      const appear = clamp((t - p.born) / 0.5, 0, 1);
      p.obj.visible = appear > 0;
      p.obj.scale.setScalar(Math.max(0.001, appear) * P_SCALE);
      const excite = st.excite > 0.5 && !p.justArrived ? Math.abs(Math.sin(t * 7 + p.ph)) * 1.2 : 0;
      p.obj.position.y = base.y + excite + jumpY(p) + Math.max(0, Math.sin(t * 2.5 + p.ph)) * 0.15;
      p.obj.rotation.y = FACE_CAM + Math.sin(t * 1.1 + p.ph) * 0.25;
      if (appear > 0 && appear < 1 && !p.puffed) { p.puffed = true; play('pop'); burst(base.clone().setY(2), 10, ['#b05cff', '#d9ccff']); }
    }
  }
  for (let s = 0; s < SEATS; s++) {
    const p = S.seats[s];
    if (!p || p.hidden) continue;
    const w = wagons[s >> 1];
    const jig = S.v > 0.5 ? Math.abs(Math.sin(t * 9 + s * 1.7)) * 0.12 : 0;
    p.obj.position.y = FLOOR_Y + jig + jumpY(p);
    p.obj.rotation.y = FACE_CAM - w.rotation.y + Math.sin(t * 1.3 + p.ph) * 0.2;
  }

  // effects
  for (let i = sparks.length - 1; i >= 0; i--) {
    const m = sparks[i], d = m.userData, u = (t - d.t0) / d.life;
    if (u >= 1) { scene.remove(m); sparks.splice(i, 1); continue; }
    d.vy -= 18 * dt;
    m.position.x += d.vx * dt; m.position.y += d.vy * dt; m.position.z += d.vz * dt;
    m.rotation.x += dt * 6; m.rotation.y += dt * 5;
    m.scale.setScalar(1 - u * 0.8);
  }
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i], u = Math.min(1, (t - tw.t0) / tw.dur);
    tw.fn(u);
    if (u >= 1) { tweens.splice(i, 1); if (tw.done) tw.done(); }
  }
  for (const f of anim) f(t, dt);

  // floating ghosts
  for (const g of ghosts) {
    const d = g.userData.ghost, a = t * d.sp + d.ph;
    g.position.set(d.cx + Math.cos(a) * d.R, 7 + Math.sin(t * 1.7 + d.ph) * 0.8, d.cz + Math.sin(a) * d.R * 0.8);
    const u = (t - d.spin) / 0.8;
    if (u >= 0 && u < 1) { g.rotation.y = FACE_CAM + u * 12; g.scale.setScalar(1 - u); if (u > 0.95) d.gone = t + 3; }
    else if (t < d.gone) { g.visible = false; }
    else { g.visible = true; const k = clamp((t - d.gone) / 1, 0, 1); g.scale.setScalar(Math.max(0.01, k)); g.rotation.y = FACE_CAM + Math.sin(t + d.ph) * 0.3; }
  }

  // bats
  S.nextBats -= dt;
  if (S.nextBats <= 0) {
    S.nextBats = rand(10, 16);
    const right = new THREE.Vector3(1, 0, -1).normalize();
    const dir = Math.random() < 0.5 ? 1 : -1, half = cam.size * Math.max(1, cw / ch) * 0.6 + 10;
    const start = cam.target.clone().addScaledVector(right, -dir * half).add(new THREE.Vector3(rand(-15, 5), 16, rand(-15, 5)));
    for (let i = 0; i < 5; i++) {
      makeFlyingBat(start.clone().addScaledVector(right, -dir * i * 3).add(new THREE.Vector3(rand(-2, 2), rand(-2, 2), rand(-2, 2))),
        right.clone().multiplyScalar(dir * rand(13, 17)), half * 2 / 13 + 2);
    }
  }
  for (let i = bats.length - 1; i >= 0; i--) {
    const b = bats[i], d = b.userData;
    const flap = Math.sin(t * 18 + d.ph) * 0.8;
    d.wingL.rotation.z = flap; d.wingR.rotation.z = -flap;
    if (d.roost) {
      const r = d.roost, a = t * r.sp + r.ph;
      b.position.set(r.c.x + Math.cos(a) * r.r, r.c.y + r.h + Math.sin(t * 2 + r.ph) * 0.8, r.c.z + Math.sin(a) * r.r);
      b.rotation.y = Math.atan2(-Math.sin(a) * Math.sign(r.sp), Math.cos(a) * Math.sign(r.sp));
      continue;
    }
    if (t - d.t0 > d.life) {
      scene.remove(b); bats.splice(i, 1);
      const k = proxies.findIndex(p => p.parent === b);
      if (k >= 0) proxies.splice(k, 1);
      continue;
    }
    b.position.addScaledVector(d.vel, dt);
    b.position.y += Math.sin(t * 3 + d.ph) * 0.03;
  }

  S.nextWind -= dt;
  if (S.nextWind <= 0) { S.nextWind = rand(18, 30); play('wind'); }

  // buttons: GO glows when ready, STOP pulses when a station is coming up
  goBtn.classList.toggle('pulse', S.started && S.mode !== 'go' && (S.readyToGo || !S.atStation));
  stopBtn.classList.toggle('pulse', S.started && S.mode === 'go' && !!S.approach);
  goBtn.classList.toggle('on', S.mode === 'go');
  stopBtn.classList.toggle('on', S.mode !== 'go');

  // camera
  if (cam.mode === 'follow') {
    const look = tp(S.s - MID * 0.6 + 14 * S.v / MAXV); // lead the train a little so the camera doesn't trail behind
    cam.wantTarget.set(look.x, 0, look.z);
  } else {
    cam.wantTarget.copy(cam.mapTarget || cam.target);
  }
  const k = 1 - Math.exp(-dt * 2.5);
  cam.target.lerp(cam.wantTarget, k);
  cam.size += (cam.wantSize - cam.size) * k;
  // shadows only matter close up, and skipping them keeps the zoomed-out view smooth
  moon.castShadow = cam.size < 130;
  applyCamera();

  // speech bubbles follow what said them
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i], u = (t - b.t0) / b.life;
    if (u >= 1) { b.el.remove(); bubbles.splice(i, 1); continue; }
    const p = b.anchor().clone().project(camera);
    const x = (p.x + 1) / 2 * cw, y = (1 - p.y) / 2 * ch;
    const pop = Math.min(1, u * 8);
    b.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%) scale(${pop})`;
    b.el.style.opacity = u > 0.8 ? (1 - u) * 5 : 1;
  }
}
function jumpY(p) {
  const u = (S.time - p.jt) / 0.5;
  return u >= 0 && u < 1 ? Math.sin(u * Math.PI) * 1.6 : 0;
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
resize();
cam.size = cam.wantSize = mapSize();
cam.target.copy(cam.mapTarget);
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
document.fonts && document.fonts.load('40px Creepster').then(redrawSigns).catch(() => {});
document.body.classList.add('ready');

// handy for automated tests
window.__game = { scene, info: () => renderer.info.render, S, update, render: () => renderer.render(scene, camera), stations, pressGo, pressStop, doWhistle, setCamMode, cam, proxies, camera, wagons, engine };
