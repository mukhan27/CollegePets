// Interior locations: library (study seats), dorm common room, and the
// player's bedroom (rebuilt from saved decor choices).

import * as THREE from 'three';
import { textSprite } from './world.js';
import { PALETTE } from './palette.js';
import { toonMat, woodPlanks, stoneFloor, plaster, bookcaseTexture, glowTexture } from './textures.js';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';

// Blender-authored hero props (glTF). Loaded async, re-materialised with the
// game's toon shading (by each mesh's base/emissive colour) so they stay
// consistent with the procedural world, then dropped into `parent`.
const gltfLoader = new GLTFLoader();
function loadProp(parent, url, { x, y = 0, z, ry = 0, scale = 1 }) {
  gltfLoader.load(url, (gltf) => {
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      const src = o.material;
      const color = src && src.color ? src.color.getHex() : 0xb0a080;
      const emissive = src && src.emissive ? src.emissive.getHex() : 0;
      const opts = { noCache: true };
      if (emissive) { opts.emissive = emissive; opts.emissiveIntensity = Math.max(1, src.emissiveIntensity || 1); }
      o.material = toonMat(color, opts);
    });
    gltf.scene.position.set(x, y, z);
    gltf.scene.rotation.y = ry;
    gltf.scene.scale.setScalar(scale);
    parent.add(gltf.scene);
  }, undefined, (err) => console.warn('[prop] failed to load', url, err));
}

function mat(color) { return new THREE.MeshLambertMaterial({ color }); }
function box(w, h, d, color) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.castShadow = true;
  return m;
}

// Room shell: floor + 3 visible walls (front wall + open top so the top-down
// camera can always see inside).
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
// A grand two-level toon library: tall open atrium (no solid ceiling so the
// top-down camera can see in), floor-to-ceiling textured shelves, white
// columns, a walkable back-balcony mezzanine reached by a staircase, warm
// pendant lighting, and a cozy fireplace nook. Returns `levels` + `stairs`
// consumed by the walkable-floor movement in main.js.
export function buildLibrary() {
  const root = new THREE.Group();
  const colliders = [];   // ground floor (level 0)
  const colliders1 = [];  // mezzanine (level 1)
  const interactables = [];
  const seatPositions = [];

  const W = 70, D = 48, WALL_H = 12, MEZZ_Y = 6;
  const DECK_FRONT = -11; // z of the balcony's inner (railing) edge
  const bounds = { minX: -W / 2 + 1.5, maxX: W / 2 - 1.5, minZ: -D / 2 + 1.5, maxZ: D / 2 - 1.5 };

  // ---- shared toon materials ----
  const woodMat = toonMat(PALETTE.shelfWood, { map: woodPlanks() });
  const deckMat = toonMat(0xb88a5c, { map: woodPlanks() });
  const deskMat = toonMat(PALETTE.wood, { map: woodPlanks() });
  const railMat = toonMat(PALETTE.railWood);
  const colMat = toonMat(PALETTE.columnWhite);
  const brassMat = toonMat(PALETTE.brass);
  const beamMat = toonMat(PALETTE.libBeam);
  const bookMats = [bookcaseTexture(5), bookcaseTexture(11), bookcaseTexture(23)]
    .map((map) => toonMat(0xffffff, { map }));
  const glowTex = glowTexture('255,210,140');

  const tbox = (w, h, d, m) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
  };

  // ---- shell: stone floor, 3 tall plaster walls, open front + open top ----
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D),
    toonMat(PALETTE.libFloor, { map: stoneFloor() }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  root.add(floor);
  const wallMat = toonMat(PALETTE.libWall, { map: plaster() });
  const back = tbox(W, WALL_H, 0.6, wallMat); back.position.set(0, WALL_H / 2, -D / 2); root.add(back);
  for (const s of [-1, 1]) {
    const side = tbox(0.6, WALL_H, D, wallMat); side.position.set(s * W / 2, WALL_H / 2, 0); root.add(side);
  }

  // ---- shelf runs: book-spine textured faces on a wood backing ----
  function shelfRun(x, z, len, dir, face, y0, h) {
    const depth = 1.1, n = Math.max(1, Math.round(len / 5));
    const g = new THREE.Group();
    const backing = dir === 'x' ? tbox(len, h, depth, woodMat) : tbox(depth, h, len, woodMat);
    backing.position.y = h / 2; g.add(backing);
    for (let i = 0; i < n; i++) {
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(len / n - 0.15, h - 0.4), bookMats[i % 3]);
      if (dir === 'x') {
        pl.position.set(-len / 2 + (i + 0.5) * len / n, h / 2, face * (depth / 2 + 0.02));
        if (face < 0) pl.rotation.y = Math.PI;
      } else {
        pl.position.set(face * (depth / 2 + 0.02), h / 2, -len / 2 + (i + 0.5) * len / n);
        pl.rotation.y = face > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
      g.add(pl);
    }
    g.position.set(x, y0, z); root.add(g);
  }

  // ground perimeter shelves (back under the balcony + both sides)
  shelfRun(0, -D / 2 + 0.9, W - 4, 'x', 1, 0, 4.4);
  colliders.push({ x: 0, z: -D / 2 + 1.3, w: W - 4, d: 1.6 });
  shelfRun(-W / 2 + 0.9, 0, D - 4, 'z', 1, 0, 4.4);
  shelfRun(W / 2 - 0.9, 0, D - 4, 'z', -1, 0, 4.4);
  colliders.push({ x: -W / 2 + 1.3, z: 0, w: 1.6, d: D - 4 });
  colliders.push({ x: W / 2 - 1.3, z: 0, w: 1.6, d: D - 4 });
  // two free-standing double-sided stacks for depth
  for (const sx of [-13, 13]) {
    shelfRun(sx, -3, 9, 'z', 1, 0, 3.6);
    shelfRun(sx, -3, 9, 'z', -1, 0, 3.6);
    colliders.push({ x: sx, z: -3, w: 2.4, d: 9 });
  }
  // mezzanine upper shelves (back wall) — level 1
  shelfRun(0, -D / 2 + 0.9, W - 4, 'x', 1, MEZZ_Y, 4.0);
  colliders1.push({ x: 0, z: -D / 2 + 1.3, w: W - 4, d: 1.6 });

  // ---- columns (full height) ----
  function column(x, z, both) {
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, WALL_H, 16), colMat);
    shaft.position.y = WALL_H / 2; shaft.castShadow = true; g.add(shaft);
    const base = tbox(1.5, 0.5, 1.5, colMat); base.position.y = 0.25; g.add(base);
    const cap = tbox(1.5, 0.5, 1.5, colMat); cap.position.y = WALL_H - 0.25; g.add(cap);
    g.position.set(x, 0, z); root.add(g);
    colliders.push({ x, z, w: 1.6, d: 1.6 });
    if (both) colliders1.push({ x, z, w: 1.6, d: 1.6 });
  }
  for (const cx of [-26, -13, 0, 13]) column(cx, DECK_FRONT, true); // balcony-edge row + railing posts
  for (const cx of [-24, 24]) column(cx, 12, false);                // grand entrance pair

  // ---- mezzanine deck + railing ----
  const deckDepth = (D / 2 - 0.3) + DECK_FRONT;                     // back wall → DECK_FRONT
  const deck = tbox(W - 4, 0.6, deckDepth, deckMat);
  deck.position.set(0, MEZZ_Y - 0.3, -(D / 2 - 0.3) + deckDepth / 2);
  root.add(deck);
  function rail(x0, x1) {
    const len = x1 - x0, cx = (x0 + x1) / 2;
    const bar = tbox(len, 0.2, 0.18, railMat); bar.position.set(cx, MEZZ_Y + 0.95, DECK_FRONT); root.add(bar);
    const bar2 = tbox(len, 0.16, 0.16, railMat); bar2.position.set(cx, MEZZ_Y + 0.4, DECK_FRONT); root.add(bar2);
    const np = Math.max(1, Math.round(len / 2));
    for (let i = 0; i <= np; i++) {
      const post = tbox(0.14, 1.0, 0.14, railMat);
      post.position.set(x0 + (i / np) * len, MEZZ_Y + 0.5, DECK_FRONT); root.add(post);
    }
  }
  rail(-33, 22.5); // left of the stair mouth (stairs occupy x[24,31])

  // ---- grand staircase (right): ground (z=2,y=0) up to balcony (z=-11,y=6) ----
  const STEPS = 12, STAIR_X = 27.5;
  for (let i = 0; i < STEPS; i++) {
    const t = (i + 1) / STEPS, topY = t * MEZZ_Y;
    const z = 2 - 13 * (i + 0.5) / STEPS;
    const st = tbox(7, topY, 13 / STEPS + 0.05, deckMat);
    st.position.set(STAIR_X, topY / 2, z); root.add(st);
    const run = tbox(3, 0.08, 13 / STEPS + 0.05, toonMat(0xa6452f));
    run.position.set(STAIR_X, topY + 0.05, z); root.add(run);
  }
  colliders.push({ x: STAIR_X, z: -4.5, w: 7, d: 11 }); // side-block; ramp logic overrides for climbing
  const stairs = [{ xMin: 24, xMax: 31, zMin: DECK_FRONT, zMax: 2, zBottom: 2, zTop: DECK_FRONT, yBottom: 0, yTop: MEZZ_Y }];

  // ---- reading desks — each chair is a pomodoro seat (works on either floor) ----
  let seatNum = 1;
  function readingDesk(dx, dz, floorY, cl) {
    const y = floorY;
    const desk = tbox(4.6, 1.1, 2.4, deskMat); desk.position.set(dx, y + 0.55, dz); root.add(desk);
    const lampPost = tbox(0.3, 0.7, 0.3, brassMat); lampPost.position.set(dx + 1.5, y + 1.45, dz - 0.6); root.add(lampPost);
    const lampShade = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.3, 12),
      toonMat(0x2e6f4f, { emissive: 0x123a26 })); lampShade.position.set(dx + 1.5, y + 1.85, dz - 0.6); root.add(lampShade);
    const bookProp = tbox(0.9, 0.18, 1.2, toonMat(0xb5462f)); bookProp.position.set(dx - 1, y + 1.2, dz); bookProp.rotation.y = 0.4; root.add(bookProp);
    cl.push({ x: dx, z: dz, w: 5.0, d: 2.8 });
    const chairZ = dz + 2.3;
    const chair = tbox(1.2, 0.55, 1.2, deskMat); chair.position.set(dx, y + 0.28, chairZ); root.add(chair);
    const chairBack = tbox(1.2, 1.2, 0.18, deskMat); chairBack.position.set(dx, y + 0.95, chairZ + 0.55); root.add(chairBack);
    const seatPos = { x: dx, z: chairZ, y: floorY };
    seatPositions.push(seatPos);
    interactables.push({ id: 'study_seat', seat: seatNum++, x: dx, z: chairZ + 1.5, r: 2.0, label: '🪑 Sit & study', seatPos });
  }
  // ground floor: 2x3 grid
  for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) readingDesk(-18 + col * 18, 4 + row * 9, 0, colliders);
  // mezzanine: two reading tables on the balcony
  readingDesk(-14, -17, MEZZ_Y, colliders1);
  readingDesk(14, -17, MEZZ_Y, colliders1);

  // ---- cozy nook (front-left); the fireplace Blender prop is placed here later ----
  const rug = new THREE.Mesh(new THREE.CircleGeometry(5, 28), toonMat(PALETTE.rug));
  rug.rotation.x = -Math.PI / 2; rug.position.set(-25, 0.02, 14); root.add(rug);
  const rugBorder = new THREE.Mesh(new THREE.RingGeometry(4.3, 4.7, 28), toonMat(PALETTE.rugBorder));
  rugBorder.rotation.x = -Math.PI / 2; rugBorder.position.set(-25, 0.03, 14); root.add(rugBorder);
  function armchair(x, z, ry) {
    const g = new THREE.Group();
    const seat = tbox(1.8, 0.7, 1.8, toonMat(PALETTE.leather)); seat.position.y = 0.55; g.add(seat);
    const backr = tbox(1.8, 1.3, 0.4, toonMat(PALETTE.leather)); backr.position.set(0, 1.2, -0.7); g.add(backr);
    for (const ax of [-1, 1]) { const arm = tbox(0.35, 0.6, 1.6, toonMat(PALETTE.leather)); arm.position.set(ax * 0.9, 0.85, 0); g.add(arm); }
    g.position.set(x, 0, z); g.rotation.y = ry; root.add(g);
    colliders.push({ x, z, w: 2, d: 2 });
  }
  armchair(-27, 12, 0.5); armchair(-22, 16, -0.6);
  const lampPole = tbox(0.16, 3.2, 0.16, brassMat); lampPole.position.set(-19, 1.6, 11); root.add(lampPole);
  const floorShade = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.0, 16), toonMat(0xf3e3b8, { emissive: 0x6a5a30 }));
  floorShade.position.set(-19, 3.4, 11); root.add(floorShade);
  function plant(x, z) {
    const g = new THREE.Group();
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.4, 0.8, 12), toonMat(0xb5703f)); pot.position.y = 0.4; g.add(pot);
    const foliage = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), toonMat(0x4f8a45)); foliage.position.y = 1.4; g.add(foliage);
    g.position.set(x, 0, z); root.add(g); colliders.push({ x, z, w: 1, d: 1 });
  }
  plant(-31, 9); plant(-31, 19);
  // ---- Blender hero props (async glTF; colliders added now so gameplay is stable) ----
  const fireAnchor = { x: -32.5, z: 14 };
  colliders.push({ x: -33.6, z: 14, w: 1.6, d: 3.4 });  // fireplace (against left wall)
  colliders.push({ x: -29, z: 18.5, w: 1.4, d: 1.4 });  // globe
  colliders.push({ x: -31, z: 9.5, w: 1.2, d: 1.2 });   // gramophone
  loadProp(root, 'assets/fireplace.glb', { x: -33.7, z: 14, ry: -Math.PI / 2, scale: 1 });
  loadProp(root, 'assets/globe.glb', { x: -29, z: 18.5, ry: 0.5, scale: 1 });
  loadProp(root, 'assets/gramophone.glb', { x: -31, z: 9.5, ry: 0.8, scale: 1 });

  // ---- librarian counter (front-right) ----
  const counter = tbox(7, 1.3, 2, woodMat); counter.position.set(21, 0.65, 19); root.add(counter);
  const counterTop = tbox(7.4, 0.18, 2.4, brassMat); counterTop.position.set(21, 1.4, 19); root.add(counterTop);
  colliders.push({ x: 21, z: 19, w: 7.4, d: 2.4 });

  // ---- open rafter ceiling + pendant lamps + warm fill lights ----
  // No solid slab — it would block the shared top-down camera. Instead a raised
  // grid of rafters the pendants hang from, so the lights read as hung, not floating.
  const bbeam = tbox(W - 2, 0.5, 0.6, beamMat); bbeam.position.set(0, WALL_H - 0.5, -D / 2 + 0.5); root.add(bbeam);
  for (const s of [-1, 1]) { const sb = tbox(0.6, 0.5, D - 2, beamMat); sb.position.set(s * (W / 2 - 0.5), WALL_H - 0.5, 0); root.add(sb); }
  for (const bz of [-20, -12, -4, 4, 12, 20]) { const cb = tbox(W - 2, 0.4, 0.45, beamMat); cb.position.set(0, WALL_H - 0.55, bz); root.add(cb); }
  for (const bx of [-18, 18]) { const lb = tbox(0.45, 0.4, D - 4, beamMat); lb.position.set(bx, WALL_H - 0.7, 0); root.add(lb); }
  function pendant(x, z) {
    const rod = tbox(0.06, 4, 0.06, beamMat); rod.position.set(x, 10, z); root.add(rod);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.7, 0.8, 16), toonMat(PALETTE.pendantDark)); shade.position.set(x, 8, z); root.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), toonMat(0xfff2c8, { emissive: 0xffcf7a })); bulb.position.set(x, 7.7, z); root.add(bulb);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    spr.scale.set(3, 3, 1); spr.position.set(x, 7.7, z); root.add(spr);
  }
  for (const [px, pz] of [[-18, 4], [0, 4], [18, 4], [-18, 13], [0, 13], [18, 13]]) pendant(px, pz);
  // warm point-lights (no shadows; only lit when the library root is visible)
  function warmLight(x, y, z, intensity, dist) { const L = new THREE.PointLight(0xffd29a, intensity, dist, 2); L.position.set(x, y, z); root.add(L); }
  warmLight(0, 8, 8, 50, 44); warmLight(-18, 8, 8, 26, 30); warmLight(18, 8, 8, 26, 30);
  warmLight(-26, 4.5, 14, 34, 24);  // nook glow
  warmLight(0, 8, -14, 26, 36);     // balcony glow
  const fireGlow = new THREE.PointLight(0xff8a3c, 26, 16, 2); // fireplace
  fireGlow.position.set(-32, 1.8, 14); root.add(fireGlow);

  // ---- exit + spawn ----
  addExitPad(root, 0, D / 2 - 2);
  interactables.push({ id: 'exit_library', x: 0, z: D / 2 - 2, r: 2.4, label: '🚪 Leave Library' });
  const spawn = { x: 0, z: D / 2 - 6 };

  // The balcony is a back strip. Bounds reach to the front, but an atrium "void"
  // collider blocks everything past the deck edge except the stair mouth (x[24,31]),
  // so the player walks the deck and can only leave it down the stairs.
  const bounds1 = { minX: -32, maxX: 32, minZ: -D / 2 + 2.5, maxZ: 2 };
  colliders1.push({ x: -4.75, z: -4, w: 54.5, d: 14 }); // atrium void: x[-32,22.5], z[-11,3]
  const levels = [{ y: 0, bounds, colliders }, { y: MEZZ_Y, bounds: bounds1, colliders: colliders1 }];
  return { root, colliders, interactables, bounds, spawn, seatPositions, levels, stairs, fireAnchor };
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
