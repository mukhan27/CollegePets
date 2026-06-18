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
};
