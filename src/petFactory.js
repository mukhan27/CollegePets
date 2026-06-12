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

// big AC eyes + blush, shared by all species
function addFace(head, { eyeSpread = 0.19, eyeY = 0.1, eyeZ = 0.45, blushY = -0.1, blushSpread = 0.34 } = {}) {
  for (const s of [-1, 1]) {
    const eye = ball(0.085, 0x2a2420, 1, 1.35, 0.55);
    eye.position.set(s * eyeSpread, eyeY, eyeZ);
    head.add(eye);
    const shine = ball(0.028, 0xffffff, 1, 1, 0.6);
    shine.position.set(s * eyeSpread + 0.03, eyeY + 0.05, eyeZ + 0.05);
    head.add(shine);
    const blush = ball(0.07, P.blush, 1, 0.6, 0.3);
    blush.position.set(s * blushSpread, blushY, eyeZ - 0.06);
    head.add(blush);
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
    for (const s of [-1, 1]) { // chubby cheeks + little ears
      const cheek = ball(0.16, P.hamBelly, 1, 0.85, 0.7);
      cheek.position.set(s * 0.3, -0.14, 0.32);
      head.add(cheek);
      const ear = ball(0.13, P.hamEar);
      ear.position.set(s * 0.3, 0.5, -0.05);
      head.add(ear);
      const earIn = ball(0.07, 0xe8a0a0, 1, 1, 0.5);
      earIn.position.set(s * 0.29, 0.5, 0.05);
      head.add(earIn);
    }
    const nose = ball(0.05, 0xcc7788, 1.2, 0.9, 0.8);
    nose.position.set(0, -0.04, 0.5);
    head.add(nose);
    addFace(head, { blushSpread: 0.4, blushY: -0.16 });
    inner.add(head);

    const legs = stubbyLegs(inner, P.hamEar, { y: 0.12, spreadX: 0.18, spreadZ: 0.14, r: 0.09 });
    return { head, legs, tail: null, ears: [] };
  },
};

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

export function createPet(type, { equipped = {} } = {}) {
  const g = new THREE.Group();
  const inner = new THREE.Group();
  g.add(inner);
  const builder = BUILDERS[type] || BUILDERS.cat;
  const parts = builder(inner);
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
