// Interior locations: library (study seats), dorm common room, and the
// player's bedroom (rebuilt from saved decor choices).

import * as THREE from 'three';
import { textSprite } from './world.js';
import { PALETTE } from './palette.js';
import { toonMat, woodPlanks, plaster, bookcaseTexture, glowTexture, softShadow, hardwoodFloor, stoneFloor, brickTexture, fabricTexture, rugTexture, glassCurtain } from './textures.js';
import { FOOD_MODELS } from './foodModels.js';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import { createPet, setWearables } from './petFactory.js';
import { FURNITURE } from './furniture.js';

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

// -------------------------------------------------- local canvas textures
// Procedural textures for the interior remodel, kept local so textures.js
// stays untouched. All ≤512px, each built once at room-construction time.
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

// green chalkboard with hand-written chalk lines (equations / menu items)
function chalkboardTexture(lines, { bg = '#2c4438', accent = '#f7e7a8' } = {}) {
  return canvasTex(512, 320, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    // chalk dust smudges
    for (let i = 0; i < 26; i++) {
      g.fillStyle = `rgba(255,255,255,${0.02 + (i % 3) * 0.012})`;
      g.beginPath(); g.ellipse((i * 97) % w, (i * 61) % h, 26 + (i % 5) * 9, 10 + (i % 4) * 5, i, 0, Math.PI * 2); g.fill();
    }
    g.textBaseline = 'middle';
    lines.forEach((ln, i) => {
      g.font = `${ln.big ? 34 : 24}px "Comic Sans MS", "Segoe Print", cursive`;
      g.fillStyle = ln.accent ? accent : 'rgba(240,240,232,0.92)';
      g.fillText(ln.t, 26 + (ln.x || 0), 38 + i * 40);
      if (ln.underline) { g.strokeStyle = 'rgba(240,240,232,0.7)'; g.lineWidth = 2; g.beginPath(); g.moveTo(24, 56 + i * 40); g.lineTo(24 + g.measureText(ln.t).width, 58 + i * 40); g.stroke(); }
    });
  });
}

// cork notice board with pinned, slightly-askew papers + coloured pins
function corkboardTexture(seed = 3) {
  return canvasTex(512, 384, (g, w, h) => {
    g.fillStyle = '#c89b62'; g.fillRect(0, 0, w, h);
    let s = seed;
    const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${120 + rnd() * 60 | 0},${80 + rnd() * 40 | 0},40,0.15)`; g.fillRect(rnd() * w, rnd() * h, 3, 3); }
    const papers = [['#fdf6e3', 0], ['#fef3f3', 1], ['#eef6fd', 0], ['#fdfbe8', 1], ['#f3fdf0', 0], ['#fdf6e3', 1]];
    const pins = ['#e05252', '#3a7bd5', '#3fa652', '#e8b524'];
    papers.forEach(([col], i) => {
      const px = 24 + (i % 3) * 160 + rnd() * 24, py = 30 + Math.floor(i / 3) * 175 + rnd() * 22;
      const pw = 110 + rnd() * 26, ph = 130 + rnd() * 22, rot = (rnd() - 0.5) * 0.16;
      g.save(); g.translate(px + pw / 2, py + ph / 2); g.rotate(rot);
      g.fillStyle = 'rgba(60,40,20,0.25)'; g.fillRect(-pw / 2 + 4, -ph / 2 + 5, pw, ph); // shadow
      g.fillStyle = col; g.fillRect(-pw / 2, -ph / 2, pw, ph);
      g.strokeStyle = 'rgba(90,90,110,0.5)'; g.lineWidth = 2;
      for (let l = 0; l < 5; l++) { g.beginPath(); g.moveTo(-pw / 2 + 12, -ph / 2 + 28 + l * 18); g.lineTo(pw / 2 - 12 - rnd() * 20, -ph / 2 + 28 + l * 18); g.stroke(); }
      g.fillStyle = pins[i % 4]; g.beginPath(); g.arc(0, -ph / 2 + 8, 7, 0, Math.PI * 2); g.fill();
      g.restore();
    });
  });
}

// dark 90s-arcade carpet: deep indigo with neon confetti squiggles (tiling)
function confettiCarpetTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#241f3d'; g.fillRect(0, 0, w, h);
    let s = 11; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (let i = 0; i < 240; i++) g.fillRect(rnd() * w, rnd() * h, 2, 2);
    const cols = ['#ff5fa2', '#ffd166', '#3fe0c0', '#6bb0ff', '#c084e0'];
    for (let i = 0; i < 46; i++) {
      const col = cols[i % cols.length]; const x = rnd() * w, y = rnd() * h, k = i % 3;
      g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 3.2;
      if (k === 0) { // squiggle
        g.beginPath(); g.moveTo(x, y);
        g.quadraticCurveTo(x + 9, y - 10, x + 18, y); g.quadraticCurveTo(x + 27, y + 10, x + 36, y); g.stroke();
      } else if (k === 1) { // triangle
        g.save(); g.translate(x, y); g.rotate(rnd() * Math.PI);
        g.beginPath(); g.moveTo(0, -7); g.lineTo(6, 5); g.lineTo(-6, 5); g.closePath(); g.fill(); g.restore();
      } else { g.beginPath(); g.arc(x, y, 3.6, 0, Math.PI * 2); g.fill(); }
    }
  }, [4, 4]);
}

// glowing neon lettering on a transparent ground (used on MeshBasicMaterial
// planes with additive-ish transparency, so it reads full-bright at night)
function neonTextTexture(text, color = '#ff5fa2', { w = 512, h = 128, size = 82 } = {}) {
  return canvasTex(w, h, (g) => {
    g.clearRect(0, 0, w, h);
    g.font = `bold ${size}px "Arial Black", system-ui, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = 26;
    g.strokeStyle = color; g.lineWidth = 5;
    g.strokeText(text, w / 2, h / 2 + 4);
    g.strokeText(text, w / 2, h / 2 + 4);
    g.shadowBlur = 8; g.fillStyle = '#fff6fb'; g.fillText(text, w / 2, h / 2 + 4);
  });
}

// university crest: shield + open book + banner, painted once for the walls
function crestTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const cx = w / 2;
    g.beginPath(); g.moveTo(cx - 78, 42); g.lineTo(cx + 78, 42); g.lineTo(cx + 78, 130);
    g.quadraticCurveTo(cx + 78, 190, cx, 224); g.quadraticCurveTo(cx - 78, 190, cx - 78, 130); g.closePath();
    g.fillStyle = '#274a73'; g.fill(); g.lineWidth = 8; g.strokeStyle = '#c9a13b'; g.stroke();
    g.fillStyle = '#c9a13b'; g.fillRect(cx - 62, 96, 124, 10);
    // open book
    g.fillStyle = '#f3ecd8';
    g.beginPath(); g.moveTo(cx, 130); g.quadraticCurveTo(cx - 44, 116, cx - 50, 128); g.lineTo(cx - 50, 162); g.quadraticCurveTo(cx - 20, 152, cx, 166); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(cx, 130); g.quadraticCurveTo(cx + 44, 116, cx + 50, 128); g.lineTo(cx + 50, 162); g.quadraticCurveTo(cx + 20, 152, cx, 166); g.closePath(); g.fill();
    g.font = 'bold 34px Georgia, serif'; g.textAlign = 'center'; g.fillStyle = '#f3ecd8';
    g.fillText('B U', cx, 82);
    // banner below
    g.fillStyle = '#8a1f2d'; g.fillRect(cx - 92, 226, 184, 26);
    g.font = 'bold 17px Georgia, serif'; g.fillStyle = '#f3ecd8'; g.fillText('BIRCHWOOD', cx, 244);
  });
}

// tall drape with soft vertical folds (repeats horizontally across a panel)
function curtainTexture(base = '#a44a3c', dark = '#7c3026') {
  return canvasTex(128, 256, (g, w, h) => {
    const grad = () => { const gr = g.createLinearGradient(0, 0, 32, 0); gr.addColorStop(0, dark); gr.addColorStop(0.45, base); gr.addColorStop(1, dark); return gr; };
    for (let x = 0; x < w; x += 32) { g.save(); g.translate(x, 0); g.fillStyle = grad(); g.fillRect(0, 0, 32, h); g.restore(); }
    g.fillStyle = 'rgba(255,235,200,0.07)';
    for (let x = 10; x < w; x += 32) g.fillRect(x, 0, 6, h);
  }, [2, 1]);
}

// vertical felt pennant with a college letter
function pennantBannerTexture(col = '#8a1f2d', trim = '#c9a13b', letter = 'B') {
  return canvasTex(128, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.beginPath(); g.moveTo(6, 6); g.lineTo(w - 6, 6); g.lineTo(w - 6, h * 0.62); g.lineTo(w / 2, h - 8); g.lineTo(6, h * 0.62); g.closePath();
    g.fillStyle = col; g.fill(); g.lineWidth = 7; g.strokeStyle = trim; g.stroke();
    g.font = 'bold 84px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = trim; g.fillText(letter, w / 2, h * 0.34);
  });
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
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), toonMat(0xc2a377, { map: hardwoodFloor('#a5825c') }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.012; floor.receiveShadow = true; root.add(floor);
  const shadowMat = new THREE.MeshBasicMaterial({ map: softShadow(), transparent: true, depthWrite: false });
  const shade = (x, z, sx, sz = sx) => { const d = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), shadowMat); d.rotation.x = -Math.PI / 2; d.position.set(x, 0.02, z); root.add(d); };
  // layered rugs: a big woven area rug with a smaller round rug thrown on top
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(12, 8.5), toonMat(0x9c6a4e, { map: rugTexture('#a4714f', '#6e4632') }));
  rug.rotation.x = -Math.PI / 2; rug.position.set(-3, 0.03, 2); root.add(rug);
  const rug2 = new THREE.Mesh(new THREE.CircleGeometry(3.1, 28), toonMat(0xd8b98a, { map: rugTexture('#dcc296', '#b08a58') }));
  rug2.rotation.x = -Math.PI / 2; rug2.rotation.z = 0.4; rug2.position.set(-4.2, 0.045, 1.2); root.add(rug2);

  // ---- wall trim: baseboard + crown + a feature wall behind the TV ----
  const baseMat = 0xc7bcd2, crownMat = 0xeae3f0;
  const trim = (w, h, d, c, x, y, z) => add(tb(w, h, d, c), x, y, z);
  for (const [w, d, x, z] of [[W, 0.3, 0, -D / 2 + 0.3], [0.3, D, -W / 2 + 0.3, 0], [0.3, D, W / 2 - 0.3, 0]]) {
    trim(w, 0.5, d, baseMat, x, 0.25, z);  // baseboard
    trim(w, 0.25, d, crownMat, x, 4.85, z); // crown
  }
  // ---- fireplace focal wall: brick chimney breast, crackling hearth, mantel
  // shelf with keepsakes, and the TV mounted above — the couch cluster (kept in
  // place) now faces a proper cozy hearth. (assets/fireplace.glb belongs to the
  // library, so this hearth is built procedurally.)
  const TVz = -D / 2 + 0.9;
  const flames = []; // animated by the returned animate()
  const brickMat = toonMat(0xd8b09a, { map: brickTexture('#b07860', '#e2d4c2') });
  const hearthStone = toonMat(0x9d948a);
  { const breast = new THREE.Mesh(new THREE.BoxGeometry(5.2, 5, 1.0), brickMat); breast.position.set(-3, 2.5, -D / 2 + 0.85); breast.castShadow = true; root.add(breast);
    add(tb(5.8, 0.34, 1.7, 0x8d857b), -3, 0.17, TVz + 0.25);            // stone hearth slab
    add(tb(2.6, 2.0, 0.5, 0x17100a), -3, 1.24, TVz + 0.42);             // firebox recess
    add(tb(3.2, 0.22, 0.5, 0x8d857b), -3, 2.34, TVz + 0.44);            // stone lintel
    for (const s of [-1, 1]) add(tb(0.36, 2.1, 0.5, 0x8d857b), -3 + s * 1.62, 1.2, TVz + 0.44); // stone jambs
    add(tb(5.6, 0.28, 1.2, 0x5b3c25), -3, 2.62, TVz + 0.3);             // walnut mantel shelf
    // hearth fire: logs + embers + licking cone flames + a warm glow sprite
    const fz = TVz + 0.78; // fire sits proud of the firebox face so it reads clearly
    const logMat = toonMat(0x3a2114);
    for (const [lx, lr] of [[-0.3, 0.35], [0.3, -0.3]]) { const lg = add(cyl(0.13, 0.13, 1.1, 8, 0x3a2114), -3 + lx, 0.36, fz); lg.rotation.z = Math.PI / 2; lg.rotation.y = lr; lg.material = logMat; }
    add(tb(1.1, 0.12, 0.5, 0xd83a12), -3, 0.3, fz).material = new THREE.MeshToonMaterial({ color: 0xd83a12, emissive: 0xb82808, emissiveIntensity: 0.8 });
    const fcols = [[0xd2300e, 0xa82006], [0xf25216, 0xd2300e], [0xff7a26, 0xe24f14], [0xff9a36, 0xff6a1e]];
    for (let i = 0; i < 7; i++) {
      const mid = 1 - Math.abs(i - 3) / 3;
      const [c, e] = fcols[Math.min(3, Math.round((1 - mid) * 3))];
      const fl = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.42 + mid * 0.5, 8),
        new THREE.MeshToonMaterial({ color: c, emissive: e, emissiveIntensity: 0.8 }));
      fl.position.set(-3 + (i % 3 - 1) * 0.34, 0.55 + mid * 0.16, fz + (i % 2) * 0.1 - 0.05);
      root.add(fl);
      flames.push({ mesh: fl, baseY: fl.position.y, phase: i * 1.7, speed: 6 + i * 0.6 });
    }
    const fireSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('255,150,70'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.95 }));
    fireSpr.scale.set(4.6, 3.4, 1); fireSpr.position.set(-3, 1.0, fz + 0.5); root.add(fireSpr);
    flames.spr = fireSpr;
    // mantel keepsakes: candles, framed photo, tiny plant, book pile
    for (const [cx2, ch] of [[-5.0, 0.5], [-4.55, 0.34]]) { add(cyl(0.07, 0.09, ch, 8, 0xefe6cf), cx2, 2.76 + ch / 2, TVz + 0.3); add(sph(0.05, 0xffb060), cx2, 2.8 + ch + 0.03, TVz + 0.3).material = new THREE.MeshToonMaterial({ color: 0xffcaa0, emissive: 0xff9d4a, emissiveIntensity: 0.6 }); }
    add(tb(0.55, 0.7, 0.08, 0x8a6240), -1.4, 3.1, TVz + 0.28); add(tb(0.4, 0.55, 0.1, 0x9fd0e8), -1.4, 3.1, TVz + 0.3);
    add(cyl(0.16, 0.13, 0.24, 10, 0xc07a45), -0.85, 2.88, TVz + 0.28); add(sph(0.22, 0x4f8a45), -0.85, 3.14, TVz + 0.28);
    add(tb(0.6, 0.12, 0.42, 0xb5462f), -3.9, 2.82, TVz + 0.3).rotation.y = 0.25;
  }
  colliders.push({ x: -3, z: TVz, w: 7.2, d: 1.6 });
  // wall-mounted TV above the mantel (smaller, so the hearth stays the hero)
  const bezel = add(tb(4.2, 2.3, 0.18, 0x141519), -3, 3.82, TVz + 0.62);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(3.9, 2.0), emi(0x2c4f72, 0x356a9c, 0.6));
  screen.position.set(-3, 3.82, TVz + 0.73); root.add(screen);
  for (const [sx, sy, c] of [[-1.1, 0.25, 0xff6b6b], [0.15, -0.22, 0x6be0a0], [1.1, 0.35, 0xffd166]]) { // "game" UI blobs
    const q = new THREE.Mesh(new THREE.PlaneGeometry(0.65, 0.42), emi(c, c, 0.5)); q.position.set(-3 + sx, 3.82 + sy, TVz + 0.74); root.add(q);
  }
  // little media cabinet beside the chimney (console + controller live here now)
  add(tb(2.0, 0.9, 1.1, 0x6b4a33), 1.6, 0.56, TVz + 0.15);
  add(tb(1.0, 0.18, 0.62, 0x25262b), 1.35, 1.1, TVz + 0.3);
  add(tb(0.45, 0.12, 0.5, 0x33353b), 2.15, 1.07, TVz + 0.35);
  colliders.push({ x: 1.6, z: TVz + 0.15, w: 2.2, d: 1.4 });

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

  // ---- kitchenette along the left wall: cabinets, counter, sink, kettle ----
  { const kx = -W / 2 + 0.85, kz = 3.8, cabMat = toonMat(0x7a5a3c), cream = toonMat(0xefe6d4);
    add(tb(1.5, 0.18, 5.9, 0x4a3624), kx, 0.09, kz);                    // kick
    add(tb(1.5, 0.95, 5.6, 0x7a5a3c), kx, 0.62, kz);                    // base cabinets
    add(tb(1.72, 0.12, 5.95, 0xe8dcc8), kx, 1.16, kz);                  // counter top
    for (const dz of [-2.0, -0.7, 0.7, 2.0]) {                          // door fronts + knobs
      add(tb(0.08, 0.78, 1.14, 0x8a6a48), kx + 0.78, 0.6, kz + dz);
      add(sph(0.05, 0xc9a13b), kx + 0.86, 0.62, kz + dz + 0.35);
    }
    add(tb(0.9, 0.08, 1.3, 0x3d4650), kx + 0.2, 1.2, kz + 1.7);         // inset sink basin
    { const fc = add(cyl(0.05, 0.05, 0.6, 8, 0xb8bec6), kx - 0.35, 1.5, kz + 1.7); fc.rotation.z = 0.0;
      const sp = add(cyl(0.04, 0.04, 0.5, 8, 0xb8bec6), kx - 0.12, 1.78, kz + 1.7); sp.rotation.z = Math.PI / 2; }
    // kettle: squat body + spout + handle on a little emissive warm base
    add(cyl(0.24, 0.3, 0.4, 14, 0xd45a45), kx + 0.1, 1.44, kz - 1.6);
    add(sph(0.1, 0xd45a45), kx + 0.1, 1.68, kz - 1.6);
    { const spout = add(cyl(0.045, 0.07, 0.3, 8, 0xd45a45), kx + 0.42, 1.52, kz - 1.6); spout.rotation.z = -0.9; }
    add(tb(0.06, 0.22, 0.3, 0x33353b), kx - 0.24, 1.52, kz - 1.6);
    for (const [mz, mc] of [[-0.6, 0xffd166], [-0.25, 0x6be0a0]]) { add(cyl(0.09, 0.08, 0.18, 10, mc), kx + 0.3, 1.32, kz + mz); }
    add(tb(0.7, 0.05, 0.45, 0xc9a06a), kx + 0.15, 1.25, kz + 0.35);     // cutting board
    add(cyl(0.26, 0.2, 0.14, 12, 0x8fb4d6), kx + 0.1, 1.28, kz - 0.95); // fruit bowl
    for (const [fx2, fz2, fc2] of [[0, -0.06, 0xe8748c], [0.12, 0.06, 0xffd166], [-0.1, 0.08, 0x6be0a0]]) add(sph(0.09, fc2), kx + 0.1 + fx2, 1.38, kz - 0.95 + fz2);
    // upper cabinets + open shelf with jars, and a warm under-cabinet glow
    add(tb(1.05, 1.15, 3.6, 0x7a5a3c), kx - 0.2, 3.55, kz - 0.5);
    for (const dz of [-1.35, -0.45, 0.45, 1.35]) add(tb(0.08, 0.95, 0.82, 0x8a6a48), kx + 0.35, 3.52, kz - 0.5 + dz);
    add(tb(0.9, 0.08, 1.6, 0x8a6a48), kx - 0.15, 3.1, kz + 2.2);        // open shelf
    for (const [jz, jc] of [[1.8, 0xd8b98a], [2.2, 0x9fc78a], [2.6, 0xcf8a5a]]) { add(cyl(0.11, 0.11, 0.3, 10, jc), kx - 0.15, 3.3, kz + jz); add(cyl(0.12, 0.12, 0.05, 10, 0x5a4632), kx - 0.15, 3.47, kz + jz); }
    { const strip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 3.4), emi(0xffe9c0, 0xffd28a, 0.85)); strip.position.set(kx + 0.32, 2.94, kz - 0.5); root.add(strip); }
    colliders.push({ x: kx, z: kz, w: 1.9, d: 6.1 });
    shade(kx + 0.4, kz, 2.4, 6.4);
  }

  // ---- floor lamp (gentle) tucked in the back-left corner ----
  add(cyl(0.18, 0.22, 0.1, 12, 0x33353b), -13, 0.05, -8.6); // lamp base
  add(cyl(0.06, 0.06, 3.2, 8, 0x44464c), -13, 1.6, -8.6);
  add(new THREE.Mesh(new THREE.ConeGeometry(0.8, 0.9, 16), emi(0xfff0c4, 0xffcf7a, 0.3)), -13, 3.4, -8.6);
  const lampLight = new THREE.PointLight(0xffd29a, 3, 6, 2); lampLight.position.set(-13, 3.0, -8.6); root.add(lampLight);

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
  poster(W / 2 - 0.35, 3.1, 2, -Math.PI / 2, 1.8, 2.3, 0xe8748c);
  poster(11, 3.2, -D / 2 + 0.45, 0, 1.7, 2.2, 0x4f9e96);

  // ---- curtained window on the right wall (warm evening light) ----
  { const wx = W / 2 - 0.35, wz = -2;
    add(tb(0.16, 3.0, 3.6, 0xefe6d4), wx, 3.0, wz);                                   // frame
    { const gl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.5, 3.0), emi(0xf4e2b8, 0xe8c382, 0.55)); gl.position.set(wx - 0.06, 3.0, wz); root.add(gl); }
    add(tb(0.1, 2.5, 0.1, 0xefe6d4), wx - 0.12, 3.0, wz);                             // muntins
    add(tb(0.1, 0.1, 3.0, 0xefe6d4), wx - 0.12, 3.0, wz);
    add(tb(0.16, 0.18, 4.6, 0x6b4a33), wx - 0.2, 4.7, wz);                            // curtain rod
    for (const s of [-1, 1]) { const cu = new THREE.Mesh(new THREE.BoxGeometry(0.28, 3.4, 1.0), toonMat(0xffffff, { map: curtainTexture('#b0684e', '#82442f') })); cu.position.set(wx - 0.3, 2.95, wz + s * 1.95); cu.castShadow = true; root.add(cu); }
    add(tb(0.5, 0.14, 3.8, 0xe8dcc8), wx - 0.3, 1.42, wz);                            // window sill
    add(cyl(0.12, 0.1, 0.2, 10, 0xc07a45), wx - 0.35, 1.6, wz - 1.0);                 // little succulent on the sill
    add(sph(0.14, 0x5fa052), wx - 0.35, 1.78, wz - 1.0);
  }

  // ---- bulletin board with pinned notes (back wall, by the bedroom door) ----
  add(tb(2.9, 2.3, 0.12, 0x6e4f30), 4.6, 3.3, -D / 2 + 0.45);
  { const cork = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.0), toonMat(0xffffff, { map: corkboardTexture(6) })); cork.position.set(4.6, 3.3, -D / 2 + 0.54); root.add(cork); }

  // ---- framed doorway for "MY ROOM" so the pad reads as a real door ----
  add(tb(3.2, 4.4, 0.22, 0x8a6a48), 8, 2.2, -D / 2 + 0.44);
  add(tb(2.5, 3.9, 0.14, 0x5b3c25), 8, 1.95, -D / 2 + 0.56);
  for (const py of [1.0, 2.6]) add(tb(1.7, 1.1, 0.06, 0x6b4a33), 8, py, -D / 2 + 0.65); // door panels
  add(sph(0.09, 0xc9a13b), 8.95, 1.9, -D / 2 + 0.68);                                  // knob

  // wall clock (back wall, right section)
  const clock = add(cyl(0.7, 0.7, 0.12, 22, 0xf3ece0), 13, 4.0, -D / 2 + 0.5); clock.rotation.x = Math.PI / 2;
  add(tb(0.06, 0.4, 0.04, 0x222), 13, 4.12, -D / 2 + 0.42);
  add(tb(0.28, 0.05, 0.04, 0x222), 13.1, 4.0, -D / 2 + 0.42);

  // string fairy-lights swagged around three walls, with soft glow sprites
  { const bulbGeo = new THREE.SphereGeometry(0.11, 8, 8);
    const bulbMat = emi(0xfff2c8, 0xffcf7a, 0.9);
    const wireMat = toonMat(0x4a4038);
    const strGlow = glowTexture('255,214,150');
    const sprMat = new THREE.SpriteMaterial({ map: strGlow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 });
    const hang = (x, z, i) => {
      const b = new THREE.Mesh(bulbGeo, bulbMat); b.position.set(x, 4.35 + Math.sin(i * 1.1) * 0.16, z); root.add(b);
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.03), wireMat); w.position.set(x, b.position.y + 0.16, z); root.add(w);
      if (i % 3 === 1) { const s = new THREE.Sprite(sprMat); s.scale.set(1.5, 1.5, 1); s.position.copy(b.position); root.add(s); }
    };
    for (let i = 0; i < 14; i++) hang(-W / 2 + 1.5 + i * 2, -D / 2 + 0.55, i);
    for (let i = 0; i < 9; i++) { hang(-W / 2 + 0.55, -D / 2 + 2.2 + i * 2.1, i + 3); hang(W / 2 - 0.55, -D / 2 + 2.2 + i * 2.1, i + 7); }
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
  // hearth flicker: licking flames + a breathing glow sprite (no dynamic light)
  function animate(t) {
    for (const f of flames) {
      const s = 0.7 + 0.5 * Math.abs(Math.sin(t * f.speed + f.phase));
      f.mesh.scale.set(0.85 + 0.2 * Math.sin(t * f.speed * 1.4 + f.phase), s, 0.85 + 0.2 * Math.cos(t * f.speed + f.phase));
      f.mesh.material.emissiveIntensity = 0.55 + 0.28 * Math.abs(Math.sin(t * f.speed + f.phase));
      f.mesh.position.y = f.baseY + (s - 1) * 0.16;
    }
    if (flames.spr) { const k = 0.9 + 0.1 * Math.sin(t * 9) + 0.05 * Math.sin(t * 23); flames.spr.scale.set(4.2 * k, 3.2 * k, 1); }
  }
  return { root, colliders, interactables, bounds, spawn, animate };
}

// ------------------------------------------------------------ campus store
// A cozy campus store you can walk into: a central reception counter where you
// browse & buy, display mannequin-pets wearing featured outfits, a small
// furniture showroom, pendant lighting, and a fitting-room corner with a mirror
// that opens the try-on view. Returns the standard interior bundle.
export function buildShop() {
  const root = new THREE.Group();
  const colliders = [];
  const interactables = [];
  const W = 28, D = 22;
  const bounds = { minX: -W / 2 + 1, maxX: W / 2 - 1, minZ: -D / 2 + 1, maxZ: D / 2 - 1 };
  root.add(makeRoom(W, D, { wall: 0xfaf0dc })); // bright warm cream walls

  // local toon helpers
  const tb = (w, h, d, c) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toonMat(c)); m.castShadow = true; m.receiveShadow = true; return m; };
  const cyl = (rt, rb, h, n, c) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, n), toonMat(c)); m.castShadow = true; return m; };
  const sph = (r, c) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 12), toonMat(c)); m.castShadow = true; return m; };
  const add = (m, x, y, z) => { m.position.set(x, y, z); root.add(m); return m; };
  const emi = (c, e, i = 0.6) => new THREE.MeshToonMaterial({ color: c, emissive: e, emissiveIntensity: i });
  const shadowMat = new THREE.MeshBasicMaterial({ map: softShadow(), transparent: true, depthWrite: false });
  const shade = (x, z, sx, sz = sx) => { const dd = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), shadowMat); dd.rotation.x = -Math.PI / 2; dd.position.set(x, 0.02, z); root.add(dd); };

  // ---- warm wood floor + entrance rug ----
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), toonMat(0xffffff, { map: woodPlanks('#caa572', '#a87f4a') }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.012; floor.receiveShadow = true; root.add(floor);
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(7, 4), toonMat(0xcf6f5a, { map: rugTexture('#cf6f5a', '#9c4636') }));
  rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.03, D / 2 - 4.5); root.add(rug);
  // rug runners guiding the two shopping aisles (boutique wayfinding)
  const runnerMat = toonMat(0xffffff, { map: rugTexture('#3f9c93', '#2a6e66') });
  { const r1 = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 5.2), runnerMat); r1.rotation.x = -Math.PI / 2; r1.position.set(0, 0.028, 2.2); root.add(r1);
    const r2 = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 1.9), runnerMat); r2.rotation.x = -Math.PI / 2; r2.position.set(5.6, 0.028, 4.6); root.add(r2); }

  // ---- wall trim: baseboard, crown, a teal wainscot band, and a candy-striped
  // valance up top — the same teal+cream+red palette as the storefront outside --
  const TEAL = 0x2f9c93, CREAM = 0xfff1dd, REDA = 0xd95b4a;
  for (const [w, d, x, z] of [[W, 0.3, 0, -D / 2 + 0.3], [0.3, D, -W / 2 + 0.3, 0], [0.3, D, W / 2 - 0.3, 0]]) {
    add(tb(w, 0.5, d, 0xd8c4a6), x, 0.25, z);   // baseboard
    add(tb(w, 0.7, d, TEAL), x, 1.15, z);        // teal wainscot band
    add(tb(w, 0.22, d, 0xeadfc8), x, 1.55, z);   // wainscot cap
    add(tb(w, 0.3, d, CREAM), x, 4.82, z);       // crown
  }
  // striped valance running along the back wall (alternating red/cream blocks)
  for (let i = 0; i < 14; i++) {
    add(tb(W / 14 - 0.02, 0.55, 0.18, i % 2 ? REDA : CREAM), -W / 2 + (i + 0.5) * (W / 14), 4.35, -D / 2 + 0.42);
  }

  // ---- bright windows letting daylight in (matches the exterior display glass) --
  const winGlass = emi(0xeaf6ff, 0xcfe6f4, 0.55);
  function windowOnWall(cx, cy, cz, ry, ww = 2.8, wh = 2.6) {
    const grp = new THREE.Group();
    grp.add(at2(tb(ww + 0.5, wh + 0.5, 0.18, CREAM), 0, 0, 0));                                  // frame
    const glass = new THREE.Mesh(new THREE.BoxGeometry(ww, wh, 0.1), winGlass); glass.position.z = 0.07; grp.add(glass);  // bright glass, proud of the frame
    grp.add(at2(tb(0.12, wh, 0.16, CREAM), 0, 0, 0.06));                                          // vertical muntin
    grp.add(at2(tb(ww, 0.12, 0.16, CREAM), 0, 0, 0.06));                                          // horizontal muntin
    grp.add(at2(tb(ww + 0.7, 0.22, 0.4, 0xb98a5e), 0, -wh / 2 - 0.3, 0.05));                      // sill
    grp.position.set(cx, cy, cz); grp.rotation.y = ry; root.add(grp);
  }
  const at2 = (m, x, y, z) => { m.position.set(x, y, z); return m; };
  for (const wz of [3.5, -4.5]) windowOnWall(-W / 2 + 0.25, 3.0, wz, Math.PI / 2);  // left wall
  windowOnWall(W / 2 - 0.25, 3.0, -6.5, -Math.PI / 2);                              // right wall (behind showroom)
  for (const wx of [-10.5, 10.5]) windowOnWall(wx, 3.4, -D / 2 + 0.25, 0);          // back wall, flanking the shelf

  // ---- central reception counter (where you buy) ----
  const cz = -2;
  add(tb(7, 1.2, 1.6, 0x7a4f30), 0, 0.6, cz);          // counter body
  add(tb(7.4, 0.18, 2.0, 0x9a6a3f), 0, 1.28, cz);      // overhanging top
  add(tb(6.6, 0.7, 0.08, 0xb5895a), 0, 0.6, cz + 0.82); // front kick panel
  add(tb(0.85, 0.55, 0.6, 0x33353b), -1.7, 1.62, cz);  // register body
  const regScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.4), emi(0x2c4f72, 0x59c0e0, 0.7));
  regScreen.position.set(-1.7, 1.7, cz + 0.31); root.add(regScreen);
  add(sph(0.18, 0xffd166), 1.8, 1.55, cz);             // candy bowl on the counter
  // backboard display shelf behind the counter
  add(tb(8, 3.4, 0.4, 0x8a6240), 0, 1.9, -D / 2 + 0.8);
  const goodCols = [0xd64541, 0x3a6ea8, 0x6be0a0, 0xffd166, 0x8e6bbf];
  for (let r = 0; r < 3; r++) {
    add(tb(7.2, 0.12, 0.7, 0x6e4626), 0, 1.1 + r * 1.05, -D / 2 + 1.1);
    for (let b = 0; b < 6; b++) add(tb(0.5, 0.6, 0.4, goodCols[(r + b) % 5]), -2.7 + b * 1.06, 1.45 + r * 1.05, -D / 2 + 1.2);
  }
  colliders.push({ x: 0, z: cz, w: 7.6, d: 1.8 }); shade(0, cz, 9, 3.2);
  const sign = textSprite('🛍️ Campus Store'); sign.position.set(0, 4.2, cz + 0.6); root.add(sign);
  interactables.push({ id: 'shop_buy', x: 0, z: cz + 2.5, r: 2.5, label: '🛍️ Browse & buy' });

  // ---- display mannequins: plain white duck-shaped forms wearing featured
  // items (built without coats/faces, then re-skinned to a single matte white) --
  const mannequinMat = toonMat(0xf3efe6); // soft matte white, no pattern
  function pedestal(x, z) { add(cyl(0.7, 0.82, 0.5, 16, 0xe8dcc6), x, 0.25, z); shade(x, z, 2, 2); colliders.push({ x, z, w: 1.4, d: 1.4 }); }
  function mannequin(x, z, equipped, ry) {
    pedestal(x, z);
    const pet = createPet('creature', {}); // duck form, no items yet
    // recolour the body to matte white but keep the dark back-side toon outline,
    // so it reads as a clean mannequin silhouette
    pet.traverse((o) => { if (o.isMesh && o.material && o.material.side !== THREE.BackSide) o.material = mannequinMat; });
    if (equipped) setWearables(pet, equipped); // add the coloured item on top
    pet.position.set(x, 0.5, z); pet.rotation.y = ry; pet.scale.setScalar(0.92);
    if (pet.userData.animate) pet.userData.animate(0, false); // settle to idle pose
    root.add(pet);
  }
  mannequin(-10, 5, { hat: 'gradcap' }, 0.5);
  mannequin(-10, 0.5, { face: 'glasses' }, 0.25);
  mannequin(-10, -4, { neck: 'scarf' }, 0.05);
  mannequin(-6.5, -6.5, { hat: 'cap_red' }, 0.8);

  // ---- small furniture showroom (right-back ambiance) ----
  add(tb(3, 0.5, 4.6, 0x6b4a33), 9, 0.3, -6).rotation.y = 0;          // staged bed base
  add(tb(2.7, 0.4, 4.2, 0xf2ead6), 9, 0.62, -6);                       // mattress
  add(tb(2.7, 0.3, 2.6, 0x4a78b0), 9, 0.9, -5);                        // blanket
  add(tb(1.4, 0.32, 0.85, 0xffffff), 9, 0.95, -7.7);                   // pillow
  add(tb(3.1, 1.4, 0.3, 0x5b3c25), 9, 0.85, -8.2);                     // headboard
  colliders.push({ x: 9, z: -6, w: 3.2, d: 4.8 }); shade(9, -6, 4, 5.4);
  add(cyl(0.3, 0.34, 0.12, 12, 0x33353b), 12, 0.06, -1);               // floor lamp
  add(cyl(0.05, 0.05, 2.8, 8, 0x44464c), 12, 1.4, -1);
  add(new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.7, 16), emi(0xfff0c4, 0xffcf7a, 0.18)), 12, 2.9, -1);

  // ---- fitting-room corner (clean): a low platform with a wall-mounted
  // full-length mirror and a little stool — no overhead rails or curtains ----
  const fxp = W / 2 - 3.2, fzp = 4;
  add(tb(5, 0.22, 5.4, 0xc9a978), fxp, 0.11, fzp);                       // raised platform
  add(tb(4.4, 0.06, 4.8, 0xb98a5e), fxp, 0.25, fzp);                      // inset top board
  const mFrame = add(tb(0.22, 3.7, 2.3, 0xcaa14e), W / 2 - 0.55, 2.1, fzp); // gilt mirror frame on the wall
  add(tb(0.1, 3.2, 1.9, 0xfff1dd), W / 2 - 0.66, 2.1, fzp);               // inner frame bevel
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 3.05), emi(0xd2e8f2, 0x8fb4c2, 0.28));
  mirror.rotation.y = -Math.PI / 2; mirror.position.set(W / 2 - 0.72, 2.1, fzp); root.add(mirror);
  add(cyl(0.45, 0.5, 0.55, 16, 0x8e6bbf), fxp - 0.8, 0.52, fzp + 0.3);    // little velvet stool
  add(cyl(0.5, 0.46, 0.08, 16, 0x6e4e96), fxp - 0.8, 0.83, fzp + 0.3);
  shade(fxp, fzp, 5.4, 5.8);
  interactables.push({ id: 'try_on', x: fxp - 2.2, z: fzp, r: 2.8, label: '🪞 Try on outfits' });
  // garment rail beside the fitting corner: brass bar + hangers with shirts
  { const rx = 11.4, rz2 = 8.2;
    for (const s of [-1.3, 1.3]) { add(cyl(0.06, 0.09, 1.9, 8, 0xcaa14e), rx + s, 0.95, rz2); add(cyl(0.22, 0.26, 0.08, 10, 0xcaa14e), rx + s, 0.04, rz2); }
    { const bar = add(cyl(0.045, 0.045, 2.9, 8, 0xcaa14e), rx, 1.9, rz2); bar.rotation.z = Math.PI / 2; }
    [[0xd95b4a, -0.9], [0x4a78b0, -0.3], [0x6be0a0, 0.3], [0xffd166, 0.9]].forEach(([sc, sx2]) => {
      add(cyl(0.02, 0.02, 0.16, 6, 0x9aa0a6), rx + sx2, 1.82, rz2);
      add(tb(0.72, 0.85, 0.14, sc), rx + sx2, 1.32, rz2);
      add(tb(0.9, 0.2, 0.13, sc), rx + sx2, 1.66, rz2);
    });
    colliders.push({ x: rx, z: rz2, w: 3.2, d: 0.9 }); shade(rx, rz2, 3.6, 1.4);
  }

  // ---- boutique display tables with folded-clothes stacks + goods ----
  function displayTable(x, z) {
    add(tb(2.6, 0.14, 1.7, 0x9a6a3f), x, 1.02, z);
    add(tb(2.72, 0.07, 1.82, 0x7a4f30), x, 0.94, z);
    for (const [lx2, lz2] of [[-1.1, -0.6], [1.1, -0.6], [-1.1, 0.6], [1.1, 0.6]]) add(cyl(0.08, 0.1, 0.9, 8, 0x6e4626), x + lx2, 0.45, z + lz2);
    const stacks = [[0xd95b4a, 0xb84836], [0x4a78b0, 0x3a5f8c], [0x6be0a0, 0x4fb583]];
    stacks.forEach(([c1, c2], i) => {
      const sx2 = -0.75 + i * 0.75;
      add(tb(0.62, 0.13, 0.62, c1), x + sx2, 1.16, z - 0.3);
      add(tb(0.58, 0.12, 0.58, c2), x + sx2, 1.28, z - 0.3);
      add(tb(0.54, 0.11, 0.54, c1), x + sx2, 1.4, z - 0.3);
    });
    add(sph(0.16, 0xffd166), x - 0.6, 1.24, z + 0.42);                 // accessories bowl
    add(cyl(0.2, 0.2, 0.05, 14, 0xfff1dd), x - 0.6, 1.12, z + 0.42);
    add(tb(0.5, 0.32, 0.36, 0x8e6bbf), x + 0.65, 1.26, z + 0.4);       // gift box
    add(tb(0.54, 0.08, 0.1, 0xffd166), x + 0.65, 1.3, z + 0.4);
    colliders.push({ x, z, w: 2.9, d: 2.0 }); shade(x, z, 3.4, 2.4);
  }
  displayTable(-4.8, 3.4); displayTable(4.8, 2.8);

  // ---- shelf walls with tidy goods boxes (left wall, between the windows) ----
  function goodsShelf(x, z, len) {
    add(tb(0.9, 2.6, len, 0x8a6240), x, 1.3, z);
    for (const sy of [0.9, 1.7, 2.5]) add(tb(1.0, 0.08, len + 0.15, 0x6e4626), x + 0.1, sy, z);
    const cols = [0xd64541, 0x3a6ea8, 0x6be0a0, 0xffd166, 0x8e6bbf, 0xcf6f5a];
    let bi = 0;
    for (const sy of [1.15, 1.95, 2.72]) for (let b = 0; b < Math.floor(len / 0.62); b++) {
      add(tb(0.5, 0.42, 0.5, cols[bi++ % 6]), x + 0.28, sy, z - len / 2 + 0.45 + b * 0.62);
    }
    colliders.push({ x, z, w: 1.3, d: len + 0.3 }); shade(x + 0.3, z, 1.8, len + 0.6);
  }
  goodsShelf(-W / 2 + 0.75, -0.5, 3.6);
  goodsShelf(-W / 2 + 0.75, -8, 3.2);

  // ---- window display platform by the entrance (teal plinth + gift boxes) ----
  { const px4 = -5.8, pz4 = 8;
    add(tb(3.2, 0.5, 2.2, 0x2f9c93), px4, 0.25, pz4);
    add(tb(3.35, 0.1, 2.35, 0xfff1dd), px4, 0.53, pz4);
    add(tb(0.8, 0.8, 0.8, 0xd95b4a), px4 - 0.8, 0.98, pz4 - 0.2); add(tb(0.86, 0.14, 0.2, 0xffd166), px4 - 0.8, 1.02, pz4 - 0.2);
    add(tb(0.55, 0.55, 0.55, 0x4a78b0), px4 + 0.15, 0.86, pz4 + 0.35); add(tb(0.6, 0.12, 0.16, 0xfff1dd), px4 + 0.15, 0.88, pz4 + 0.35);
    add(cyl(0.3, 0.24, 0.5, 12, 0xb5703f), px4 + 1.05, 0.83, pz4 - 0.3); add(sph(0.42, 0x4f8a45), px4 + 1.05, 1.35, pz4 - 0.3);
    colliders.push({ x: px4, z: pz4, w: 3.4, d: 2.4 }); shade(px4, pz4, 3.9, 2.9);
  }

  // ---- hanging painted sign boards over the aisles ----
  function hangingSign(x, z, text, bg, fg) {
    const tex = canvasTex(256, 96, (g, w2, h2) => {
      g.fillStyle = bg; g.fillRect(0, 0, w2, h2);
      g.strokeStyle = fg; g.lineWidth = 5; g.strokeRect(7, 7, w2 - 14, h2 - 14);
      g.font = 'bold 52px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = fg; g.fillText(text, w2 / 2, h2 / 2 + 2);
    });
    const board = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.85, 0.1), toonMat(0x7a4f30));
    board.position.set(x, 3.6, z); root.add(board);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(2.05, 0.72), new THREE.MeshBasicMaterial({ map: tex }));
    face.position.set(x, 3.6, z + 0.06); root.add(face);
    const face2 = new THREE.Mesh(new THREE.PlaneGeometry(2.05, 0.72), new THREE.MeshBasicMaterial({ map: tex }));
    face2.position.set(x, 3.6, z - 0.06); face2.rotation.y = Math.PI; root.add(face2);
    for (const s of [-0.8, 0.8]) add(cyl(0.02, 0.02, 1.2, 6, 0x9aa0a6), x + s, 4.6, z);
  }
  hangingSign(-4.8, 3.4, 'NEW ✿', '#fff1dd', '#2f9c93');
  hangingSign(4.8, 2.8, 'SALE', '#d95b4a', '#fff1dd');
  hangingSign(10.8, 6.2, 'FITTING', '#2f9c93', '#fff1dd');

  // ---- warm brass pendants over the counter + tables (emissive, no lights) ----
  { const shopGlow = glowTexture('255,220,170');
    const pShade = new THREE.ConeGeometry(0.5, 0.5, 14);
    const pMat = toonMat(0xcaa14e);
    const pBulb = new THREE.SphereGeometry(0.13, 10, 8);
    const pBulbMat = emi(0xfff2c8, 0xffd98a, 0.95);
    const pSpr = new THREE.SpriteMaterial({ map: shopGlow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.7 });
    for (const [px5, pz5] of [[-2, -1], [2, -1], [-8.4, 1.6], [7.9, 0.4]]) {
      add(cyl(0.025, 0.025, 1.3, 6, 0x6e4626), px5, 4.35, pz5);
      const sh3 = new THREE.Mesh(pShade, pMat); sh3.position.set(px5, 3.66, pz5); root.add(sh3);
      const bu2 = new THREE.Mesh(pBulb, pBulbMat); bu2.position.set(px5, 3.48, pz5); root.add(bu2);
      const sp2 = new THREE.Sprite(pSpr); sp2.scale.set(2.2, 2.2, 1); sp2.position.set(px5, 3.48, pz5); root.add(sp2);
    }
  }

  // ---- lighting: gentle warm point lights only (no glowing bulb meshes, so the
  // camera never catches a bright orb) plus a soft ambient lift ----
  root.add(new THREE.AmbientLight(0xfff2dc, 0.55));
  for (const [lx, lz] of [[-7, 2], [7, 2], [-7, -5], [7, -5]]) {
    const pl = new THREE.PointLight(0xffe6b8, 1.1, 15, 2); pl.position.set(lx, 4.7, lz); root.add(pl);
  }

  // ---- entrance plants ----
  function plant(x, z) {
    add(cyl(0.4, 0.32, 0.7, 12, 0xb5703f), x, 0.35, z);
    add(cyl(0.1, 0.13, 1.4, 8, 0x6e4a2e), x, 1.3, z);
    for (const [px, py, pz, r] of [[0, 2.2, 0, 0.7], [0.35, 2.0, 0.15, 0.5], [-0.35, 2.05, -0.15, 0.5]]) add(sph(r, 0x4f8a45), x + px, py, z + pz);
    shade(x, z, 1.6, 1.6); colliders.push({ x, z, w: 1, d: 1 });
  }
  plant(-W / 2 + 2, D / 2 - 3); plant(W / 2 - 2, D / 2 - 3);

  // ---- exit ----
  addExitPad(root, 0, D / 2 - 1.4);
  interactables.push({ id: 'exit_shop', x: 0, z: D / 2 - 1.6, r: 2.2, label: '🚪 Leave Store' });

  const spawn = { x: 0, z: D / 2 - 4 };
  return { root, colliders, interactables, bounds, spawn };
}

// ------------------------------------------------------------ dining hall
// A lively campus dining hall: a serving counter (order food), long communal
// tables with benches you can sit at, a kitchen grill where you can work a shift
// (cooking mini-game), bright windows and a menu board.
export function buildDiningHall() {
  const root = new THREE.Group();
  const colliders = [];
  const interactables = [];
  const W = 32, D = 22;
  const bounds = { minX: -W / 2 + 1, maxX: W / 2 - 1, minZ: -D / 2 + 1, maxZ: D / 2 - 1 };
  root.add(makeRoom(W, D, { wall: 0xf3e7d0 }));

  const tb = (w, h, d, c) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toonMat(c)); m.castShadow = true; m.receiveShadow = true; return m; };
  const cyl = (rt, rb, h, n, c) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, n), toonMat(c)); m.castShadow = true; return m; };
  const sph = (r, c) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 12), toonMat(c)); m.castShadow = true; return m; };
  const add = (m, x, y, z) => { m.position.set(x, y, z); root.add(m); return m; };
  const emi = (c, e, i = 0.5) => new THREE.MeshToonMaterial({ color: c, emissive: e, emissiveIntensity: i });
  const shadowMat = new THREE.MeshBasicMaterial({ map: softShadow(), transparent: true, depthWrite: false });
  const shade = (x, z, sx, sz = sx) => { const dd = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), shadowMat); dd.rotation.x = -Math.PI / 2; dd.position.set(x, 0.02, z); root.add(dd); };

  // warm plank floor + timber wainscot trim — great-hall warmth
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), toonMat(0xc4a071, { map: hardwoodFloor('#a8845c') }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.012; floor.receiveShadow = true; root.add(floor);
  for (const [w, d, x, z] of [[W, 0.3, 0, -D / 2 + 0.3], [0.3, D, -W / 2 + 0.3, 0], [0.3, D, W / 2 - 0.3, 0]]) {
    add(tb(w, 0.5, d, 0x8a5f3c), x, 0.25, z); add(tb(w, 0.7, d, 0x6e4a30), x, 1.15, z);
    add(tb(w, 0.16, d, 0x8a5f3c), x, 1.58, z); add(tb(w, 0.3, d, 0xfff1dd), x, 4.82, z);
  }

  // ---- buffet serving counter along the back: hot trays with real food props,
  // a brass tray rail, stacked trays and a sneeze-guard ----
  const bz = -D / 2 + 1.6;
  add(tb(W - 6, 1.2, 1.8, 0xb5895a), 0, 0.6, bz);
  add(tb(W - 6, 0.16, 2.1, 0xcfa978), 0, 1.3, bz);
  for (const px2 of [-11, -5.5, 0, 5.5, 11]) add(tb(0.16, 0.9, 0.1, 0x8a5f3c), px2, 0.62, bz + 0.92); // front panelling seams
  { // steel hotel pans sunk into the counter with food piled in them
    const panGeo = new THREE.BoxGeometry(2.4, 0.22, 1.15);
    const panMat = toonMat(0xb8bec6);
    const foods = ['pizza', 'burger', 'salad', 'ramen', 'sushi', 'donut'];
    foods.forEach((f, i) => {
      const fx2 = -10 + i * 4;
      const pan = new THREE.Mesh(panGeo, panMat); pan.position.set(fx2, 1.42, bz - 0.1); pan.castShadow = true; root.add(pan);
      for (const [ox, oz] of [[-0.6, 0.15], [0.15, -0.2], [0.7, 0.2]]) {
        const m = FOOD_MODELS[f].build(); m.scale.setScalar(1.35);
        m.position.set(fx2 + ox, 1.56, bz - 0.1 + oz); m.rotation.y = (ox + oz) * 2.1; root.add(m);
      }
    });
    // brass tray-slide rail along the front + a stack of canteen trays
    const railBar = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, W - 7, 8), toonMat(0xc9a13b));
    railBar.rotation.z = Math.PI / 2; railBar.position.set(0, 1.16, bz + 1.25); root.add(railBar);
    for (const sx of [-11, -4, 4, 11]) add(tb(0.08, 0.3, 0.35, 0xc9a13b), sx, 1.0, bz + 1.18);
    for (let i = 0; i < 4; i++) add(tb(1.4, 0.07, 1.0, [0xd95b4a, 0x7ec8e3, 0xffd166, 0x6be0a0][i]), 12, 1.42 + i * 0.09, bz - 0.15);
    for (let i = 0; i < 3; i++) add(cyl(0.26, 0.26, 0.05, 16, 0xfbf7ee), -12.6, 1.44 + i * 0.07, bz - 0.2); // plate stack
  }
  add(tb(W - 6.4, 0.1, 0.1, 0xbfe0ea), 0, 2.3, bz + 0.7); // glass guard rail
  { const gg = new THREE.Mesh(new THREE.BoxGeometry(W - 6.4, 0.8, 0.06), new THREE.MeshToonMaterial({ color: 0xd8ecf4, transparent: true, opacity: 0.22 }));
    gg.position.set(0, 1.95, bz + 0.7); root.add(gg); }
  for (const sx of [-(W - 6) / 2 + 0.4, (W - 6) / 2 - 0.4]) add(cyl(0.04, 0.04, 1.0, 6, 0xcfcfd6), sx, 1.85, bz + 0.7);
  colliders.push({ x: 0, z: bz, w: W - 6, d: 2.0 }); shade(0, bz, W - 5, 3.2);
  interactables.push({ id: 'order_food', x: 0, z: bz + 2.6, r: 2.6, label: '🍽️ Order food' });

  // ---- cup pong table (play a match) on the right ----
  const px = W / 2 - 3;
  add(tb(2.6, 0.18, 5.2, 0x1f8a4c), px, 0.95, -3);            // green table top
  for (const sx of [-1, 1]) add(tb(0.2, 0.95, 4.6, 0x6e4626), px + sx, 0.47, -3); // legs
  add(new THREE.Mesh(new THREE.PlaneGeometry(0.06, 5.0), toonMat(0xffffff)), px, 1.05, -3).rotation.x = -Math.PI / 2; // centre line
  for (const end of [-1, 1]) for (let i = 0; i < 3; i++) for (let j = 0; j <= i; j++)
    add(cyl(0.13, 0.1, 0.3, 12, 0xcf2a25), px + (j - i / 2) * 0.32, 1.2, -3 + end * (1.6 - i * 0.45));
  colliders.push({ x: px, z: -3, w: 2.8, d: 5.4 }); shade(px, -3, 4, 6);
  interactables.push({ id: 'cup_pong', x: px - 2.4, z: -3, r: 2.6, label: '🥤 Play Cup Pong' });

  // ---- communal trestle tables with benches you can sit at to eat ----
  const platePalette = [0xd95b4a, 0x6be0a0, 0xffd166, 0x7ec8e3];
  // a detailed wooden chair (built facing +z, then rotated to faceY)
  function chair(cx, cz, faceY) {
    const g = new THREE.Group();
    const a2 = (m, x, y, z) => { m.position.set(x, y, z); g.add(m); return m; };
    a2(tb(0.66, 0.1, 0.66, 0xb5895a), 0, 0.52, 0);                      // seat pad
    a2(tb(0.6, 0.05, 0.6, 0xcf6f5a), 0, 0.58, 0);                       // cushion
    for (const lx of [-0.27, 0.27]) for (const lz of [-0.27, 0.27]) a2(cyl(0.05, 0.05, 0.52, 8, 0x6e4626), lx, 0.26, lz); // legs
    a2(tb(0.66, 0.62, 0.09, 0x8a5a36), 0, 0.92, -0.3);                  // back panel
    for (const bx of [-0.28, 0.28]) a2(cyl(0.05, 0.05, 0.86, 8, 0x6e4626), bx, 0.7, -0.3); // back posts
    g.position.set(cx, 0, cz); g.rotation.y = faceY; root.add(g);
    colliders.push({ x: cx, z: cz, w: 0.8, d: 0.8 });
  }
  // a 2-seat table with detailed chairs facing each other
  function diningTable(x, z) {
    add(tb(2.4, 0.14, 2.9, 0xa9743f), x, 1.0, z);                       // tabletop
    add(tb(2.52, 0.06, 3.02, 0x7a5230), x, 0.94, z);                    // apron edge
    for (const sx of [-0.96, 0.96]) for (const sz of [-1.15, 1.15]) {  // 4 turned legs
      add(cyl(0.09, 0.07, 0.86, 10, 0x6e4626), x + sx, 0.45, z + sz);
    }
    add(tb(1.9, 0.1, 0.1, 0x5f3d22), x, 0.2, z + 1.15); add(tb(1.9, 0.1, 0.1, 0x5f3d22), x, 0.2, z - 1.15); // rails
    add(tb(0.55, 0.05, 2.0, 0xcf6f5a), x, 1.08, z);                     // runner
    add(cyl(0.13, 0.18, 0.4, 12, 0xbfe0ea), x, 1.25, z);               // bud vase centrepiece
    for (const [vx, vz] of [[0, 0.05], [0.1, -0.05], [-0.1, 0]]) add(sph(0.12, 0x6be0a0), x + vx, 1.5, z + vz);
    colliders.push({ x, z, w: 2.5, d: 3.0 }); shade(x, z, 4.4, 4.8);
    for (const s of [-1, 1]) {                                          // two place settings + chairs
      add(cyl(0.27, 0.27, 0.05, 18, 0xfbf7ee), x + s * 0.62, 1.1, z);  // plate
      add(cyl(0.13, 0.11, 0.22, 12, platePalette[(s + 1) / 2 | 0]), x + s * 0.62, 1.19, z + 0.42); // cup
      const cx = x + s * 1.78, faceY = s > 0 ? -Math.PI / 2 : Math.PI / 2;
      chair(cx, z, faceY);
      interactables.push({ id: 'dine', x: cx + s * 0.7, z, r: 2.0, label: '🍴 Sit & eat',
        seatPos: { x: cx, z, y: 0 }, sitY: 0.95, face: faceY,
        plate: { x: x + s * 0.62, z }, stepBack: { x: cx + s * 1.1, z } });
    }
  }
  diningTable(-9, 4);
  diningTable(-1, 4);
  diningTable(7, 4);
  diningTable(-9, -1);   // second row, aligned with the first, nearer the counter
  diningTable(-1, -1);
  diningTable(7, -1);

  // ---- tall curtained windows (golden-hour glass + rust drapes) ----
  const winGlass = emi(0xf6ead0, 0xe8c98e, 0.4);
  const drapeDine = toonMat(0xffffff, { map: curtainTexture('#9c4632', '#712f20') });
  function win(cx, cy, cz, ry) {
    const grp = new THREE.Group();
    const fr = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3.6, 0.18), toonMat(0xfff1dd)); grp.add(fr);
    const gl = new THREE.Mesh(new THREE.BoxGeometry(2.7, 3.2, 0.1), winGlass); gl.position.z = 0.08; grp.add(gl);
    for (const my of [-0.8, 0, 0.8]) { const mu = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.1, 0.12), toonMat(0xfff1dd)); mu.position.set(0, my, 0.12); grp.add(mu); }
    { const mu = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3.2, 0.12), toonMat(0xfff1dd)); mu.position.z = 0.12; grp.add(mu); }
    const rod = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.14, 0.16), toonMat(0x5b3c25)); rod.position.set(0, 2.0, 0.2); grp.add(rod);
    for (const s of [-1, 1]) { const cu = new THREE.Mesh(new THREE.BoxGeometry(0.8, 4.1, 0.26), drapeDine); cu.position.set(s * 1.95, -0.15, 0.18); cu.castShadow = true; grp.add(cu); }
    const sill = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.14, 0.4), toonMat(0xe8dcc8)); sill.position.set(0, -1.9, 0.16); grp.add(sill);
    grp.position.set(cx, cy, cz); grp.rotation.y = ry; root.add(grp);
  }
  win(-W / 2 + 0.3, 2.9, 4, Math.PI / 2); win(-W / 2 + 0.3, 2.9, -4, Math.PI / 2);
  win(W / 2 - 0.3, 2.9, 4, -Math.PI / 2);
  root.add(new THREE.AmbientLight(0xfff2dc, 0.55));
  for (const [lx, lz] of [[-8, 3], [0, 3], [-6, -6], [6, 2]]) { const pl = new THREE.PointLight(0xffe6b8, 1.0, 15, 2); pl.position.set(lx, 4.7, lz); root.add(pl); }
  function plant(x, z) { add(cyl(0.4, 0.32, 0.7, 12, 0xb5703f), x, 0.35, z); add(cyl(0.1, 0.13, 1.4, 8, 0x6e4a2e), x, 1.3, z); for (const [px, py, pz, r] of [[0, 2.2, 0, 0.7], [0.35, 2.0, 0.15, 0.5], [-0.35, 2.05, -0.15, 0.5]]) add(sph(r, 0x4f8a45), x + px, py, z + pz); shade(x, z, 1.6, 1.6); colliders.push({ x, z, w: 1, d: 1 }); }
  plant(-W / 2 + 2, D / 2 - 3); plant(W / 2 - 2, D / 2 - 3);

  // ---- remodel touches: accent wall, framed art, menu board, stools, shades, soda fountain ----
  add(tb(W - 2, 4.4, 0.18, 0x9c3b2c), 0, 2.6, -D / 2 + 0.42);                 // warm terracotta backsplash
  // simple minimalist framed art (no emoji) — a coloured canvas with a sun disc + horizon band
  for (const [pp, c1, c2] of [[-12.5, 0xe8a05a, 0xfbe0b0], [-7.5, 0x6a83a6, 0xb8cce0]]) {
    add(tb(1.9, 1.9, 0.12, 0x5a3c28), pp, 3.4, -D / 2 + 0.52);                // frame
    add(tb(1.55, 1.55, 0.06, c1), pp, 3.4, -D / 2 + 0.6);                     // canvas
    add(cyl(0.36, 0.36, 0.05, 22, c2), pp, 3.62, -D / 2 + 0.65).rotation.x = Math.PI / 2; // sun
    add(tb(1.55, 0.32, 0.05, c2), pp, 2.92, -D / 2 + 0.65);                   // horizon band
  }
  // hand-chalked menu board (framed) on the right of the backsplash
  add(tb(7.2, 3.2, 0.18, 0x5a3f26), 9, 3.3, -D / 2 + 0.5);
  { const mb = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 2.7), toonMat(0xffffff, { map: chalkboardTexture([
      { t: "TODAY'S MENU", accent: true, underline: true, x: 90 },
      { t: 'Pizza slice ............ 12¢', x: 10 },
      { t: 'Duck burger ......... 15¢', x: 10 },
      { t: 'Ramen bowl .......... 14¢', x: 10 },
      { t: 'Donut + coffee ..... 9¢', x: 10 },
      { t: '☆ ask about seconds!', accent: true, x: 40 },
    ]) })); mb.position.set(9, 3.3, -D / 2 + 0.62); root.add(mb); }
  for (let i = -2; i <= 2; i++) {                                            // bar stools at the counter
    add(cyl(0.32, 0.3, 0.12, 14, 0xcf6f5a), i * 3, 1.0, bz + 1.7);
    add(cyl(0.05, 0.05, 0.9, 8, 0x8a8580), i * 3, 0.5, bz + 1.7);
  }
  // ---- rows of warm pendant lamps over the two table rows ----
  { const dineGlow = glowTexture('255,206,140');
    const shadeGeo = new THREE.ConeGeometry(0.62, 0.6, 16);
    const shadeMat = toonMat(0xc0463a);
    const bulbGeo = new THREE.SphereGeometry(0.15, 10, 8);
    const bulbMat = emi(0xfff2c8, 0xffcf7a, 0.95);
    const sprMat = new THREE.SpriteMaterial({ map: dineGlow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 });
    for (const lz of [4, -1]) for (const lx of [-9, -1, 7]) {
      add(cyl(0.03, 0.03, 1.6, 6, 0x44464c), lx, 4.3, lz);
      const sh2 = new THREE.Mesh(shadeGeo, shadeMat); sh2.position.set(lx, 3.5, lz); sh2.castShadow = false; root.add(sh2);
      const bu = new THREE.Mesh(bulbGeo, bulbMat); bu.position.set(lx, 3.28, lz); root.add(bu);
      const sp = new THREE.Sprite(sprMat); sp.scale.set(2.6, 2.6, 1); sp.position.set(lx, 3.28, lz); root.add(sp);
    }
  }
  // decorative wall plates between the art and the menu board
  { const plateGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.06, 20);
    const innerGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.07, 20);
    [[-3.4, 3.9, 0x7ec8e3], [-1.6, 3.3, 0xe8748c], [0.4, 3.95, 0x6be0a0], [2.2, 3.25, 0xffd166], [4.2, 3.8, 0xcf6f5a]].forEach(([px3, py3, pc3]) => {
      const pl2 = new THREE.Mesh(plateGeo, toonMat(0xfbf7ee)); pl2.rotation.x = Math.PI / 2; pl2.position.set(px3, py3, -D / 2 + 0.56); root.add(pl2);
      const inn = new THREE.Mesh(innerGeo, toonMat(pc3)); inn.rotation.x = Math.PI / 2; inn.position.set(px3, py3, -D / 2 + 0.56); root.add(inn);
    });
  }
  add(tb(2.2, 2.0, 1.2, 0xd6d8db), 12.6, 1.0, -8);                            // soda fountain
  add(tb(2.0, 0.9, 0.08, 0x2c3530), 12.6, 1.6, -7.42);
  for (const dx of [-0.5, 0, 0.5]) add(cyl(0.07, 0.07, 0.35, 8, 0x33353b), 12.6 + dx, 1.2, -7.36);
  colliders.push({ x: 12.6, z: -8, w: 2.4, d: 1.4 }); shade(12.6, -8, 3, 2);
  plant(-W / 2 + 2, -D / 2 + 4);

  addExitPad(root, 0, D / 2 - 1.4);
  interactables.push({ id: 'exit_dining', x: 0, z: D / 2 - 1.6, r: 2.2, label: '🚪 Leave Dining Hall' });
  const spawn = { x: 0, z: D / 2 - 4 };
  return { root, colliders, interactables, bounds, spawn };
}

// ------------------------------------------------------------ student union
// A bright, modern student-center game room: a real 8-ball pool table and a
// real air-hockey table (each launches its mini-game), a coffee bar, comfy
// couches to hang out, a glass curtain wall flooding in daylight, plants, and
// a trophy board — the campus hangout.
export function buildStudentUnion() {
  const root = new THREE.Group();
  const colliders = [];
  const interactables = [];
  const W = 30, D = 24;
  const bounds = { minX: -W / 2 + 1, maxX: W / 2 - 1, minZ: -D / 2 + 1, maxZ: D / 2 - 1 };
  root.add(makeRoom(W, D, { wall: 0x6b5f79 })); // dusky plum walls — arcade-at-night mood

  const tb = (w, h, d, c) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toonMat(c)); m.castShadow = true; m.receiveShadow = true; return m; };
  const cyl = (rt, rb, h, n, c) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, n), toonMat(c)); m.castShadow = true; return m; };
  const sph = (r, c) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 12), toonMat(c)); m.castShadow = true; return m; };
  const add = (m, x, y, z) => { m.position.set(x, y, z); root.add(m); return m; };
  const emi = (c, e, i = 0.8) => new THREE.MeshToonMaterial({ color: c, emissive: e, emissiveIntensity: i });
  const glassMat = (cols, rows, opts) => toonMat(0xffffff, { map: glassCurtain(cols, rows, opts), emissive: 0x2a3a40, emissiveIntensity: 0.2 });
  const shadowMat = new THREE.MeshBasicMaterial({ map: softShadow(), transparent: true, depthWrite: false });
  const shade = (x, z, sx, sz = sx) => { const dd = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), shadowMat); dd.rotation.x = -Math.PI / 2; dd.position.set(x, 0.02, z); root.add(dd); };

  // ---- arcade shell: dark confetti carpet (the classic 90s arcade floor),
  // charcoal wainscot with a glowing neon rail along every wall ----
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), toonMat(0xbdb3d6, { map: confettiCarpetTexture() }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.012; floor.receiveShadow = true; root.add(floor);
  const neonPink = emi(0xff5fa2, 0xff2f8a, 1.0), neonCyan = emi(0x5fe8d8, 0x22c8b4, 1.0);
  for (const sx of [-1, 1]) {
    add(tb(0.4, 1.7, D, 0x3a3344), sx * (W / 2 - 0.2), 0.85, 0);                                   // dark wainscot
    { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, D - 1), sx > 0 ? neonPink : neonCyan); rail.position.set(sx * (W / 2 - 0.44), 1.74, 0); root.add(rail); }
    add(tb(0.3, 0.25, D, 0x2b2f36), sx * (W / 2 - 0.2), 4.85, 0);                                   // crown trim
  }

  // ---- back glass curtain wall (dusk campus view, a few windows lit) ----
  add(tb(W - 1.0, 0.5, 0.5, 0x2b2f36), 0, 0.45, -D / 2 + 0.42);                 // sill
  const bw = new THREE.Mesh(new THREE.BoxGeometry(W - 1.6, 4.0, 0.16), glassMat(8, 3, { tint: '#2e3c50', lit: 6 }));
  bw.position.set(0, 2.75, -D / 2 + 0.34); root.add(bw);
  add(tb(W - 1.0, 0.32, 0.5, 0x2b2f36), 0, 4.9, -D / 2 + 0.42);                 // head beam
  for (let i = -4; i <= 4; i++) add(tb(0.18, 4.1, 0.32, 0x2b2f36), i * ((W - 1.6) / 8), 2.75, -D / 2 + 0.4); // mullions

  // ---- big neon "ARCADE" sign over the game floor + accent squiggles ----
  const glowPink = glowTexture('255,110,180'), glowCyan = glowTexture('110,235,220'), glowWarm = glowTexture('255,214,150');
  { const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.5),
      new THREE.MeshBasicMaterial({ map: neonTextTexture('ARCADE', '#ff4f9a', { size: 92 }), transparent: true, depthWrite: false }));
    sign.position.set(0, 4.05, -D / 2 + 0.55); root.add(sign);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowPink, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 }));
    spr.scale.set(11, 4, 1); spr.position.set(0, 4.05, -D / 2 + 0.7); root.add(spr);
    // neon accents on the side walls: a cyan zap + a pink ring
    const zap = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.2),
      new THREE.MeshBasicMaterial({ map: neonTextTexture('!', '#5fe8d8', { w: 128, h: 128, size: 84 }), transparent: true, depthWrite: false }));
    zap.position.set(-W / 2 + 0.45, 3.4, 4); zap.rotation.y = Math.PI / 2; root.add(zap);
    const ringN = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.07, 8, 26), neonCyan);
    ringN.position.set(W / 2 - 0.45, 3.5, 1.5); ringN.rotation.y = Math.PI / 2; root.add(ringN);
    const spr2 = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowCyan, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 }));
    spr2.scale.set(3.4, 3.4, 1); spr2.position.set(W / 2 - 0.7, 3.5, 1.5); root.add(spr2);
  }

  // ---- strings of pennant flags swagged across the ceiling ----
  { const flagShape = new THREE.Shape(); flagShape.moveTo(-0.28, 0); flagShape.lineTo(0.28, 0); flagShape.lineTo(0, -0.62); flagShape.closePath();
    const flagGeo = new THREE.ShapeGeometry(flagShape);
    const flagMats = [0xff5fa2, 0xffd166, 0x5fe8d8, 0x8f7ae8, 0x6be0a0].map((c) => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
    const wireMat2 = toonMat(0x2b2f36);
    function pennantString(x0, z0, x1, z1, y0, sag = 0.9) {
      const n = 16;
      for (let i = 0; i <= n; i++) {
        const t = i / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
        const y = y0 - Math.sin(t * Math.PI) * sag;
        if (i < n) { const seg = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(x1 - x0, z1 - z0) / n + 0.05, 0.035, 0.035), wireMat2);
          const nt = (i + 0.5) / n;
          seg.position.set(x0 + (x1 - x0) * nt, y0 - Math.sin(nt * Math.PI) * sag + 0.02, z0 + (z1 - z0) * nt);
          seg.rotation.y = Math.atan2(-(z1 - z0), x1 - x0);
          seg.rotation.z = -Math.cos(nt * Math.PI) * (sag * Math.PI / Math.hypot(x1 - x0, z1 - z0));
          root.add(seg); }
        if (i > 0 && i < n) { const f = new THREE.Mesh(flagGeo, flagMats[i % flagMats.length]);
          f.position.set(x, y, z); f.rotation.y = Math.atan2(-(z1 - z0), x1 - x0); root.add(f); }
      }
    }
    pennantString(-W / 2 + 1, -8, W / 2 - 1, -2, 4.75, 0.65);
    pennantString(-W / 2 + 1, 3, W / 2 - 1, 8, 4.75, 0.65);
  }

  // ============================================================ pool table
  function poolTable(px, pz) {
    const g = new THREE.Group();
    const at = (m, x, y, z) => { m.position.set(x, y, z); g.add(m); return m; };
    const L = 5.0, Wd = 2.6, legH = 0.92, surfY = 1.52;
    const wood = 0x5a3219, woodHi = 0x6f4022, rail = 0x4a2914, felt = 0x117a44;
    // legs + cabinet body (clean vertical stack — no intersecting coloured boxes)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) at(tb(0.5, legH, 0.5, wood), sx * (L / 2 - 0.5), legH / 2, sz * (Wd / 2 - 0.5));
    at(tb(L - 0.3, 0.5, Wd - 0.3, woodHi), 0, legH + 0.25, 0);          // 0.92..1.42
    // felt bed sits just above the cabinet top (slight embed avoids coplanar z-fighting)
    at(tb(L - 0.4, 0.16, Wd - 0.4, felt), 0, surfY - 0.08, 0);          // top at surfY
    // cushion rails around the perimeter, on top of the bed
    const railW = 0.32, railY = surfY + 0.04;
    for (const sz of [-1, 1]) at(tb(L - 0.1, 0.16, railW, rail), 0, railY, sz * (Wd / 2 - railW / 2 - 0.05));
    for (const sx of [-1, 1]) at(tb(railW, 0.16, Wd - 0.1, rail), sx * (L / 2 - railW / 2 - 0.05), railY, 0);
    // pockets (dark cups sunk into the corners + side middles)
    for (const sx of [-1, 0, 1]) for (const sz of [-1, 1])
      at(cyl(0.24, 0.2, 0.18, 14, 0x0b0b0b), sx * (L / 2 - 0.2), surfY + 0.06, sz * (Wd / 2 - 0.2));
    // balls (racked) + cue ball, resting on the felt
    const br = 0.13;
    at(sph(br, 0xf4f4f0), -L * 0.2, surfY + 0.13, 0);
    const cols = [0xe8b923, 0x2b5fd0, 0xd83a2f, 0x161616, 0x7d3cc0, 0x1f9d55, 0xe8772e, 0x8c2f2f, 0xe8b923, 0x2b5fd0];
    let bi = 0;
    for (let r = 0; r < 4; r++) for (let k = 0; k <= r; k++) { at(sph(br, cols[bi % cols.length]), L * 0.16 + r * br * 1.75, surfY + 0.13, (k - r / 2) * br * 2.0); bi++; }
    g.position.set(px, 0, pz); root.add(g);
    colliders.push({ x: px, z: pz, w: L + 0.4, d: Wd + 0.4 }); shade(px, pz, L + 1.4, Wd + 1.2);
    const sign = textSprite('🎱 Pool'); sign.position.set(px, surfY + 2.0, pz); root.add(sign);
    interactables.push({ id: 'arcade_pool', x: px, z: pz + Wd / 2 + 1.3, r: 2.4, label: '🎱 Play Pool' });
  }

  // ======================================================= air hockey table
  // built length-wise along x (to sit as a tidy pair beside the pool table)
  function airHockeyTable(px, pz) {
    const g = new THREE.Group();
    const at = (m, x, y, z) => { m.position.set(x, y, z); g.add(m); return m; };
    const L = 4.8, Wd = 2.6, legH = 0.92, surfY = 1.52;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) at(tb(0.45, legH, 0.45, 0x20242c), sx * (L / 2 - 0.5), legH / 2, sz * (Wd / 2 - 0.5));
    at(tb(L - 0.2, 0.5, Wd - 0.2, 0x2a2f38), 0, legH + 0.25, 0);        // cabinet (below the surface)
    const surf = new THREE.Mesh(new THREE.BoxGeometry(L - 0.3, 0.16, Wd - 0.3), emi(0xeaf6ff, 0x7fc1e8, 0.45));
    surf.position.y = surfY - 0.08; surf.receiveShadow = true; g.add(surf);   // glossy playfield, top at surfY
    at(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, Wd - 0.6), emi(0xffffff, 0x9cd0ee, 0.5)), 0, surfY + 0.02, 0); // centre line
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.035, 8, 24), emi(0xffffff, 0x9cd0ee, 0.5)); ring.rotation.x = Math.PI / 2; at(ring, 0, surfY + 0.02, 0);
    for (const sz of [-1, 1]) at(tb(L, 0.22, 0.2, 0xeef2f6), 0, surfY + 0.07, sz * (Wd / 2 - 0.1)); // side rails
    const goalW = Wd * 0.5, segW = (Wd - goalW) / 2;
    for (const sx of [-1, 1]) {                                         // end rails + glowing goal mouths
      for (const sz of [-1, 1]) at(tb(0.2, 0.22, segW, 0xeef2f6), sx * (L / 2 - 0.1), surfY + 0.07, sz * (Wd / 2 - segW / 2));
      at(tb(0.16, 0.2, goalW, 0x0a0d12), sx * (L / 2 - 0.06), surfY + 0.05, 0);
      at(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, goalW + 0.1), emi(sx > 0 ? 0xff5fa2 : 0xffd166, sx > 0 ? 0xff5fa2 : 0xffd166, 0.8)), sx * (L / 2 + 0.02), surfY + 0.08, 0);
    }
    const mallet = (c, x) => { const k = cyl(0.24, 0.26, 0.1, 16, c); k.position.set(x, surfY + 0.1, 0); g.add(k); const h2 = cyl(0.1, 0.12, 0.18, 12, c); h2.position.set(x, surfY + 0.22, 0); g.add(h2); };
    mallet(0xff5fa2, L * 0.28); mallet(0xffd166, -L * 0.28);
    at(cyl(0.13, 0.13, 0.06, 16, 0x101418), 0.6, surfY + 0.06, 0.45);   // puck
    g.position.set(px, 0, pz); root.add(g);
    colliders.push({ x: px, z: pz, w: L + 0.4, d: Wd + 0.4 }); shade(px, pz, L + 1.4, Wd + 1.2);
    const sign = textSprite('🏒 Air Hockey'); sign.position.set(px, surfY + 2.0, pz); root.add(sign);
    interactables.push({ id: 'arcade_airhockey', x: px, z: pz + Wd / 2 + 1.3, r: 2.4, label: '🏒 Play Air Hockey' });
  }

  poolTable(-5.5, -3.5);
  airHockeyTable(5.5, -3.5);

  // ---- cue rack mounted flat on the left wall (cues stand neatly, not askew) ----
  add(tb(0.2, 0.5, 1.8, 0x3a291c), -W / 2 + 0.2, 2.9, -6.5);          // top holder
  add(tb(0.2, 0.3, 1.8, 0x3a291c), -W / 2 + 0.2, 1.0, -6.5);          // bottom holder
  for (const dz of [-0.55, -0.18, 0.18, 0.55]) add(cyl(0.04, 0.05, 2.3, 8, 0x9c6a35), -W / 2 + 0.42, 1.95, -6.5 + dz);

  // ---- wall of arcade cabinets under the neon sign (visual dressing) ----
  { const cabGeo = new THREE.BoxGeometry(1.5, 3.1, 1.3);
    const marqGeo = new THREE.BoxGeometry(1.55, 0.5, 1.0);
    const deckGeo = new THREE.BoxGeometry(1.4, 0.22, 0.7);
    const scrGeo = new THREE.PlaneGeometry(1.15, 1.0);
    const stickGeo = new THREE.SphereGeometry(0.06, 8, 8);
    const cabCols = [0xb83a6e, 0x3a6ab8, 0x3f9d5a, 0x8f56c9, 0xc9782e];
    const scrCols = [[0x1a2a4a, 0x3fd0ff], [0x2a1a3a, 0xff5fa2], [0x102a1a, 0x6be0a0], [0x2a2010, 0xffd166], [0x14142a, 0x8f7ae8]];
    const btnCols = [0xffd166, 0xff5fa2, 0x6be0a0];
    function arcadeCab(x, i) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(cabGeo, toonMat(cabCols[i % 5])); body.position.y = 1.55; body.castShadow = true; g.add(body);
      const marq = new THREE.Mesh(marqGeo, emi(scrCols[i % 5][1], scrCols[i % 5][1], 0.75)); marq.position.set(0, 3.3, 0.1); g.add(marq);
      const scr = new THREE.Mesh(scrGeo, emi(scrCols[i % 5][0], scrCols[i % 5][1], 0.5)); scr.position.set(0, 2.35, 0.68); scr.rotation.x = -0.14; g.add(scr);
      const deck = new THREE.Mesh(deckGeo, toonMat(0x22242c)); deck.position.set(0, 1.55, 0.8); deck.rotation.x = 0.18; g.add(deck);
      for (const bx2 of [-0.35, 0.05, 0.45]) { const b = new THREE.Mesh(stickGeo, toonMat(btnCols[(i + bx2 * 10 | 0) % 3])); b.position.set(bx2, 1.72, 0.9); g.add(b); }
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowWarm, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.35 }));
      spr.scale.set(2.2, 2.2, 1); spr.position.set(0, 3.3, 0.6); g.add(spr);
      g.position.set(x, 0, -D / 2 + 1.6); root.add(g);
      shade(x, -D / 2 + 1.6, 2.2, 2.0);
      colliders.push({ x, z: -D / 2 + 1.6, w: 1.7, d: 1.5 });
    }
    [-10.4, -8.6, 3.6, 5.4, 7.2].forEach((x, i) => arcadeCab(x, i));
  }

  // ---- claw machine (left wall): glass box stuffed with plushies ----
  { const cx = -W / 2 + 1.15, cz2 = 4.2, g = new THREE.Group();
    const stick2Geo = new THREE.SphereGeometry(0.09, 8, 8);
    const base = tb(1.9, 1.0, 1.9, 0xd1435f); base.position.y = 0.5; g.add(base);
    const top = tb(1.9, 0.55, 1.9, 0xd1435f); top.position.y = 3.15; g.add(top);
    const marq = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.3, 1.95), emi(0xffd166, 0xffb020, 0.8)); marq.position.y = 3.5; g.add(marq);
    for (const [px2, pz2] of [[-0.85, -0.85], [0.85, -0.85], [-0.85, 0.85], [0.85, 0.85]]) { const post = tb(0.16, 1.9, 0.16, 0x8a2038); post.position.set(px2, 1.95, pz2); g.add(post); }
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.85, 1.7), new THREE.MeshToonMaterial({ color: 0xbfe6f0, transparent: true, opacity: 0.18 })); glass.position.y = 1.95; g.add(glass);
    const plushCols = [0xffb6c1, 0x8fd3ff, 0xffe08a, 0x9fe6a0, 0xc9a0e8, 0xff9a76];
    const plushGeo = new THREE.SphereGeometry(0.24, 10, 8);
    plushCols.forEach((pc, i) => { const p = new THREE.Mesh(plushGeo, toonMat(pc)); p.position.set((i % 3 - 1) * 0.5, 1.22 + Math.floor(i / 3) * 0.42, (i % 2 ? 0.35 : -0.3)); p.scale.y = 0.85; g.add(p);
      const ear = new THREE.Mesh(stick2Geo, toonMat(pc)); ear.position.set(p.position.x - 0.1, p.position.y + 0.24, p.position.z); g.add(ear);
      const ear2 = new THREE.Mesh(stick2Geo, toonMat(pc)); ear2.position.set(p.position.x + 0.1, p.position.y + 0.24, p.position.z); g.add(ear2); });
    const claw = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.3, 8), toonMat(0x9aa6ae)); claw.rotation.x = Math.PI; claw.position.set(0.2, 2.7, 0); g.add(claw);
    const rod = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.05), toonMat(0x9aa6ae)); rod.position.set(0.2, 3.0, 0); g.add(rod);
    const panel = tb(1.1, 0.16, 0.5, 0x8a2038); panel.position.set(0, 1.06, 1.12); panel.rotation.x = 0.3; g.add(panel);
    const joy = new THREE.Mesh(stick2Geo, toonMat(0xffd166)); joy.position.set(-0.2, 1.24, 1.14); g.add(joy);
    g.position.set(cx, 0, cz2); g.rotation.y = Math.PI / 2; root.add(g);
    shade(cx, cz2, 2.6, 2.6); colliders.push({ x: cx, z: cz2, w: 2.1, d: 2.1 });
  }

  // ---- twin vending machines (back-left, softly glowing displays) ----
  { const vxu = -W / 2 + 1.05;
    [[-10.1, 0xb83227, 0xe8c33a], [-8.3, 0x2a5fa8, 0x7ec8e3]].forEach(([vz, bodyC, bandC]) => {
      add(tb(1.5, 3.4, 1.55, bodyC), vxu, 1.7, vz);
      add(tb(1.54, 0.5, 1.59, bandC), vxu, 3.25, vz);
      const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 2.2), emi(0x14202c, 0x2f4a5e, 0.55));
      disp.position.set(vxu + 0.79, 1.85, vz - 0.2); disp.rotation.y = Math.PI / 2; root.add(disp);
      for (let r = 0; r < 4; r++) for (let cI = 0; cI < 3; cI++)
        add(tb(0.08, 0.28, 0.24, [0xffd166, 0x6be0a0, 0xff6b6b, 0x6bb0ff][(r + cI) % 4]), vxu + 0.74, 1.05 + r * 0.48, vz - 0.52 + cI * 0.32);
      add(tb(0.1, 1.0, 0.34, 0x1a1216), vxu + 0.77, 2.2, vz + 0.55);
      add(tb(0.4, 0.35, 0.8, 0x101316), vxu + 0.55, 0.5, vz - 0.1);
      colliders.push({ x: vxu, z: vz, w: 1.8, d: 1.8 });
    });
  }

  // ---- diner booth (front-left): vinyl high-backs + table with a shake ----
  { const boothVinyl = toonMat(0xa8385e, { map: fabricTexture('#8a2e4e') });
    const bz2 = 7.8;
    function boothBench(x, flip) {
      const g = new THREE.Group();
      const seat = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.55, 3.2), boothVinyl); seat.position.y = 0.55; seat.castShadow = true; g.add(seat);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.9, 3.2), boothVinyl); back.position.set(flip * -0.45, 1.0, 0); back.castShadow = true; g.add(back);
      const trim2 = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.14, 3.24), toonMat(0x5e1e36)); trim2.position.set(flip * -0.45, 1.98, 0); g.add(trim2);
      const kick = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.16, 3.2), toonMat(0x5e1e36)); kick.position.y = 0.1; g.add(kick);
      g.position.set(x, 0, bz2); root.add(g);
      colliders.push({ x, z: bz2, w: 1.3, d: 3.4 });
      shade(x, bz2, 1.8, 3.8);
    }
    boothBench(-11.9, 1); boothBench(-8.9, -1);
    add(tb(1.5, 0.14, 2.6, 0xf3ecd8), -10.4, 1.06, bz2);              // table top
    add(tb(1.54, 0.08, 2.64, 0xd1435f), -10.4, 0.98, bz2);            // coloured edge band
    add(cyl(0.12, 0.16, 0.95, 8, 0x9aa6ae), -10.4, 0.5, bz2);         // pedestal
    add(cyl(0.14, 0.1, 0.34, 10, 0xfbd0dc), -10.7, 1.3, bz2 - 0.5);   // milkshake
    add(sph(0.09, 0xfff4e2), -10.7, 1.5, bz2 - 0.5);
    add(tb(0.5, 0.24, 0.35, 0xd9402a), -10.1, 1.25, bz2 + 0.6);       // fries carton
    for (const fdx of [-0.1, 0, 0.1]) add(tb(0.05, 0.3, 0.05, 0xffd166), -10.1 + fdx, 1.42, bz2 + 0.6);
    colliders.push({ x: -10.4, z: bz2, w: 1.7, d: 2.8 });
  }

  // ---- café counter against the right wall (with stools + menu board) ----
  const bx = W / 2 - 1.3;
  add(tb(2.0, 1.2, 6.0, 0x4a3326), bx, 0.6, -5);                        // counter body
  add(tb(2.3, 0.16, 6.3, 0x6e4a30), bx, 1.3, -5);                       // counter top
  add(cyl(0.18, 0.2, 0.5, 10, 0xcfcfd6), bx, 1.55, -6.4); add(cyl(0.18, 0.2, 0.5, 10, 0xcfcfd6), bx, 1.55, -5.6); // espresso machines
  for (const sz of [-3.4, -2.0]) { add(cyl(0.22, 0.26, 0.7, 12, 0x2b2f36), bx - 1.7, 0.35, sz); add(cyl(0.28, 0.28, 0.12, 14, 0x8a5a3a), bx - 1.7, 0.72, sz); } // stools
  add(new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.3), emi(0xffd9a0, 0xffb74d, 0.7)), W / 2 - 0.18, 3.3, -5).rotation.y = -Math.PI / 2; // glowing menu board on the wall
  { const sn = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.9),
      new THREE.MeshBasicMaterial({ map: neonTextTexture('SNACKS', '#ffd166', { size: 74 }), transparent: true, depthWrite: false }));
    sn.position.set(W / 2 - 0.3, 4.35, -5); sn.rotation.y = -Math.PI / 2; root.add(sn); }
  // snack-bar dressing: popcorn machine, donut case, straw cup + napkins
  { add(tb(0.85, 0.14, 0.85, 0xd1435f), bx, 1.44, -7.4);                                   // popcorn machine base
    const pgl = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.85, 0.8), new THREE.MeshToonMaterial({ color: 0xffe0b0, emissive: 0xffc266, emissiveIntensity: 0.35, transparent: true, opacity: 0.5 }));
    pgl.position.set(bx, 1.95, -7.4); root.add(pgl);
    add(tb(0.86, 0.16, 0.86, 0xd1435f), bx, 2.42, -7.4);
    for (let i = 0; i < 7; i++) add(sph(0.07, 0xfff4d8), bx - 0.22 + (i % 3) * 0.2, 1.62 + Math.floor(i / 3) * 0.13, -7.55 + (i % 2) * 0.24);
    add(tb(0.9, 0.5, 0.6, 0xbfe6f0), bx, 1.65, -2.6);                                       // little donut case
    const dn = FOOD_MODELS.donut.build(); dn.scale.setScalar(1.15); dn.position.set(bx, 1.52, -2.6); root.add(dn);
    add(cyl(0.12, 0.1, 0.3, 10, 0xd9402a), bx - 0.4, 1.55, -4.4);                           // straw cup
    add(tb(0.4, 0.22, 0.3, 0xf3ecd8), bx + 0.5, 1.5, -4.2);                                 // napkins
  }
  colliders.push({ x: bx, z: -5, w: 2.3, d: 6.3 }); shade(bx, -5, 3.0, 6.6);
  interactables.push({ id: 'order_food', x: bx - 2.0, z: -3.0, r: 2.4, label: '☕ Order drinks' });

  // ---- lounge zone (front-right): rug, couches, coffee table ----
  add(new THREE.Mesh(new THREE.PlaneGeometry(7.2, 5.4), toonMat(0xffffff, { map: rugTexture('#5a4a7e', '#3c3054') })), 9.5, 0.024, 5).rotation.x = -Math.PI / 2;
  function couch(x, z, ry, c) {
    const g = new THREE.Group();
    g.add((() => { const m = tb(3.4, 0.5, 1.5, c); m.position.y = 0.5; return m; })());
    g.add((() => { const m = tb(3.4, 0.9, 0.4, c); m.position.set(0, 1.0, -0.55); return m; })());
    for (const s of [-1, 1]) g.add((() => { const m = tb(0.4, 0.8, 1.5, c); m.position.set(s * 1.7, 0.9, 0); return m; })());
    for (const s of [-0.85, 0.85]) g.add((() => { const m = tb(1.4, 0.28, 1.3, c); m.position.set(s, 0.78, 0.05); return m; })()); // seat cushions
    g.position.set(x, 0, z); g.rotation.y = ry; root.add(g);
    const a = Math.abs(Math.sin(ry));
    colliders.push({ x, z, w: 3.8 * (1 - a) + 1.8 * a, d: 1.8 * (1 - a) + 3.8 * a }); shade(x, z, 4.4, 2.4);
    const fx = Math.sin(ry), fz = Math.cos(ry);
    interactables.push({ id: 'lounge', x: x + fx * 2.4, z: z + fz * 2.4, r: 2.4, label: '🛋️ Hang out',
      seatPos: { x, z, y: 0 }, sitY: 1.0, face: ry, stepBack: { x: x + fx * 2.2, z: z + fz * 2.2 } });
  }
  couch(9.5, 7.4, Math.PI, 0x4a6ea8);     // back couch (faces into room)
  couch(12.9, 5.0, -Math.PI / 2, 0xc0567a); // side couch
  add(tb(2.0, 0.45, 1.2, 0x3a2a1c), 9.5, 0.4, 4.6); // coffee table
  add(tb(1.7, 0.12, 0.95, 0x6e4a30), 9.5, 0.66, 4.6);

  // ---- trophy case mounted flush on the left wall ----
  const tw = -W / 2 + 0.25;
  add(tb(0.3, 3.3, 4.2, 0x4a3526), tw, 1.95, -1);                       // case carcass
  add(tb(0.14, 2.7, 3.5, 0xf3ecd8), tw + 0.22, 1.95, -1);              // lit back panel
  for (const sy of [1.0, 1.95, 2.9]) add(tb(0.36, 0.08, 3.5, 0x32241a), tw + 0.28, sy, -1); // glass shelves
  add(cyl(0.12, 0.16, 0.42, 10, 0xf2c14e), tw + 0.45, 1.35, -1.9);     // trophy cups
  add(cyl(0.12, 0.16, 0.42, 10, 0xf2c14e), tw + 0.45, 2.3, -0.2);
  add(sph(0.18, 0xe85b6a), tw + 0.45, 1.3, 0.0); add(sph(0.18, 0x5f9bd0), tw + 0.45, 2.25, -1.6);
  const qsign = textSprite('🏆 Trophies'); qsign.position.set(tw + 1.0, 3.95, -1); root.add(qsign);
  interactables.push({ id: 'quest_board', x: tw + 1.9, z: -1, r: 2.2, label: '🏆 Trophies & stats' });

  // ---- potted plants in the empty corners ----
  function plant(x, z) {
    add(cyl(0.34, 0.46, 0.8, 12, 0x9c5a28), x, 0.4, z);
    add(sph(0.78, 0x3f9d5a), x, 1.45, z);
    add(sph(0.55, 0x4fb069), x + 0.32, 1.9, z - 0.12);
    add(sph(0.5, 0x49a862), x - 0.3, 1.85, z + 0.1);
  }
  plant(-13.2, 9.4); plant(7.2, -8.6);

  // ---- pendant lamps over the tables + lounge ----
  function pendant(x, z) {
    add(cyl(0.04, 0.04, 1.2, 6, 0x23262c), x, 4.4, z);                 // cord
    const sh = cyl(0.52, 0.16, 0.5, 18, 0x2c2f36); sh.position.set(x, 3.75, z); root.add(sh);
    add(new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), emi(0xfff3d2, 0xffe2a6, 1.0)), x, 3.55, z);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowWarm, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.75 }));
    spr.scale.set(2.8, 2.8, 1); spr.position.set(x, 3.55, z); root.add(spr);
    const pl = new THREE.PointLight(0xffe1b0, 0.8, 17, 2); pl.position.set(x, 3.5, z); root.add(pl);
  }
  pendant(-5.5, -3.5); pendant(5.5, -3.5); pendant(10.5, 5.0);

  // ---- moody arcade lighting: dim lavender ambient, neon does the talking ----
  root.add(new THREE.AmbientLight(0xe0d6f2, 0.62));
  root.add(new THREE.HemisphereLight(0xb8b0dc, 0x4a4260, 0.4));
  const winLight = new THREE.DirectionalLight(0xbcc8ee, 0.22); winLight.position.set(0, 8, -10); root.add(winLight); // dusk spill from the glass wall
  for (const [lx, lz] of [[0, 3], [-10, -3], [11, 2]]) { const pl = new THREE.PointLight(0xffe6c8, 0.4, 18, 2); pl.position.set(lx, 4.6, lz); root.add(pl); }

  addExitPad(root, 0, D / 2 - 1.4);
  interactables.push({ id: 'exit_union', x: 0, z: D / 2 - 1.6, r: 2.2, label: '🚪 Leave Student Union' });
  const spawn = { x: 0, z: D / 2 - 4 };
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
  interactables.push({ id: 'sleep', x: -5, z: -3, r: 2.6, label: '😴 Sleep' }); // rest by the bed
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

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), toonMat(0xc9b795, { map: hardwoodFloor('#a08a68') }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; root.add(floor);
  const wallMat = toonMat(0xd8d3c0, { map: plaster() });
  { const m = new THREE.Mesh(new THREE.BoxGeometry(W, WALL_H, 0.6), wallMat); m.position.set(0, WALL_H / 2, -D / 2); m.receiveShadow = true; root.add(m); }
  for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, WALL_H, D), wallMat); m.position.set(s * W / 2, WALL_H / 2, 0); m.receiveShadow = true; root.add(m); }

  // ---- wood wainscot panelling (rail + battens) wrapping every wall ----
  const wainMat = toonMat(0xffffff, { map: woodPlanks('#6e4f30', '#5a3f26') });
  const battenMat = toonMat(0x4a3322);
  { const wain = (w, d, x, z, dir) => {
      const p = new THREE.Mesh(new THREE.BoxGeometry(w, 2.6, d), wainMat); p.position.set(x, 1.3, z); p.receiveShadow = true; root.add(p);
      at(tb(w + (dir === 'x' ? 0.2 : 0), 0.22, d + (dir === 'z' ? 0.2 : 0), 0x3d2c1c), x, 2.7, z); // cap rail
      const n = Math.round((dir === 'x' ? w : d) / 3.4);
      for (let i = 1; i < n; i++) {
        const u = -(dir === 'x' ? w : d) / 2 + i * ((dir === 'x' ? w : d) / n);
        const b = new THREE.Mesh(new THREE.BoxGeometry(dir === 'x' ? 0.22 : w + 0.08, 2.3, dir === 'x' ? d + 0.08 : 0.22), battenMat);
        b.position.set(dir === 'x' ? x + u : x, 1.25, dir === 'x' ? z : z + u); root.add(b);
      }
    };
    wain(W - 0.6, 0.5, 0, -D / 2 + 0.55, 'x');
    for (const s of [-1, 1]) wain(0.5, D - 0.6, s * (W / 2 - 0.55), 0, 'z');
  }

  // ---- ceiling acoustic beams: dark timber spans high above the hall ----
  const beamDark = toonMat(0x4c3826);
  for (const bz of [-14, -6, 2, 10, 18]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(W - 2, 0.9, 1.4), beamDark);
    beam.position.set(0, 11.4, bz); root.add(beam);
    for (const bx of [-18, 0, 18]) at(tb(0.5, 1.2, 1.0, 0x3a2a1c), bx, 12.4, bz); // hangers
  }

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
  // wooden end caps closing off each row (aisle side + outer side), with a
  // little brass row-number stud — reads like a proper auditorium
  { const capMat = toonMat(0xffffff, { map: woodPlanks('#6e4f30', '#553c24') });
    const capGeo = new THREE.BoxGeometry(0.24, 1.5, 1.6);
    const railGeo = new THREE.BoxGeometry(0.34, 0.14, 1.7);
    const studGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.06, 10);
    const studMat = toonMat(0xc9a13b);
    for (const rz of rows) for (const cx of [-15.0, -5.0, 5.0, 15.0]) {
      const cap = new THREE.Mesh(capGeo, capMat); cap.position.set(cx, 0.75, rz + 0.1); cap.castShadow = true; root.add(cap);
      const rail = new THREE.Mesh(railGeo, capMat); rail.position.set(cx, 1.55, rz + 0.1); root.add(rail);
      const stud = new THREE.Mesh(studGeo, studMat); stud.rotation.z = Math.PI / 2;
      stud.position.set(cx + (cx > 0 ? -0.19 : 0.19) * (Math.abs(cx) > 10 ? -1 : 1), 1.1, rz + 0.1); root.add(stud);
      colliders.push({ x: cx, z: rz + 0.1, w: 0.4, d: 1.7 });
    }
  }
  // central carpet runner down the aisle
  { const r = new THREE.Mesh(new THREE.PlaneGeometry(3, 30), toonMat(0xffffff, { map: rugTexture('#6e2f2f', '#4a1f1f') })); r.rotation.x = -Math.PI / 2; r.position.set(0, 0.02, 2); root.add(r); }
  // stage dressing: side curtains + valance, a plant, and a mic on the podium
  const drapeMat = toonMat(0xffffff, { map: curtainTexture('#8a2436', '#5e1622') });
  for (const cx of [-11.5, 11.5]) { const cu = new THREE.Mesh(new THREE.BoxGeometry(2.2, 9.5, 0.6), drapeMat); cu.position.set(cx, 5, Sz + 0.35); cu.castShadow = true; root.add(cu); }
  at(tb(25, 1.6, 0.7, 0x7a2030), 0, 9.7, Sz + 0.35);
  at(tb(25.4, 0.3, 0.85, 0xc9a13b), 0, 10.55, Sz + 0.35); // gilded valance rail

  // ---- big chalkboard with equations (left of the stage) + a smaller one right ----
  function chalkWall(x, y, z, wdt, hgt, lines) {
    at(tb(wdt + 0.5, hgt + 0.5, 0.24, 0x5a3f26), x, y, z);                       // oak frame
    const face = new THREE.Mesh(new THREE.PlaneGeometry(wdt, hgt), toonMat(0xffffff, { map: chalkboardTexture(lines) }));
    face.position.set(x, y, z + 0.14); root.add(face);
    at(tb(wdt * 0.7, 0.14, 0.34, 0x5a3f26), x, y - hgt / 2 - 0.32, z + 0.1);     // chalk tray
    at(tb(0.5, 0.08, 0.1, 0xf3ecd8), x - wdt * 0.2, y - hgt / 2 - 0.24, z + 0.12); // chalk stick
    at(tb(0.6, 0.16, 0.22, 0x8a8580), x + wdt * 0.18, y - hgt / 2 - 0.22, z + 0.12); // eraser
  }
  chalkWall(-20, 5.4, Sz + 0.32, 9.4, 5.2, [
    { t: 'PHYS 201 — Waves', accent: true, underline: true },
    { t: 'E = mc²  ·  F = ma' },
    { t: 'λ = v / f      ω = 2πf' },
    { t: '∫ x² dx = x³/3 + C' },
    { t: 'Ψ(x,t) = A sin(kx − ωt)' },
    { t: 'HW due Friday!', accent: true },
  ]);
  chalkWall(20, 5.4, Sz + 0.32, 9.4, 5.2, [
    { t: 'MIDTERM REVIEW', accent: true, underline: true },
    { t: 'x = (−b ± √(b²−4ac)) / 2a' },
    { t: 'eⁱᵖ + 1 = 0' },
    { t: 'sin²θ + cos²θ = 1' },
    { t: 'lim  (1 + 1/n)ⁿ = e' },
    { t: 'office hrs: Tue 2–4', accent: true },
  ]);

  // ---- university crest, centred high above the projector screen ----
  { const cr = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6), new THREE.MeshBasicMaterial({ map: crestTexture(), transparent: true }));
    cr.position.set(0, 11.7, Sz + 0.34); root.add(cr);
    at(tb(4.6, 0.18, 0.2, 0xc9a13b), 0, 13.6, Sz + 0.3); at(tb(4.6, 0.18, 0.2, 0xc9a13b), 0, 9.9, Sz + 0.3); }

  // ---- stage lighting rig: truss + warm can lights (emissive + glow sprites) ----
  const stageGlowTex = glowTexture('255,200,130');
  { const truss = at(tb(26, 0.45, 0.45, 0x2b2f36), 0, 9.4, -D / 2 + 7.2);
    truss.castShadow = false;
    for (const hx of [-10, 0, 10]) at(tb(0.18, 2.2, 0.18, 0x2b2f36), hx, 10.4, -D / 2 + 7.2);
    for (const lx of [-9, -3, 3, 9]) {
      const can = cyl(0.34, 0.42, 0.75, 12, 0x33353b); can.position.set(lx, 8.9, -D / 2 + 7.2); can.rotation.x = -0.7; root.add(can);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.3, 12), emi(0xffe2a8, 0xffc266, 0.9));
      lens.position.set(lx, 8.62, -D / 2 + 7.55); lens.rotation.x = -0.7 - Math.PI / 2; root.add(lens);
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: stageGlowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 }));
      spr.scale.set(2.6, 2.6, 1); spr.position.set(lx, 8.6, -D / 2 + 7.6); root.add(spr);
    }
  }

  // ---- hanging projector aimed at the screen ----
  { at(tb(0.16, 2.8, 0.16, 0x2b2f36), 0, 12.2, -4);
    at(tb(1.1, 0.5, 1.5, 0xd8d5cc), 0, 10.6, -4);
    const lens2 = new THREE.Mesh(new THREE.CircleGeometry(0.16, 12), emi(0xcfe8ff, 0x9fd0ff, 0.9));
    lens2.position.set(0, 10.6, -4.8); lens2.rotation.y = Math.PI; root.add(lens2);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: stageGlowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 }));
    spr.scale.set(1.6, 1.6, 1); spr.position.set(0, 10.6, -4.9); root.add(spr);
  }
  at(cyl(0.5, 0.4, 0.9, 12, 0xb5703f), 9, 1.25, -D / 2 + 5.5); { const f = at(new THREE.Mesh(new THREE.SphereGeometry(0.95, 12, 10), toonMat(0x4f8a45)), 9, 2.3, -D / 2 + 5.5); f.scale.y = 1.1; }
  at(cyl(0.03, 0.03, 0.7, 6, 0x33353b), -8, 2.7, -D / 2 + 6.0); at(new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), toonMat(0x222)), -8, 3.05, -D / 2 + 6.0); // mic
  // gentle decorative columns at the far sides (well clear of the screen)
  for (const cx of [-25, 25]) for (const cz of [-6, 10]) {
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.56, WALL_H, 16), toonMat(0xe7ddc9));
    sh.position.set(cx, WALL_H / 2, cz); sh.castShadow = true; root.add(sh);
    colliders.push({ x: cx, z: cz, w: 1.4, d: 1.4 });
  }
  // warm wall sconces down both sides (uplight cone + soft glow sprite)
  { const scGeo = new THREE.ConeGeometry(0.4, 0.6, 12); const scMat = emi(0xfff0c4, 0xffcf7a, 0.5);
    const scSprMat = new THREE.SpriteMaterial({ map: stageGlowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.7 });
    for (const sz of [-6, 4, 14]) for (const s of [-1, 1]) {
      at(new THREE.Mesh(scGeo, scMat), s * (W / 2 - 0.5), 7, sz);
      at(tb(0.18, 1.1, 0.5, 0x4c3826), s * (W / 2 - 0.35), 6.9, sz);
      const spr = new THREE.Sprite(scSprMat); spr.scale.set(2.8, 2.8, 1); spr.position.set(s * (W / 2 - 0.8), 7.5, sz); root.add(spr);
    } }

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

  // polished stone floor with a dark inlaid border + centre medallion — reads
  // as a marble academic foyer rather than a wooden hall
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), toonMat(0xded5c2, { map: stoneFloor('#eae3d4') }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; root.add(floor);
  const inlay = toonMat(0x8a7a60);
  for (const [w, d, x, z] of [[W - 5, 0.5, 0, -D / 2 + 2.6], [W - 5, 0.5, 0, D / 2 - 2.6], [0.5, D - 5.7, -W / 2 + 2.6, 0], [0.5, D - 5.7, W / 2 - 2.6, 0]]) {
    const st = new THREE.Mesh(new THREE.PlaneGeometry(w, d), inlay); st.rotation.x = -Math.PI / 2; st.position.set(x, 0.015, z); root.add(st);
  }
  { // medallion: two stone rings + warm centre disc on the main walking axis
    const ring = (rIn, rOut, m, y) => { const q = new THREE.Mesh(new THREE.RingGeometry(rIn, rOut, 40), m); q.rotation.x = -Math.PI / 2; q.position.set(0, y, 2); root.add(q); };
    ring(2.9, 3.3, inlay, 0.016); ring(1.7, 2.0, inlay, 0.016);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.7, 36), toonMat(0xcbb98f)); disc.rotation.x = -Math.PI / 2; disc.position.set(0, 0.014, 2); root.add(disc);
  }
  const wallMat = toonMat(0xe9e2d0, { map: plaster() });
  { const m = new THREE.Mesh(new THREE.BoxGeometry(W, WALL_H, 0.6), wallMat); m.position.set(0, WALL_H / 2, -D / 2); m.receiveShadow = true; root.add(m); }
  for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, WALL_H, D), wallMat); m.position.set(s * W / 2, WALL_H / 2, 0); m.receiveShadow = true; root.add(m); }
  // stone wainscot: baseboard + panel band + cap rail along every wall
  for (const [w, d, x, z] of [[W, 0.3, 0, -D / 2 + 0.3], [0.3, D, -W / 2 + 0.3, 0], [0.3, D, W / 2 - 0.3, 0]]) {
    at(tb(w, 0.6, d, 0xbcae92), x, 0.3, z);
    at(tb(w, 1.15, d, 0xd8ccb0), x, 1.15, z);
    at(tb(w, 0.2, d, 0xbcae92), x, 1.8, z);
  }

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

  // ---- notice boards with pinned papers (wood frame + cork texture) ----
  function noticeBoard(x, y, z, ry, wdt = 3.4, hgt = 2.5, seed = 3) {
    const g = new THREE.Group();
    const fr = tbm(wdt + 0.3, hgt + 0.3, 0.14, toonMat(0x6e4f30)); g.add(fr);
    const cork = new THREE.Mesh(new THREE.PlaneGeometry(wdt, hgt), toonMat(0xffffff, { map: corkboardTexture(seed) }));
    cork.position.z = 0.09; g.add(cork);
    const ledge = tbm(wdt + 0.3, 0.12, 0.3, toonMat(0x5a3f26)); ledge.position.set(0, -hgt / 2 - 0.2, 0.1); g.add(ledge);
    g.position.set(x, y, z); g.rotation.y = ry; root.add(g);
  }
  noticeBoard(-W / 2 + 0.42, 3.4, 8, Math.PI / 2, 3.6, 2.6, 3);
  noticeBoard(-W / 2 + 0.42, 3.4, 12.6, Math.PI / 2, 2.6, 2.2, 8);
  noticeBoard(W / 2 - 0.42, 3.4, 2.4, -Math.PI / 2, 3.0, 2.4, 5);

  // ---- department banners: felt pennants hung from the mezzanine edge +
  // two grand crest banners high on the side walls ----
  const pennantMats = [
    new THREE.MeshBasicMaterial({ map: pennantBannerTexture('#8a1f2d', '#c9a13b', 'B'), transparent: true }),
    new THREE.MeshBasicMaterial({ map: pennantBannerTexture('#274a73', '#e8d9a8', 'U'), transparent: true }),
    new THREE.MeshBasicMaterial({ map: pennantBannerTexture('#3f6a42', '#e8d9a8', 'B'), transparent: true }),
  ];
  const pennantGeo = new THREE.PlaneGeometry(1.5, 3.0);
  [[-18.5, 0], [2, 1], [10, 2]].forEach(([bx, mi]) => {
    const p = new THREE.Mesh(pennantGeo, pennantMats[mi]);
    p.position.set(bx, MEZZ_Y - 1.9, DECK_FRONT + 0.12); root.add(p);
    at(tb(1.7, 0.1, 0.1, 0xc9a13b), bx, MEZZ_Y - 0.45, DECK_FRONT + 0.1); // hanging rod
  });
  const crestTex = crestTexture();
  const crestMat = new THREE.MeshBasicMaterial({ map: crestTex, transparent: true });
  for (const s of [-1, 1]) {
    const banner = tbm(0.14, 5.2, 3.4, toonMat(0x8a1f2d)); banner.position.set(s * (W / 2 - 0.45), 8.6, 2); root.add(banner);
    at(tb(0.2, 0.24, 3.8, 0xc9a13b), s * (W / 2 - 0.45), 11.3, 2);
    const cr = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), crestMat);
    cr.position.set(s * (W / 2 - 0.5), 8.8, 2); cr.rotation.y = -s * Math.PI / 2; root.add(cr);
  }

  // ---- slatted oak benches (waiting seating along the walls) ----
  function bench(x, z, ry) {
    const g = new THREE.Group();
    for (const so of [-0.28, 0, 0.28]) gat(g, tbm(4.0, 0.1, 0.24, woodWarm), 0, 0.62, so);       // seat slats
    for (const so of [0.4, 0.85]) { const sl = tbm(4.0, 0.22, 0.09, woodWarm); sl.position.set(0, 0.62 + so, -0.42); sl.rotation.x = -0.16; g.add(sl); } // back slats
    for (const sx of [-1.7, 1.7]) {
      gat(g, tbm(0.16, 0.62, 0.8, woodDark), sx, 0.31, 0);                                       // end legs
      const arm = tbm(0.14, 0.1, 0.9, woodDark); arm.position.set(sx, 0.98, -0.05); g.add(arm);  // armrest
      const post = tbm(0.12, 1.15, 0.12, woodDark); post.position.set(sx, 1.05, -0.44); post.rotation.x = -0.16; g.add(post);
    }
    g.position.set(x, 0, z); g.rotation.y = ry; root.add(g);
    shade(x, z, 4.6, 1.6);
    const a = Math.abs(Math.sin(ry));
    colliders.push({ x, z, w: 4.2 * (1 - a) + 1.2 * a, d: 1.2 * (1 - a) + 4.2 * a });
  }
  bench(-W / 2 + 1.2, 0.5, Math.PI / 2);   // under the left notice boards
  bench(W / 2 - 1.2, 13.4, -Math.PI / 2);  // by the entrance, right wall

  // ---- warm wall sconces (emissive, no new dynamic lights) ----
  const lobbyGlowTex = glowTexture('255,214,150');
  const sconceShadeMat = new THREE.MeshToonMaterial({ color: 0xf3e3b8, emissive: 0xd9a960, emissiveIntensity: 0.6 });
  const sconceGeo = new THREE.ConeGeometry(0.34, 0.55, 12);
  function sconce(x, y, z, ry) {
    const g = new THREE.Group();
    const back = tbm(0.16, 0.9, 0.34, toonMat(0x6e5a3a)); g.add(back);
    const cup = new THREE.Mesh(sconceGeo, sconceShadeMat); cup.rotation.z = Math.PI; cup.position.set(0.28, 0.16, 0); g.add(cup);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: lobbyGlowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85 }));
    spr.scale.set(2.2, 2.2, 1); spr.position.set(0.34, 0.42, 0); g.add(spr);
    g.position.set(x, y, z); g.rotation.y = ry; root.add(g);
  }
  for (const sz of [-13, -3.5, 5.5, 14.5]) { sconce(-W / 2 + 0.45, 4.4, sz, 0); sconce(W / 2 - 0.45, 4.4, sz, Math.PI); }
  sconce(-2.5, 4.4, -D / 2 + 0.6, -Math.PI / 2); sconce(-13.5, 4.4, -D / 2 + 0.6, -Math.PI / 2); // flank the hall door
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
  // carved stone door surround: shallow arch + pilasters + keystone, all kept
  // below the mezzanine deck (y<5.7) so it reads from the ground floor
  { const oak = 0x9a6a3f, oakDark = 0x6e4a28;
    const arch = new THREE.Mesh(new THREE.RingGeometry(2.15, 2.75, 26, 1, 0, Math.PI), toonMat(oak));
    arch.scale.y = 0.55; arch.position.set(-8, 4.3, -D / 2 + 0.86); root.add(arch);
    at(tb(0.6, 0.75, 0.4, 0x6e4a28), -8, 5.3, -D / 2 + 0.88); // keystone
    for (const s of [-1, 1]) {
      at(tb(0.75, 4.3, 0.6, oak), -8 + s * 2.65, 2.15, -D / 2 + 0.82);      // pilaster shaft
      at(tb(1.05, 0.32, 0.8, oakDark), -8 + s * 2.65, 4.45, -D / 2 + 0.82); // capital
      at(tb(1.05, 0.38, 0.8, oakDark), -8 + s * 2.65, 0.19, -D / 2 + 0.82); // base
    }
  }
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
