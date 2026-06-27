// Authored-model path for the player's "Aura" species. Loads the rigged Meshy
// GLB (skeleton + idle clip), normalizes + caches it, and assembles a per-player
// instance synchronously so the createPet() contract is preserved. Adds code-built
// ears on the head. The coat is recoloured by genuinely REPAINTING the texture
// (the Meshy texture is flat-white fur with dark feature islands for the
// eyes/nose/mouth) — we fill the fur with the chosen colour and keep the dark
// features untouched, so it reads as a real recolour, not a wash-over tint that
// would discolour the eyes. If the asset is absent (offline / first paint),
// isAuraReady() stays false and createPet falls back to the primitive buildCreature.

import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from '../vendor/addons/utils/SkeletonUtils.js';

const loader = new GLTFLoader();
const BASE = 'assets/aura/';
const TARGET_HEIGHT = 1.7;
const MASK_SIZE = 1024;      // working resolution for the recolour canvases

let cache = null;            // { scene, animations, head, features, texSize }
let ready = false;
let loadingPromise = null;

function loadGLB(url, quiet = false) {
  return new Promise((resolve) => {
    loader.load(url, (g) => resolve(g), undefined, (e) => {
      if (!quiet) console.warn('[aura] GLB load failed', url, (e && (e.message || e.type || e)) || '');
      resolve(null);
    });
  });
}

export function isAuraReady() { return ready; }

// Load + normalize the rigged body once. Idempotent; never rejects.
export function preloadAura() {
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
   try {
    // Prefer a Meshy-Retexture variant if present (same mesh/UVs, art-directed
    // texture with a baked muzzle/brows); otherwise the plain base body.
    const g = await loadGLB(BASE + 'body_retex.glb', true) || await loadGLB(BASE + 'body.glb');
    if (!g) { ready = false; return false; }
    const scene = g.scene;

    // normalize: scale to TARGET_HEIGHT, centre on X/Z, drop feet to y=0
    scene.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3(); box.getSize(size);
    scene.scale.multiplyScalar(TARGET_HEIGHT / (size.y || 1));
    scene.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(scene);
    const c = new THREE.Vector3(); box.getCenter(c);
    scene.position.x -= c.x; scene.position.z -= c.z; scene.position.y -= box.min.y;
    scene.updateMatrixWorld(true);

    // remember head metrics (top ~quarter of the body) for ear/wearable anchors
    box = new THREE.Box3().setFromObject(scene);
    const headTop = box.max.y;
    const headR = (box.max.x - box.min.x) * 0.5 * 0.78;
    cache = {
      scene, animations: g.animations || [],
      head: { y: headTop - headR * 0.9, z: box.max.z * 0.45, r: headR },
      tex: buildTexturePrep(scene),
    };
    ready = true;
    return true;
   } catch (e) { console.warn('[aura] preload error', e && e.message, e && e.stack); ready = false; return false; }
  })();
  return loadingPromise;
}

// ---- texture recolouring -------------------------------------------------
// The coat is recoloured by REPAINTING the texture, not by adding geometry. We
// only repaint the fur pixels; the dark eye/nose/mouth islands AND the small
// light catchlight inside each eye keep their original colour, so neither the
// pupils nor their highlight ever pick up the coat colour.

function findSourceImage(scene) {
  let img = null;
  scene.traverse((o) => {
    if (img || !o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      const t = m.map || m.emissiveMap;
      if (t && t.image && t.image.width) { img = t.image; break; }
    }
  });
  return img;
}

// Per-pixel ZONE classification of the baked texture, computed once:
//   FUR    – bright, colourless, border-reachable (the body coat)      → bodyColor
//   MUZZLE – brightish & warm/chromatic (the baked cream snout)        → muzzleColor
//   EYE    – dark (eyes, pupils, nose, brows)                          → eyeColor
//   KEEP   – everything else, incl. the enclosed white eye catchlights → untouched
// Border flood-fill defines FUR so an enclosed catchlight can never be coloured by
// the coat. Recolouring then maps each zone to its chosen colour.
const Z_KEEP = 0, Z_FUR = 1, Z_MUZZLE = 2, Z_EYE = 3;

function buildTexturePrep(scene) {
  const img = findSourceImage(scene);
  if (!img || typeof document === 'undefined') return null;
  const s = MASK_SIZE;
  const cv = document.createElement('canvas'); cv.width = s; cv.height = s;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0, s, s);
  const orig = cx.getImageData(0, 0, s, s);
  const d = orig.data;
  const lumOf = (p) => d[p] * 0.299 + d[p + 1] * 0.587 + d[p + 2] * 0.114;
  const chromaOf = (p) => Math.max(d[p], d[p + 1], d[p + 2]) - Math.min(d[p], d[p + 1], d[p + 2]);

  const zone = new Uint8Array(s * s);
  // 1) FUR — flood-fill bright + colourless pixels inward from the border.
  const stack = [];
  const pushFur = (idx) => {
    if (zone[idx]) return;
    const p = idx * 4;
    if (lumOf(p) > 150 && chromaOf(p) < 16) { zone[idx] = Z_FUR; stack.push(idx); }
  };
  for (let x = 0; x < s; x++) { pushFur(x); pushFur((s - 1) * s + x); }
  for (let y = 0; y < s; y++) { pushFur(y * s); pushFur(y * s + s - 1); }
  while (stack.length) {
    const idx = stack.pop(), x = idx % s, y = (idx / s) | 0;
    if (x > 0) pushFur(idx - 1); if (x < s - 1) pushFur(idx + 1);
    if (y > 0) pushFur(idx - s); if (y < s - 1) pushFur(idx + s);
  }
  // 2) classify the remaining pixels; track each recolour zone's brightest lum so
  //    recolouring can preserve the baked shading (factor = lum / zoneMax).
  let furMax = 1, muzMax = 1;
  for (let i = 0; i < zone.length; i++) {
    const p = i * 4, lum = lumOf(p);
    if (zone[i] === Z_FUR) { if (lum > furMax) furMax = lum; continue; }
    if (lum < 95) zone[i] = Z_EYE;
    else if (chromaOf(p) >= 16 && lum > 120) { zone[i] = Z_MUZZLE; if (lum > muzMax) muzMax = lum; }
    else zone[i] = Z_KEEP;
  }
  return { orig, zone, furMax, muzMax, size: s };
}

const texCache = new Map();  // key -> CanvasTexture (bounded; recolour is reused)
function coatTexture(bodyHex, muzzleHex, eyeHex) {
  const prep = cache.tex;
  if (!prep) return null;
  const key = bodyHex + '|' + muzzleHex + '|' + eyeHex;
  if (texCache.has(key)) return texCache.get(key);
  const s = prep.size, d = prep.orig.data, zone = prep.zone;
  const out = new Uint8ClampedArray(d);                 // start from the original
  const body = new THREE.Color(bodyHex), muz = new THREE.Color(muzzleHex), eye = new THREE.Color(eyeHex);
  const fMax = prep.furMax, mMax = prep.muzMax;
  for (let i = 0; i < zone.length; i++) {
    const z = zone[i]; if (z === Z_KEEP) continue;
    const p = i * 4;
    if (z === Z_EYE) { out[p] = eye.r * 255; out[p + 1] = eye.g * 255; out[p + 2] = eye.b * 255; continue; }
    // FUR / MUZZLE: shade the chosen colour by the baked luminance so form survives
    const lum = d[p] * 0.299 + d[p + 1] * 0.587 + d[p + 2] * 0.114;
    const c = z === Z_FUR ? body : muz;
    const f = Math.min(1, lum / (z === Z_FUR ? fMax : mMax));
    out[p] = c.r * 255 * f; out[p + 1] = c.g * 255 * f; out[p + 2] = c.b * 255 * f;
  }
  const cv = document.createElement('canvas'); cv.width = s; cv.height = s;
  cv.getContext('2d').putImageData(new ImageData(out, s, s), 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  tex.needsUpdate = true;
  if (texCache.size > 12) { const [k, old] = texCache.entries().next().value; old.dispose(); texCache.delete(k); }
  texCache.set(key, tex);
  return tex;
}

function smoothMesh(geo, hex, rough = 0.82) {
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: 0 }));
  m.castShadow = true;
  return m;
}
const SPHERE = new THREE.SphereGeometry(1, 20, 16);
const CONE = new THREE.ConeGeometry(1, 2, 20);          // base r=1 at y=-1, apex y=+1
function part(geo, hex, sx, sy, sz) { const m = smoothMesh(geo, hex); m.scale.set(sx, sy, sz); return m; }
const innerShade = (coat) => new THREE.Color(coat).multiplyScalar(0.7).getHex();

// ---- modular ears ---------------------------------------------------------
// Each builder returns one ear (outer shell + inner-ear hollow) for side s
// (-1 left / +1 right), sized to head radius r and positioned relative to the
// head centre. The returned object's rotation.x is left free for the ear-flap.
export const EAR_TYPES = ['none', 'round', 'pointed', 'tall', 'floppy', 'folded', 'wide'];

const EAR_BUILDERS = {
  // soft bear-cub buttons on the crown
  round(s, r, coat, inner) {
    const g = new THREE.Group();
    g.add(part(SPHERE, coat, r * 0.36, r * 0.36, r * 0.26));
    const i = part(SPHERE, inner, r * 0.22, r * 0.22, r * 0.2); i.position.set(0, 0, r * 0.16); g.add(i);
    g.position.set(s * r * 0.62, r * 0.8, r * 0.05);
    return g;
  },
  // pointed cat triangles, splayed slightly out
  pointed(s, r, coat, inner) {
    const g = new THREE.Group();
    g.add(part(CONE, coat, r * 0.34, r * 0.62, r * 0.2));
    const i = part(CONE, inner, r * 0.2, r * 0.46, r * 0.12); i.position.set(0, -r * 0.05, r * 0.1); g.add(i);
    g.position.set(s * r * 0.5, r * 0.92, 0); g.rotation.z = -s * 0.16;
    return g;
  },
  // long rounded bunny ears, standing tall
  tall(s, r, coat, inner) {
    const g = new THREE.Group();
    g.add(part(SPHERE, coat, r * 0.2, r * 0.78, r * 0.16));
    const i = part(SPHERE, inner, r * 0.11, r * 0.6, r * 0.1); i.position.set(0, r * 0.02, r * 0.09); g.add(i);
    g.position.set(s * r * 0.4, r * 1.15, 0); g.rotation.z = -s * 0.1;
    return g;
  },
  // wide soft lobes draping down the sides (default puppy)
  floppy(s, r, coat, inner) {
    const g = new THREE.Group();
    g.add(part(SPHERE, coat, r * 0.34, r * 0.62, r * 0.2));
    const i = part(SPHERE, inner, r * 0.2, r * 0.44, r * 0.12); i.position.set(0, 0, r * 0.1); g.add(i);
    g.position.set(s * r * 0.74, r * 0.34, 0); g.rotation.z = s * 0.5;
    return g;
  },
  // small folded-over flaps (scottish-fold style)
  folded(s, r, coat, inner) {
    const g = new THREE.Group();
    g.add(part(SPHERE, coat, r * 0.32, r * 0.24, r * 0.2));
    const i = part(SPHERE, inner, r * 0.18, r * 0.13, r * 0.12); i.position.set(0, -r * 0.04, r * 0.13); g.add(i);
    g.position.set(s * r * 0.58, r * 0.7, r * 0.08); g.rotation.x = 0.7; g.rotation.z = s * 0.2;
    return g;
  },
  // big round panda discs, set wide
  wide(s, r, coat, inner) {
    const g = new THREE.Group();
    g.add(part(SPHERE, coat, r * 0.46, r * 0.46, r * 0.22));
    const i = part(SPHERE, inner, r * 0.3, r * 0.3, r * 0.16); i.position.set(0, 0, r * 0.14); g.add(i);
    g.position.set(s * r * 0.78, r * 0.62, 0);
    return g;
  },
};

// Build the ear pair for a type, sized to head radius r and coloured from coat.
// Shared by the live model and the creator's preview thumbnails.
export function makeEars(type, r, coat) {
  const b = EAR_BUILDERS[type];
  if (!b) return [];
  const inner = innerShade(coat);
  return [b(-1, r, coat, inner), b(1, r, coat, inner)];
}

function addEars(head, a, ears) {
  for (const ear of makeEars(a.ears, cache.head.r, a.bodyColor)) { head.add(ear); ears.push(ear); }
}

// Synchronous assembler — assumes isAuraReady(). Mirrors a builder's return shape,
// plus a `mixer` that createPet drives each frame.
export function buildAura(inner, a) {
  const model = skeletonClone(cache.scene);
  // Repaint the coat: a freshly recoloured texture (fur / muzzle / eye zones each
  // take their chosen colour, catchlights preserved) drives both the lit base
  // colour and a soft emissive so the coat stays vivid without washing features.
  const coat = coatTexture(a.bodyColor, a.muzzleColor ?? 0xe8dcc6, a.eyeColor ?? 0x1a1a1a);
  const recolour = (m) => {
    const c = m.clone();
    if (coat) {
      c.map = coat; if (c.color) c.color.setRGB(1, 1, 1);
      c.emissiveMap = coat; if (c.emissive) c.emissive.setRGB(1, 1, 1);
      c.emissiveIntensity = 0.35;
    } else if (c.color) {                 // mask unavailable: fall back to a tint
      c.color.setHex(a.bodyColor);
      if (c.emissive) { c.emissive.setHex(a.bodyColor); c.emissiveIntensity = 0.5; }
    }
    if ('specularIntensity' in c) c.specularIntensity = 0.15;
    if (c.specularColor) c.specularColor.setRGB(1, 1, 1);
    c.metalness = 0; c.roughness = 0.9;
    return c;
  };
  model.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    o.castShadow = true; o.receiveShadow = true;
    o.material = Array.isArray(o.material) ? o.material.map(recolour) : recolour(o.material);
  });
  inner.add(model);

  // head anchor (world-aligned, at the top of the head) for ears + wearables
  const head = new THREE.Group();
  head.position.set(0, cache.head.y, cache.head.z * 0.4);
  inner.add(head);

  const ears = [];
  addEars(head, a, ears);

  const mixer = new THREE.AnimationMixer(model);
  if (cache.animations[0]) mixer.clipAction(cache.animations[0]).play();

  return { head, legs: [], tail: null, ears, mixer };
}
