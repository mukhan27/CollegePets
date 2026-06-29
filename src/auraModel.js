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
      shirt: buildShirtGeometry(scene),
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
    let z;
    // Keep the truly neutral pixels baked: near-white catchlights, near-black
    // pupils/nose, and low-chroma greys. Everything else is a zone classified by
    // its dominant channel — including the DARK navy iris (chroma ~25), which must
    // recolour, so the cut is low (14) but guarded by the black/white tests.
    if (mn > 200 || mx < 38 || mx - mn < 14) z = Z_KEEP;
    else if (r === mx) z = Z_FUR;        // red   → body
    else if (g === mx) z = Z_MUZZLE;     // green → muzzle
    else z = Z_EYE;                      // blue  → eye iris
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
    const f0 = Math.min(1, Math.max(d[p], d[p + 1], d[p + 2]) / zMax[z]);  // baked value
    // the iris is baked dark, so show it at nearly full brightness (slight gradient
    // only) — otherwise a dark baked iris swallows the chosen colour. Body/muzzle
    // keep their full baked shading.
    const f = z === Z_EYE ? 0.86 + 0.14 * f0 : f0;
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
  TRIM_DARKEN: 0.82,
  TORSO: new Set([0, 9, 10, 11, 12, 16]),   // Hips, Spine02/01/Spine, L/R Shoulder
  SLEEVE_BONES: [13, 17],                    // L/R Arm (upper arm) — for sleeves
  WEIGHT_BONES: new Set([0, 9, 10, 11, 12, 13, 16, 17]), // weight-transfer candidates
};

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
  const coat = coatTexture(a.bodyColor, a.muzzleColor ?? 0xe8dcc6, a.eyeColor ?? 0x6b4324);
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
