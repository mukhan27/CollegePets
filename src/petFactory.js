// Builds cute low-poly pets out of primitives. Every pet returns a Group
// (~1.6 units tall) with userData: { head, animate(t, moving) } so wearables
// can attach and the main loop can drive the walk bob.

import * as THREE from 'three';

function mat(color) { return new THREE.MeshLambertMaterial({ color }); }

function box(w, h, d, color) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.castShadow = true;
  return m;
}
function ball(r, color, wseg = 10, hseg = 8) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, wseg, hseg), mat(color));
  m.castShadow = true;
  return m;
}

function addFace(head, opts = {}) {
  const eyeColor = 0x222222;
  const r = opts.eyeR ?? 0.07;
  const z = opts.z ?? 0.32;
  const y = opts.y ?? 0.05;
  const spread = opts.spread ?? 0.16;
  for (const s of [-1, 1]) {
    const eye = ball(r, eyeColor, 6, 6);
    eye.position.set(s * spread, y, z);
    head.add(eye);
  }
  if (opts.nose) {
    const nose = ball(opts.nose.r ?? 0.06, opts.nose.color ?? 0x553322, 6, 6);
    nose.position.set(0, (opts.nose.y ?? -0.05), z + 0.04);
    head.add(nose);
  }
}

// Each builder fills a group facing +Z. Returns { head, legs, tail }.
const BUILDERS = {
  cat(g) {
    const body = box(0.7, 0.6, 1.0, 0xe8923a);
    body.position.y = 0.55;
    g.add(body);
    const head = ball(0.38, 0xe8923a);
    head.position.set(0, 1.1, 0.35);
    addFace(head, { nose: { r: 0.05, color: 0xd96a6a } });
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.25, 4), mat(0xe8923a));
      ear.position.set(s * 0.2, 0.33, 0);
      head.add(ear);
    }
    g.add(head);
    const tail = box(0.12, 0.12, 0.6, 0xc97a2e);
    tail.position.set(0, 0.8, -0.65);
    tail.rotation.x = -0.6;
    g.add(tail);
    const legs = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = box(0.16, 0.35, 0.16, 0xc97a2e);
      leg.position.set(sx * 0.24, 0.18, sz * 0.32);
      g.add(leg); legs.push(leg);
    }
    return { head, legs, tail };
  },

  dog(g) {
    const body = box(0.8, 0.65, 1.1, 0x9a6a3f);
    body.position.y = 0.58;
    g.add(body);
    const head = ball(0.42, 0xb07c4a);
    head.position.set(0, 1.18, 0.4);
    addFace(head, { nose: { r: 0.07, color: 0x33261a } });
    const snout = box(0.3, 0.2, 0.25, 0xc89460);
    snout.position.set(0, -0.08, 0.36);
    head.add(snout);
    for (const s of [-1, 1]) { // floppy ears
      const ear = box(0.14, 0.34, 0.1, 0x7a5230);
      ear.position.set(s * 0.34, 0.05, 0);
      ear.rotation.z = s * 0.5;
      head.add(ear);
    }
    g.add(head);
    const tail = box(0.13, 0.13, 0.5, 0x7a5230);
    tail.position.set(0, 0.85, -0.7);
    tail.rotation.x = -0.9;
    g.add(tail);
    const legs = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = box(0.18, 0.38, 0.18, 0x7a5230);
      leg.position.set(sx * 0.28, 0.19, sz * 0.36);
      g.add(leg); legs.push(leg);
    }
    return { head, legs, tail };
  },

  bear(g) {
    const body = box(1.0, 0.85, 1.2, 0x6e4a2f);
    body.position.y = 0.65;
    g.add(body);
    const belly = box(0.6, 0.5, 0.1, 0xc9a87c);
    belly.position.set(0, 0.6, 0.58);
    g.add(belly);
    const head = ball(0.48, 0x7d5536);
    head.position.set(0, 1.45, 0.35);
    addFace(head, { spread: 0.18, nose: { r: 0.08, color: 0x2e2018, y: -0.08 } });
    const muzzle = ball(0.18, 0xc9a87c, 8, 6);
    muzzle.position.set(0, -0.1, 0.38);
    head.add(muzzle);
    for (const s of [-1, 1]) { // round ears
      const ear = ball(0.14, 0x6e4a2f, 8, 6);
      ear.position.set(s * 0.3, 0.38, 0);
      head.add(ear);
    }
    g.add(head);
    const legs = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = box(0.24, 0.45, 0.24, 0x5b3c25);
      leg.position.set(sx * 0.34, 0.22, sz * 0.38);
      g.add(leg); legs.push(leg);
    }
    return { head, legs, tail: null };
  },

  duck(g) {
    const body = ball(0.5, 0xf7f3e3, 12, 9);
    body.scale.set(0.9, 0.8, 1.15);
    body.position.y = 0.6;
    g.add(body);
    const head = ball(0.32, 0xf7f3e3);
    head.position.set(0, 1.25, 0.35);
    addFace(head, { spread: 0.15, y: 0.08 });
    const beak = box(0.26, 0.1, 0.3, 0xf2a93b);
    beak.position.set(0, -0.04, 0.36);
    head.add(beak);
    g.add(head);
    for (const s of [-1, 1]) { // wings
      const wing = ball(0.22, 0xe8e2cd, 8, 6);
      wing.scale.set(0.5, 0.8, 1.1);
      wing.position.set(s * 0.45, 0.65, -0.05);
      g.add(wing);
    }
    const tail = box(0.2, 0.12, 0.25, 0xe8e2cd);
    tail.position.set(0, 0.7, -0.6);
    tail.rotation.x = 0.5;
    g.add(tail);
    const legs = [];
    for (const sx of [-1, 1]) {
      const leg = box(0.1, 0.3, 0.1, 0xf2a93b);
      leg.position.set(sx * 0.18, 0.15, 0);
      g.add(leg); legs.push(leg);
      const foot = box(0.18, 0.05, 0.26, 0xf2a93b);
      foot.position.set(sx * 0.18, 0.03, 0.06);
      g.add(foot);
    }
    return { head, legs, tail };
  },

  hamster(g) {
    g.scale.setScalar(0.85); // smol
    const body = ball(0.55, 0xddb47c, 12, 9);
    body.scale.set(0.95, 0.85, 1.05);
    body.position.y = 0.55;
    g.add(body);
    const tummy = ball(0.3, 0xf3e3c6, 8, 6);
    tummy.scale.set(0.9, 0.9, 0.5);
    tummy.position.set(0, 0.45, 0.42);
    g.add(tummy);
    const head = ball(0.4, 0xddb47c);
    head.position.set(0, 1.1, 0.3);
    addFace(head, { spread: 0.17, nose: { r: 0.05, color: 0xcc7788 } });
    for (const s of [-1, 1]) { // cheeks + little ears
      const cheek = ball(0.13, 0xf3e3c6, 6, 6);
      cheek.position.set(s * 0.26, -0.08, 0.26);
      head.add(cheek);
      const ear = ball(0.1, 0xc59a63, 6, 6);
      ear.position.set(s * 0.24, 0.35, -0.02);
      head.add(ear);
    }
    g.add(head);
    const legs = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = box(0.14, 0.25, 0.14, 0xc59a63);
      leg.position.set(sx * 0.2, 0.12, sz * 0.25);
      g.add(leg); legs.push(leg);
    }
    return { head, legs, tail: null };
  },
};

// ---- wearable builders (attach to head group) ----
const WEARABLES = {
  cap_red:  (h) => capMesh(h, 0xd64541),
  cap_blue: (h) => capMesh(h, 0x3a6ea8),
  beanie(head) {
    const g = new THREE.Group();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x8e6bbf));
    g.add(dome);
    const pom = ball(0.1, 0xf0e8f8, 6, 6);
    pom.position.y = 0.34;
    g.add(pom);
    g.position.y = 0.22;
    head.add(g);
    return g;
  },
  gradcap(head) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.14, 8), mat(0x222233));
    g.add(base);
    const board = box(0.7, 0.05, 0.7, 0x222233);
    board.position.y = 0.1;
    g.add(board);
    const tassel = box(0.05, 0.25, 0.05, 0xf2c14e);
    tassel.position.set(0.3, -0.02, 0.3);
    g.add(tassel);
    g.position.y = 0.32;
    head.add(g);
    return g;
  },
  bow(head) {
    const g = new THREE.Group();
    for (const s of [-1, 1]) {
      const loop = box(0.16, 0.12, 0.06, 0xe75480);
      loop.position.x = s * 0.11;
      loop.rotation.z = s * 0.4;
      g.add(loop);
    }
    const knot = ball(0.06, 0xc23b66, 6, 6);
    g.add(knot);
    g.position.set(0.18, 0.32, 0.05);
    head.add(g);
    return g;
  },
  glasses(head) {
    const g = new THREE.Group();
    const lensMat = new THREE.MeshLambertMaterial({ color: 0x66ccee, transparent: true, opacity: 0.55 });
    for (const s of [-1, 1]) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.02, 6, 12), mat(0x222222));
      rim.position.set(s * 0.16, 0.05, 0.34);
      g.add(rim);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.1, 12), lensMat);
      lens.position.set(s * 0.16, 0.05, 0.34);
      g.add(lens);
    }
    const bridge = box(0.12, 0.025, 0.025, 0x222222);
    bridge.position.set(0, 0.05, 0.34);
    g.add(bridge);
    head.add(g);
    return g;
  },
  scarf(head) {
    const g = new THREE.Group();
    const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.09, 6, 12), mat(0xc0392b));
    wrap.rotation.x = Math.PI / 2;
    g.add(wrap);
    const tail1 = box(0.14, 0.35, 0.06, 0xc0392b);
    tail1.position.set(0.12, -0.22, 0.26);
    g.add(tail1);
    g.position.y = -0.32;
    head.add(g);
    return g;
  },
};

function capMesh(head, color) {
  const g = new THREE.Group();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(color));
  g.add(dome);
  const brim = box(0.4, 0.04, 0.3, color);
  brim.position.set(0, 0.02, 0.34);
  g.add(brim);
  g.position.y = 0.2;
  head.add(g);
  return g;
}

export function createPet(type, { equipped = {} } = {}) {
  const g = new THREE.Group();
  const builder = BUILDERS[type] || BUILDERS.cat;
  const parts = builder(g);
  g.userData.head = parts.head;
  g.userData.petType = type;
  g.userData.wearables = [];

  setWearables(g, equipped);

  // walk bob + leg swing, driven from the main loop
  const baseHeadY = parts.head.position.y;
  g.userData.animate = (t, moving) => {
    const speed = moving ? 10 : 2;
    const amp = moving ? 1 : 0.25;
    parts.head.position.y = baseHeadY + Math.sin(t * speed) * 0.03 * amp;
    if (parts.legs) {
      parts.legs.forEach((leg, i) => {
        leg.rotation.x = moving ? Math.sin(t * speed + (i % 2) * Math.PI) * 0.5 : 0;
      });
    }
    if (parts.tail) parts.tail.rotation.y = Math.sin(t * 4) * 0.25;
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
