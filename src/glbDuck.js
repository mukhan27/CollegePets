// Loads the authored low-poly Duck.glb (a single static mesh — no skeleton), styles it
// to match the game (toon gradient over its texture), recolours the baked texture from
// the player's chosen colours, and RIGS it programmatically: a tiny skeleton (root + two
// leg bones) skins the leg/foot vertices so a basic walk can swing them, while the body
// stays rigidly on the root bone so the mesh itself is never distorted. If the asset is
// missing, isDuckReady() stays false and createPet falls back to the procedural duck.

import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import { toonGradient } from './textures.js';

const loader = new GLTFLoader();
const URL = 'assets/duckmodel.glb';
const TARGET_H = 1.55;
const MASK = 1024;     // working resolution for the recolour canvas

let cache = null;      // { geometry, hipY, legX, tex:{orig,zone,zMax,size} }
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

        // bake the node transform into the geometry, then normalize: scale to TARGET_H,
        // centre on x/z, drop feet to y=0 (keeps the bind pose + skin weights in one space).
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

        const hipY = bb.min.y + H * 0.34;
        const legX = (bb.max.x - bb.min.x) * 0.16;
        addSkinWeights(geo, hipY, legX);

        cache = { geometry: geo, hipY, legX, tex: buildTexPrep(firstMap(mesh.material)) };
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

// ---- texture recolour (the baked atlas is flat tag colours: yellow body, green shirt,
// orange bill/feet, black eyes). Classify each pixel by hue/value into a zone, then
// repaint each zone to the chosen colour while keeping its baked shading. ----
const Z_KEEP = 0, Z_BODY = 1, Z_SHIRT = 2, Z_BILL = 3, Z_EYE = 4, NZ = 5;

function classifyZone(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), c = mx - mn;
  if (mx < 60) return Z_EYE;            // black eyes
  if (c < 26) return Z_KEEP;            // greys / near-white
  let h;
  if (mx === r) h = ((g - b) / c) % 6; else if (mx === g) h = (b - r) / c + 2; else h = (r - g) / c + 4;
  h *= 60; if (h < 0) h += 360;
  if (h < 45) return Z_BILL;            // orange (~25)
  if (h < 80) return Z_BODY;            // yellow (~55)
  if (h < 185) return Z_SHIRT;          // green (~120)
  return Z_KEEP;
}

function buildTexPrep(map) {
  if (!map || !map.image || typeof document === 'undefined') return null;
  const s = MASK, N = s * s;
  const cv = document.createElement('canvas'); cv.width = s; cv.height = s;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(map.image, 0, 0, s, s);
  const orig = cx.getImageData(0, 0, s, s);
  const d = orig.data, zone = new Uint8Array(N), zMax = new Array(NZ).fill(1);
  for (let i = 0; i < N; i++) {
    const p = i * 4, z = classifyZone(d[p], d[p + 1], d[p + 2]);
    zone[i] = z; const mx = Math.max(d[p], d[p + 1], d[p + 2]);
    if (z && mx > zMax[z]) zMax[z] = mx;
  }
  return { orig, zone, zMax, size: s, flipY: map.flipY };
}

const texCache = new Map();
function recolour(bodyHex, shirtHex, billHex, eyeHex) {
  const prep = cache.tex;
  if (!prep) return null;
  const key = [bodyHex, shirtHex, billHex, eyeHex].join('|');
  if (texCache.has(key)) return texCache.get(key);
  const s = prep.size, d = prep.orig.data, zone = prep.zone, zMax = prep.zMax;
  const out = new Uint8ClampedArray(d);
  const hexRGB = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];   // raw sRGB (THREE.Color is linear)
  const cols = []; cols[Z_BODY] = hexRGB(bodyHex); cols[Z_SHIRT] = hexRGB(shirtHex);
  cols[Z_BILL] = hexRGB(billHex); cols[Z_EYE] = hexRGB(eyeHex);
  for (let i = 0; i < zone.length; i++) {
    const z = zone[i]; if (z === Z_KEEP) continue;
    const p = i * 4, f0 = Math.min(1, Math.max(d[p], d[p + 1], d[p + 2]) / zMax[z]);
    const f = z === Z_EYE ? 0.55 + 0.45 * f0 : f0;     // lift the dark eyes so a chosen colour shows
    const c = cols[z];
    out[p] = c[0] * f; out[p + 1] = c[1] * f; out[p + 2] = c[2] * f;
  }
  const cv = document.createElement('canvas'); cv.width = s; cv.height = s;
  cv.getContext('2d').putImageData(new ImageData(out, s, s), 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.flipY = prep.flipY; tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false;
  tex.needsUpdate = true;
  if (texCache.size > 12) { const [k, old] = texCache.entries().next().value; old.dispose(); texCache.delete(k); }
  texCache.set(key, tex);
  return tex;
}

// ---- skin weights: body/head on the root bone; leg columns + feet on a leg bone with a
// smooth hip ramp + a horizontal gate so the wide belly is NOT pulled into the swing. ----
function addSkinWeights(geo, hipY, legX) {
  const pos = geo.attributes.position, n = pos.count;
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  const clamp = (v) => Math.max(0, Math.min(1, v));
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    let idx1 = 0, legW = 0;
    if (y < hipY) {
      const hipXs = x < 0 ? -legX : legX;
      const ySwing = clamp((hipY - y) / 0.16);
      const foot = y < hipY - 0.26;
      const dx = Math.abs(x - hipXs);
      const xGate = foot ? 1 : clamp(1 - (dx - 0.10) / 0.16);
      legW = ySwing * xGate; idx1 = x < 0 ? 1 : 2;
    }
    const p = i * 4;
    if (legW < 0.03) { si[p] = 0; sw[p] = 1; }
    else { si[p] = 0; si[p + 1] = idx1; sw[p] = 1 - legW; sw[p + 1] = legW; }
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
}

export function buildGlbDuck(inner, a) {
  const { geometry, hipY, legX } = cache;
  const tex = recolour(a.bodyColor ?? 0xffd23e, a.shirtColor ?? 0x5a9e44, a.muzzleColor ?? 0xff9e2c, a.eyeColor ?? 0x232020);
  const mat = new THREE.MeshToonMaterial({ map: tex, gradientMap: toonGradient() });

  const root = new THREE.Bone();
  const legL = new THREE.Bone(); legL.position.set(-legX, hipY, 0); root.add(legL);
  const legR = new THREE.Bone(); legR.position.set(legX, hipY, 0); root.add(legR);

  const body = new THREE.SkinnedMesh(geometry, mat);
  body.castShadow = true; body.receiveShadow = true; body.frustumCulled = false;
  body.add(root);
  body.updateMatrixWorld(true);
  body.bind(new THREE.Skeleton([root, legL, legR]));
  inner.add(body);

  const head = new THREE.Group(); head.position.set(0, TARGET_H * 0.82, 0); inner.add(head);

  const baseY = inner.position.y;
  const animate = (t, moving) => {
    if (moving) {
      const sp = 7, amp = 0.5;
      legL.rotation.x = Math.sin(t * sp) * amp;
      legR.rotation.x = Math.sin(t * sp + Math.PI) * amp;
      inner.position.y = baseY + Math.abs(Math.sin(t * sp)) * 0.04;
      inner.rotation.z = Math.sin(t * sp) * 0.03;
    } else {
      legL.rotation.x = 0; legR.rotation.x = 0;
      inner.position.y = baseY + Math.sin(t * 2) * 0.01;
      inner.rotation.z = 0;
    }
  };

  return { head, legs: [], tail: null, ears: [], animate };
}
