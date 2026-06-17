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
function loadProp(parent, url, { x, y = 0, z, ry = 0, scale = 1, onMesh } = {}) {
  gltfLoader.load(url, (gltf) => {
    const drop = [];
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      if (onMesh && onMesh(o) === false) { drop.push(o); return; }
      o.castShadow = true; o.receiveShadow = true;
      const src = o.material;
      const color = src && src.color ? src.color.getHex() : 0xb0a080;
      const emissive = src && src.emissive ? src.emissive.getHex() : 0;
      const opts = { noCache: true };
      if (emissive) { opts.emissive = emissive; opts.emissiveIntensity = 0.45; } // gentle glow, not a blowout
      o.material = toonMat(color, opts);
    });
    for (const o of drop) if (o.parent) o.parent.remove(o);
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

  // ---- bookcases: a real carcass (base plinth + crown molding + side pilasters
  // + bay mullions) framing recessed book-spine faces, with books on top. opts:
  // { both } double-sided (free-standing), { arch } arched tops on each bay. ----
  function shelfRun(x, z, len, dir, face, y0, h, opts = {}) {
    const depth = 1.1;
    const g = new THREE.Group();
    const dark = toonMat(0x4a3322);
    const faces = opts.both ? [1, -1] : [face];

    // centred (depth-symmetric) box — carcass + mouldings
    const cbox = (u, yy, du, dy, dv, m) => {
      const b = dir === 'x' ? tbox(du, dy, dv, m) : tbox(dv, dy, du, m);
      b.position.set(dir === 'x' ? u : 0, yy, dir === 'x' ? 0 : u); g.add(b);
    };
    // box pushed to a front face (f = ±1)
    const fbox = (f, u, yy, dz, du, dy, dv, m) => {
      const b = dir === 'x' ? tbox(du, dy, dv, m) : tbox(dv, dy, du, m);
      b.position.set(dir === 'x' ? u : f * dz, yy, dir === 'x' ? f * dz : u); g.add(b);
    };

    cbox(0, h / 2, len, h, depth * 0.82, woodMat);                 // carcass
    cbox(0, 0.28, len + 0.25, 0.56, depth + 0.28, dark);           // base plinth
    cbox(0, h - 0.18, len + 0.22, 0.4, depth + 0.3, woodMat);      // crown (lower)
    cbox(0, h + 0.06, len + 0.4, 0.26, depth + 0.46, dark);        // crown (cap)
    cbox(-len / 2 + 0.12, h / 2, 0.24, h, depth + 0.16, woodMat);  // end pilasters
    cbox(len / 2 - 0.12, h / 2, 0.24, h, depth + 0.16, woodMat);

    const n = Math.max(1, Math.round(len / 4.5));
    const bw = len / n;
    for (const f of faces) {
      for (let i = 0; i < n; i++) {
        const u = -len / 2 + (i + 0.5) * bw;
        const pl = new THREE.Mesh(new THREE.PlaneGeometry(bw - 0.34, h - 1.2), bookMats[(i + (f < 0 ? 1 : 0)) % 3]);
        const dz = depth / 2 - 0.06;
        if (dir === 'x') { pl.position.set(u, h / 2 - 0.05, f * dz); if (f < 0) pl.rotation.y = Math.PI; }
        else { pl.position.set(f * dz, h / 2 - 0.05, u); pl.rotation.y = f > 0 ? Math.PI / 2 : -Math.PI / 2; }
        g.add(pl);
        if (i > 0) fbox(f, -len / 2 + i * bw, h / 2, depth / 2 - 0.03, 0.14, h - 0.7, 0.14, woodMat); // mullion
        if (opts.arch) {                                            // thin arched header per bay
          const r = Math.min(bw - 0.6, 1.5) / 2;
          const arc = new THREE.Mesh(new THREE.RingGeometry(Math.max(0.08, r - 0.12), r, 14, 1, 0, Math.PI), dark);
          const dz2 = depth / 2 - 0.02;
          if (dir === 'x') { arc.position.set(u, h - 1.55, f * dz2); if (f < 0) arc.rotation.y = Math.PI; }
          else { arc.position.set(f * dz2, h - 1.55, u); arc.rotation.y = f > 0 ? Math.PI / 2 : -Math.PI / 2; }
          g.add(arc);
        }
      }
    }

    // a few books stacked/leaning on top of the crown for a lived-in feel
    const topY = h + 0.25, bookCols = [0x5e2b2b, 0x33445e, 0x2f5742, 0x8a6a24, 0x6e4230];
    const clusters = Math.max(1, Math.floor(len / 10));
    for (let c = 0; c < clusters; c++) {
      const u = -len / 2 + (c + 0.6) * (len / clusters);
      for (let b = 0; b < 3; b++) {
        const bk = tbox(0.7, 0.15, 1.0, toonMat(bookCols[(c * 3 + b) % bookCols.length]));
        if (dir === 'x') { bk.position.set(u + b * 0.05, topY + b * 0.15, 0); bk.rotation.y = 0.18 * b; }
        else { bk.position.set(0, topY + b * 0.15, u + b * 0.05); bk.rotation.y = Math.PI / 2 + 0.18 * b; }
        g.add(bk);
      }
    }

    g.position.set(x, y0, z); root.add(g);
  }

  // ground perimeter shelves (back under the balcony + both sides)
  shelfRun(0, -D / 2 + 0.9, W - 4, 'x', 1, 0, 4.4, { arch: true });
  colliders.push({ x: 0, z: -D / 2 + 1.3, w: W - 4, d: 1.6 });
  // left wall: split into two runs leaving a gap (z[10,18]) for the fireplace nook
  shelfRun(-W / 2 + 0.9, -6, 32, 'z', 1, 0, 4.4, { arch: true });
  shelfRun(-W / 2 + 0.9, 20, 4, 'z', 1, 0, 4.4, { arch: true });
  shelfRun(W / 2 - 0.9, 0, D - 4, 'z', -1, 0, 4.4, { arch: true });
  colliders.push({ x: -W / 2 + 1.3, z: 0, w: 1.6, d: D - 4 });
  colliders.push({ x: W / 2 - 1.3, z: 0, w: 1.6, d: D - 4 });
  groundShadow(0, -D / 2 + 1.3, W - 2, 3.2);
  groundShadow(-W / 2 + 1.3, 0, 3.2, D - 2);
  groundShadow(W / 2 - 1.3, 0, 3.2, D - 2);
  // two free-standing double-sided stacks for depth
  for (const sx of [-13, 13]) {
    shelfRun(sx, -3, 9, 'z', 1, 0, 3.6, { both: true });
    groundShadow(sx, -3, 3.4, 10);
    colliders.push({ x: sx, z: -3, w: 2.4, d: 9 });
  }
  // mezzanine upper shelves (back wall) — level 1
  shelfRun(0, -D / 2 + 0.9, W - 4, 'x', 1, MEZZ_Y, 4.0, { arch: true });
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
  // sit the rug clearly above the floor + contact-shadow decals (both at y≈0.02)
  // so it doesn't z-fight / flicker
  rug.rotation.x = -Math.PI / 2; rug.position.set(-25, 0.06, 13); root.add(rug);
  // seats angled to face the fireplace/rug focal point (≈ -30,13)
  // each couch/chair is a loungeable seat: the player can sit and stand back up.
  function addLounge(x, z, face, sitY) {
    const fx = Math.sin(face), fz = Math.cos(face); // facing direction
    interactables.push({
      id: 'lounge',
      x: x - fx * 2.6, z: z - fz * 2.6, r: 2.6, // approach pad on the open side
      label: '🛋️ Relax', seatPos: { x, z, y: 0 }, sitY, face,
      stepBack: { x: x - fx * 2.4, z: z - fz * 2.4 },
    });
  }
  sofa(-20.5, 13, -Math.PI / 2);                 // faces the fireplace (-x)
  addLounge(-20.5, 13, -Math.PI / 2, 1.05);
  armchair(-25.5, 7.5, -0.69, blueMat);          // angled in toward the fire
  addLounge(-25.5, 7.5, -0.69, 0.98);
  armchair(-25.5, 18.5, -2.46);
  addLounge(-25.5, 18.5, -2.46, 0.98);
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
  bookStack(-23, 0.08, 16.5, 4, 0.3);
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
  loadProp(root, 'assets/fireplace.glb', { x: -33.7, z: 14, ry: -Math.PI / 2, scale: 1,
    onMesh: (o) => {
      // drop the model's built-in (static) fire/log glow so our animated flames
      // are the only fire in the hearth
      const n = (o.name || '').toLowerCase();
      const src = o.material;
      const emissive = src && src.emissive ? src.emissive.getHex() : 0;
      if (/fire|flame|ember|log|glow|light/.test(n) || emissive) return false;
    } });
  loadProp(root, 'assets/globe.glb', { x: -29, z: 18.5, ry: 0.5, scale: 1 });
  loadProp(root, 'assets/gramophone.glb', { x: -31, z: 9.5, ry: 0.8, scale: 1 });
  groundShadow(-33.4, 14, 2, 3.6); groundShadow(-29, 18.5, 2, 2); groundShadow(-31, 9.5, 1.8, 1.8);

  // animated fire — tucked back inside the firebox recess (fireplace is on the
  // left wall opening +x), as a compact 3D mound rather than a flat slab
  const fireMat = (c, e) => new THREE.MeshToonMaterial({ color: c, emissive: e, emissiveIntensity: 0.8, gradientMap: null });
  const fireGroup = new THREE.Group();
  const logs = tbox(0.62, 0.22, 0.95, toonMat(0x3a2114)); logs.position.y = -0.08; fireGroup.add(logs);
  const embers = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.12, 0.82), fireMat(0xd83a12, 0xb82808)); embers.position.y = 0.06; fireGroup.add(embers);
  // rich reds at the base → warm oranges toward the tips (no pale yellow that
  // washes out to white under bloom)
  const fcols = [[0xd2300e, 0xa82006], [0xf25216, 0xd2300e], [0xff7a26, 0xe24f14], [0xff9a36, 0xff6a1e]];
  for (let i = 0; i < 9; i++) {
    const mid = 1 - Math.abs(i - 4) / 4; // taller in the centre → mound shape
    const [c, e] = fcols[Math.min(3, Math.round((1 - mid) * 3 + (i % 2) * 0.5))];
    const fl = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.34 + mid * 0.34, 8), fireMat(c, e));
    fl.position.set((i % 3 - 1) * 0.14, 0.18 + mid * 0.12, -0.32 + (i % 4) * 0.21);
    fireGroup.add(fl);
    flames.push({ mesh: fl, baseY: fl.position.y, phase: i * 1.6, speed: 6 + i * 0.5 });
  }
  fireGroup.position.set(-33.7, 0.5, 14); root.add(fireGroup);

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
      f.mesh.material.emissiveIntensity = 0.55 + 0.28 * Math.abs(Math.sin(t * f.speed + f.phase)); // stays warm, never washes to white
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
  // close the two slivers of open air either side of the stair mouth (x[24,31]).
  // Kept clear of the stair funnel zone (x[24.7,30.3]+player radius) so the
  // player isn't snagged stepping on/off the top of the stairs.
  colliders1.push({ x: 23.0, z: -4.5, w: 1.4, d: 13 }); // blocks x(21.6,24.4)
  colliders1.push({ x: 31.6, z: -4.5, w: 0.8, d: 13 }); // blocks x(30.5,32.7)
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
  root.add(makeRoom(W, D, { wall: 0xdacfe2 })); // soft lilac-grey walls

  // ---- local toon helpers ----
  const tb = (w, h, d, c) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toonMat(c)); m.castShadow = true; m.receiveShadow = true; return m; };
  const cyl = (rt, rb, h, n, c) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, n), toonMat(c)); m.castShadow = true; return m; };
  const sph = (r, c) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), toonMat(c)); m.castShadow = true; return m; };
  const add = (m, x, y, z) => { m.position.set(x, y, z); root.add(m); return m; };
  const emi = (c, e, i = 0.6) => new THREE.MeshToonMaterial({ color: c, emissive: e, emissiveIntensity: i });

  // ---- warm wood floor + soft contact-shadow helper + big area rug ----
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), toonMat(0xffffff, { map: woodPlanks('#c6a06a', '#a8804c') }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.012; floor.receiveShadow = true; root.add(floor);
  const shadowMat = new THREE.MeshBasicMaterial({ map: softShadow(), transparent: true, depthWrite: false });
  const shade = (x, z, sx, sz = sx) => { const d = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), shadowMat); d.rotation.x = -Math.PI / 2; d.position.set(x, 0.02, z); root.add(d); };
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(12, 8.5), toonMat(0x8a7bb0, { map: rugTexture('#8a7bb0', '#5d4f86') }));
  rug.rotation.x = -Math.PI / 2; rug.position.set(-3, 0.03, 2); root.add(rug);

  // ---- wall trim: baseboard + crown + a feature wall behind the TV ----
  const baseMat = 0xc7bcd2, crownMat = 0xeae3f0;
  const trim = (w, h, d, c, x, y, z) => add(tb(w, h, d, c), x, y, z);
  for (const [w, d, x, z] of [[W, 0.3, 0, -D / 2 + 0.3], [0.3, D, -W / 2 + 0.3, 0], [0.3, D, W / 2 - 0.3, 0]]) {
    trim(w, 0.5, d, baseMat, x, 0.25, z);  // baseboard
    trim(w, 0.25, d, crownMat, x, 4.85, z); // crown
  }
  add(tb(9, 4.4, 0.2, 0x6d5a8f), -3, 2.6, -D / 2 + 0.45); // accent feature wall panel behind TV

  // ---- entertainment unit: console + flat TV + soundbar + console & decor ----
  const TVz = -D / 2 + 0.9;
  const unit = add(tb(7, 1.0, 1.3, 0x6b4a33), -3, 0.62, TVz);
  for (const sx of [-3.0, 3.0]) { add(cyl(0.09, 0.11, 0.4, 8, 0x3a2a1c), -3 + sx, 0.2, TVz + 0.45); }
  for (const sx of [-2, 0, 2]) add(tb(1.5, 0.55, 0.1, 0x271a10), -3 + sx, 0.55, TVz + 0.66); // cubby insets
  colliders.push({ x: -3, z: TVz, w: 7.2, d: 1.6 });
  const bezel = add(tb(5.6, 3.2, 0.2, 0x141519), -3, 3.0, TVz - 0.1);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 2.85), emi(0x2c4f72, 0x356a9c, 0.7));
  screen.position.set(-3, 3.0, TVz + 0.01); root.add(screen);
  for (const [sx, sy, c] of [[-1.6, 0.4, 0xff6b6b], [0.2, -0.3, 0x6be0a0], [1.5, 0.5, 0xffd166]]) { // "game" UI blobs
    const q = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6), emi(c, c, 0.5)); q.position.set(-3 + sx, 3.0 + sy, TVz + 0.02); root.add(q);
  }
  add(tb(4.2, 0.28, 0.4, 0x202227), -3, 1.3, TVz + 0.25);  // soundbar
  add(tb(1.0, 0.2, 0.65, 0x25262b), -5, 1.22, TVz + 0.3);  // game console
  add(tb(0.45, 0.12, 0.65, 0x33353b), -1.2, 1.18, TVz + 0.35); // controller
  add(sph(0.5, 0x4f8a45), -0.6, 1.6, TVz + 0.2).scale.set(1, 1.2, 1); // little plant on the unit
  add(cyl(0.32, 0.26, 0.4, 10, 0xc07a45), -0.6, 1.25, TVz + 0.2);

  // ---- seating: sectional sofa + loveseat + beanbag, all loungeable ----
  const pillowCols = [0xf2a35c, 0xe8748c, 0x6be0a0, 0xffd166];
  function couch(x, z, ry, len, c, sitY) {
    const g = new THREE.Group();
    const base = tb(len, 0.5, 1.9, c); base.position.y = 0.5; g.add(base);
    const seats = Math.max(2, Math.round(len / 1.6));
    for (let i = 0; i < seats; i++) {
      const cx = -len / 2 + (i + 0.5) * (len / seats);
      const cu = tb(len / seats - 0.1, 0.4, 1.5, c); cu.position.set(cx, 0.82, 0.12); g.add(cu);
      const bk = tb(len / seats - 0.1, 1.0, 0.45, c); bk.position.set(cx, 1.3, -0.72); g.add(bk);
    }
    for (const s of [-1, 1]) {
      const arm = tb(0.45, 0.82, 1.9, c); arm.position.set(s * (len / 2 + 0.05), 1.0, 0); g.add(arm);
      const roll = cyl(0.26, 0.26, 1.9, 12, c); roll.rotation.x = Math.PI / 2; roll.position.set(s * (len / 2 + 0.05), 1.42, 0); g.add(roll);
    }
    const pidx = ((Math.round(x + z)) % pillowCols.length + pillowCols.length) % pillowCols.length;
    const pil = tb(0.7, 0.7, 0.25, pillowCols[pidx]); pil.position.set(-len / 4, 1.15, -0.2); pil.rotation.z = 0.3; g.add(pil);
    const pil2 = tb(0.7, 0.7, 0.25, pillowCols[(pidx + 2) % pillowCols.length]); pil2.position.set(len / 4, 1.15, -0.2); pil2.rotation.z = -0.25; g.add(pil2);
    g.position.set(x, 0, z); g.rotation.y = ry; root.add(g);
    const a = Math.abs(Math.sin(ry));
    colliders.push({ x, z, w: (len + 1) * (1 - a) + 2.2 * a, d: 2.2 * (1 - a) + (len + 1) * a });
    shade(x, z, len + 1.5, 2.6);
    // loungeable (approach from behind the backrest, like the library couches)
    const fx = Math.sin(ry), fz = Math.cos(ry);
    interactables.push({ id: 'lounge', x: x + fx * 2.6, z: z + fz * 2.6, r: 2.6, label: '🛋️ Relax',
      seatPos: { x, z, y: 0 }, sitY, face: ry, stepBack: { x: x + fx * 2.4, z: z + fz * 2.4 } });
  }
  couch(-3, 5.6, Math.PI, 6, 0x4a6ea8, 1.05);      // main sofa faces the TV (-z)
  couch(-9.5, 1.5, Math.PI / 2, 4.2, 0x5b7bb5, 1.05); // loveseat on the left, faces +x

  function beanbag(x, z, c, sitY) {
    const g = new THREE.Group();
    const b = sph(1.0, c); b.scale.set(1.1, 0.7, 1.1); b.position.y = 0.6; g.add(b);
    const top = sph(0.7, c); top.scale.set(1, 0.6, 1); top.position.y = 1.0; g.add(top);
    g.position.set(x, 0, z); root.add(g);
    shade(x, z, 2.4, 2.4); colliders.push({ x, z, w: 1.8, d: 1.8 });
    interactables.push({ id: 'lounge', x: x, z: z + 2.4, r: 2.4, label: '🛋️ Flop down',
      seatPos: { x, z, y: 0 }, sitY, face: Math.PI, stepBack: { x, z: z + 2.2 } });
  }
  beanbag(1.8, 2.6, 0xe8748c, 0.95);

  // ---- coffee table with clutter ----
  const ct = add(tb(3.4, 0.18, 1.8, 0x8a5a32), -3, 1.0, 1.5);
  for (const [lx, lz] of [[-1.4, -0.7], [1.4, -0.7], [-1.4, 0.7], [1.4, 0.7]]) add(cyl(0.1, 0.12, 0.9, 8, 0x6e4626), -3 + lx, 0.45, 1.5 + lz);
  colliders.push({ x: -3, z: 1.5, w: 3.6, d: 2.0 }); shade(-3, 1.5, 4.2, 2.6);
  add(tb(0.8, 0.16, 1.0, 0xb5462f), -3.6, 1.17, 1.5).rotation.y = 0.3; // book
  add(tb(0.7, 0.14, 0.9, 0x3a6f9a), -3.45, 1.31, 1.6).rotation.y = 0.5;
  const mug = add(cyl(0.16, 0.14, 0.28, 10, 0xffffff), -2.2, 1.23, 1.2); // mug
  add(tb(0.5, 0.05, 0.9, 0x222), -2.0, 1.12, 2.0); // remote
  add(tb(1.3, 0.18, 1.3, 0xd9a441), -3.6, 1.18, 2.2).rotation.y = 0.2; // pizza box

  // ---- bookshelf (left wall) ----
  const bs = add(tb(2.2, 4.2, 1.0, 0x6b4a33), -W / 2 + 0.9, 2.1, -3);
  for (let r = 0; r < 4; r++) add(tb(2.0, 0.1, 0.9, 0x4a3322), -W / 2 + 0.9, 0.7 + r * 1.0, -3 + 0.02);
  const spineCols = [0x8c3b3b, 0x3f5e8c, 0x3f7a55, 0xb08a2e, 0x6e4a86];
  for (let r = 0; r < 4; r++) for (let b = 0; b < 5; b++) {
    const bk = add(tb(0.26, 0.7, 0.5, spineCols[(r + b) % 5]), -W / 2 + 0.4 + b * 0.34, 1.15 + r * 1.0, -2.6);
  }
  colliders.push({ x: -W / 2 + 0.9, z: -3, w: 2.4, d: 1.2 });

  // ---- floor lamp, plants, posters, wall clock, string lights, mini-fridge ----
  add(cyl(0.18, 0.22, 0.1, 12, 0x33353b), -12, 0.05, 6); // lamp base
  add(cyl(0.06, 0.06, 3.2, 8, 0x44464c), -12, 1.6, 6);
  add(new THREE.Mesh(new THREE.ConeGeometry(0.8, 0.9, 16), emi(0xfff0c4, 0xffcf7a, 0.5)), -12, 3.4, 6);
  const lampLight = new THREE.PointLight(0xffd29a, 18, 16, 2); lampLight.position.set(-12, 3.2, 6); root.add(lampLight);

  function plant(x, z, tall) {
    add(cyl(0.5, 0.4, 0.8, 12, 0xb5703f), x, 0.4, z);
    if (tall) { add(cyl(0.12, 0.16, 2.0, 8, 0x6e4a2e), x, 1.5, z); for (const [fx, fy, fz, r] of [[0, 2.7, 0, 0.9], [0.4, 2.4, 0.2, 0.6], [-0.4, 2.5, -0.2, 0.6]]) add(sph(r, 0x4f8a45), x + fx, fy, z + fz); }
    else { add(sph(0.85, 0x4f8a45), x, 1.35, z).scale.y = 1.1; add(sph(0.5, 0x5fa052), x + 0.35, 1.65, z + 0.2); }
    shade(x, z, 1.8, 1.8); colliders.push({ x, z, w: 1.1, d: 1.1 });
  }
  plant(-13, 8.5, true); plant(13, -8.5, false);

  function poster(x, y, z, ry, w, h, c) {
    const g = new THREE.Group();
    g.add(tb(w + 0.16, h + 0.16, 0.08, 0xf3ece0));
    const art = tb(w, h, 0.1, c); art.position.z = 0.02; g.add(art);
    g.position.set(x, y, z); g.rotation.y = ry; root.add(g);
  }
  poster(-W / 2 + 0.35, 3.2, 6, Math.PI / 2, 2.0, 2.6, 0xe8748c);
  poster(-W / 2 + 0.35, 3.2, 9.5, Math.PI / 2, 1.6, 2.2, 0x4f9e96);
  poster(W / 2 - 0.35, 3.0, -2, -Math.PI / 2, 2.2, 1.6, 0xf2a35c);

  // wall clock (back wall, above the TV accent)
  const clock = add(cyl(0.7, 0.7, 0.12, 22, 0xf3ece0), 6, 4.0, -D / 2 + 0.5); clock.rotation.x = Math.PI / 2;
  add(tb(0.06, 0.4, 0.04, 0x222), 6, 4.12, -D / 2 + 0.42);
  add(tb(0.28, 0.05, 0.04, 0x222), 6.1, 4.0, -D / 2 + 0.42);

  // string fairy-lights along the top of the back wall
  for (let i = 0; i < 14; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), emi(0xfff2c8, 0xffcf7a, 0.9));
    b.position.set(-W / 2 + 1.5 + i * 2, 4.4 + Math.sin(i) * 0.12, -D / 2 + 0.55); root.add(b);
  }

  // ---- mini-fridge + improved vending on the right wall ----
  const fridge = add(tb(1.6, 2.2, 1.4, 0xeef0f2), 13.2, 1.1, 10);
  add(tb(1.62, 0.1, 1.42, 0xd6d8da), 13.2, 1.45, 10); // door split
  add(tb(0.12, 0.5, 0.1, 0xbfc2c6), 12.9, 1.0, 10.75); // handle
  colliders.push({ x: 13.2, z: 10, w: 2.0, d: 1.8 });
  const vend = add(tb(1.8, 3.4, 1.3, 0xc0392b), 13.4, 1.7, 5.5);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.4), emi(0x9fd8e8, 0x2a4a55, 0.3)); glass.position.set(12.74, 2.0, 5.5); glass.rotation.y = -Math.PI / 2; root.add(glass);
  for (let r = 0; r < 3; r++) for (let cI = 0; cI < 3; cI++) add(tb(0.06, 0.3, 0.3, [0xffd166, 0x6be0a0, 0xff6b6b][(r + cI) % 3]), 12.7, 1.2 + r * 0.7, 5.0 + cI * 0.5);
  colliders.push({ x: 13.4, z: 5.5, w: 2.2, d: 1.7 });
  interactables.push({ id: 'vending', x: 11.8, z: 5.5, r: 2.2, label: '🥤 Vending machine' });

  // ---- improved games table (table-tennis) front-right ----
  const tt = add(tb(4.6, 0.18, 2.6, 0x1f7a52), 8, 1.0, 6);
  add(tb(4.6, 0.02, 0.08, 0xffffff), 8, 1.1, 6); // centre line
  add(tb(0.06, 0.5, 2.6, 0xeeeeee), 8, 1.25, 6); // net
  for (const [lx, lz] of [[-2.0, -1.0], [2.0, -1.0], [-2.0, 1.0], [2.0, 1.0]]) add(cyl(0.1, 0.1, 1.0, 8, 0x3a3f45), 8 + lx, 0.5, 6 + lz);
  for (const [px, pz, rot] of [[-1.4, 1.6, 0.4], [1.4, 0.4, -0.6]]) { const p = add(cyl(0.32, 0.32, 0.06, 14, 0xb5462f), 8 + px, 1.16, 6 + pz); p.rotation.x = Math.PI / 2; p.rotation.z = rot; }
  colliders.push({ x: 8, z: 6, w: 4.8, d: 2.8 }); shade(8, 6, 5.4, 3.4);

  // ---- warm cosy lighting ----
  root.add(new THREE.AmbientLight(0xffe7cf, 0.4));
  const warm = (x, y, z, i, dist) => { const L = new THREE.PointLight(0xffd6a8, i, dist, 2); L.position.set(x, y, z); root.add(L); };
  warm(-3, 4.5, 2, 26, 22); warm(8, 4, 4, 16, 18); warm(-3, 3.6, TVz + 2, 12, 14);

  // ---- doors + spawn ----
  const bedroomPad = new THREE.Mesh(new THREE.CircleGeometry(1.2, 16), emi(0xffd166, 0x6e5a1d, 0.6));
  bedroomPad.rotation.x = -Math.PI / 2; bedroomPad.position.set(8, 0.04, -9); root.add(bedroomPad);
  add(textSprite('MY ROOM', { size: 22 }), 8, 2.2, -9);
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
