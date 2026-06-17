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

  // ---- bookshelf (flush against the left wall, depth into the room) ----
  const bsX = -W / 2 + 0.7;
  add(tb(1.0, 4.2, 2.6, 0x6b4a33), bsX, 2.1, -3);
  const spineCols = [0x8c3b3b, 0x3f5e8c, 0x3f7a55, 0xb08a2e, 0x6e4a86];
  for (let r = 0; r < 4; r++) {
    add(tb(0.9, 0.1, 2.4, 0x4a3322), bsX + 0.05, 0.7 + r * 1.0, -3); // shelf board
    for (let b = 0; b < 6; b++) add(tb(0.45, 0.72, 0.3, spineCols[(r + b) % 5]), bsX + 0.3, 1.16 + r * 1.0, -4.1 + b * 0.42); // spines face +x
  }
  colliders.push({ x: bsX, z: -3, w: 1.2, d: 2.8 });

  // ---- floor lamp (gentle), plants, posters, wall clock, string lights, mini-fridge ----
  add(cyl(0.18, 0.22, 0.1, 12, 0x33353b), -12, 0.05, 6); // lamp base
  add(cyl(0.06, 0.06, 3.2, 8, 0x44464c), -12, 1.6, 6);
  add(new THREE.Mesh(new THREE.ConeGeometry(0.8, 0.9, 16), emi(0xfff0c4, 0xffcf7a, 0.14)), -12, 3.4, 6);
  const lampLight = new THREE.PointLight(0xffd29a, 3, 6, 2); lampLight.position.set(-12, 3.0, 6); root.add(lampLight);

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
  // vending machine: red body, yellow brand header, recessed glass display with
  // colourful snack rows, a control/coin panel and a dispenser tray (faces -x)
  const vx = 13.7;
  add(tb(1.6, 3.6, 1.6, 0xb83227), vx, 1.8, 5.5);                       // body
  add(tb(1.64, 0.55, 1.64, 0xe8c33a), vx, 3.45, 5.5);                  // header band
  add(tb(0.14, 2.4, 1.0, 0x12202a), vx - 0.74, 2.0, 5.2);             // recessed dark display
  for (let r = 0; r < 4; r++) for (let cI = 0; cI < 3; cI++)          // snacks behind the glass
    add(tb(0.1, 0.32, 0.26, [0xffd166, 0x6be0a0, 0xff6b6b, 0x6bb0ff][(r + cI) % 4]), vx - 0.78, 1.25 + r * 0.5, 4.85 + cI * 0.34);
  const vglass = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.4), emi(0xbfe6f0, 0x223844, 0.18));
  vglass.position.set(vx - 0.82, 2.0, 5.2); vglass.rotation.y = -Math.PI / 2; root.add(vglass);
  add(tb(0.14, 2.4, 0.4, 0x8a2018), vx - 0.74, 2.0, 6.1);             // side control panel
  for (let i = 0; i < 4; i++) add(tb(0.06, 0.12, 0.12, 0xf0e6c8), vx - 0.82, 2.7 - i * 0.3, 6.1); // buttons
  add(tb(0.1, 0.4, 0.5, 0x9aa0a6), vx - 0.8, 1.3, 6.1);              // coin slot panel
  add(tb(0.5, 0.5, 0.9, 0x101316), vx - 0.5, 0.55, 5.4);             // dispenser tray (bottom)
  colliders.push({ x: vx, z: 5.5, w: 1.8, d: 1.8 });
  interactables.push({ id: 'vending', x: vx - 1.5, z: 5.5, r: 2.4, label: '🥤 Vending machine' });

  // ---- improved games table (table-tennis) front-right ----
  const tt = add(tb(4.6, 0.18, 2.6, 0x1f7a52), 8, 1.0, 6);
  add(tb(4.6, 0.02, 0.08, 0xffffff), 8, 1.1, 6); // centre line
  add(tb(0.06, 0.5, 2.6, 0xeeeeee), 8, 1.25, 6); // net
  for (const [lx, lz] of [[-2.0, -1.0], [2.0, -1.0], [-2.0, 1.0], [2.0, 1.0]]) add(cyl(0.1, 0.1, 1.0, 8, 0x3a3f45), 8 + lx, 0.5, 6 + lz);
  // two paddles lying flat on the table (blade + handle) + a ball
  function paddle(px, pz, dir) {
    const blade = add(cyl(0.3, 0.3, 0.05, 16, 0xb5462f), px, 1.12, pz); blade.rotation.x = Math.PI / 2;
    add(tb(0.5, 0.05, 0.14, 0x5b3c25), px + dir * 0.4, 1.12, pz); // handle off the blade edge
  }
  paddle(6.6, 5.0, -1); paddle(9.3, 6.7, 1);
  add(sph(0.1, 0xfff0b0), 8.4, 1.15, 5.3); // ball
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
// A revamped dorm bedroom with a grid-based decorating editor: every piece of
// furniture lives in a `layout` (type + grid cell + rotation) that the player
// edits in-game. The editor interface is returned for main.js to drive.
function defaultLayout() {
  return [
    { t: 'bed', gx: -5, gz: -3, r: 0 },
    { t: 'nightstand', gx: -7, gz: -5, r: 0 },
    { t: 'desk', gx: 6, gz: -5, r: 0 },
    { t: 'bookshelf', gx: 8, gz: 1, r: 1 },
    { t: 'rug', gx: 0, gz: 2, r: 0 },
    { t: 'plant', gx: -7, gz: 5, r: 0 },
    { t: 'lamp', gx: 7, gz: 4, r: 0 },
    { t: 'beanbag', gx: 2, gz: 4, r: 0 },
  ];
}

export function buildBedroom(initialLayout) {
  const root = new THREE.Group();
  const colliders = [];
  const interactables = [];
  const W = 18, D = 14;
  const bounds = { minX: -W / 2 + 1, maxX: W / 2 - 1, minZ: -D / 2 + 1, maxZ: D / 2 - 1 };
  root.add(makeRoom(W, D, { wall: 0xbcd6e6 }));

  // local toon helpers
  const tb = (w, h, d, c) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toonMat(c)); m.castShadow = true; m.receiveShadow = true; return m; };
  const cyl = (rt, rb, h, n, c) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, n), toonMat(c)); m.castShadow = true; return m; };
  const sph = (r, c) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), toonMat(c)); m.castShadow = true; return m; };
  const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };
  const emi = (c, e, i = 0.5) => new THREE.MeshToonMaterial({ color: c, emissive: e, emissiveIntensity: i });

  // ---- shell: warm wood floor, accent wall, trim, window, soft lighting ----
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), toonMat(0xffffff, { map: woodPlanks('#caa775', '#a8804c') }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.011; floor.receiveShadow = true; root.add(floor);
  for (const [w, d, x, z] of [[W, 0.3, 0, -D / 2 + 0.3], [0.3, D, -W / 2 + 0.3, 0], [0.3, D, W / 2 - 0.3, 0]]) {
    root.add(at(tb(w, 0.5, d, 0xdfe7ee), x, 0.25, z));   // baseboard
    root.add(at(tb(w, 0.22, d, 0xf2f6fa), x, 4.85, z));  // crown
  }
  root.add(at(tb(W - 0.6, 4.4, 0.16, 0x8fb4d6), 0, 2.5, -D / 2 + 0.42)); // accent wall behind the bed
  // window on the left wall (warm daylight glow facing into the room, +x)
  root.add(at(tb(0.16, 2.9, 3.3, 0xf2f6fa), -W / 2 + 0.32, 3.0, 3));        // frame
  root.add(at(tb(0.1, 2.3, 2.9, 0x14181d), -W / 2 + 0.4, 3.0, 3));          // inner reveal
  root.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.3, 2.9), emi(0xdcecf4, 0xbcd6e0, 0.4)), -W / 2 + 0.46, 3.0, 3)); // glass
  for (const vz of [3 - 0.95, 3, 3 + 0.95]) root.add(at(tb(0.1, 2.3, 0.1, 0xf2f6fa), -W / 2 + 0.5, 3.0, vz)); // muntins
  root.add(at(tb(0.1, 0.1, 2.9, 0xf2f6fa), -W / 2 + 0.5, 3.0, 3));
  root.add(new THREE.AmbientLight(0xfff0dc, 0.4));
  const w1 = new THREE.PointLight(0xffe1bd, 14, 20, 2); w1.position.set(0, 4.4, 0); root.add(w1);
  const w2 = new THREE.PointLight(0xcfe2ff, 8, 16, 2); w2.position.set(-6, 3.6, 3); root.add(w2);

  // ================= furniture registry (built centred at origin, facing +z) =
  const FURNITURE = {
    bed: { name: 'Bed', icon: '🛏️', w: 3, d: 5, build() {
      const g = new THREE.Group();
      g.add(at(tb(3, 0.5, 5, 0x6b4a33), 0, 0.3, 0));
      g.add(at(tb(2.7, 0.4, 4.6, 0xf2ead6), 0, 0.65, 0));      // mattress
      g.add(at(tb(2.75, 0.3, 3.0, 0x4a78b0), 0, 0.9, 0.8));    // blanket
      g.add(at(tb(2.4, 0.18, 0.7, 0x3a5e8c), 0, 1.06, -0.2));  // folded blanket edge
      g.add(at(tb(1.5, 0.35, 0.9, 0xffffff), -0.6, 1.0, -1.9)); // pillows
      g.add(at(tb(1.5, 0.35, 0.9, 0xfdf0f0), 0.6, 1.0, -1.9));
      g.add(at(tb(3.1, 1.5, 0.3, 0x5b3c25), 0, 0.85, -2.45));  // headboard
      return g;
    } },
    desk: { name: 'Desk', icon: '🖥️', w: 3, d: 2, build() {
      const g = new THREE.Group();
      g.add(at(tb(3, 0.16, 2, 0x9a6a3f), 0, 1.05, 0));
      for (const [lx, lz] of [[-1.3, -0.8], [1.3, -0.8], [-1.3, 0.8], [1.3, 0.8]]) g.add(at(tb(0.18, 1.0, 0.18, 0x7a5230), lx, 0.5, lz));
      g.add(at(tb(1.4, 0.1, 0.95, 0xc8d2dc), 0, 1.16, 0.1));    // laptop base
      g.add(at(new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.85), emi(0x223040, 0x2a6f86, 0.6)), 0, 1.6, -0.35)); // screen
      g.add(at(tb(1.36, 0.9, 0.06, 0x14181d), 0, 1.6, -0.4));
      g.add(at(tb(0.5, 0.5, 0.4, 0xd64541), -1.0, 1.35, -0.3)); // book stack
      const chair = at(tb(1.0, 0.12, 1.0, 0x4a6ea8), 0, 0.55, 1.4); g.add(chair);
      for (const [lx, lz] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) g.add(at(cyl(0.05, 0.05, 0.55, 8, 0x33405a), lx, 0.28, 1.4 + lz));
      g.add(at(tb(1.0, 0.9, 0.12, 0x4a6ea8), 0, 1.0, 1.85));
      return g;
    } },
    bookshelf: { name: 'Bookshelf', icon: '📚', w: 2, d: 1, build() {
      const g = new THREE.Group();
      g.add(at(tb(2, 4, 1, 0x6b4a33), 0, 2, 0));
      const cols = [0x8c3b3b, 0x3f5e8c, 0x3f7a55, 0xb08a2e, 0x6e4a86];
      for (let r = 0; r < 4; r++) { g.add(at(tb(1.9, 0.1, 0.9, 0x4a3322), 0, 0.6 + r * 1.0, 0.02));
        for (let b = 0; b < 5; b++) g.add(at(tb(0.28, 0.7, 0.4, cols[(r + b) % 5]), -0.8 + b * 0.36, 1.05 + r * 1.0, 0.28)); }
      return g;
    } },
    dresser: { name: 'Dresser', icon: '🗄️', w: 2, d: 1, build() {
      const g = new THREE.Group();
      g.add(at(tb(2.4, 1.8, 1.1, 0x8a5a36), 0, 0.9, 0));
      for (let r = 0; r < 3; r++) { g.add(at(tb(2.2, 0.5, 0.06, 0x6e4626), 0, 0.45 + r * 0.55, 0.56));
        for (const kx of [-0.5, 0.5]) g.add(at(sph(0.07, 0xc99a3b), kx, 0.45 + r * 0.55, 0.62)); }
      g.add(at(cyl(0.3, 0.25, 0.4, 10, 0xc0633e), -0.6, 2.0, 0)); g.add(at(sph(0.5, 0x4f8a45), -0.6, 2.4, 0));
      return g;
    } },
    wardrobe: { name: 'Wardrobe', icon: '🚪', w: 2, d: 2, build() {
      const g = new THREE.Group();
      g.add(at(tb(2.4, 4.2, 1.6, 0x7a5230), 0, 2.1, 0));
      g.add(at(tb(1.1, 3.8, 0.06, 0x8a6240), -0.6, 2.1, 0.81)); g.add(at(tb(1.1, 3.8, 0.06, 0x8a6240), 0.6, 2.1, 0.81));
      for (const kx of [-0.15, 0.15]) g.add(at(cyl(0.05, 0.05, 0.5, 8, 0xc99a3b), kx, 2.1, 0.88));
      return g;
    } },
    sofa: { name: 'Sofa', icon: '🛋️', w: 3, d: 2, build() {
      const g = new THREE.Group(); const c = 0x6a83a6;
      g.add(at(tb(3, 0.5, 1.8, c), 0, 0.5, 0));
      for (const sx of [-1, 0, 1]) { g.add(at(tb(0.92, 0.4, 1.4, c), sx, 0.82, 0.1)); g.add(at(tb(0.92, 0.95, 0.4, c), sx, 1.25, -0.66)); }
      for (const s of [-1, 1]) { g.add(at(tb(0.4, 0.8, 1.8, c), s * 1.5, 0.95, 0)); }
      g.add(at(tb(0.55, 0.55, 0.2, 0xf2a35c), -0.7, 1.05, -0.1)); g.add(at(tb(0.55, 0.55, 0.2, 0x6be0a0), 0.7, 1.05, -0.1));
      return g;
    } },
    nightstand: { name: 'Nightstand', icon: '🕰️', w: 1, d: 1, build() {
      const g = new THREE.Group();
      g.add(at(tb(1.1, 1.1, 1.0, 0x8a5a36), 0, 0.55, 0));
      g.add(at(tb(1.0, 0.4, 0.06, 0x6e4626), 0, 0.6, 0.51)); g.add(at(sph(0.06, 0xc99a3b), 0, 0.6, 0.57));
      g.add(at(cyl(0.16, 0.2, 0.1, 10, 0x33353b), 0, 1.15, 0)); g.add(at(cyl(0.04, 0.04, 0.5, 8, 0x44464c), 0, 1.4, 0));
      g.add(at(new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.4, 14), emi(0xfff0c4, 0xffcf7a, 0.2)), 0, 1.75, 0));
      return g;
    } },
    tv: { name: 'TV', icon: '📺', w: 3, d: 1, build() {
      const g = new THREE.Group();
      g.add(at(tb(3, 0.6, 1.0, 0x5b3c25), 0, 0.3, 0));
      g.add(at(tb(2.6, 1.6, 0.16, 0x141519), 0, 1.7, 0));
      g.add(at(new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.4), emi(0x2c4f72, 0x356a9c, 0.6)), 0, 1.7, 0.1));
      g.add(at(tb(1.8, 0.2, 0.3, 0x202227), 0, 0.72, 0.2));
      return g;
    } },
    beanbag: { name: 'Beanbag', icon: '🫘', w: 2, d: 2, build() {
      const g = new THREE.Group();
      const b = sph(1.0, 0xd4823e); b.scale.set(1.1, 0.7, 1.1); g.add(at(b, 0, 0.6, 0));
      const t = sph(0.7, 0xd4823e); t.scale.set(1, 0.6, 1); g.add(at(t, 0, 1.0, 0));
      return g;
    } },
    plant: { name: 'Plant', icon: '🪴', w: 1, d: 1, build() {
      const g = new THREE.Group();
      g.add(at(cyl(0.45, 0.35, 0.8, 12, 0xc0633e), 0, 0.4, 0));
      g.add(at(cyl(0.1, 0.14, 1.6, 8, 0x6e4a2e), 0, 1.4, 0));
      for (const [fx, fy, fz, r] of [[0, 2.4, 0, 0.8], [0.4, 2.1, 0.2, 0.55], [-0.4, 2.2, -0.2, 0.55]]) g.add(at(sph(r, 0x4f8a45), fx, fy, fz));
      return g;
    } },
    lamp: { name: 'Floor lamp', icon: '💡', w: 1, d: 1, build() {
      const g = new THREE.Group();
      g.add(at(cyl(0.3, 0.34, 0.12, 12, 0x33353b), 0, 0.06, 0));
      g.add(at(cyl(0.05, 0.05, 2.8, 8, 0x44464c), 0, 1.4, 0));
      g.add(at(new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.7, 16), emi(0xfff0c4, 0xffcf7a, 0.18)), 0, 2.9, 0));
      return g;
    } },
    rug: { name: 'Rug', icon: '🟪', w: 4, d: 3, noCollide: true, build() {
      const g = new THREE.Group();
      const r = new THREE.Mesh(new THREE.PlaneGeometry(4, 3), toonMat(0x8a7bb0, { map: rugTexture('#8a7bb0', '#5d4f86') }));
      r.rotation.x = -Math.PI / 2; r.position.y = 0.02; r.receiveShadow = true; g.add(r);
      return g;
    } },
  };

  // ================= layout + rebuild =======================================
  const furnitureGroup = new THREE.Group(); root.add(furnitureGroup);
  let layout = Array.isArray(initialLayout) && initialLayout.length ? initialLayout : defaultLayout();
  const grid = { cell: 1, minX: -W / 2 + 0.8, maxX: W / 2 - 0.8, minZ: -D / 2 + 0.8, maxZ: D / 2 - 0.8 };

  function rebuild() {
    furnitureGroup.clear();
    colliders.length = 0;
    layout.forEach((item, i) => {
      const def = FURNITURE[item.t]; if (!def) return;
      const g = def.build();
      g.position.set(item.gx, 0, item.gz);
      g.rotation.y = (item.r || 0) * Math.PI / 2;
      g.userData.layoutIndex = i;
      furnitureGroup.add(g);
      if (!def.noCollide) {
        const odd = ((item.r || 0) % 2) === 1;
        colliders.push({ x: item.gx, z: item.gz, w: odd ? def.d : def.w, d: odd ? def.w : def.d });
      }
    });
  }
  rebuild();

  // ---- room editor pad + exit ----
  const pad = new THREE.Mesh(new THREE.CircleGeometry(1.1, 16), emi(0xe75480, 0x5c1d33, 0.5));
  pad.rotation.x = -Math.PI / 2; pad.position.set(0, 0.04, -1); root.add(pad);
  interactables.push({ id: 'decorate', x: 0, z: -1, r: 2.2, label: '🎨 Edit room' });
  addExitPad(root, 0, D / 2 - 1.8);
  interactables.push({ id: 'exit_bedroom', x: 0, z: D / 2 - 1.8, r: 2, label: '🚪 Back to common room' });

  // editor grid overlay (toggled by main.js in edit mode)
  const gridHelper = new THREE.GridHelper(Math.max(W, D), Math.max(W, D), 0xffffff, 0xaab0c0);
  gridHelper.position.y = 0.03; gridHelper.material.opacity = 0.32; gridHelper.material.transparent = true; gridHelper.visible = false;
  root.add(gridHelper);

  const editor = {
    types: Object.entries(FURNITURE).map(([id, d]) => ({ id, name: d.name, icon: d.icon })),
    grid, group: furnitureGroup,
    get layout() { return layout; },
    setLayout(l) { layout = l; rebuild(); },
    rebuild,
    add(typeId) { layout.push({ t: typeId, gx: 0, gz: 0, r: 0 }); rebuild(); return layout.length - 1; },
    showGrid(on) { gridHelper.visible = on; },
  };

  const spawn = { x: 0, z: D / 2 - 3.4 };
  return { root, colliders, interactables, bounds, spawn, editor };
}

// ------------------------------------------------------ lecture hall (room)
// The actual lecture hall: a flat hall with tiered seats facing a big screen +
// stage. Entered from the lobby; single level (no obstructing pillars).
export function buildLectureRoom() {
  const root = new THREE.Group();
  const colliders = [];
  const interactables = [];
  const W = 56, D = 46, WALL_H = 15;
  const bounds = { minX: -W / 2 + 1.5, maxX: W / 2 - 1.5, minZ: -D / 2 + 1.5, maxZ: D / 2 - 1.5 };
  const tb = (w, h, d, c) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toonMat(c)); m.castShadow = true; m.receiveShadow = true; return m; };
  const cyl = (rt, rb, h, n, c) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, n), toonMat(c)); m.castShadow = true; return m; };
  const at = (m, x, y, z) => { m.position.set(x, y, z); root.add(m); return m; };
  const emi = (c, e, i = 0.5) => new THREE.MeshToonMaterial({ color: c, emissive: e, emissiveIntensity: i });

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), toonMat(0xffffff, { map: woodPlanks('#b8ad99', '#9e9279') }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; root.add(floor);
  const wallMat = toonMat(0xdfe0d4, { map: plaster() });
  { const m = new THREE.Mesh(new THREE.BoxGeometry(W, WALL_H, 0.6), wallMat); m.position.set(0, WALL_H / 2, -D / 2); m.receiveShadow = true; root.add(m); }
  for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, WALL_H, D), wallMat); m.position.set(s * W / 2, WALL_H / 2, 0); m.receiveShadow = true; root.add(m); }

  // big screen on the back wall (clear of any pillars) + stage + podium
  const Sz = -D / 2 + 0.6;
  at(tb(20, 8, 0.4, 0x14181d), 0, 5.5, Sz);
  { const s = new THREE.Mesh(new THREE.PlaneGeometry(18.5, 7), emi(0x2c4f72, 0x3a6fa0, 0.5)); s.position.set(0, 5.5, Sz + 0.24); root.add(s); }
  for (const [sx, sy, c] of [[-5.5, 1.2, 0xff6b6b], [0, -0.6, 0xffd166], [5.5, 0.9, 0x6be0a0]]) {
    const q = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.4), emi(c, c, 0.32)); q.position.set(sx, 5.5 + sy, Sz + 0.26); root.add(q);
  }
  at(tb(26, 0.8, 6, 0x5b4a38), 0, 0.4, -D / 2 + 4); // stage (walkable; reached by the centre steps)
  // mini-stairs up to the stage at the centre front
  [[-15.4, 0.27], [-15.85, 0.53], [-16.0, 0.8]].forEach(([sz, h]) => at(tb(4.2, h, 0.5, 0x6e4a2e), 0, h / 2, sz));
  // curbs along the stage edges so it's only reachable via the centre steps
  colliders.push({ x: -8, z: -16, w: 11, d: 0.6 }); colliders.push({ x: 8, z: -16, w: 11, d: 0.6 });   // front (gap x[-2.5,2.5])
  colliders.push({ x: -13, z: -19, w: 0.6, d: 6 }); colliders.push({ x: 13, z: -19, w: 0.6, d: 6 });     // sides
  at(tb(1.6, 1.7, 1.2, 0x6e4a2e), -8, 1.65, -D / 2 + 6.5); at(tb(1.8, 0.12, 1.4, 0x4a3322), -8, 2.5, -D / 2 + 6.5); // podium (on the raised stage)
  colliders.push({ x: -8, z: -D / 2 + 6.5, w: 1.8, d: 1.4 });
  { const ps = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.5), emi(0x223040, 0x2a6f86, 0.5)); ps.position.set(-8, 1.95, -D / 2 + 5.9); root.add(ps); }

  // auditorium seats — fabric-textured, all FACING THE SCREEN (-z), every seat
  // sit-able, with walkable cross-aisles between rows so they're all reachable
  const fabricRed = toonMat(0xffffff, { map: fabricTexture('#8a3b3b') });
  const tbm = (w, h, d, m) => { const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); me.castShadow = true; me.receiveShadow = true; return me; };
  function seat(x, z) {
    at(tbm(1.3, 0.42, 1.2, fabricRed), x, 0.5, z);
    at(tbm(1.3, 0.95, 0.22, fabricRed), x, 1.05, z + 0.56); // back (+z, behind the sitter)
    at(tb(1.05, 0.08, 0.7, 0x6e4626), x, 0.82, z - 0.55);   // fold-down desk (-z, in front)
    for (const ax of [-0.6, 0.6]) at(tb(0.12, 0.42, 0.12, 0x4a4a52), x + ax, 0.21, z + 0.1); // armrest legs
    colliders.push({ x, z, w: 1.3, d: 1.5 }); // per-seat → can walk between rows AND columns
    // prompt centred on the seat so you sit in the seat you're standing next to
    interactables.push({ id: 'lounge', x, z, r: 1.9, label: '🪑 Take a seat',
      seatPos: { x, z, y: 0 }, sitY: 0.74, face: Math.PI, stepBack: { x, z: z + 2.1 } });
  }
  const rows = [-10, -6.2, -2.4, 1.4, 5.2, 9, 12.8];
  for (const rz of rows) for (const sx of [-14, -10, -6, 6, 10, 14]) seat(sx, rz);
  // central carpet runner down the aisle
  { const r = new THREE.Mesh(new THREE.PlaneGeometry(3, 30), toonMat(0xffffff, { map: rugTexture('#6e2f2f', '#4a1f1f') })); r.rotation.x = -Math.PI / 2; r.position.set(0, 0.02, 2); root.add(r); }
  // stage dressing: side curtains + valance, a plant, and a mic on the podium
  for (const cx of [-11.5, 11.5]) at(tb(2.2, 9.5, 0.6, 0x7a2030), cx, 5, Sz + 0.35);
  at(tb(25, 1.6, 0.7, 0x7a2030), 0, 9.7, Sz + 0.35);
  at(cyl(0.5, 0.4, 0.9, 12, 0xb5703f), 9, 1.25, -D / 2 + 5.5); { const f = at(new THREE.Mesh(new THREE.SphereGeometry(0.95, 12, 10), toonMat(0x4f8a45)), 9, 2.3, -D / 2 + 5.5); f.scale.y = 1.1; }
  at(cyl(0.03, 0.03, 0.7, 6, 0x33353b), -8, 2.7, -D / 2 + 6.0); at(new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), toonMat(0x222)), -8, 3.05, -D / 2 + 6.0); // mic
  // gentle decorative columns at the far sides (well clear of the screen)
  for (const cx of [-25, 25]) for (const cz of [-6, 10]) {
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.56, WALL_H, 16), toonMat(0xe7ddc9));
    sh.position.set(cx, WALL_H / 2, cz); sh.castShadow = true; root.add(sh);
    colliders.push({ x: cx, z: cz, w: 1.4, d: 1.4 });
  }
  // warm wall sconces down both sides
  for (const sz of [-6, 4, 14]) for (const s of [-1, 1]) at(new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.6, 12), emi(0xfff0c4, 0xffcf7a, 0.3)), s * (W / 2 - 0.5), 7, sz);

  root.add(new THREE.AmbientLight(0xeef0ff, 0.45));
  const pl = (x, y, z, i, dist, c = 0xfff0d8) => { const L = new THREE.PointLight(c, i, dist, 2); L.position.set(x, y, z); root.add(L); };
  pl(0, 11, 4, 30, 46); pl(0, 8, -16, 22, 28, 0x9fc0ff); pl(-14, 8, 8, 14, 24); pl(14, 8, 8, 14, 24);

  addExitPad(root, 0, D / 2 - 2);
  interactables.push({ id: 'exit_lecture_room', x: 0, z: D / 2 - 2, r: 2.4, label: '🚪 Back to lobby' });
  const spawn = { x: 0, z: D / 2 - 5 };
  // raises the player onto the 0.8-high stage; only the centre-front steps ramp
  // up (the edges are curbed), so you climb the stairs to get on stage
  const groundHeight = (x, z) => {
    if (x < -13 || x > 13) return 0;
    if (z <= -16) return 0.8;                  // up on the stage
    if (x < -2.5 || x > 2.5 || z >= -15.4) return 0; // off the stairs / in front
    return 0.8 * (-15.4 - z) / 0.6;            // centre ramp z[-16,-15.4]
  };
  return { root, colliders, interactables, bounds, spawn, groundHeight };
}

// ------------------------------------------------------ lecture lobby
// The entrance lobby for the lecture building: a welcoming foyer with a
// reception, a waiting lounge, a directory, plants, vending, a door into the
// lecture hall, and a staircase up to a study mezzanine (pomodoro desks).
export function buildLectureLobby() {
  const root = new THREE.Group();
  const colliders = [];
  const colliders1 = [];
  const interactables = [];
  const seatPositions = [];
  const W = 42, D = 34, WALL_H = 16, MEZZ_Y = 6, DECK_FRONT = -9;
  const bounds = { minX: -W / 2 + 1.5, maxX: W / 2 - 1.5, minZ: -D / 2 + 1.5, maxZ: D / 2 - 1.5 };
  const tb = (w, h, d, c) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toonMat(c)); m.castShadow = true; m.receiveShadow = true; return m; };
  const cyl = (rt, rb, h, n, c) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, n), toonMat(c)); m.castShadow = true; return m; };
  const sph = (r, c) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), toonMat(c)); m.castShadow = true; return m; };
  const at = (m, x, y, z) => { m.position.set(x, y, z); root.add(m); return m; };
  const emi = (c, e, i = 0.5) => new THREE.MeshToonMaterial({ color: c, emissive: e, emissiveIntensity: i });

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), toonMat(0xffffff, { map: woodPlanks('#cdbfa6', '#b3a589') }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; root.add(floor);
  const wallMat = toonMat(0xe9e2d0, { map: plaster() });
  { const m = new THREE.Mesh(new THREE.BoxGeometry(W, WALL_H, 0.6), wallMat); m.position.set(0, WALL_H / 2, -D / 2); m.receiveShadow = true; root.add(m); }
  for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, WALL_H, D), wallMat); m.position.set(s * W / 2, WALL_H / 2, 0); m.receiveShadow = true; root.add(m); }
  for (const [w, d, x, z] of [[W, 0.3, 0, -D / 2 + 0.3], [0.3, D, -W / 2 + 0.3, 0], [0.3, D, W / 2 - 0.3, 0]]) at(tb(w, 0.6, d, 0xcfc6b2), x, 0.3, z);

  // ---- textured material kit + helpers for the upgraded furnishings ----
  const fabricBlue = toonMat(0x52688f, { map: fabricTexture('#3f5578') });
  const fabricGold = toonMat(0xb0843e, { map: fabricTexture('#8f6a2e') });
  const woodWarm = toonMat(0xffffff, { map: woodPlanks('#9a6a3f', '#7a5230') });
  const woodDark = toonMat(0xffffff, { map: woodPlanks('#5b3c25', '#46301f') });
  const woodFeet = toonMat(0x4a3322);
  const tbm = (w, h, d, m) => { const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); me.castShadow = true; me.receiveShadow = true; return me; };
  const cylm = (rt, rb, h, n, m) => { const me = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, n), m); me.castShadow = true; return me; };
  const gat = (g, m, x, y, z) => { m.position.set(x, y, z); g.add(m); return m; };
  const shadowMat = new THREE.MeshBasicMaterial({ map: softShadow(), transparent: true, depthWrite: false });
  const shade = (x, z, sx, sz = sx) => { const dq = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), shadowMat); dq.rotation.x = -Math.PI / 2; dq.position.set(x, 0.02, z); root.add(dq); };

  // ---- reception desk (detailed): counter, monitor, keyboard, lamp, bell ----
  at(tbm(8, 1.3, 2, woodWarm), 0, 0.65, 8); at(tbm(8.5, 0.18, 2.4, woodDark), 0, 1.42, 8);
  at(tbm(7.4, 0.5, 0.08, toonMat(0xc9a13b)), 0, 1.0, 9.0); // brass front accent
  colliders.push({ x: 0, z: 8, w: 8.4, d: 2.2 });
  at(tbm(1.4, 0.9, 0.08, toonMat(0x14181d)), 1.6, 2.0, 8.4); { const sc = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.7), emi(0x223040, 0x2a8f86, 0.5)); sc.position.set(1.6, 2.0, 8.36); root.add(sc); }
  at(tbm(0.9, 0.05, 0.4, toonMat(0x33353b)), 1.6, 1.55, 9.0);
  at(cylm(0.18, 0.2, 0.1, 12, toonMat(0x9aa6ae)), -2, 1.56, 8.6); at(cylm(0.04, 0.04, 0.5, 8, toonMat(0x44464c)), -2, 1.8, 8.6); at(new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.3, 12), emi(0xfff0c4, 0xffcf7a, 0.22)), -2, 2.15, 8.6);
  at(sph(0.14, 0xc99a3b), 0, 1.56, 8.7); at(tbm(0.7, 0.1, 0.5, toonMat(0xf2ece0)), -0.9, 1.55, 8.7);

  // ---- waiting lounge: rounded textured sofa + armchairs in a CIRCLE ----
  const rug = new THREE.Mesh(new THREE.CircleGeometry(5, 32), toonMat(0x8a9bb0, { map: rugTexture('#8a9bb0', '#5d6e86') }));
  rug.rotation.x = -Math.PI / 2; rug.position.set(-12, 0.03, 4); root.add(rug);
  function armchair(x, z, ry, mat, pcol) {
    const g = new THREE.Group();
    gat(g, tbm(1.9, 0.45, 1.9, mat), 0, 0.5, 0);
    const cu = cylm(0.85, 0.85, 0.4, 18, mat); cu.scale.z = 0.95; gat(g, cu, 0, 0.82, 0.1);
    gat(g, tbm(1.85, 1.35, 0.45, mat), 0, 1.25, -0.78);
    const br = cylm(0.28, 0.28, 1.85, 14, mat); br.rotation.z = Math.PI / 2; gat(g, br, 0, 1.9, -0.78);
    for (const ax of [-1, 1]) {
      gat(g, tbm(0.45, 0.7, 1.7, mat), ax * 0.92, 0.95, 0);
      const ar = cylm(0.26, 0.26, 1.7, 14, mat); ar.rotation.x = Math.PI / 2; gat(g, ar, ax * 0.92, 1.32, 0);
      for (const fz of [-0.7, 0.7]) gat(g, cylm(0.12, 0.1, 0.3, 8, woodFeet), ax * 0.8, 0.15, fz);
    }
    if (pcol) { const p = tbm(0.6, 0.6, 0.22, toonMat(pcol)); p.rotation.z = 0.3; gat(g, p, 0, 1.18, 0.12); }
    g.position.set(x, 0, z); g.rotation.y = ry; root.add(g);
    shade(x, z, 2.6, 2.6); colliders.push({ x, z, w: 2.0, d: 2.0 });
    const fx = Math.sin(ry), fz = Math.cos(ry);
    interactables.push({ id: 'lounge', x: x + fx * 2.4, z: z + fz * 2.4, r: 2.4, label: '🛋️ Relax', seatPos: { x, z, y: 0 }, sitY: 1.0, face: ry, stepBack: { x: x + fx * 2.2, z: z + fz * 2.2 } });
  }
  function sofa(x, z, ry, mat, pcols) {
    const g = new THREE.Group();
    gat(g, tbm(4.4, 0.45, 1.9, mat), 0, 0.5, 0);
    for (const cx of [-1.35, 0, 1.35]) { gat(g, tbm(1.28, 0.4, 1.6, mat), cx, 0.82, 0.12); gat(g, tbm(1.28, 1.05, 0.45, mat), cx, 1.3, -0.72); }
    const br = cylm(0.26, 0.26, 4.4, 14, mat); br.rotation.z = Math.PI / 2; gat(g, br, 0, 1.92, -0.72);
    for (const ax of [-1, 1]) { gat(g, tbm(0.45, 0.8, 1.9, mat), ax * 2.0, 1.0, 0); const ar = cylm(0.28, 0.28, 1.9, 14, mat); ar.rotation.x = Math.PI / 2; gat(g, ar, ax * 2.0, 1.4, 0); }
    pcols.forEach((pc, i) => { const p = tbm(0.6, 0.6, 0.22, toonMat(pc)); p.rotation.z = i ? -0.25 : 0.3; gat(g, p, i ? 1.3 : -1.3, 1.18, -0.1); });
    g.position.set(x, 0, z); g.rotation.y = ry; root.add(g);
    const a = Math.abs(Math.sin(ry)); shade(x, z, 5, 2.4); colliders.push({ x, z, w: 4.6 * (1 - a) + 2.2 * a, d: 2.2 * (1 - a) + 4.6 * a });
    const fx = Math.sin(ry), fz = Math.cos(ry);
    interactables.push({ id: 'lounge', x: x + fx * 2.6, z: z + fz * 2.6, r: 2.6, label: '🛋️ Relax', seatPos: { x, z, y: 0 }, sitY: 1.05, face: ry, stepBack: { x: x + fx * 2.4, z: z + fz * 2.4 } });
  }
  // arranged around the coffee table at (-12,4), all facing the centre
  sofa(-12, -1, 0, fabricBlue, [0xf2a35c, 0x6be0a0]);    // faces +z (toward centre), moved back for access
  armchair(-8, 4, -Math.PI / 2, fabricGold, 0xe8748c);   // faces -x
  armchair(-16, 4, Math.PI / 2, fabricGold, 0x6bb0ff);   // faces +x
  // round coffee table + clutter
  (function roundTable(x, z) {
    const g = new THREE.Group();
    gat(g, cylm(1.3, 1.3, 0.16, 24, woodWarm), 0, 1.0, 0); gat(g, cylm(1.15, 1.15, 0.18, 24, woodWarm), 0, 0.85, 0);
    for (const a of [0, 1, 2, 3]) gat(g, cylm(0.1, 0.13, 0.85, 10, woodDark), Math.cos(a * Math.PI / 2) * 0.9, 0.42, Math.sin(a * Math.PI / 2) * 0.9);
    g.position.set(x, 0, z); root.add(g); shade(x, z, 3, 3); colliders.push({ x, z, w: 2, d: 2 });
  })(-12, 4);
  at(tbm(0.8, 0.08, 1.0, toonMat(0x3a6f9a)), -12.3, 1.13, 4.2).rotation.y = 0.3;
  at(tbm(0.7, 0.08, 0.9, toonMat(0xb5462f)), -11.6, 1.17, 3.7).rotation.y = -0.4;
  // warm pendant over the lounge
  at(tbm(0.08, 6, 0.08, toonMat(0x2c2c2c)), -12, 7, 4);
  at(new THREE.Mesh(new THREE.ConeGeometry(0.85, 0.95, 16), toonMat(0x3a3f45)), -12, 4.1, 4);
  at(new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 12), emi(0xfff4cf, 0xffe9a8, 0.4)), -12, 3.75, 4);
  { const L = new THREE.PointLight(0xffe9b0, 8, 13, 2); L.position.set(-12, 3.7, 4); root.add(L); }

  // ---- plants, water cooler, directory, posters, and a detailed vending ----
  function plant(x, z) { at(cyl(0.5, 0.4, 0.8, 12, 0xb5703f), x, 0.4, z); const f = at(sph(0.95, 0x4f8a45), x, 1.45, z); f.scale.y = 1.1; shade(x, z, 1.6, 1.6); colliders.push({ x, z, w: 1.1, d: 1.1 }); }
  plant(-19, 12); plant(19, 12); plant(-19, -6);
  at(cyl(0.4, 0.4, 1.4, 12, 0xdfe6ec), 18, 0.7, 11); at(cyl(0.45, 0.45, 0.3, 12, 0x9fc7d8), 18, 1.55, 11); colliders.push({ x: 18, z: 11, w: 1, d: 1 });
  at(tb(0.2, 3.2, 4.2, 0x2a3a3a), W / 2 - 0.4, 4, -2); { const b = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.8), emi(0x1a2a2a, 0x2a4a4a, 0.25)); b.position.set(W / 2 - 0.52, 4, -2); b.rotation.y = -Math.PI / 2; root.add(b); }
  at(tb(2.2, 2.8, 0.12, 0xe8748c), -W / 2 + 0.35, 4, 8).rotation.y = Math.PI / 2;
  at(tb(1.8, 2.4, 0.12, 0x4f9e96), -W / 2 + 0.35, 4, 12).rotation.y = Math.PI / 2;
  // vending machine (glass front + snack rows + control panel + tray)
  const vx = 19;
  at(tb(1.6, 3.6, 1.6, 0xb83227), vx, 1.8, 6); at(tb(1.64, 0.55, 1.64, 0xe8c33a), vx, 3.45, 6);
  at(tb(0.14, 2.4, 1.0, 0x12202a), vx - 0.74, 2.0, 5.7);
  for (let r = 0; r < 4; r++) for (let cI = 0; cI < 3; cI++) at(tb(0.1, 0.32, 0.26, [0xffd166, 0x6be0a0, 0xff6b6b, 0x6bb0ff][(r + cI) % 4]), vx - 0.78, 1.25 + r * 0.5, 5.35 + cI * 0.34);
  { const vg = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.4), emi(0xbfe6f0, 0x223844, 0.18)); vg.position.set(vx - 0.82, 2.0, 5.7); vg.rotation.y = -Math.PI / 2; root.add(vg); }
  at(tb(0.14, 2.4, 0.4, 0x8a2018), vx - 0.74, 2.0, 6.6); for (let i = 0; i < 4; i++) at(tb(0.06, 0.12, 0.12, 0xf0e6c8), vx - 0.82, 2.7 - i * 0.3, 6.6);
  at(tb(0.5, 0.5, 0.9, 0x101316), vx - 0.5, 0.55, 5.9); colliders.push({ x: vx, z: 6, w: 1.8, d: 1.8 });
  interactables.push({ id: 'vending', x: vx - 1.5, z: 6, r: 2.4, label: '🥤 Vending machine' });

  // ---- door into the lecture hall (back wall, glowing portal) ----
  const pad = new THREE.Mesh(new THREE.CircleGeometry(1.4, 20), emi(0x6bb0ff, 0x1d3a5c, 0.6));
  pad.rotation.x = -Math.PI / 2; pad.position.set(-8, 0.04, -D / 2 + 2.2); root.add(pad);
  at(tb(4.6, 5.2, 0.4, 0x3a4a5c), -8, 2.6, -D / 2 + 0.5); at(tb(3.4, 4.4, 0.2, 0x223a52), -8, 2.4, -D / 2 + 0.72);
  at(textSprite('🏛️ Lecture Hall →', { size: 22 }), -8, 4.0, -D / 2 + 0.9);
  interactables.push({ id: 'enter_lecture_room', x: -8, z: -D / 2 + 2.2, r: 2.4, label: '🏛️ Enter Lecture Hall' });

  // ---- mezzanine study deck + railing + stairs (right) ----
  function column(x, z) { const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, WALL_H, 16), toonMat(0xe7ddc9)); sh.position.set(x, WALL_H / 2, z); sh.castShadow = true; root.add(sh); at(tb(1.3, 0.5, 1.3, 0xe7ddc9), x, 0.25, z); colliders.push({ x, z, w: 1.4, d: 1.4 }); colliders1.push({ x, z, w: 1.4, d: 1.4 }); }
  for (const cx of [-14, -4, 6]) column(cx, DECK_FRONT);
  const deckDepth = (D / 2 - 0.3) + DECK_FRONT;
  { const deck = tb(W - 4, 0.6, deckDepth, 0xb88a5c); deck.position.set(0, MEZZ_Y - 0.3, -(D / 2 - 0.3) + deckDepth / 2); root.add(deck); }
  (function rail(x0, x1) { const len = x1 - x0, cx = (x0 + x1) / 2; at(tb(len, 0.2, 0.18, 0x8a623f), cx, MEZZ_Y + 0.95, DECK_FRONT); at(tb(len, 0.16, 0.16, 0x8a623f), cx, MEZZ_Y + 0.4, DECK_FRONT); const np = Math.max(1, Math.round(len / 2)); for (let i = 0; i <= np; i++) at(tb(0.14, 1.0, 0.14, 0x8a623f), x0 + (i / np) * len, MEZZ_Y + 0.5, DECK_FRONT); })(-19, 10);

  const STAIR_X = 14, zB = -2, zT = DECK_FRONT, run = zB - zT;
  for (let i = 0; i < 12; i++) { const t = (i + 1) / 12, topY = t * MEZZ_Y; const z = zB - run * (i + 0.5) / 12; at(tb(7, topY, run / 12 + 0.05, 0xb88a5c), STAIR_X, topY / 2, z); at(tb(3, 0.08, run / 12 + 0.05, 0xa6452f), STAIR_X, topY + 0.05, z); }
  colliders.push({ x: STAIR_X, z: (zT + (zB - 1)) / 2, w: 7, d: (zB - 1) - zT }); // collider leaves a bottom landing
  const stairs = [{ xMin: 10.5, xMax: 17.5, zMin: zT, zMax: zB, zBottom: zB, zTop: zT, yBottom: 0, yTop: MEZZ_Y }];

  // upstairs study carrels (pomodoro)
  let seatNum = 1;
  // antique-pine study carrels matching the library: knobbed drawers + kneehole,
  // turned legs, banker's lamp, privacy panels + a back hutch with little books
  function turnedLeg(x, by, z, h) { at(cyl(0.09, 0.13, h, 10, 0x7a5230), x, by + h / 2, z); at(cyl(0.15, 0.15, 0.12, 10, 0x7a5230), x, by + h * 0.6, z); }
  function studyDesk(dx, dz) {
    const y = MEZZ_Y, zf = dz + 1.0;
    at(tb(4.4, 0.16, 2.2, 0x9a6a3f), dx, y + 1.0, dz); at(tb(4.6, 0.07, 2.35, 0x9a6a3f), dx, y + 0.93, dz);
    for (const sxn of [-1, 1]) {
      at(tb(1.3, 0.52, 0.12, 0x9a6a3f), dx + sxn * 1.35, y + 0.66, zf); at(tb(1.15, 0.02, 0.14, 0x6e4a24), dx + sxn * 1.35, y + 0.66, zf + 0.005);
      for (const dyv of [0.78, 0.54]) at(sph(0.07, 0xc99a3b), dx + sxn * 1.35, y + dyv, zf + 0.12);
    }
    at(tb(4.4, 0.4, 0.12, 0x9a6a3f), dx, y + 0.74, dz - 1.0); for (const xx of [2.0, -2.0]) at(tb(0.12, 0.4, 2.0, 0x9a6a3f), dx + xx, y + 0.74, dz);
    for (const lx of [-2.0, 2.0]) for (const lz of [-0.95, 0.95]) turnedLeg(dx + lx, y, dz + lz, 0.84);
    // banker's lamp
    at(cyl(0.2, 0.24, 0.06, 16, 0xc99a3b), dx + 1.4, y + 1.1, dz - 0.5); at(cyl(0.045, 0.055, 0.4, 8, 0xc99a3b), dx + 1.4, y + 1.32, dz - 0.5);
    { const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.85, 16), toonMat(0x1d6b43)); sh.rotation.z = Math.PI / 2; sh.position.set(dx + 1.4, y + 1.58, dz - 0.5); sh.castShadow = true; root.add(sh); }
    at(tb(0.85, 0.16, 1.1, 0x46532f), dx - 1.3, y + 1.16, dz - 0.2); // book
    // privacy panels + back hutch with books
    for (const xx of [2.3, -2.3]) at(tb(0.1, 1.5, 2.4, 0x8a6240), dx + xx, y + 1.85, dz);
    at(tb(4.7, 1.6, 0.12, 0x8a6240), dx, y + 1.9, dz - 1.15); at(tb(4.3, 0.1, 0.5, 0x8a6240), dx, y + 2.1, dz - 0.95);
    [0x5e2b2b, 0x33445e, 0x8a6a24].forEach((c, i) => at(tb(0.5, 0.5, 0.2, c), dx - 1.4 + i * 1.4, y + 2.4, dz - 0.95));
    colliders1.push({ x: dx, z: dz - 0.2, w: 5.0, d: 3.0 });
    at(tb(1.1, 0.55, 1.1, 0x7a5230), dx, y + 0.28, dz + 2.4); at(tb(1.1, 1.1, 0.18, 0x7a5230), dx, y + 0.95, dz + 2.9);
    const seatPos = { x: dx, z: dz + 2.4, y: MEZZ_Y }; seatPositions.push(seatPos);
    interactables.push({ id: 'study_seat', seat: seatNum++, x: dx, z: dz + 2.4 + 1.5, r: 2.0, label: '🪑 Sit & study', seatPos });
  }
  for (const dx of [-16, -9, 0] /* clear of the deck columns at -14,-4,6 */) studyDesk(dx, -13.5);

  root.add(new THREE.AmbientLight(0xfff2e0, 0.55));
  const pl = (x, y, z, i, dist) => { const L = new THREE.PointLight(0xfff0d8, i, dist, 2); L.position.set(x, y, z); root.add(L); };
  pl(0, 9, 4, 30, 40); pl(-12, 7, 4, 16, 22); pl(14, 7, 6, 14, 22); pl(0, 7, -12, 16, 24);

  addExitPad(root, 8, D / 2 - 2);
  interactables.push({ id: 'exit_lecture', x: 8, z: D / 2 - 2, r: 2.4, label: '🚪 Leave Building' });
  const spawn = { x: 8, z: D / 2 - 5 };

  const bounds1 = { minX: -W / 2 + 2, maxX: W / 2 - 2, minZ: -D / 2 + 2.5, maxZ: zB };
  colliders1.push({ x: (-W / 2 + 2 + 10.5) / 2, z: -5, w: 10.5 - (-W / 2 + 2), d: 8 }); // void left of stair
  colliders1.push({ x: (17.5 + W / 2 - 2) / 2, z: -5, w: (W / 2 - 2) - 17.5, d: 8 });     // void right of stair
  const levels = [{ y: 0, bounds, colliders }, { y: MEZZ_Y, bounds: bounds1, colliders: colliders1 }];
  return { root, colliders, interactables, bounds, spawn, seatPositions, levels, stairs };
}
