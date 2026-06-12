// Interior locations: library (study seats), dorm common room, and the
// player's bedroom (rebuilt from saved decor choices).

import * as THREE from 'three';
import { textSprite } from './world.js';

function mat(color) { return new THREE.MeshLambertMaterial({ color }); }
function box(w, h, d, color) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.castShadow = true;
  return m;
}

// Room shell: floor + 3 visible walls (front wall omitted so the tilted
// top-down camera can always see inside).
function makeRoom(w, d, { floor = 0x9a8467, wall = 0xd8cdb8 } = {}) {
  const g = new THREE.Group();
  const f = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(floor));
  f.rotation.x = -Math.PI / 2;
  f.receiveShadow = true;
  g.add(f);
  const wallH = 5;
  const back = box(w, wallH, 0.4, wall);
  back.position.set(0, wallH / 2, -d / 2);
  g.add(back);
  for (const s of [-1, 1]) {
    const side = box(0.4, wallH, d, wall);
    side.position.set(s * w / 2, wallH / 2, 0);
    g.add(side);
  }
  return g;
}

function exitMat() {
  return new THREE.MeshLambertMaterial({ color: 0x6ee7a0, emissive: 0x1d5c38 });
}

function addExitPad(g, x, z) {
  const pad = new THREE.Mesh(new THREE.CircleGeometry(1.2, 16), exitMat());
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(x, 0.03, z);
  g.add(pad);
  const sign = textSprite('EXIT', { size: 22 });
  sign.position.set(x, 2.2, z);
  g.add(sign);
}

// ----------------------------------------------------------- library
export function buildLibrary() {
  const root = new THREE.Group();
  const colliders = [];
  const interactables = [];
  const W = 42, D = 30;
  const bounds = { minX: -W / 2 + 1, maxX: W / 2 - 1, minZ: -D / 2 + 1, maxZ: D / 2 - 1 };
  root.add(makeRoom(W, D, { floor: 0x8a6f50, wall: 0xcdbfa4 }));

  // bookshelves along back wall
  const shelfColors = [0xa33b3b, 0x3b6ea3, 0x3ba35e, 0xc9a13b, 0x8a4ba3];
  for (let i = 0; i < 6; i++) {
    const shelf = box(5, 3.4, 1.2, 0x5b3c25);
    const sx = -W / 2 + 4.5 + i * 6.5;
    shelf.position.set(sx, 1.7, -D / 2 + 1.2);
    root.add(shelf);
    for (let b = 0; b < 8; b++) {
      const bk = box(0.45, 0.9, 0.3, shelfColors[(i + b) % shelfColors.length]);
      bk.position.set(sx - 2 + b * 0.58, 2.2 + (b % 2) * 0.9 - 0.45, -D / 2 + 1.9);
      root.add(bk);
    }
    colliders.push({ x: sx, z: -D / 2 + 1.2, w: 5.2, d: 1.6 });
  }

  // study desks with chairs — each chair is a pomodoro seat
  const seatPositions = [];
  let seatNum = 1;
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) {
      const dx = -13 + col * 13;
      const dz = -4 + row * 9;
      const desk = box(4.4, 1.1, 2.2, 0x9a6a3f);
      desk.position.set(dx, 0.55, dz);
      root.add(desk);
      const lamp = box(0.3, 0.7, 0.3, 0x2e8b57);
      lamp.position.set(dx + 1.4, 1.45, dz - 0.5);
      root.add(lamp);
      const bookProp = box(0.8, 0.18, 1.1, 0xd64541);
      bookProp.position.set(dx - 1, 1.2, dz);
      bookProp.rotation.y = 0.4;
      root.add(bookProp);
      colliders.push({ x: dx, z: dz, w: 4.8, d: 2.6 });

      const chairZ = dz + 2.2;
      const chair = box(1.1, 0.55, 1.1, 0x7a5230);
      chair.position.set(dx, 0.28, chairZ);
      root.add(chair);
      const chairBack = box(1.1, 1.1, 0.18, 0x7a5230);
      chairBack.position.set(dx, 0.95, chairZ + 0.5);
      root.add(chairBack);

      seatPositions.push({ x: dx, z: chairZ });
      interactables.push({
        id: 'study_seat', seat: seatNum++,
        x: dx, z: chairZ + 1.4, r: 2.0,
        label: '🪑 Sit & study',
        seatPos: { x: dx, z: chairZ },
      });
    }
  }

  // librarian counter
  const counter = box(6, 1.3, 2, 0x6e5436);
  counter.position.set(14, 0.65, 10);
  root.add(counter);
  colliders.push({ x: 14, z: 10, w: 6.4, d: 2.4 });

  addExitPad(root, 0, D / 2 - 2);
  interactables.push({ id: 'exit_library', x: 0, z: D / 2 - 2, r: 2.2, label: '🚪 Leave Library' });

  const spawn = { x: 0, z: D / 2 - 4 };
  return { root, colliders, interactables, bounds, spawn, seatPositions };
}

// ----------------------------------------------------- dorm common room
export function buildDormCommon() {
  const root = new THREE.Group();
  const colliders = [];
  const interactables = [];
  const W = 30, D = 22;
  const bounds = { minX: -W / 2 + 1, maxX: W / 2 - 1, minZ: -D / 2 + 1, maxZ: D / 2 - 1 };
  root.add(makeRoom(W, D, { floor: 0xb09a78, wall: 0xc9b9d8 }));

  // big rug
  const rug = new THREE.Mesh(new THREE.CircleGeometry(4.5, 24), mat(0x7b5ea3));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(-4, 0.02, 0);
  root.add(rug);

  // couch + TV
  const couch = box(6, 1.2, 2, 0x4466aa);
  couch.position.set(-4, 0.6, 3);
  root.add(couch);
  const couchBack = box(6, 1.2, 0.5, 0x3a5a96);
  couchBack.position.set(-4, 1.3, 4);
  root.add(couchBack);
  colliders.push({ x: -4, z: 3.4, w: 6.4, d: 3 });
  const tvStand = box(4, 0.8, 1, 0x5b3c25);
  tvStand.position.set(-4, 0.4, -4);
  root.add(tvStand);
  const tv = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2, 0.2),
    new THREE.MeshLambertMaterial({ color: 0x111820, emissive: 0x21424e }));
  tv.position.set(-4, 2, -4);
  root.add(tv);
  colliders.push({ x: -4, z: -4, w: 4.4, d: 1.4 });

  // ping-pong-ish table (flavor)
  const table = box(5, 1, 2.8, 0x2e8b57);
  table.position.set(8, 0.5, -3);
  root.add(table);
  colliders.push({ x: 8, z: -3, w: 5.4, d: 3.2 });

  // vending machine
  const vending = new THREE.Mesh(new THREE.BoxGeometry(1.6, 3.2, 1.2),
    new THREE.MeshLambertMaterial({ color: 0xc0392b, emissive: 0x3e1210 }));
  vending.position.set(13.5, 1.6, 6);
  root.add(vending);
  colliders.push({ x: 13.5, z: 6, w: 2, d: 1.6 });
  interactables.push({ id: 'vending', x: 12, z: 6, r: 2.2, label: '🥤 Vending machine' });

  // door to bedroom (back wall, glowing pad)
  const bedroomPad = new THREE.Mesh(new THREE.CircleGeometry(1.2, 16),
    new THREE.MeshLambertMaterial({ color: 0xffd166, emissive: 0x6e5a1d }));
  bedroomPad.rotation.x = -Math.PI / 2;
  bedroomPad.position.set(8, 0.03, -9);
  root.add(bedroomPad);
  const bedroomSign = textSprite('MY ROOM', { size: 22 });
  bedroomSign.position.set(8, 2.2, -9);
  root.add(bedroomSign);
  interactables.push({ id: 'enter_bedroom', x: 8, z: -9, r: 2.2, label: '🛏️ My Room' });

  addExitPad(root, -10, D / 2 - 2);
  interactables.push({ id: 'exit_dorm', x: -10, z: D / 2 - 2, r: 2.2, label: '🚪 Leave Dorm' });

  const spawn = { x: -10, z: D / 2 - 4 };
  return { root, colliders, interactables, bounds, spawn };
}

// ------------------------------------------------------------ bedroom
const BED_COLORS = {
  bed_red: 0xc0392b, bed_blue: 0x3a6ea8, bed_pink: 0xe75480, bed_green: 0x2e8b57,
};

export function buildBedroom() {
  const root = new THREE.Group();
  const colliders = [];
  const interactables = [];
  const W = 18, D = 14;
  const bounds = { minX: -W / 2 + 1, maxX: W / 2 - 1, minZ: -D / 2 + 1, maxZ: D / 2 - 1 };
  root.add(makeRoom(W, D, { floor: 0xb09a78, wall: 0xa8c8d8 }));

  const decorGroup = new THREE.Group();
  root.add(decorGroup);

  // fixed furniture: bed frame + desk (always present)
  const bedFrame = box(3, 0.5, 4.6, 0x5b3c25);
  bedFrame.position.set(-6.2, 0.25, -4.2);
  root.add(bedFrame);
  colliders.push({ x: -6.2, z: -4.2, w: 3.4, d: 5 });

  const desk = box(3.6, 1.1, 1.6, 0x9a6a3f);
  desk.position.set(5.5, 0.55, -5.6);
  root.add(desk);
  const laptop = box(1.1, 0.08, 0.8, 0xaab4be);
  laptop.position.set(5.5, 1.18, -5.6);
  root.add(laptop);
  const laptopScreen = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.06),
    new THREE.MeshLambertMaterial({ color: 0x222a33, emissive: 0x2a5666 }));
  laptopScreen.position.set(5.5, 1.5, -6);
  root.add(laptopScreen);
  colliders.push({ x: 5.5, z: -5.6, w: 4, d: 2 });

  // decorate pad
  const pad = new THREE.Mesh(new THREE.CircleGeometry(1.1, 16),
    new THREE.MeshLambertMaterial({ color: 0xe75480, emissive: 0x5c1d33 }));
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(0, 0.03, -1);
  root.add(pad);
  interactables.push({ id: 'decorate', x: 0, z: -1, r: 2.2, label: '🎨 Decorate room' });

  addExitPad(root, 0, D / 2 - 1.8);
  interactables.push({ id: 'exit_bedroom', x: 0, z: D / 2 - 1.8, r: 2, label: '🚪 Back to common room' });

  // Rebuild swappable decor from saved choices.
  function rebuildDecor(room) {
    decorGroup.clear();

    // bedding
    const bedColor = BED_COLORS[room.bed] || BED_COLORS.bed_red;
    const mattress = box(2.8, 0.5, 4.4, 0xf0ead8);
    mattress.position.set(-6.2, 0.7, -4.2);
    decorGroup.add(mattress);
    const blanket = box(2.85, 0.3, 2.9, bedColor);
    blanket.position.set(-6.2, 0.85, -3.4);
    decorGroup.add(blanket);
    const pillow = box(1.6, 0.35, 1, 0xffffff);
    pillow.position.set(-6.2, 1.05, -5.8);
    decorGroup.add(pillow);

    if (room.rug) {
      const rugColor = room.rug === 'rug_pink' ? 0xe75480 : 0x3a6ea8;
      const rug = new THREE.Mesh(new THREE.CircleGeometry(2.6, 24), mat(rugColor));
      rug.rotation.x = -Math.PI / 2;
      rug.position.set(0, 0.02, 2);
      decorGroup.add(rug);
    }
    if (room.poster) {
      const emoji = room.poster === 'poster_band' ? '🎸 ROCK ON' : '📈 GRIND TIME';
      const poster = box(2.4, 1.7, 0.06, room.poster === 'poster_band' ? 0x222233 : 0xf2e8c8);
      poster.position.set(0, 3, -D / 2 + 0.26);
      decorGroup.add(poster);
      const label = textSprite(emoji, { size: 20, bg: null, color: room.poster === 'poster_band' ? '#ffd166' : '#2c3e50' });
      label.position.set(0, 3, -D / 2 + 0.4);
      decorGroup.add(label);
    }
    if (room.plant) {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.3, 0.6, 8), mat(0xc0633e));
      pot.position.set(-7.5, 0.3, 4.5);
      decorGroup.add(pot);
      const leaves = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), mat(0x3f7d3a));
      leaves.position.set(-7.5, 1.1, 4.5);
      decorGroup.add(leaves);
    }
    if (room.lamp) {
      const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 0.2, 8), mat(0x444444));
      lampBase.position.set(7.4, 0.1, -5.6);
      decorGroup.add(lampBase);
      const lava = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.1, 8),
        new THREE.MeshLambertMaterial({ color: 0xe75480, emissive: 0x7d2244, transparent: true, opacity: 0.85 }));
      lava.position.set(7.4, 0.75, -5.6);
      decorGroup.add(lava);
    }
    if (room.beanbag) {
      const bag = new THREE.Mesh(new THREE.SphereGeometry(1.1, 10, 8), mat(0xd4a93e));
      bag.scale.y = 0.6;
      bag.position.set(5, 0.55, 3.5);
      decorGroup.add(bag);
    }
  }

  const spawn = { x: 0, z: D / 2 - 3.4 };
  return { root, colliders, interactables, bounds, spawn, rebuildDecor };
}
