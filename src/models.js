// Procedural 3D models: passengers, station mascots and spooky scenery.
// Units: a passenger is about 3.2 tall. Y is up, characters face +Z, bases sit at y = 0.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mat, matU, basic, makeGlow, rng } from './materials.js';

// ============================================================
// Helpers
// ============================================================
const geoCache = new Map();
function geo(key, make) {
  let g = geoCache.get(key);
  if (!g) { g = make(); geoCache.set(key, g); }
  return g;
}
const UP = new THREE.Vector3(0, 1, 0);
const DS = THREE.DoubleSide;

const PUPIL = '#140a1c';
const BONE = '#efe8d4';

function mesh(g, m, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  return o;
}
// unit primitives, scaled per mesh
const sphereGeo = () => geo('sph', () => new THREE.SphereGeometry(1, 14, 10));
function sphere(m, r, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
  const o = mesh(sphereGeo(), m, x, y, z);
  o.scale.set(r * sx, r * sy, r * sz);
  return o;
}
// a cylinder from radius rBot at y to rTop at y + h
function cyl(m, rTop, rBot, h, x = 0, y = 0, z = 0, seg = 14) {
  const ratio = Math.round((rTop / rBot) * 100) / 100;
  const g = geo(`cyl${ratio}_${seg}`, () => new THREE.CylinderGeometry(ratio, 1, 1, seg).translate(0, 0.5, 0));
  const o = mesh(g, m, x, y, z);
  o.scale.set(rBot, h, rBot);
  return o;
}
function cone(m, r, h, x = 0, y = 0, z = 0, seg = 12) {
  const g = geo(`cone${seg}`, () => new THREE.ConeGeometry(1, 1, seg).translate(0, 0.5, 0));
  const o = mesh(g, m, x, y, z);
  o.scale.set(r, h, r);
  return o;
}
function rbox(m, w, h, d, r, x = 0, y = 0, z = 0) {
  const g = geo(`rb${w},${h},${d},${r}`, () => new RoundedBoxGeometry(w, h, d, 3, r));
  return mesh(g, m, x, y, z);
}
function box(m, w, h, d, x = 0, y = 0, z = 0) {
  const g = geo('box', () => new THREE.BoxGeometry(1, 1, 1));
  const o = mesh(g, m, x, y, z);
  o.scale.set(w, h, d);
  return o;
}
// a round-ended limb between two points
function limb(m, a, b, r, ends = true) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const d = new THREE.Vector3().subVectors(B, A);
  const len = d.length();
  const g = geo('limb', () => new THREE.CylinderGeometry(1, 1, 1, 10).translate(0, 0.5, 0));
  const o = mesh(g, m, A.x, A.y, A.z);
  o.scale.set(r, len, r);
  o.quaternion.setFromUnitVectors(UP, d.normalize());
  if (!ends) return o;
  const grp = new THREE.Group();
  grp.add(o, sphere(m, r, ...a), sphere(m, r, ...b));
  return grp;
}
// a smile: a thin arc, centred at (x, y, z), facing +Z
function smile(m, r, x, y, z, tube = 0.035, arc = Math.PI * 0.8) {
  const g = geo(`smile${r},${tube},${arc}`, () => new THREE.TorusGeometry(r, tube, 6, 14, arc));
  const o = mesh(g, m, x, y, z);
  o.rotation.z = Math.PI + (Math.PI - arc) / 2;
  return o;
}
// a cartoon eye looking down +Z
function eye(r, o = {}) {
  const g = new THREE.Group();
  const white = o.glow ? basic(o.glow) : mat('#fbf7ee', { roughness: 0.35 });
  g.add(sphere(white, r));
  const pr = r * (o.pupil ?? 0.55);
  const p = sphere(mat(o.pupilColor || PUPIL, { roughness: 0.2 }), pr, 0, -r * 0.04, r * 0.66, o.slit ? 0.35 : 1, 1, 0.6);
  g.add(p);
  if (!o.noShine) g.add(sphere(basic('#ffffff'), pr * 0.32, pr * 0.38, pr * 0.32, r * 0.66 + pr * 0.45));
  return g;
}
// sit a pair of eyes on the front of a head sphere (centre c, radius R)
function eyesOn(parent, c, R, dx, dy, r, o) {
  for (const sx of [-1, 1]) {
    const x = sx * dx, z = Math.sqrt(Math.max(0, R * R - x * x - dy * dy)) - r * 0.35;
    const e = eye(r, o);
    e.position.set(c[0] + x, c[1] + dy, c[2] + z);
    e.lookAt(c[0] + x * 1.4, c[1] + dy, c[2] + z + 4); // point the pupil outwards and forwards
    parent.add(e);
  }
}
// centre an object on the origin and scale it so its biggest side is `size`
function normalize(obj, size) {
  obj.updateMatrixWorld(true);
  const box3 = new THREE.Box3(), b = new THREE.Box3();
  obj.traverse((o) => {
    if (!o.isMesh) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    box3.union(b.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld));
  });
  const c = box3.getCenter(new THREE.Vector3()), s = box3.getSize(new THREE.Vector3());
  const k = size / Math.max(s.x, s.y, s.z);
  const out = new THREE.Group();
  obj.scale.multiplyScalar(k);
  obj.position.sub(c).multiplyScalar(k);
  out.add(obj);
  return out;
}

// ============================================================
// Witch hat
// ============================================================
export function makeWitchHat(o = {}) {
  const g = new THREE.Group();
  const hatMat = mat(o.color || '#2a1d3d', { roughness: 0.8 });
  g.add(cyl(hatMat, 1, 1, 0.08, 0, 0, 0, 24));
  const coneGeo = geo('hatcone', () => {
    const pts = [[0.56, 0], [0.5, 0.3], [0.38, 0.75], [0.25, 1.15], [0.13, 1.5], [0.05, 1.78], [0, 1.88]].map(([x, y]) => new THREE.Vector2(x, y));
    const c = new THREE.LatheGeometry(pts, 18);
    const p = c.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y > 0.7) p.setZ(i, p.getZ(i) - 0.42 * ((y - 0.7) / 1.18) ** 2); // the tip flops back
    }
    c.computeVertexNormals();
    return c;
  });
  g.add(mesh(coneGeo, hatMat, 0, 0.06, 0));
  const bandMat = o.bandGlow ? mat(o.band || '#ff7b00', { emissive: o.band || '#ff7b00', ei: 0.7 }) : mat(o.band || '#ff7b00');
  g.add(cyl(bandMat, 0.5, 0.56, 0.24, 0, 0.06, 0, 18));
  const buckle = box(mat('#ffd23f', { emissive: '#b88a00', ei: 0.6, roughness: 0.4 }), 0.24, 0.2, 0.06, 0, 0.18, 0.55);
  buckle.rotation.x = -0.12;
  g.add(buckle);
  return g;
}

// ============================================================
// Pumpkins
// ============================================================
let pumpkinTex = null;
function pumpkinTextures() {
  if (pumpkinTex) return pumpkinTex;
  const W = 512, H = 256;
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const colC = mk(), emC = mk();
  const col = colC.getContext('2d'), em = emC.getContext('2d');
  // base colour with darker grooves between the ribs
  const grad = col.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#c9520a'); grad.addColorStop(0.5, '#ff7a12'); grad.addColorStop(1, '#b84a08');
  col.fillStyle = grad; col.fillRect(0, 0, W, H);
  for (let k = 0; k < 8; k++) {
    const x = W * (0.25 + 1 / 16 + k / 8);
    const g2 = col.createLinearGradient(x - 14, 0, x + 14, 0);
    g2.addColorStop(0, 'rgba(110,35,0,0)'); g2.addColorStop(0.5, 'rgba(110,35,0,0.55)'); g2.addColorStop(1, 'rgba(110,35,0,0)');
    col.fillStyle = g2; col.fillRect(x - 14, 0, 28, H);
  }
  em.fillStyle = '#000'; em.fillRect(0, 0, W, H);
  // the carved face, centred on the front (u = 0.25)
  const cx = W * 0.25;
  const face = (ctx, fill) => {
    ctx.fillStyle = fill;
    for (const s of [-1, 1]) { // triangle eyes
      ctx.beginPath();
      ctx.moveTo(cx + s * 44 - 24, 112); ctx.lineTo(cx + s * 44 + 24, 112); ctx.lineTo(cx + s * 44 + s * 6, 78);
      ctx.closePath(); ctx.fill();
    }
    ctx.beginPath(); // nose
    ctx.moveTo(cx - 10, 132); ctx.lineTo(cx + 10, 132); ctx.lineTo(cx, 118); ctx.closePath(); ctx.fill();
    ctx.beginPath(); // toothy grin
    ctx.moveTo(cx - 70, 140);
    ctx.quadraticCurveTo(cx, 205, cx + 70, 140);
    ctx.lineTo(cx + 46, 150); ctx.lineTo(cx + 36, 140); ctx.lineTo(cx + 14, 152); ctx.lineTo(cx + 4, 142);
    ctx.lineTo(cx - 4, 142); ctx.lineTo(cx - 14, 152); ctx.lineTo(cx - 36, 140); ctx.lineTo(cx - 46, 150);
    ctx.closePath(); ctx.fill();
  };
  face(col, '#ffd27a');
  face(em, '#ffffff');
  const map = new THREE.CanvasTexture(colC), emissiveMap = new THREE.CanvasTexture(emC);
  map.colorSpace = THREE.SRGBColorSpace; emissiveMap.colorSpace = THREE.SRGBColorSpace;
  pumpkinTex = { map, emissiveMap };
  return pumpkinTex;
}
const pumpkinGeo = () => geo('pumpkin', () => {
  const g = new THREE.SphereGeometry(1, 32, 18);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(x, z);
    const k = 1 - 0.1 * (1 - Math.abs(Math.cos(4 * a))) ** 2.5; // 8 lobes, ridge at the front
    const dip = 1 - 0.18 * Math.max(0, Math.abs(y) - 0.75) / 0.25; // dimpled top and bottom
    p.setXYZ(i, x * k, y * 0.78 * dip, z * k);
  }
  g.computeVertexNormals();
  return g;
});
// size = width across
export function makePumpkin(size = 1.6, seed = 0) {
  const r = rng(seed * 31 + 7);
  const g = new THREE.Group();
  const t = pumpkinTextures();
  const faceMat = new THREE.MeshStandardMaterial({
    color: '#ffffff', map: t.map, roughness: 0.65,
    emissive: new THREE.Color('#ff9a1f'), emissiveMap: t.emissiveMap, emissiveIntensity: 1.6,
  });
  const R = size / 2;
  const body = mesh(pumpkinGeo(), faceMat, 0, R * 0.78, 0);
  body.scale.setScalar(R);
  g.add(body);
  const stemMat = mat('#4d6b23', { roughness: 0.9 });
  const stem = cyl(stemMat, R * 0.07, R * 0.13, R * 0.42, 0, R * 1.42, 0, 7);
  stem.rotation.z = (r() - 0.5) * 0.5; stem.rotation.x = (r() - 0.5) * 0.4;
  g.add(stem);
  const leaf = sphere(mat('#3f7d27'), R * 0.22, R * 0.2, R * 1.5, -R * 0.1, 1, 0.25, 0.6);
  leaf.rotation.z = -0.4;
  g.add(leaf);
  const glow = makeGlow('#ff8c1a', size * 2.1, 0.45);
  glow.position.set(0, R * 0.8, R * 0.6);
  g.add(glow);
  g.userData.faceMat = faceMat;
  g.userData.glow = glow;
  g.rotation.y = (r() - 0.5) * 0.3;
  return g;
}

// ============================================================
// Passengers
// ============================================================
export const PASSENGER_KINDS = ['ghost', 'pumpkin', 'witch', 'vampire', 'cat', 'monster', 'mummy', 'skeleton'];

const ghostGeo = (k = 1) => geo('ghost' + k, () => {
  const pts = [[0.86, 0.0], [0.82, 0.35], [0.74, 1.1], [0.7, 1.8], [0.66, 2.3], [0.55, 2.7], [0.36, 2.98], [0.14, 3.1], [0, 3.12]]
    .map(([x, y]) => new THREE.Vector2(x * k, y * k));
  const g = new THREE.LatheGeometry(pts, 24);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y < 0.5 * k) {
      const a = Math.atan2(p.getX(i), p.getZ(i));
      p.setY(i, y - k * 0.16 * (1 + Math.sin(7 * a)) * (1 - y / (0.5 * k))); // wavy hem
    }
  }
  g.computeVertexNormals();
  return g;
});

function ghostPassenger() {
  const g = new THREE.Group(), body = new THREE.Group();
  body.position.y = 0.3;
  const sheet = mat('#f4f0ff', { emissive: '#a99bff', ei: 0.3, roughness: 0.6 });
  body.add(mesh(ghostGeo(0.95), sheet));
  const dark = mat('#1a1024', { roughness: 0.3 });
  for (const s of [-1, 1]) {
    const e = sphere(dark, 0.14, s * 0.21, 2.35, 0.55, 0.85, 1.3, 0.5);
    e.rotation.y = s * 0.35;
    body.add(e);
    body.add(sphere(basic('#ffffff'), 0.035, s * 0.21 + 0.04, 2.45, 0.62));
    const arm = sphere(sheet, 0.32, s * 0.72, 1.55, 0.1, 0.5, 1.0, 0.55);
    arm.rotation.z = s * 0.7;
    body.add(arm);
  }
  body.add(sphere(dark, 0.12, 0, 2.0, 0.62, 1, 1.2, 0.5));
  g.add(body);
  g.userData.body = body;
  return g;
}

function pumpkinKid() {
  const g = new THREE.Group();
  const cloth = mat('#4b2a70'), trousers = mat('#241a33'), vine = mat('#6ec24a');
  for (const s of [-1, 1]) {
    g.add(limb(trousers, [s * 0.22, 0.12, 0], [s * 0.22, 0.85, 0], 0.16));
    g.add(sphere(mat('#ff7b00'), 0.2, s * 0.22, 0.1, 0.1, 1, 0.6, 1.4));
  }
  g.add(rbox(cloth, 0.95, 1.0, 0.65, 0.2, 0, 1.35, 0));
  g.add(box(mat('#ff7b00'), 0.97, 0.12, 0.67, 0, 1.15, 0));
  g.add(box(mat('#ff7b00'), 0.97, 0.12, 0.67, 0, 1.5, 0));
  for (const s of [-1, 1]) {
    g.add(limb(cloth, [s * 0.52, 1.7, 0], [s * 0.72, 1.05, 0.15], 0.13));
    g.add(sphere(vine, 0.16, s * 0.74, 0.98, 0.18));
  }
  const collar = cone(vine, 0.5, 0.3, 0, 1.82, 0, 6);
  collar.rotation.x = Math.PI; collar.position.y = 2.12;
  g.add(collar);
  const head = makePumpkin(1.55, 3);
  head.position.y = 1.95;
  head.rotation.y = 0;
  head.userData.glow.scale.setScalar(2.2);
  g.add(head);
  g.userData.faceMat = head.userData.faceMat;
  return g;
}

function witchPassenger() {
  const g = new THREE.Group();
  const dress = mat('#6a2c9c'), skin = mat('#86d957'), hair = mat('#1d1526');
  for (const s of [-1, 1]) g.add(sphere(mat('#1a1420'), 0.17, s * 0.2, 0.1, 0.45, 1, 0.6, 1.5));
  g.add(cyl(dress, 0.36, 0.86, 1.75, 0, 0, 0, 18));
  g.add(cyl(mat('#ff7b00'), 0.86, 0.88, 0.12, 0, 0.02, 0, 18));
  g.add(cyl(mat('#ff7b00'), 0.45, 0.47, 0.1, 0, 1.3, 0, 16));
  for (const s of [-1, 1]) {
    g.add(limb(dress, [s * 0.38, 1.6, 0], [s * 0.62, 1.05, 0.25], 0.13));
    g.add(sphere(skin, 0.14, s * 0.64, 0.98, 0.3));
  }
  const c = [0, 2.15, 0];
  g.add(sphere(skin, 0.5, ...c));
  for (const [x, y, z, r] of [[-0.42, 2.0, -0.12, 0.26], [0.42, 2.0, -0.12, 0.26], [0, 2.15, -0.3, 0.42], [-0.3, 1.8, -0.2, 0.2], [0.3, 1.8, -0.2, 0.2]]) g.add(sphere(hair, r, x, y, z));
  eyesOn(g, c, 0.5, 0.19, 0.06, 0.14);
  const nose = cone(skin, 0.09, 0.32, 0, 2.08, 0.42, 8);
  nose.rotation.x = Math.PI / 2 + 0.25;
  g.add(nose);
  g.add(smile(mat('#3a1030'), 0.14, 0, 1.92, 0.45));
  const hat = makeWitchHat();
  hat.scale.setScalar(0.66);
  hat.position.set(0, 2.47, -0.02);
  hat.rotation.z = 0.12;
  g.add(hat);
  return g;
}

function vampirePassenger() {
  const g = new THREE.Group();
  const black = mat('#1d1a28'), red = mat('#c41a2a', { side: THREE.BackSide }), skin = mat('#e8e2f3');
  for (const s of [-1, 1]) {
    g.add(limb(black, [s * 0.2, 0.1, 0], [s * 0.2, 0.9, 0], 0.15));
    g.add(sphere(mat('#0d0b12', { roughness: 0.3 }), 0.18, s * 0.2, 0.08, 0.12, 1, 0.55, 1.4));
  }
  g.add(cyl(black, 0.44, 0.48, 1.05, 0, 0.85, 0, 16));
  g.add(box(mat('#f2eef8'), 0.32, 0.8, 0.1, 0, 1.45, 0.42));
  const bow = sphere(mat('#d41c2e', { emissive: '#600010', ei: 0.4 }), 0.1, 0, 1.82, 0.5, 1.6, 0.8, 0.6);
  g.add(bow);
  // cape: black outside, red lining inside, open at the front
  const capeGeo = geo('cape', () => new THREE.CylinderGeometry(0.5, 1.0, 1.9, 22, 1, true, 0.65, Math.PI * 2 - 1.3).translate(0, 0.95, 0));
  g.add(mesh(capeGeo, black, 0, 0.1, -0.05));
  g.add(mesh(capeGeo, red, 0, 0.1, -0.05));
  const collarGeo = geo('collar', () => new THREE.CylinderGeometry(0.78, 0.48, 0.75, 18, 1, true, 1.1, Math.PI * 2 - 2.2).translate(0, 0.37, 0));
  g.add(mesh(collarGeo, black, 0, 1.95, -0.08));
  g.add(mesh(collarGeo, red, 0, 1.95, -0.08));
  for (const s of [-1, 1]) {
    g.add(limb(black, [s * 0.45, 1.75, 0.05], [s * 0.6, 1.1, 0.3], 0.13));
    g.add(sphere(skin, 0.13, s * 0.62, 1.03, 0.33));
  }
  const c = [0, 2.35, 0];
  g.add(sphere(skin, 0.5, ...c));
  g.add(sphere(black, 0.52, 0, 2.47, -0.1, 1, 0.62, 1));
  const peak = cone(black, 0.09, 0.18, 0, 2.8, 0.36, 4);
  peak.rotation.x = Math.PI - 0.5;
  g.add(peak);
  for (const s of [-1, 1]) {
    const ear = cone(skin, 0.1, 0.32, s * 0.48, 2.36, -0.02, 6);
    ear.rotation.z = -s * 1.1;
    g.add(ear);
  }
  eyesOn(g, c, 0.5, 0.19, 0.05, 0.14, { pupilColor: '#7a0010' });
  g.add(smile(mat('#3a1030'), 0.15, 0, 2.17, 0.45));
  for (const s of [-1, 1]) {
    const f = cone(mat('#ffffff'), 0.035, 0.1, s * 0.07, 2.02, 0.46, 6);
    f.rotation.x = Math.PI;
    f.position.y = 2.06;
    g.add(f);
  }
  return g;
}

function catPassenger() {
  const g = new THREE.Group();
  const fur = mat('#2a2436', { roughness: 0.6 }), pink = mat('#ff8fb8');
  g.add(sphere(fur, 0.6, 0, 0.82, -0.05, 0.95, 1.25, 0.95));
  g.add(sphere(fur, 0.4, 0, 1.05, 0.3, 1, 1.2, 0.7));
  for (const s of [-1, 1]) {
    g.add(sphere(fur, 0.4, s * 0.38, 0.38, -0.1, 0.9, 1, 1.25));
    g.add(limb(fur, [s * 0.2, 0.12, 0.42], [s * 0.2, 0.95, 0.32], 0.13));
    g.add(sphere(fur, 0.16, s * 0.2, 0.1, 0.52, 1, 0.65, 1.3));
  }
  const c = [0, 2.05, 0.05];
  g.add(sphere(fur, 0.6, ...c, 1.12, 0.92, 1));
  for (const s of [-1, 1]) {
    const ear = cone(fur, 0.22, 0.48, s * 0.36, 2.42, 0.0, 4);
    ear.rotation.z = -s * 0.32;
    g.add(ear);
    const inner = cone(pink, 0.11, 0.3, s * 0.37, 2.45, 0.08, 4);
    inner.rotation.z = -s * 0.32;
    g.add(inner);
  }
  eyesOn(g, c, 0.58, 0.24, 0.05, 0.17, { glow: '#ffe14a', slit: true, pupil: 0.7 });
  g.add(sphere(pink, 0.07, 0, 1.92, 0.62, 1.2, 0.8, 0.8));
  g.add(smile(mat('#0d0b12'), 0.1, 0, 1.85, 0.6, 0.025));
  const wh = mat('#d9d2e6');
  for (const s of [-1, 1]) for (const dy of [-0.05, 0.05]) {
    const w = limb(wh, [s * 0.15, 1.9 + dy, 0.6], [s * 0.7, 1.9 + dy * 3, 0.5], 0.012, false);
    g.add(w);
  }
  const tail = new THREE.CatmullRomCurve3([
    [0, 0.25, -0.55], [0.5, 0.25, -0.75], [0.8, 0.8, -0.65], [0.75, 1.45, -0.5], [0.45, 1.6, -0.42], [0.42, 1.35, -0.4],
  ].map((p) => new THREE.Vector3(...p)));
  g.add(mesh(geo('cattail', () => new THREE.TubeGeometry(tail, 24, 0.1, 8)), fur));
  g.scale.setScalar(1.15);
  return g;
}

function monsterPassenger() {
  const g = new THREE.Group();
  const skin = mat('#7cc95a'), jacket = mat('#3b3350'), dark = mat('#1a1622'), grey = mat('#9a9aa6', { roughness: 0.4 });
  for (const s of [-1, 1]) {
    g.add(limb(mat('#2b2f3a'), [s * 0.25, 0.3, 0], [s * 0.25, 0.9, 0], 0.17));
    g.add(rbox(dark, 0.42, 0.32, 0.62, 0.1, s * 0.25, 0.16, 0.1));
  }
  g.add(rbox(jacket, 1.25, 1.2, 0.8, 0.18, 0, 1.45, 0));
  g.add(box(mat('#5a5070'), 0.3, 1.05, 0.05, 0, 1.45, 0.4));
  for (const s of [-1, 1]) {
    g.add(limb(jacket, [s * 0.66, 1.85, 0], [s * 0.78, 1.0, 0.15], 0.17));
    g.add(sphere(skin, 0.19, s * 0.8, 0.9, 0.18));
  }
  g.add(cyl(skin, 0.28, 0.3, 0.3, 0, 2.0, 0, 12));
  g.add(rbox(skin, 0.95, 1.0, 0.85, 0.14, 0, 2.62, 0));
  g.add(box(dark, 1.0, 0.24, 0.9, 0, 3.17, -0.02));
  for (let i = 0; i < 5; i++) g.add(box(dark, 0.21, 0.14 + (i % 2) * 0.08, 0.1, -0.4 + i * 0.2, 3.04 - (i % 2) * 0.04, 0.42));
  for (const s of [-1, 1]) {
    const bolt = cyl(grey, 0.07, 0.07, 0.3, s * 0.45, 2.15, 0, 8);
    bolt.rotation.z = -s * Math.PI / 2;
    g.add(bolt);
    g.add(sphere(grey, 0.1, s * 0.75, 2.15, 0, 0.6, 1, 1));
    const e = eye(0.15);
    e.position.set(s * 0.2, 2.72, 0.42);
    g.add(e);
  }
  g.add(box(dark, 0.7, 0.08, 0.06, 0, 2.86, 0.44));
  g.add(box(dark, 0.42, 0.05, 0.04, 0, 2.38, 0.44));
  for (let i = 0; i < 4; i++) g.add(box(dark, 0.03, 0.14, 0.04, -0.15 + i * 0.1, 2.38, 0.445));
  return g;
}

function mummyPassenger() {
  const g = new THREE.Group();
  const wrap = mat('#e6dcc0', { roughness: 0.95 }), wrap2 = mat('#cbbf9e', { roughness: 0.95 });
  const r = rng(77);
  const band = (R, y, x = 0, z = 0, tilt = 0.25) => {
    const t = mesh(geo(`band${R}`, () => new THREE.TorusGeometry(R, 0.07, 6, 18)), r() < 0.5 ? wrap2 : wrap, x, y, z);
    t.rotation.x = Math.PI / 2 + (r() - 0.5) * tilt;
    t.rotation.y = (r() - 0.5) * tilt;
    return t;
  };
  for (const s of [-1, 1]) {
    g.add(limb(wrap, [s * 0.22, 0.12, 0], [s * 0.22, 0.85, 0], 0.17));
    for (let i = 0; i < 3; i++) g.add(band(0.17, 0.2 + i * 0.25, s * 0.22));
  }
  g.add(cyl(wrap, 0.46, 0.5, 1.2, 0, 0.8, 0, 16));
  for (let i = 0; i < 5; i++) g.add(band(0.48, 0.9 + i * 0.24));
  for (const s of [-1, 1]) {
    g.add(limb(wrap, [s * 0.5, 1.75, 0], [s * 0.5, 1.72, 0.9], 0.14));
    g.add(band(0.15, 1.73, s * 0.5, 0.45, 0.3).rotateX(Math.PI / 2));
    g.add(sphere(wrap2, 0.16, s * 0.5, 1.72, 0.98));
  }
  const c = [0, 2.45, 0];
  g.add(sphere(wrap, 0.52, ...c));
  for (const y of [2.15, 2.72, 2.85]) g.add(band(Math.sqrt(0.52 ** 2 - (y - 2.45) ** 2) + 0.02, y));
  g.add(sphere(mat('#2a1d18'), 0.5, 0, 2.5, 0.06, 0.9, 0.22, 0.95));
  eyesOn(g, c, 0.5, 0.2, 0.05, 0.15);
  const tail = box(wrap2, 0.12, 0.6, 0.03, 0.5, 1.4, 0.55);
  tail.rotation.z = 0.15;
  g.add(tail);
  return g;
}

function makeSkull(glowEyes) {
  const g = new THREE.Group();
  const bone = mat(BONE, { emissive: '#4a4436', ei: 0.35, roughness: 0.6 });
  const hole = mat('#141018', { roughness: 0.9 });
  g.add(sphere(bone, 0.64, 0, 0, 0, 1, 0.95, 1));
  g.add(rbox(bone, 0.72, 0.34, 0.6, 0.12, 0, -0.5, 0.14));
  for (const s of [-1, 1]) {
    g.add(sphere(hole, 0.18, s * 0.23, 0.04, 0.5, 1, 1.15, 0.6));
    g.add(sphere(basic(glowEyes ? '#7dffd8' : '#ffffff'), glowEyes ? 0.07 : 0.05, s * 0.23, 0.03, 0.6));
  }
  const nose = cone(hole, 0.07, 0.12, 0, -0.2, 0.62, 3);
  nose.rotation.x = Math.PI;
  nose.position.y = -0.14;
  g.add(nose);
  g.add(box(hole, 0.46, 0.03, 0.04, 0, -0.5, 0.45));
  for (let i = 0; i < 5; i++) g.add(box(hole, 0.025, 0.18, 0.04, -0.18 + i * 0.09, -0.5, 0.45));
  return g;
}

function skeletonPassenger() {
  const g = new THREE.Group();
  const bone = mat(BONE, { emissive: '#4a4436', ei: 0.35, roughness: 0.6 });
  for (const s of [-1, 1]) {
    g.add(limb(bone, [s * 0.2, 1.0, 0], [s * 0.22, 0.55, 0.02], 0.08));
    g.add(limb(bone, [s * 0.22, 0.52, 0.02], [s * 0.22, 0.12, 0], 0.08));
    g.add(sphere(bone, 0.13, s * 0.22, 0.53, 0.02));
    g.add(sphere(bone, 0.15, s * 0.22, 0.08, 0.14, 1, 0.55, 1.6));
  }
  g.add(rbox(bone, 0.62, 0.22, 0.36, 0.1, 0, 1.06, 0));
  g.add(cyl(bone, 0.07, 0.07, 1.1, 0, 1.0, -0.18, 8));
  const ribGeo = geo('rib', () => new THREE.TorusGeometry(1, 0.11, 6, 16, 4.4));
  for (const [y, R] of [[1.4, 0.38], [1.62, 0.44], [1.84, 0.42]]) {
    const rib = mesh(ribGeo, bone, 0, y, -0.06);
    rib.scale.set(R, R, R * 0.6);
    rib.rotation.set(Math.PI / 2, 0, Math.PI / 2 - (4.4 + (Math.PI * 2 - 4.4) / 2));
    g.add(rib);
  }
  g.add(cyl(bone, 0.05, 0.05, 0.55, 0, 1.4, 0.36, 8));
  g.add(limb(bone, [-0.5, 2.02, -0.05], [0.5, 2.02, -0.05], 0.07));
  for (const s of [-1, 1]) {
    g.add(limb(bone, [s * 0.52, 2.0, -0.05], [s * 0.62, 1.5, 0.05], 0.065));
    g.add(limb(bone, [s * 0.62, 1.5, 0.05], [s * 0.62, 1.1, 0.25], 0.06));
    g.add(sphere(bone, 0.12, s * 0.62, 1.06, 0.28));
  }
  g.add(cyl(bone, 0.08, 0.08, 0.25, 0, 2.02, -0.1, 8));
  const skull = makeSkull(false);
  skull.position.set(0, 2.62, 0);
  g.add(skull);
  return g;
}

export function makePassenger(kind) {
  const make = {
    ghost: ghostPassenger, pumpkin: pumpkinKid, witch: witchPassenger, vampire: vampirePassenger,
    cat: catPassenger, monster: monsterPassenger, mummy: mummyPassenger, skeleton: skeletonPassenger,
  }[kind] || ghostPassenger;
  const g = make();
  g.userData.kind = kind;
  return g;
}

// ============================================================
// Creatures
// ============================================================
const batWingGeo = () => geo('batwing', () => {
  const s = new THREE.Shape();
  s.moveTo(0, -0.15);
  s.quadraticCurveTo(0.5, -0.36, 1.0, -0.22);
  s.quadraticCurveTo(0.84, -0.04, 0.78, 0.13);
  s.quadraticCurveTo(0.66, 0.0, 0.5, 0.2);
  s.quadraticCurveTo(0.37, 0.05, 0.24, 0.22);
  s.quadraticCurveTo(0.12, 0.08, 0, 0.16);
  s.closePath();
  return new THREE.ShapeGeometry(s, 6).scale(1.1, 1.25, 1).rotateX(-Math.PI / 2);
});
export function makeBat() {
  const g = new THREE.Group();
  const fur = mat('#2c2140', { roughness: 0.7 }), wing = mat('#5b3a80', { side: DS, roughness: 0.8, emissive: '#2a1040', ei: 0.5 });
  const bone = mat('#2c2140', { roughness: 0.7 });
  g.add(sphere(fur, 0.3, 0, 0, -0.05, 0.95, 0.85, 1.35));
  g.add(sphere(fur, 0.24, 0, 0.1, 0.36));
  for (const s of [-1, 1]) {
    const ear = cone(fur, 0.09, 0.26, s * 0.13, 0.26, 0.34, 6);
    ear.rotation.z = -s * 0.3;
    g.add(ear);
    g.add(sphere(basic('#ff5a1f'), 0.065, s * 0.1, 0.16, 0.56));
    const f = cone(mat('#ffffff'), 0.025, 0.07, s * 0.05, 0.0, 0.57, 5);
    f.rotation.x = Math.PI;
    g.add(f);
  }
  const mkWing = (s) => {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.2, 0.05, 0);
    const w = mesh(batWingGeo(), wing);
    w.scale.x = s;
    pivot.add(w);
    pivot.add(limb(bone, [0, 0, 0.15], [s * 1.1, 0, 0.28], 0.03, false));
    g.add(pivot);
    return pivot;
  };
  g.userData.wingR = mkWing(1);
  g.userData.wingL = mkWing(-1);
  return g;
}

export function makeOwl() {
  const g = new THREE.Group();
  const feather = mat('#6e4a30', { roughness: 0.9 }), belly = mat('#b8936a', { roughness: 0.9 }), disc = mat('#cdb08a');
  g.add(sphere(feather, 0.6, 0, 0.72, 0, 0.95, 1.15, 0.85));
  g.add(sphere(belly, 0.45, 0, 0.62, 0.22, 0.95, 1.05, 0.7));
  for (const s of [-1, 1]) {
    const w = sphere(feather, 0.3, s * 0.52, 0.72, -0.02, 0.45, 1.25, 0.8);
    w.rotation.z = s * 0.15;
    g.add(w);
    const tuft = cone(feather, 0.13, 0.36, s * 0.32, 1.38, 0, 4);
    tuft.rotation.z = -s * 0.45;
    g.add(tuft);
    g.add(sphere(disc, 0.26, s * 0.21, 1.1, 0.38, 1, 1, 0.45));
    const e = eye(0.17, { glow: '#ffcf3a', pupil: 0.62 });
    e.position.set(s * 0.21, 1.11, 0.46);
    g.add(e);
    for (const dx of [-0.07, 0, 0.07]) g.add(sphere(mat('#ff9a1f'), 0.06, s * 0.17 + dx, 0.05, 0.3, 1, 0.6, 1.4));
  }
  const beak = cone(mat('#ff9a1f'), 0.08, 0.2, 0, 0.98, 0.52, 4);
  beak.rotation.x = Math.PI;
  beak.position.y = 1.02;
  g.add(beak);
  return g;
}

// origin at the top of its back, so it can hang from a thread
export function makeSpider() {
  const g = new THREE.Group();
  const black = mat('#1d1826', { roughness: 0.5 });
  g.add(sphere(black, 0.32, 0, -0.32, -0.12, 1, 0.85, 1.12));
  g.add(sphere(mat('#ff7b00', { emissive: '#ff5a00', ei: 0.5 }), 0.1, 0, -0.08, -0.15, 1.2, 0.4, 1.5));
  g.add(sphere(black, 0.2, 0, -0.36, 0.25));
  for (const s of [-1, 1]) {
    const e = eye(0.09, { pupil: 0.6 });
    e.position.set(s * 0.08, -0.32, 0.41);
    g.add(e);
    g.add(sphere(basic('#ff3b3b'), 0.03, s * 0.16, -0.26, 0.38));
    [0.75, 0.25, -0.25, -0.75].forEach((a) => {
      const dir = new THREE.Vector3(s * Math.cos(a), 0, Math.sin(a));
      const root = new THREE.Vector3(s * 0.12, -0.36, 0.15);
      const knee = root.clone().addScaledVector(dir, 0.3).add(new THREE.Vector3(0, 0.2, 0));
      const foot = knee.clone().addScaledVector(dir, 0.22).add(new THREE.Vector3(0, -0.42, 0));
      g.add(limb(black, root.toArray(), knee.toArray(), 0.035));
      g.add(limb(black, knee.toArray(), foot.toArray(), 0.03));
    });
  }
  return g;
}

export function makeFrog() {
  const g = new THREE.Group();
  const skin = mat('#57d636', { emissive: '#1d5a10', ei: 0.35, roughness: 0.5 }), belly = mat('#c8f08a');
  g.add(sphere(skin, 0.5, 0, 0.36, 0, 1, 0.72, 1));
  g.add(sphere(belly, 0.38, 0, 0.3, 0.2, 1, 0.65, 0.8));
  for (const s of [-1, 1]) {
    g.add(sphere(skin, 0.18, s * 0.24, 0.72, 0.15));
    const e = eye(0.15, { pupil: 0.6 });
    e.position.set(s * 0.24, 0.76, 0.24);
    g.add(e);
    g.add(sphere(skin, 0.3, s * 0.42, 0.18, -0.12, 0.65, 0.5, 1.2));
    g.add(sphere(skin, 0.13, s * 0.3, 0.05, 0.42, 1.1, 0.4, 1.3));
  }
  const m = smile(mat('#1b3a10'), 0.28, 0, 0.42, 0.36, 0.025, Math.PI * 0.75);
  m.rotation.x = -0.4;
  g.add(m);
  return g;
}

export function makeWolf() {
  const g = new THREE.Group();
  const fur = mat('#7a778e', { roughness: 0.85 }), light = mat('#c4c0d4', { roughness: 0.85 }), dark = mat('#17131d');
  for (const s of [-1, 1]) {
    g.add(sphere(fur, 0.55, s * 0.38, 0.5, -0.35, 0.8, 0.95, 1.1));
    g.add(sphere(fur, 0.2, s * 0.45, 0.1, 0.05, 0.9, 0.5, 1.6));
    g.add(limb(fur, [s * 0.24, 1.15, 0.28], [s * 0.24, 0.12, 0.42], 0.14));
    g.add(sphere(light, 0.17, s * 0.24, 0.1, 0.52, 1, 0.6, 1.3));
  }
  const torso = sphere(fur, 0.62, 0, 1.2, -0.08, 0.95, 1.4, 0.9);
  torso.rotation.x = -0.3;
  g.add(torso);
  g.add(sphere(light, 0.45, 0, 1.45, 0.3, 0.9, 1.2, 0.6));
  const tail = sphere(fur, 0.24, 0.5, 0.2, -0.75, 0.9, 0.8, 2.6);
  tail.rotation.y = -0.7;
  g.add(tail);
  // head tipped back for a howl
  const head = new THREE.Group();
  head.position.set(0, 2.2, 0.2);
  head.rotation.x = -0.75;
  head.add(sphere(fur, 0.42, 0, 0, 0, 1, 0.95, 1));
  const muzzle = cyl(light, 0.15, 0.25, 0.7, 0, 0, 0.22, 12);
  muzzle.rotation.x = Math.PI / 2;
  head.add(muzzle);
  head.add(sphere(dark, 0.11, 0, 0.04, 0.95));
  head.add(sphere(mat('#5a1020'), 0.13, 0, -0.14, 0.78, 1, 0.8, 0.6));
  for (const s of [-1, 1]) {
    const ear = cone(fur, 0.15, 0.38, s * 0.24, 0.28, -0.1, 4);
    ear.rotation.z = -s * 0.35;
    head.add(ear);
    const lid = smile(dark, 0.08, s * 0.17, 0.16, 0.36, 0.022, Math.PI * 0.8);
    lid.rotation.x = -0.3;
    head.add(lid);
  }
  g.add(head);
  return g;
}

function bigGhost(opacity, ei) {
  const g = new THREE.Group();
  const o = opacity < 1 ? { opacity, depthWrite: true } : {};
  const sheet = matU('#f6f2ff', { emissive: '#c4b6ff', ei, roughness: 0.55, ...o });
  const dark = matU('#1a1024', { roughness: 0.3, ...o });
  g.add(mesh(ghostGeo(1.55), sheet));
  for (const s of [-1, 1]) {
    const e = sphere(dark, 0.24, s * 0.34, 3.85, 0.86, 0.85, 1.3, 0.5);
    e.rotation.y = s * 0.35;
    g.add(e);
    const arm = new THREE.Mesh(geo('ghostarm', () => new THREE.CapsuleGeometry(0.28, 1.0, 4, 10)), sheet);
    arm.position.set(s * 1.25, 2.75, 0.25);
    arm.rotation.z = -s * 1.05;
    arm.rotation.y = -s * 0.3;
    g.add(arm);
  }
  g.add(sphere(dark, 0.3, 0, 3.15, 0.95, 0.9, 1.15, 0.5));
  g.userData.mats = [sheet, dark];
  return g;
}
export function makeFloatingGhost() {
  return bigGhost(0.85, 0.45);
}

export function makeLamp() {
  const g = new THREE.Group();
  const iron = mat('#2a2738', { roughness: 0.5, metalness: 0.2 });
  g.add(cyl(iron, 0.32, 0.42, 0.35, 0, 0, 0, 10));
  g.add(cyl(iron, 0.1, 0.13, 4.6, 0, 0.3, 0, 10));
  g.add(cyl(iron, 0.18, 0.18, 0.12, 0, 1.4, 0, 10));
  g.add(cyl(iron, 0.17, 0.17, 0.1, 0, 4.85, 0, 10));
  for (const s of [-1, 1]) {
    const arm = limb(iron, [0, 4.4, 0], [s * 0.45, 4.6, 0], 0.035, false);
    g.add(arm);
  }
  const bulbMat = matU('#fff1c4', { emissive: '#ffb347', ei: 1.8 });
  const glass = cyl(bulbMat, 0.34, 0.22, 0.6, 0, 4.95, 0, 6);
  g.add(glass);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.add(limb(iron, [Math.sin(a) * 0.23, 4.95, Math.cos(a) * 0.23], [Math.sin(a) * 0.35, 5.55, Math.cos(a) * 0.35], 0.025, false));
  }
  g.add(cone(iron, 0.48, 0.42, 0, 5.55, 0, 6));
  g.add(sphere(iron, 0.08, 0, 6.0, 0));
  const glow = makeGlow('#ffb347', 4.5, 0.6);
  glow.position.y = 5.25;
  g.add(glow);
  g.userData.bulbMat = bulbMat;
  g.userData.glow = glow;
  return g;
}

export function makeToadstool(seed = 0) {
  const r = rng(seed * 13 + 5);
  const g = new THREE.Group();
  const h = 0.8 + r() * 0.8;
  const col = r() < 0.5 ? '#b05cff' : '#2de1c2';
  const stem = mat('#e8e0d0', { roughness: 0.8 });
  g.add(cyl(stem, 0.09 * h * 1.2, 0.13 * h * 1.2, h * 0.75, 0, 0, 0, 10));
  const capGeo = geo('cap', () => new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2));
  const cap = mesh(capGeo, mat(col, { emissive: col, ei: 0.55, roughness: 0.5 }), 0, h * 0.68, 0);
  cap.scale.set(h * 0.42, h * 0.32, h * 0.42);
  g.add(cap);
  const spot = basic('#f4ecff');
  for (let i = 0; i < 6; i++) {
    const a = r() * Math.PI * 2, el = 0.35 + r() * 0.8;
    const x = Math.cos(a) * Math.sin(el), y = Math.cos(el), z = Math.sin(a) * Math.sin(el);
    g.add(sphere(spot, h * 0.05, x * h * 0.42, h * 0.68 + y * h * 0.32, z * h * 0.42, 1, 0.5, 1));
  }
  g.rotation.z = (r() - 0.5) * 0.25;
  return g;
}

// ============================================================
// Scenery
// ============================================================
export function makeCauldron() {
  const g = new THREE.Group();
  const iron = mat('#2f2c3a', { roughness: 0.45, metalness: 0.2 });
  const potGeo = geo('pot', () => new THREE.LatheGeometry(
    [[0, 0.5], [0.5, 0.53], [0.85, 0.75], [1.0, 1.15], [0.96, 1.6], [0.82, 1.9], [0.86, 1.98], [0.78, 2.02]].map(([x, y]) => new THREE.Vector2(x, y)), 20));
  g.add(mesh(potGeo, mat('#2f2c3a', { roughness: 0.45, metalness: 0.2, side: DS })));
  g.add(mesh(geo('potrim', () => new THREE.TorusGeometry(0.84, 0.08, 8, 24)), iron, 0, 1.98, 0).rotateX(Math.PI / 2));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    g.add(limb(iron, [Math.sin(a) * 0.6, 0.75, Math.cos(a) * 0.6], [Math.sin(a) * 0.9, 0.0, Math.cos(a) * 0.9], 0.07, false));
  }
  const liquidMat = matU('#7cff4f', { emissive: '#3cff1f', ei: 1.0, roughness: 0.3 });
  const liquid = mesh(geo('liquid', () => new THREE.CircleGeometry(0.8, 20)), liquidMat, 0, 1.88, 0);
  liquid.rotation.x = -Math.PI / 2;
  g.add(liquid);
  const bubbles = [];
  for (const [x, z, r] of [[0.3, 0.1, 0.12], [-0.25, 0.3, 0.09], [-0.1, -0.35, 0.14], [0.4, -0.3, 0.07]]) {
    const b = sphere(liquidMat, r, x, 1.9, z);
    bubbles.push(b);
    g.add(b);
  }
  const wood = mat('#4a3020', { roughness: 0.9 });
  for (const a of [0.3, 1.9]) {
    const log = limb(wood, [Math.sin(a) * 0.55, 0.1, Math.cos(a) * 0.55], [-Math.sin(a) * 0.55, 0.1, -Math.cos(a) * 0.55], 0.09);
    g.add(log);
  }
  const flames = [];
  const fm = [basic('#ff6a00'), basic('#ffb000'), basic('#ffe066')];
  for (const [x, z, h, k] of [[0, 0, 0.55, 2], [0.2, 0.1, 0.42, 1], [-0.18, 0.12, 0.45, 1], [0.05, -0.2, 0.4, 0], [-0.15, -0.12, 0.35, 0], [0.22, -0.12, 0.32, 0]]) {
    const f = cone(fm[k], 0.11 + h * 0.15, h, x, 0.1, z, 7);
    flames.push(f);
    g.add(f);
  }
  const fire = makeGlow('#ff7a1a', 3, 0.7);
  fire.position.y = 0.4;
  const steam = makeGlow('#7cff4f', 3.2, 0.5);
  steam.position.y = 2.2;
  g.add(fire, steam);
  g.userData.liquidMat = liquidMat;
  g.userData.flames = flames;
  g.userData.bubbles = bubbles;
  return g;
}

const tombGeos = () => geo('tombs', () => {
  const slab = new THREE.Shape();
  slab.moveTo(-0.6, 0); slab.lineTo(0.6, 0); slab.lineTo(0.6, 1.45);
  slab.absarc(0, 1.45, 0.6, 0, Math.PI, false);
  slab.lineTo(-0.6, 0);
  const slabGeo = new THREE.ExtrudeGeometry(slab, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2, curveSegments: 10 }).translate(0, 0, -0.15);
  const cross = mergeGeometries([
    new THREE.BoxGeometry(0.36, 2.3, 0.3).translate(0, 1.15 + 0.25, 0),
    new THREE.BoxGeometry(1.3, 0.34, 0.3).translate(0, 1.85, 0),
    new THREE.BoxGeometry(0.9, 0.3, 0.6).translate(0, 0.15, 0),
  ]);
  const obelisk = mergeGeometries([
    new THREE.BoxGeometry(1.0, 0.4, 1.0).translate(0, 0.2, 0),
    new THREE.CylinderGeometry(0.28 * Math.SQRT2, 0.4 * Math.SQRT2, 1.9, 4).rotateY(Math.PI / 4).translate(0, 1.35, 0),
    new THREE.ConeGeometry(0.3 * Math.SQRT2, 0.45, 4).rotateY(Math.PI / 4).translate(0, 2.52, 0),
  ]);
  return [slabGeo, cross, obelisk];
});
export function makeTombstone(seed = 0) {
  const r = rng(seed * 17 + 3);
  const g = new THREE.Group();
  const kind = seed % 3;
  const stone = mat(['#8a8d9a', '#7d808f', '#949088'][Math.floor(r() * 3)], { roughness: 0.95 });
  const t = mesh(tombGeos()[kind], stone);
  t.rotation.z = (r() - 0.5) * 0.16;
  t.rotation.x = (r() - 0.5) * 0.1;
  g.add(t);
  if (kind === 0) {
    const carve = mat('#3a3a46');
    const c1 = box(carve, 0.1, 0.6, 0.04, 0, 1.25, 0.215), c2 = box(carve, 0.4, 0.1, 0.04, 0, 1.4, 0.215);
    t.add(c1, c2);
    for (let i = 0; i < 3; i++) t.add(box(carve, 0.7 - i * 0.12, 0.05, 0.04, 0, 0.75 - i * 0.18, 0.215));
  }
  const moss = mat('#4f7a35', { roughness: 1 });
  for (let i = 0; i < 3; i++) t.add(sphere(moss, 0.14 + r() * 0.1, (r() - 0.5) * 0.9, 0.05 + r() * 0.2, (r() - 0.5) * 0.4, 1, 0.5, 1));
  const mound = sphere(mat('#3d2c22', { roughness: 1 }), 1, 0, 0, 1.15, 0.6, 0.22, 0.95);
  g.add(mound);
  return g;
}

// ------------------------------------------------------------
// Dead trees: recursive tapered branches merged into one mesh
// ------------------------------------------------------------
function buildTreeGeo(variant) {
  const r = rng(variant * 7919 + 13);
  const parts = [];
  const seg = (a, b, r0, r1) => {
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    const g = new THREE.CylinderGeometry(r1, r0, len, 6, 1, r1 < 0.12).translate(0, len / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
    g.translate(a.x, a.y, a.z);
    parts.push(g);
    if (r1 > 0.22) parts.push(new THREE.SphereGeometry(r1, 6, 4).translate(b.x, b.y, b.z)); // hide the elbow joints
  };
  const grow = (p, dir, len, rad, depth) => {
    let cur = p.clone();
    const d = dir.clone();
    const n = depth > 0 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      d.add(new THREE.Vector3((r() - 0.5) * 0.55, (r() - 0.35) * 0.25, (r() - 0.5) * 0.55)).normalize();
      const nxt = cur.clone().addScaledVector(d, len / n);
      seg(cur, nxt, rad * (1 - i * 0.18), rad * (1 - (i + 1) * 0.18));
      cur = nxt;
    }
    if (depth <= 0) return;
    const kids = 2 + (r() < (depth >= 2 ? 0.6 : 0.35) ? 1 : 0);
    const perp = new THREE.Vector3().crossVectors(Math.abs(d.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : UP, d).normalize();
    const az0 = r() * Math.PI * 2;
    for (let k = 0; k < kids; k++) {
      const nd = d.clone().applyAxisAngle(perp, 0.45 + r() * 0.5).applyAxisAngle(d, az0 + (k / kids) * Math.PI * 2 + (r() - 0.5) * 0.6);
      if (depth <= 1) nd.y += 0.35; // twig tips curl upwards like claws
      grow(cur, nd.normalize(), len * (0.62 + r() * 0.14), rad * 0.6, depth - 1);
    }
  };
  // a straight base so a hollow with eyes can sit on it, then a leaning trunk
  seg(new THREE.Vector3(0, -0.2, 0), new THREE.Vector3(0, 2.8, 0), 0.62, 0.46);
  for (let i = 0; i < 4; i++) { // roots
    const a = (i / 4) * Math.PI * 2 + r();
    const g = new THREE.ConeGeometry(0.28, 1.4, 6).rotateZ(Math.PI / 2 + 0.25).translate(0.65, 0.12, 0).rotateY(a);
    parts.push(g);
  }
  const lean = new THREE.Vector3((r() - 0.5) * 0.4, 1, (r() - 0.5) * 0.4).normalize();
  grow(new THREE.Vector3(0, 2.8, 0), lean, 4.2 + r() * 1.4, 0.46, 3);
  const merged = mergeGeometries(parts.map((p) => p.index ? p.toNonIndexed() : p));
  merged.computeVertexNormals();
  merged.computeBoundingBox();
  return merged;
}
export function makeDeadTree(seed = 0) {
  const variant = ((seed % 6) + 6) % 6;
  const g = new THREE.Group();
  const treeGeo = geo('tree' + variant, () => buildTreeGeo(variant));
  g.add(mesh(treeGeo, mat('#4a3c45', { roughness: 0.95, flat: true })));
  if (variant % 2 === 0) { // a hollow with something peeking out
    g.add(sphere(mat('#0c0810', { roughness: 1 }), 0.3, 0, 1.75, 0.43, 0.9, 1.2, 0.4));
    for (const s of [-1, 1]) g.add(sphere(basic('#ffe14a'), 0.06, s * 0.1, 1.82, 0.52));
  }
  g.userData.height = treeGeo.boundingBox.max.y;
  return g;
}

// ============================================================
// Station mascots
// ============================================================
export const ICON_NAMES = ['pumpkin', 'ghost', 'witchhat', 'bat', 'spider', 'skull', 'cauldron', 'owl', 'cat', 'bolt', 'moon', 'candy'];
const ICON_GLOW = {
  pumpkin: '#ff7b00', ghost: '#c8b8ff', witchhat: '#b05cff', bat: '#ff5a1f', spider: '#7cff4f', skull: '#9fffe0',
  cauldron: '#7cff4f', owl: '#ffcf3a', cat: '#ffe14a', bolt: '#ffd400', moon: '#fff2a8', candy: '#ff7b00',
};

function catHead() {
  const g = new THREE.Group();
  const fur = mat('#2a2436', { roughness: 0.6 }), pink = mat('#ff8fb8');
  g.add(sphere(fur, 1, 0, 0, 0, 1.15, 0.92, 0.95));
  for (const s of [-1, 1]) {
    const ear = cone(fur, 0.38, 0.8, s * 0.62, 0.55, -0.05, 4);
    ear.rotation.z = -s * 0.35;
    g.add(ear);
    const inner = cone(pink, 0.2, 0.5, s * 0.63, 0.62, 0.08, 4);
    inner.rotation.z = -s * 0.35;
    g.add(inner);
  }
  eyesOn(g, [0, 0, 0], 0.95, 0.4, 0.1, 0.28, { glow: '#ffe14a', slit: true, pupil: 0.72 });
  g.add(sphere(pink, 0.11, 0, -0.18, 0.93, 1.2, 0.8, 0.7));
  g.add(smile(mat('#0d0b12'), 0.16, 0, -0.32, 0.9, 0.035));
  const wh = mat('#e6dff0');
  for (const s of [-1, 1]) for (const dy of [-0.08, 0.06]) g.add(limb(wh, [s * 0.25, -0.22 + dy, 0.88], [s * 1.25, -0.22 + dy * 3, 0.7], 0.018, false));
  return g;
}
function bolt() {
  const s = new THREE.Shape();
  s.moveTo(0.25, 1.6); s.lineTo(-0.75, -0.1); s.lineTo(-0.05, -0.1); s.lineTo(-0.4, -1.6);
  s.lineTo(0.8, 0.3); s.lineTo(0.08, 0.3); s.lineTo(0.55, 1.6); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.4, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.08, bevelSegments: 2 }).translate(0, 0, -0.2);
  return mesh(g, mat('#ffd400', { emissive: '#ffb000', ei: 0.9, roughness: 0.4 }));
}
function moon() {
  const s = new THREE.Shape();
  const a1 = Math.atan2(0.85, 0.527), b1 = Math.atan2(0.85, -0.023);
  s.absarc(0, 0, 1, a1, Math.PI * 2 - a1, false);
  s.absarc(0.55, 0, 0.85, Math.PI * 2 - b1, b1, true);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.35, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.08, bevelSegments: 3, curveSegments: 24 }).translate(0, 0, -0.175);
  const grp = new THREE.Group();
  grp.add(mesh(g, mat('#fff2a8', { emissive: '#ffd970', ei: 0.75, roughness: 0.5 })));
  const dark = mat('#5a4410');
  const lid = smile(dark, 0.12, -0.62, 0.22, 0.29, 0.035, Math.PI * 0.8);
  grp.add(lid);
  grp.add(smile(dark, 0.18, -0.55, -0.25, 0.29, 0.035, Math.PI * 0.7));
  grp.add(sphere(mat('#ffb0a0'), 0.1, -0.35, -0.05, 0.27, 1, 1, 0.3));
  return grp;
}
function candy() {
  const g = new THREE.Group();
  const orange = mat('#ff7b00', { emissive: '#ff5a00', ei: 0.35, roughness: 0.35 });
  const purple = mat('#8a3cc9', { emissive: '#4a1a80', ei: 0.4, roughness: 0.35 });
  g.add(sphere(orange, 1, 0, 0, 0, 1.0, 0.72, 0.72));
  for (const x of [-0.55, 0, 0.55]) {
    const R = 0.72 * Math.sqrt(1 - x * x) + 0.01;
    const t = mesh(geo(`candystripe${R.toFixed(2)}`, () => new THREE.TorusGeometry(R, 0.07, 6, 20)), purple, x, 0, 0);
    t.rotation.y = Math.PI / 2;
    g.add(t);
  }
  for (const s of [-1, 1]) {
    g.add(sphere(orange, 0.14, s * 1.02, 0, 0, 1.2, 1, 1));
    const c = cone(orange, 0.55, 0.75, s * 1.05, 0, 0, 7);
    c.rotation.z = s * Math.PI / 2;
    g.add(c);
  }
  return g;
}

export function makeIcon(name) {
  let o;
  switch (name) {
    case 'pumpkin': o = makePumpkin(3.4, 1); o.userData.glow.visible = false; break;
    case 'ghost': o = bigGhost(1, 0.6); break;
    case 'witchhat': o = makeWitchHat({ bandGlow: true, band: '#b05cff', color: '#1d1430' }); break;
    case 'bat': o = makeBat(); o.rotation.x = 0.7; break;
    case 'spider': o = makeSpider(); o.rotation.x = -0.5; break;
    case 'skull': o = makeSkull(true); break;
    case 'cauldron': o = makeCauldron(); break;
    case 'owl': o = makeOwl(); break;
    case 'cat': o = catHead(); break;
    case 'bolt': o = bolt(); break;
    case 'moon': o = moon(); break;
    case 'candy': o = candy(); break;
    default: o = makePumpkin(3.4, 1);
  }
  const g = normalize(o, 4);
  const glow = makeGlow(ICON_GLOW[name] || '#ff7b00', 7, 0.35);
  g.add(glow);
  g.userData.inner = o;
  g.userData.glow = glow;
  g.userData.name = name;
  return g;
}
