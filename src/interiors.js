// Interior locations: library (study seats), dorm common room, and the
// player's bedroom (rebuilt from saved decor choices).

import * as THREE from 'three';
import { textSprite } from './world.js';
import { PALETTE } from './palette.js';
import { toonMat, woodPlanks, plaster, bookcaseTexture, glowTexture, softShadow, hardwoodFloor, fabricTexture, rugTexture } from './textures.js';
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
      if (emissive) { opts.emissive = emissive; opts.emissiveIntensity = 0.45; } // gentle glow, not a blowout
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
  const flames = [];      // animated fireplace tongues (driven by `animate`)

  // Walls rise to the full column height so the columns never poke up above the
  // wall line (which looked wrong) and the wall tops stay above the camera frame.
  const W = 70, D = 48, WALL_H = 20, MEZZ_Y = 6;
  const DECK_FRONT = -11; // z of the balcony's inner (railing) edge
  const bounds = { minX: -W / 2 + 1.5, maxX: W / 2 - 1.5, minZ: -D / 2 + 1.5, maxZ: D / 2 - 1.5 };

  // ---- shared toon materials ----
  const woodMat = toonMat(PALETTE.shelfWood, { map: woodPlanks() });
  const deckMat = toonMat(0xb88a5c, { map: woodPlanks() });
  const deskMat = toonMat(PALETTE.wood, { map: woodPlanks() });
  const railMat = toonMat(PALETTE.railWood);
  // warm ivory (not pure white) so the tall columns read cozy and don't clip to
  // a blown-out white under the warm lamps
  const colMat = toonMat(0xe7d8bd);
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
  // small mesh helpers (used by furniture + props throughout)
  const cyl = (rt, rb, h, n, m) => { const me = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, n), m); me.castShadow = true; return me; };
  const sph = (r, m) => { const me = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), m); me.castShadow = true; return me; };
  // a lathe-turned tapered leg with a knob + foot, base sitting at `baseY`
  function turnedLeg(x, baseY, z, h, m) {
    const g = new THREE.Group();
    const shaft = cyl(0.09, 0.13, h, 10, m); shaft.position.y = h / 2; g.add(shaft);
    const knob = cyl(0.15, 0.15, 0.13, 10, m); knob.position.y = h * 0.6; g.add(knob);
    const foot = cyl(0.1, 0.07, 0.12, 10, m); foot.position.y = 0.06; g.add(foot);
    g.position.set(x, baseY, z); return g;
  }
  // classic green banker's lamp: brass base + stem, a horizontal green shade
  // with brass end-rims, and a warm glowing underside (its top surface sits on
  // the desk at world height `y`)
  const lampGreenMat = toonMat(0x1d6b43);
  const lampGlowMat = toonMat(0xf6e6bd, { emissive: 0xe9c98a, emissiveIntensity: 0.32 });
  function bankerLamp(x, y, z) {
    const g = new THREE.Group();
    const base = cyl(0.24, 0.28, 0.07, 16, brassMat); base.position.y = 0.035; g.add(base);
    const stem = cyl(0.045, 0.06, 0.52, 8, brassMat); stem.position.y = 0.32; g.add(stem);
    const shade = cyl(0.21, 0.21, 0.95, 18, lampGreenMat); shade.rotation.z = Math.PI / 2; shade.position.y = 0.64; g.add(shade);
    for (const ex of [-0.49, 0.49]) { const rim = cyl(0.215, 0.215, 0.04, 18, brassMat); rim.rotation.z = Math.PI / 2; rim.position.set(ex, 0.64, 0); g.add(rim); }
    const glow = tbox(0.82, 0.05, 0.3, lampGlowMat); glow.position.y = 0.5; g.add(glow);
    g.position.set(x, y, z); root.add(g);
  }

  // ---- shell: warm hardwood floor, 3 tall plaster walls, open front + open top ----
  // Neutral tint over the (now cooler) oak texture so the warm lights warm it
  // up to a natural honey-oak rather than pushing it red.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D),
    toonMat(0xb9ac96, { map: hardwoodFloor() }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  root.add(floor);
  const wallMat = toonMat(0xddc9a4, { map: plaster() }); // warm tan plaster (cozier than cream)
  const back = tbox(W, WALL_H, 0.6, wallMat); back.position.set(0, WALL_H / 2, -D / 2); root.add(back);
  for (const s of [-1, 1]) {
    const side = tbox(0.6, WALL_H, D, wallMat); side.position.set(s * W / 2, WALL_H / 2, 0); root.add(side);
  }

  // soft contact-shadow decal (fake AO) to ground objects on the floor/deck
  const shadowMat = new THREE.MeshBasicMaterial({ map: softShadow(), transparent: true, depthWrite: false });
  function groundShadow(x, z, sx, sz = sx, y = 0.02) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), shadowMat);
    d.rotation.x = -Math.PI / 2; d.position.set(x, y, z); root.add(d);
  }

  // ---- tall arched windows high on the side walls (daylight + character) ----
  // warm golden-hour glass (was a cool blue that gave a harsh daylight cast)
  const glassMat = new THREE.MeshToonMaterial({ color: 0xf4e7c6, emissive: 0xe7c382, emissiveIntensity: 0.5 });
  function archedWindow(wallX, z, ry) {
    const g = new THREE.Group();
    // tall windows that climb the upper wall (above the shelves) so the raised
    // 20-tall walls read as grand library glazing instead of blank plaster
    const w = 3.4, yBot = 4.6, yTop = 14.5, midY = (yBot + yTop) / 2, hh = yTop - yBot;
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), glassMat); pane.position.y = midY; g.add(pane);
    const arch = new THREE.Mesh(new THREE.CircleGeometry(w / 2, 18, 0, Math.PI), glassMat); arch.position.y = yTop; g.add(arch);
    // wood frame + muntins
    const fr = (gw, gh, gy) => { const b = tbox(gw, gh, 0.18, railMat); b.position.set(0, gy, -0.05); g.add(b); };
    fr(w + 0.5, 0.3, yBot - 0.15); fr(0.18, hh + w / 2 + 0.3, midY + w / 4);
    for (const f of [0.25, 0.5, 0.75]) { const m = tbox(w, 0.12, 0.16, railMat); m.position.set(0, yBot + hh * f, 0.02); g.add(m); }
    g.position.set(wallX, 0, z); g.rotation.y = ry; root.add(g);
  }
  for (const z of [-16, -2, 12]) {
    archedWindow(-W / 2 + 0.4, z, Math.PI / 2);   // left wall, faces +x
    archedWindow(W / 2 - 0.4, z, -Math.PI / 2);    // right wall, faces -x
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
  // left wall: split into two runs leaving a gap (z[10,18]) for the fireplace nook
  shelfRun(-W / 2 + 0.9, -6, 32, 'z', 1, 0, 4.4);
  shelfRun(-W / 2 + 0.9, 20, 4, 'z', 1, 0, 4.4);
  shelfRun(W / 2 - 0.9, 0, D - 4, 'z', -1, 0, 4.4);
  colliders.push({ x: -W / 2 + 1.3, z: 0, w: 1.6, d: D - 4 });
  colliders.push({ x: W / 2 - 1.3, z: 0, w: 1.6, d: D - 4 });
  groundShadow(0, -D / 2 + 1.3, W - 2, 3.2);
  groundShadow(-W / 2 + 1.3, 0, 3.2, D - 2);
  groundShadow(W / 2 - 1.3, 0, 3.2, D - 2);
  // two free-standing double-sided stacks for depth
  for (const sx of [-13, 13]) {
    shelfRun(sx, -3, 9, 'z', 1, 0, 3.6);
    shelfRun(sx, -3, 9, 'z', -1, 0, 3.6);
    groundShadow(sx, -3, 3.4, 10);
    colliders.push({ x: sx, z: -3, w: 2.4, d: 9 });
  }
  // mezzanine upper shelves (back wall) — level 1
  shelfRun(0, -D / 2 + 0.9, W - 4, 'x', 1, MEZZ_Y, 4.0);
  colliders1.push({ x: 0, z: -D / 2 + 1.3, w: W - 4, d: 1.6 });

  // ---- columns ----
  // Columns rise to COL_H (well above the 12-tall walls) so their caps climb out
  // of the top of frame and fade into the dark open atrium — the player only ever
  // sees smooth shafts, never a flat capped top.
  const COL_H = WALL_H;
  function column(x, z, both, h = COL_H) {
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, h, 16), colMat);
    shaft.position.y = h / 2; shaft.castShadow = true; g.add(shaft);
    const base = tbox(1.5, 0.5, 1.5, colMat); base.position.y = 0.25; g.add(base);
    const cap = tbox(1.5, 0.5, 1.5, colMat); cap.position.y = h - 0.25; g.add(cap);
    g.position.set(x, 0, z); root.add(g);
    groundShadow(x, z, 3.2, 3.2);
    colliders.push({ x, z, w: 1.6, d: 1.6 });
    if (both) colliders1.push({ x, z, w: 1.6, d: 1.6 });
  }
  // balcony-edge colonnade — full height so the ground-floor view never catches
  // their tops (they pass up through the deck and read as columns on the mezzanine)
  for (const cx of [-26, -13, 0, 13]) column(cx, DECK_FRONT, true);
  for (const cx of [-24, 24]) column(cx, 12, false); // grand entrance pair

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

  // ---- seating + desks — each chair is a pomodoro study seat ----
  let seatNum = 1;
  // A proper little chair (seat + four turned legs + a slatted, round-railed
  // back) that registers itself as a study seat facing `face`.
  function addSeat(x, z, floorY, face) {
    const fx = Math.sin(face), fz = Math.cos(face);
    const m = deskMat;
    const seat = tbox(1.1, 0.16, 1.1, m); seat.position.set(x, floorY + 0.5, z); root.add(seat);
    for (const sx of [-0.45, 0.45]) for (const sz of [-0.45, 0.45]) {
      const leg = cyl(0.06, 0.06, 0.5, 8, m); leg.position.set(x + sx, floorY + 0.25, z + sz); root.add(leg);
    }
    const back = new THREE.Group();
    const panel = tbox(1.1, 0.62, 0.08, m); panel.position.y = floorY + 0.92; back.add(panel);
    const rail = cyl(0.07, 0.07, 1.1, 10, m); rail.rotation.z = Math.PI / 2; rail.position.y = floorY + 1.26; back.add(rail);
    back.position.set(x - fx * 0.5, 0, z - fz * 0.5); back.rotation.y = face; root.add(back);
    seatPositions.push({ x, z, y: floorY });
    interactables.push({
      id: 'study_seat', seat: seatNum++,
      x: x - fx * 1.5, z: z - fz * 1.5, r: 2.0, // approach pad on the open side
      label: '🪑 Sit & study', seatPos: { x, z, y: floorY }, face,
      stepBack: { x: x - fx * 1.6, z: z - fz * 1.6 },
    });
  }

  // A communal long table: planked top with a bull-nose lip, an inset apron,
  // six lathe-turned legs joined by a stretcher, green banker's lamps + books,
  // and three chairs down each side.
  function longTable(cx, cz, floorY, cl) {
    const len = 16, w = 3, y = floorY;
    const top = tbox(len, 0.18, w, deskMat); top.position.set(cx, y + 1.0, cz); root.add(top);
    const lip = tbox(len + 0.3, 0.08, w + 0.3, deskMat); lip.position.set(cx, y + 0.92, cz); root.add(lip);
    for (const zz of [w / 2 - 0.25, -(w / 2 - 0.25)]) { const a = tbox(len - 1.4, 0.3, 0.12, deskMat); a.position.set(cx, y + 0.74, cz + zz); root.add(a); }
    for (const xx of [len / 2 - 0.6, -(len / 2 - 0.6)]) { const a = tbox(0.12, 0.3, w - 0.6, deskMat); a.position.set(cx + xx, y + 0.74, cz); root.add(a); }
    for (const lx of [-(len / 2 - 0.7), 0, len / 2 - 0.7]) for (const lz of [-(w / 2 - 0.45), w / 2 - 0.45]) root.add(turnedLeg(cx + lx, y, cz + lz, 0.84, deskMat));
    const stretch = tbox(len - 1.6, 0.13, 0.16, deskMat); stretch.position.set(cx, y + 0.32, cz); root.add(stretch);
    groundShadow(cx, cz, len + 3, 6.5, y + 0.02);
    [-5.5, 5.5].forEach((ox) => bankerLamp(cx + ox, y + 1.09, cz));
    const bookCols = [0xb5462f, 0x3a6f9a, 0x4f8a45];
    [-4, 1, 5].forEach((ox, i) => { const book = tbox(0.9, 0.18, 1.2, toonMat(bookCols[i % 3])); book.position.set(cx + ox, y + 1.18, cz + (i % 2 ? 0.6 : -0.6)); book.rotation.y = 0.4; root.add(book); });
    cl.push({ x: cx, z: cz, w: len + 0.4, d: w });
    for (const ox of [-5.5, 0, 5.5]) { addSeat(cx + ox, cz + 2.6, floorY, Math.PI); addSeat(cx + ox, cz - 2.6, floorY, 0); }
  }

  // An antique pine writing desk: planked top with a lip, two knobbed drawers
  // either side of a kneehole, and turned legs. `carrel` adds privacy side
  // panels + a back hutch with little books → an individual study compartment.
  function writingDesk(dx, dz, floorY, cl, carrel = false) {
    const y = floorY, zf = dz + 1.0;
    const top = tbox(4.4, 0.16, 2.2, deskMat); top.position.set(dx, y + 1.0, dz); root.add(top);
    const lip = tbox(4.6, 0.07, 2.35, deskMat); lip.position.set(dx, y + 0.93, dz); root.add(lip);
    for (const sxn of [-1, 1]) {
      const drawer = tbox(1.3, 0.52, 0.12, deskMat); drawer.position.set(dx + sxn * 1.35, y + 0.66, zf); root.add(drawer);
      const seam = tbox(1.15, 0.02, 0.14, toonMat(0x6e4a24)); seam.position.set(dx + sxn * 1.35, y + 0.66, zf + 0.005); root.add(seam);
      for (const dyv of [0.78, 0.54]) { const knob = sph(0.07, brassMat); knob.position.set(dx + sxn * 1.35, y + dyv, zf + 0.12); root.add(knob); }
    }
    const apB = tbox(4.4, 0.4, 0.12, deskMat); apB.position.set(dx, y + 0.74, dz - 1.0); root.add(apB);
    for (const xx of [2.0, -2.0]) { const a = tbox(0.12, 0.4, 2.0, deskMat); a.position.set(dx + xx, y + 0.74, dz); root.add(a); }
    for (const lx of [-2.0, 2.0]) for (const lz of [-0.95, 0.95]) root.add(turnedLeg(dx + lx, y, dz + lz, 0.84, deskMat));
    bankerLamp(dx + 1.4, y + 1.09, dz - 0.5);
    const bk = tbox(0.85, 0.16, 1.1, toonMat(0x46532f)); bk.position.set(dx - 1.3, y + 1.16, dz - 0.2); bk.rotation.y = 0.3; root.add(bk);
    groundShadow(dx, dz, 5.4, 3.0, y + 0.02);
    if (carrel) {
      for (const xx of [2.3, -2.3]) { const p = tbox(0.1, 1.5, 2.4, deskMat); p.position.set(dx + xx, y + 1.85, dz); root.add(p); }
      const hutch = tbox(4.7, 1.6, 0.12, deskMat); hutch.position.set(dx, y + 1.9, dz - 1.15); root.add(hutch);
      const shelf = tbox(4.3, 0.1, 0.5, deskMat); shelf.position.set(dx, y + 2.1, dz - 0.95); root.add(shelf);
      [0x5e2b2b, 0x33445e, 0x8a6a24].forEach((c, i) => { const mb = tbox(0.5, 0.5, 0.2, toonMat(c)); mb.position.set(dx - 1.4 + i * 1.4, y + 2.4, dz - 0.95); root.add(mb); });
      cl.push({ x: dx, z: dz - 0.2, w: 5.0, d: 3.0 });
    } else {
      cl.push({ x: dx, z: dz, w: 4.8, d: 2.4 });
    }
    addSeat(dx, dz + 2.4, floorY, Math.PI);
  }

  // first floor: communal long tables (kept clear of the spawn at z≈18 so the
  // player doesn't materialise inside a table's collider)
  longTable(-2, 7, 0, colliders);
  longTable(-2, 14, 0, colliders);
  // second floor (mezzanine): a row of individual study carrels along the wall
  for (const cx of [-22, -11, 0, 11, 20]) writingDesk(cx, -18, MEZZ_Y, colliders1, true);

  // ============================================================ cozy details
  // A kit of small rounded props + soft furniture to give the room character
  // and that lived-in, Animal-Crossing warmth (rather than bare boxes).
  const leatherMat = toonMat(PALETTE.leather, { map: fabricTexture('#7a4f33') });
  const blueMat = toonMat(PALETTE.armchair, { map: fabricTexture('#5e6e8c') });
  const walnut = toonMat(0x5a3d28);

  // soft tufted armchair: rounded cushion + rolled arms/back, little wooden feet
  function armchair(x, z, ry, mat = leatherMat) {
    const g = new THREE.Group();
    const base = tbox(1.9, 0.45, 1.9, mat); base.position.y = 0.5; g.add(base);
    const cushion = cyl(0.85, 0.85, 0.4, 18, mat); cushion.scale.z = 0.95; cushion.position.set(0, 0.82, 0.1); g.add(cushion);
    const back = tbox(1.85, 1.35, 0.45, mat); back.position.set(0, 1.25, -0.78); g.add(back);
    const backRoll = cyl(0.28, 0.28, 1.85, 14, mat); backRoll.rotation.z = Math.PI / 2; backRoll.position.set(0, 1.9, -0.78); g.add(backRoll);
    for (const ax of [-1, 1]) {
      const arm = tbox(0.45, 0.7, 1.7, mat); arm.position.set(ax * 0.92, 0.95, 0); g.add(arm);
      const roll = cyl(0.26, 0.26, 1.7, 14, mat); roll.rotation.x = Math.PI / 2; roll.position.set(ax * 0.92, 1.32, 0); g.add(roll);
      for (const fz of [-0.7, 0.7]) { const foot = cyl(0.12, 0.1, 0.3, 8, walnut); foot.position.set(ax * 0.8, 0.15, fz); g.add(foot); }
    }
    g.position.set(x, 0, z); g.rotation.y = ry; root.add(g);
    groundShadow(x, z, 3, 3); colliders.push({ x, z, w: 2.2, d: 2.2 });
  }

  // chesterfield-ish sofa: three seat + back cushions, rolled arms
  function sofa(x, z, ry, mat = leatherMat) {
    const g = new THREE.Group();
    const base = tbox(4.4, 0.45, 1.9, mat); base.position.y = 0.5; g.add(base);
    for (const cx of [-1.35, 0, 1.35]) {
      const seat = tbox(1.28, 0.4, 1.6, mat); seat.position.set(cx, 0.82, 0.12); g.add(seat);
      const back = tbox(1.28, 1.05, 0.45, mat); back.position.set(cx, 1.3, -0.72); g.add(back);
    }
    const backRoll = cyl(0.26, 0.26, 4.4, 14, mat); backRoll.rotation.z = Math.PI / 2; backRoll.position.set(0, 1.92, -0.72); g.add(backRoll);
    for (const ax of [-1, 1]) {
      const arm = tbox(0.45, 0.8, 1.9, mat); arm.position.set(ax * 2.0, 1.0, 0); g.add(arm);
      const roll = cyl(0.28, 0.28, 1.9, 14, mat); roll.rotation.x = Math.PI / 2; roll.position.set(ax * 2.0, 1.4, 0); g.add(roll);
    }
    g.position.set(x, 0, z); g.rotation.y = ry; root.add(g);
    groundShadow(x, z, 5.2, 3);
    const a = Math.abs(Math.sin(ry)); // swap footprint axes as the sofa rotates
    colliders.push({ x, z, w: 4.6 * (1 - a) + 2.2 * a, d: 2.2 * (1 - a) + 4.6 * a });
  }

  // round pedestal coffee table with turned legs
  function roundTable(x, z, r = 1.3, h = 1.0) {
    const g = new THREE.Group();
    const top = cyl(r, r, 0.16, 24, deskMat); top.position.y = h; g.add(top);
    const apron = cyl(r - 0.15, r - 0.15, 0.18, 24, deskMat); apron.position.y = h - 0.16; g.add(apron);
    for (const a of [0, 1, 2, 3]) {
      const lx = Math.cos(a * Math.PI / 2) * (r - 0.4), lz = Math.sin(a * Math.PI / 2) * (r - 0.4);
      const leg = cyl(0.1, 0.14, h - 0.2, 10, walnut); leg.position.set(lx, (h - 0.2) / 2, lz); g.add(leg);
    }
    g.position.set(x, 0, z); root.add(g);
    groundShadow(x, z, r * 2.4, r * 2.4); colliders.push({ x, z, w: r * 2, d: r * 2 });
  }

  // little props ---------------------------------------------------------
  const SPINE = [0x5e2b2b, 0x33445e, 0x2f5742, 0x8a6a24, 0x6e4230, 0x46532f, 0x3d2f24];
  function bookStack(x, y, z, n = 3, rot = 0) {
    const g = new THREE.Group();
    let yy = 0;
    for (let i = 0; i < n; i++) {
      const w = 0.95 - i * 0.07, d = 1.25 - i * 0.06, h = 0.16 + (i % 2) * 0.05;
      const bk = tbox(w, h, d, toonMat(SPINE[(i * 3 + 1) % SPINE.length]));
      bk.position.set((i % 2 ? 0.06 : -0.05), yy + h / 2, (i % 2 ? -0.04 : 0.05));
      bk.rotation.y = (i % 2 ? 0.12 : -0.08); g.add(bk); yy += h;
    }
    g.position.set(x, y, z); g.rotation.y = rot; root.add(g);
  }
  function openBook(x, y, z, rot = 0) {
    const g = new THREE.Group();
    for (const s of [-1, 1]) {
      const page = tbox(0.7, 0.04, 1.0, toonMat(0xe4d8bd)); page.position.set(s * 0.36, 0, 0); page.rotation.z = s * 0.12; g.add(page);
    }
    const spine = tbox(0.12, 0.08, 1.0, toonMat(0x6e4230)); g.add(spine);
    g.position.set(x, y + 0.04, z); g.rotation.y = rot; root.add(g);
  }
  function candle(x, y, z, lit = true) {
    const g = new THREE.Group();
    const stick = cyl(0.07, 0.09, 0.45, 10, toonMat(0xefe6cf)); stick.position.y = 0.22; g.add(stick);
    const dish = cyl(0.16, 0.16, 0.05, 12, brassMat); dish.position.y = 0; g.add(dish);
    // small, dim flame (emissiveIntensity < 1 keeps it under the bloom threshold
    // so it reads as a soft glow instead of a blown-out blob)
    const flame = sph(0.045, toonMat(0xffcaa0, { emissive: 0xff9d4a, emissiveIntensity: 0.55 })); flame.scale.y = 1.5; flame.position.y = 0.5; g.add(flame);
    g.position.set(x, y, z); root.add(g);
    if (lit) { const L = new THREE.PointLight(0xffb86a, 1.4, 3.2, 2); L.position.set(x, y + 0.6, z); root.add(L); }
  }
  function vaseFlowers(x, y, z) {
    const g = new THREE.Group();
    const vase = cyl(0.18, 0.13, 0.5, 12, toonMat(0xcfe1ea)); vase.position.y = 0.25; g.add(vase);
    const blooms = [0xf2728c, 0xf7c948, 0xffffff, 0xc084e0];
    blooms.forEach((c, i) => {
      const a = i / blooms.length * Math.PI * 2;
      const stem = cyl(0.02, 0.02, 0.5, 6, toonMat(0x4f8a45)); stem.position.set(Math.cos(a) * 0.1, 0.7, Math.sin(a) * 0.1); stem.rotation.z = Math.cos(a) * 0.25; g.add(stem);
      const flower = sph(0.12, toonMat(c)); flower.position.set(Math.cos(a) * 0.22, 0.95, Math.sin(a) * 0.22); g.add(flower);
    });
    g.position.set(x, y, z); root.add(g);
  }
  function pottedPlant(x, z, tall = false) {
    const g = new THREE.Group();
    const pot = cyl(0.5, 0.4, 0.8, 12, toonMat(0xb5703f)); pot.position.y = 0.4; g.add(pot);
    if (tall) {
      const trunk = cyl(0.12, 0.16, 2.2, 8, walnut); trunk.position.y = 1.6; g.add(trunk);
      for (const [fx, fy, fz, r] of [[0, 3.0, 0, 1.0], [0.5, 2.6, 0.3, 0.7], [-0.5, 2.7, -0.2, 0.7]]) {
        const f = sph(r, toonMat(0x4f8a45)); f.position.set(fx, fy, fz); g.add(f);
      }
    } else {
      const f = sph(0.9, toonMat(0x4f8a45)); f.scale.y = 1.1; f.position.y = 1.4; g.add(f);
      const f2 = sph(0.55, toonMat(0x5fa052)); f2.position.set(0.4, 1.7, 0.2); g.add(f2);
    }
    g.position.set(x, 0, z); root.add(g);
    groundShadow(x, z, 1.6, 1.6); colliders.push({ x, z, w: 1.1, d: 1.1 });
  }
  function framedPicture(x, y, z, ry, w = 2.0, h = 2.6, art = 0x6b5536) {
    const g = new THREE.Group();
    const frame = tbox(w + 0.25, h + 0.25, 0.14, toonMat(0x7a5a2c)); g.add(frame);
    const inner = tbox(w + 0.05, h + 0.05, 0.16, brassMat); g.add(inner);
    const canvas = tbox(w, h, 0.18, toonMat(art)); canvas.position.z = 0.02; g.add(canvas);
    g.position.set(x, y, z); g.rotation.y = ry; root.add(g);
  }
  function libraryLadder(x, z, ry) {
    const g = new THREE.Group();
    for (const s of [-0.45, 0.45]) { const rail = cyl(0.07, 0.07, 5.2, 8, walnut); rail.position.set(s, 2.6, 0); rail.rotation.x = 0.12; g.add(rail); }
    for (let i = 0; i < 7; i++) { const rung = cyl(0.05, 0.05, 0.9, 8, walnut); rung.rotation.z = Math.PI / 2; rung.position.set(0, 0.6 + i * 0.7, -0.07 * i + 0.2); g.add(rung); }
    g.position.set(x, 0, z); g.rotation.y = ry; root.add(g);
    colliders.push({ x, z, w: 1.1, d: 0.8 });
  }
  function grandClock(x, z, ry) {
    const g = new THREE.Group();
    const body = tbox(1.2, 5.2, 0.8, walnut); body.position.y = 2.6; g.add(body);
    const hood = tbox(1.4, 0.6, 0.95, walnut); hood.position.y = 5.2; g.add(hood);
    const face = cyl(0.45, 0.45, 0.06, 20, toonMat(0xf0e6c8)); face.rotation.x = Math.PI / 2; face.position.set(0, 4.2, 0.43); g.add(face);
    const h1 = tbox(0.05, 0.3, 0.02, walnut); h1.position.set(0, 4.32, 0.47); g.add(h1);
    const h2 = tbox(0.22, 0.05, 0.02, walnut); h2.position.set(0.09, 4.2, 0.47); g.add(h2);
    const pend = sph(0.16, brassMat); pend.position.set(0, 2.0, 0.3); g.add(pend);
    g.position.set(x, 0, z); g.rotation.y = ry; root.add(g);
    groundShadow(x, z, 1.8, 1.4); colliders.push({ x, z, w: 1.4, d: 1.0 });
  }

  // ---- cozy fireside nook (front-left), arranged around a patterned rug ----
  const rug = new THREE.Mesh(new THREE.CircleGeometry(6, 32),
    toonMat(PALETTE.rug, { map: rugTexture(`#${PALETTE.rug.toString(16)}`, `#${PALETTE.rugBorder.toString(16)}`) }));
  rug.rotation.x = -Math.PI / 2; rug.position.set(-25, 0.02, 13); root.add(rug);
  // seats angled to face the fireplace/rug focal point (≈ -30,13)
  sofa(-20.5, 13, -Math.PI / 2);                 // faces the fireplace (-x)
  armchair(-25.5, 7.5, -0.69, blueMat);          // angled in toward the fire
  armchair(-25.5, 18.5, -2.46);
  roundTable(-27, 13, 1.2, 0.95);
  vaseFlowers(-27, 1.02, 13);
  bookStack(-26.4, 0.95, 13.7, 3, 0.6);
  openBook(-27.6, 0.95, 12.4, -0.4);
  // floor reading lamp beside an armchair
  const lampPole = cyl(0.1, 0.14, 3.2, 10, brassMat); lampPole.position.set(-20.5, 1.6, 8); root.add(lampPole);
  const floorShade = new THREE.Mesh(new THREE.ConeGeometry(0.85, 0.95, 18), toonMat(0xf3e3b8, { emissive: 0x6a5a30 }));
  floorShade.position.set(-20.5, 3.35, 8); root.add(floorShade);
  // greenery + a couple of books spilled on the rug for that lived-in feel
  pottedPlant(-32, 5, true); pottedPlant(-31, 20);
  pottedPlant(15, 21); pottedPlant(-2, -9, true);
  bookStack(-23, 0.02, 16.5, 4, 0.3);
  candle(-27.7, 0.95, 13.6, true);

  // ---- wall art, a grandfather clock and a rolling ladder for character ----
  for (const [pz, art] of [[-9, 0x5b6e52], [5, 0x6b4f6e]]) {
    framedPicture(-W / 2 + 0.5, 8.5, pz, Math.PI / 2, 2.0, 2.6, art);   // left wall
  }
  for (const [pz, art] of [[-9, 0x6b5536], [6, 0x4a5e6e]]) {
    framedPicture(W / 2 - 0.5, 8.5, pz, -Math.PI / 2, 2.0, 2.6, art);   // right wall
  }
  grandClock(28, 22, -2.4);
  libraryLadder(-9, -21.6, Math.PI);
  // ---- Blender hero props (async glTF; colliders added now so gameplay is stable) ----
  const fireAnchor = { x: -32.5, z: 14 };
  colliders.push({ x: -33.6, z: 14, w: 1.6, d: 3.4 });  // fireplace (against left wall)
  colliders.push({ x: -29, z: 18.5, w: 1.4, d: 1.4 });  // globe
  colliders.push({ x: -31, z: 9.5, w: 1.2, d: 1.2 });   // gramophone
  loadProp(root, 'assets/fireplace.glb', { x: -33.7, z: 14, ry: -Math.PI / 2, scale: 1 });
  loadProp(root, 'assets/globe.glb', { x: -29, z: 18.5, ry: 0.5, scale: 1 });
  loadProp(root, 'assets/gramophone.glb', { x: -31, z: 9.5, ry: 0.8, scale: 1 });
  groundShadow(-33.4, 14, 2, 3.6); groundShadow(-29, 18.5, 2, 2); groundShadow(-31, 9.5, 1.8, 1.8);

  // animated fire — tucked back inside the firebox recess (fireplace is on the
  // left wall opening +x), as a compact 3D mound rather than a flat slab
  const fireMat = (c, e) => new THREE.MeshToonMaterial({ color: c, emissive: e, emissiveIntensity: 1.0, gradientMap: null });
  const fireGroup = new THREE.Group();
  const logs = tbox(0.6, 0.22, 0.95, toonMat(0x3a2114)); logs.position.y = -0.08; fireGroup.add(logs);
  const embers = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.8), fireMat(0xff7a2e, 0xff5a1e)); embers.position.y = 0.05; fireGroup.add(embers);
  const fcols = [[0xff4d1a, 0xff3a10], [0xff8a2e, 0xff6a1e], [0xffb648, 0xff9a2e], [0xffd86a, 0xffc24a]];
  for (let i = 0; i < 8; i++) {
    const [c, e] = fcols[i % fcols.length];
    const mid = 1 - Math.abs(i - 3.5) / 3.5; // taller in the centre → mound shape
    const fl = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.42 + mid * 0.32, 8), fireMat(c, e));
    fl.position.set((i % 3 - 1) * 0.13, 0.22 + mid * 0.1, -0.3 + (i % 4) * 0.2);
    fireGroup.add(fl);
    flames.push({ mesh: fl, baseY: fl.position.y, phase: i * 1.6, speed: 6 + i * 0.5 });
  }
  fireGroup.position.set(-33.45, 0.5, 14); root.add(fireGroup);

  // ---- librarian counter (front-right) ----
  const counter = tbox(7, 1.3, 2, woodMat); counter.position.set(21, 0.65, 19); root.add(counter);
  const counterTop = tbox(7.4, 0.18, 2.4, brassMat); counterTop.position.set(21, 1.4, 19); root.add(counterTop);
  groundShadow(21, 19, 8.5, 3.6);
  colliders.push({ x: 21, z: 19, w: 7.4, d: 2.4 });
  // counter dressing: a ledger, stacked returns and a candle
  openBook(20.2, 1.5, 18.6, 0.15);
  bookStack(22.6, 1.5, 18.7, 3, -0.3);
  candle(23.7, 1.5, 19.4, false);
  // scatter a few books + an open book on the communal tables
  for (const [cx, cz] of [[-2, 7], [-2, 14]]) {
    openBook(cx + 4.5, 1.12, cz - 0.3, 0.2);
    bookStack(cx - 6.0, 1.12, cz + 0.4, 2, 0.4);
  }

  // ---- pendant lamps + warm fill lights (no ceiling/rafters; the rods run up
  // past the top of frame so only the hanging shade/glow is ever in view) ----
  function pendant(x, z) {
    // rod spans y≈8 → 20 (top out of sight), shade + bulb hang at a cozy height
    const rod = tbox(0.06, 12, 0.06, beamMat); rod.position.set(x, 14, z); root.add(rod);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.7, 0.8, 16), toonMat(PALETTE.pendantDark)); shade.position.set(x, 8, z); root.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), toonMat(0xfff2c8, { emissive: 0xffcf7a })); bulb.position.set(x, 7.7, z); root.add(bulb);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    spr.scale.set(3, 3, 1); spr.position.set(x, 7.7, z); root.add(spr);
  }
  for (const [px, pz] of [[-18, 4], [0, 4], [18, 4], [-18, 13], [0, 13], [18, 13]]) pendant(px, pz);
  // gentle warm ambient — kept low so the lamps read as cozy pools of light
  // rather than a flat, evenly-bright room
  root.add(new THREE.AmbientLight(0xffe0b6, 0.4));
  // warm point-lights (no shadows; only lit when the library root is visible).
  // Intensities pulled well down from the old values — the previous lights were
  // bright enough to blow a white column into a glowing beam under bloom.
  // Higher + gentler than before: keeping them well above the furniture stops a
  // bright hotspot from blooming on the desks/lamps right beneath them.
  function warmLight(x, y, z, intensity, dist) { const L = new THREE.PointLight(0xffd29a, intensity, dist, 2); L.position.set(x, y, z); root.add(L); }
  warmLight(0, 10, 9, 28, 42); warmLight(-18, 10, 9, 18, 32); warmLight(18, 10, 9, 18, 32);
  warmLight(0, 9, 20, 20, 32);      // entrance / spawn area
  warmLight(-26, 5, 14, 24, 24);    // nook glow
  warmLight(0, 8, -16, 16, 30);     // balcony glow (kept off the column at z=-11)
  const fireGlow = new THREE.PointLight(0xff7a2e, 9, 12, 2); // fireplace (flickers via animate)
  fireGlow.position.set(-32, 1.4, 14); root.add(fireGlow);

  // per-frame ambient animation (called by main.js while the library is active):
  // licking flames + a flickering hearth glow for a living fire.
  function animate(t) {
    for (const f of flames) {
      const s = 0.7 + 0.5 * Math.abs(Math.sin(t * f.speed + f.phase));
      f.mesh.scale.set(0.85 + 0.2 * Math.sin(t * f.speed * 1.4 + f.phase), s, 0.85 + 0.2 * Math.cos(t * f.speed + f.phase));
      f.mesh.material.emissiveIntensity = 0.85 + 0.5 * Math.sin(t * f.speed + f.phase);
      f.mesh.position.y = f.baseY + (s - 1) * 0.18;
    }
    fireGlow.intensity = 9 * (0.82 + 0.16 * Math.sin(t * 11) + 0.07 * Math.sin(t * 27));
  }

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
  return { root, colliders, interactables, bounds, spawn, seatPositions, levels, stairs, fireAnchor, animate };
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
