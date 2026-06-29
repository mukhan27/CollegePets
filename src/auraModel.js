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
    // the iris is baked dark, so show it at nearly full brightness. Clothing (yellow
    // /orange) is perceptually sensitive to darkening — shaded areas read as muddy
    // amber/brown — so lift its shadows with a floor too. Fur/muzzle keep full shading.
    const f = z === Z_EYE ? 0.86 + 0.14 * f0
      : (z === Z_SHIRT || z === Z_PANTS) ? 0.74 + 0.26 * f0
      : f0;
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

// ---- skinned shirt --------------------------------------------------------
// The shirt is a CLEANLY GENERATED garment shell, not a cut from the body. We
// stack horizontal rings from hem to collar; each ring's radius is sampled from
// the body's own silhouette at that height, so the shell hugs the body shape but
// has tidy, regular topology (no sawtooth cut edge, no fur poke-through). Skin
// weights are transferred from the nearest body vertex, so it binds to the SAME
// skeleton and deforms with the rig. Derived once here; per pet we make a
// SkinnedMesh from this geometry bound to that instance's cloned skeleton.
const SHIRT = {
  Y_HEM_FRAC: 0.16, Y_NECK_FRAC: 0.47,   // torso band as fraction of body height
  TORSO_RINGS: 16, TORSO_SEG: 28,
  PAD_FRAC: 0.012,          // outward clearance over the fur (fraction of H)
  INFLATE_FRAC: 0.006,      // tiny extra normal lift
  RAD_SMOOTH: 2,            // circular passes to smooth per-ring radii (kill spikes)
  COLLAR_RINGS: 4, COLLAR_TAPER: 0.62,   // narrow the top rings into a collar
  SLEEVE_RINGS: 6, SLEEVE_SEG: 14,       // short cap sleeves over the upper arms
  SLEEVE_LEN_FRAC: 1.15,    // sleeve length as a multiple of the arm-cloud span
  SLEEVE_OUT: 1.0, SLEEVE_DOWN: 0.5,     // axis: how far the sleeve drapes out vs down
  SLEEVE_EASE: 1.25,        // sleeve radius vs arm radius (roomy, covers the fur)
  SLEEVE_PAD_FRAC: 0.010,   // outward clearance over the arm fur
  TRIM_DARKEN: 0.82,
  TORSO: new Set([0, 9, 10, 11, 12, 16]),   // Hips, Spine02/01/Spine, L/R Shoulder
  SLEEVE_BONES: [13, 17],                    // L/R Arm (upper arm) — for sleeves
  WEIGHT_BONES: new Set([0, 9, 10, 11, 12, 13, 16, 17]), // weight-transfer candidates
};

// Append a short cap sleeve (ring-tube around the upper arm) to the shell buffers.
function addSleeve(armBone, pos, dom, V, verts, tris, trimSet, H) {
  const ax = []; // arm vert positions
  let ox = 0, oy = 0, oz = 0;
  for (let i = 0; i < V; i++) {
    if (dom[i] !== armBone) continue;
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    ax.push(x, y, z); ox += x; oy += y; oz += z;
  }
  const cnt = ax.length / 3; if (cnt < 8) return;
  ox /= cnt; oy /= cnt; oz /= cnt;
  // The upper-arm (deltoid) cloud on this chibi rig is a compact stub — PCA on it
  // returns a near-vertical axis, useless for a sleeve. Derive the axis from
  // anatomy instead: the arm drapes OUT (away from the body midline) and slightly
  // DOWN. That points the sleeve along the real upper arm.
  const hl = Math.hypot(ox, oz) || 1;
  let dirx = (ox / hl) * SHIRT.SLEEVE_OUT, diry = -SHIRT.SLEEVE_DOWN, dirz = (oz / hl) * SHIRT.SLEEVE_OUT;
  const dl = Math.hypot(dirx, diry, dirz) || 1;
  const dir = [dirx / dl, diry / dl, dirz / dl];
  let tmin = Infinity, tmax = -Infinity;
  for (let k = 0; k < ax.length; k += 3) {
    const t = (ax[k] - ox) * dir[0] + (ax[k + 1] - oy) * dir[1] + (ax[k + 2] - oz) * dir[2];
    if (t < tmin) tmin = t; if (t > tmax) tmax = t;
  }
  const span = (tmax - tmin) || 0.1;
  const tStart = tmin - span * 0.12;                       // start a touch inside the armhole
  const len = span * SHIRT.SLEEVE_LEN_FRAC;
  // ring basis perpendicular to the axis
  let ux = -dir[1], uy = dir[0], uz = 0;
  if (Math.hypot(ux, uy, uz) < 1e-3) { ux = 0; uy = -dir[2]; uz = dir[1]; }
  const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
  const wx = dir[1] * uz - dir[2] * uy, wy = dir[2] * ux - dir[0] * uz, wz = dir[0] * uy - dir[1] * ux;
  const RINGS = SHIRT.SLEEVE_RINGS, SEG = SHIRT.SLEEVE_SEG, pad = SHIRT.SLEEVE_PAD_FRAC * H;
  const slab = span / (RINGS - 1) * 1.6;
  const rings = [];
  let lastR = 0.05 * H;
  for (let r = 0; r < RINGS; r++) {
    const t = tStart + len * (r / (RINGS - 1));
    const cx = ox + dir[0] * t, cy = oy + dir[1] * t, cz = oz + dir[2] * t;
    let rr = 0, rn = 0;
    for (let k = 0; k < ax.length; k += 3) {
      const tt = (ax[k] - ox) * dir[0] + (ax[k + 1] - oy) * dir[1] + (ax[k + 2] - oz) * dir[2];
      if (Math.abs(tt - t) > slab) continue;
      const px = ax[k] - cx, py = ax[k + 1] - cy, pz = ax[k + 2] - cz;
      const proj = px * dir[0] + py * dir[1] + pz * dir[2];
      const radial = Math.hypot(px - dir[0] * proj, py - dir[1] * proj, pz - dir[2] * proj);
      rr += radial; rn++;
    }
    rr = rn ? rr / rn : lastR; lastR = rr;
    rr = rr * SHIRT.SLEEVE_EASE + pad;                      // mean radius + ease
    const idxs = [];
    for (let s = 0; s < SEG; s++) {
      const ang = (s / SEG) * Math.PI * 2, ca = Math.cos(ang) * rr, sa = Math.sin(ang) * rr;
      idxs.push(verts.length / 3);
      verts.push(cx + ux * ca + wx * sa, cy + uy * ca + wy * sa, cz + uz * ca + wz * sa);
    }
    rings.push(idxs);
  }
  for (let r = 0; r < RINGS - 1; r++)
    for (let s = 0; s < SEG; s++) {
      const s2 = (s + 1) % SEG;
      const a = rings[r][s], b = rings[r][s2], c = rings[r + 1][s2], d = rings[r + 1][s];
      tris.push(a, c, b, a, d, c);
    }
  for (const i of rings[RINGS - 1]) trimSet.add(i);   // cuff = trim
}

function fillEmptyRadii(rad, has, SEG) {
  // circularly fill empty angular bins from the nearest filled neighbours
  let any = false; for (let s = 0; s < SEG; s++) if (has[s]) { any = true; break; }
  if (!any) { for (let s = 0; s < SEG; s++) rad[s] = 0.001; return; }
  for (let s = 0; s < SEG; s++) {
    if (has[s]) continue;
    let l = 1, r = 1;
    while (!has[(s - l + SEG) % SEG] && l < SEG) l++;
    while (!has[(s + r) % SEG] && r < SEG) r++;
    rad[s] = (rad[(s - l + SEG) % SEG] * r + rad[(s + r) % SEG] * l) / (l + r);
  }
}

function smoothRadii(rad, SEG, passes) {
  // circular blur of the radius profile — removes single-bin spikes (the shoulder
  // "flap") so the ring silhouette is round and smooth.
  for (let p = 0; p < passes; p++) {
    const out = new Float32Array(SEG);
    for (let s = 0; s < SEG; s++)
      out[s] = (rad[(s - 1 + SEG) % SEG] + 2 * rad[s] + rad[(s + 1) % SEG]) * 0.25;
    rad.set(out);
  }
}

function buildShirtGeometry(scene) {
  if (typeof document === 'undefined') return null;
  try {
    let char = null;
    scene.traverse((o) => { if (!char && o.isSkinnedMesh) char = o; });
    if (!char) return null;
    const geo = char.geometry;
    const pos = geo.attributes.position, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
    if (!pos || !si || !sw) return null;
    const V = pos.count;

    // body vertical extent (rest pose is upright: feet y0 → head top)
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < V; i++) { const y = pos.getY(i); if (y < minY) minY = y; if (y > maxY) maxY = y; }
    const H = maxY - minY || 1;
    const yHem = minY + SHIRT.Y_HEM_FRAC * H, yNeck = minY + SHIRT.Y_NECK_FRAC * H;

    // dominant bone per vertex
    const dom = new Int16Array(V);
    for (let i = 0; i < V; i++) {
      const w0 = sw.getX(i), w1 = sw.getY(i), w2 = sw.getZ(i), w3 = sw.getW(i);
      let bi = 0, bw = w0;
      if (w1 > bw) { bi = 1; bw = w1; } if (w2 > bw) { bi = 2; bw = w2; } if (w3 > bw) { bi = 3; bw = w3; }
      dom[i] = bw > 0 ? [si.getX(i), si.getY(i), si.getZ(i), si.getW(i)][bi] : -1;
    }
    // weight-transfer candidates: torso + arm verts only (so a shell vert never
    // grabs a leg/head weight from across a gap).
    const cand = [];
    for (let i = 0; i < V; i++) if (SHIRT.WEIGHT_BONES.has(dom[i])) cand.push(i);

    // ---- generate a clean torso shell: a stack of rings, each sized to the body's
    // own silhouette at that height. Clean ring topology (no cut sawtooth), but
    // hugs the body shape because every ring radius is sampled from the real mesh.
    const RINGS = SHIRT.TORSO_RINGS, SEG = SHIRT.TORSO_SEG, pad = SHIRT.PAD_FRAC * H;
    const slab = (yNeck - yHem) / (RINGS - 1) * 1.3;
    const verts = [], ringIdx = [];
    for (let r = 0; r < RINGS; r++) {
      const y = yHem + (yNeck - yHem) * (r / (RINGS - 1));
      let cx = 0, cz = 0, cnt = 0; const near = [];
      for (let i = 0; i < V; i++) {
        if (!SHIRT.TORSO.has(dom[i])) continue;
        const vy = pos.getY(i); if (Math.abs(vy - y) > slab) continue;
        const vx = pos.getX(i), vz = pos.getZ(i);
        near.push(vx); near.push(vz); cx += vx; cz += vz; cnt++;
      }
      cx /= cnt || 1; cz /= cnt || 1;
      const rad = new Float32Array(SEG), has = new Uint8Array(SEG);
      for (let k = 0; k < near.length; k += 2) {
        const dx = near[k] - cx, dz = near[k + 1] - cz;
        let bin = Math.round((Math.atan2(dz, dx) / (Math.PI * 2)) * SEG); bin = ((bin % SEG) + SEG) % SEG;
        const rr = Math.hypot(dx, dz); if (rr > rad[bin]) { rad[bin] = rr; has[bin] = 1; }
      }
      fillEmptyRadii(rad, has, SEG);
      smoothRadii(rad, SEG, SHIRT.RAD_SMOOTH);
      // collar taper: narrow the top COLLAR_RINGS toward the neck so the shirt
      // necks in cleanly instead of flaring out over the shoulders.
      let taper = 1;
      const fromTop = (RINGS - 1) - r;
      if (fromTop < SHIRT.COLLAR_RINGS)
        taper = SHIRT.COLLAR_TAPER + (1 - SHIRT.COLLAR_TAPER) * (fromTop / (SHIRT.COLLAR_RINGS - 1));
      const idxs = [];
      for (let s = 0; s < SEG; s++) {
        const ang = (s / SEG) * Math.PI * 2, rr = rad[s] * taper + pad;
        idxs.push(verts.length / 3);
        verts.push(cx + Math.cos(ang) * rr, y, cz + Math.sin(ang) * rr);
      }
      ringIdx.push(idxs);
    }

    // stitch adjacent rings into quads (outward winding)
    const tris = [];
    for (let r = 0; r < RINGS - 1; r++) {
      for (let s = 0; s < SEG; s++) {
        const s2 = (s + 1) % SEG;
        const a = ringIdx[r][s], b = ringIdx[r][s2], c = ringIdx[r + 1][s2], d = ringIdx[r + 1][s];
        tris.push(a, c, b, a, d, c);
      }
    }
    const trimV = new Set([...ringIdx[0], ...ringIdx[RINGS - 1]]);  // collar + hem rings

    // short cap sleeves over each upper arm
    for (const armBone of SHIRT.SLEEVE_BONES) addSleeve(armBone, pos, dom, V, verts, tris, trimV, H);

    const n = verts.length / 3;
    const P = new Float32Array(verts);
    const SI = new Uint16Array(n * 4), SW = new Float32Array(n * 4);
    for (let k = 0; k < n; k++) {                 // transfer skin weights (nearest body vert)
      const x = P[k * 3], y = P[k * 3 + 1], z = P[k * 3 + 2];
      let best = cand[0] || 0, bd = Infinity;
      for (let c = 0; c < cand.length; c++) {
        const i = cand[c];
        const dx = pos.getX(i) - x, dy = pos.getY(i) - y, dz = pos.getZ(i) - z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < bd) { bd = d2; best = i; }
      }
      SI[k * 4] = si.getX(best); SI[k * 4 + 1] = si.getY(best); SI[k * 4 + 2] = si.getZ(best); SI[k * 4 + 3] = si.getW(best);
      SW[k * 4] = sw.getX(best); SW[k * 4 + 1] = sw.getY(best); SW[k * 4 + 2] = sw.getZ(best); SW[k * 4 + 3] = sw.getW(best);
    }

    // split index into body (0) + trim (1) groups
    const body = [], trim = [];
    for (let t = 0; t < tris.length; t += 3)
      (trimV.has(tris[t]) || trimV.has(tris[t + 1]) || trimV.has(tris[t + 2]) ? trim : body).push(tris[t], tris[t + 1], tris[t + 2]);
    const order = body.concat(trim);

    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(P, 3));
    out.setAttribute('skinIndex', new THREE.BufferAttribute(SI, 4));
    out.setAttribute('skinWeight', new THREE.BufferAttribute(SW, 4));
    out.setIndex(order);
    out.computeVertexNormals();
    const inflate = SHIRT.INFLATE_FRAC * H, nrm = out.attributes.normal;
    for (let k = 0; k < n; k++) { P[k * 3] += nrm.getX(k) * inflate; P[k * 3 + 1] += nrm.getY(k) * inflate; P[k * 3 + 2] += nrm.getZ(k) * inflate; }
    out.attributes.position.needsUpdate = true;
    out.computeBoundingSphere();
    out.addGroup(0, body.length, 0);
    out.addGroup(body.length, trim.length, 1);
    console.log('[aura] shirt(shell) verts', n, 'tris', tris.length / 3, 'trim', trim.length / 3);
    return out;
  } catch (e) { console.warn('[aura] shirt geom error', e && e.message); return null; }
}

// Make a per-instance shirt SkinnedMesh from the cached geometry, bound to the
// given skeleton. Returns null if the geometry could not be derived.
export function buildShirtMesh(skeleton, bindMatrix, colorHex) {
  if (!cache || !cache.shirt) return null;
  // polygonOffset biases the shirt forward in the depth buffer so it always wins
  // over the fur it sits on — no z-fight speckle even where the inflate is thin.
  const body = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.92, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const trim = new THREE.MeshStandardMaterial({ color: new THREE.Color(colorHex).multiplyScalar(SHIRT.TRIM_DARKEN), roughness: 0.92, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const m = new THREE.SkinnedMesh(cache.shirt, [body, trim]);
  m.castShadow = true;
  m.frustumCulled = false;        // skinned bounds drift; never let it cull out
  m.bind(skeleton, bindMatrix);
  return m;
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
  const coat = coatTexture(a.bodyColor, a.muzzleColor ?? 0xe8dcc6, a.eyeColor ?? 0x6b4324,
    a.shirtColor ?? 0xf2c200, a.pantsColor ?? 0xf06c00);
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

  // expose the cloned skeleton so skinned clothing (shirt) can bind to it. Add the
  // shirt as a CHILD of the body mesh so it inherits char1's exact world transform
  // (a sibling would miss char1's own local transform and blow the skinning up).
  const bodyMesh = model.getObjectByName('char1');
  const skin = bodyMesh ? { skeleton: bodyMesh.skeleton, bindMatrix: bodyMesh.bindMatrix, root: bodyMesh } : null;

  return { head, legs: [], tail: null, ears, breathe: true, skin };
}
const ARM_OUT = 0.18;   // how far the relaxed arms splay from straight-down
