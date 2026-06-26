// Authored-model path for the player's "Aura" species. Loads the rigged Meshy
// GLB (skeleton + idle clip), normalizes + caches it, and assembles a per-player
// instance synchronously so the createPet() contract is preserved. Adds code-built
// ears on the head and tints the coat to the chosen colour. If the asset is absent
// (offline / first paint), isAuraReady() stays false and createPet falls back to
// the primitive buildCreature.

import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from '../vendor/addons/utils/SkeletonUtils.js';

const loader = new GLTFLoader();
const BASE = 'assets/aura/';
const TARGET_HEIGHT = 1.7;

let cache = null;            // { scene, animations, head: {y,z,r} }
let ready = false;
let loadingPromise = null;

function loadGLB(url) {
  return new Promise((resolve) => {
    loader.load(url, (g) => resolve(g), undefined, (e) => { console.warn('[aura] GLB load failed', url, (e && (e.message || e.type || e)) || ''); resolve(null); });
  });
}

export function isAuraReady() { return ready; }

// Load + normalize the rigged body once. Idempotent; never rejects.
export function preloadAura() {
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
   try {
    const g = await loadGLB(BASE + 'body.glb');
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

    // strip baked texture so bodyColor swatch fully controls appearance
    scene.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) { m.map = null; m.needsUpdate = true; }
    });

    // remember head metrics (top ~quarter of the body) for ear/wearable anchors
    box = new THREE.Box3().setFromObject(scene);
    const headTop = box.max.y;
    const headR = (box.max.x - box.min.x) * 0.5 * 0.78;
    cache = { scene, animations: g.animations || [], head: { y: headTop - headR * 0.9, z: box.max.z * 0.45, r: headR } };
    ready = true;
    return true;
   } catch (e) { console.warn('[aura] preload error', e && e.message, e && e.stack); ready = false; return false; }
  })();
  return loadingPromise;
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
  // The Meshy coat colour is baked into the EMISSIVE channel (white emissive
  // texture = self-lit white pup), so the swatch must drive `emissive`, not the
  // base colour. The emissive texture also carries the face (dark eyes/nose), so
  // we keep it: white coat pixels take the tint, dark face pixels stay dark.
  const tint = (m) => {
    const c = m.clone();
    const col = new THREE.Color(a.bodyColor);
    if (c.emissive) { c.emissive.copy(col); c.emissiveIntensity = 0.9; }
    if (c.color) c.color.copy(col).multiplyScalar(0.5); // gentle lit shading on top
    if ('specularIntensity' in c) c.specularIntensity = 0.2;
    if (c.specularColor) c.specularColor.setRGB(1, 1, 1);
    c.metalness = 0; c.roughness = 0.85;
    return c;
  };
  model.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    o.castShadow = true; o.receiveShadow = true;
    o.material = Array.isArray(o.material) ? o.material.map(tint) : tint(o.material);
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
