// The spooky steam engine and its open wagons.
// Local frame: +x is forward, +z is the right-hand side, y is up. The rail tops are at y = 0.72.
import * as THREE from 'three';
import { mat, basic, makeGlow } from './materials.js';
import * as MD from './models.js';

const RAIL_TOP = 0.72;
const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);

function makeWheel(r, rimM, hubM) {
  const g = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.32, 22), rimM);
  rim.rotation.x = Math.PI / 2;
  g.add(rim);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.3, r * 0.3, 0.4, 10), hubM);
  hub.rotation.x = Math.PI / 2;
  g.add(hub);
  for (let i = 0; i < 3; i++) {
    const spoke = box(r * 1.8, 0.14, 0.36, hubM);
    spoke.rotation.z = i * Math.PI / 3;
    g.add(spoke);
  }
  return g;
}

export function makeEngine() {
  const g = new THREE.Group();
  const black = mat('#1d1622', { roughness: 0.5, metalness: 0.4 });
  const purple = mat('#5b2a86', { roughness: 0.35, metalness: 0.35 });
  const orange = mat('#ff7b00', { roughness: 0.4, metalness: 0.3 });
  const gold = mat('#ffb347', { roughness: 0.3, metalness: 0.7 });
  const wheels = [];

  const chassis = box(10.6, 0.7, 2.6, black); chassis.position.y = 1.65; g.add(chassis);
  const beam = box(0.4, 0.9, 3.4, mat('#c1272d')); beam.position.set(5.4, 1.5, 0); g.add(beam);
  for (const z of [-1.2, 1.2]) {
    const buf = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.5, 10), black);
    buf.rotation.z = Math.PI / 2; buf.position.set(5.8, 1.5, z); g.add(buf);
  }
  // cow catcher
  const cc = new THREE.Shape();
  cc.moveTo(0, 0); cc.lineTo(1.4, 0); cc.lineTo(0, 1.1); cc.lineTo(0, 0);
  const ccg = new THREE.ExtrudeGeometry(cc, { depth: 2.8, bevelEnabled: false });
  ccg.translate(0, 0, -1.4);
  const catcher = new THREE.Mesh(ccg, mat('#3a3340', { metalness: 0.6, roughness: 0.4 }));
  catcher.position.set(5.55, RAIL_TOP + 0.05, 0);
  g.add(catcher);

  // driving wheels and coupling rods
  const R = 1.05, cy = RAIL_TOP + R;
  const rods = [];
  for (const z of [-1.55, 1.55]) {
    for (const x of [2.7, 0.3, -2.1]) {
      const w = makeWheel(R, orange, black);
      w.position.set(x, cy, z);
      g.add(w); wheels.push(w);
    }
    const rod = box(5.2, 0.22, 0.12, gold);
    rod.position.set(0.3, cy, z + Math.sign(z) * 0.28);
    g.add(rod); rods.push(rod);
  }
  // small leading wheels
  for (const z of [-1.4, 1.4]) {
    const w = makeWheel(0.6, black, gold);
    w.position.set(4.6, RAIL_TOP + 0.6, z);
    g.add(w); wheels.push(w);
  }

  // boiler with orange bands
  const boiler = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.45, 6.8, 22), purple);
  boiler.rotation.z = Math.PI / 2; boiler.position.set(1.5, 3.3, 0); g.add(boiler);
  for (const x of [-1.2, 0.8, 2.8]) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(1.52, 1.52, 0.3, 22), orange);
    band.rotation.z = Math.PI / 2; band.position.set(x, 3.3, 0); g.add(band);
  }
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), gold);
  dome.position.set(0.6, 4.55, 0); g.add(dome);

  // chimney wearing a witch's hat
  const chim = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.45, 1.9, 14), black);
  chim.position.set(3.4, 5.2, 0); g.add(chim);
  const hat = MD.makeWitchHat();
  const hb = new THREE.Box3().setFromObject(hat), hs = 2.2 / Math.max(0.01, hb.max.x - hb.min.x);
  hat.scale.setScalar(hs);
  hat.position.set(3.4, 6.1 - hb.min.y * hs, 0);
  hat.rotation.z = 0.15;
  g.add(hat);

  // jack-o'-lantern on the front
  const pumpkin = MD.makePumpkin(3.0, 7);
  const pb = new THREE.Box3().setFromObject(pumpkin), ps = 3.0 / Math.max(0.01, pb.max.y - pb.min.y);
  pumpkin.scale.setScalar(ps);
  pumpkin.rotation.y = Math.PI / 2; // its face looks forward
  pumpkin.position.set(5.0, 3.3 - (pb.min.y + pb.max.y) / 2 * ps, 0);
  g.add(pumpkin);

  // cab
  const cabM = mat('#3d1c5c', { roughness: 0.5 });
  const cab = box(3.6, 2.4, 3.2, cabM); cab.position.set(-3.6, 3.1, 0); g.add(cab);
  for (const [x, z] of [[-1.95, -1.5], [-1.95, 1.5], [-5.25, -1.5], [-5.25, 1.5]]) {
    const post = box(0.3, 2.2, 0.3, cabM); post.position.set(x, 5.4, z); g.add(post);
  }
  const roof = box(4.4, 0.35, 3.8, orange); roof.position.set(-3.6, 6.6, 0); g.add(roof);
  const roof2 = box(3.6, 0.3, 3.2, black); roof2.position.set(-3.6, 6.9, 0); g.add(roof2);
  const front = box(0.25, 2.2, 3.2, cabM); front.position.set(-1.95, 5.4, 0); front.scale.z = 0.999; g.add(front);
  // round spectacle windows in the front of the cab
  for (const z of [-0.85, 0.85]) {
    const win = new THREE.Mesh(new THREE.CircleGeometry(0.5, 16), basic('#ffcf6a'));
    win.position.set(-1.8, 5.5, z); win.rotation.y = Math.PI / 2; g.add(win);
  }
  // our driver
  const driver = MD.makePassenger('witch');
  driver.scale.setScalar(0.75);
  driver.position.set(-3.8, 2.2, 0);
  g.add(driver);

  const light = new THREE.PointLight('#ff9a3a', 60, 32, 1.6);
  light.position.set(7.5, 3.5, 0);
  g.add(light);
  const glow = makeGlow('#ff8a1a', 9, 0.55);
  glow.position.set(6.2, 3.3, 0);
  g.add(glow);

  g.userData = { wheels, rods, rodY: cy, pumpkin, glow, light, chimneyTop: new THREE.Vector3(3.4, 7.4, 0), driver, len: 11.2 };
  return g;
}

export const CAR_COLORS = ['#6a2c9c', '#2f7a3e', '#b4501a'];
export const SEAT_X = [2.1, -2.1];
export const FLOOR_Y = 1.95;

export function makeWagon(color) {
  const g = new THREE.Group();
  const black = mat('#1d1622', { roughness: 0.5, metalness: 0.4 });
  const body = mat(color, { roughness: 0.5, metalness: 0.15 });
  const trim = mat('#ff7b00', { roughness: 0.4, metalness: 0.3 });
  const wheels = [];
  const chassis = box(8.2, 0.5, 2.4, black); chassis.position.y = 1.5; g.add(chassis);
  for (const z of [-1.4, 1.4]) {
    for (const x of [-2.8, 2.8]) {
      const w = makeWheel(0.75, black, trim);
      w.position.set(x, RAIL_TOP + 0.75, z);
      g.add(w); wheels.push(w);
    }
  }
  const floor = box(8.4, 0.3, 3.2, black); floor.position.y = 1.85; g.add(floor);
  for (const z of [-1.5, 1.5]) { const s = box(8.4, 1.4, 0.22, body); s.position.set(0, 2.65, z); g.add(s); }
  for (const x of [-4.1, 4.1]) { const s = box(0.22, 1.4, 3.2, body); s.position.set(x, 2.65, 0); g.add(s); }
  // orange rim and a stripe along each side
  for (const z of [-1.5, 1.5]) {
    const r = box(8.6, 0.2, 0.34, trim); r.position.set(0, 3.42, z); g.add(r);
    const st = box(7.4, 0.18, 0.05, trim); st.position.set(0, 2.4, z + Math.sign(z) * 0.13); g.add(st);
  }
  for (const x of [-4.1, 4.1]) { const r = box(0.34, 0.2, 3.4, trim); r.position.set(x, 3.42, 0); g.add(r); }
  // coupling at the front
  const cp = box(1.6, 0.25, 0.3, black); cp.position.set(4.7, 1.5, 0); g.add(cp);
  g.userData = { wheels, len: 8.8 };
  return g;
}
