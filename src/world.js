// Builds the model railway board: ground, track, river, bridge, tunnel, stations and scenery.
import * as THREE from 'three';
import { mat, matU, basic, makeGlow, rng, flatten } from './materials.js';
import * as MD from './models.js';
import {
  TRACK, L, BOARD, POND, SWAMP, RIVER, RIVER_W, WATER_Y, BRIDGE_S, BRIDGE_HALF,
  tp, frame, mod, modDist, nearestTrack, groundY, riverDist, ellipseQ, smooth, clamp,
} from './track.js';

// Train sizes, needed here to keep the tunnel clear of the stations
export const ENG_LEN = 11.2, CAR_LEN = 8.8, GAP = 1.4, NCARS = 3;
export const MID = ENG_LEN / 2 + GAP + (NCARS * CAR_LEN + (NCARS - 1) * GAP) / 2; // engine centre -> middle of the carriages
export const PLAT_HALF = 16, PLAT_IN = 3.0, PLAT_OUT = 8.6, PLAT_H = 0.9;
export const SPOT_OFF = [-12, -7.2, -2.4, 2.4, 7.2, 12];

export const STATION_DEFS = [
  { name: 'Pumpkin Patch', icon: 'pumpkin', wall: '#8a4a1c', roof: '#ff7b00', style: 'barn', glow: '#ff9a2a' },
  { name: 'Haunted House', icon: 'ghost', wall: '#4b3b66', roof: '#22182f', style: 'house', tower: true, glow: '#d9ccff' },
  { name: 'Witch Wood', icon: 'witchhat', wall: '#2c5435', roof: '#6a2c9c', style: 'cottage', glow: '#b05cff' },
  { name: 'Bat Castle', icon: 'bat', wall: '#6a6678', roof: '#2a2533', style: 'castle', glow: '#ff5a5a' },
  { name: 'Spider Hollow', icon: 'spider', wall: '#2b3a5c', roof: '#141a2a', style: 'house', glow: '#7cff4f' },
  { name: 'Skeleton Square', icon: 'skull', wall: '#cfc5a6', roof: '#5a4632', style: 'house', glow: '#fff3d0' },
  { name: 'Cauldron Corner', icon: 'cauldron', wall: '#3d5a2a', roof: '#1e2e14', style: 'cottage', glow: '#7cff4f' },
  { name: 'Owl Tower', icon: 'owl', wall: '#6b4a2e', roof: '#3b2414', style: 'tower', glow: '#ffd23f' },
  { name: 'Black Cat Cottage', icon: 'cat', wall: '#2a2030', roof: '#ff7b00', style: 'cottage', glow: '#ffd23f' },
  { name: 'Monster Mill', icon: 'bolt', wall: '#4f6b55', roof: '#2b2b2b', style: 'mill', glow: '#fff36a' },
  { name: 'Moonlight Halt', icon: 'moon', wall: '#2c3e6b', roof: '#a8b8e8', style: 'house', glow: '#c9d4ff' },
  { name: 'Candy Corner', icon: 'candy', wall: '#d94f8a', roof: '#ffd23f', style: 'cottage', glow: '#ff7ad1' },
];
const ST_SPACING = L / STATION_DEFS.length;
const ST_S0 = 40;
// the tunnel sits in the gap after the ninth station, clear of a train stopped at either end
export const TUNNEL_S = ST_S0 + 8 * ST_SPACING + 59;
export const TUN_HALF = 26, PORTAL = 19;
export const inTunnel = (s) => Math.abs(modDist(s, TUNNEL_S)) < PORTAL - 1;

const UP = new THREE.Vector3(0, 1, 0);
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3(1, 1, 1);

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------
// sweep a 2D profile [[lateral, height], ...] along the track from s0 to s1
function sweep(profile, s0, s1, step = 0.5, closed = false) {
  const n = closed ? Math.round(L / step) : Math.max(2, Math.ceil((s1 - s0) / step) + 1);
  const ds = closed ? L / n : (s1 - s0) / (n - 1);
  const P = profile.length, pos = [], idx = [];
  for (let k = 0; k < n; k++) {
    const f = frame(s0 + k * ds);
    for (const [lat, h] of profile) pos.push(f.x + f.rx * lat, h, f.z + f.rz * lat);
  }
  const segs = closed ? n : n - 1;
  for (let k = 0; k < segs; k++) {
    const a = k * P, b = ((k + 1) % n) * P;
    for (let j = 0; j < P - 1; j++) idx.push(a + j, b + j, a + j + 1, a + j + 1, b + j, b + j + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
function place(obj, x, y, z, ry = 0) { obj.position.set(x, y, z); obj.rotation.y = ry; return obj; }
// yaw that turns a model's +z (its face) towards the camera
export const FACE_CAM = Math.PI / 4;

// ---------------------------------------------------------------------------
// The board
// ---------------------------------------------------------------------------
function groundColor(c, x, z, dTrack, y) {
  const n = Math.sin(x * 0.13 + Math.sin(z * 0.07) * 2) * Math.sin(z * 0.11 + Math.sin(x * 0.05) * 2);
  const m = Math.sin(x * 0.031 + 2) * Math.sin(z * 0.043 + 1);
  c.set('#2b4421').lerp(C_GRASS2, smooth(-0.3, 0.6, n));
  if (m > 0.45) c.lerp(C_DRY, smooth(0.45, 0.8, m) * 0.6);
  c.multiplyScalar(0.85 + 0.25 * clamp(y / 2, 0, 1));
  if (dTrack < 7) c.lerp(C_DIRT, 1 - smooth(3.5, 7, dTrack));
  if (y < 0) c.lerp(C_MUD, smooth(0, -1.2, y));
  return c;
}
const C_GRASS2 = new THREE.Color('#41592a'), C_DRY = new THREE.Color('#6b6231'), C_DIRT = new THREE.Color('#47392b'), C_MUD = new THREE.Color('#231e17');

function buildGround(scene) {
  const W = BOARD.x1 - BOARD.x0, H = BOARD.z1 - BOARD.z0;
  const g = new THREE.PlaneGeometry(W, H, Math.round(W / 1.6), Math.round(H / 1.6));
  g.rotateX(-Math.PI / 2);
  g.translate((BOARD.x0 + BOARD.x1) / 2, 0, (BOARD.z0 + BOARD.z1) / 2);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const d = nearestTrack(x, z).d;
    const edge = Math.min(x - BOARD.x0, BOARD.x1 - x, z - BOARD.z0, BOARD.z1 - z);
    const y = groundY(x, z, d) * smooth(0, 8, edge);
    pos.setY(i, y);
    groundColor(c, x, z, d, y).toArray(col, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  m.receiveShadow = true;
  scene.add(m);

  // the wooden frame of the model railway table, with bunting along the front edges
  const wood = mat('#4a2c17', { roughness: 0.6 }), trim = mat('#ff7b00', { roughness: 0.5 });
  const T = 2.2, D = 9;
  const sides = [
    [(BOARD.x0 + BOARD.x1) / 2, BOARD.z0 - T / 2, W + T * 2, T],
    [(BOARD.x0 + BOARD.x1) / 2, BOARD.z1 + T / 2, W + T * 2, T],
    [BOARD.x0 - T / 2, (BOARD.z0 + BOARD.z1) / 2, T, H],
    [BOARD.x1 + T / 2, (BOARD.z0 + BOARD.z1) / 2, T, H],
  ];
  for (const [x, z, w, d] of sides) {
    const b = box(w, D, d, wood); b.position.set(x, 0.5 - D / 2, z); b.receiveShadow = true; scene.add(b);
    const t = box(w + 0.1, 0.5, d + 0.1, trim); t.position.set(x, 0.6, z); scene.add(t);
  }
  scene.add(buildBunting(W, H));
}

function buildBunting(W, H) {
  // triangle flags on a sagging string along all four edges
  const pos = [], cols = [], c = new THREE.Color();
  const colors = ['#ff7b00', '#6a2c9c', '#111111', '#7cff4f'];
  const edges = [
    [BOARD.x0, BOARD.z0, BOARD.x1, BOARD.z0], [BOARD.x1, BOARD.z0, BOARD.x1, BOARD.z1],
    [BOARD.x1, BOARD.z1, BOARD.x0, BOARD.z1], [BOARD.x0, BOARD.z1, BOARD.x0, BOARD.z0],
  ];
  let k = 0;
  for (const [ax, az, bx, bz] of edges) {
    const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len;
    const span = 24, n = Math.round(len / span);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < 7; j++) {
        const t = (j + 0.5) / 7, sag = 1.6 * 4 * t * (1 - t);
        const d = (i + t) * len / n, x = ax + ux * d, z = az + uz * d, y = 5.5 - sag;
        const w = 0.9;
        pos.push(x - ux * w, y, z - uz * w, x + ux * w, y, z + uz * w, x, y - 1.9, z);
        c.set(colors[k++ % colors.length]);
        for (let q = 0; q < 3; q++) cols.push(c.r, c.g, c.b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.computeVertexNormals();
  const grp = new THREE.Group();
  grp.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8 })));
  // posts at the corners and along the edges
  const postM = mat('#2a1a10');
  for (const [ax, az, bx, bz] of edges) {
    const len = Math.hypot(bx - ax, bz - az), n = Math.round(len / 24);
    for (let i = 0; i < n; i++) {
      const t = i / n, p = box(0.5, 6, 0.5, postM);
      p.position.set(ax + (bx - ax) * t, 3, az + (bz - az) * t);
      grp.add(p);
    }
  }
  return grp;
}

// ---------------------------------------------------------------------------
// Track, bridge, river
// ---------------------------------------------------------------------------
function buildTrack(scene) {
  const b0 = BRIDGE_S - BRIDGE_HALF - 1, b1 = BRIDGE_S + BRIDGE_HALF + 1;
  const ballastP = [[2.7, -0.15], [1.9, 0.32], [-1.9, 0.32], [-2.7, -0.15]];
  const ballastM = mat('#4b4550', { roughness: 1 });
  const ballast = new THREE.Mesh(sweep(ballastP, b1, b0 + L, 0.5), ballastM);
  ballast.receiveShadow = true;
  scene.add(ballast);

  // sleepers
  const n = Math.round(L / 1.25), sg = new THREE.BoxGeometry(0.6, 0.2, 3.1);
  const sleepers = new THREE.InstancedMesh(sg, mat('#3a2616', { roughness: 0.9 }), n);
  for (let i = 0; i < n; i++) {
    const f = frame(i * L / n);
    tmpQ.setFromAxisAngle(UP, f.yaw);
    tmpM.compose(tmpV.set(f.x, 0.42, f.z), tmpQ, tmpS);
    sleepers.setMatrixAt(i, tmpM);
  }
  sleepers.receiveShadow = true;
  scene.add(sleepers);

  // rails
  const railM = mat('#b9b4c4', { metalness: 0.7, roughness: 0.3 });
  for (const side of [-1, 1]) {
    const c = side * 1.0;
    const prof = [[c - 0.14, 0.5], [c - 0.14, 0.72], [c + 0.14, 0.72], [c + 0.14, 0.5]];
    scene.add(new THREE.Mesh(sweep(prof, 0, L, 0.5, true), railM));
  }
  buildBridge(scene);
}

function buildBridge(parent) {
  const scene = new THREE.Group();
  const s0 = BRIDGE_S - BRIDGE_HALF, s1 = BRIDGE_S + BRIDGE_HALF;
  const deckM = mat('#3b2a1e', { roughness: 0.9 }), ironM = mat('#5a3d7a', { metalness: 0.5, roughness: 0.4 });
  const stoneM = mat('#5d5868', { roughness: 0.95 });
  const deck = new THREE.Mesh(sweep([[2.9, -0.7], [2.9, 0.32], [-2.9, 0.32], [-2.9, -0.7], [2.9, -0.7]], s0 - 1, s1 + 1, 0.5), deckM);
  deck.castShadow = deck.receiveShadow = true;
  scene.add(deck);
  // iron girders with diagonal bracing on each side
  for (const side of [-1, 1]) {
    const lat = side * 3.05;
    for (const [h0, h1] of [[-0.6, -0.1], [2.1, 2.5]]) {
      const g = new THREE.Mesh(sweep([[lat - 0.2, h0], [lat - 0.2, h1], [lat + 0.2, h1], [lat + 0.2, h0], [lat - 0.2, h0]], s0, s1, 0.5), ironM);
      g.castShadow = true;
      scene.add(g);
    }
    for (let s = s0; s <= s1 + 0.01; s += 3) {
      const f = frame(s);
      const post = box(0.3, 2.6, 0.3, ironM);
      post.position.set(f.x + f.rx * lat, 0.95, f.z + f.rz * lat);
      scene.add(post);
      if (s + 3 <= s1 + 0.01) {
        const g = frame(s + 1.5), diag = box(3.6, 0.22, 0.22, ironM);
        diag.position.set(g.x + g.rx * lat, 0.95, g.z + g.rz * lat);
        diag.rotation.set(0, g.yaw, ((s - s0) / 3) % 2 < 1 ? 0.62 : -0.62, 'YXZ');
        scene.add(diag);
      }
    }
  }
  // stone abutments at each end
  for (const s of [s0 - 1, s1 + 1]) {
    const f = frame(s), a = box(2.4, 2.4, 7, stoneM);
    place(a, f.x, -1.2, f.z, f.yaw);
    scene.add(a);
  }
  parent.add(flatten(scene));
}

function buildWater(scene, anim) {
  const waterM = new THREE.MeshStandardMaterial({ color: '#1d4f66', roughness: 0.08, metalness: 0.6, emissive: '#0b2733', transparent: true, opacity: 0.92 });
  // river ribbon
  const pos = [], idx = [];
  for (let i = 0; i < RIVER.length; i++) {
    const a = RIVER[Math.max(0, i - 1)], b = RIVER[Math.min(RIVER.length - 1, i + 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1];
    const n = Math.hypot(dx, dz); dx /= n; dz /= n;
    const w = RIVER_W * 1.25;
    pos.push(RIVER[i][0] - dz * w, WATER_Y, RIVER[i][1] + dx * w, RIVER[i][0] + dz * w, WATER_Y, RIVER[i][1] - dx * w);
    if (i > 0) { const k = (i - 1) * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const river = new THREE.Mesh(g, waterM);
  river.material.side = THREE.DoubleSide;
  scene.add(river);

  const pond = new THREE.Mesh(new THREE.CircleGeometry(1, 40), waterM);
  pond.rotation.x = -Math.PI / 2;
  pond.scale.set(POND.rx * 1.12, POND.rz * 1.12, 1);
  pond.position.set(POND.x, WATER_Y + 0.01, POND.z);
  scene.add(pond);

  const swampM = new THREE.MeshStandardMaterial({ color: '#3f7a1c', roughness: 0.2, metalness: 0.2, emissive: '#3b8a12', emissiveIntensity: 0.55 });
  const swamp = new THREE.Mesh(new THREE.CircleGeometry(1, 36), swampM);
  swamp.rotation.x = -Math.PI / 2;
  swamp.scale.set(SWAMP.rx * 1.12, SWAMP.rz * 1.12, 1);
  swamp.position.set(SWAMP.x, WATER_Y + 0.02, SWAMP.z);
  scene.add(swamp);
  anim.push((t) => { swampM.emissiveIntensity = 0.45 + Math.sin(t * 1.3) * 0.15; });
  return { pond, swamp };
}

// ---------------------------------------------------------------------------
// Tunnel through a hill
// ---------------------------------------------------------------------------
function buildTunnel(scene) {
  // the hill follows the curve of the track, with cuttings at each end
  const samples = [];
  for (let s = -TUN_HALF - 10; s <= TUN_HALF + 10; s += 1) samples.push({ u: s, f: frame(TUNNEL_S + s) });
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const { f } of samples) { minX = Math.min(minX, f.x); maxX = Math.max(maxX, f.x); minZ = Math.min(minZ, f.z); maxZ = Math.max(maxZ, f.z); }
  const pad = 30;
  minX -= pad; maxX += pad; minZ -= pad; maxZ += pad;
  const W = maxX - minX, H = maxZ - minZ;
  const g = new THREE.PlaneGeometry(W, H, Math.round(W / 1.2), Math.round(H / 1.2));
  g.rotateX(-Math.PI / 2);
  g.translate((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
  const rock = new THREE.Color('#6a6474');
  let peak = { y: 0, x: 0, z: 0 };
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    let bd = Infinity, bu = 0;
    for (const { u, f } of samples) {
      const d = (f.x - x) ** 2 + (f.z - z) ** 2;
      if (d < bd) { bd = d; bu = u; }
    }
    const d = Math.sqrt(bd);
    const along = Math.max(0, 1 - (bu / (TUN_HALF + 4)) ** 2);
    let h = 11 * Math.pow(along, 0.7) * Math.exp(-((d / 13) ** 2));
    h += (Math.sin(x * 0.4) * Math.sin(z * 0.37) + Math.sin(x * 0.17 + z * 0.23)) * 0.6 * Math.min(1, h / 4);
    if (Math.abs(bu) > PORTAL) h *= smooth(3.6, 8, d);
    const y = h > 0.25 ? h : -0.4;
    pos.setY(i, y);
    if (y > peak.y && d > 6) peak = { y, x, z };
    groundColor(c, x, z, 99, Math.min(2, y)).lerp(rock, smooth(3, 10, h) * 0.6).multiplyScalar(1.15).toArray(col, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const hill = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  hill.castShadow = hill.receiveShadow = true;
  scene.add(hill);

  // dark inside, only seen through the portals
  const inner = new THREE.Mesh(sweep([[3, -0.1], [3, 5], [2, 6.4], [0, 7], [-2, 6.4], [-3, 5], [-3, -0.1]], TUNNEL_S - PORTAL, TUNNEL_S + PORTAL, 0.5), basic('#07040c', { side: THREE.DoubleSide }));
  scene.add(inner);

  // stone portals
  const shape = new THREE.Shape();
  shape.moveTo(-5.5, 0); shape.lineTo(5.5, 0); shape.lineTo(5.5, 10); shape.lineTo(-5.5, 10); shape.lineTo(-5.5, 0);
  const hole = new THREE.Path();
  hole.moveTo(-3, 0); hole.lineTo(3, 0); hole.lineTo(3, 5); hole.absarc(0, 5, 3, 0, Math.PI, false); hole.lineTo(-3, 0);
  shape.holes.push(hole);
  const pg = new THREE.ExtrudeGeometry(shape, { depth: 1.4, bevelEnabled: false });
  pg.translate(0, 0, -0.7);
  const stoneM = mat('#6a6474', { roughness: 0.9 }), keyM = mat('#ff7b00', { emissive: '#ff5a00', ei: 0.4 });
  const eyes = [];
  for (const dir of [-1, 1]) {
    const f = frame(TUNNEL_S + dir * PORTAL);
    const p = new THREE.Mesh(pg, stoneM);
    p.position.set(f.x, 0, f.z);
    p.rotation.y = Math.atan2(f.fx, f.fz);
    p.castShadow = true;
    scene.add(p);
    const key = box(1.4, 1.6, 1.6, keyM);
    key.position.set(0, 8.6, 0); p.add(key);
    // glowing eyes peering out of the dark
    const ef = frame(TUNNEL_S + dir * (PORTAL - 3));
    const pair = new THREE.Group();
    for (const e of [-0.6, 0.6]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), basic('#ffe14d'));
      eye.position.set(ef.rx * e, 0, ef.rz * e);
      pair.add(eye);
    }
    pair.position.set(ef.x + ef.rx * 1.4 * dir, 4.6, ef.z + ef.rz * 1.4 * dir);
    scene.add(pair);
    eyes.push(pair);
  }
  return { peak, eyes };
}

// ---------------------------------------------------------------------------
// Stations
// ---------------------------------------------------------------------------
function signTexture(text, font) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#1e0b2b'; g.fillRect(0, 0, 512, 128);
  g.strokeStyle = '#ff7b00'; g.lineWidth = 10; g.strokeRect(5, 5, 502, 118);
  let size = 72;
  g.font = `${size}px ${font}`;
  while (g.measureText(text).width > 470 && size > 20) { size -= 2; g.font = `${size}px ${font}`; }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = '#ff7b00'; g.shadowBlur = 16;
  g.fillStyle = '#ffb347'; g.fillText(text, 256, 68);
  return c;
}
export const signs = [];
export function redrawSigns() {
  for (const s of signs) {
    const c = signTexture(s.text, 'Creepster, "Trebuchet MS", sans-serif');
    s.tex.image = c; s.tex.needsUpdate = true;
  }
}
function makeSign(text) {
  const tex = new THREE.CanvasTexture(signTexture(text, '"Trebuchet MS", sans-serif'));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  signs.push({ text, tex });
  const g = new THREE.Group();
  const board = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), new THREE.MeshBasicMaterial({ map: tex }));
  board.position.y = 3.6;
  const back = box(8.4, 2.4, 0.2, mat('#2a1a10'));
  back.position.set(0, 3.6, -0.12);
  g.add(board, back);
  for (const x of [-3.4, 3.4]) { const p = box(0.3, 3.6, 0.3, mat('#2a1a10')); p.position.set(x, 1.8, -0.2); g.add(p); }
  return g;
}

function gableRoof(W, D, rh, oh, m) {
  const g = new THREE.Group();
  const half = D / 2 + oh, slope = Math.hypot(half, rh), ang = Math.atan2(rh, half);
  for (const side of [-1, 1]) {
    const slab = box(W + oh * 2, 0.35, slope, m);
    slab.position.set(0, rh / 2, side * half / 2);
    slab.rotation.x = side * ang;
    g.add(slab);
  }
  return g;
}
function gableWall(W, D, rh, m) {
  const s = new THREE.Shape();
  s.moveTo(-D / 2, 0); s.lineTo(D / 2, 0); s.lineTo(0, rh); s.lineTo(-D / 2, 0);
  const geo = new THREE.ExtrudeGeometry(s, { depth: W, bevelEnabled: false });
  geo.translate(0, 0, -W / 2);
  geo.rotateY(Math.PI / 2);
  return new THREE.Mesh(geo, m);
}
const winGeo = new THREE.PlaneGeometry(1.3, 1.7), barGeo = new THREE.BoxGeometry(0.16, 1.8, 0.1), barGeo2 = new THREE.BoxGeometry(1.4, 0.16, 0.1);
function windowAt(parent, x, y, z, ry, lit) {
  const w = new THREE.Group();
  w.add(new THREE.Mesh(winGeo, lit));
  const frameM = mat('#1a0f0a');
  w.add(new THREE.Mesh(barGeo, frameM), new THREE.Mesh(barGeo2, frameM));
  w.position.set(x, y, z); w.rotation.y = ry;
  parent.add(w);
}
function crenellate(parent, W, D, y, m) {
  for (let x = -W / 2 + 0.5; x <= W / 2 - 0.4; x += 1.6) {
    for (const z of [-D / 2 + 0.4, D / 2 - 0.4]) { const b = box(0.9, 1, 0.8, m); b.position.set(x, y + 0.5, z); parent.add(b); }
  }
  for (let z = -D / 2 + 2; z <= D / 2 - 1.9; z += 1.6) {
    for (const x of [-W / 2 + 0.4, W / 2 - 0.4]) { const b = box(0.8, 1, 0.9, m); b.position.set(x, y + 0.5, z); parent.add(b); }
  }
}
function roundTower(parent, x, z, r, h, wallM, roofM, lit) {
  const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.08, h, 14), wallM);
  t.position.set(x, h / 2, z); parent.add(t);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(r * 1.35, r * 3, 14), roofM);
  roof.position.set(x, h + r * 1.5, z); parent.add(roof);
  windowAt(parent, x, h - 2.2, z - r - 0.02, Math.PI, lit);
  return h + r * 3;
}

// local frame: +x along the track, front of the building (door) faces -z towards the track
function buildStationHouse(def, lit) {
  const g = new THREE.Group();
  const wallM = mat(def.wall, { roughness: 0.85 }), roofM = mat(def.roof, { roughness: 0.7 });
  const doorM = mat('#2a160c');
  let W = 12, D = 7, H = 6, rh = 3.6, top;
  if (def.style === 'cottage') { W = 10; D = 6.5; H = 5; rh = 4.6; }
  if (def.style === 'barn') { W = 12; D = 8; H = 6.5; rh = 4.4; }
  const body = box(W, H, D, wallM); body.position.y = H / 2; g.add(body);
  if (def.style === 'castle') {
    H = 7; body.scale.y = 7 / 6; body.position.y = H / 2;
    crenellate(g, W, D, H, wallM);
    top = H + 1;
    for (const x of [-W / 2, W / 2]) top = Math.max(top, roundTower(g, x, -D / 2 + 1.2, 2, 10.5, wallM, roofM, lit));
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1), mat('#ff3b3b', { side: THREE.DoubleSide }));
    flag.position.set(-W / 2 + 0.8, top + 0.6, -D / 2 + 1.2); g.add(flag);
  } else {
    const gw = gableWall(W, D, rh, wallM); gw.position.y = H; g.add(gw);
    const roof = gableRoof(W, D, rh, 0.8, roofM); roof.position.y = H; g.add(roof);
    top = H + rh;
    const chim = box(1, 3, 1, mat('#4a3a3a')); chim.position.set(W / 2 - 2.2, H + rh - 0.4, D / 4); chim.rotation.z = 0.08; g.add(chim);
  }
  // door and windows on the front, windows on the ends
  const door = box(2, 3.4, 0.3, doorM); door.position.set(0, 1.7, -D / 2 - 0.05); g.add(door);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), mat('#ffb347', { metalness: 0.6 })); knob.position.set(0.6, 1.7, -D / 2 - 0.25); g.add(knob);
  if (def.style === 'barn') {
    for (const r of [0.8, -0.8]) { const x = box(2.6, 0.22, 0.1, mat('#d9c9a6')); x.position.set(0, 1.7, -D / 2 - 0.25); x.rotation.z = r * 1.05; g.add(x); }
  }
  for (const x of [-W / 2 + 2.2, W / 2 - 2.2]) windowAt(g, x, H * 0.55, -D / 2 - 0.03, Math.PI, lit);
  if (H > 5.5) windowAt(g, 0, H - 0.9 + (def.style === 'castle' ? -0.4 : 0.9), -D / 2 - 0.03, Math.PI, lit);
  windowAt(g, -W / 2 - 0.03, H * 0.55, 0, -Math.PI / 2, lit);
  windowAt(g, W / 2 + 0.03, H * 0.55, 0, Math.PI / 2, lit);

  let iconX = 0;
  if (def.tower) {
    top = Math.max(top, roundTower(g, W / 2 - 1.2, D / 2 - 1.5, 1.8, 11, wallM, roofM, lit));
    iconX = W / 2 - 1.2;
  }
  if (def.style === 'tower') {
    const th = roundTower(g, -W / 2 + 0.5, 1, 2.6, 15, wallM, roofM, lit);
    top = Math.max(top, th); iconX = -W / 2 + 0.5;
  }
  let sails = null;
  if (def.style === 'mill') {
    const mt = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.2, 13, 10), mat('#6b6458', { roughness: 0.9 }));
    mt.position.set(-W / 2 - 1.2, 6.5, 1.2); g.add(mt);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(2.8, 3, 10), roofM); cap.position.set(-W / 2 - 1.2, 14.5, 1.2); g.add(cap);
    sails = new THREE.Group();
    const sailM = mat('#d9c9a6', { roughness: 0.9 }), armM = mat('#3a2616');
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Group();
      const a = box(0.3, 7.5, 0.3, armM); a.position.y = 3.75; arm.add(a);
      const s = box(1.8, 5.5, 0.12, sailM); s.position.set(1.05, 4.6, 0); arm.add(s);
      arm.rotation.z = i * Math.PI / 2;
      sails.add(arm);
    }
    sails.position.set(-W / 2 - 1.2, 12.2, 1.2 - 3.4);
    g.add(sails);
    const hub = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), mat('#ff7b00')); hub.position.copy(sails.position); g.add(hub);
    top = Math.max(top, 16);
  }
  return { g, top: top + 5, iconX, sails };
}

function buildStations(scene, anim, api) {
  const stations = [];
  STATION_DEFS.forEach((def, i) => {
    const s = ST_S0 + i * ST_SPACING;
    const f = frame(s);
    const side = (f.rx + f.rz) >= 0 ? 1 : -1; // platform on the side facing the camera
    const st = { ...def, i, s, side, people: [], jt: -9 };

    // platform with an orange safety edge
    const prof = [[PLAT_IN * side, -0.1], [PLAT_IN * side, PLAT_H], [PLAT_OUT * side, PLAT_H], [PLAT_OUT * side, -0.1]];
    if (side < 0) prof.reverse();
    const plat = new THREE.Mesh(sweep(prof, s - PLAT_HALF, s + PLAT_HALF, 0.5), mat('#5c5766', { roughness: 0.95 }));
    plat.receiveShadow = true;
    scene.add(plat);
    const edgeP = [[(PLAT_IN + 0.05) * side, PLAT_H + 0.02], [(PLAT_IN + 0.6) * side, PLAT_H + 0.02]];
    if (side < 0) edgeP.reverse();
    scene.add(new THREE.Mesh(sweep(edgeP, s - PLAT_HALF, s + PLAT_HALF, 0.5), mat('#ff7b00', { emissive: '#ff5a00', ei: 0.35, side: THREE.DoubleSide })));
    for (const e of [-1, 1]) {
      const ef = frame(s + e * PLAT_HALF), cap = box(0.4, PLAT_H + 0.1, PLAT_OUT - PLAT_IN, mat('#5c5766'));
      place(cap, ef.x + ef.rx * side * (PLAT_IN + PLAT_OUT) / 2, (PLAT_H - 0.1) / 2, ef.z + ef.rz * side * (PLAT_IN + PLAT_OUT) / 2, ef.yaw);
      scene.add(cap);
    }

    // the station building across the tracks, or behind the platform if the far side is cramped
    let bSide = -side, off = 13;
    const clear = (sd, o) => [-6, 0, 6].every(a => [-4, 0, 4].every(b => {
      const q = frame(s + a);
      return nearestTrack(q.x + q.rx * sd * (o + b), q.z + q.rz * sd * (o + b), 3).d > 7;
    }));
    if (!clear(bSide, off)) { bSide = side; off = 17; }
    const lit = matU('#ffb347', { emissive: '#ffa030', ei: 1.4 });
    const house = buildStationHouse(def, lit);
    flatten(house.g, [house.sails]);
    const hx = f.x + f.rx * bSide * off, hz = f.z + f.rz * bSide * off;
    house.g.position.set(hx, 0, hz);
    house.g.rotation.y = Math.atan2(f.rx * bSide, f.rz * bSide);
    scene.add(house.g);

    // the mascot floats above the roof
    const icon = MD.makeIcon(def.icon);
    icon.scale.setScalar(1.7);
    flatten(icon);
    const holder = new THREE.Group();
    holder.add(icon);
    let glow = icon.userData.glow;
    if (!glow) { glow = makeGlow(def.glow, 11, 0.55); holder.add(glow); }
    const ip = new THREE.Vector3(house.iconX, house.top, 0).applyMatrix4(house.g.matrix.compose(house.g.position, house.g.quaternion, house.g.scale));
    holder.position.copy(ip);
    scene.add(holder);

    // name sign on the platform, turned to face the camera
    const sign = flatten(makeSign(def.name));
    const sf = frame(s - 2);
    sign.position.set(sf.x + sf.rx * side * (PLAT_OUT - 0.6), PLAT_H, sf.z + sf.rz * side * (PLAT_OUT - 0.6));
    sign.rotation.y = FACE_CAM;
    sign.scale.setScalar(1.4);
    scene.add(sign);

    // lamps at both ends of the platform
    st.lamps = [];
    for (const e of [-1, 1]) {
      const lf = frame(s + e * (PLAT_HALF - 1.5));
      const lamp = flatten(MD.makeLamp());
      lamp.position.set(lf.x + lf.rx * side * (PLAT_OUT - 0.8), PLAT_H, lf.z + lf.rz * side * (PLAT_OUT - 0.8));
      scene.add(lamp);
      st.lamps.push(lamp);
    }

    api.clickable(house.g, 7, 4, () => {
      api.play('bong'); st.jt = api.now();
      api.say(holder, def.name + '!');
      api.burst(holder.position, 14, [def.glow, '#ffffff', '#ff7b00']);
    });
    Object.assign(st, { house: house.g, sails: house.sails, icon, iconHolder: holder, iconGlow: glow, iconY: ip.y, lit, sign, ph: i * 1.3 });
    stations.push(st);
    anim.push((t, dt) => {
      const excite = st.excite || 0;
      icon.rotation.y += dt * (0.7 + excite * 3);
      holder.position.y = st.iconY + Math.sin(t * 1.6 + st.ph) * 0.4 + excite * Math.abs(Math.sin(t * 6)) * 1.5;
      const pop = clamp(1 - (t - st.jt) / 0.6, 0, 1);
      holder.scale.setScalar(1 + pop * 0.35 + excite * 0.12);
      glow.material.opacity = 0.4 + excite * 0.5 + pop * 0.4;
      lit.emissiveIntensity = 1.2 + Math.sin(t * 9 + st.ph) * 0.12 * Math.sin(t * 2.3 + st.ph);
      if (st.sails) st.sails.rotation.z -= dt * 0.8;
    });
  });
  return stations;
}
export function spotWorld(st, k) {
  const f = frame(st.s + SPOT_OFF[k]);
  const lat = (PLAT_IN + PLAT_OUT) / 2 - 0.4;
  return new THREE.Vector3(f.x + f.rx * st.side * lat, PLAT_H, f.z + f.rz * st.side * lat);
}
export const stationTarget = (st) => st.s + MID;

// ---------------------------------------------------------------------------
// Scenery
// ---------------------------------------------------------------------------
export function buildWorld(scene, api) {
  const anim = [];
  buildGround(scene);
  buildTrack(scene);
  const water = buildWater(scene, anim);
  const tunnel = buildTunnel(scene);
  const stations = buildStations(scene, anim, api);
  const r = rng(2024);
  const placed = [];
  const tunnelF = frame(TUNNEL_S);

  const blockers = [];
  for (const st of stations) {
    for (const a of [-18, -9, 0, 9, 18]) {
      const f = frame(st.s + a);
      for (const off of [-20, -13, -6, 6, 13, 20]) blockers.push([f.x + f.rx * off, f.z + f.rz * off, 7]);
    }
  }
  const isFree = (x, z, rad) => {
    if (x < BOARD.x0 + 6 + rad || z < BOARD.z0 + 6 + rad || x > BOARD.x1 - 6 - rad || z > BOARD.z1 - 6 - rad) return false;
    if (nearestTrack(x, z, 3).d < 6 + rad) return false;
    if (riverDist(x, z) < RIVER_W * 1.9 + rad) return false;
    if (ellipseQ(POND, x, z) < 1.3 + rad / POND.rz || ellipseQ(SWAMP, x, z) < 1.3 + rad / SWAMP.rz) return false;
    if (Math.hypot(x - tunnelF.x, z - tunnelF.z) < 34 + rad) return false;
    for (const [bx, bz, br] of blockers) if (Math.hypot(x - bx, z - bz) < br + rad) return false;
    for (const p of placed) if (Math.hypot(x - p.x, z - p.z) < p.rad + rad + 1) return false;
    return true;
  };
  const add = (obj, x, z, rad, yOff = 0) => {
    obj.position.set(x, groundY(x, z) + yOff, z);
    scene.add(obj);
    placed.push({ x, z, rad });
    return obj;
  };
  const tryAdd = (make, rad, cx, cz, spread, yOff) => {
    for (let i = 0; i < 80; i++) {
      const x = cx != null ? cx + (r() - 0.5) * spread : BOARD.x0 + r() * (BOARD.x1 - BOARD.x0);
      const z = cz != null ? cz + (r() - 0.5) * spread : BOARD.z0 + r() * (BOARD.z1 - BOARD.z0);
      if (isFree(x, z, rad)) return add(make(), x, z, rad, yOff);
    }
    return null;
  };
  // a point out beyond the station on the given side
  const nearStation = (st, side, dist) => {
    const f = frame(st.s);
    return [f.x + f.rx * side * dist, f.z + f.rz * side * dist];
  };

  // --- clickable things -----------------------------------------------------
  const pumpkin = (size) => () => {
    const p = flatten(MD.makePumpkin(size, Math.floor(r() * 1e6)));
    p.rotation.y = FACE_CAM + (r() - 0.5) * 1.2;
    const ph = r() * 6;
    anim.push((t) => { p.userData.faceMat.emissiveIntensity = 1.3 + Math.sin(t * 7 + ph) * 0.25 * Math.sin(t * 2.1 + ph) + (p.userData.flare || 0); });
    api.clickable(p, size * 0.9, size * 0.5, () => {
      api.play('cackle'); api.say(p, 'Hee hee!');
      api.tween(0.8, (u) => { p.userData.flare = (1 - u) * 3; p.scale.setScalar(1 + Math.sin(u * Math.PI) * 0.35); });
      api.burst(p.position, 10, ['#ff7b00', '#ffd23f']);
    });
    return p;
  };
  const tree = (withOwl, withSpider) => () => {
    const t = flatten(MD.makeDeadTree(Math.floor(r() * 1e6)));
    t.rotation.y = r() * 6.28;
    t.scale.setScalar(0.85 + r() * 0.35);
    api.clickable(t, 4.5, 4, () => {
      api.play('rustle'); api.bats(t.position.clone().setY(t.position.y + 9), 4);
      api.tween(0.6, (u) => { t.rotation.z = Math.sin(u * Math.PI * 4) * 0.06 * (1 - u); });
    });
    if (withOwl) {
      const owl = flatten(MD.makeOwl());
      owl.position.set(0, 7.2, 0);
      owl.rotation.y = FACE_CAM - t.rotation.y;
      t.add(owl);
      api.clickable(owl, 1.6, 0.8, () => {
        api.play('hoot'); api.say(owl, 'Hoo hoo!');
        api.tween(0.8, (u) => { owl.rotation.y = FACE_CAM - t.rotation.y + Math.sin(u * Math.PI * 2) * 1.2; owl.position.y = 7.2 + Math.sin(u * Math.PI) * 0.8; });
      });
    }
    if (withSpider) {
      const sp = flatten(MD.makeSpider()), thread = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1, 4), basic('#d8d8e8'));
      const holder = new THREE.Group();
      holder.position.set(1.6, 7.5, 1.2);
      holder.add(thread, sp);
      t.add(holder);
      let drop = 3, target = 3;
      const ph = r() * 6;
      anim.push((tt, dt) => {
        drop += (target - drop) * Math.min(1, dt * 3);
        const d = drop + Math.sin(tt * 1.4 + ph) * 0.4;
        sp.position.y = -d; thread.scale.y = d; thread.position.y = -d / 2;
      });
      api.clickable(sp, 1.4, 0, () => {
        api.play('boing');
        target = target > 2 ? 0.8 : 5;
        setTimeout(() => { target = 3; }, 1600);
      });
    }
    return t;
  };
  const tomb = () => () => {
    const t = flatten(MD.makeTombstone(Math.floor(r() * 1e6)));
    t.rotation.y = FACE_CAM + (r() - 0.5) * 0.6;
    api.clickable(t, 1.8, 1.2, () => {
      api.play('boo');
      api.tween(0.5, (u) => { t.rotation.z = Math.sin(u * Math.PI * 5) * 0.08 * (1 - u); });
      api.ghostlet(t.position.clone().setY(t.position.y + 2));
    });
    return t;
  };
  const toad = () => () => {
    const t = flatten(MD.makeToadstool(Math.floor(r() * 1e6)));
    api.clickable(t, 1.2, 0.6, () => {
      api.play('boing');
      api.tween(0.5, (u) => { t.scale.set(1 + Math.sin(u * Math.PI) * 0.3, 1 - Math.sin(u * Math.PI) * 0.25, 1 + Math.sin(u * Math.PI) * 0.3); });
      api.burst(t.position.clone().setY(t.position.y + 1), 8, ['#b05cff', '#5ff1ff']);
    });
    return t;
  };
  const critter = (make, rad, hy, sound, words, extra) => () => {
    const c = flatten(make());
    c.rotation.y = FACE_CAM;
    api.clickable(c, rad, hy, () => {
      api.play(sound); api.say(c, words);
      const y0 = c.position.y;
      api.tween(0.6, (u) => { c.position.y = y0 + Math.sin(u * Math.PI) * 1.4; });
      if (extra) extra(c);
    });
    return c;
  };
  const lollipop = (color) => () => {
    const g = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 6, 8), mat('#f2eadf'));
    stick.position.y = 3; g.add(stick);
    const disc = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4 + i * 0.42, 0.24, 8, 24), mat(i % 2 ? '#fff4f8' : color, { roughness: 0.3 }));
      disc.add(ring);
    }
    const mid = new THREE.Mesh(new THREE.CircleGeometry(2.4, 24), mat(color, { side: THREE.DoubleSide }));
    disc.add(mid);
    disc.position.y = 6.6; disc.rotation.y = FACE_CAM;
    g.add(disc);
    api.clickable(g, 2.6, 6.6, () => {
      api.play('pop');
      api.tween(0.7, (u) => { disc.rotation.z = u * Math.PI * 2; });
      api.burst(disc.getWorldPosition(new THREE.Vector3()), 10, ['#ff7ad1', '#ffffff', '#ffd23f']);
    });
    return g;
  };

  // --- the themed corner by each station ---------------------------------
  const themes = {
    'Pumpkin Patch': (x, z) => { for (let i = 0; i < 9; i++) tryAdd(pumpkin(1.3 + r() * 1.2), 1.8, x, z, 22); },
    'Haunted House': (x, z) => { for (let i = 0; i < 4; i++) tryAdd(tomb(), 1.6, x, z, 20); tryAdd(tree(false, false), 3, x, z, 22); },
    'Witch Wood': (x, z) => { for (let i = 0; i < 7; i++) tryAdd(tree(i === 0, false), 3.2, x, z, 30); },
    'Bat Castle': (x, z) => { for (let i = 0; i < 3; i++) tryAdd(tree(false, false), 3, x, z, 24); api.batRoost(new THREE.Vector3(x, 14, z)); },
    'Spider Hollow': (x, z) => { for (let i = 0; i < 4; i++) tryAdd(tree(false, true), 3.2, x, z, 26); },
    'Skeleton Square': (x, z) => { for (let i = 0; i < 6; i++) tryAdd(tomb(), 1.6, x, z, 20); },
    'Cauldron Corner': (x, z) => {
      const c = tryAdd(() => {
        const cd = MD.makeCauldron();
        flatten(cd, [...(cd.userData.flames || []), ...(cd.userData.bubbles || [])]);
        anim.push((t) => {
          cd.userData.liquidMat.emissiveIntensity = 0.9 + Math.sin(t * 5) * 0.3;
          cd.userData.flames.forEach((fl, i) => { fl.scale.y = 0.8 + Math.abs(Math.sin(t * 9 + i * 2)) * 0.5; });
        });
        api.clickable(cd, 2, 1.2, () => { api.play('bubble'); api.say(cd, 'Bubble bubble!'); api.burst(cd.position.clone().setY(cd.position.y + 2.5), 16, ['#7cff4f', '#b05cff']); });
        return cd;
      }, 3, x, z, 10);
      if (c) {
        const w = flatten(MD.makePassenger('witch'));
        w.scale.setScalar(1.25);
        w.rotation.y = FACE_CAM;
        add(w, c.position.x + 3.2, c.position.z - 1.5, 1.5);
        api.clickable(w, 2.2, 2, () => {
          api.play('cackle'); api.say(w, 'Hee hee hee!');
          api.tween(0.9, (u) => { w.rotation.y = FACE_CAM + u * Math.PI * 2; });
        });
      }
    },
    'Owl Tower': (x, z) => { for (let i = 0; i < 4; i++) tryAdd(tree(i < 2, false), 3.2, x, z, 24); },
    'Black Cat Cottage': (x, z) => {
      for (let i = 0; i < 3; i++) tryAdd(critter(() => { const c = MD.makePassenger('cat'); c.scale.setScalar(0.85); return c; }, 1.8, 1.4, 'meow', 'Meow!'), 1.6, x, z, 18);
      for (let i = 0; i < 3; i++) tryAdd(pumpkin(1.2 + r()), 1.6, x, z, 20);
    },
    'Monster Mill': (x, z) => {
      tryAdd(() => {
        const g = new THREE.Group();
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.5, 9, 8), mat('#555060', { metalness: 0.6, roughness: 0.4 }));
        pole.position.y = 4.5; g.add(pole);
        for (let i = 0; i < 3; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1 - i * 0.25, 0.18, 8, 16), mat('#b87333', { metalness: 0.8, roughness: 0.3 })); ring.rotation.x = Math.PI / 2; ring.position.y = 6 + i * 1.1; g.add(ring); }
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 12), matU('#c9f7ff', { emissive: '#7fe8ff', ei: 1 }));
        ball.position.y = 9.6; g.add(ball);
        const glow = makeGlow('#7fe8ff', 7, 0.5); glow.position.y = 9.6; g.add(glow);
        let zap = -9;
        anim.push((t) => { const k = clamp(1 - (t - zap) / 0.8, 0, 1); ball.material.emissiveIntensity = 0.8 + Math.random() * 0.3 + k * 3; glow.material.opacity = 0.35 + k * 0.6 + Math.random() * 0.1; });
        api.clickable(g, 2.5, 7, () => { zap = api.now(); api.play('zap'); api.say(ball, 'Bzzzt!'); api.burst(ball.getWorldPosition(new THREE.Vector3()), 18, ['#7fe8ff', '#ffffff', '#fff36a']); });
        return g;
      }, 2.5, x, z, 14);
      tryAdd(tree(false, false), 3, x, z, 26);
    },
    'Moonlight Halt': (x, z) => { for (let i = 0; i < 9; i++) tryAdd(toad(), 1.2, x, z, 18); },
    'Candy Corner': (x, z) => { ['#ff4fa3', '#ff7b00', '#7cff4f', '#b05cff'].forEach(c => tryAdd(lollipop(c), 2.6, x, z, 22)); },
  };
  for (const st of stations) {
    const theme = themes[st.name];
    // prefer the open ground beyond the platform, then beyond the building
    const [x1, z1] = nearStation(st, st.side, 26), [x2, z2] = nearStation(st, -st.side, 30);
    const p = isFree(x1, z1, 6) ? [x1, z1] : [x2, z2];
    theme(p[0], p[1]);
  }

  // --- the frog in the pond, the wolf on the tunnel hill -------------------
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 0.15, 16, 1, false, 0.3, Math.PI * 1.8), mat('#3f7a2a'));
  pad.position.set(POND.x + 6, WATER_Y + 0.1, POND.z + 4);
  scene.add(pad);
  for (const [dx, dz] of [[-10, -3], [-2, 7], [9, -6]]) {
    const p2 = pad.clone(); p2.scale.setScalar(0.7); p2.position.set(POND.x + dx, WATER_Y + 0.08, POND.z + dz); p2.rotation.y = dx; scene.add(p2);
  }
  const frog = flatten(MD.makeFrog());
  frog.position.set(pad.position.x, pad.position.y + 0.08, pad.position.z);
  frog.rotation.y = FACE_CAM;
  scene.add(frog);
  api.clickable(frog, 1.4, 0.6, () => {
    api.play('ribbit'); api.say(frog, 'Ribbit!');
    const y0 = pad.position.y + 0.08;
    api.tween(0.7, (u) => { frog.position.y = y0 + Math.sin(u * Math.PI) * 2.5; frog.rotation.y = FACE_CAM + u * Math.PI * 2; });
  });
  api.clickable(water.pond, 0, 0, (pt) => { api.play('splash'); api.splash(pt); }, { radius: Math.max(POND.rx, POND.rz) * 1.1, offset: new THREE.Vector3(0, 0, 0), scaleWithParent: false });
  api.clickable(water.swamp, 0, 0, (pt) => { api.play('bubble'); api.splash(pt, '#7cff4f'); }, { radius: Math.max(SWAMP.rx, SWAMP.rz) * 1.1, scaleWithParent: false });

  const wolf = flatten(MD.makeWolf());
  wolf.position.set(tunnel.peak.x, tunnel.peak.y - 0.3, tunnel.peak.z);
  wolf.rotation.y = FACE_CAM;
  scene.add(wolf);
  api.clickable(wolf, 2.4, 1.8, () => {
    api.play('howl'); api.say(wolf, 'Awoooo!');
    api.tween(1.6, (u) => { wolf.rotation.x = -Math.sin(u * Math.PI) * 0.25; });
  });
  anim.push((t) => {
    for (const [i, e] of tunnel.eyes.entries()) e.scale.y = (Math.sin(t * 0.9 + i * 2) > 0.96) ? 0.1 : 1;
  });

  // --- the graveyard with a fence and a cat, a pumpkin patch, and lots of trees ---
  const GY = [-104, 12];
  for (let i = 0; i < 12; i++) {
    const x = GY[0] + (i % 4) * 5 - 7.5 + (r() - 0.5), z = GY[1] + Math.floor(i / 4) * 5.5 - 5.5 + (r() - 0.5);
    if (isFree(x, z, 1.5)) add(tomb()(), x, z, 1.5);
  }
  const fenceM = mat('#1c1a22', { metalness: 0.6, roughness: 0.5 });
  const fence = new THREE.Group();
  const fx0 = GY[0] - 12, fx1 = GY[0] + 12, fz0 = GY[1] - 10, fz1 = GY[1] + 10;
  for (const [ax, az, bx, bz] of [[fx0, fz0, fx1, fz0], [fx1, fz0, fx1, fz1], [fx1, fz1, GY[0] + 3, fz1], [GY[0] - 3, fz1, fx0, fz1], [fx0, fz1, fx0, fz0]]) {
    const len = Math.hypot(bx - ax, bz - az), n = Math.round(len / 0.9);
    for (let i = 0; i <= n; i++) {
      const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n, y = groundY(x, z);
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.2, 5), fenceM); bar.position.set(x, y + 1.1, z); fence.add(bar);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.4, 5), fenceM); tip.position.set(x, y + 2.3, z); fence.add(tip);
    }
    for (const h of [0.5, 1.8]) {
      const rail = box(len, 0.12, 0.12, fenceM);
      rail.position.set((ax + bx) / 2, groundY((ax + bx) / 2, (az + bz) / 2) + h, (az + bz) / 2);
      rail.rotation.y = Math.atan2(-(bz - az), bx - ax);
      fence.add(rail);
    }
  }
  scene.add(flatten(fence));
  placed.push({ x: GY[0], z: GY[1], rad: 14 });
  tryAdd(critter(() => { const c = MD.makePassenger('cat'); c.scale.setScalar(0.8); return c; }, 1.8, 1.4, 'meow', 'Meow!'), 1.5, GY[0] + 4, GY[1] + 15, 6);
  tryAdd(critter(() => MD.makePassenger('skeleton'), 2, 1.6, 'giggle', 'Rattle rattle!'), 1.6, GY[0] - 4, GY[1] + 15, 6);

  for (let i = 0; i < 10; i++) tryAdd(pumpkin(1.4 + r() * 1.4), 2, -30, 112, 40);
  tryAdd(critter(() => MD.makePassenger('pumpkin'), 2, 1.6, 'giggle', 'Trick or treat!'), 1.6, -30, 112, 30);
  tryAdd(critter(() => MD.makePassenger('monster'), 2, 1.8, 'boo', 'Raaa!'), 1.6, 40, -40, 30);
  tryAdd(critter(() => MD.makePassenger('mummy'), 2, 1.8, 'boo', 'Mmmm!'), 1.6, -50, -50, 30);
  tryAdd(critter(() => MD.makePassenger('vampire'), 2, 1.8, 'giggle', 'Bleh bleh!'), 1.6, 60, 30, 30);
  let spiders = 0, owls = 0;
  for (let i = 0; i < 70; i++) {
    const t = tryAdd(tree(owls < 2 && r() < 0.1, spiders < 3 && r() < 0.1), 3.2);
    if (t) { /* counted via closures */ }
  }
  for (let i = 0; i < 26; i++) tryAdd(toad(), 1.1);
  for (let i = 0; i < 16; i++) tryAdd(pumpkin(1.1 + r() * 1.2), 1.6);
  for (let i = 0; i < 10; i++) tryAdd(tomb(), 1.6);

  // grass tufts and fallen leaves, instanced
  const tuftG = new THREE.ConeGeometry(0.35, 1.3, 4);
  tuftG.translate(0, 0.6, 0);
  const tufts = new THREE.InstancedMesh(tuftG, mat('#4f6b2c', { roughness: 1 }), 1600);
  const leafG = new THREE.CircleGeometry(0.45, 5);
  leafG.rotateX(-Math.PI / 2);
  const leaves = new THREE.InstancedMesh(leafG, mat('#ffffff', { roughness: 1, side: THREE.DoubleSide }), 900);
  const leafCols = ['#c4501a', '#e07a1f', '#8a2f12', '#d9a02b'].map(c => new THREE.Color(c));
  let nt = 0, nl = 0;
  for (let tries = 0; tries < 9000 && (nt < 1600 || nl < 900); tries++) {
    const x = BOARD.x0 + 4 + r() * (BOARD.x1 - BOARD.x0 - 8), z = BOARD.z0 + 4 + r() * (BOARD.z1 - BOARD.z0 - 8);
    const d = nearestTrack(x, z, 3).d;
    if (d < 4.5 || riverDist(x, z) < RIVER_W * 1.6 || ellipseQ(POND, x, z) < 1.25 || ellipseQ(SWAMP, x, z) < 1.25) continue;
    if (blockers.some(([bx, bz]) => Math.hypot(x - bx, z - bz) < 5)) continue;
    const y = groundY(x, z, d);
    if (nt < 1600) {
      tmpQ.setFromAxisAngle(UP, r() * 6);
      const sc = 0.6 + r() * 0.9;
      tmpM.compose(tmpV.set(x, y, z), tmpQ, tmpS.set(sc, sc * (0.7 + r() * 0.8), sc));
      tufts.setMatrixAt(nt++, tmpM);
    } else {
      tmpQ.setFromAxisAngle(UP, r() * 6);
      tmpM.compose(tmpV.set(x, y + 0.05, z), tmpQ, tmpS.set(1, 1, 1));
      leaves.setMatrixAt(nl, tmpM);
      leaves.setColorAt(nl++, leafCols[Math.floor(r() * leafCols.length)]);
    }
  }
  tmpS.set(1, 1, 1);
  tufts.count = nt; leaves.count = nl;
  tufts.receiveShadow = leaves.receiveShadow = true;
  scene.add(tufts, leaves);

  return { stations, anim, tunnel };
}
