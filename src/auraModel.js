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

// Recolour ONLY the body fur. The whole face — muzzle, eyes, nose, brows and the
// eye catchlights — is left exactly as Meshy baked it. "Fur" = the large field of
// bright, colourless pixels reachable from the texture border. A morphological
// opening (erode → flood from border → dilate back) drops thin bridges and the
// small bright catchlights inside the eyes, so the recolour can never leak onto a
// pupil. This is the robust, artifact-free baseline; per-feature recolour (muzzle
// / eye colour) is intentionally NOT attempted here — it needs an authored mask.
function buildTexturePrep(scene) {
  const img = findSourceImage(scene);
  if (!img || typeof document === 'undefined') return null;
  const s = MASK_SIZE, N = s * s;
  const cv = document.createElement('canvas'); cv.width = s; cv.height = s;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0, s, s);
  const orig = cx.getImageData(0, 0, s, s);
  const d = orig.data;
  const lum = new Float32Array(N);
  const bright = new Uint8Array(N), dark = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const p = i * 4, r = d[p], g = d[p + 1], b = d[p + 2];
    lum[i] = r * 0.299 + g * 0.587 + b * 0.114;
    if (lum[i] < 120) dark[i] = 1;     // include the eye's anti-aliased rim
    else if (lum[i] > 150 && Math.max(r, g, b) - Math.min(r, g, b) < 16) bright[i] = 1;
  }

  // Build a "wall" the fur flood-fill cannot cross, so it can never reach an eye's
  // interior (and its catchlight). Two steps: (1) morphologically CLOSE the dark
  // mask (dilate then erode) to seal any notch in the eye ring; (2) FILL HOLES so
  // the sealed ring becomes a solid disc. The wall's outer boundary is ~unchanged,
  // so the body fur still recolours right up to each feature edge with no halo.
  const wall = dark.slice(), tmp = new Uint8Array(N);
  const morph = (src, want) => {                 // want=1 dilate, want=0 erode
    for (let i = 0; i < N; i++) {
      const x = i % s, y = (i / s) | 0;
      const nb = (x > 0 && src[i - 1] === want) || (x < s - 1 && src[i + 1] === want) ||
                 (y > 0 && src[i - s] === want) || (y < s - 1 && src[i + s] === want);
      tmp[i] = nb ? want : src[i];
    }
    src.set(tmp);
  };
  const C = 12;
  for (let it = 0; it < C; it++) morph(wall, 1);  // dilate
  for (let it = 0; it < C; it++) morph(wall, 0);  // erode → closed
  // hole-fill: non-wall pixels unreachable from the border are enclosed (a sealed
  // eye's catchlight/pupil) → make them wall, turning each eye into a solid disc.
  const outside = new Uint8Array(N), os = [];
  const po = (i) => { if (!outside[i] && !wall[i]) { outside[i] = 1; os.push(i); } };
  for (let x = 0; x < s; x++) { po(x); po((s - 1) * s + x); }
  for (let y = 0; y < s; y++) { po(y * s); po(y * s + s - 1); }
  while (os.length) {
    const i = os.pop(), x = i % s, y = (i / s) | 0;
    if (x > 0) po(i - 1); if (x < s - 1) po(i + 1); if (y > 0) po(i - s); if (y < s - 1) po(i + s);
  }
  for (let i = 0; i < N; i++) if (!wall[i] && !outside[i]) wall[i] = 1;

  // fur = bright pixels reachable from the border WITHOUT crossing a wall.
  const fur = new Uint8Array(N), st = [];
  const push = (i) => { if (!fur[i] && bright[i] && !wall[i]) { fur[i] = 1; st.push(i); } };
  for (let x = 0; x < s; x++) { push(x); push((s - 1) * s + x); }
  for (let y = 0; y < s; y++) { push(y * s); push(y * s + s - 1); }
  while (st.length) {
    const i = st.pop(), x = i % s, y = (i / s) | 0;
    if (x > 0) push(i - 1); if (x < s - 1) push(i + 1); if (y > 0) push(i - s); if (y < s - 1) push(i + s);
  }
  let furMax = 1;
  for (let i = 0; i < N; i++) if (fur[i] && lum[i] > furMax) furMax = lum[i];
  // Eye interiors should be neutral (black pupil + white catchlight). Meshy baked
  // a blue-grey tint into one catchlight, which reads as a coloured pupil. So we
  // mark any non-dark COLOURED pixel sealed inside an eye wall to be desaturated at
  // recolour time — this neutralises the tint while leaving the dark pupil/brows
  // (already neutral, and below the luminance cut) untouched.
  const hi = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (!wall[i] || lum[i] <= 95) continue;
    const p = i * 4;
    if (Math.max(d[p], d[p + 1], d[p + 2]) - Math.min(d[p], d[p + 1], d[p + 2]) > 12) hi[i] = 1;
  }
  return { orig, fur, hi, furMax, size: s };
}

const texCache = new Map();  // bodyHex -> CanvasTexture (bounded; recolour is reused)
function coatTexture(bodyHex) {
  const prep = cache.tex;
  if (!prep) return null;
  if (texCache.has(bodyHex)) return texCache.get(bodyHex);
  const s = prep.size, d = prep.orig.data, fur = prep.fur, hi = prep.hi, fMax = prep.furMax;
  const out = new Uint8ClampedArray(d);                 // start from the original
  const body = new THREE.Color(bodyHex);
  for (let i = 0; i < fur.length; i++) {
    const p = i * 4;
    if (fur[i]) {                                       // body fur → coat colour
      const f = Math.min(1, lumA(d, p) / fMax);         // keep the baked shading
      out[p] = body.r * 255 * f; out[p + 1] = body.g * 255 * f; out[p + 2] = body.b * 255 * f;
    } else if (hi[i]) {                                 // eye highlight → neutral white
      const L = lumA(d, p); out[p] = L; out[p + 1] = L; out[p + 2] = L;
    }                                                   // else: baked face, untouched
  }
  const cv = document.createElement('canvas'); cv.width = s; cv.height = s;
  cv.getContext('2d').putImageData(new ImageData(out, s, s), 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace;
  // No mipmaps: at this on-screen size a mip level would average the catchlight
  // edge with the adjacent recoloured fur and tint the white highlight. Sampling
  // the full-res texture keeps the black eye-ring crisp between them.
  tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  if (texCache.size > 12) { const [k, old] = texCache.entries().next().value; old.dispose(); texCache.delete(k); }
  texCache.set(bodyHex, tex);
  return tex;
}
function lumA(d, p) { return d[p] * 0.299 + d[p + 1] * 0.587 + d[p + 2] * 0.114; }

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

// Synchronous assembler — assumes isAuraReady(). Mirrors a builder's return shape,
// plus a `mixer` that createPet drives each frame.
export function buildAura(inner, a) {
  const model = skeletonClone(cache.scene);
  // Repaint the coat: a freshly recoloured texture (fur / muzzle / eye zones each
  // take their chosen colour, catchlights preserved) drives both the lit base
  // colour and a soft emissive so the coat stays vivid without washing features.
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

  // head anchor (world-aligned, near the crown) for ears + wearables. Keep it
  // centred over the head (no forward push) so ears sit on top, not in front.
  const head = new THREE.Group();
  head.position.set(0, cache.head.y, 0);
  inner.add(head);

  const ears = [];
  addEars(head, a, ears);

  // Pose the model ONCE into a calm standing idle: freeze the authored clip at its
  // first frame, then swing the arms down to the sides. The clip is never advanced
  // afterwards (so nothing flails and the skinned cheek never jitters); life comes
  // from a subtle breathing scale + ear flap applied by createPet's animate().
  if (cache.animations[0]) {
    const mixer = new THREE.AnimationMixer(model);
    mixer.clipAction(cache.animations[0]).play();
    mixer.update(0);                          // settle into the rest pose, then leave it
  }
  inner.updateMatrixWorld(true);
  const tuckArm = (name) => {
    const b = model.getObjectByName(name), child = b && b.children[0];
    if (!b || !child) return;
    const a = new THREE.Vector3().setFromMatrixPosition(b.matrixWorld);
    const c = new THREE.Vector3().setFromMatrixPosition(child.matrixWorld);
    const u = c.sub(a).normalize();                       // current arm direction (world)
    const out = Math.sign(u.x) || 1;                      // which side this arm is on
    const v = new THREE.Vector3(out * ARM_OUT, -1, 0).normalize(); // target: mostly down
    const Rw = new THREE.Quaternion().setFromUnitVectors(u, v);
    const Qp = new THREE.Quaternion(); b.parent.getWorldQuaternion(Qp);
    const q = Qp.clone().invert().multiply(Rw).multiply(Qp); // world rot → parent frame
    b.quaternion.premultiply(q);                            // applied once, stays put
  };
  tuckArm('LeftArm'); tuckArm('RightArm');

  return { head, legs: [], tail: null, ears, breathe: true };
}
const ARM_OUT = 0.18;   // how far the relaxed arms splay from straight-down
