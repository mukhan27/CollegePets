// Authored-model path for the player's "Aura" species. Loads AI-generated .glb
// assets (a recolorable base body + swappable ear/tail parts), normalizes and
// toon-shades them like interiors.js does for furniture props, caches the parsed
// scenes, and assembles a per-player instance synchronously so the createPet()
// contract (a Group with userData {head, legs, tail, ears}) is preserved.
//
// If the assets are absent (not yet generated / offline first paint), preloadAura
// resolves with the cache empty and isAuraReady() stays false — createPet then
// falls back to the primitive buildCreature so the game always boots.

import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import { toonMat } from './textures.js';

const loader = new GLTFLoader();
const BASE = 'assets/aura/';

// asset manifest — file names match assets/aura/README.md
const PART_FILES = {
  ears: { rounded: 'ears_rounded.glb', upright: 'ears_upright.glb', floppy: 'ears_floppy.glb' },
  tail: { fluffy: 'tail_fluffy.glb', pom: 'tail_pom.glb' },
};

// anchor transforms (in `inner` space, matching the primitive build heights:
// body center y≈0.56, head center y≈1.22). Tuned once the real model lands; the
// head anchor keeps wearables sitting where they did on the 0.52-radius skull.
const HEAD_ANCHOR = [0, 1.22, 0.1];
const EAR_ANCHOR = [0, 0.45, -0.05]; // relative to the head anchor
const TAIL_ANCHOR = [0, 0.6, -0.5];  // in inner space
const TARGET_HEIGHT = 1.7;           // world units, matches the primitive creature

const cache = { body: null, ears: {}, tail: {} };
let ready = false;
let loadingPromise = null;

function loadScene(url) {
  return new Promise((resolve) => {
    loader.load(url, (gltf) => resolve(gltf.scene), undefined, () => resolve(null));
  });
}

// guess a recolor "zone" from mesh/material naming so per-zone tinting works when
// the model exposes named materials; everything unknown is treated as coat.
function zoneOf(mesh) {
  const n = ((mesh.name || '') + ' ' + ((mesh.material && mesh.material.name) || '')).toLowerCase();
  if (/eye|pupil|iris/.test(n)) return 'eye';
  if (/belly|tummy|chest|cream|underside/.test(n)) return 'belly';
  if (/inner|in_ear|ear_in|canal/.test(n)) return 'accent';
  return 'coat';
}

// replace imported materials with toon materials (same pass loadProp uses) and
// record each mesh's recolor zone for later tinting.
function toonify(scene) {
  scene.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    const src = o.material;
    const color = src && src.color ? src.color.getHex() : 0xb0a080;
    o.material = toonMat(color, { noCache: true });
    o.userData.zone = zoneOf(o);
  });
  return scene;
}

// center on X/Z, drop feet to y=0, scale to TARGET_HEIGHT. Returns the applied
// uniform scale so parts can be matched to the body.
function normalize(scene) {
  scene.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(scene);
  const size = new THREE.Vector3(); box.getSize(size);
  const s = TARGET_HEIGHT / (size.y || 1);
  scene.scale.multiplyScalar(s);
  scene.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(scene);
  const center = new THREE.Vector3(); box.getCenter(center);
  scene.position.x -= center.x;
  scene.position.z -= center.z;
  scene.position.y -= box.min.y;
  return s;
}

export function isAuraReady() { return ready; }

// Load body + every part once. Idempotent; never rejects.
export function preloadAura() {
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    const body = await loadScene(BASE + 'body.glb');
    if (!body) { ready = false; return false; } // no assets yet → primitive fallback
    cache.bodyScale = normalize(toonify(body));
    cache.body = body;

    for (const [kind, files] of Object.entries(PART_FILES)) {
      for (const [key, file] of Object.entries(files)) {
        const part = await loadScene(BASE + file);
        if (!part) continue;
        toonify(part);
        part.scale.multiplyScalar(cache.bodyScale); // match the body's normalization
        cache[kind][key] = part;
      }
    }
    ready = true;
    return true;
  })();
  return loadingPromise;
}

// pick the tint for a zone from the appearance object
function tintFor(zone, a) {
  if (zone === 'eye') return a.eyeColor;
  if (zone === 'belly') return a.bellyColor;
  if (zone === 'accent') return a.accentColor;
  return a.bodyColor;
}

// clone a cached scene and recolor it per the appearance zones
function cloneTinted(scene, a, forceZone) {
  const c = scene.clone(true);
  c.traverse((o) => {
    if (!o.isMesh) return;
    const zone = forceZone || o.userData.zone || 'coat';
    o.material = toonMat(tintFor(zone, a), { noCache: true });
  });
  return c;
}

// Synchronous assembler — assumes isAuraReady(). Mirrors a builder's return shape.
export function buildAura(inner, a) {
  const sizeScale = a.size === 'small' ? 0.9 : a.size === 'tall' ? 1.12 : 1.0;
  inner.scale.setScalar(sizeScale);

  inner.add(cloneTinted(cache.body, a));

  // head anchor: wearables + the eating food-prop parent here (radius-0.52 offsets)
  const head = new THREE.Group();
  head.position.set(...HEAD_ANCHOR);
  inner.add(head);

  // ears: the selected pair, wrapped in an anchor group so the ear-flap animation
  // (ears[].rotation.x) sweeps it; parented to the head so it rides wearables/head.
  const ears = [];
  const earPart = cache.ears[a.ears];
  if (earPart) {
    const earAnchor = new THREE.Group();
    earAnchor.position.set(...EAR_ANCHOR);
    earAnchor.add(cloneTinted(earPart, a));
    head.add(earAnchor);
    ears.push(earAnchor);
  }

  // tail: anchor group so the wag animation (tail.rotation.y) works
  let tail = null;
  const tailPart = cache.tail[a.tail];
  if (tailPart) {
    tail = new THREE.Group();
    tail.position.set(...TAIL_ANCHOR);
    tail.add(cloneTinted(tailPart, a));
    inner.add(tail);
  }

  // fused mesh has no separable legs; the hop+squash carries the walk read
  return { head, legs: [], tail, ears };
}
