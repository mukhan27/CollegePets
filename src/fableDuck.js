// Procedural "fable duck" — a soft, rounded, cartoony duckling built entirely in code.
// The whole head-into-egg-body form is ONE continuous LatheGeometry (a soft-union of a
// head sphere and a body ellipse), so the silhouette flows with no snowman seam. The
// green sweater is a raised-cosine band lathed over the same profile (edges tuck under
// the feathers, so no z-fighting). Bill, eyes, wings, tail and legs are rigid pieces on
// pivots — the gait swings the legs about the hips and never deforms a mesh.

import * as THREE from 'three';
import { toonGradient } from './textures.js';

const H = 2.0;                 // total height, feet on y=0, facing +z

// ---- master proportions (all other numbers derive from these) ----
const BODY_Y = 0.84, BODY_R = 0.62, BODY_VLO = 0.68, BODY_VHI = 0.64;
const HEAD_Y = 1.46, HEAD_R = 0.50;
const LEAN = 0.24;             // how far the head/neck shears forward
const RUMP = 0.10;             // how far the lower body swings back (duck posture)
const HIP_Y = 0.44, HIP_X = 0.17, HIP_Z = 0.04;
const SW_LO = 0.70, SW_HI = 1.24;   // sweater band (35%..62% of height)
const DEPTH = 1.12;            // egg is deeper than wide

const smooth = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
// S-curve shear: head/neck forward, rump back — reads as the reference's leaning duck.
// The forward term saturates BELOW the head (by y≈1.30) so the whole head translates
// rigidly and face features stay seated on its surface.
const leanAt = (y) => LEAN * smooth(0.55, 1.30, y) - RUMP * smooth(0.95, 0.15, y);

// body profile: soft union (p-norm) of the head sphere and the body ellipse
function bodyRadius(y) {
  const dv = y < BODY_Y ? BODY_VLO : BODY_VHI;
  const tb = (y - BODY_Y) / dv, th = (y - HEAD_Y) / HEAD_R;
  const rb = Math.abs(tb) < 1 ? BODY_R * Math.sqrt(1 - tb * tb) : 0;
  const rh = Math.abs(th) < 1 ? HEAD_R * Math.sqrt(1 - th * th) : 0;
  const P = 6;
  return Math.pow(Math.pow(rb, P) + Math.pow(rh, P), 1 / P);
}

function shearGeo(geo) {      // lean the neck/head forward — smooth, done once at build
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + leanAt(p.getY(i)));
  p.needsUpdate = true;
  return geo;
}

function latheBody() {
  const yBot = 0.16, yTop = HEAD_Y + HEAD_R;
  const pts = [];
  const N = 48;
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1);
    const y = yBot + (yTop - yBot) * (0.5 - 0.5 * Math.cos(Math.PI * u)); // dense at caps
    pts.push(new THREE.Vector2(Math.max(0.0001, bodyRadius(y)) * (i === 0 || i === N - 1 ? 0.001 : 1), y));
  }
  const geo = new THREE.LatheGeometry(pts, 48);
  geo.scale(1, 1, DEPTH);      // deeper than wide → egg
  return shearGeo(geo);
}

function latheSweater() {
  const pts = [];
  const N = 26;
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1);
    const y = SW_LO + (SW_HI - SW_LO) * u;
    // raised-cosine bump; edges dip slightly *inside* the body so they tuck under
    const bump = -0.012 + 0.062 * Math.pow(Math.sin(Math.PI * u), 0.65);
    pts.push(new THREE.Vector2(bodyRadius(y) + bump, y));
  }
  const geo = new THREE.LatheGeometry(pts, 48);
  geo.scale(1, 1, DEPTH);
  return shearGeo(geo);
}

// small flattened teardrop (unit sphere tapered toward -z) for the wing
function teardrop(wSeg = 24, hSeg = 16) {
  const geo = new THREE.SphereGeometry(1, wSeg, hSeg);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const b = (1 - p.getZ(i)) / 2;              // 0 at front (+z), 1 at back tip
    p.setX(i, p.getX(i) * (1 - 0.52 * b));
    p.setY(i, p.getY(i) * (1 - 0.42 * b));
  }
  geo.computeVertexNormals();
  return geo;
}

export function buildFableDuck(inner, a) {
  a = a || {};
  const cFeather = a.bodyColor ?? 0xffd23e;
  const cShirt = a.shirtColor ?? 0x5a9e44;
  const cBill = a.muzzleColor ?? 0xff9e2c;
  const cEye = a.eyeColor ?? 0x232020;

  // small emissive lift keeps the zones reading as flat, soft colour (matches the
  // pale reference look) instead of going muddy under the game's toon lighting
  const toon = (color) => {
    const m = new THREE.MeshToonMaterial({ color, gradientMap: toonGradient() });
    m.emissive = new THREE.Color(color);
    m.emissiveIntensity = 0.16;
    return m;
  };
  const mFeather = toon(cFeather), mShirt = toon(cShirt), mBill = toon(cBill), mEye = toon(cEye);
  const mGlint = new THREE.MeshBasicMaterial({ color: 0xffffff });

  const add = (geo, mat, parent) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    (parent || inner).add(m);
    return m;
  };
  const sph = new THREE.SphereGeometry(1, 24, 18);       // bill (large, needs smoothness)
  const sphSmall = new THREE.SphereGeometry(1, 16, 12);  // eyes/glints (tiny on screen)

  // ---- body + head: one continuous form ----
  const body = add(latheBody(), mFeather);
  body.receiveShadow = true;
  add(latheSweater(), mShirt);

  // ---- head group (empty pivot at the head centre; face pieces live here) ----
  const head = new THREE.Group();
  head.position.set(0, HEAD_Y, leanAt(HEAD_Y));
  inner.add(head);

  // bill: two stacked flattened rounded shapes — wide, flat, protruding forward
  const billTop = add(sph, mBill, head);
  billTop.scale.set(0.27, 0.075, 0.24);
  billTop.position.set(0, -0.09, 0.52);      // mid-face, root embedded in the head curve
  billTop.rotation.x = 0.11;
  const billBot = add(sph, mBill, head);
  billBot.scale.set(0.19, 0.05, 0.16);
  billBot.position.set(0, -0.145, 0.46);

  // eyes: tiny black dots on the front curve + a white glint each
  for (const s of [-1, 1]) {
    const eye = add(sphSmall, mEye, head);
    eye.scale.setScalar(0.052);
    eye.position.set(0.21 * s, 0.10, 0.50);   // proud of the (deeper) head surface
    const glint = add(sphSmall, mGlint, head);
    glint.scale.setScalar(0.015);
    glint.position.set(0.21 * s + 0.018 * s, 0.128, 0.535);
  }

  // ---- wings: flattened teardrops lying over the sweater on each side ----
  const wingGeo = teardrop();
  for (const s of [-1, 1]) {
    const wing = add(wingGeo, mFeather);
    wing.scale.set(0.13, 0.24, 0.40);
    wing.position.set(0.63 * s, 0.89, -0.10);
    wing.rotation.set(-0.25, -0.12 * s, 0.16 * s);
  }

  // ---- tail: a clear up-turned tuft at the rump ----
  const tail = add(teardrop(), mFeather);   // tip (-z) swings up-back: a perky tuft
  tail.scale.set(0.22, 0.19, 0.38);
  tail.position.set(0, 0.72, -0.64);
  tail.rotation.x = 0.95;

  // ---- legs: hip-pivot groups; thin orange leg + webbed fan foot ----
  const legGeo = new THREE.CylinderGeometry(0.040, 0.036, HIP_Y, 16, 1);
  const toeGeo = new THREE.SphereGeometry(1, 14, 10);
  const mkLeg = (s) => {
    const pivot = new THREE.Group();
    pivot.position.set(HIP_X * s, HIP_Y, HIP_Z);
    inner.add(pivot);
    const leg = add(legGeo, mBill, pivot);
    leg.position.set(0, -HIP_Y / 2 + 0.03, 0);
    const foot = new THREE.Group();
    foot.position.set(0, -HIP_Y + 0.042, 0.04);
    pivot.add(foot);
    for (const ang of [-0.42, 0, 0.42]) {       // three flattened toes fanning forward
      const toe = add(toeGeo, mBill, foot);
      toe.scale.set(0.075, 0.040, 0.185);
      toe.rotation.y = ang;
      toe.position.set(Math.sin(ang) * 0.10, 0, Math.cos(ang) * 0.11);
    }
    return pivot;
  };
  const legL = mkLeg(-1), legR = mkLeg(1);

  // ---- gait (same feel as glbDuck): distance-driven, rigid pieces only ----
  const baseY = inner.position.y;
  const amp = 0.5, legLen = Math.max(0.3, HIP_Y), GAIT = 0.34;
  let phase = 0, prevT = 0;
  const animate = (t, moving, dist) => {
    const dt = Math.min(0.05, Math.max(0, t - prevT)); prevT = t;
    if (moving) {
      phase += (dist == null) ? dt * 5 : (dist / (amp * legLen)) * GAIT;
      legL.rotation.x = Math.sin(phase) * amp;
      legR.rotation.x = Math.sin(phase + Math.PI) * amp;
      inner.position.y = baseY + Math.abs(Math.sin(phase)) * 0.05;   // bob each step
      inner.rotation.z = Math.sin(phase) * 0.05;                     // gentle waddle roll
      tail.rotation.z = Math.sin(phase * 2) * 0.18;                  // happy tail wiggle
    } else {
      legL.rotation.x += (0 - legL.rotation.x) * 0.25;
      legR.rotation.x += (0 - legR.rotation.x) * 0.25;
      inner.position.y = baseY + Math.sin(t * 2) * 0.012;            // gentle breathe
      inner.rotation.z += (0 - inner.rotation.z) * 0.2;
      tail.rotation.z += (0 - tail.rotation.z) * 0.2;
      head.position.y = HEAD_Y + Math.sin(t * 2 + 0.9) * 0.008;
    }
  };

  const mounts = {
    head: { pos: [0, HEAD_Y, leanAt(HEAD_Y)], radius: HEAD_R },
    torso: { pos: [0, (SW_LO + SW_HI) / 2, 0.02], radius: BODY_R + 0.05, height: SW_HI - SW_LO },
    back: { pos: [0, 1.04, leanAt(1.04) - (bodyRadius(1.04) * DEPTH + 0.02)] },
  };

  return { head, legs: [legL, legR], tail, ears: [], animate, mounts };
}
