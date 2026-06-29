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

// Colour-keyed ZONE mask. The base texture is authored in distinct hues — RED = body
// fur, ORANGE = pants, YELLOW = shirt, GREEN = muzzle, BLUE = eye iris — with black
// pupils/nose and white catchlights left as-is. We classify every pixel by its HUE
// (the regions are deliberately different hues) and recolour each zone to the chosen
// swatch, preserving the baked value as shading. Black/white/grey stay baked, so
// pupils, nose, brows and catchlights are always clean.
const Z_KEEP = 0, Z_FUR = 1, Z_MUZZLE = 2, Z_EYE = 3, Z_SHIRT = 4, Z_PANTS = 5;
const NZONES = 6;

// classify one pixel into a zone by hue; neutral (dark/light/grey) pixels are kept.
function classifyZone(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), c = mx - mn;
  if (mx < 45 || mn > 200 || c < 22) return Z_KEEP;     // black / white / grey
  let h;
  if (mx === r) h = ((g - b) / c) % 6; else if (mx === g) h = (b - r) / c + 2; else h = (r - g) / c + 4;
  h *= 60; if (h < 0) h += 360;
  if (h >= 345 || h < 14) return Z_FUR;     // red    → fur (~355°)
  if (h < 40) return Z_PANTS;               // orange → pants (~24°)
  if (h < 75) return Z_SHIRT;               // yellow → shirt (~47°)
  if (h < 180) return Z_MUZZLE;             // green  → muzzle (~105°)
  if (h < 300) return Z_EYE;                // blue   → eye iris (~215°)
  return Z_KEEP;                            // magenta/pink (unused) → leave baked
}

function buildTexturePrep(scene) {
  const img = findSourceImage(scene);
  if (!img || typeof document === 'undefined') return null;
  const s = MASK_SIZE, N = s * s;
  const cv = document.createElement('canvas'); cv.width = s; cv.height = s;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0, s, s);
  const orig = cx.getImageData(0, 0, s, s);
  const d = orig.data;
  const zone = new Uint8Array(N);
  const zMax = new Array(NZONES).fill(1);   // brightest "value" per zone, for shading
  for (let i = 0; i < N; i++) {
    const p = i * 4, r = d[p], g = d[p + 1], b = d[p + 2];
    const z = classifyZone(r, g, b);
    zone[i] = z;
    const mx = Math.max(r, g, b);
    if (z && mx > zMax[z]) zMax[z] = mx;
  }
  return { orig, zone, zMax, size: s };
}

const texCache = new Map();  // key -> CanvasTexture (bounded; recolour is reused)
function coatTexture(bodyHex, muzzleHex, eyeHex, shirtHex, pantsHex) {
  const prep = cache.tex;
  if (!prep) return null;
  const key = [bodyHex, muzzleHex, eyeHex, shirtHex, pantsHex].join('|');
  if (texCache.has(key)) return texCache.get(key);
  const s = prep.size, d = prep.orig.data, zone = prep.zone, zMax = prep.zMax;
  const out = new Uint8ClampedArray(d);                 // start from the original
  // Write RAW sRGB bytes straight from the hex. NB: THREE.Color(hex) converts to
  // LINEAR light internally, and the texture is tagged sRGB — writing linear values
  // into it would gamma-darken green twice and skew yellow→amber / orange→red.
  const hexRGB = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
  const cols = [];
  cols[Z_FUR] = hexRGB(bodyHex);
  cols[Z_MUZZLE] = hexRGB(muzzleHex);
  cols[Z_EYE] = hexRGB(eyeHex);
  cols[Z_SHIRT] = hexRGB(shirtHex);
  cols[Z_PANTS] = hexRGB(pantsHex);
  for (let i = 0; i < zone.length; i++) {
    const z = zone[i]; if (z === Z_KEEP) continue;       // black/white/grey baked
    const p = i * 4;
    const f0 = Math.min(1, Math.max(d[p], d[p + 1], d[p + 2]) / zMax[z]);  // baked value
    // Eyes: keep the full baked value so the DARK iris centre stays dark and reads as a
    // pupil — an over-aggressive floor flattens the iris into a blob and erases the
    // pupil. Clothing (yellow/orange) is perceptually sensitive to darkening — shaded
    // areas read as muddy amber — so lift its shadows with a floor. Fur/muzzle/eye keep
    // their full baked shading.
    const f = (z === Z_SHIRT || z === Z_PANTS) ? 0.74 + 0.26 * f0 : f0;
    const c = cols[z];
    out[p] = c[0] * f; out[p + 1] = c[1] * f; out[p + 2] = c[2] * f;
  }
  const cv = document.createElement('canvas'); cv.width = s; cv.height = s;
  cv.getContext('2d').putImageData(new ImageData(out, s, s), 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
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

// Build one ear: a flattened outer shell + a recessed inner-ear, with a base
// tilt stored in userData.flapX (the flap animation adds to it instead of
// overwriting, so folds/tilts survive). `lobe` builds the two-shell ear.
function lobe(geo, r, coat, inner, ox, oy, oz, ix, iy, iz, iyOff, izOff) {
  const g = new THREE.Group();
  g.add(part(geo, coat, r * ox, r * oy, r * oz));
  const inr = part(geo, inner, r * ix, r * iy, r * iz);
  inr.position.set(0, r * iyOff, r * izOff); g.add(inr);
  return g;
}
function place(g, s, r, px, py, pz, rx, ry, rz) {
  g.position.set(s * r * px, r * py, r * pz);
  g.rotation.set(rx, s * ry, s * rz);
  g.userData.flapX = rx;                 // base tilt; flap animates around it
  return g;
}

const EAR_BUILDERS = {
  // soft rounded bear ears — flat discs on the crown, leaned back a touch
  round(s, r, coat, inner) {
    const g = lobe(SPHERE, r, coat, inner, 0.42, 0.42, 0.15, 0.26, 0.26, 0.1, -0.02, 0.1);
    return place(g, s, r, 0.58, 0.82, -0.05, -0.14, -0.25, 0);
  },
  // upright pointed cat ears — thin triangles
  pointed(s, r, coat, inner) {
    const g = lobe(CONE, r, coat, inner, 0.32, 0.66, 0.14, 0.18, 0.5, 0.09, -0.06, 0.08);
    return place(g, s, r, 0.46, 0.9, -0.04, -0.12, 0, -0.18);
  },
  // long upright bunny ears
  tall(s, r, coat, inner) {
    const g = lobe(SPHERE, r, coat, inner, 0.18, 0.82, 0.12, 0.1, 0.64, 0.08, 0.02, 0.08);
    return place(g, s, r, 0.36, 1.18, -0.04, -0.1, 0, -0.08);
  },
  // wide floppy puppy ears draping the sides
  floppy(s, r, coat, inner) {
    const g = lobe(SPHERE, r, coat, inner, 0.3, 0.66, 0.14, 0.17, 0.46, 0.09, 0.05, 0.08);
    return place(g, s, r, 0.66, 0.42, -0.02, 0.05, 0, 0.72);
  },
  // small folded-down flaps (scottish-fold style)
  folded(s, r, coat, inner) {
    const g = lobe(SPHERE, r, coat, inner, 0.34, 0.26, 0.13, 0.2, 0.14, 0.08, -0.05, 0.1);
    return place(g, s, r, 0.54, 0.74, 0.02, 0.9, 0, 0.18);
  },
  // big round panda ears, set wide
  wide(s, r, coat, inner) {
    const g = lobe(SPHERE, r, coat, inner, 0.48, 0.48, 0.16, 0.3, 0.3, 0.11, 0, 0.11);
    return place(g, s, r, 0.74, 0.64, -0.05, -0.12, -0.2, 0);
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

// Synchronous assembler — assumes isAuraReady(). Clones the rigged duck, keeps its
// baked texture (yellow body / green shirt / orange beak / black eyes), and returns
// a custom `animate` that drives a walk cycle on the leg bones so the rig is visible.
const WALK = { LEG_BONES: ['Bone_010', 'Bone_015'], SPEED: 7, AMP: 0.5, BOB: 0.03 };
const X_AXIS = new THREE.Vector3(1, 0, 0);
export function buildAura(inner, a) {
  const model = skeletonClone(cache.scene);
  model.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    o.castShadow = true; o.receiveShadow = true;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) { m.metalness = 0; if (m.roughness !== undefined) m.roughness = 0.6; }
  });
  inner.add(model);
  inner.updateMatrixWorld(true);

  // head anchor near the crown (for hats / wearables)
  const head = new THREE.Group();
  head.position.set(0, cache.head.y, 0);
  inner.add(head);

  // Capture each leg's hip bone + its parent world orientation so we can swing it
  // around the WORLD x-axis (forward/back) regardless of the bone's local frame.
  const legs = [];
  for (const name of WALK.LEG_BONES) {
    const hip = model.getObjectByName(name);
    if (!hip || !hip.parent) continue;
    const Qp = new THREE.Quaternion(); hip.parent.getWorldQuaternion(Qp);
    legs.push({ hip, rest: hip.quaternion.clone(), Qp, QpInv: Qp.clone().invert() });
  }

  const tmp = new THREE.Quaternion();
  // Walk cycle: legs swing antiphase; the body bobs. (Always walks for now so the
  // rig is visible on the customization screen.)
  const animate = (t) => {
    legs.forEach((L, i) => {
      const ang = Math.sin(t * WALK.SPEED + i * Math.PI) * WALK.AMP;
      tmp.setFromAxisAngle(X_AXIS, ang);                     // world-space swing
      L.hip.quaternion.copy(L.QpInv).multiply(tmp).multiply(L.Qp).multiply(L.rest);
    });
    inner.position.y = Math.abs(Math.sin(t * WALK.SPEED)) * WALK.BOB;
  };

  return { head, legs: [], tail: null, ears: [], breathe: false, animate };
}
