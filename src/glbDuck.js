// Loads the authored low-poly Duck.glb (a single static mesh — no skeleton) and styles it
// to match the game. The model already ships with clean colour zones baked into its texture
// — orange bill, black eyes, yellow feathers, green shirt — so all we do is RE-PAINT those
// four colours to the player's chosen colours, pixel-for-pixel, at the texture's native
// resolution. This follows the model's own boundaries exactly (no invented geometry), so
// the wings stay yellow, the shirt seam stays crisp, and recolouring is instant. The mesh is
// left rigid (no skinning) and "walks" with a non-deforming waddle (bob + roll). If the asset
// is missing, isDuckReady() stays false and createPet falls back to the procedural duck.

import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import { toonGradient } from './textures.js';

const loader = new GLTFLoader();
const URL = 'assets/duckmodel.glb';
const TARGET_H = 1.55;

let cache = null;      // { geometry, tex:{ mask, W, H, flipY } }
let ready = false;
let loadingPromise = null;

export function isDuckReady() { return ready; }

// ---- the four baked zones, each mapped to one customizable colour ----
const Z_FEATHER = 0, Z_SHIRT = 1, Z_BILL = 2, Z_EYE = 3;

// Classify one texture pixel into a zone by the baked tag colour (yellow feathers, green
// shirt, orange bill/feet, near-black eyes). Low-saturation pixels fall back to feathers.
function classifyPixel(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), c = mx - mn;
  if (mx < 70) return Z_EYE;                 // black eyes
  if (c < 24) return Z_FEATHER;              // greys / near-white → body
  let h;
  if (mx === r) h = ((g - b) / c) % 6; else if (mx === g) h = (b - r) / c + 2; else h = (r - g) / c + 4;
  h *= 60; if (h < 0) h += 360;
  if (h < 40) return Z_BILL;                 // orange (~25)
  if (h < 90) return Z_FEATHER;              // yellow (~46)
  if (h < 200) return Z_SHIRT;               // green (~120)
  return Z_FEATHER;                          // reddish wrap-around → body
}

export function preloadDuck() {
  if (loadingPromise) return loadingPromise;
  loadingPromise = new Promise((resolve) => {
    loader.load(URL, (g) => {
      try {
        let mesh = null;
        g.scene.traverse((o) => { if (!mesh && o.isMesh) mesh = o; });
        if (!mesh) { ready = false; return resolve(false); }

        // bake the node transform into the geometry, then normalize: scale to TARGET_H,
        // centre on x/z, drop feet to y=0. UVs are untouched so the texture still lines up.
        const geo = mesh.geometry.clone();
        mesh.updateWorldMatrix(true, false);
        geo.applyMatrix4(mesh.matrixWorld);
        geo.deleteAttribute('skinIndex');
        geo.deleteAttribute('skinWeight');
        geo.computeBoundingBox();
        let bb = geo.boundingBox;
        const s = TARGET_H / ((bb.max.y - bb.min.y) || 1);
        geo.scale(s, s, s);
        geo.computeBoundingBox(); bb = geo.boundingBox;
        const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
        geo.translate(-cx, -bb.min.y, -cz);

        cache = { geometry: geo, tex: buildMask(firstMap(mesh.material)) };
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

// Classify the baked atlas once into a per-pixel zone mask. We downscale to a mobile-safe
// size with NEAREST sampling (imageSmoothingEnabled = false): the source 4096² atlas would
// blow iOS Safari's per-tab memory once recoloured and uploaded as a texture, while this
// model's flat zones are large, so 1024² is visually identical. Nearest sampling keeps the
// hard zone edges crisp (bilinear downscale is what blurred them into a grainy fringe before).
const MASK = 1024;
function buildMask(map) {
  if (!map || !map.image || typeof document === 'undefined') return null;
  const img = map.image;
  const NW = img.width || img.naturalWidth, NH = img.height || img.naturalHeight;
  if (!NW || !NH) return null;
  const W = Math.min(MASK, NW), H = Math.min(MASK, NH);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, W, H);
  const d = ctx.getImageData(0, 0, W, H).data;
  const mask = new Uint8Array(W * H);
  for (let i = 0, p = 0; i < mask.length; i++, p += 4) mask[i] = classifyPixel(d[p], d[p + 1], d[p + 2]);
  return { mask, W, H, flipY: map.flipY };
}

// Re-paint the four zones to the chosen colours and return a fresh sRGB texture. Output is a
// flat colour per zone (the toon material adds the shading), so the result is crisp.
const texCache = new Map();
function recolour(featherHex, shirtHex, billHex, eyeHex) {
  const prep = cache.tex;
  if (!prep) return null;
  const key = [featherHex, shirtHex, billHex, eyeHex].join('|');
  if (texCache.has(key)) return texCache.get(key);
  const { mask, W, H } = prep;
  const hexRGB = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];   // raw sRGB (THREE.Color is linear)
  const cols = [hexRGB(featherHex), hexRGB(shirtHex), hexRGB(billHex), hexRGB(eyeHex)];
  const out = new Uint8ClampedArray(W * H * 4);
  for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
    const c = cols[mask[i]];
    out[p] = c[0]; out[p + 1] = c[1]; out[p + 2] = c[2]; out[p + 3] = 255;
  }
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  cv.getContext('2d').putImageData(new ImageData(out, W, H), 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.flipY = prep.flipY; tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false;
  tex.needsUpdate = true;
  if (texCache.size > 6) { const [k, old] = texCache.entries().next().value; old.dispose(); texCache.delete(k); }
  texCache.set(key, tex);
  return tex;
}

export function buildGlbDuck(inner, a) {
  const tex = recolour(a.bodyColor ?? 0xffd23e, a.shirtColor ?? 0x5a9e44, a.muzzleColor ?? 0xff9e2c, a.eyeColor ?? 0x232020);
  const mat = new THREE.MeshToonMaterial({ map: tex, gradientMap: toonGradient() });
  const body = new THREE.Mesh(cache.geometry, mat);
  body.castShadow = true; body.receiveShadow = true; body.frustumCulled = false;
  inner.add(body);

  const head = new THREE.Group(); head.position.set(0, TARGET_H * 0.82, 0); inner.add(head);

  const baseY = inner.position.y;
  // A non-deforming waddle: the whole duck bobs and rocks side to side — never distorts the mesh.
  const animate = (t, moving) => {
    if (moving) {
      const sp = 7;
      inner.position.y = baseY + Math.abs(Math.sin(t * sp)) * 0.05;
      inner.rotation.z = Math.sin(t * sp) * 0.10;
    } else {
      inner.position.y = baseY + Math.sin(t * 2) * 0.012;
      inner.rotation.z = 0;
    }
  };

  return { head, legs: [], tail: null, ears: [], animate };
}
