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
        cache = { tex, rig: buildRig(geo, tex) || { fullGeo: geo } };
        ready = true;
        resolve(true);
      } catch (e) { console.warn('[duck] preprocess error', e && e.message); ready = false; resolve(false); }
    }, undefined, () => { ready = false; resolve(false); });
  });
  return loadingPromise;
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
  const raiseL = { topY: hipOf(lF).y, band: 0.16 * H, stub: 0.30 * H };
  const raiseR = { topY: hipOf(rF).y, band: 0.16 * H, stub: 0.30 * H };
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
  const rig = cache.rig;
  const head = new THREE.Group(); head.position.set(0, TARGET_H * 0.82, 0); inner.add(head);
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
    return { head, legs: [], tail: null, ears: [], animate };
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
  const amp = 0.8;                             // pronounced swing → more ground per step → calmer cadence
  const legLen = Math.max(0.3, rig.hipL.y);    // foot sits at ~y=0, hip pivot at hipL.y
  const GAIT = 0.55;                           // <1: legs cycle slower than a perfectly-planted foot (a little
                                               // slide, but avoids the frantic buzzing at the fast campus speed)
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
  return { head, legs: [legL, legR], tail: null, ears: [], animate };
}
