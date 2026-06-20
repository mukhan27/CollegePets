// Outdoor campus v2 — Animal Crossing-inspired: painted ground with rounded
// sandy paths, gradient sky dome with drifting clouds, toon-shaded buildings
// with gable roofs, chunky trees, instanced grass/flowers, ambient leaves.
// Layout coordinates (buildings, paths, colliders) are unchanged from v1.

import * as THREE from 'three';
import { PALETTE as P } from './palette.js';
import {
  toonMat, campusGroundTexture, woodPlanks, brickTexture, shingleTexture,
  awningTexture, courtTexture, skyTexture, glowTexture, cloudTexture, leafTexture,
  plaster,
} from './textures.js';

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
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  const scale = 0.022;
  sprite.scale.set(canvas.width * scale, canvas.height * scale, 1);
  return sprite;
}

function mesh(geo, material, x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  return m;
}
const box = (w, h, d, color) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toonMat(color));

// ----------------------------------------------------------- nature
function makeTree(x, z, scale = 1, seed = 0) {
  const g = new THREE.Group();
  const trunk = mesh(new THREE.CylinderGeometry(0.28, 0.42, 2.4, 8), toonMat(P.trunk), 0, 1.2, 0);
  g.add(trunk);
  const leafColors = [P.leaf1, P.leaf2, P.leaf3];
  const blobs = [
    [0, 3.2, 0, 1.7], [-0.9, 2.6, 0.3, 1.15], [0.85, 2.7, -0.25, 1.2], [0.1, 4.1, 0.15, 1.1],
  ];
  blobs.forEach(([bx, by, bz, r], i) => {
    const c = new THREE.Color(leafColors[(i + seed) % 3]).offsetHSL(0, 0, ((seed * 13 + i * 7) % 10 - 5) * 0.008);
    const blob = mesh(new THREE.SphereGeometry(r, 14, 10), toonMat(c.getHex(), { noCache: true }), bx, by, bz);
    g.add(blob);
  });
  if (seed % 3 === 0) { // fruit tree
    for (let i = 0; i < 4; i++) {
      const a = i * 1.7 + seed;
      g.add(mesh(new THREE.SphereGeometry(0.14, 8, 6), toonMat(0xe05548),
        Math.cos(a) * 1.3, 2.8 + Math.sin(a * 2) * 0.7, Math.sin(a) * 1.3));
    }
  }
  g.position.set(x, 0, z);
  g.scale.setScalar(scale);
  return g;
}

function makeBush(x, z, s = 1) {
  const b = mesh(new THREE.SphereGeometry(0.8, 12, 8), toonMat(P.leaf2), x, 0.45 * s, z);
  b.scale.set(s, 0.7 * s, s);
  return b;
}

function makeRock(x, z, s = 1) {
  const r = mesh(new THREE.DodecahedronGeometry(0.7 * s, 0), toonMat(P.rock), x, 0.3 * s, z);
  r.scale.y = 0.6;
  r.rotation.y = x * 1.3 + z;
  return r;
}

function makeLamp(x, z) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.09, 0.13, 4, 8), toonMat(0x3e4a5c), 0, 2, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.18, 8), toonMat(0x3e4a5c), 0, 4.05, 0));
  const bulb = mesh(new THREE.SphereGeometry(0.28, 10, 8),
    new THREE.MeshToonMaterial({ color: 0xfff2c0, emissive: 0xc8a850 }), 0, 4.32, 0, false);
  g.add(bulb);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  glow.scale.setScalar(2.6);
  glow.position.y = 4.32;
  g.add(glow);
  g.position.set(x, 0, z);
  return g;
}

function makeBench(x, z, rotY = 0) {
  const g = new THREE.Group();
  const woodM = toonMat(P.woodLight);
  for (let i = 0; i < 3; i++) g.add(mesh(new THREE.BoxGeometry(2.2, 0.09, 0.2), woodM, 0, 0.56, -0.25 + i * 0.25));
  for (let i = 0; i < 2; i++) g.add(mesh(new THREE.BoxGeometry(2.2, 0.18, 0.08), woodM, 0, 0.95 + i * 0.26, -0.42));
  for (const s of [-1, 1]) {
    g.add(mesh(new THREE.BoxGeometry(0.14, 0.56, 0.7), toonMat(0x4a525c), s * 0.92, 0.28, 0));
    g.add(mesh(new THREE.BoxGeometry(0.14, 0.7, 0.12), toonMat(0x4a525c), s * 0.92, 0.9, -0.42));
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

function makeFence(x, z, len, rotY = 0) {
  const g = new THREE.Group();
  const m = toonMat(P.woodLight);
  const posts = Math.max(2, Math.round(len / 1.6));
  for (let i = 0; i < posts; i++) {
    const px = -len / 2 + (i / (posts - 1)) * len;
    g.add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.0, 6), m, px, 0.5, 0));
    g.add(mesh(new THREE.SphereGeometry(0.11, 6, 5), m, px, 1.02, 0));
  }
  for (const ry of [0.45, 0.8]) g.add(mesh(new THREE.BoxGeometry(len, 0.09, 0.07), m, 0, ry, 0));
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

function makeSignpost(x, z, rotY = 0) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.1, 0.12, 2.2, 6), toonMat(P.wood), 0, 1.1, 0));
  const boardM = toonMat(P.woodLight);
  const b1 = mesh(new THREE.BoxGeometry(1.5, 0.42, 0.1), boardM, 0.4, 1.85, 0);
  b1.rotation.y = 0.25;
  g.add(b1);
  const b2 = mesh(new THREE.BoxGeometry(1.3, 0.42, 0.1), boardM, -0.35, 1.3, 0.05);
  b2.rotation.y = -0.35;
  g.add(b2);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

function makePicnicTable(x, z, rotY = 0) {
  const g = new THREE.Group();
  const m = toonMat(P.woodLight);
  g.add(mesh(new THREE.BoxGeometry(2.4, 0.12, 1.4), m, 0, 0.78, 0));
  for (const s of [-1, 1]) {
    g.add(mesh(new THREE.BoxGeometry(2.4, 0.1, 0.4), m, 0, 0.45, s * 1.05));
    const leg = mesh(new THREE.BoxGeometry(0.14, 0.8, 1.9), m, s * 0.9, 0.4, 0);
    leg.rotation.x = 0.25 * s * 0;
    g.add(leg);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

// ----------------------------------------------------------- buildings v2
function addWindow(g, x, y, z, w = 1.5, h = 1.7) {
  g.add(mesh(new THREE.BoxGeometry(w + 0.24, h + 0.24, 0.12), toonMat(P.white), x, y, z, false));
  g.add(mesh(new THREE.BoxGeometry(w, h, 0.16),
    new THREE.MeshToonMaterial({ color: P.glass, emissive: 0x2a4a55 }), x, y, z, false));
  g.add(mesh(new THREE.BoxGeometry(0.08, h, 0.18), toonMat(P.white), x, y, z, false));
  g.add(mesh(new THREE.BoxGeometry(w, 0.08, 0.18), toonMat(P.white), x, y, z, false));
  g.add(mesh(new THREE.BoxGeometry(w + 0.3, 0.16, 0.3), toonMat(P.white), x, y - h / 2 - 0.1, z + 0.06, false));
}

function gableRoof(w, d, roofColor, { overhang = 0.9, pitch = 0.62 } = {}) {
  const half = d / 2 + overhang;
  const rise = half * Math.tan(pitch);
  const shape = new THREE.Shape();
  shape.moveTo(-half, 0);
  shape.lineTo(half, 0);
  shape.lineTo(0, rise);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: w + overhang * 1.6, bevelEnabled: false });
  geo.translate(0, 0, -(w + overhang * 1.6) / 2);
  geo.rotateY(Math.PI / 2);
  const tex = shingleTexture('#ffffff');
  tex.repeat.set(0.22, 0.22);
  const roof = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ color: roofColor, map: tex }));
  roof.castShadow = true;
  const ridge = mesh(new THREE.BoxGeometry(w + overhang * 1.6 + 0.2, 0.22, 0.5),
    toonMat(new THREE.Color(roofColor).offsetHSL(0, 0, -0.08).getHex(), { noCache: true }), 0, rise, 0);
  const g = new THREE.Group();
  g.add(roof, ridge);
  g.userData.rise = rise;
  return g;
}

function archRoof(w, d, roofColor) {
  const r = d / 2 + 0.7;
  const geo = new THREE.CylinderGeometry(r, r, w + 1.4, 18, 1, false, 0, Math.PI);
  const roof = new THREE.Mesh(geo, toonMat(roofColor));
  roof.rotation.z = Math.PI / 2;
  roof.rotation.y = Math.PI / 2;
  roof.castShadow = true;
  const g = new THREE.Group();
  g.add(roof);
  g.userData.rise = r;
  return g;
}

function makeBuilding(b) {
  const { x, z, w, h, d } = b;
  const g = new THREE.Group();

  // walls
  // brick texture is self-colored (no tint); neutral planks take the wall color
  const tex = b.wallStyle === 'brick' ? brickTexture() : woodPlanks();
  tex.repeat.set(Math.max(1, w / 7), Math.max(1, h / 7));
  const wallMat = new THREE.MeshToonMaterial({
    color: b.wallStyle === 'brick' ? 0xffffff : b.color, map: tex,
  });
  const body = mesh(new THREE.BoxGeometry(w, h, d), wallMat, 0, h / 2, 0);
  body.receiveShadow = true;
  g.add(body);

  // base trim
  g.add(mesh(new THREE.BoxGeometry(w + 0.3, 0.5, d + 0.3),
    toonMat(new THREE.Color(b.color).offsetHSL(0, 0, -0.12).getHex(), { noCache: true }), 0, 0.25, 0, false));

  // roof
  const roof = b.roofStyle === 'arch' ? archRoof(w, d, b.roofColor) : gableRoof(w, d, b.roofColor);
  roof.position.y = h;
  g.add(roof);

  // windows on the front face
  const cols = Math.max(2, Math.floor(w / 5.5));
  for (let i = 0; i < cols; i++) {
    const wx = -w / 2 + (i + 0.5) * (w / cols);
    if (Math.abs(wx) < 2.2) continue; // leave room for the door
    addWindow(g, wx, h * 0.42, d / 2 + 0.04);
    if (h > 9) addWindow(g, wx, h * 0.42 + 3.2, d / 2 + 0.04);
  }

  // door with frame, step and knob
  const doorG = new THREE.Group();
  doorG.add(mesh(new THREE.BoxGeometry(2.7, 3.6, 0.14), toonMat(P.white), 0, 1.8, 0, false));
  doorG.add(mesh(new THREE.BoxGeometry(2.2, 3.2, 0.2), toonMat(P.woodDark), 0, 1.6, 0.02, false));
  doorG.add(mesh(new THREE.SphereGeometry(0.09, 8, 6), toonMat(0xf2c14e), 0.7, 1.5, 0.16, false));
  doorG.add(mesh(new THREE.BoxGeometry(3.2, 0.24, 1.5), toonMat(P.sandDark), 0, 0.12, 0.75, false));
  doorG.position.set(0, 0, d / 2 + 0.04);
  g.add(doorG);

  // style extras
  if (b.awning) {
    const aw = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.12, 1.6),
      new THREE.MeshToonMaterial({ map: awningTexture(), color: 0xffffff }));
    aw.rotation.x = 0.35;
    aw.position.set(0, 4.1, d / 2 + 0.85);
    aw.castShadow = true;
    g.add(aw);
  }
  if (b.columns) {
    for (const s of [-1.5, -0.5, 0.5, 1.5]) {
      g.add(mesh(new THREE.CylinderGeometry(0.28, 0.32, 4.6, 10), toonMat(P.white), s * 3.4, 2.3, d / 2 + 1.6));
    }
    g.add(mesh(new THREE.BoxGeometry(11.5, 0.5, 2.6), toonMat(P.white), 0, 4.8, d / 2 + 1.3));
    g.add(mesh(new THREE.BoxGeometry(12, 0.3, 3.2), toonMat(P.sandDark), 0, 0.15, d / 2 + 1.4, false));
  }
  if (b.chimney) {
    const ch = mesh(new THREE.BoxGeometry(1.1, 2.6, 1.1), new THREE.MeshToonMaterial({ color: 0xc88a70, map: brickTexture() }), w * 0.28, h + 1.6, -d * 0.15);
    g.add(ch);
    g.add(mesh(new THREE.BoxGeometry(1.4, 0.3, 1.4), toonMat(0x9a6a55), w * 0.28, h + 2.95, -d * 0.15, false));
  }

  // floating name sign
  const sign = textSprite(b.label);
  sign.position.set(0, h + (g.children.find(c => c.userData.rise)?.userData.rise || 3) + 1.4, 0);
  g.add(sign);

  g.position.set(x, 0, z);
  const doorWorld = new THREE.Vector3(x, 0, z + d / 2 + 1.6);
  const collider = { x, z, w: w + 0.6, d: d + 0.6 };
  return { group: g, doorWorld, collider };
}

// A grand library exterior that matches the interior: warm plaster hall, tall
// arched windows in two storeys, a columned portico with a pediment, and a
// stone plinth + steps. Big enough to read as the cavernous interior's shell.
function makeLibraryExterior(b) {
  const { x, z, w, h, d } = b;
  const g = new THREE.Group();
  const wallMat = new THREE.MeshToonMaterial({ color: 0xe7d8bd, map: plaster() });
  const stoneMat = toonMat(0xccbd9c);
  const trimMat = toonMat(0xf2ece0);              // warm ivory — matches interior columns
  const glassMat = new THREE.MeshToonMaterial({ color: P.glass, emissive: 0x2a4a55 });
  const Y = 1.4; // top of the stone plinth (the building's ground line)

  g.add(mesh(new THREE.BoxGeometry(w + 1.4, Y, d + 1.4), stoneMat, 0, Y / 2, 0));
  const body = mesh(new THREE.BoxGeometry(w, h, d), wallMat, 0, Y + h / 2, 0);
  body.receiveShadow = true; g.add(body);
  g.add(mesh(new THREE.BoxGeometry(w + 0.9, 0.9, d + 0.9), trimMat, 0, Y + h, 0)); // cornice
  const roof = gableRoof(w, d, b.roofColor, { pitch: 0.42 }); roof.position.y = Y + h + 0.45; g.add(roof);

  // a tall arched window (faces +z; ry rotates it onto the side walls)
  function archWindow(px, py, pz, ry, ww = 2.6, wh = 4.2) {
    const grp = new THREE.Group();
    grp.add(mesh(new THREE.BoxGeometry(ww + 0.5, wh + 0.4, 0.18), trimMat, 0, 0, 0, false));
    grp.add(mesh(new THREE.BoxGeometry(ww, wh, 0.24), glassMat, 0, 0, 0.05, false));
    const top = new THREE.Mesh(new THREE.CircleGeometry(ww / 2, 16, 0, Math.PI), glassMat); top.position.set(0, wh / 2, 0.06); grp.add(top);
    const ring = new THREE.Mesh(new THREE.RingGeometry(ww / 2, ww / 2 + 0.26, 16, 1, 0, Math.PI), trimMat); ring.position.set(0, wh / 2, 0.05); grp.add(ring);
    grp.add(mesh(new THREE.BoxGeometry(0.12, wh, 0.26), trimMat, 0, 0, 0.07, false));
    grp.add(mesh(new THREE.BoxGeometry(ww, 0.12, 0.26), trimMat, 0, 0, 0.07, false));
    grp.position.set(px, py, pz); grp.rotation.y = ry; g.add(grp);
  }
  const lowY = Y + 4.4, upY = Y + 11.6;
  const bays = 5;
  for (let i = 0; i < bays; i++) {
    const wx = -w / 2 + (i + 0.5) * (w / bays);
    if (Math.abs(wx) < 6.5) continue; // centre reserved for the entrance
    archWindow(wx, lowY, d / 2 + 0.05, 0);
    archWindow(wx, upY, d / 2 + 0.05, 0);
  }
  for (const s of [-1, 1]) for (const bz of [-d / 4, d / 4]) {
    archWindow(s * (w / 2 + 0.05), lowY, bz, s * Math.PI / 2);
    archWindow(s * (w / 2 + 0.05), upY, bz, s * Math.PI / 2);
  }

  // ---- grand portico, standing on a solid stone porch ----
  const porchD = 5, colH = 11, colZ = d / 2 + porchD - 1.0;
  // solid masonry porch floor: ground up to the plinth top (Y), reaching from the
  // body out past the columns so they read as planted, not floating
  const porchFront = d / 2 + porchD + 1.0;
  g.add(mesh(new THREE.BoxGeometry(18, Y, porchD + 1.0), stoneMat, 0, Y / 2, d / 2 + (porchD + 1.0) / 2, false));
  const colXs = [-7.5, -4.2, 4.2, 7.5]; // clear of the ~4m-wide door (±2.3)
  for (const s of colXs) {
    g.add(mesh(new THREE.CylinderGeometry(0.5, 0.55, colH, 14), trimMat, s, Y + colH / 2, colZ));
    g.add(mesh(new THREE.BoxGeometry(1.3, 0.55, 1.3), trimMat, s, Y + 0.28, colZ, false));        // base
    g.add(mesh(new THREE.BoxGeometry(1.3, 0.55, 1.3), trimMat, s, Y + colH - 0.28, colZ, false));  // capital
  }
  const entW = 17, entY = Y + colH + 0.35;
  g.add(mesh(new THREE.BoxGeometry(entW, 1.1, 1.9), trimMat, 0, entY, colZ));
  const pr = entW * 0.22;
  const ps = new THREE.Shape(); ps.moveTo(-entW / 2, 0); ps.lineTo(entW / 2, 0); ps.lineTo(0, pr); ps.closePath();
  const ped = new THREE.Mesh(new THREE.ExtrudeGeometry(ps, { depth: 1.7, bevelEnabled: false }), trimMat);
  ped.position.set(0, entY + 0.55, colZ - 0.95); ped.castShadow = true; g.add(ped);

  // solid masonry steps descending from the porch to the lawn (each a full block)
  for (let i = 0; i < 3; i++) {
    const hi = Y * (3 - i) / 4;
    g.add(mesh(new THREE.BoxGeometry(13 - i, hi, 1.1), stoneMat, 0, hi / 2, porchFront + 0.5 + i * 1.05, false));
  }

  // grand double door against the body
  const doorG = new THREE.Group();
  doorG.add(mesh(new THREE.BoxGeometry(4.6, 6.2, 0.22), trimMat, 0, 3.1, 0, false));
  doorG.add(mesh(new THREE.BoxGeometry(3.8, 5.6, 0.28), toonMat(P.woodDark), 0, 3.0, 0.05, false));
  doorG.add(mesh(new THREE.BoxGeometry(0.12, 5.6, 0.32), toonMat(0xc8a24a), 0, 3.0, 0.12, false));
  for (const s of [-0.55, 0.55]) doorG.add(mesh(new THREE.SphereGeometry(0.13, 8, 6), toonMat(0xf2c14e), s, 2.7, 0.2, false));
  doorG.position.set(0, Y, d / 2 + 0.05); g.add(doorG);

  const sign = textSprite(b.label);
  sign.position.set(0, Y + h + (roof.userData.rise || 4) + 2, 0);
  g.add(sign);

  g.position.set(x, 0, z);
  // doorWorld is the spawn-back point on the lawn; `enter` centres the prompt
  // over the whole approach (steps + porch) so it never drops out at the door
  const doorWorld = new THREE.Vector3(x, 0, z + porchFront + 2.5);
  const enter = new THREE.Vector3(x, 0, z + d / 2 + 5);
  const collider = { x, z, w: w + 1.4, d: d + 1.4 };
  return { group: g, doorWorld, enter, enterR: 6, collider };
}

// A storefront-style shop exterior: cream painted walls, a teal roof & trim, a
// red/cream striped awning, and two big display windows (with little white
// mannequin forms + colourful boxes behind the glass) flanking a glass door.
// Palette matches the interior so inside reads as the same building.
function makeShopExterior(b) {
  const { x, z, w, h, d } = b;
  const g = new THREE.Group();
  const wallMat = new THREE.MeshToonMaterial({ color: 0xf6e7cc, map: plaster() });
  const trimMat = toonMat(0x2f9c93);  // teal
  const cream = toonMat(0xfff1dd);
  const glassMat = new THREE.MeshToonMaterial({ color: 0xbfe0ea, emissive: 0x3a6e7a, emissiveIntensity: 0.4 });

  const body = mesh(new THREE.BoxGeometry(w, h, d), wallMat, 0, h / 2, 0); body.receiveShadow = true; g.add(body);
  g.add(mesh(new THREE.BoxGeometry(w + 0.3, 0.6, d + 0.3), trimMat, 0, 0.3, 0, false));   // base trim
  g.add(mesh(new THREE.BoxGeometry(w + 0.4, 0.5, d + 0.4), cream, 0, h - 0.25, 0, false)); // cornice
  const roof = gableRoof(w, d, 0x2f9c93); roof.position.y = h; g.add(roof);

  // side & back windows so the building reads as glassy all around
  for (const s of [-1, 1]) addWindow(g, s * w * 0.3, h * 0.55, d / 2 + 0.04); // (extra small windows up high, flank the awning)

  // ---- storefront display windows flanking the door ----
  const fz = d / 2 + 0.06;
  function displayWindow(cx, ww = 4.6, wh = 4.2) {
    const grp = new THREE.Group();
    grp.add(mesh(new THREE.BoxGeometry(ww + 0.5, wh + 0.6, 0.3), cream, 0, 0, 0, false));   // frame
    grp.add(mesh(new THREE.BoxGeometry(ww, wh, 0.16), glassMat, 0, 0, 0.1, false));         // glass
    grp.add(mesh(new THREE.BoxGeometry(0.14, wh, 0.22), cream, 0, 0, 0.15, false));         // muntins
    grp.add(mesh(new THREE.BoxGeometry(ww, 0.14, 0.22), cream, 0, 0, 0.15, false));
    // display behind the glass: a white mannequin form + colourful boxes
    grp.add(mesh(new THREE.BoxGeometry(0.9, 1.9, 0.5), toonMat(0xf3efe6), -ww * 0.24, -wh * 0.08, -0.25, false));
    grp.add(mesh(new THREE.SphereGeometry(0.5, 12, 10), toonMat(0xf3efe6), -ww * 0.24, wh * 0.34, -0.25, false));
    for (const [bx, by, c] of [[ww * 0.2, -wh * 0.3, 0xd95b4a], [ww * 0.3, -wh * 0.16, 0x3a6ea8], [ww * 0.12, -wh * 0.02, 0xffd166]])
      grp.add(mesh(new THREE.BoxGeometry(0.8, 0.8, 0.45), toonMat(c), bx, by, -0.25, false));
    grp.add(mesh(new THREE.BoxGeometry(ww + 0.7, 0.3, 0.7), toonMat(0xb98a5e), 0, -wh / 2 - 0.35, 0.22, false)); // sill
    grp.position.set(cx, h * 0.5, fz); g.add(grp);
  }
  displayWindow(-w * 0.28); displayWindow(w * 0.28);

  // ---- striped awning across the storefront ----
  const awn = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.16, 2.4),
    new THREE.MeshToonMaterial({ map: awningTexture(), color: 0xffffff }));
  awn.rotation.x = 0.44; awn.position.set(0, h * 0.8, d / 2 + 1.15); awn.castShadow = true; g.add(awn);
  for (let i = 0; i < 11; i++) { // scalloped valance hanging off the awning's front edge
    const tri = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.6, 3),
      toonMat(i % 2 ? 0xd95b4a : 0xfff1dd, { noCache: true }));
    tri.rotation.x = Math.PI; tri.position.set(-w / 2 + (i + 0.5) * (w / 11), h * 0.8 - 0.55, d / 2 + 2.05); g.add(tri);
  }

  // ---- central glass door ----
  const doorG = new THREE.Group();
  doorG.add(mesh(new THREE.BoxGeometry(3.0, 4.0, 0.16), cream, 0, 2.0, 0, false));
  doorG.add(mesh(new THREE.BoxGeometry(2.4, 3.5, 0.2), trimMat, 0, 1.85, 0.04, false));
  doorG.add(mesh(new THREE.BoxGeometry(1.8, 1.5, 0.22), glassMat, 0, 2.7, 0.06, false));
  doorG.add(mesh(new THREE.SphereGeometry(0.1, 8, 6), toonMat(0xf2c14e), 0.8, 1.7, 0.16, false));
  doorG.add(mesh(new THREE.BoxGeometry(3.4, 0.24, 1.4), toonMat(P.sandDark), 0, 0.12, 0.7, false));
  doorG.position.set(0, 0, d / 2 + 0.05); g.add(doorG);

  // ---- window planters ----
  for (const s of [-1, 1]) {
    g.add(mesh(new THREE.BoxGeometry(4.8, 0.5, 0.8, ), toonMat(0x8a5a36), s * w * 0.28, h * 0.26, d / 2 + 0.55, false));
    for (let i = 0; i < 3; i++) g.add(mesh(new THREE.SphereGeometry(0.28, 10, 8), toonMat([0xe85b6a, 0xffd166, 0x8e6bbf][i % 3], { noCache: true }), s * w * 0.28 - 1.4 + i * 1.4, h * 0.26 + 0.45, d / 2 + 0.55, false));
  }

  const sign = textSprite(b.label);
  sign.position.set(0, h + (roof.userData.rise || 3) + 1.2, 0);
  g.add(sign);

  g.position.set(x, 0, z);
  const doorWorld = new THREE.Vector3(x, 0, z + d / 2 + 1.6);
  const collider = { x, z, w: w + 0.6, d: d + 0.6 };
  return { group: g, doorWorld, collider };
}

// ----------------------------------------------------------- campus
export function buildCampus() {
  const root = new THREE.Group();
  const colliders = [];
  const interactables = [];
  const bounds = { minX: -95, maxX: 95, minZ: -68, maxZ: 68 };

  // sky dome + clouds
  const sky = new THREE.Mesh(new THREE.SphereGeometry(280, 24, 12),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false, depthWrite: false }));
  root.add(sky);
  const clouds = [];
  const cloudTex = cloudTexture();
  for (let i = 0; i < 9; i++) {
    const c = new THREE.Sprite(new THREE.SpriteMaterial({
      map: cloudTex, transparent: true, opacity: 0.85, depthWrite: false, fog: false,
    }));
    const s = 22 + (i % 4) * 9;
    c.scale.set(s, s * 0.45, 1);
    c.position.set(-140 + i * 34, 46 + (i % 3) * 10, -60 + (i * 53) % 120 - 30);
    root.add(c);
    clouds.push({ sprite: c, speed: 1 + (i % 3) * 0.6 });
  }

  // painted ground (grass + sandy paths in one texture)
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(220, 160),
    new THREE.MeshToonMaterial({ map: campusGroundTexture(), color: 0xffffff }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  root.add(ground);

  // fountain v2 (two tiers + splash)
  const fountain = new THREE.Group();
  fountain.add(mesh(new THREE.CylinderGeometry(4.1, 4.5, 1.1, 18), toonMat(0xc8c2b4), 0, 0.55, 0));
  fountain.add(mesh(new THREE.CylinderGeometry(3.7, 3.7, 0.25, 18),
    new THREE.MeshToonMaterial({ color: P.water, emissive: 0x1d5868 }), 0, 1.12, 0, false));
  fountain.add(mesh(new THREE.CylinderGeometry(0.55, 0.75, 1.5, 12), toonMat(0xb9b2a4), 0, 1.8, 0));
  fountain.add(mesh(new THREE.CylinderGeometry(1.5, 1.7, 0.5, 14), toonMat(0xc8c2b4), 0, 2.6, 0));
  fountain.add(mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.18, 14),
    new THREE.MeshToonMaterial({ color: P.water, emissive: 0x1d5868 }), 0, 2.78, 0, false));
  const splashes = [];
  const splashTex = glowTexture('200,240,255');
  for (let i = 0; i < 10; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: splashTex, transparent: true, depthWrite: false, opacity: 0.8,
    }));
    sp.scale.setScalar(0.5);
    fountain.add(sp);
    splashes.push({ sprite: sp, phase: i / 10 * Math.PI * 2 });
  }
  root.add(fountain);
  colliders.push({ x: 0, z: 0, w: 9, d: 9 });

  // ---- buildings (positions & footprints identical to v1) ----
  const buildings = [
    { id: 'library', x: -58, z: -36, w: 42, h: 18, d: 26, color: P.wallCream, roofColor: P.roofTeal,
      label: '📚 Library', prompt: '📚 Enter Library' },
    { id: 'dorm', x: 55, z: -32, w: 24, h: 13, d: 15, color: P.wallRose, roofColor: P.roofRed,
      wallStyle: 'brick', chimney: true, label: '🏠 Maple Dorm', prompt: '🏠 Enter Dorm' },
    { id: 'shop', x: -55, z: 28, w: 18, h: 8, d: 12, color: 0xf6e7cc, roofColor: 0x2f9c93,
      label: '🛍️ Campus Store', prompt: '🛍️ Shop' },
    { id: 'lecturehall', x: 0, z: -55, w: 36, h: 15, d: 22, color: P.wallSage, roofColor: P.roofNavy,
      wallStyle: 'brick', columns: true, label: '🏛️ Lecture Hall', prompt: '🏛️ Enter Lecture Hall' },
    { id: 'lecture', x: -20, z: 56, w: 26, h: 12, d: 13, color: P.wallSage, roofColor: P.roofGreen,
      wallStyle: 'brick', label: '🎮 Student Union', prompt: '🎮 Student Union' },
    { id: 'cafeteria', x: 24, z: 56, w: 20, h: 8, d: 12, color: P.wallPeach, roofColor: P.roofRed,
      chimney: true, label: '🍽️ Dining Hall', prompt: '🍽️ Enter Dining Hall' },
  ];

  const doors = {};
  for (const b of buildings) {
    const built = b.id === 'library' ? makeLibraryExterior(b)
      : b.id === 'shop' ? makeShopExterior(b)
      : makeBuilding(b);
    root.add(built.group);
    colliders.push(built.collider);
    doors[b.id] = built.doorWorld;
    if (b.prompt) {
      const e = built.enter || built.doorWorld;
      interactables.push({ id: b.id, x: e.x, z: e.z, r: built.enterR || b.enterR || 3.2, label: b.prompt });
    }
  }

  // ---- full basketball court (two hoops, centre line) ----
  const CX = 80, CZ = 26, CL = 36, CW = 22; // centre, length(x), width(z) — on the green at the east edge
  const court = new THREE.Mesh(new THREE.PlaneGeometry(CL, CW),
    new THREE.MeshToonMaterial({ map: courtTexture() }));
  court.rotation.x = -Math.PI / 2;
  court.position.set(CX, 0.04, CZ);
  court.receiveShadow = true;
  root.add(court);
  // painted lines: border, centre line, centre circle
  const line = (w, d, x, z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), toonMat(0xf2efe6)); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.05, z); root.add(m); };
  line(CL - 1, 0.18, CX, CZ - CW / 2 + 0.8); line(CL - 1, 0.18, CX, CZ + CW / 2 - 0.8); // sidelines
  line(0.18, CW - 1.4, CX - CL / 2 + 0.8, CZ); line(0.18, CW - 1.4, CX + CL / 2 - 0.8, CZ); // baselines
  line(0.2, CW - 1.4, CX, CZ); // centre line
  { const ring = new THREE.Mesh(new THREE.RingGeometry(1.9, 2.1, 28), toonMat(0xf2efe6)); ring.rotation.x = -Math.PI / 2; ring.position.set(CX, 0.05, CZ); root.add(ring); }

  // hoop builder — built facing +x (rim in front of the backboard); `dir`<0 flips
  // it to face -x. So both end hoops can face into the court.
  function makeHoop(x, z, dir) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.14, 0.16, 4.4, 8), toonMat(0x46505a), -0.5, 2.2, 0)); // pole (behind, -x)
    g.add(mesh(new THREE.BoxGeometry(0.12, 1.7, 2.6), toonMat(P.white), -0.2, 4.0, 0));            // backboard
    g.add(mesh(new THREE.BoxGeometry(0.14, 0.8, 1.0), toonMat(0xe07840), -0.13, 3.75, 0, false));  // target square
    const rim = mesh(new THREE.TorusGeometry(0.45, 0.05, 8, 16), toonMat(0xd64541), 0.3, 3.5, 0);  // rim (front, +x)
    rim.rotation.x = Math.PI / 2; g.add(rim);
    const net = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.26, 0.55, 8, 2, true),
      new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.7 }));
    net.position.set(0.3, 3.2, 0); g.add(net);
    g.position.set(x, 0, z); g.rotation.y = dir < 0 ? Math.PI : 0; root.add(g);
    colliders.push({ x, z, w: 1.2, d: 1.2 });
  }
  makeHoop(CX - CL / 2 + 1.4, CZ, 1);   // left hoop, rim faces +x (into court)
  makeHoop(CX + CL / 2 - 1.4, CZ, -1);  // right hoop, rim faces -x (into court)
  interactables.push({ id: 'basketball', x: CX, z: CZ, r: 4, label: '🏀 Play Basketball' });
  // shared with the basketball mini-game (rim world positions + play bounds)
  const courtInfo = {
    center: { x: CX, z: CZ }, rimY: 3.5,
    left: { x: CX - CL / 2 + 1.4 + 0.3, y: 3.5, z: CZ },
    right: { x: CX + CL / 2 - 1.4 - 0.3, y: 3.5, z: CZ },
    bounds: { minX: CX - CL / 2 + 1.2, maxX: CX + CL / 2 - 1.2, minZ: CZ - CW / 2 + 1, maxZ: CZ + CW / 2 - 1 },
  };

  // ---- nature & props (tree/lamp/bench coords unchanged from v1) ----
  const treeSpots = [
    [-80, -55], [-30, -18], [30, -18], [80, -55], [-80, 55], [80, 55],
    [-30, 18], [30, 18], [-85, 0], [85, 0], [-12, -25], [12, -25],
    [-70, -10], [70, -10], [-40, 60], [50, 12], [10, 30], [-15, 33],
  ];
  treeSpots.forEach(([tx, tz], i) => {
    root.add(makeTree(tx, tz, 0.85 + ((tx * 7 + tz * 13) % 10) / 16, i));
    colliders.push({ x: tx, z: tz, w: 1.2, d: 1.2 });
  });
  for (const [lx, lz] of [[-10, -8], [10, 8], [-28, 42], [28, -42], [60, 0], [-60, 0]]) {
    root.add(makeLamp(lx, lz));
    colliders.push({ x: lx, z: lz, w: 0.6, d: 0.6 });
  }
  root.add(makeBench(-8, 8, Math.PI));
  root.add(makeBench(8, -8, 0));
  colliders.push({ x: -8, z: 8, w: 2.4, d: 1 }, { x: 8, z: -8, w: 2.4, d: 1 });

  const bushSpots = [[-24, -10], [24, 10], [-16, 26], [16, -28], [-44, 14], [44, -14], [-36, -36], [36, 36], [-64, 36], [70, -22]];
  bushSpots.forEach(([bx, bz], i) => root.add(makeBush(bx, bz, 0.8 + (i % 3) * 0.25)));
  const rockSpots = [[-38, 22], [40, -30], [-18, -34], [20, 36], [-74, 24], [96, -34]];
  rockSpots.forEach(([rx, rz], i) => {
    root.add(makeRock(rx, rz, 0.7 + (i % 3) * 0.3));
    colliders.push({ x: rx, z: rz, w: 1, d: 1 });
  });
  for (const [fx, fz, fr] of [[-30, 38, 0], [30, 38, 0], [-30, -38, 0], [30, -38, 0]]) {
    root.add(makeFence(fx, fz, 9, fr));
  }
  root.add(makeSignpost(7.5, 6.5, -0.5));
  colliders.push({ x: 7.5, z: 6.5, w: 0.6, d: 0.6 });
  root.add(makePicnicTable(-20, 8, 0.4));
  colliders.push({ x: -20, z: 8, w: 2.8, d: 2.6 });

  // ---- instanced grass tufts + flowers (kept off the paths) ----
  const isSand = (wx, wz) =>
    Math.abs(wz) < 4.5 || Math.abs(wx) < 4.5 ||
    Math.abs(wx - 55) < 4 || Math.abs(wx + 55) < 4 ||
    Math.abs(wz - 42) < 4 || Math.abs(wz + 42) < 4 ||
    Math.hypot(wx, wz) < 10;
  const insideBuilding = (wx, wz) => buildings.some(b =>
    Math.abs(wx - b.x) < b.w / 2 + 2 && Math.abs(wz - b.z) < b.d / 2 + 2)
    || (Math.abs(wx - CX) < CL / 2 + 1.5 && Math.abs(wz - CZ) < CW / 2 + 1.5);

  let s = 12345;
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const spots = [];
  while (spots.length < 2700) {
    const wx = -105 + rand() * 210, wz = -75 + rand() * 150;
    if (!isSand(wx, wz) && !insideBuilding(wx, wz)) spots.push([wx, wz]);
  }

  // animated grass: instanced blade-tufts swayed by a GPU wind function (uTime),
  // so the lawn ripples instead of reading as flat green.
  const GRASS_N = 2400;
  const grassMat = toonMat(P.grass, { noCache: true });
  grassMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    grassMat.userData.shader = shader;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', [
        '#include <begin_vertex>',
        '#ifdef USE_INSTANCING',
        '  vec3 gWP = instanceMatrix[3].xyz;',
        '#else',
        '  vec3 gWP = vec3(0.0);',
        '#endif',
        'float blade = max(transformed.y + 0.45, 0.0);',          // 0 at base, ~0.9 at tip
        'float wv = uTime * 1.7 + gWP.x * 0.25 + gWP.z * 0.25;',   // per-tuft phase
        'transformed.x += (sin(wv) * 0.11 + sin(wv * 2.3) * 0.04) * blade;',
        'transformed.z += cos(wv * 0.9) * 0.07 * blade;',
      ].join('\n'));
  };
  const tuftGeo = new THREE.ConeGeometry(0.13, 0.9, 4);
  const tufts = new THREE.InstancedMesh(tuftGeo, grassMat, GRASS_N);
  const dummy = new THREE.Object3D();
  const tuftColor = new THREE.Color();
  for (let i = 0; i < GRASS_N; i++) {
    const [wx, wz] = spots[i];
    dummy.position.set(wx, 0.42, wz);
    dummy.rotation.set((rand() - 0.5) * 0.3, rand() * Math.PI, (rand() - 0.5) * 0.3);
    dummy.scale.setScalar(0.7 + rand() * 0.9);
    dummy.updateMatrix();
    tufts.setMatrixAt(i, dummy.matrix);
    tufts.setColorAt(i, tuftColor.setHex(rand() < 0.5 ? P.grass : P.grassLight).offsetHSL(0, (rand() - 0.5) * 0.05, (rand() - 0.5) * 0.12));
  }
  root.add(tufts);

  const flowerGeo = new THREE.IcosahedronGeometry(0.16, 0);
  const flowers = new THREE.InstancedMesh(flowerGeo,
    new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: null }), 300);
  const fc = new THREE.Color();
  for (let i = 0; i < 300; i++) {
    const [wx, wz] = spots[2400 + (i % 300)];
    dummy.position.set(wx + (rand() - 0.5), 0.18, wz + (rand() - 0.5));
    dummy.rotation.set(0, rand() * Math.PI, 0);
    dummy.scale.setScalar(0.8 + rand() * 0.5);
    dummy.updateMatrix();
    flowers.setMatrixAt(i, dummy.matrix);
    flowers.setColorAt(i, fc.setHex(P.flowerColors[i % P.flowerColors.length]));
  }
  root.add(flowers);

  // ---- drifting leaves ----
  const leaves = [];
  const lt = leafTexture();
  for (let i = 0; i < 26; i++) {
    const leaf = new THREE.Sprite(new THREE.SpriteMaterial({ map: lt, transparent: true, depthWrite: false }));
    leaf.scale.setScalar(0.35);
    root.add(leaf);
    leaves.push({ sprite: leaf, x: -90 + rand() * 180, z: -60 + rand() * 120, phase: rand() * Math.PI * 2, speed: 0.5 + rand() });
  }

  // per-frame ambient animation (clouds, splash, leaves)
  function animate(t, dt) {
    if (grassMat.userData.shader) grassMat.userData.shader.uniforms.uTime.value = t;
    for (const c of clouds) {
      c.sprite.position.x += c.speed * dt;
      if (c.sprite.position.x > 160) c.sprite.position.x = -160;
    }
    for (const sp of splashes) {
      const ph = (t * 1.4 + sp.phase) % (Math.PI * 2);
      const k = ph / (Math.PI * 2);
      sp.sprite.position.set(Math.cos(sp.phase) * (0.4 + k * 1.6), 3.4 + Math.sin(k * Math.PI) * 1.6 - k * 1.2, Math.sin(sp.phase) * (0.4 + k * 1.6));
      sp.sprite.material.opacity = 0.75 * (1 - k);
    }
    for (const l of leaves) {
      const ph = (t * l.speed + l.phase) % 8;
      l.sprite.position.set(l.x + Math.sin(ph * 1.5) * 2, Math.max(0.2, 7 - ph), l.z + ph * 0.8);
      l.sprite.material.rotation = ph * 2;
      l.sprite.material.opacity = ph > 7 ? (8 - ph) : 1;
    }
  }

  return { root, colliders, interactables, bounds, doors, animate, court: courtInfo };
}
