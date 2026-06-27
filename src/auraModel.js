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
//   FUR    – bright, colourless, border-reachable (the body coat)  → bodyColor
//   MUZZLE – the baked cream snout (warm patch, dilated to its rim) → muzzleColor
//   EYE    – ONLY the eye irises (dark blob + catchlight, on fur)   → eyeColor
//   KEEP   – everything else: nose, brows, mouth, catchlights, edges → untouched
// The nose/brows are deliberately KEEP so they never recolour with the eyes.
const Z_KEEP = 0, Z_FUR = 1, Z_MUZZLE = 2, Z_EYE = 3;
// colourises zones for verification renders (open with #zones in the URL)
const DEBUG_ZONES = typeof location !== 'undefined' && /zones/.test(location.hash || '');

function buildTexturePrep(scene) {
  const img = findSourceImage(scene);
  if (!img || typeof document === 'undefined') return null;
  const s = MASK_SIZE, N = s * s;
  const cv = document.createElement('canvas'); cv.width = s; cv.height = s;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0, s, s);
  const orig = cx.getImageData(0, 0, s, s);
  const d = orig.data;
  const lumA = new Float32Array(N), chrA = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const p = i * 4, r = d[p], g = d[p + 1], b = d[p + 2];
    lumA[i] = r * 0.299 + g * 0.587 + b * 0.114;
    chrA[i] = Math.max(r, g, b) - Math.min(r, g, b);
  }
  const zone = new Uint8Array(N);

  // 1) FUR — flood-fill bright + colourless pixels inward from the border.
  const stack = [];
  const pushFur = (idx) => { if (!zone[idx] && lumA[idx] > 150 && chrA[idx] < 16) { zone[idx] = Z_FUR; stack.push(idx); } };
  for (let x = 0; x < s; x++) { pushFur(x); pushFur((s - 1) * s + x); }
  for (let y = 0; y < s; y++) { pushFur(y * s); pushFur(y * s + s - 1); }
  while (stack.length) {
    const idx = stack.pop(), x = idx % s, y = (idx / s) | 0;
    if (x > 0) pushFur(idx - 1); if (x < s - 1) pushFur(idx + 1);
    if (y > 0) pushFur(idx - s); if (y < s - 1) pushFur(idx + s);
  }

  // 2) provisional: MUZZLE core (warm & bright) and a DARK mask; rest is KEEP.
  const dark = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (zone[i] === Z_FUR) continue;
    if (lumA[i] < 95) dark[i] = 1;
    else if (chrA[i] >= 16 && lumA[i] > 120) zone[i] = Z_MUZZLE;
  }

  // 3) connected dark components → keep stats to tell EYES from nose/brows/mouth.
  const comp = new Int32Array(N).fill(-1);
  const area = [], furN = [], muzN = [], catchN = [];
  const isCatch = (i) => lumA[i] > 150 && !dark[i] && zone[i] !== Z_FUR && zone[i] !== Z_MUZZLE;
  const q = [];
  let nc = 0;
  for (let start = 0; start < N; start++) {
    if (!dark[start] || comp[start] >= 0) continue;
    const id = nc++; area[id] = 0; furN[id] = 0; muzN[id] = 0; catchN[id] = 0;
    comp[start] = id; q.length = 0; q.push(start);
    while (q.length) {
      const idx = q.pop(); area[id]++;
      const x = idx % s, y = (idx / s) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= s || ny >= s) continue;
        const ni = ny * s + nx;
        if (dark[ni]) { if (comp[ni] < 0) { comp[ni] = id; q.push(ni); } }
        else { if (zone[ni] === Z_FUR) furN[id]++; else if (zone[ni] === Z_MUZZLE) muzN[id]++; if (isCatch(ni)) catchN[id]++; }
      }
    }
  }
  // an eye = a fur-surrounded dark blob that wraps a catchlight (nose sits on the
  // muzzle → muz-surrounded; brows/mouth have no catchlight) — so only eyes match.
  const eyeComp = (id) => id >= 0 && area[id] > 30 && catchN[id] > 0 && furN[id] > muzN[id];
  for (let i = 0; i < N; i++) if (dark[i] && eyeComp(comp[i])) zone[i] = Z_EYE;

  // 4) MUZZLE dilation — grow only into FUR so the near-white snout rim is absorbed
  //    (fixes white pixels at the top of the muzzle) AND so the snout's UV-split
  //    fragments merge into one big blob. Never touches dark/eye/keep.
  const DIL = Math.round(s * 0.014);
  for (let it = 0; it < DIL; it++) {
    const add = [];
    for (let i = 0; i < N; i++) {
      if (zone[i] !== Z_FUR) continue;
      const x = i % s, y = (i / s) | 0;
      if ((x > 0 && zone[i - 1] === Z_MUZZLE) || (x < s - 1 && zone[i + 1] === Z_MUZZLE) ||
          (y > 0 && zone[i - s] === Z_MUZZLE) || (y < s - 1 && zone[i + s] === Z_MUZZLE)) add.push(i);
    }
    if (!add.length) break;
    for (const i of add) zone[i] = Z_MUZZLE;
  }

  // 4b) NOW drop stray warm specks: after dilation the snout is one large blob,
  //     while scattered noise patches stay small — so a size cut cleanly removes
  //     them. Components below the cut revert to FUR.
  {
    const mc = new Int32Array(N).fill(-1), ma = [], mq = []; let mn = 0;
    for (let start = 0; start < N; start++) {
      if (zone[start] !== Z_MUZZLE || mc[start] >= 0) continue;
      const id = mn++; ma[id] = 0; mc[start] = id; mq.length = 0; mq.push(start);
      while (mq.length) {
        const idx = mq.pop(); ma[id]++; const x = idx % s, y = (idx / s) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= s || ny >= s) continue;
          const ni = ny * s + nx;
          if (zone[ni] === Z_MUZZLE && mc[ni] < 0) { mc[ni] = id; mq.push(ni); }
        }
      }
    }
    let bestA = 0; for (let id = 0; id < mn; id++) if (ma[id] > bestA) bestA = ma[id];
    const cut = bestA * 0.5;   // keep only blobs at least half the snout's size
    for (let i = 0; i < N; i++) if (zone[i] === Z_MUZZLE && ma[mc[i]] < cut) zone[i] = Z_FUR;
  }

  // 5) per-zone brightest luminance, for shading-preserving recolour.
  let furMax = 1, muzMax = 1, eyeMax = 1;
  for (let i = 0; i < N; i++) {
    const z = zone[i];
    if (z === Z_FUR) { if (lumA[i] > furMax) furMax = lumA[i]; }
    else if (z === Z_MUZZLE) { if (lumA[i] > muzMax) muzMax = lumA[i]; }
    else if (z === Z_EYE) { if (lumA[i] > eyeMax) eyeMax = lumA[i]; }
  }
  return { orig, zone, furMax, muzMax, eyeMax, size: s };
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
  const fMax = prep.furMax, mMax = prep.muzMax, eMax = prep.eyeMax;
  const DBG = { [Z_FUR]: null, [Z_MUZZLE]: new THREE.Color(0x00ff00), [Z_EYE]: new THREE.Color(0xff00ff) };
  for (let i = 0; i < zone.length; i++) {
    const z = zone[i]; if (z === Z_KEEP) continue;
    const p = i * 4;
    if (DEBUG_ZONES && DBG[z]) { out[p] = DBG[z].r * 255; out[p + 1] = DBG[z].g * 255; out[p + 2] = DBG[z].b * 255; continue; }
    // each recolour zone shades its chosen colour by the baked luminance so the
    // form (snout shading, pupil gradient) survives. Eyes get a brightness floor
    // so the chosen iris colour actually reads instead of staying near-black.
    const lum = d[p] * 0.299 + d[p + 1] * 0.587 + d[p + 2] * 0.114;
    const c = z === Z_EYE ? eye : z === Z_MUZZLE ? muz : body;
    const f = z === Z_EYE
      ? 0.5 + 0.5 * Math.min(1, lum / eMax)
      : Math.min(1, lum / (z === Z_MUZZLE ? mMax : fMax));
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

  // head anchor (world-aligned, near the crown) for ears + wearables. Keep it
  // centred over the head (no forward push) so ears sit on top, not in front.
  const head = new THREE.Group();
  head.position.set(0, cache.head.y, 0);
  inner.add(head);

  const ears = [];
  addEars(head, a, ears);

  const mixer = new THREE.AnimationMixer(model);
  if (cache.animations[0]) mixer.clipAction(cache.animations[0]).play();

  // Relax the arms out of the authored A-pose down to the sides. We compute, per
  // arm, the world rotation that swings the upper-arm direction down to the body,
  // then express it in the bone's parent frame so it can be pre-applied on top of
  // the clip each frame (createPet re-applies it after every mixer update).
  inner.updateMatrixWorld(true);
  const armSetup = (name) => {
    const b = model.getObjectByName(name), child = b && b.children[0];
    if (!b || !child) return null;
    const a = new THREE.Vector3().setFromMatrixPosition(b.matrixWorld);
    const c = new THREE.Vector3().setFromMatrixPosition(child.matrixWorld);
    const u = c.sub(a).normalize();                       // current arm direction (world)
    const out = Math.sign(u.x) || 1;                      // which side this arm is on
    const v = new THREE.Vector3(out * ARM_OUT, -1, 0).normalize(); // target: mostly down
    const Rw = new THREE.Quaternion().setFromUnitVectors(u, v);
    const Qp = new THREE.Quaternion(); b.parent.getWorldQuaternion(Qp);
    const q = Qp.clone().invert().multiply(Rw).multiply(Qp); // world rot → parent frame
    return { b, q };
  };
  const arms = [armSetup('LeftArm'), armSetup('RightArm')].filter(Boolean);

  return { head, legs: [], tail: null, ears, arms, mixer };
}
const ARM_OUT = 0.18;   // how far the relaxed arms splay from straight-down
