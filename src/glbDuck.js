// Loads the authored low-poly Duck.glb (a single static mesh — no skeleton), styles it
// to match the game (toon gradient over its baked texture + an inverted-hull outline),
// and RIGS it programmatically: we build a tiny skeleton (a root bone + two leg bones)
// and skin the leg/foot vertices to the leg bones so a basic walk cycle can swing them.
// The body/head stay rigidly on the root bone, so the mesh itself is never distorted.
// If the asset is missing, isDuckReady() stays false and createPet falls back to the
// procedural toon duck.

import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import { toonGradient } from './textures.js';

const loader = new GLTFLoader();
const URL = 'assets/duckmodel.glb';
const TARGET_H = 1.55;
const OUTLINE = 0x3a2e26;

let cache = null;     // { geometry (normalized + skin attrs), map, hipY, legX }
let ready = false;
let loadingPromise = null;

export function isDuckReady() { return ready; }

export function preloadDuck() {
  if (loadingPromise) return loadingPromise;
  loadingPromise = new Promise((resolve) => {
    loader.load(URL, (g) => {
      try {
        let mesh = null;
        g.scene.traverse((o) => { if (!mesh && o.isMesh) mesh = o; });
        if (!mesh) { ready = false; return resolve(false); }

        // bake any node transform into the geometry, then normalize: scale to TARGET_H,
        // centre on x/z, drop feet to y=0. (Doing it on the geometry keeps the bind pose
        // and the skin weights in one clean coordinate space.)
        const geo = mesh.geometry.clone();
        mesh.updateWorldMatrix(true, false);
        geo.applyMatrix4(mesh.matrixWorld);
        geo.computeBoundingBox();
        let bb = geo.boundingBox;
        const s = TARGET_H / ((bb.max.y - bb.min.y) || 1);
        geo.scale(s, s, s);
        geo.computeBoundingBox(); bb = geo.boundingBox;
        const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
        geo.translate(-cx, -bb.min.y, -cz);
        geo.computeBoundingBox(); bb = geo.boundingBox;
        const H = bb.max.y - bb.min.y;

        // legs live in the bottom ~32% of the height; the hips are where they meet the
        // body. Two leg columns sit roughly at x = ±legX.
        const hipY = bb.min.y + H * 0.34;
        const legX = (bb.max.x - bb.min.x) * 0.16;

        addSkinWeights(geo, hipY, legX);

        cache = { geometry: geo, map: firstMap(mesh.material), hipY, legX };
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

// Per-vertex skin weights: body/head ride the root bone (bone 0, never moves); the leg
// columns + webbed feet ride a leg bone (1 = left, 2 = right) with a smooth ramp at the
// hip and a horizontal gate so the wide belly is NOT pulled into the swing (no tearing).
function addSkinWeights(geo, hipY, legX) {
  const pos = geo.attributes.position, n = pos.count;
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  const clamp = (v) => Math.max(0, Math.min(1, v));
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    let idx1 = 0, legW = 0;
    if (y < hipY) {
      const side = x < 0 ? 1 : 2;
      const hipXs = x < 0 ? -legX : legX;
      const ySwing = clamp((hipY - y) / 0.16);                 // 0 at hip → 1 below
      const foot = y < hipY - 0.26;                            // deep = feet/lower leg
      const dx = Math.abs(x - hipXs);
      const xGate = foot ? 1 : clamp(1 - (dx - 0.10) / 0.16);  // keep the wide belly on root
      legW = ySwing * xGate;
      idx1 = side;
    }
    const p = i * 4;
    if (legW < 0.03) { si[p] = 0; sw[p] = 1; }
    else { si[p] = 0; si[p + 1] = idx1; sw[p] = 1 - legW; sw[p + 1] = legW; }
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
}

function makeSkeleton(hipY, legX) {
  const root = new THREE.Bone();
  const legL = new THREE.Bone(); legL.position.set(-legX, hipY, 0); root.add(legL);
  const legR = new THREE.Bone(); legR.position.set(legX, hipY, 0); root.add(legR);
  return { bones: [root, legL, legR], root, legL, legR };
}

// Build a per-pet skinned duck. Returns the createPet parts contract with a custom
// `animate` that walks the legs and bobs the body.
export function buildGlbDuck(inner, _a) {
  const { geometry, map, hipY, legX } = cache;

  const bodyMat = new THREE.MeshToonMaterial({ map, gradientMap: toonGradient() });
  const outMat = new THREE.MeshBasicMaterial({ color: OUTLINE, side: THREE.BackSide });

  // skinned body (toon + texture)
  const { bones, root, legL, legR } = makeSkeleton(hipY, legX);
  const body = new THREE.SkinnedMesh(geometry, bodyMat);
  body.castShadow = true; body.receiveShadow = true; body.frustumCulled = false;
  body.add(root);
  body.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  body.bind(skeleton);
  inner.add(body);

  // inverted-hull outline as a SECOND skinned mesh sharing the skeleton, so it deforms
  // with the legs. Slightly inflated geometry, rendered back-side only.
  const outGeo = geometry.clone();
  const op = outGeo.attributes.position;
  for (let i = 0; i < op.count; i++) { op.setXYZ(i, op.getX(i) * 1.04, op.getY(i) * 1.04, op.getZ(i) * 1.04); }
  op.needsUpdate = true;
  const outline = new THREE.SkinnedMesh(outGeo, outMat);
  outline.frustumCulled = false;
  outline.bind(skeleton, body.bindMatrix);
  inner.add(outline);

  // head anchor (top of the model) for any future head-worn items
  const head = new THREE.Group(); head.position.set(0, TARGET_H * 0.82, 0); inner.add(head);

  const baseY = inner.position.y;
  const animate = (t, moving) => {
    if (moving) {
      const sp = 7, amp = 0.5;
      legL.rotation.x = Math.sin(t * sp) * amp;
      legR.rotation.x = Math.sin(t * sp + Math.PI) * amp;
      inner.position.y = baseY + Math.abs(Math.sin(t * sp)) * 0.04;     // little hop
      inner.rotation.z = Math.sin(t * sp) * 0.03;                       // gentle waddle rock
    } else {
      legL.rotation.x = 0; legR.rotation.x = 0;
      inner.position.y = baseY + Math.sin(t * 2) * 0.01;                // breathe
      inner.rotation.z = 0;
    }
  };

  return { head, legs: [], tail: null, ears: [], animate };
}
