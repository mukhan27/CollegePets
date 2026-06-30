// Loads the authored low-poly Duck.glb (a single static mesh — no skeleton) and styles it
// to match the game. Rather than recolouring the baked texture pixel-by-pixel (which left a
// grainy, bleeding edge), we classify every FACE of the mesh into a zone — body, shirt,
// beak or eye — by sampling the baked texture at the face's UVs, then paint a single FLAT
// vertex colour per zone from the player's chosen colours. The result is clean, sharp and
// fully recolourable. The mesh is left rigid (no skinning) and "walks" with a non-deforming
// waddle (bob + roll), so the body can never be distorted. If the asset is missing,
// isDuckReady() stays false and createPet falls back to the procedural duck.

import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import { toonGradient } from './textures.js';

const loader = new GLTFLoader();
const URL = 'assets/duckmodel.glb';
const TARGET_H = 1.55;

let cache = null;      // { geometry (non-indexed), zone:Uint8Array (per-vertex) }
let ready = false;
let loadingPromise = null;

export function isDuckReady() { return ready; }

// ---- zones (each maps to one customizable colour) ----
const Z_BODY = 0, Z_SHIRT = 1, Z_BEAK = 2, Z_EYE = 3, Z_KEEP = 4, NZ = 5;

// Classify a baked-texture sample (flat tag colours: yellow body, green shirt,
// orange bill/feet, near-black eyes, occasional white highlight) into a zone.
function classifyZone(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), c = mx - mn;
  if (mx < 70) return Z_EYE;               // black eyes
  if (c < 24) return Z_KEEP;               // greys / near-white highlights
  let h;
  if (mx === r) h = ((g - b) / c) % 6; else if (mx === g) h = (b - r) / c + 2; else h = (r - g) / c + 4;
  h *= 60; if (h < 0) h += 360;
  if (h < 45) return Z_BEAK;               // orange (~25)
  if (h < 85) return Z_BODY;               // yellow (~55)
  if (h < 190) return Z_SHIRT;             // green (~120)
  return Z_KEEP;
}

export function preloadDuck() {
  if (loadingPromise) return loadingPromise;
  loadingPromise = new Promise((resolve) => {
    loader.load(URL, (g) => {
      try {
        let mesh = null;
        g.scene.traverse((o) => { if (!mesh && o.isMesh) mesh = o; });
        if (!mesh) { ready = false; return resolve(false); }

        // bake the node transform into the geometry, split into per-face vertices so each
        // triangle can carry its own flat colour, then normalize: scale to TARGET_H,
        // centre on x/z, drop feet to y=0.
        let geo = mesh.geometry.clone();
        mesh.updateWorldMatrix(true, false);
        geo.applyMatrix4(mesh.matrixWorld);
        geo = geo.toNonIndexed();
        geo.computeBoundingBox();
        let bb = geo.boundingBox;
        const s = TARGET_H / ((bb.max.y - bb.min.y) || 1);
        geo.scale(s, s, s);
        geo.computeBoundingBox(); bb = geo.boundingBox;
        const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
        geo.translate(-cx, -bb.min.y, -cz);
        geo.deleteAttribute('skinIndex');
        geo.deleteAttribute('skinWeight');
        geo.computeVertexNormals();

        const zone = classifyFaces(geo, firstMap(mesh.material));
        cache = { geometry: geo, zone };
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

// Sample the baked texture at each face's three UVs + centroid, majority-vote a zone, and
// store it on all three of that face's vertices. Returns a per-vertex Uint8Array of zones.
function classifyFaces(geo, map) {
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  const n = pos.count;
  const zone = new Uint8Array(n).fill(Z_BODY);
  if (!uv || !map || !map.image || typeof document === 'undefined') return zone;

  const img = map.image;
  const W = img.width || img.naturalWidth, Hh = img.height || img.naturalHeight;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = Hh;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, W, Hh);
  const data = ctx.getImageData(0, 0, W, Hh).data;
  const flipY = map.flipY;   // glTF textures load with flipY=false; sample v accordingly

  const sample = (u, v) => {
    u = u - Math.floor(u); v = v - Math.floor(v);
    const yy = flipY ? (1 - v) : v;
    let px = Math.min(W - 1, Math.max(0, Math.round(u * (W - 1))));
    let py = Math.min(Hh - 1, Math.max(0, Math.round(yy * (Hh - 1))));
    const k = (py * W + px) * 4;
    return classifyZone(data[k], data[k + 1], data[k + 2]);
  };

  geo.computeBoundingBox(); const H = geo.boundingBox.max.y - geo.boundingBox.min.y;
  // The baked atlas tags ~1400 faces orange, but most are hidden underside/interior — and
  // the genuinely orange parts are only the front beak and the bottom feet. Gate orange
  // (and the dark eyes) to those regions so any stray orange/dark face on the visible body
  // falls back to body colour. Front of the duck is +z (eyes sit at z≈+0.45). Thresholds
  // are fractions of the model height so they stay scale-independent.
  const inBeak = (y, z) => y > 0.62 * H && y < 0.94 * H && z > 0.30 * H;
  const inFeet = (y) => y < 0.22 * H;
  const inHeadFront = (y, z) => y > 0.70 * H && z > 0.20 * H;

  const counts = new Array(NZ);
  const faces = n / 3;
  const fzone = new Uint8Array(faces);          // per-face zone (before smoothing)
  for (let f = 0; f < faces; f++) {
    const a = f * 3, b = a + 1, c = a + 2;
    const ua = uv.getX(a), va = uv.getY(a);
    const ub = uv.getX(b), vb = uv.getY(b);
    const uc = uv.getX(c), vc = uv.getY(c);
    counts.fill(0);
    counts[sample(ua, va)]++;
    counts[sample(ub, vb)]++;
    counts[sample(uc, vc)]++;
    counts[sample((ua + ub + uc) / 3, (va + vb + vc) / 3)] += 2;   // centroid breaks ties
    let best = Z_BODY, bestN = -1;
    for (let z = 0; z < NZ; z++) if (counts[z] > bestN) { bestN = counts[z]; best = z; }
    const yc = (pos.getY(a) + pos.getY(b) + pos.getY(c)) / 3;
    const zc = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3;
    if (best === Z_BEAK && !(inBeak(yc, zc) || inFeet(yc))) best = Z_BODY;   // strip stray orange
    if (best === Z_EYE && !inHeadFront(yc, zc)) best = Z_BODY;               // strip stray dark
    if (best === Z_KEEP) best = Z_BODY;                                      // no real grey/white zone
    fzone[f] = best;
  }

  // The texture's shirt seam is ragged and broken up by yellow "wing" patches, which reads
  // as choppy. Replace it with a clean solid torso band: every torso face between a flat hem
  // and the neck becomes shirt, so the green is one continuous sweater with a near-horizontal
  // hem instead of a jagged diagonal seam. Heights are taken from where the texture actually
  // put the shirt (robust to model scale) and clamped to sane fractions of the height.
  {
    const ys = [];
    for (let f = 0; f < faces; f++) if (fzone[f] === Z_SHIRT) ys.push((pos.getY(f * 3) + pos.getY(f * 3 + 1) + pos.getY(f * 3 + 2)) / 3);
    ys.sort((p, q) => p - q);
    const pct = (q) => ys.length ? ys[Math.min(ys.length - 1, Math.floor(q * ys.length))] : 0;
    const hemY = ys.length ? Math.max(0.34 * H, pct(0.10)) : 0.40 * H;   // flat lower hem
    const topY = ys.length ? Math.min(0.80 * H, pct(0.96)) : 0.78 * H;   // collar, just below head
    for (let f = 0; f < faces; f++) {
      if (fzone[f] !== Z_BODY && fzone[f] !== Z_SHIRT) continue;          // never touch beak/eye
      const yc = (pos.getY(f * 3) + pos.getY(f * 3 + 1) + pos.getY(f * 3 + 2)) / 3;
      fzone[f] = (yc >= hemY && yc <= topY) ? Z_SHIRT : Z_BODY;
    }
  }
  // Tidy the hem: an edge-adjacency majority filter that shaves jagged single-face spurs and
  // fills lone notches, leaving beak/eye faces untouched. Adjacency is built by welding the
  // (non-indexed) vertices back together and keying shared edges.
  smoothBoundary(geo, fzone, [Z_BODY, Z_SHIRT]);

  const tally = new Array(NZ).fill(0);
  for (let f = 0; f < faces; f++) {
    const z = fzone[f]; tally[z]++;
    zone[f * 3] = zone[f * 3 + 1] = zone[f * 3 + 2] = z;
  }
  console.log('[duck] face zones — body:%d shirt:%d beak:%d eye:%d',
    tally[Z_BODY], tally[Z_SHIRT], tally[Z_BEAK], tally[Z_EYE]);
  return zone;
}

// Morphological majority filter over edge-adjacent faces, restricted to the two zones in
// `pair` (so e.g. body/shirt smooth against each other but never repaint beak or eyes). For
// each pass, a face flips to the zone held by the majority of its edge neighbours — closing
// lone notches and trimming jagged single-face spurs along the seam.
function smoothBoundary(geo, fzone, pair, passes = 2) {
  const pos = geo.attributes.position, faces = fzone.length;
  const vkey = (i) => `${Math.round(pos.getX(i) * 1000)},${Math.round(pos.getY(i) * 1000)},${Math.round(pos.getZ(i) * 1000)}`;
  // map each shared edge → the faces that touch it
  const edgeFaces = new Map();
  const addEdge = (k1, k2, f) => { const k = k1 < k2 ? k1 + '|' + k2 : k2 + '|' + k1; (edgeFaces.get(k) || edgeFaces.set(k, []).get(k)).push(f); };
  const fk = new Array(faces);
  for (let f = 0; f < faces; f++) {
    const a = f * 3, ka = vkey(a), kb = vkey(a + 1), kc = vkey(a + 2);
    fk[f] = [ka, kb, kc];
    addEdge(ka, kb, f); addEdge(kb, kc, f); addEdge(kc, ka, f);
  }
  // neighbour list per face
  const nbr = new Array(faces);
  for (let f = 0; f < faces; f++) nbr[f] = [];
  for (const arr of edgeFaces.values()) {
    if (arr.length < 2) continue;
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) { nbr[arr[i]].push(arr[j]); nbr[arr[j]].push(arr[i]); }
  }
  const [A, B] = pair;
  for (let p = 0; p < passes; p++) {
    const next = fzone.slice();
    for (let f = 0; f < faces; f++) {
      if (fzone[f] !== A && fzone[f] !== B) continue;       // only smooth the chosen pair
      let same = 0, a = 0, b = 0;
      for (const g of nbr[f]) {
        if (fzone[g] === A) a++; else if (fzone[g] === B) b++; else continue;
        if (fzone[g] === fzone[f]) same++;
      }
      const total = a + b;
      if (total < 2) continue;
      const major = a > b ? A : B;
      if (major !== fzone[f] && same * 2 < total) next[f] = major;   // clear majority disagrees
    }
    fzone.set(next);
  }
}

// Build a flat per-vertex colour buffer from the chosen colours (THREE.Color holds linear
// values, which is exactly what the toon shader wants for vertexColors).
function buildColorAttr(bodyHex, shirtHex, beakHex, eyeHex) {
  const zone = cache.zone, n = zone.length;
  const cols = new Array(NZ);
  cols[Z_BODY] = new THREE.Color(bodyHex);
  cols[Z_SHIRT] = new THREE.Color(shirtHex);
  cols[Z_BEAK] = new THREE.Color(beakHex);
  cols[Z_EYE] = new THREE.Color(eyeHex);
  cols[Z_KEEP] = new THREE.Color(0xeae6da);   // neutral highlight / trim
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const col = cols[zone[i]];
    arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b;
  }
  return new THREE.Float32BufferAttribute(arr, 3);
}

export function buildGlbDuck(inner, a) {
  const geometry = cache.geometry;
  geometry.setAttribute('color', buildColorAttr(
    a.bodyColor ?? 0xffd23e, a.shirtColor ?? 0x5a9e44, a.muzzleColor ?? 0xff9e2c, a.eyeColor ?? 0x232020));

  const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() });
  const body = new THREE.Mesh(geometry, mat);
  body.castShadow = true; body.receiveShadow = true; body.frustumCulled = false;
  inner.add(body);

  const head = new THREE.Group(); head.position.set(0, TARGET_H * 0.82, 0); inner.add(head);

  const baseY = inner.position.y;
  // A non-deforming waddle: the whole duck bobs and rocks side to side — never distorts the mesh.
  const animate = (t, moving) => {
    if (moving) {
      const sp = 7;
      inner.position.y = baseY + Math.abs(Math.sin(t * sp)) * 0.05;
      inner.rotation.z = Math.sin(t * sp) * 0.10;
    } else {
      inner.position.y = baseY + Math.sin(t * 2) * 0.012;
      inner.rotation.z = 0;
    }
  };

  return { head, legs: [], tail: null, ears: [], animate };
}
