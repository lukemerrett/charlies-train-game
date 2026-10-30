// The layout of the model railway: the track loop, the river, the pond and the ground height.
// Pure maths, no three.js, so it can be checked with node.
// World units: y is up, the board lies in x/z. A passenger is about 3 units tall.

// The track is a winding flower-shaped loop written in polar form, so it can never cross itself.
function polar(t) {
  const r = 1 + 0.32 * Math.sin(5 * t + 0.4) + 0.1 * Math.sin(2 * t + 1.1);
  return [160 * r * Math.cos(t), 110 * r * Math.sin(t)];
}

export const BOARD = { x0: -234, x1: 252, z0: -148, z1: 166 };

// resample the loop evenly by distance
export const TRACK = (() => {
  const M = 24000, pts = [];
  for (let i = 0; i <= M; i++) pts.push(polar(i / M * Math.PI * 2));
  const cum = [0];
  for (let i = 1; i <= M; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = cum[M];
  const N = Math.round(L / 0.5);
  const xs = new Float32Array(N), zs = new Float32Array(N);
  let j = 0;
  for (let i = 0; i < N; i++) {
    const s = i * L / N;
    while (cum[j + 1] < s) j++;
    const t = (s - cum[j]) / (cum[j + 1] - cum[j]);
    xs[i] = pts[j][0] + (pts[j + 1][0] - pts[j][0]) * t;
    zs[i] = pts[j][1] + (pts[j + 1][1] - pts[j][1]) * t;
  }
  return { L, N, step: L / N, xs, zs };
})();
export const L = TRACK.L;

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const mod = (s) => ((s % L) + L) % L;
// signed distance along the track from b to a, the short way round
export function modDist(a, b) { let d = mod(a - b); if (d > L / 2) d -= L; return d; }

// position at distance s along the track
export function tp(s) {
  const f = mod(s) / TRACK.step, i = Math.floor(f) % TRACK.N, t = f - Math.floor(f), j = (i + 1) % TRACK.N;
  return { x: TRACK.xs[i] + (TRACK.xs[j] - TRACK.xs[i]) * t, z: TRACK.zs[i] + (TRACK.zs[j] - TRACK.zs[i]) * t };
}
// position, forward and right vectors, and the yaw that turns a model's +x to face along the track
export function frame(s) {
  const a = tp(s - 1), b = tp(s + 1), p = tp(s);
  let fx = b.x - a.x, fz = b.z - a.z;
  const n = Math.hypot(fx, fz) || 1;
  fx /= n; fz /= n;
  return { x: p.x, z: p.z, fx, fz, rx: -fz, rz: fx, yaw: Math.atan2(-fz, fx) };
}

// nearest track point, via a coarse grid
const CELL = 10, grid = new Map();
for (let i = 0; i < TRACK.N; i++) {
  const k = Math.floor(TRACK.xs[i] / CELL) + ',' + Math.floor(TRACK.zs[i] / CELL);
  let a = grid.get(k);
  if (!a) grid.set(k, a = []);
  a.push(i);
}
export function nearestTrack(x, z, reach = 2) {
  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
  let bd = Infinity, bi = -1;
  for (let dx = -reach; dx <= reach; dx++) for (let dz = -reach; dz <= reach; dz++) {
    const a = grid.get((cx + dx) + ',' + (cz + dz));
    if (!a) continue;
    for (const i of a) {
      const d = (TRACK.xs[i] - x) ** 2 + (TRACK.zs[i] - z) ** 2;
      if (d < bd) { bd = d; bi = i; }
    }
  }
  return { d: bi < 0 ? (reach + 1) * CELL : Math.sqrt(bd), s: bi * TRACK.step };
}

// the pond in the middle, and the river that runs from it under the railway bridge to the swamp
export const POND = { x: -4, z: 4, rx: 24, rz: 16 };
export const SWAMP = { x: 118, z: 102, rx: 15, rz: 11 };
export const RIVER = (() => {
  const ctrl = [[14, 12], [34, 24], [52, 33], [70, 52], [88, 70], [104, 86], [116, 100]];
  const out = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    for (let k = 0; k < 6; k++) {
      const t = k / 6, a = ctrl[i], b = ctrl[i + 1];
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  out.push(ctrl[ctrl.length - 1]);
  // a gentle wiggle
  return out.map(([x, z], i) => [x + Math.sin(i * 0.45) * 1.4, z - Math.sin(i * 0.45) * 1.4]);
})();
export const RIVER_W = 4.2;
export function riverDist(x, z) {
  let bd = Infinity;
  for (let i = 0; i < RIVER.length - 1; i++) {
    const [ax, az] = RIVER[i], [bx, bz] = RIVER[i + 1];
    const vx = bx - ax, vz = bz - az;
    const t = clamp(((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz), 0, 1);
    const d = Math.hypot(x - ax - vx * t, z - az - vz * t);
    if (d < bd) bd = d;
  }
  return bd;
}
export const ellipseQ = (e, x, z) => Math.hypot((x - e.x) / e.rx, (z - e.z) / e.rz);

export const WATER_Y = -0.6;
// gentle hills away from the track, carved out for the river, pond and swamp
export function groundY(x, z, dTrack) {
  if (dTrack == null) dTrack = nearestTrack(x, z).d;
  let h = Math.max(0, Math.sin(x * 0.045 + 1.3) * Math.sin(z * 0.06 + 0.4) * 1.3 + Math.sin(x * 0.11 + z * 0.07) * 0.5 + 0.2) * 1.5;
  h *= smooth(10, 22, dTrack);
  const wet = Math.max(
    1 - smooth(RIVER_W * 0.8, RIVER_W * 1.7, riverDist(x, z)),
    1 - smooth(0.85, 1.3, ellipseQ(POND, x, z)),
    1 - smooth(0.85, 1.3, ellipseQ(SWAMP, x, z)),
  );
  return h * (1 - wet) - 1.7 * wet;
}

// where the river crosses the track
export const BRIDGE_S = (() => {
  let best = 0, bd = Infinity;
  for (let i = 0; i < TRACK.N; i++) {
    const d = riverDist(TRACK.xs[i], TRACK.zs[i]);
    if (d < bd) { bd = d; best = i * TRACK.step; }
  }
  return best;
})();
export const BRIDGE_HALF = 9;
