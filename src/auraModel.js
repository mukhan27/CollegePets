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

// Colour-keyed ZONE mask. The base texture is an authored mask painted in flat tag
// colours — RED = body fur, GREEN = muzzle, BLUE = eye iris — with black pupils/
// nose and white catchlights left as-is. We classify every pixel by its dominant
// channel (no heuristics, no flood-fill, no guessing) and recolour each zone to the
// chosen swatch, preserving the baked value as shading. Black/white stay baked, so
// pupils, nose and catchlights are always clean.
const Z_KEEP = 0, Z_FUR = 1, Z_MUZZLE = 2, Z_EYE = 3;

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
  const zMax = [1, 1, 1, 1];   // brightest "value" per zone, for shading
  for (let i = 0; i < N; i++) {
    const p = i * 4, r = d[p], g = d[p + 1], b = d[p + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    let z = Z_KEEP;
    if (mx < 70 || mn > 175 || mx - mn < 28) z = Z_KEEP;   // black / white / grey → baked
    else if (r === mx) z = Z_FUR;                          // red  → body
    else if (g === mx) z = Z_MUZZLE;                       // green→ muzzle
    else z = Z_EYE;                                        // blue → eye iris
    zone[i] = z;
    if (z && mx > zMax[z]) zMax[z] = mx;
  }
  return { orig, zone, zMax, size: s };
}

const texCache = new Map();  // key -> CanvasTexture (bounded; recolour is reused)
function coatTexture(bodyHex, muzzleHex, eyeHex) {
  const prep = cache.tex;
  if (!prep) return null;
  const key = bodyHex + '|' + muzzleHex + '|' + eyeHex;
  if (texCache.has(key)) return texCache.get(key);
  const s = prep.size, d = prep.orig.data, zone = prep.zone, zMax = prep.zMax;
  const out = new Uint8ClampedArray(d);                 // start from the original
  const cols = [null, new THREE.Color(bodyHex), new THREE.Color(muzzleHex), new THREE.Color(eyeHex)];
  for (let i = 0; i < zone.length; i++) {
    const z = zone[i]; if (z === Z_KEEP) continue;       // black/white/grey baked
    const p = i * 4;
    const f = Math.max(d[p], d[p + 1], d[p + 2]) / zMax[z];  // baked value → shading
    const c = cols[z];
    out[p] = c.r * 255 * f; out[p + 1] = c.g * 255 * f; out[p + 2] = c.b * 255 * f;
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

// Synchronous assembler — assumes isAuraReady(). Mirrors a builder's return shape,
// plus a `mixer` that createPet drives each frame.
export function buildAura(inner, a) {
  const model = skeletonClone(cache.scene);
  // Repaint the coat: a freshly recoloured texture (fur / muzzle / eye zones each
  // take their chosen colour, catchlights preserved) drives both the lit base
  // colour and a soft emissive so the coat stays vivid without washing features.
  const coat = coatTexture(a.bodyColor, a.muzzleColor ?? 0xe8dcc6, a.eyeColor ?? 0x2a2018);
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
