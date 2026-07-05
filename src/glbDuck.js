// Loads the authored low-poly Duck.glb (a single static mesh — no skeleton) and styles it
// to match the game. The model already ships with clean colour zones baked into its texture
// — orange bill, black eyes, yellow feathers, green shirt — so all we do is RE-PAINT those
// four colours to the player's chosen colours, pixel-for-pixel. This follows the model's own
// boundaries exactly (no invented geometry).
//
// Rigging: the mesh has no skeleton, and blended skinning smears the body, so instead we
// SEGMENT the two legs (the orange region below the hips) into their own pieces and pivot
// each at its hip. The body stays a single rigid mesh — it can never deform — while the legs
// actually swing, giving a real step cycle. If the legs can't be found, we fall back to a
// non-deforming bob/waddle. If the asset is missing, isDuckReady() stays false and createPet
// falls back to the procedural duck.

import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import { toonGradient } from './textures.js';

const loader = new GLTFLoader();
const URL = 'assets/duckmodel.glb';
const TARGET_H = 2.0;

let cache = null;      // { tex:{mask,W,H,flipY}, rig:{bodyGeo, legLGeo, legRGeo, hipL, hipR} | {fullGeo} }
let ready = false;
let loadingPromise = null;

export function isDuckReady() { return ready; }

// ---- the four baked zones, each mapped to one customizable colour ----
const Z_FEATHER = 0, Z_SHIRT = 1, Z_BILL = 2, Z_EYE = 3;

// Classify one texture pixel into a zone by the baked tag colour (yellow feathers, green
// shirt, orange bill/feet, near-black eyes). Low-saturation pixels fall back to feathers.
function classifyPixel(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), c = mx - mn;
  if (mx < 70) return Z_EYE;                 // black eyes
  if (c < 24) return Z_FEATHER;              // greys / near-white → body
  let h;
  if (mx === r) h = ((g - b) / c) % 6; else if (mx === g) h = (b - r) / c + 2; else h = (r - g) / c + 4;
  h *= 60; if (h < 0) h += 360;
  if (h < 40) return Z_BILL;                 // orange (~25)
  if (h < 90) return Z_FEATHER;              // yellow (~46)
  if (h < 200) return Z_SHIRT;               // green (~120)
  return Z_FEATHER;                          // reddish wrap-around → body
}

export function preloadDuck() {
  if (loadingPromise) return loadingPromise;
  loadingPromise = new Promise((resolve) => {
    loader.load(URL, (g) => {
      try {
        let mesh = null;
        g.scene.traverse((o) => { if (!mesh && o.isMesh) mesh = o; });
        if (!mesh) { ready = false; return resolve(false); }

        // bake the node transform into the geometry, then normalize: scale to TARGET_H,
        // centre on x/z, drop feet to y=0. UVs are untouched so the texture still lines up.
        const geo = mesh.geometry.clone();
        mesh.updateWorldMatrix(true, false);
        geo.applyMatrix4(mesh.matrixWorld);
        geo.deleteAttribute('skinIndex');
        geo.deleteAttribute('skinWeight');
        geo.computeBoundingBox();
        let bb = geo.boundingBox;
        const s = TARGET_H / ((bb.max.y - bb.min.y) || 1);
        geo.scale(s, s, s);
        geo.computeBoundingBox(); bb = geo.boundingBox;
        const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
        geo.translate(-cx, -bb.min.y, -cz);
        if (!geo.attributes.normal) geo.computeVertexNormals();

        const tex = buildMask(firstMap(mesh.material));
        const mounts = computeMounts(geo, tex);
        cache = { tex, mounts, rig: buildRig(geo, tex) || { fullGeo: geo } };
        ready = true;
        resolve(true);
      } catch (e) { console.warn('[duck] preprocess error', e && e.message); ready = false; resolve(false); }
    }, undefined, () => { ready = false; resolve(false); });
  });
  return loadingPromise;
}

// ---- accessory mounts --------------------------------------------------------------------
// Measure where wearables should attach, straight from the normalized geometry (H=TARGET_H,
// feet y=0, centred x/z, facing +z). The model is one chibi egg: the "skull" is the top of
// the egg minus the protruding bill (far +z), and the torso is the wide middle minus the
// tail spike (far -z). Everything is expressed as fractions of H so a model swap re-measures.
function computeMounts(geo, prep) {
  const pos = geo.attributes.position, uv = geo.attributes.uv, n = pos.count, H = TARGET_H;
  const mk = () => ({ sy: 0, sz: 0, c: 0, xMax: 0, zMin: 1e9 });
  const add = (a, x, y, z) => {
    a.sy += y; a.sz += z; a.c++;
    a.xMax = Math.max(a.xMax, Math.abs(x));
    a.zMin = Math.min(a.zMin, z);
  };
  const skull = mk(), torso = mk(), crown = mk();
  let crownYMax = -1e9;
  // eye centroids, measured from the texture's baked eye zone (the eyes are painted,
  // not modelled, so the only truthful position source is uv→zone sampling)
  const eyeL = { x: 0, y: 0, z: 0, c: 0 }, eyeR = { x: 0, y: 0, z: 0, c: 0 };
  // tail envelope (rear spike + fat rear of the egg): everything rear of -0.275H
  const tail = { zMin: 1e9, yMin: 1e9, yMax: -1e9, xMax: 0 };
  // NOTE: the torso band deliberately includes the tops of the legs (they start below
  // 0.42H); the SLOT_FIT nudges in petFactory were tuned against exactly this measurement,
  // so a model swap with very different legs may need those nudges re-tuned.
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (y > 0.675 * H && z <= 0.31 * H) add(skull, x, y, z);                       // head minus bill
    else if (y > 0.25 * H && y < 0.62 * H && z > -0.31 * H) add(torso, x, y, z);   // body minus tail
    if (y > 0.92 * H) { add(crown, x, y, z); crownYMax = Math.max(crownYMax, y); } // very top of the head
    if (z < -0.275 * H) {
      tail.zMin = Math.min(tail.zMin, z); tail.yMin = Math.min(tail.yMin, y);
      tail.yMax = Math.max(tail.yMax, y); tail.xMax = Math.max(tail.xMax, Math.abs(x));
    }
    if (prep && uv && y > 0.6 * H && sampleZone(prep, uv.getX(i), uv.getY(i)) === Z_EYE) {
      const e = x < 0 ? eyeL : eyeR;
      e.x += x; e.y += y; e.z += z; e.c++;
    }
  }
  if (!skull.c || !torso.c) return null;
  const tc = [0, torso.sy / torso.c, torso.sz / torso.c];
  return {
    head: { pos: [0, skull.sy / skull.c, skull.sz / skull.c], radius: skull.xMax },
    torso: { pos: tc, radius: torso.xMax },
    back: { pos: [0, tc[1], torso.zMin] },   // rear-most torso z (for future back-mounted items)
    // top-of-head point: hats seat against this (y = the actual highest vertex, so a hat
    // rim mapped to it can rest ON the crown instead of hovering behind it)
    crown: crown.c ? { pos: [0, crownYMax, crown.sz / crown.c] } : null,
    // measured centroids of the two painted eyes (glasses align their lenses to these)
    eyes: (eyeL.c && eyeR.c)
      ? [[eyeL.x / eyeL.c, eyeL.y / eyeL.c, eyeL.z / eyeL.c], [eyeR.x / eyeR.c, eyeR.y / eyeR.c, eyeR.z / eyeR.c]]
      : null,
    tail: tail.zMin < 1e9 ? tail : null,     // keep-out envelope for back-mounted bags
  };
}

// ---- mesh-derived garments ----------------------------------------------------------------
// Build a "shell" garment straight from the duck's own body surface: keep every triangle
// whose centroid passes the y-band (and optional filter), then push each vertex outward
// along an area-weighted smoothed normal by `inflate`. Because the shell is literally the
// duck's skin offset outward, it fits the body exactly by construction — no primitive can
// drift, gap or clip. Legs are separate geometries, so shells never cover them.
// filter(cx, cy, cz) is evaluated on the triangle centroid.
let shellSource = null;   // { pos: Float32Array (non-indexed), normals: Float32Array (smoothed) }
const legShellSources = [null, null];   // per-leg smoothed sources (L, R)
// Build a smoothed shell source from any duck-space geometry. `radialDir(x,y,z)` supplies
// the fallback push direction for thin-fin vertices whose averaged normals cancel.
function smoothSource(g0, radialDir) {
  let g = g0;
  if (g.index) g = g.toNonIndexed();
  const p = g.attributes.position.array;
  const nVerts = p.length / 3;
  // weld by position so the smoothed normals are continuous across the low-poly facets
  const keyOf = (i) => `${p[i * 3].toFixed(4)},${p[i * 3 + 1].toFixed(4)},${p[i * 3 + 2].toFixed(4)}`;
  const acc = new Map();   // key -> [nx, ny, nz, Σ|faceN|]
  for (let f = 0; f < nVerts; f += 3) {
    const ax = p[f * 3], ay = p[f * 3 + 1], az = p[f * 3 + 2];
    const bx = p[f * 3 + 3], by = p[f * 3 + 4], bz = p[f * 3 + 5];
    const cx = p[f * 3 + 6], cy = p[f * 3 + 7], cz = p[f * 3 + 8];
    // face normal, length = 2·area → summing area-weights automatically
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const w = Math.hypot(nx, ny, nz);
    for (const vi of [f, f + 1, f + 2]) {
      const k = keyOf(vi);
      const a = acc.get(k) || [0, 0, 0, 0];
      a[0] += nx; a[1] += ny; a[2] += nz; a[3] += w;
      acc.set(k, a);
    }
  }
  const normals = new Float32Array(p.length);
  for (let i = 0; i < nVerts; i++) {
    const a = acc.get(keyOf(i));
    const l = Math.hypot(a[0], a[1], a[2]);
    // Thin-fin edges (wing feather tips): the two sides' normals nearly cancel, so the
    // averaged direction is garbage and an offset along it lets the skin poke through
    // the shell. Detect the cancellation (|Σn| ≪ Σ|n|) and push those vertices radially
    // away from the body axis instead — fins stick out radially, so this always clears.
    if (l < 0.35 * a[3] || l < 1e-8) {
      const [rx, ry, rz] = radialDir(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
      const rl = Math.hypot(rx, ry, rz) || 1;
      normals[i * 3] = rx / rl; normals[i * 3 + 1] = ry / rl; normals[i * 3 + 2] = rz / rl;
    } else {
      normals[i * 3] = a[0] / l; normals[i * 3 + 1] = a[1] / l; normals[i * 3 + 2] = a[2] / l;
    }
  }
  return { pos: p, normals };
}
function shellSrc() {
  if (shellSource) return shellSource;
  if (!cache) return null;
  // fins stick out radially from the body axis, so the fallback pushes away from it
  shellSource = smoothSource(cache.rig.bodyGeo || cache.rig.fullGeo,
    (x, y, z) => [x, (y - 1.0) * 0.25, z]);
  return shellSource;
}

// clips: [{ n:[x,y,z], d, when?:(cx,cy,cz)=>bool }] — keep the half-space n·p ≥ d,
// SPLITTING triangles that straddle the plane (Sutherland-Hodgman), so garment hems
// are clean straight lines instead of the source mesh's huge jagged triangles.
// yMin/yMax are shorthand for the two horizontal clips.
export function duckShellGeo(opts = {}) {
  const src = shellSrc();
  return src ? shellFromSource(src, opts) : null;
}

// Same shell cut, but sourced from ONE LEG's own geometry (side 0 = left, 1 = right).
// The result is in duck space, so a mesh built from it must be parented to that leg's
// hip pivot with the same -hip offset the leg mesh uses — then it swings with the leg.
export function legShellGeo(side, opts = {}) {
  if (!cache || !cache.rig.legLGeo) return null;
  const i = side ? 1 : 0;
  if (!legShellSources[i]) {
    const hip = i ? cache.rig.hipR : cache.rig.hipL;
    // thin webbed-foot rims: push radially away from the leg's own shin axis
    legShellSources[i] = smoothSource(i ? cache.rig.legRGeo : cache.rig.legLGeo,
      (x, y, z) => [x - hip.x, (y - 0.12) * 0.3, z - hip.z]);
  }
  return shellFromSource(legShellSources[i], opts);
}

function shellFromSource(src, { yMin, yMax, inflate = 0.03, filter = null, clips = [] } = {}) {
  const planes = clips.slice();
  if (yMin != null) planes.push({ n: [0, 1, 0], d: yMin });
  if (yMax != null) planes.push({ n: [0, -1, 0], d: -yMax });
  const { pos: p, normals: nrm } = src;
  const P = [], N = [];
  for (let f = 0; f < p.length; f += 9) {
    const cx = (p[f] + p[f + 3] + p[f + 6]) / 3;
    const cy = (p[f + 1] + p[f + 4] + p[f + 7]) / 3;
    const cz = (p[f + 2] + p[f + 5] + p[f + 8]) / 3;
    if (filter && !filter(cx, cy, cz)) continue;
    // polygon of {pos, nrm} vertices, clipped plane by plane
    let poly = [0, 1, 2].map((v) => ({
      p: [p[f + v * 3], p[f + v * 3 + 1], p[f + v * 3 + 2]],
      n: [nrm[f + v * 3], nrm[f + v * 3 + 1], nrm[f + v * 3 + 2]],
    }));
    for (const pl of planes) {
      if (pl.when && !pl.when(cx, cy, cz)) continue;
      const [nx, ny, nz] = pl.n;
      const side = poly.map((v) => v.p[0] * nx + v.p[1] * ny + v.p[2] * nz - pl.d);
      const out = [];
      for (let i = 0; i < poly.length; i++) {
        const j = (i + 1) % poly.length, a = poly[i], b = poly[j];
        if (side[i] >= 0) out.push(a);
        if ((side[i] >= 0) !== (side[j] >= 0)) {
          const t = side[i] / (side[i] - side[j]);
          const lerp = (u, v) => u + (v - u) * t;
          const nvec = [lerp(a.n[0], b.n[0]), lerp(a.n[1], b.n[1]), lerp(a.n[2], b.n[2])];
          const l = Math.hypot(nvec[0], nvec[1], nvec[2]) || 1;
          out.push({
            p: [lerp(a.p[0], b.p[0]), lerp(a.p[1], b.p[1]), lerp(a.p[2], b.p[2])],
            n: [nvec[0] / l, nvec[1] / l, nvec[2] / l],
          });
        }
      }
      poly = out;
      if (poly.length < 3) break;
    }
    if (poly.length < 3) continue;
    for (let i = 1; i < poly.length - 1; i++) {           // fan-triangulate
      for (const v of [poly[0], poly[i], poly[i + 1]]) {
        P.push(v.p[0] + v.n[0] * inflate, v.p[1] + v.n[1] * inflate, v.p[2] + v.n[2] * inflate);
        N.push(v.n[0], v.n[1], v.n[2]);
      }
    }
  }
  if (!P.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  return g;
}

// Measured radial profile of the body: max radius from the y-axis per (y-band, azimuth
// sector). Lets draped accessories (the gold chain) sit exactly on the skin at any
// height/direction instead of guessing control points. az: atan2(x, z), 0 = front.
let radialTable = null;
const RT_BANDS = 28, RT_SECS = 24, RT_YMAX = 2.0;
export function duckRadiusAt(y, az) {
  if (!radialTable) {
    const src = shellSrc();
    if (!src) return null;
    const t = new Float32Array(RT_BANDS * RT_SECS);
    const p = src.pos;
    // Bin SURFACE samples, not vertices: the body is low-poly, so whole y-bands can
    // fall inside one giant belly triangle with no vertex in them at all — sample a
    // barycentric grid over every triangle so every band/sector the skin passes
    // through gets its true radius.
    const put = (x, vy, z) => {
      const b = Math.min(RT_BANDS - 1, Math.max(0, Math.floor((vy / RT_YMAX) * RT_BANDS)));
      const s = ((Math.round((Math.atan2(x, z) / (2 * Math.PI)) * RT_SECS) % RT_SECS) + RT_SECS) % RT_SECS;
      const r = Math.hypot(x, z);
      const k = b * RT_SECS + s;
      if (r > t[k]) t[k] = r;
    };
    const G = 5;   // barycentric grid: (G+1)(G+2)/2 = 21 samples per triangle
    for (let f = 0; f < p.length; f += 9) {
      for (let i = 0; i <= G; i++) {
        for (let j = 0; j <= G - i; j++) {
          const a = i / G, b2 = j / G, c = 1 - a - b2;
          put(
            a * p[f] + b2 * p[f + 3] + c * p[f + 6],
            a * p[f + 1] + b2 * p[f + 4] + c * p[f + 7],
            a * p[f + 2] + b2 * p[f + 5] + c * p[f + 8]);
        }
      }
    }
    // fill empty cells from angular neighbours so queries in sparse bands still resolve
    for (let b = 0; b < RT_BANDS; b++) {
      for (let pass = 0; pass < RT_SECS; pass++) {
        let changed = false;
        for (let s = 0; s < RT_SECS; s++) {
          const k = b * RT_SECS + s;
          if (t[k]) continue;
          const l = t[b * RT_SECS + ((s + RT_SECS - 1) % RT_SECS)], r = t[b * RT_SECS + ((s + 1) % RT_SECS)];
          if (l || r) { t[k] = l && r ? (l + r) / 2 : (l || r); changed = true; }
        }
        if (!changed) break;
      }
    }
    radialTable = t;
  }
  const fb = Math.min(RT_BANDS - 1, Math.max(0, (y / RT_YMAX) * RT_BANDS - 0.5));
  const b0 = Math.floor(fb), b1 = Math.min(RT_BANDS - 1, b0 + 1), bt = fb - b0;
  const fs = (((Math.atan2(Math.sin(az), Math.cos(az)) / (2 * Math.PI)) * RT_SECS) + RT_SECS) % RT_SECS;
  const s0 = Math.floor(fs) % RT_SECS, s1 = (s0 + 1) % RT_SECS, st = fs - Math.floor(fs);
  const at = (b, s) => radialTable[b * RT_SECS + s];
  const r0 = at(b0, s0) * (1 - st) + at(b0, s1) * st;
  const r1 = at(b1, s0) * (1 - st) + at(b1, s1) * st;
  const r = r0 * (1 - bt) + r1 * bt;
  return r || null;
}

function firstMap(material) {
  const mats = Array.isArray(material) ? material : [material];
  for (const m of mats) if (m && m.map) return m.map;
  return null;
}

// Classify the baked atlas once into a per-pixel zone mask. We downscale to a mobile-safe
// size with NEAREST sampling (imageSmoothingEnabled = false): the source 4096² atlas would
// blow iOS Safari's per-tab memory once recoloured and uploaded as a texture, while this
// model's flat zones are large, so 1024² is visually identical. Nearest sampling keeps the
// hard zone edges crisp (bilinear downscale is what blurred them into a grainy fringe before).
const MASK = 1024;
function buildMask(map) {
  if (!map || !map.image || typeof document === 'undefined') return null;
  const img = map.image;
  const NW = img.width || img.naturalWidth, NH = img.height || img.naturalHeight;
  if (!NW || !NH) return null;
  const W = Math.min(MASK, NW), H = Math.min(MASK, NH);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, W, H);
  const d = ctx.getImageData(0, 0, W, H).data;
  const mask = new Uint8Array(W * H);
  for (let i = 0, p = 0; i < mask.length; i++, p += 4) mask[i] = classifyPixel(d[p], d[p + 1], d[p + 2]);
  return { mask, W, H, flipY: map.flipY };
}

function sampleZone(prep, u, v) {
  const { mask, W, H, flipY } = prep;
  u = u - Math.floor(u); v = v - Math.floor(v);
  const yy = flipY ? (1 - v) : v;
  const px = Math.min(W - 1, Math.max(0, Math.round(u * (W - 1))));
  const py = Math.min(H - 1, Math.max(0, Math.round(yy * (H - 1))));
  return mask[py * W + px];
}

// ---- leg segmentation -------------------------------------------------------------------
// Find the two legs (orange texture zone below the hip line), split each into its own
// non-indexed geometry, and record a hip pivot (top-centre of the leg) so it can swing.
function buildRig(geo, prep) {
  if (!prep || !geo.attributes.uv) return null;
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  const index = geo.index ? geo.index.array : null;
  const n = pos.count;
  geo.computeBoundingBox();
  const H = geo.boundingBox.max.y - geo.boundingBox.min.y;
  const HIP_Y = 0.42 * H;                          // legs live below this; bill (also orange) is far above

  const side = new Uint8Array(n);                  // 0 body, 1 left leg, 2 right leg
  for (let i = 0; i < n; i++) {
    if (pos.getY(i) > HIP_Y) continue;
    if (sampleZone(prep, uv.getX(i), uv.getY(i)) !== Z_BILL) continue;   // legs/feet are orange
    side[i] = pos.getX(i) < 0 ? 1 : 2;
  }

  const faceCount = index ? index.length / 3 : n / 3;
  const bodyF = [], lF = [], rF = [];
  for (let f = 0; f < faceCount; f++) {
    const a = index ? index[f * 3] : f * 3, b = index ? index[f * 3 + 1] : f * 3 + 1, c = index ? index[f * 3 + 2] : f * 3 + 2;
    const l = (side[a] === 1) + (side[b] === 1) + (side[c] === 1);
    const r = (side[a] === 2) + (side[b] === 2) + (side[c] === 2);
    if (l >= 2) lF.push(a, b, c); else if (r >= 2) rF.push(a, b, c); else bodyF.push(a, b, c);
  }
  if (lF.length < 12 || rF.length < 12) { console.log('[duck] no legs found — waddle fallback'); return null; }

  // hip = centroid x/z of the leg's upper verts, at the top (y) of the leg
  const hipOf = (faces) => {
    let top = -9; for (const vi of faces) top = Math.max(top, pos.getY(vi));
    let sx = 0, sz = 0, c = 0; const seen = new Set();
    for (const vi of faces) {
      if (seen.has(vi) || pos.getY(vi) < top - 0.18 * H) continue; seen.add(vi);
      sx += pos.getX(vi); sz += pos.getZ(vi); c++;
    }
    return { x: c ? sx / c : 0, y: top, z: c ? sz / c : 0 };
  };
  console.log('[duck] leg faces L:%d R:%d body:%d', lF.length / 3, rF.length / 3, bodyF.length / 3);
  // Extend each leg's top up into the belly (an internal stub) so the hip joint stays plugged
  // as the leg swings — otherwise the leg's top pulls out from under the belly and shows a gap.
  const raiseL = { topY: hipOf(lF).y, band: 0.12 * H, stub: 0.18 * H };
  const raiseR = { topY: hipOf(rF).y, band: 0.12 * H, stub: 0.18 * H };
  return {
    bodyGeo: subGeo(geo, bodyF), legLGeo: subGeo(geo, lF, raiseL), legRGeo: subGeo(geo, rF, raiseR),
    hipL: hipOf(lF), hipR: hipOf(rF),
  };
}

// Build a non-indexed geometry from a flat list of source vertex indices (3 per face). When
// `raise` is given, vertices in the top band are pushed up by `stub` to form a hidden stub
// that tucks into the body and keeps the hip joint covered through the swing.
function subGeo(src, verts, raise) {
  const sp = src.attributes.position, sn = src.attributes.normal, su = src.attributes.uv;
  const m = verts.length;
  const P = new Float32Array(m * 3), U = new Float32Array(m * 2), N = sn ? new Float32Array(m * 3) : null;
  for (let k = 0; k < m; k++) {
    const vi = verts[k];
    let y = sp.getY(vi);
    if (raise && y > raise.topY - raise.band) y += raise.stub;   // lift the top band into the body
    P[k * 3] = sp.getX(vi); P[k * 3 + 1] = y; P[k * 3 + 2] = sp.getZ(vi);
    U[k * 2] = su.getX(vi); U[k * 2 + 1] = su.getY(vi);
    if (N) { N[k * 3] = sn.getX(vi); N[k * 3 + 1] = sn.getY(vi); N[k * 3 + 2] = sn.getZ(vi); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  if (N) g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); else g.computeVertexNormals();
  return g;
}

// Re-paint the four zones to the chosen colours and return a fresh sRGB texture. Output is a
// flat colour per zone (the toon material adds the shading), so the result is crisp.
const texCache = new Map();
function recolour(featherHex, shirtHex, billHex, eyeHex) {
  const prep = cache.tex;
  if (!prep) return null;
  const key = [featherHex, shirtHex, billHex, eyeHex].join('|');
  if (texCache.has(key)) return texCache.get(key);
  const { mask, W, H } = prep;
  const hexRGB = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];   // raw sRGB (THREE.Color is linear)
  const cols = [hexRGB(featherHex), hexRGB(shirtHex), hexRGB(billHex), hexRGB(eyeHex)];
  const out = new Uint8ClampedArray(W * H * 4);
  for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
    const c = cols[mask[i]];
    out[p] = c[0]; out[p + 1] = c[1]; out[p + 2] = c[2]; out[p + 3] = 255;
  }
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  cv.getContext('2d').putImageData(new ImageData(out, W, H), 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.flipY = prep.flipY; tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false;
  tex.needsUpdate = true;
  if (texCache.size > 6) { const [k, old] = texCache.entries().next().value; old.dispose(); texCache.delete(k); }
  texCache.set(key, tex);
  return tex;
}

export function buildGlbDuck(inner, a) {
  const tex = recolour(a.bodyColor ?? 0xffd23e, a.shirtColor ?? 0x5a9e44, a.muzzleColor ?? 0xff9e2c, a.eyeColor ?? 0x232020);
  const mat = new THREE.MeshToonMaterial({ map: tex, gradientMap: toonGradient() });
  // Live shirt-zone repaint: equipping a "top" recolours the baked shirt zone instead of
  // adding geometry (the green zone IS the duck's shirt). null reverts to the player's own
  // appearance colour. recolour() is texture-cached, so swapping is cheap.
  const setShirtColor = (hex) => {
    const t = recolour(a.bodyColor ?? 0xffd23e, hex ?? (a.shirtColor ?? 0x5a9e44),
      a.muzzleColor ?? 0xff9e2c, a.eyeColor ?? 0x232020);
    if (t) { mat.map = t; mat.needsUpdate = true; }
  };
  const rig = cache.rig;
  const mounts = cache.mounts || null;
  // head anchor at the MEASURED skull centre (hats/glasses attach here); the old
  // (0, 0.82*H, 0) guess sat behind and below the actual head of the egg-shaped model.
  const head = new THREE.Group();
  if (mounts) head.position.set(mounts.head.pos[0], mounts.head.pos[1], mounts.head.pos[2]);
  else head.position.set(0, TARGET_H * 0.82, 0);
  inner.add(head);
  const baseY = inner.position.y;

  if (rig.fullGeo) {
    // no legs were found — keep the body rigid and waddle (bob + roll), never deforming.
    const body = new THREE.Mesh(rig.fullGeo, mat);
    body.castShadow = true; body.receiveShadow = true; body.frustumCulled = false;
    inner.add(body);
    const animate = (t, moving) => {
      if (moving) { inner.position.y = baseY + Math.abs(Math.sin(t * 7)) * 0.05; inner.rotation.z = Math.sin(t * 7) * 0.10; }
      else { inner.position.y = baseY + Math.sin(t * 2) * 0.012; inner.rotation.z = 0; }
    };
    return { head, legs: [], tail: null, ears: [], animate, mounts, setShirtColor };
  }

  // segmented rig: rigid body + two legs that pivot at the hips.
  const body = new THREE.Mesh(rig.bodyGeo, mat);
  body.castShadow = true; body.receiveShadow = true; body.frustumCulled = false;
  inner.add(body);
  const mkLeg = (geo, hip) => {
    const pivot = new THREE.Group(); pivot.position.set(hip.x, hip.y, hip.z);
    const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.frustumCulled = false;
    m.position.set(-hip.x, -hip.y, -hip.z);   // cancel the pivot offset → leg renders in place, rotates about the hip
    pivot.add(m); inner.add(pivot); return pivot;
  };
  const legL = mkLeg(rig.legLGeo, rig.hipL), legR = mkLeg(rig.legRGeo, rig.hipR);

  // Drive the step cycle from ground DISTANCE, not wall-clock time, so the planted foot moves
  // backward at body speed and the duck doesn't appear to glide/skate. `dist` is the metres
  // moved this frame (passed by the game loop); the creator preview omits it and falls back to
  // a steady time-based cadence. With phase = dist / (amp·legLen), peak foot speed == body
  // speed regardless of the amplitude, so the feet always look planted.
  const amp = 0.5;                             // moderate swing keeps the legs their natural tapered shape (a
                                               // bigger swing needs a tall hip stub, which stretches them blocky)
  const legLen = Math.max(0.3, rig.hipL.y);    // foot sits at ~y=0, hip pivot at hipL.y
  const GAIT = 0.34;                           // <1: legs cycle slower than a perfectly-planted foot. Tuned so
                                               // the cadence matches the (good) 0.8/0.55 setting at this amp.
  let phase = 0, prevT = 0;
  const animate = (t, moving, dist) => {
    const dt = Math.min(0.05, Math.max(0, t - prevT)); prevT = t;
    if (moving) {
      phase += (dist == null) ? dt * 5 : (dist / (amp * legLen)) * GAIT;
      legL.rotation.x = Math.sin(phase) * amp;
      legR.rotation.x = Math.sin(phase + Math.PI) * amp;
      inner.position.y = baseY + Math.abs(Math.sin(phase)) * 0.05;    // bob on each step
      inner.rotation.z = Math.sin(phase) * 0.05;                      // gentle waddle roll
    } else {
      legL.rotation.x += (0 - legL.rotation.x) * 0.25;                // settle into a stand
      legR.rotation.x += (0 - legR.rotation.x) * 0.25;
      inner.position.y = baseY + Math.sin(t * 2) * 0.012;
      inner.rotation.z += (0 - inner.rotation.z) * 0.2;
    }
  };
  return { head, legs: [legL, legR], tail: null, ears: [], animate, mounts, setShirtColor };
}
