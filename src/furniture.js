// Shared furniture registry. Each entry builds a toon-shaded mesh group centred
// at the origin facing +z, with grid footprint (w,d), a display name and icon.
// Used by the bedroom editor (interiors.js) and the shop item previews.

import * as THREE from 'three';
import { toonMat, rugTexture } from './textures.js';

const tb = (w, h, d, c) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toonMat(c)); m.castShadow = true; m.receiveShadow = true; return m; };
const cyl = (rt, rb, h, n, c) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, n), toonMat(c)); m.castShadow = true; return m; };
const sph = (r, c) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), toonMat(c)); m.castShadow = true; return m; };
const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };
const emi = (c, e, i = 0.5) => new THREE.MeshToonMaterial({ color: c, emissive: e, emissiveIntensity: i });

export const FURNITURE = {
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
  mini_fridge: { name: 'Mini fridge', icon: '🧊', w: 1, d: 1, build() {
    const g = new THREE.Group();
    g.add(at(tb(0.95, 1.5, 0.9, 0xdfe7ee), 0, 0.75, 0));               // body
    g.add(at(tb(0.87, 0.9, 0.06, 0xeef3f8), 0, 0.52, 0.46));           // fridge door
    g.add(at(tb(0.87, 0.42, 0.06, 0xeef3f8), 0, 1.24, 0.46));          // freezer door
    g.add(at(tb(0.06, 0.7, 0.07, 0x9aa4ae), -0.34, 0.55, 0.5));        // handles
    g.add(at(tb(0.06, 0.26, 0.07, 0x9aa4ae), -0.34, 1.24, 0.5));
    g.add(at(tb(0.22, 0.22, 0.03, 0xe75480), 0.18, 0.72, 0.5));        // magnet
    g.add(at(tb(0.16, 0.2, 0.03, 0x6be0a0), -0.1, 1.24, 0.5));         // sticker
    return g;
  } },
  gaming_chair: { name: 'Gaming chair', icon: '🎮', w: 2, d: 2, build() {
    const g = new THREE.Group(); const c = 0x2b2b30, acc = 0xd64541;
    for (let i = 0; i < 5; i++) {                                       // star base
      const a = i / 5 * Math.PI * 2;
      const arm = tb(0.16, 0.1, 0.75, 0x44464c);
      arm.position.set(Math.sin(a) * 0.32, 0.08, Math.cos(a) * 0.32); arm.rotation.y = a; g.add(arm);
      g.add(at(sph(0.09, 0x14181d), Math.sin(a) * 0.62, 0.08, Math.cos(a) * 0.62)); // casters
    }
    g.add(at(cyl(0.07, 0.07, 0.5, 8, 0x44464c), 0, 0.35, 0));           // gas lift
    g.add(at(tb(1.1, 0.24, 1.1, c), 0, 0.7, 0.05));                     // seat
    g.add(at(tb(0.9, 0.14, 0.9, acc), 0, 0.82, 0.08));                  // seat pad
    const back = tb(1.0, 1.7, 0.22, c); back.position.set(0, 1.65, -0.52); back.rotation.x = -0.12; g.add(back);
    const pad = tb(0.66, 1.5, 0.1, acc); pad.position.set(0, 1.62, -0.4); pad.rotation.x = -0.12; g.add(pad);
    for (const s of [-1, 1]) {
      const wing = tb(0.18, 1.5, 0.3, c); wing.position.set(s * 0.52, 1.6, -0.46); wing.rotation.x = -0.12; g.add(wing);
      g.add(at(tb(0.14, 0.1, 0.6, 0x44464c), s * 0.6, 1.0, 0.0));       // armrests
      g.add(at(cyl(0.05, 0.05, 0.3, 8, 0x33353b), s * 0.6, 0.85, 0.0));
    }
    g.add(at(tb(0.5, 0.24, 0.14, c), 0, 2.35, -0.52));                  // headrest pillow
    return g;
  } },
  floor_mirror: { name: 'Floor mirror', icon: '🪞', w: 1, d: 1, build() {
    const g = new THREE.Group();
    const lean = new THREE.Group(); lean.rotation.x = 0.1; lean.position.z = -0.25; g.add(lean);
    lean.add(at(tb(1.0, 2.7, 0.1, 0xc99a3b), 0, 1.38, 0));                                          // gold frame
    lean.add(at(new THREE.Mesh(new THREE.PlaneGeometry(0.84, 2.5), emi(0xcfe2ea, 0xa8c8d8, 0.35)), 0, 1.38, 0.06)); // glass
    lean.add(at(new THREE.Mesh(new THREE.PlaneGeometry(0.2, 1.9), emi(0xeef7fb, 0xdcecf4, 0.5)), -0.22, 1.5, 0.07)); // shine streak
    for (const s of [-1, 1]) g.add(at(tb(0.12, 0.1, 0.5, 0xa87c2a), s * 0.4, 0.05, -0.1));           // feet
    return g;
  } },
  aquarium: { name: 'Aquarium', icon: '🐠', w: 2, d: 1, build() {
    const g = new THREE.Group();
    g.add(at(tb(2.0, 0.9, 0.9, 0x5b3c25), 0, 0.45, 0));                 // wooden stand
    g.add(at(tb(1.8, 0.1, 0.7, 0x746353), 0, 0.95, 0));                 // gravel
    g.add(at(cyl(0.05, 0.06, 0.5, 6, 0x3f7a55), -0.55, 1.15, -0.15));   // water plant
    g.add(at(sph(0.16, 0x4f8a45), -0.55, 1.45, -0.15));
    g.add(at(sph(0.12, 0x3f7a55), -0.45, 1.35, -0.05));
    for (const [fx, fy, fc, dir] of [[0.3, 1.35, 0xf2913b, 1], [-0.1, 1.55, 0x5f9fe0, -1], [0.55, 1.6, 0xe75480, 1]]) {
      const f = sph(0.1, fc); f.scale.set(1.3, 0.85, 0.6); g.add(at(f, fx, fy, 0.05));               // fish
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.14, 6), toonMat(fc));
      tail.rotation.z = dir * Math.PI / 2; g.add(at(tail, fx - dir * 0.16, fy, 0.05));
    }
    const water = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.85, 0.74),
      new THREE.MeshToonMaterial({ color: 0x63b7c9, transparent: true, opacity: 0.4 }));
    g.add(at(water, 0, 1.4, 0));
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.94, 1.05, 0.84),
      new THREE.MeshToonMaterial({ color: 0xcfe9f0, transparent: true, opacity: 0.18 }));
    g.add(at(glass, 0, 1.43, 0));
    g.add(at(tb(1.96, 0.08, 0.86, 0x33353b), 0, 1.98, 0));              // lid
    return g;
  } },
  string_lights: { name: 'String lights', icon: '✨', w: 4, d: 1, noCollide: true, build() {
    const g = new THREE.Group();
    const bulbCols = [0xffd166, 0xff8fb0, 0x6be0a0, 0x7ec8e3];
    for (const s of [-1, 1]) {                                          // wooden posts
      g.add(at(cyl(0.3, 0.36, 0.14, 10, 0x5b3c25), s * 1.8, 0.07, 0));
      g.add(at(cyl(0.05, 0.06, 3.0, 8, 0x8a5a36), s * 1.8, 1.6, 0));
      g.add(at(sph(0.08, 0x8a5a36), s * 1.8, 3.12, 0));
    }
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.8, 3.05, 0), new THREE.Vector3(-0.9, 2.62, 0.06),
      new THREE.Vector3(0, 2.48, 0), new THREE.Vector3(0.9, 2.62, -0.06),
      new THREE.Vector3(1.8, 3.05, 0),
    ]);
    const wire = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.02, 6, false), toonMat(0x33353b));
    g.add(wire);
    for (let i = 1; i < 10; i++) {                                      // glowing bulbs
      const p = curve.getPoint(i / 10);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8),
        emi(bulbCols[i % 4], bulbCols[i % 4], 0.85));
      g.add(at(bulb, p.x, p.y - 0.1, p.z));
    }
    return g;
  } },
  rug_round: { name: 'Round rug', icon: '🟣', w: 3, d: 3, noCollide: true, build() {
    const g = new THREE.Group();
    const r = new THREE.Mesh(new THREE.CircleGeometry(1.5, 28), toonMat(0xd98fb0, { map: rugTexture('#d98fb0', '#a75f85') }));
    r.rotation.x = -Math.PI / 2; r.position.y = 0.02; r.receiveShadow = true; g.add(r);
    return g;
  } },
};
