// Pet builder v2 — Animal Crossing proportions: big round heads, stubby
// toon-shaded bodies, big eyes with highlights, blush, soft outlines.
// Public API unchanged from v1: createPet(type, {equipped}) returns a Group
// with userData { head, animate(t, moving) }; setWearables re-dresses a pet.

import * as THREE from 'three';
import { PALETTE as P } from './palette.js';
import { toonMat } from './textures.js';

function ball(r, color, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), toonMat(color));
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  return m;
}
function capsule(r, len, color) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 12), toonMat(color));
  m.castShadow = true;
  return m;
}
function box(w, h, d, color) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toonMat(color));
  m.castShadow = true;
  return m;
}

// soft dark outline via inverted hull (cheap, mobile-friendly)
const outlineMat = new THREE.MeshBasicMaterial({ color: 0x4a3a30, side: THREE.BackSide });
function addOutline(target, scale = 1.05) {
  const o = new THREE.Mesh(target.geometry, outlineMat);
  o.scale.copy(target.scale).multiplyScalar(scale);
  o.position.copy(target.position);
  o.rotation.copy(target.rotation);
  target.parent.add(o);
}

// big AC eyes + blush, shared by all species. eyeColor/eyeStyle/blush let the
// custom creature vary them; animals call with defaults → unchanged look.
function addFace(head, { eyeSpread = 0.19, eyeY = 0.1, eyeZ = 0.45, blushY = -0.1, blushSpread = 0.34,
  eyeColor = 0x2a2420, eyeStyle = 'round', blush = true } = {}) {
  const eyeR = eyeStyle === 'sparkly' ? 0.095 : 0.085;
  const eyeSy = eyeStyle === 'sleepy' ? 0.72 : 1.35;   // sleepy = half-lidded oval
  const ey = eyeStyle === 'sleepy' ? eyeY + 0.04 : eyeY;
  for (const s of [-1, 1]) {
    const eye = ball(eyeR, eyeColor, 1, eyeSy, 0.55);
    eye.position.set(s * eyeSpread, ey, eyeZ);
    head.add(eye);
    const shine = ball(0.028, 0xffffff, 1, 1, 0.6);
    shine.position.set(s * eyeSpread + 0.03, ey + 0.05, eyeZ + 0.05);
    head.add(shine);
    if (eyeStyle === 'sparkly') {
      const shine2 = ball(0.018, 0xffffff, 1, 1, 0.6);
      shine2.position.set(s * eyeSpread - 0.03, ey - 0.04, eyeZ + 0.05);
      head.add(shine2);
    }
    if (blush) {
      const b = ball(0.07, P.blush, 1, 0.6, 0.3);
      b.position.set(s * blushSpread, blushY, eyeZ - 0.06);
      head.add(b);
    }
  }
}

function stubbyLegs(inner, coat, { y = 0.16, spreadX = 0.2, spreadZ = 0.16, r = 0.11 } = {}) {
  const legs = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = capsule(r, 0.16, coat);
    leg.position.set(sx * spreadX, y, sz * spreadZ);
    inner.add(leg);
    legs.push(leg);
  }
  return legs;
}

// Each builder fills `inner` (the bobbing container) facing +Z.
const BUILDERS = {
  cat(inner) {
    const body = ball(0.42, P.catCoat, 1, 0.95, 1.1);
    body.position.y = 0.52;
    inner.add(body);
    addOutline(body);
    const belly = ball(0.3, P.catBelly, 0.9, 0.85, 0.55);
    belly.position.set(0, 0.45, 0.22);
    inner.add(belly);

    const head = new THREE.Group();
    head.position.set(0, 1.18, 0.12);
    const skull = ball(0.52, P.catCoat, 1, 0.92, 0.95);
    head.add(skull);
    addOutlineLater(head, skull);
    const muzzle = ball(0.16, P.catBelly, 1.3, 0.8, 0.6);
    muzzle.position.set(0, -0.14, 0.42);
    head.add(muzzle);
    const nose = ball(0.05, 0xd96a6a, 1.2, 0.8, 0.7);
    nose.position.set(0, -0.05, 0.5);
    head.add(nose);
    addFace(head);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.32, 4), toonMat(P.catCoat));
      ear.castShadow = true;
      ear.position.set(s * 0.27, 0.55, -0.02);
      ear.rotation.z = s * -0.3;
      head.add(ear);
      const earIn = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.18, 4), toonMat(0xe8a0a0));
      earIn.position.set(s * 0.26, 0.55, 0.04);
      earIn.rotation.z = s * -0.3;
      head.add(earIn);
    }
    inner.add(head);

    const tail = capsule(0.07, 0.45, P.catCoat);
    tail.position.set(0, 0.72, -0.5);
    tail.rotation.x = -0.9;
    inner.add(tail);

    const legs = stubbyLegs(inner, P.catCoat);
    return { head, legs, tail, ears: [] };
  },

  dog(inner) {
    const body = ball(0.46, P.dogCoat, 1, 0.95, 1.12);
    body.position.y = 0.54;
    inner.add(body);
    addOutline(body);
    const belly = ball(0.32, P.dogBelly, 0.9, 0.85, 0.55);
    belly.position.set(0, 0.46, 0.24);
    inner.add(belly);

    const head = new THREE.Group();
    head.position.set(0, 1.22, 0.12);
    const skull = ball(0.54, P.dogCoat, 1, 0.94, 0.95);
    head.add(skull);
    addOutlineLater(head, skull);
    const snout = ball(0.2, P.dogBelly, 1.2, 0.85, 0.9);
    snout.position.set(0, -0.16, 0.42);
    head.add(snout);
    const nose = ball(0.07, 0x33261a, 1.1, 0.9, 0.8);
    nose.position.set(0, -0.08, 0.58);
    head.add(nose);
    addFace(head, { eyeY: 0.12 });
    const ears = [];
    for (const s of [-1, 1]) { // floppy ears
      const ear = ball(0.16, P.dogEar, 0.7, 1.5, 0.45);
      ear.position.set(s * 0.46, 0.16, 0);
      ear.rotation.z = s * 0.55;
      head.add(ear);
      ears.push(ear);
    }
    inner.add(head);

    const tail = capsule(0.07, 0.4, P.dogEar);
    tail.position.set(0, 0.74, -0.52);
    tail.rotation.x = -1.1;
    inner.add(tail);

    const legs = stubbyLegs(inner, P.dogEar, { spreadX: 0.22, spreadZ: 0.18 });
    return { head, legs, tail, ears };
  },

  bear(inner) {
    inner.scale.setScalar(1.12);
    const body = ball(0.5, P.bearCoat, 1.05, 1, 1.12);
    body.position.y = 0.56;
    inner.add(body);
    addOutline(body);
    const belly = ball(0.34, P.bearMuzzle, 0.95, 0.9, 0.55);
    belly.position.set(0, 0.48, 0.26);
    inner.add(belly);

    const head = new THREE.Group();
    head.position.set(0, 1.3, 0.1);
    const skull = ball(0.56, P.bearCoat, 1, 0.94, 0.95);
    head.add(skull);
    addOutlineLater(head, skull);
    const muzzle = ball(0.22, P.bearMuzzle, 1.1, 0.85, 0.8);
    muzzle.position.set(0, -0.18, 0.42);
    head.add(muzzle);
    const nose = ball(0.08, 0x2e2018, 1.2, 0.8, 0.8);
    nose.position.set(0, -0.1, 0.6);
    head.add(nose);
    addFace(head, { eyeSpread: 0.21, eyeY: 0.12 });
    for (const s of [-1, 1]) { // round ears
      const ear = ball(0.16, P.bearCoat);
      ear.position.set(s * 0.36, 0.46, -0.05);
      head.add(ear);
      const earIn = ball(0.08, P.bearMuzzle, 1, 1, 0.5);
      earIn.position.set(s * 0.35, 0.45, 0.05);
      head.add(earIn);
    }
    inner.add(head);

    const legs = stubbyLegs(inner, 0x7d5a38, { spreadX: 0.26, spreadZ: 0.2, r: 0.13 });
    return { head, legs, tail: null, ears: [] };
  },

  duck(inner) {
    const body = ball(0.46, P.duckCoat, 0.95, 0.9, 1.15);
    body.position.y = 0.55;
    inner.add(body);
    addOutline(body);

    const head = new THREE.Group();
    head.position.set(0, 1.22, 0.16);
    const skull = ball(0.5, P.duckCoat, 1, 0.95, 0.92);
    head.add(skull);
    addOutlineLater(head, skull);
    const beakTop = ball(0.14, P.duckBeak, 1.7, 0.5, 1.3);
    beakTop.position.set(0, -0.1, 0.46);
    head.add(beakTop);
    const tuft = ball(0.1, P.duckCoat, 1, 1.2, 1);
    tuft.position.set(0, 0.48, 0.05);
    head.add(tuft);
    addFace(head, { eyeY: 0.12, blushY: -0.06 });
    inner.add(head);

    const wings = [];
    for (const s of [-1, 1]) {
      const wing = ball(0.2, 0xeae2cc, 0.5, 0.85, 1.15);
      wing.position.set(s * 0.42, 0.6, -0.05);
      wing.rotation.z = s * -0.2;
      inner.add(wing);
      wings.push(wing);
    }
    const tail = ball(0.16, 0xeae2cc, 1, 0.7, 1.1);
    tail.position.set(0, 0.62, -0.5);
    tail.rotation.x = 0.6;
    inner.add(tail);

    const legs = [];
    for (const s of [-1, 1]) {
      const leg = capsule(0.07, 0.14, P.duckBeak);
      leg.position.set(s * 0.16, 0.14, 0);
      inner.add(leg);
      legs.push(leg);
      const foot = ball(0.1, P.duckBeak, 1.4, 0.35, 1.8);
      foot.position.set(s * 0.16, 0.04, 0.08);
      inner.add(foot);
    }
    return { head, legs, tail, ears: wings };
  },

  hamster(inner) {
    inner.scale.setScalar(0.85);
    const body = ball(0.48, P.hamCoat, 1, 0.9, 1.05);
    body.position.y = 0.5;
    inner.add(body);
    addOutline(body);
    const belly = ball(0.32, P.hamBelly, 0.95, 0.85, 0.55);
    belly.position.set(0, 0.42, 0.24);
    inner.add(belly);

    const head = new THREE.Group();
    head.position.set(0, 1.12, 0.12);
    const skull = ball(0.52, P.hamCoat, 1.05, 0.92, 0.95);
    head.add(skull);
    addOutlineLater(head, skull);
    for (const s of [-1, 1]) { // chubby cheeks (set wide & high, hugging the face) + little ears
      const cheek = ball(0.18, P.hamBelly, 1.15, 1.0, 0.42);
      cheek.position.set(s * 0.36, 0.0, 0.26);
      head.add(cheek);
      const ear = ball(0.13, P.hamEar);
      ear.position.set(s * 0.3, 0.5, -0.05);
      head.add(ear);
      const earIn = ball(0.07, 0xe8a0a0, 1, 1, 0.5);
      earIn.position.set(s * 0.29, 0.5, 0.05);
      head.add(earIn);
    }
    const nose = ball(0.06, 0xcc7788, 1.3, 0.85, 0.7);
    nose.position.set(0, 0.04, 0.48);
    head.add(nose);
    addFace(head, { blushSpread: 0.4, blushY: -0.16 });
    inner.add(head);

    const legs = stubbyLegs(inner, P.hamEar, { y: 0.12, spreadX: 0.18, spreadZ: 0.14, r: 0.09 });
    return { head, legs, tail: null, ears: [] };
  },
};

// ===================================================================== creature
// "Birchling" — the player's original, modular, fully-customizable species. Built
// from the same primitives as the animals and returns the same {head, legs, tail,
// ears} shape so createPet's animation loop is reused. Head radius stays 0.52 so
// all existing wearables fit.

// curated toon swatch palettes for the creator (cohesive, not free RGB)
export const COAT_SWATCHES = [0xf2a25c, 0xef8fa6, 0x8fb0e8, 0x9fd6a0, 0xc6a6e8, 0xf2d06b, 0xece6da, 0x7fd0c8, 0xd9886a, 0x9a8fb0];
export const BELLY_SWATCHES = [0xfae3c8, 0xfff1e0, 0xffe0e6, 0xe6f2e0, 0xf0e8fa, 0xfff6d8, 0xf4f4f0, 0xdcf2ee];
export const ACCENT_SWATCHES = [0xe88fa6, 0xf2a93b, 0x6bbf8a, 0x5f9bd0, 0xb07fd0, 0xe0556b, 0x5a4636, 0xf2c14e];
export const EYE_SWATCHES = [0x2a2420, 0x4a6e8a, 0x3f7d52, 0x7d4a8a, 0x8a5a2a, 0x2a6e6e];

export const CREATURE_OPTIONS = {
  build: ['slim', 'round', 'chonky'],
  size: ['small', 'medium', 'tall'],
  pattern: ['none', 'spots', 'stripes', 'belly_patch', 'freckles'],
  ears: ['cat', 'bunny', 'bear', 'fin', 'floppy', 'none'],
  tail: ['puff', 'long', 'bunny', 'leaf', 'none'],
  horns: ['none', 'nubs', 'antennae', 'unicorn'],
  eyeStyle: ['round', 'sparkly', 'sleepy'],
  snout: ['button', 'muzzle', 'beak'],
};

export function defaultCreature() {
  return {
    build: 'round', size: 'medium',
    bodyColor: 0x8fb0e8, bellyColor: 0xfff1e0, accentColor: 0xe88fa6,
    pattern: 'none', patternColor: 0xffffff,
    ears: 'cat', tail: 'puff', horns: 'none',
    eyeColor: 0x2a2420, eyeStyle: 'round', snout: 'button', blush: true,
  };
}

export function randomCreature() {
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  return {
    build: pick(CREATURE_OPTIONS.build), size: pick(CREATURE_OPTIONS.size),
    bodyColor: pick(COAT_SWATCHES), bellyColor: pick(BELLY_SWATCHES), accentColor: pick(ACCENT_SWATCHES),
    pattern: pick(CREATURE_OPTIONS.pattern), patternColor: pick(COAT_SWATCHES),
    ears: pick(CREATURE_OPTIONS.ears), tail: pick(CREATURE_OPTIONS.tail), horns: pick(CREATURE_OPTIONS.horns),
    eyeColor: pick(EYE_SWATCHES), eyeStyle: pick(CREATURE_OPTIONS.eyeStyle), snout: pick(CREATURE_OPTIONS.snout),
    blush: Math.random() < 0.72,
  };
}

function creatureEars(head, a, ears) {
  if (a.ears === 'none') return;
  const coat = a.bodyColor, acc = a.accentColor;
  for (const s of [-1, 1]) {
    if (a.ears === 'cat' || a.ears === 'fin') {
      const fin = a.ears === 'fin';
      const ear = new THREE.Mesh(new THREE.ConeGeometry(fin ? 0.2 : 0.17, fin ? 0.26 : 0.32, 4), toonMat(coat));
      ear.castShadow = true;
      ear.position.set(s * 0.27, 0.52, fin ? -0.05 : -0.02);
      ear.rotation.z = s * (fin ? -0.85 : -0.3);
      if (fin) ear.scale.set(1, 1, 0.5);
      head.add(ear);
      const earIn = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.18, 4), toonMat(acc));
      earIn.position.set(s * 0.26, 0.52, fin ? 0.0 : 0.04);
      earIn.rotation.z = ear.rotation.z;
      if (fin) earIn.scale.set(1, 1, 0.5);
      head.add(earIn);
    } else if (a.ears === 'bunny') {
      const ear = ball(0.12, coat, 0.7, 1.8, 0.6);
      ear.position.set(s * 0.22, 0.72, -0.02); ear.rotation.z = s * 0.12; head.add(ear);
      const earIn = ball(0.07, acc, 0.6, 1.5, 0.5);
      earIn.position.set(s * 0.22, 0.74, 0.04); earIn.rotation.z = s * 0.12; head.add(earIn);
    } else if (a.ears === 'bear') {
      const ear = ball(0.16, coat);
      ear.position.set(s * 0.36, 0.46, -0.05); head.add(ear);
      const earIn = ball(0.08, acc, 1, 1, 0.5);
      earIn.position.set(s * 0.35, 0.45, 0.05); head.add(earIn);
    } else if (a.ears === 'floppy') {
      const ear = ball(0.16, acc, 0.7, 1.5, 0.45);
      ear.position.set(s * 0.46, 0.16, 0); ear.rotation.z = s * 0.55;
      head.add(ear); ears.push(ear);
    }
  }
}

function creatureHorns(head, a) {
  if (a.horns === 'none') return;
  const c = a.accentColor;
  if (a.horns === 'unicorn') {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.34, 8), toonMat(c));
    horn.castShadow = true; horn.position.set(0, 0.5, 0.2); horn.rotation.x = -0.3; head.add(horn);
    return;
  }
  for (const s of [-1, 1]) {
    if (a.horns === 'nubs') {
      const nub = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 8), toonMat(c));
      nub.position.set(s * 0.2, 0.52, 0.0); head.add(nub);
    } else if (a.horns === 'antennae') {
      const stalk = capsule(0.025, 0.2, c);
      stalk.position.set(s * 0.16, 0.6, -0.02); stalk.rotation.z = s * 0.25; head.add(stalk);
      const tip = ball(0.07, c);
      tip.position.set(s * 0.24, 0.78, -0.02); head.add(tip);
    }
  }
}

function creatureTail(inner, a) {
  if (a.tail === 'none') return null;
  if (a.tail === 'long') {
    const tail = capsule(0.07, 0.45, a.bodyColor);
    tail.position.set(0, 0.72, -0.5); tail.rotation.x = -0.9; inner.add(tail); return tail;
  }
  if (a.tail === 'leaf') {
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.4, 6), toonMat(a.accentColor));
    tail.castShadow = true; tail.scale.set(1, 1, 0.4);
    tail.position.set(0, 0.66, -0.5); tail.rotation.x = -0.6; inner.add(tail); return tail;
  }
  const r = a.tail === 'bunny' ? 0.12 : 0.16;
  const tail = ball(r, a.tail === 'bunny' ? a.bellyColor : a.bodyColor);
  tail.position.set(0, 0.5, -0.5); inner.add(tail); return tail;
}

function creaturePattern(inner, head, a, bw) {
  const c = a.patternColor;
  if (a.pattern === 'spots') {
    for (const [x, y, z] of [[0.22, 0.62, 0.32], [-0.26, 0.58, 0.2], [0.0, 0.7, 0.32], [0.28, 0.5, -0.1], [-0.2, 0.48, -0.16], [0.12, 0.66, -0.26]]) {
      const sp = ball(0.09, c, 1, 1, 0.4);
      sp.position.set(x * bw, y, z * bw); inner.add(sp);
    }
  } else if (a.pattern === 'stripes') {
    for (const z of [0.12, -0.03, -0.18]) {
      const st = box(0.52 * bw, 0.05, 0.15, c);
      st.position.set(0, 0.72, z); inner.add(st);
    }
  } else if (a.pattern === 'freckles') {
    for (const s of [-1, 1]) for (const [dx, dy] of [[0, 0], [0.07, 0.02], [-0.05, -0.03]]) {
      const fr = ball(0.022, c, 1, 1, 0.5);
      fr.position.set(s * (0.28 + dx), -0.04 + dy, 0.46); head.add(fr);
    }
  }
}

function buildCreature(inner, a) {
  const sizeScale = a.size === 'small' ? 0.9 : a.size === 'tall' ? 1.12 : 1.0;
  inner.scale.setScalar(sizeScale);
  const bw = a.build === 'slim' ? 0.9 : a.build === 'chonky' ? 1.18 : 1.0; // body width factor

  const body = ball(0.44, a.bodyColor, bw, 0.96, 1.05 * bw);
  body.position.y = 0.54; inner.add(body); addOutline(body);

  const bellyPatch = a.pattern === 'belly_patch';
  const belly = ball(bellyPatch ? 0.36 : 0.3, bellyPatch ? a.patternColor : a.bellyColor, 0.92 * bw, 0.9, 0.6);
  belly.position.set(0, 0.46, 0.22); inner.add(belly);

  const head = new THREE.Group();
  head.position.set(0, 1.2, 0.12);
  const skull = ball(0.52, a.bodyColor, 1, 0.95, 0.95); // radius locked for wearables
  head.add(skull); addOutlineLater(head, skull);

  if (a.snout === 'muzzle') {
    const muzzle = ball(0.18, a.bellyColor, 1.2, 0.82, 0.7); muzzle.position.set(0, -0.15, 0.42); head.add(muzzle);
    const nose = ball(0.06, 0x4a3a30, 1.2, 0.85, 0.8); nose.position.set(0, -0.08, 0.56); head.add(nose);
  } else if (a.snout === 'beak') {
    const beak = ball(0.13, a.accentColor, 1.6, 0.5, 1.25); beak.position.set(0, -0.08, 0.46); head.add(beak);
  } else { // button
    const nose = ball(0.05, 0x4a3a30, 1.2, 0.85, 0.8); nose.position.set(0, -0.02, 0.52); head.add(nose);
  }

  addFace(head, { eyeColor: a.eyeColor, eyeStyle: a.eyeStyle, blush: a.blush });
  const ears = [];
  creatureEars(head, a, ears);
  creatureHorns(head, a);
  inner.add(head);

  const tail = creatureTail(inner, a);
  creaturePattern(inner, head, a, bw);
  const legs = stubbyLegs(inner, a.bodyColor, { spreadX: 0.2 * bw, spreadZ: 0.16 * bw });
  return { head, legs, tail, ears };
}

// Outline for a mesh inside a group that may not be attached yet.
function addOutlineLater(group, target, scale = 1.05) {
  const o = new THREE.Mesh(target.geometry, outlineMat);
  o.scale.copy(target.scale).multiplyScalar(scale);
  o.position.copy(target.position);
  group.add(o);
}

// ---- wearables (fitted to v2 head radius ~0.52, attach to head group) ----
const WEARABLES = {
  cap_red:  (h) => capMesh(h, 0xd64541),
  cap_blue: (h) => capMesh(h, 0x3a6ea8),
  beanie(head) {
    const g = new THREE.Group();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.48, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), toonMat(0x8e6bbf));
    dome.castShadow = true;
    g.add(dome);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.06, 8, 18), toonMat(0x7657a6));
    band.rotation.x = Math.PI / 2;
    g.add(band);
    const pom = ball(0.13, 0xf0e8f8);
    pom.position.y = 0.5;
    g.add(pom);
    g.position.y = 0.18;
    head.add(g);
    return g;
  },
  gradcap(head) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.4, 0.2, 10), toonMat(0x2a2a3c));
    base.castShadow = true;
    g.add(base);
    const board = box(0.95, 0.07, 0.95, 0x2a2a3c);
    board.position.y = 0.14;
    g.add(board);
    const button = ball(0.05, 0xf2c14e);
    button.position.y = 0.2;
    g.add(button);
    const tassel = box(0.06, 0.34, 0.06, 0xf2c14e);
    tassel.position.set(0.42, -0.02, 0.42);
    g.add(tassel);
    g.position.y = 0.42;
    head.add(g);
    return g;
  },
  bow(head) {
    const g = new THREE.Group();
    for (const s of [-1, 1]) {
      const loop = ball(0.12, 0xe75480, 1.3, 0.9, 0.5);
      loop.position.x = s * 0.13;
      loop.rotation.z = s * 0.5;
      g.add(loop);
    }
    const knot = ball(0.07, 0xc23b66);
    g.add(knot);
    g.position.set(0.25, 0.44, 0.1);
    head.add(g);
    return g;
  },
  glasses(head) {
    const g = new THREE.Group();
    const lensMat = new THREE.MeshToonMaterial({ color: 0x66ccee, transparent: true, opacity: 0.5 });
    for (const s of [-1, 1]) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.025, 8, 14), toonMat(0x2a2420));
      rim.position.set(s * 0.2, 0.1, 0.47);
      g.add(rim);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.13, 14), lensMat);
      lens.position.set(s * 0.2, 0.1, 0.47);
      g.add(lens);
    }
    const bridge = box(0.14, 0.03, 0.03, 0x2a2420);
    bridge.position.set(0, 0.1, 0.48);
    g.add(bridge);
    head.add(g);
    return g;
  },
  scarf(head) {
    const g = new THREE.Group();
    const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.11, 8, 18), toonMat(0xc0392b));
    wrap.rotation.x = Math.PI / 2;
    g.add(wrap);
    const tail1 = box(0.17, 0.4, 0.08, 0xc0392b);
    tail1.position.set(0.14, -0.26, 0.34);
    g.add(tail1);
    const fringe = box(0.17, 0.07, 0.09, 0xe8e0d0);
    fringe.position.set(0.14, -0.48, 0.34);
    g.add(fringe);
    g.position.y = -0.42;
    head.add(g);
    return g;
  },
  crown(head) {
    const g = new THREE.Group();
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.42, 0.18, 14), toonMat(0xf2c14e));
    band.castShadow = true; g.add(band);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.24, 6), toonMat(0xf2c14e));
      spike.position.set(Math.cos(a) * 0.38, 0.18, Math.sin(a) * 0.38); g.add(spike);
      const gem = ball(0.05, 0xe0556b); gem.position.set(Math.cos(a) * 0.38, 0.28, Math.sin(a) * 0.38); g.add(gem);
    }
    g.position.y = 0.52; head.add(g); return g;
  },
  party_hat(head) {
    const g = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.82, 16), toonMat(0xff5fa2));
    cone.castShadow = true; g.add(cone);
    for (const [y, c] of [[0.05, 0xffd166], [-0.18, 0x6be0a0]]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.03, 6, 16), toonMat(c)); ring.rotation.x = Math.PI / 2; ring.position.y = y; g.add(ring); }
    const pom = ball(0.1, 0xfff0a0); pom.position.y = 0.46; g.add(pom);
    g.position.y = 0.56; head.add(g); return g;
  },
  headphones(head) {
    const g = new THREE.Group();
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 8, 20, 0, Math.PI), toonMat(0x2a2d34));
    band.castShadow = true; g.add(band);
    for (const s of [-1, 1]) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.13, 14), toonMat(0x33353b));
      cup.rotation.z = Math.PI / 2; cup.position.set(s * 0.5, 0.02, 0); g.add(cup);
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.16, 12), toonMat(0xff5fa2));
      pad.rotation.z = Math.PI / 2; pad.position.set(s * 0.55, 0.02, 0); g.add(pad);
    }
    g.position.y = 0.16; head.add(g); return g;
  },
  sunglasses(head) {
    const g = new THREE.Group();
    const lensMat = toonMat(0x14181d);
    for (const s of [-1, 1]) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.03, 8, 14), toonMat(0x2a2420));
      rim.position.set(s * 0.2, 0.1, 0.47); g.add(rim);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.14, 14), lensMat);
      lens.position.set(s * 0.2, 0.1, 0.475); g.add(lens);
    }
    const bridge = box(0.14, 0.03, 0.03, 0x2a2420); bridge.position.set(0, 0.12, 0.48); g.add(bridge);
    head.add(g); return g;
  },
  flower(head) {
    const g = new THREE.Group();
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; const petal = ball(0.08, 0xff8fb0, 1, 1, 0.6); petal.position.set(Math.cos(a) * 0.1, Math.sin(a) * 0.1, 0); g.add(petal); }
    const center = ball(0.06, 0xffd166); g.add(center);
    g.position.set(0.26, 0.45, 0.12); head.add(g); return g;
  },
};

function capMesh(head, color) {
  const g = new THREE.Group();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.46, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), toonMat(color));
  dome.castShadow = true;
  dome.scale.y = 0.8;
  g.add(dome);
  const brim = ball(0.24, color, 1.6, 0.18, 1.2);
  brim.position.set(0, 0.02, 0.42);
  g.add(brim);
  const button = ball(0.05, color);
  button.position.y = 0.38;
  g.add(button);
  g.position.y = 0.22;
  head.add(g);
  return g;
}

export function createPet(type, { equipped = {}, appearance = null } = {}) {
  const g = new THREE.Group();
  const inner = new THREE.Group();
  g.add(inner);
  const parts = type === 'creature'
    ? buildCreature(inner, appearance || defaultCreature())
    : (BUILDERS[type] || BUILDERS.cat)(inner);
  g.userData.head = parts.head;
  g.userData.petType = type;
  g.userData.wearables = [];

  setWearables(g, equipped);

  // hop + squash walk, idle breathing/tail-wag — driven from the main loop
  const baseHeadY = parts.head.position.y;
  const baseScaleY = inner.scale.y;
  g.userData.animate = (t, moving) => {
    if (moving) {
      const hop = Math.abs(Math.sin(t * 9));
      inner.position.y = hop * 0.09;
      inner.scale.y = baseScaleY * (1 + (hop - 0.5) * 0.05);
      parts.head.rotation.z = Math.sin(t * 9) * 0.05;
      parts.legs.forEach((leg, i) => {
        leg.rotation.x = Math.sin(t * 11 + (i % 2) * Math.PI) * 0.7;
      });
    } else {
      inner.position.y = 0;
      inner.scale.y = baseScaleY * (1 + Math.sin(t * 2.2) * 0.012);
      parts.head.rotation.z = 0;
      parts.head.position.y = baseHeadY + Math.sin(t * 2.2) * 0.012;
      parts.legs.forEach((leg) => { leg.rotation.x = 0; });
    }
    // eating: a quick chewing head-nod that overrides the idle/walk head tilt
    parts.head.rotation.x = (g.userData.eatUntil && t < g.userData.eatUntil) ? (-0.16 + Math.abs(Math.sin(t * 14)) * 0.22) : 0;
    if (parts.tail) parts.tail.rotation.y = Math.sin(t * 5) * 0.35;
    for (const e of parts.ears) e.rotation.x = Math.sin(t * 3 + 1) * 0.08;
  };
  return g;
}

export function setWearables(pet, equipped) {
  const head = pet.userData.head;
  for (const w of pet.userData.wearables) head.remove(w);
  pet.userData.wearables = [];
  for (const id of Object.values(equipped)) {
    if (id && WEARABLES[id]) pet.userData.wearables.push(WEARABLES[id](head));
  }
}
