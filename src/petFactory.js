// Pet builder v2 — Animal Crossing proportions: big round heads, stubby
// toon-shaded bodies, big eyes with highlights, blush, soft outlines.
// Public API unchanged from v1: createPet(type, {equipped}) returns a Group
// with userData { head, animate(t, moving) }; setWearables re-dresses a pet.

import * as THREE from 'three';
import { PALETTE as P } from './palette.js';
import { toonMat } from './textures.js';
import { isAuraReady, buildAura } from './auraModel.js';

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
// "Aura" (working name) — the player's original, customizable species, modelled
// on the concept sheet: a soft, green-furred, BIPEDAL critter with two arms and
// two legs (four limbs total — NOT four-legged, and NO antlers/horns). Built from
// the same primitives as the animals and returns the same {head, legs, tail, ears}
// shape so createPet's animation loop is reused. Head radius stays 0.52 so all
// existing wearables fit.

// Coat palette: a coherent run of natural fur tones (snow → cream → fawn →
// caramel → brown → cocoa, then a cool grey→charcoal column) followed by soft,
// cheerful candy colours. Ordered light→dark within each family.
export const COAT_SWATCHES = [
  0xf7f1e6, 0xefdcc0, 0xe3c39a, 0xcaa472, 0xb07b46, 0x8a5a32, 0x5e3d22,
  0xcfd2d6, 0x9aa0a6, 0x6b7178, 0x3c4047,
  0xef8d6a, 0xf0b84e, 0x7ec98a, 0x4bb3a6, 0x5f9fe0, 0xc98fd0, 0xee9ac2,
];
export const BELLY_SWATCHES = [0xffffff, 0xfff6ea, 0xeaf2fb, 0xfceef3, 0xeef8e9, 0xf5eefa, 0xfff6e0, 0xeef7f4, 0xf2efe9];
export const ACCENT_SWATCHES = [0xe8a0a0, 0xf0b8c0, 0xd0b0e0, 0xa0c8e0, 0xf2c14e, 0xb0d0a0, 0xd8b89a, 0xc0c0c8]; // inner ear / cheeks
export const SPOT_SWATCHES = [0xcfcfcf, 0xbfbfbf, 0xe0d6c8, 0xd6c0c0, 0xc8d2dc, 0xbcbcc6]; // soft markings
// Muzzle / snout tones, curated to pair with the coat palette: ivory & creams
// for light coats, fawn/tan/brown for warm coats, blush/rose accents, and a
// grey→charcoal run for the cool coats. Ordered light→dark.
export const MUZZLE_SWATCHES = [
  0xf6ecdc, 0xe9d6b8, 0xf0cdb0, 0xd9b48c, 0xc09a6e, 0x9a7350,
  0xf3c9cf, 0xe39aa6, 0xd7dade, 0xa6abb0, 0x6f747a, 0x3f4248,
];
// eye / iris colours — vivid but believable: rich browns, amber/hazel, then a
// clear blue / green / grey / violet, plus a deep near-black for a classic look.
export const EYE_SWATCHES = [
  0x6b4324, 0x9c6a30, 0xc28a3a, 0x3f7bbf, 0x3f9e6a, 0x8a6a3e, 0x6f6086, 0x2a241e,
];
// shirt / pants colours — playful, saturated wardrobe palette (recoloured texture zones)
export const SHIRT_SWATCHES = [
  0xffd21e, 0xff7e1a, 0xee3b34, 0xf76fa0, 0x9b5de5, 0x4a86e8, 0x1fc4b0, 0x55b76a, 0x3a3f4a, 0xf4f2ec,
];
export const PANTS_SWATCHES = [
  0xff7e1a, 0xffd21e, 0x2f50b0, 0x4a86e8, 0x1fc4b0, 0x55b76a, 0x9a5a30, 0x707680, 0x3a3f4a, 0xe6e2d8,
];

export const CREATURE_OPTIONS = {
  build: ['slim', 'round', 'chonky'],
  size: ['small', 'medium', 'tall'],
  fur: ['velvety', 'silky', 'shaggy'],           // Smooth / Soft / Fuzzy
  pattern: ['none', 'spots', 'stripes', 'patch', 'freckles'],
  ears: ['none', 'round', 'pointed', 'tall', 'floppy', 'folded', 'wide'],
  tail: ['none', 'fluffy', 'pom'],                // None / Long Fluffy / Pom-Pom
  eyeStyle: ['round', 'sparkly', 'sleepy'],
};

export function defaultCreature() {
  // the canon look: a clean smooth white toy-critter — big round head, big glossy
  // black eyes, soft floppy ears, little nose, no tail.
  return {
    build: 'round', size: 'medium',
    bodyColor: 0xffd23e, bellyColor: 0xfff3cf, accentColor: 0xffb3a3,   // duckling yellow
    muzzleColor: 0xff9e2c,                                              // orange bill / feet
    pattern: 'none', patternColor: 0xcfcfcf, fur: 'velvety',
    ears: 'floppy', tail: 'none',
    eyeColor: 0x232020, eyeStyle: 'round', blush: false,               // dark duck eyes
    shirtColor: 0x5a9e44, pantsColor: 0xff7e1a,   // duck torso "sweater" (green) / legacy
  };
}

export function randomCreature() {
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  return {
    build: pick(CREATURE_OPTIONS.build), size: pick(CREATURE_OPTIONS.size),
    bodyColor: pick(COAT_SWATCHES), bellyColor: pick(BELLY_SWATCHES), accentColor: pick(ACCENT_SWATCHES),
    muzzleColor: pick(MUZZLE_SWATCHES),
    pattern: pick(CREATURE_OPTIONS.pattern), patternColor: pick(SPOT_SWATCHES), fur: pick(CREATURE_OPTIONS.fur),
    ears: pick(CREATURE_OPTIONS.ears), tail: pick(CREATURE_OPTIONS.tail),
    eyeColor: pick(EYE_SWATCHES), eyeStyle: pick(CREATURE_OPTIONS.eyeStyle),
    blush: false,
    shirtColor: pick(SHIRT_SWATCHES), pantsColor: pick(PANTS_SWATCHES),
  };
}

function creatureEars(head, a, ears) {
  const coat = a.bodyColor, acc = a.accentColor;
  for (const s of [-1, 1]) {
    if (a.ears === 'rounded') {           // small round ears on top
      const ear = ball(0.15, coat);
      ear.position.set(s * 0.33, 0.46, -0.02); head.add(ear);
    } else if (a.ears === 'upright') {    // tall upright ears
      const ear = ball(0.12, coat, 0.82, 1.7, 0.7);
      ear.position.set(s * 0.26, 0.7, -0.02); ear.rotation.z = s * 0.16; head.add(ear);
      const earIn = ball(0.07, acc, 0.65, 1.4, 0.5);
      earIn.position.set(s * 0.26, 0.72, 0.05); earIn.rotation.z = s * 0.16; head.add(earIn);
    } else if (a.ears === 'floppy') {     // big soft floppy ears draping down the sides, framing the face
      const ear = ball(0.2, coat, 0.66, 1.85, 0.6);
      ear.position.set(s * 0.41, -0.04, 0.05); ear.rotation.z = s * 0.24; ear.rotation.x = -0.12;
      head.add(ear); ears.push(ear);
    }
  }
}

// soft, slightly darker shade of a hex colour (for gentle creases / shadow)
function shade(hex, f) {
  const r = Math.round(((hex >> 16) & 255) * f);
  const g = Math.round(((hex >> 8) & 255) * f);
  const b = Math.round((hex & 255) * f);
  return (r << 16) | (g << 8) | b;
}

// the toy face: big glossy oval eyes + soft highlight, subtle worried brows, nose
function creatureFace(head, a) {
  const sparkly = a.eyeStyle === 'sparkly', sleepy = a.eyeStyle === 'sleepy';
  const eyeR = sparkly ? 0.135 : 0.125;
  const eyeSy = sleepy ? 0.8 : 1.28;
  for (const s of [-1, 1]) {
    const eye = ball(eyeR, a.eyeColor, 0.94, eyeSy, 0.5);
    eye.position.set(s * 0.205, 0.02, 0.45); head.add(eye);
    const shine = ball(0.052, 0xffffff, 1, 1, 0.6);
    shine.position.set(s * 0.205 + 0.05, 0.13, 0.5); head.add(shine);
    if (sparkly) { const sh2 = ball(0.026, 0xffffff, 1, 1, 0.6); sh2.position.set(s * 0.205 - 0.04, -0.04, 0.5); head.add(sh2); }
    // subtle soft worried brow — slightly above the eye, gently angled
    const brow = ball(0.075, shade(a.bodyColor, 0.86), 1.5, 0.2, 0.45);
    brow.position.set(s * 0.205, 0.22, 0.46); brow.rotation.z = s * -0.13; head.add(brow);
    if (a.blush) { const b = ball(0.07, P.blush, 1, 0.6, 0.3); b.position.set(s * 0.34, -0.12, 0.4); head.add(b); }
  }
  const nose = ball(0.055, 0x1a1a1a, 1.25, 0.95, 0.85); nose.position.set(0, -0.08, 0.49); head.add(nose);
}

function creatureTail(inner, a) {
  if (a.tail === 'none') return null;
  if (a.tail === 'pom') {                 // short fluffy pom-pom
    const tail = ball(0.17, a.bodyColor);
    tail.position.set(0, 0.46, -0.46); inner.add(tail);
    const tip = ball(0.1, a.bellyColor); tip.position.set(0, 0.5, -0.56); tail.add(tip);
    return tail;
  }
  // long fluffy (squirrel-like) tail: a curved stack of balls in a group so the
  // createPet wag (rotation.y) sweeps the whole plume.
  const g = new THREE.Group();
  for (const [y, z, r] of [[0, 0, 0.16], [0.18, -0.03, 0.18], [0.36, -0.01, 0.19], [0.52, 0.08, 0.18], [0.64, 0.2, 0.15]]) {
    const b = ball(r, a.bodyColor); b.position.set(0, y, z); g.add(b);
  }
  const tip = ball(0.13, a.bellyColor); tip.position.set(0, 0.72, 0.26); g.add(tip);
  g.position.set(0, 0.5, -0.44); inner.add(g);
  return g;
}

// soft fur look: velvety = smooth (nothing extra); shaggy = chunky tufts around
// the body + cheeks; silky = a few smooth, elongated wisps on the chest/sides.
function creatureFur(inner, head, a, bw) {
  if (a.fur === 'velvety') return;
  const c = a.bodyColor;
  if (a.fur === 'shaggy') {
    for (const [x, y, z] of [[0.34, 0.5, 0.08], [-0.34, 0.5, 0.08], [0.3, 0.42, -0.22], [-0.3, 0.42, -0.22], [0.2, 0.68, -0.18], [-0.2, 0.68, -0.18], [0.36, 0.6, -0.04], [-0.36, 0.6, -0.04]]) {
      const t = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.22, 5), toonMat(c));
      t.castShadow = true;
      t.position.set(x * bw, y, z * bw);
      t.rotation.z = x > 0 ? -0.9 : 0.9;
      t.rotation.x = z < 0 ? -0.6 : 0.4;
      inner.add(t);
    }
    for (const s of [-1, 1]) {            // cheek fuzz
      const cf = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.2, 5), toonMat(c));
      cf.position.set(s * 0.5, -0.05, 0.08); cf.rotation.z = s * 1.3; head.add(cf);
    }
  } else if (a.fur === 'silky') {
    for (const [x, y, z, sy] of [[0, 0.34, 0.32, 1.5], [0.3, 0.32, 0.18, 1.25], [-0.3, 0.32, 0.18, 1.25]]) {
      const w = ball(0.1, c, 0.7, sy, 0.7);
      w.position.set(x * bw, y, z * bw); inner.add(w);
    }
  }
}

function creaturePattern(inner, head, a, bw) {
  const c = a.patternColor;
  if (a.pattern === 'spots') {            // darker fur markings
    for (const [x, y, z] of [[0.22, 0.64, 0.32], [-0.26, 0.6, 0.2], [0.0, 0.72, 0.32], [0.28, 0.52, -0.1], [-0.2, 0.5, -0.16], [0.12, 0.68, -0.26]]) {
      const sp = ball(0.09, c, 1, 1, 0.4);
      sp.position.set(x * bw, y, z * bw); inner.add(sp);
    }
  } else if (a.pattern === 'stripes') {
    for (const z of [0.12, -0.03, -0.18]) {
      const st = box(0.52 * bw, 0.05, 0.15, c);
      st.position.set(0, 0.74, z); inner.add(st);
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
  const bw = a.build === 'slim' ? 0.92 : a.build === 'chonky' ? 1.16 : 1.0; // body width factor

  // smooth egg-shaped body (small relative to the big head). No outline — this
  // species uses soft vinyl-toy shading instead of the cel outline, so the head
  // and body blend into one seamless form (see smooth-material pass below).
  const body = ball(0.40, a.bodyColor, bw, 1.08, 0.98 * bw);
  body.position.y = 0.54; inner.add(body);

  if (a.pattern === 'patch') {            // optional belly patch (off by default)
    const belly = ball(0.3, a.patternColor, 0.9 * bw, 0.95, 0.6);
    belly.position.set(0, 0.5, 0.22); inner.add(belly);
  }

  // big round head — radius locked at 0.52 so all wearables still fit. Sunk into
  // the body a touch (no outline) for a seamless neck.
  const head = new THREE.Group();
  head.position.set(0, 1.12, 0.08);
  const skull = ball(0.52, a.bodyColor, 1.05, 0.98, 1.0);
  head.add(skull);

  creatureFace(head, a);
  const ears = [];
  creatureEars(head, a, ears);
  inner.add(head);

  // short stubby arms, one on each side (bipedal — four limbs total)
  for (const s of [-1, 1]) {
    const arm = ball(0.12, a.bodyColor, 0.82, 1.15, 0.85);
    arm.position.set(s * 0.40 * bw, 0.5, 0.05);
    arm.rotation.z = s * 0.26; inner.add(arm);
  }

  const tail = creatureTail(inner, a);
  creaturePattern(inner, head, a, bw);
  creatureFur(inner, head, a, bw);

  // two little feet
  const legs = [];
  for (const s of [-1, 1]) {
    const foot = ball(0.14, a.bodyColor, 1.0, 0.82, 1.3);
    foot.position.set(s * 0.16 * bw, 0.06, 0.06);
    inner.add(foot); legs.push(foot);
  }

  // smooth-vinyl pass: swap this species off the cel-shaded toon material onto
  // soft standard shading (no hard bands, no outline) to match the toy look.
  // Dark parts (eyes, nose) get a glossy finish; everything else is soft-matte.
  inner.traverse((o) => {
    if (!o.isMesh) return;
    const hex = o.material.color.getHex();
    const lum = (((hex >> 16) & 255) + ((hex >> 8) & 255) + (hex & 255)) / 3;
    o.material = new THREE.MeshStandardMaterial({ color: hex, roughness: lum < 60 ? 0.3 : 0.82, metalness: 0 });
  });

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
  // ---- body-worn accessories (attached to the torso anchor) ----
  shirt_white: (b) => shirtMesh(b, 0xf2f1ee),
  shirt_blue:  (b) => shirtMesh(b, 0x4a78c8),
  shirt_red:   (b) => shirtMesh(b, 0xd6584f),
  shirt_green: (b) => shirtMesh(b, 0x4f9e6a),
  pants_blue:  (b) => pantsMesh(b, 0x3f567f),
  pants_khaki: (b) => pantsMesh(b, 0xc2a172),
  pants_grey:  (b) => pantsMesh(b, 0x5b6068),
  bag_navy:    (b) => backpackMesh(b, 0x2f3a66),
  bag_red:     (b) => backpackMesh(b, 0xbe3b32),
  bag_green:   (b) => backpackMesh(b, 0x3c7a4e),
};

// tint a hex toward white (t>0) or black (t<0) by |t|
const tintHex = (c, t) => new THREE.Color(c).lerp(new THREE.Color(t < 0 ? 0x000000 : 0xffffff), Math.abs(t)).getHex();

// Body accessories sit in the Aura's normalised space (feet y=0, ~1.7 tall). The
// big chibi head spans y≈0.81–1.70, so the torso is ~0.45–0.81 and the legs below.
// Positions/sizes are tuned to that; the constants below make them easy to nudge.
const TORSO_Y = 0.60, TORSO_R = 0.37, HIPS_Y = 0.33, BACK_Z = -0.34;
function shirtMesh(body, color) {
  const g = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.SphereGeometry(TORSO_R, 18, 14), toonMat(color));
  torso.scale.set(1.06, 0.86, 1.02); torso.castShadow = true; g.add(torso);
  for (const s of [-1, 1]) { const sl = ball(0.145, color, 1, 0.85, 1); sl.position.set(s * 0.35, 0.02, 0); g.add(sl); }
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.03, 8, 16), toonMat(tintHex(color, 0.35)));
  collar.rotation.x = Math.PI / 2; collar.position.y = 0.27; g.add(collar);
  const hem = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.028, 8, 18), toonMat(tintHex(color, 0.22)));
  hem.rotation.x = Math.PI / 2; hem.position.y = -0.27; g.add(hem);
  g.position.set(0, TORSO_Y, 0); body.add(g); return g;
}
function pantsMesh(body, color) {
  const g = new THREE.Group();
  const hips = new THREE.Mesh(new THREE.SphereGeometry(0.33, 16, 12), toonMat(color));
  hips.scale.set(1.06, 0.74, 1.02); hips.castShadow = true; g.add(hips);
  for (const s of [-1, 1]) { const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.2, 4, 10), toonMat(color)); leg.position.set(s * 0.14, -0.26, 0.02); leg.castShadow = true; g.add(leg); }
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.03, 8, 18), toonMat(tintHex(color, -0.3)));
  belt.rotation.x = Math.PI / 2; belt.position.y = 0.13; g.add(belt);
  g.position.set(0, HIPS_Y, 0); body.add(g); return g;
}
// A rounded 2D arch outline (flat-front backpack silhouette): rounded dome top,
// gently rounded bottom corners. Used as an extrude profile.
function archShape(w, h, rTop, rBot) {
  const s = new THREE.Shape();
  const hw = w / 2, hh = h / 2;
  s.moveTo(-hw, -hh + rBot);
  s.lineTo(-hw, hh - rTop);
  s.quadraticCurveTo(-hw, hh, -hw + rTop, hh);
  s.lineTo(hw - rTop, hh);
  s.quadraticCurveTo(hw, hh, hw, hh - rTop);
  s.lineTo(hw, -hh + rBot);
  s.quadraticCurveTo(hw, -hh, hw - rBot, -hh);
  s.lineTo(-hw + rBot, -hh);
  s.quadraticCurveTo(-hw, -hh, -hw, -hh + rBot);
  return s;
}
// Extrude an arch profile into a soft, bevelled slab (rounded front + edges).
function archSlab(w, h, depth, rTop, rBot, color, bevel = 0.03) {
  const geo = new THREE.ExtrudeGeometry(archShape(w, h, rTop, rBot), {
    depth: depth - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel,
    bevelSegments: 3, steps: 1, curveSegments: 24,
  });
  geo.translate(0, 0, -(depth - bevel * 2) / 2);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, toonMat(color));
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// School backpack modelled after a real one: rounded dome body, contrasting leather
// base, front zip pocket, top carry loop, and padded straps that arc over the
// shoulders to the chest. Built in the model's own space (height ~1.7; torso hips
// y0.41 -> shoulders y0.75; back surface near z-0.25) and parented to the torso.
const BAG = { cy: 0.60, cz: -0.30, w: 0.46, h: 0.54, d: 0.24 };
const BAG_LEATHER = 0x6f4a2c, BAG_DARK = 0x2b2b30;
function backpackMesh(body, color) {
  const g = new THREE.Group();
  const frontZ = BAG.cz - BAG.d / 2;                 // outward-facing plane (away from back)
  // main body
  const main = archSlab(BAG.w, BAG.h, BAG.d, BAG.w * 0.48, 0.07, color);
  main.position.set(0, BAG.cy, BAG.cz); g.add(main);
  // leather base wrapping the bottom
  const baseH = 0.17;
  const base = archSlab(BAG.w * 1.01, baseH, BAG.d * 1.04, 0.03, 0.07, BAG_LEATHER, 0.025);
  base.position.set(0, BAG.cy - BAG.h / 2 + baseH / 2, BAG.cz); g.add(base);
  // front pocket (slightly proud of the face) with a zip line
  const pocket = archSlab(BAG.w * 0.66, 0.24, 0.06, 0.05, 0.05, color, 0.02);
  pocket.position.set(0, BAG.cy - 0.05, frontZ - 0.02); g.add(pocket);
  const zip = box(BAG.w * 0.6, 0.018, 0.025, BAG_DARK);
  zip.position.set(0, BAG.cy + 0.06, frontZ - 0.05); g.add(zip);
  const pull = box(0.03, 0.05, 0.03, BAG_DARK);
  pull.position.set(BAG.w * 0.22, BAG.cy + 0.05, frontZ - 0.05); g.add(pull);
  // top carry loop
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.018, 8, 18, Math.PI), toonMat(BAG_DARK));
  handle.position.set(0, BAG.cy + BAG.h / 2 - 0.01, BAG.cz + 0.03); handle.castShadow = true; g.add(handle);
  // padded shoulder straps: a flattened tube arcing from the bag top, over each
  // shoulder, down to the chest — so the straps actually wrap the body.
  for (const sx of [-1, 1]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(sx * 0.12, BAG.cy + BAG.h * 0.34, BAG.cz + BAG.d * 0.35),
      new THREE.Vector3(sx * 0.17, 0.83, -0.02),
      new THREE.Vector3(sx * 0.16, 0.66, 0.17),
      new THREE.Vector3(sx * 0.13, 0.49, 0.21),
    ]);
    const strap = new THREE.Mesh(new THREE.TubeGeometry(curve, 28, 0.032, 10, false), toonMat(BAG_DARK));
    strap.scale.x = 1.5; strap.castShadow = true; g.add(strap);
  }
  body.add(g); return g;
}

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

// ---- College Ducks: the player character, modelled natively (no GLB). A plump egg
// body, big round head, broad two-part bill, webbed feet, little wings, an upturned
// tail tuft and a cheeky head feather. Anchors kept clean for accessories: the `head`
// group (hats/glasses) and the torso `inner` (shirt / backpack). Body + head take the
// coat colour; bill + feet take the "muzzle" colour; eyes take the eye colour. ----

// A webbed-foot outline: a heel that fans into three soft lobes at the front.
function duckFootShape(w, len) {
  const s = new THREE.Shape();
  s.moveTo(0, -0.02);
  s.lineTo(-w, len * 0.5);
  s.quadraticCurveTo(-w * 1.06, len, -w * 0.5, len * 0.9);
  s.quadraticCurveTo(0, len * 1.08, w * 0.5, len * 0.9);
  s.quadraticCurveTo(w * 1.06, len, w, len * 0.5);
  s.lineTo(0, -0.02);
  return s;
}
function duckFoot(color) {
  const geo = new THREE.ExtrudeGeometry(duckFootShape(0.12, 0.24), {
    depth: 0.045, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2, steps: 1, curveSegments: 16,
  });
  geo.rotateX(-Math.PI / 2);          // lie flat, toes point +z
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, toonMat(color));
  m.castShadow = true;
  return m;
}
// Loft a single smooth surface from a stack of horizontal cross-sections. `keys` are
// [y, z, rx, rz] control points (bottom→top); each level is an ellipse of half-width
// rx / half-depth rz, centred at (0, y, z). Catmull-Rom-smoothed and capped top+bottom
// → one continuous watertight body (no stuck-together spheres).
function loftBody(keys, SEG, RES) {
  const ch = (i) => new THREE.CatmullRomCurve3(keys.map((k, n) => new THREE.Vector3(n, k[i], 0)), false, 'catmullrom', 0.5);
  const yS = ch(0), zS = ch(1), xrS = ch(2), zrS = ch(3);
  const at = (sp, u) => sp.getPoint(u).y;        // u in [0,1] spans the whole spline
  const pos = [], idx = [], rings = [];
  for (let r = 0; r <= RES; r++) {
    const u = r / RES, y = at(yS, u), zc = at(zS, u), rx = Math.max(1e-3, at(xrS, u)), rz = Math.max(1e-3, at(zrS, u));
    const ring = [];
    for (let s = 0; s < SEG; s++) {
      const ang = (s / SEG) * Math.PI * 2;
      ring.push(pos.length / 3);
      pos.push(Math.cos(ang) * rx, y, zc + Math.sin(ang) * rz);
    }
    rings.push(ring);
  }
  for (let r = 0; r < RES; r++) for (let s = 0; s < SEG; s++) {
    const s2 = (s + 1) % SEG, a = rings[r][s], b = rings[r][s2], c = rings[r + 1][s2], d = rings[r + 1][s];
    idx.push(a, b, c, a, c, d);
  }
  const botC = pos.length / 3; pos.push(0, at(yS, 0) - 0.03, at(zS, 0));
  for (let s = 0; s < SEG; s++) idx.push(botC, rings[0][(s + 1) % SEG], rings[0][s]);
  const topC = pos.length / 3; pos.push(0, at(yS, 1) + 0.03, at(zS, 1));
  for (let s = 0; s < SEG; s++) idx.push(topC, rings[RES][s], rings[RES][(s + 1) % SEG]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// Flat duck-bill outline (top view): a rounded scoop, a touch wider at the front.
function duckBillShape(hw, len) {
  const s = new THREE.Shape();
  s.moveTo(-hw * 0.66, 0);
  s.lineTo(-hw, len * 0.5);
  s.quadraticCurveTo(-hw, len, -hw * 0.45, len);
  s.quadraticCurveTo(0, len * 1.08, hw * 0.45, len);
  s.quadraticCurveTo(hw, len, hw, len * 0.5);
  s.lineTo(hw * 0.66, 0);
  s.quadraticCurveTo(0, -len * 0.16, -hw * 0.66, 0);
  return s;
}
function duckBill(hw, len, color) {
  const geo = new THREE.ExtrudeGeometry(duckBillShape(hw, len), {
    depth: 0.05, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.03, bevelSegments: 3, steps: 1, curveSegments: 20,
  });
  geo.rotateX(-Math.PI / 2);          // lay flat, scoop points +z
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, toonMat(color)); m.castShadow = true;
  return m;
}

// A leg: a slim shin pivoted at the hip with a small webbed foot (so it can step).
function duckLeg(color) {
  const g = new THREE.Group();
  const shin = capsule(0.045, 0.2, color); shin.position.y = -0.15; g.add(shin);
  const foot = duckFoot(color); foot.scale.setScalar(0.55); foot.position.set(0, -0.32, 0.05); g.add(foot);
  return g;
}

// A standing duckling (illustration style): a chunky two-tone body — feathers take the
// coat colour, the torso a contrasting "sweater" colour — a round head up front with a
// small bill and dot eye, a wing patch, an upturned tail, and two orange legs.
function buildDuck(inner, a) {
  const sizeScale = a.size === 'small' ? 0.9 : a.size === 'tall' ? 1.12 : 1.0;
  inner.scale.setScalar(sizeScale);
  const coat = a.bodyColor ?? 0xf6d33b;          // feathers: head, wings, tail
  const torso = a.shirtColor ?? 0x5a9e44;        // body "sweater"
  const bill = a.muzzleColor ?? 0xf0922f;        // bill + legs + feet
  const eye = a.eyeColor ?? 0x1a1714;

  // legs first (behind the body), pivoted at the hips
  const legs = [];
  for (const [s, dz] of [[-1, 0.03], [1, -0.03]]) {
    const leg = duckLeg(bill); leg.position.set(s * 0.15, 0.4, dz); inner.add(leg); legs.push(leg);
  }

  // torso — a plump egg held slightly head-up
  const body = ball(0.46, torso, 1.0, 0.95, 1.18); body.position.set(0, 0.66, -0.02); body.rotation.x = -0.16; inner.add(body);

  // yellow wing patches on the sides, swept back
  for (const s of [-1, 1]) {
    const wing = ball(0.27, coat, 0.2, 0.6, 0.92);
    wing.position.set(s * 0.4, 0.6, -0.06); wing.rotation.z = s * 0.16; wing.rotation.y = s * 0.3;
    inner.add(wing);
  }
  // upturned tail tuft at the back
  const tail = new THREE.Group(); tail.position.set(0, 0.82, -0.48); tail.rotation.x = -0.5; inner.add(tail);
  tail.add(ball(0.15, coat, 0.7, 0.6, 1.0));

  // head up front, joined by a short neck
  const head = new THREE.Group(); head.position.set(0, 1.04, 0.34); inner.add(head);
  head.add(ball(0.32, coat, 1.0, 1.02, 1.0));
  const neck = ball(0.21, coat, 0.92, 1.0, 0.92); neck.position.set(0, -0.34, -0.12); head.add(neck);  // bridges to body
  // small bill, tipped down a touch
  const billG = new THREE.Group(); billG.position.set(0, -0.07, 0.27); billG.rotation.x = 0.14; head.add(billG);
  billG.add(duckBill(0.13, 0.18, bill));
  // small dot eyes with a tiny catchlight
  for (const s of [-1, 1]) {
    const e = ball(0.052, eye, 1, 1.05, 1); e.position.set(s * 0.15, 0.07, 0.26); head.add(e);
    const hi = ball(0.018, 0xffffff); hi.position.set(s * 0.15 + 0.015, 0.1, 0.31); head.add(hi);
  }

  // matte illustrated pass: soft-matte colours with a gentle emissive lift; the eye
  // stays a touch glossier so the dot catches a highlight.
  inner.traverse((o) => {
    if (!o.isMesh) return;
    const hex = o.material.color.getHex();
    const lum = (((hex >> 16) & 255) + ((hex >> 8) & 255) + (hex & 255)) / 3;
    const m = new THREE.MeshStandardMaterial({ color: hex, roughness: lum < 60 ? 0.4 : 0.82, metalness: 0 });
    if (lum >= 60 && lum < 245) { m.emissive.setHex(hex); m.emissiveIntensity = 0.12; }
    o.material = m; o.castShadow = true;
  });

  return { head, legs, tail, ears: [], breathe: false };
}

export function createPet(type, { equipped = {}, appearance = null } = {}) {
  const g = new THREE.Group();
  const inner = new THREE.Group();
  g.add(inner);
  const parts = type === 'creature'
    ? (isAuraReady()
      ? buildAura(inner, appearance || defaultCreature())          // rigged duck GLB
      : buildDuck(inner, appearance || defaultCreature()))         // procedural fallback
    : (BUILDERS[type] || BUILDERS.cat)(inner);
  g.userData.head = parts.head;
  g.userData.body = inner;          // torso anchor for body wearables (shirt/pants/bag)
  g.userData.skin = parts.skin || null;   // {skeleton, bindMatrix, root} for skinned clothing
  g.userData.petType = type;
  g.userData.wearables = [];

  setWearables(g, equipped);

  // a builder may supply its own animator (e.g. the rigged duck's bone-driven walk)
  if (parts.animate) { g.userData.animate = parts.animate; return g; }

  // hop + squash walk, idle breathing/tail-wag — driven from the main loop
  const baseHeadY = parts.head.position.y;
  const baseScaleY = inner.scale.y;
  let prevT = 0;
  g.userData.animate = (t, moving) => {
    // authored model: it's posed once into a static standing idle, so we never
    // touch the bones here (that was causing the flailing). Life comes from a
    // subtle whole-body breathing scale, a gentle walk hop, and the ear flap.
    if (parts.breathe) {
      prevT = t;
      inner.scale.y = baseScaleY * (1 + Math.sin(t * 1.7) * 0.012);
      inner.position.y = moving ? Math.abs(Math.sin(t * 9)) * 0.06 : 0;
      for (const e of parts.ears) e.rotation.x = (e.userData.flapX || 0) + Math.sin(t * 3 + 1) * 0.06;
      return;
    }
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
    for (const e of parts.ears) e.rotation.x = (e.userData.flapX || 0) + Math.sin(t * 3 + 1) * 0.08;
  };
  return g;
}

// Build a wearable on a fresh anchor group (for standalone preview thumbnails).
export function buildWearable(id) {
  const anchor = new THREE.Group();
  if (WEARABLES[id]) WEARABLES[id](anchor);
  return anchor;
}

// Body-worn slots attach to the torso anchor; everything else to the head.
const BODY_SLOTS = { top: 1, bottom: 1, back: 1 };
export function setWearables(pet, equipped) {
  // Shirt and pants are no longer geometry — they are recoloured zones baked into the
  // body texture (handled in buildAura via appearance.shirtColor/pantsColor). Only
  // genuine add-on accessories (e.g. backpack) are built here.
  const head = pet.userData.head, body = pet.userData.body || pet.userData.head;
  for (const w of pet.userData.wearables) if (w.parent) w.parent.remove(w);
  pet.userData.wearables = [];
  for (const [slot, id] of Object.entries(equipped)) {
    if (!id || !WEARABLES[id]) continue;
    pet.userData.wearables.push(WEARABLES[id](BODY_SLOTS[slot] ? body : head));
  }
}
