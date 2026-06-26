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

// One-time prep: original pixels + a fur mask (border-connected light pixels).
// Recolouring then just rewrites the fur pixels per colour; every dark feature
// AND the enclosed eye catchlights keep their original colour.
function buildTexturePrep(scene) {
  const img = findSourceImage(scene);
  if (!img || typeof document === 'undefined') return null;
  const s = MASK_SIZE;
  const cv = document.createElement('canvas'); cv.width = s; cv.height = s;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0, s, s);
  const orig = cx.getImageData(0, 0, s, s);
  const d = orig.data;

  // fur = light pixels reachable from the border. Enclosed light pixels (the eye
  // catchlights) are NOT reached, so they stay their original white.
  const fur = new Uint8Array(s * s);
  const lum = (idx) => { const p = idx * 4; return d[p] * 0.299 + d[p + 1] * 0.587 + d[p + 2] * 0.114; };
  const stack = [];
  const push = (idx) => { if (!fur[idx] && lum(idx) > 165) { fur[idx] = 1; stack.push(idx); } };
  for (let x = 0; x < s; x++) { push(x); push((s - 1) * s + x); }
  for (let y = 0; y < s; y++) { push(y * s); push(y * s + s - 1); }
  while (stack.length) {
    const idx = stack.pop(), x = idx % s, y = (idx / s) | 0;
    if (x > 0) push(idx - 1); if (x < s - 1) push(idx + 1);
    if (y > 0) push(idx - s); if (y < s - 1) push(idx + s);
  }

  return { orig, fur, size: s };
}

const texCache = new Map();  // hex -> CanvasTexture (bounded; recolour is reused)
function coatTexture(hex) {
  const prep = cache.tex;
  if (!prep) return null;
  if (texCache.has(hex)) return texCache.get(hex);
  const s = prep.size;
  const out = new Uint8ClampedArray(prep.orig.data);   // start from the original
  const coat = new THREE.Color(hex);
  const cR = coat.r * 255, cG = coat.g * 255, cB = coat.b * 255;
  const fur = prep.fur;
  for (let i = 0; i < fur.length; i++) {
    if (!fur[i]) continue;                              // features/catchlights: untouched
    const p = i * 4;
    out[p] = cR; out[p + 1] = cG; out[p + 2] = cB;
  }
  const cv = document.createElement('canvas'); cv.width = s; cv.height = s;
  cv.getContext('2d').putImageData(new ImageData(out, s, s), 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  tex.needsUpdate = true;
  if (texCache.size > 10) { const [k, old] = texCache.entries().next().value; old.dispose(); texCache.delete(k); }
  texCache.set(hex, tex);
  return tex;
}

function smoothMesh(geo, hex, rough = 0.82) {
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: 0 }));
  m.castShadow = true;
  return m;
}
const SPHERE = new THREE.SphereGeometry(1, 18, 14);
function blob(r, hex, sx = 1, sy = 1, sz = 1) { const m = smoothMesh(SPHERE, hex); m.scale.set(r * sx, r * sy, r * sz); return m; }

// code-built ear pair attached to the head anchor (so the ear-flap animation works).
// Each ear hugs the head side so it reads as attached, not a floating disc.
function addEars(head, a, ears) {
  if (a.ears === 'none') return;
  const r = cache.head.r, coat = a.bodyColor;
  for (const s of [-1, 1]) {
    let ear;
    if (a.ears === 'upright') {            // tall pointed ears, up and slightly out
      ear = blob(r * 0.3, coat, 0.75, 1.6, 0.75);
      ear.position.set(s * r * 0.52, r * 0.92, 0); ear.rotation.z = s * 0.14;
    } else if (a.ears === 'rounded') {      // small round ears on top corners
      ear = blob(r * 0.34, coat, 0.95, 0.95, 0.9);
      ear.position.set(s * r * 0.6, r * 0.86, 0);
    } else {                                // floppy (default) — soft lobes draping the sides
      ear = blob(r * 0.46, coat, 0.72, 1.45, 0.8);
      ear.position.set(s * r * 0.74, r * 0.06, 0); ear.rotation.z = s * 0.30;
    }
    head.add(ear); ears.push(ear);
  }
}

// Synchronous assembler — assumes isAuraReady(). Mirrors a builder's return shape,
// plus a `mixer` that createPet drives each frame.
export function buildAura(inner, a) {
  const model = skeletonClone(cache.scene);
  // Repaint the coat: a freshly recoloured texture (fur = chosen colour, dark
  // eyes/nose/mouth preserved) drives both the lit base colour and a soft
  // emissive so the coat stays vivid without washing the features.
  const coat = coatTexture(a.bodyColor);
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
