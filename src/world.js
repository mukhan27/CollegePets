// Outdoor campus scene: ground, paths, buildings with labeled signs,
// trees, fountain, basketball court. Exports colliders + interactable zones.

import * as THREE from 'three';

function mat(color) { return new THREE.MeshLambertMaterial({ color }); }

export function textSprite(text, { size = 28, color = '#ffffff', bg = 'rgba(20,32,44,0.75)' } = {}) {
  const pad = 14;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = `bold ${size}px Trebuchet MS, sans-serif`;
  canvas.width = Math.ceil(ctx.measureText(text).width) + pad * 2;
  canvas.height = size + pad * 1.4;
  const c2 = canvas.getContext('2d');
  c2.font = `bold ${size}px Trebuchet MS, sans-serif`;
  if (bg) {
    c2.fillStyle = bg;
    c2.beginPath();
    c2.roundRect(0, 0, canvas.width, canvas.height, 12);
    c2.fill();
  }
  c2.fillStyle = color;
  c2.textAlign = 'center';
  c2.textBaseline = 'middle';
  c2.fillText(text, canvas.width / 2, canvas.height / 2);
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  const scale = 0.022;
  sprite.scale.set(canvas.width * scale, canvas.height * scale, 1);
  return sprite;
}

function makeTree(x, z, scale = 1) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 2.2, 6), mat(0x7a5230));
  trunk.position.y = 1.1;
  g.add(trunk);
  const tones = [0x3f7d3a, 0x4d934a, 0x356b32];
  for (let i = 0; i < 3; i++) {
    const blob = new THREE.Mesh(new THREE.SphereGeometry(1.3 - i * 0.25, 8, 6), mat(tones[i]));
    blob.position.set((i - 1) * 0.5, 2.6 + i * 0.7, (i % 2) * 0.4 - 0.2);
    blob.castShadow = true;
    g.add(blob);
  }
  g.position.set(x, 0, z);
  g.scale.setScalar(scale);
  return g;
}

function makeLamp(x, z) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 4, 6), mat(0x333a42));
  pole.position.y = 2;
  g.add(pole);
  const lampHead = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6),
    new THREE.MeshLambertMaterial({ color: 0xfff2c0, emissive: 0xb09c50 }));
  lampHead.position.y = 4.1;
  g.add(lampHead);
  g.position.set(x, 0, z);
  return g;
}

function makeBench(x, z, rotY = 0) {
  const g = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.15, 0.7), mat(0x9a6a3f));
  seat.position.y = 0.55;
  g.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6, 0.12), mat(0x9a6a3f));
  back.position.set(0, 0.95, -0.3);
  g.add(back);
  for (const s of [-1, 1]) {
    const legM = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.6), mat(0x4a4a4a));
    legM.position.set(s * 0.9, 0.27, 0);
    g.add(legM);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

// Building: box + roof + door (door always on the side facing the quad, +Z or given).
function makeBuilding({ x, z, w, h, d, color, roofColor = 0x8a4b3a, label, doorSide = 'front' }) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  body.position.y = h / 2;
  body.castShadow = true;
  g.add(body);

  const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.72, h * 0.45, 4), mat(roofColor));
  roof.position.y = h + h * 0.22;
  roof.rotation.y = Math.PI / 4;
  g.add(roof);

  // windows on front face
  const winMat = new THREE.MeshLambertMaterial({ color: 0xbfe3f2, emissive: 0x44606e });
  const cols = Math.max(2, Math.floor(w / 4));
  for (let i = 0; i < cols; i++) {
    for (let row = 0; row < 2; row++) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.6), winMat);
      win.position.set(-w / 2 + (i + 0.5) * (w / cols), h * 0.45 + row * (h * 0.3), d / 2 + 0.02);
      g.add(win);
    }
  }

  // door (front, +Z)
  const door = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 3.2), mat(0x5b3c25));
  door.position.set(0, 1.6, d / 2 + 0.03);
  g.add(door);

  const sign = textSprite(label);
  sign.position.set(0, h + h * 0.55, 0);
  g.add(sign);

  g.position.set(x, 0, z);

  const doorWorld = new THREE.Vector3(x, 0, z + d / 2 + 1.6);
  const collider = { x, z, w: w + 0.6, d: d + 0.6 };
  return { group: g, doorWorld, collider };
}

export function buildCampus() {
  const root = new THREE.Group();
  const colliders = [];
  const interactables = [];
  const bounds = { minX: -95, maxX: 95, minZ: -68, maxZ: 68 };

  // ground
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(220, 160), mat(0x6aa84f));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  root.add(ground);

  // paths: cross through quad + ring
  const pathMat = mat(0xcfc5ae);
  const mkPath = (w, d, x, z) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), pathMat);
    p.rotation.x = -Math.PI / 2;
    p.position.set(x, 0.02, z);
    root.add(p);
  };
  mkPath(190, 7, 0, 0);
  mkPath(7, 130, 0, 0);
  mkPath(7, 130, -55, 0);
  mkPath(7, 130, 55, 0);
  mkPath(190, 7, 0, -42);
  mkPath(190, 7, 0, 42);

  // central fountain
  const fountain = new THREE.Group();
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(4, 4.4, 1, 16), mat(0xb9b2a4));
  basin.position.y = 0.5;
  fountain.add(basin);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 0.3, 16),
    new THREE.MeshLambertMaterial({ color: 0x5fb7d4, emissive: 0x1d4a5c }));
  water.position.y = 1.0;
  fountain.add(water);
  const jet = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.4, 8),
    new THREE.MeshLambertMaterial({ color: 0xa8dcef, transparent: true, opacity: 0.8 }));
  jet.position.y = 2.2;
  fountain.add(jet);
  root.add(fountain);
  colliders.push({ x: 0, z: 0, w: 9, d: 9 });

  // ---- buildings ----
  const buildings = [
    { id: 'library', x: -55, z: -32, w: 26, h: 11, d: 16, color: 0xb89a6a, label: '📚 Library',
      prompt: '📚 Enter Library', roofColor: 0x6e5436 },
    { id: 'dorm', x: 55, z: -32, w: 24, h: 13, d: 15, color: 0xc97b63, label: '🏠 Maple Dorm',
      prompt: '🏠 Enter Dorm' },
    { id: 'shop', x: -55, z: 28, w: 18, h: 8, d: 12, color: 0x7ba3c9, label: '🛍️ Campus Store',
      prompt: '🛍️ Shop', roofColor: 0x3e5a78 },
    { id: 'gym', x: 62, z: 28, w: 22, h: 10, d: 14, color: 0x9aa5ae, label: '🏀 Rec Gym',
      prompt: null, roofColor: 0x4f5a63 },
    { id: 'studentcenter', x: 0, z: -56, w: 30, h: 9, d: 13, color: 0xd4a93e, label: '🎉 Student Center',
      prompt: '🥤 Play Soda Pong', roofColor: 0x8a6c1d },
    { id: 'lecture', x: -20, z: 56, w: 26, h: 12, d: 13, color: 0xa9897a, label: '🏛️ Hawthorne Hall',
      prompt: null, roofColor: 0x5e463c },
    { id: 'cafeteria', x: 24, z: 56, w: 20, h: 8, d: 12, color: 0xc9b27b, label: '🍕 Dining Hall',
      prompt: '🍕 Grab a snack', roofColor: 0x7d6a3e },
  ];

  const doors = {};
  for (const b of buildings) {
    const built = makeBuilding(b);
    root.add(built.group);
    colliders.push(built.collider);
    doors[b.id] = built.doorWorld;
    if (b.prompt) {
      interactables.push({
        id: b.id,
        x: built.doorWorld.x, z: built.doorWorld.z, r: 3.2,
        label: b.prompt,
      });
    }
  }

  // ---- basketball court next to gym ----
  const court = new THREE.Mesh(new THREE.PlaneGeometry(16, 10), mat(0xc77f4f));
  court.rotation.x = -Math.PI / 2;
  court.position.set(36, 0.03, 28);
  root.add(court);
  const lineMat = mat(0xf5f0e0);
  const centerLine = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 10), lineMat);
  centerLine.rotation.x = -Math.PI / 2;
  centerLine.position.set(36, 0.04, 28);
  root.add(centerLine);
  // hoop
  const hoop = new THREE.Group();
  const hpole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4.2, 6), mat(0x444c55));
  hpole.position.y = 2.1;
  hoop.add(hpole);
  const backboard = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 0.1), mat(0xf0f0f0));
  backboard.position.set(0, 4.2, 0.2);
  hoop.add(backboard);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.05, 6, 14), mat(0xd64541));
  rim.rotation.x = Math.PI / 2;
  rim.position.set(0, 3.7, 0.7);
  hoop.add(rim);
  hoop.position.set(43.3, 0, 28);
  hoop.rotation.y = Math.PI / 2;
  root.add(hoop);
  colliders.push({ x: 43.3, z: 28, w: 1, d: 1 });
  interactables.push({ id: 'basketball', x: 38, z: 28, r: 3.5, label: '🏀 Shoot hoops' });

  // ---- trees, lamps, benches ----
  const treeSpots = [
    [-80, -55], [-30, -18], [30, -18], [80, -55], [-80, 55], [80, 55],
    [-30, 18], [30, 18], [-85, 0], [85, 0], [-12, -25], [12, -25],
    [-70, -10], [70, -10], [-40, 60], [50, 12], [10, 30], [-15, 33],
  ];
  for (const [tx, tz] of treeSpots) {
    root.add(makeTree(tx, tz, 0.8 + ((tx * 7 + tz * 13) % 10) / 18));
    colliders.push({ x: tx, z: tz, w: 1.2, d: 1.2 });
  }
  for (const [lx, lz] of [[-10, -8], [10, 8], [-28, 42], [28, -42], [60, 0], [-60, 0]]) {
    root.add(makeLamp(lx, lz));
    colliders.push({ x: lx, z: lz, w: 0.6, d: 0.6 });
  }
  root.add(makeBench(-8, 8, Math.PI));
  root.add(makeBench(8, -8, 0));
  colliders.push({ x: -8, z: 8, w: 2.4, d: 1 }, { x: 8, z: -8, w: 2.4, d: 1 });

  return { root, colliders, interactables, bounds, doors };
}
