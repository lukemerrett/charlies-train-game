// Shared materials and glow sprites, cached so lots of models can share them.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const cache = new Map();

function build(color, o) {
  const m = new THREE.MeshStandardMaterial({
    color, roughness: o.roughness ?? 0.75, metalness: o.metalness ?? 0, flatShading: !!o.flat,
  });
  if (o.emissive) { m.emissive = new THREE.Color(o.emissive); m.emissiveIntensity = o.ei ?? 1; }
  if (o.opacity != null) { m.transparent = true; m.opacity = o.opacity; m.depthWrite = o.depthWrite ?? false; }
  if (o.side) m.side = o.side;
  return m;
}

// lit material, shared between everything with the same settings
export function mat(color, o = {}) {
  const key = 'std' + color + JSON.stringify(o);
  let m = cache.get(key);
  if (!m) { m = build(color, o); cache.set(key, m); }
  return m;
}
// lit material of its own, for things that flicker or fade
export function matU(color, o = {}) { return build(color, o); }

// unlit material, for glowing eyes, windows and flames
export function basic(color, o = {}) {
  const key = 'basic' + color + JSON.stringify(o);
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color });
    if (o.opacity != null) { m.transparent = true; m.opacity = o.opacity; m.depthWrite = false; }
    if (o.side) m.side = o.side;
    cache.set(key, m);
  }
  return m;
}

let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}
// a soft additive halo, `size` units across
export function makeGlow(color, size, opacity = 0.8) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  s.scale.set(size, size, 1);
  s.userData.baseOpacity = opacity;
  return s;
}

// a small seeded random number generator, so scenery is the same every time
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Merge every plain mesh inside `root` into one mesh per material, to save draw calls on phones.
// Moving parts must be listed in `keep` (or be sprites, instanced meshes or click targets) so they stay separate.
export function flatten(root, keep = []) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const skip = new Set();
  for (const k of keep) if (k) k.traverse((o) => skip.add(o));
  const groups = new Map();
  root.traverse((o) => {
    if (o === root || !o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || skip.has(o) || o.userData.proxy) return;
    if (Array.isArray(o.material) || o.material.visible === false) return;
    for (let p = o.parent; p && p !== root; p = p.parent) if (skip.has(p)) return;
    let a = groups.get(o.material);
    if (!a) groups.set(o.material, a = []);
    a.push(o);
  });
  for (const [m, list] of groups) {
    if (list.length < 2) continue;
    const needUv = !!(m.map || m.emissiveMap || m.alphaMap);
    const geos = [];
    let ok = true;
    for (const o of list) {
      let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      if (needUv && !g.attributes.uv) { ok = false; break; }
      for (const name of Object.keys(g.attributes)) if (!(name === 'position' || name === 'normal' || (needUv && name === 'uv'))) g.deleteAttribute(name);
      if (!g.attributes.normal) g.computeVertexNormals();
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      g.clearGroups();
      geos.push(g);
    }
    const merged = ok ? mergeGeometries(geos, false) : null;
    for (const g of geos) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, m);
    mesh.castShadow = list.some((o) => o.castShadow);
    mesh.receiveShadow = list.some((o) => o.receiveShadow);
    for (const o of list) o.parent.remove(o);
    root.add(mesh);
  }
  // drop groups left empty
  const empties = [];
  root.traverse((o) => { if (o !== root && !o.isMesh && !o.isSprite && !o.isLight && o.children.length === 0 && o.type === 'Group') empties.push(o); });
  for (const e of empties) e.parent && e.parent.remove(e);
  return root;
}
