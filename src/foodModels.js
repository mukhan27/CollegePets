// Toon-shaded 3D models for each food in FOOD_CATALOG, built centred at the
// origin (~0.4 units). Used for inventory/menu thumbnails (via itemPreview) and
// placed on the plate in the first-person dining view. Styled after low-poly
// stylized food packs: bold shapes, readable toppings, warm saturated colours.

import * as THREE from 'three';
import { toonMat } from './textures.js';

const tb = (w, h, d, c) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toonMat(c)); m.castShadow = true; return m; };
const cyl = (rt, rb, h, n, c, open = false) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, n, 1, open), toonMat(c)); m.castShadow = true; return m; };
const sph = (r, c) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 13), toonMat(c)); m.castShadow = true; return m; };
const torus = (r, t, c) => { const m = new THREE.Mesh(new THREE.TorusGeometry(r, t, 12, 24), toonMat(c)); m.castShadow = true; return m; };
const cone = (r, h, c) => { const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 16), toonMat(c)); m.castShadow = true; return m; };
const put = (g, m, x, y, z, rx = 0, ry = 0, rz = 0) => { m.position.set(x, y, z); m.rotation.set(rx, ry, rz); g.add(m); return m; };
// tiny deterministic RNG so scattered toppings stay put between renders
const rng = (seed) => () => (seed = (seed * 9301 + 49297) % 233280) / 233280;

export const FOOD_MODELS = {
  pizza: { build() {
    const g = new THREE.Group();
    // triangular slice (extruded so it has real thickness, then laid flat)
    const shape = new THREE.Shape();
    shape.moveTo(0, -0.36); shape.lineTo(-0.27, 0.34); shape.lineTo(0.27, 0.34); shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    const slice = new THREE.Mesh(geo, toonMat(0xf4c543)); slice.castShadow = true; g.add(slice); // melted cheese
    // browned crust along the wide back edge
    put(g, cyl(0.07, 0.07, 0.56, 14, 0xd58a36), 0, 0.04, -0.34, 0, 0, Math.PI / 2);
    // pepperoni discs
    for (const [px, pz] of [[0, -0.18], [-0.14, -0.24], [0.14, -0.24], [0, 0.0], [-0.08, -0.06], [0.09, -0.07]])
      put(g, cyl(0.055, 0.055, 0.022, 16, 0xc0392b), px, 0.075, pz);
    // a few basil flecks for colour
    for (const [px, pz] of [[0.04, -0.13], [-0.1, -0.02]]) put(g, sph(0.025, 0x4f8a45), px, 0.08, pz);
    return g;
  } },
  burger: { build() {
    const g = new THREE.Group();
    put(g, cyl(0.24, 0.2, 0.09, 22, 0xdca35a), 0, -0.12, 0);            // bottom bun
    put(g, cyl(0.25, 0.25, 0.085, 22, 0x6e3b22), 0, -0.04, 0);          // beef patty
    put(g, tb(0.42, 0.025, 0.42, 0xffc62e), 0, 0.005, 0, 0, Math.PI / 4, 0); // cheese slice, corners drooping
    put(g, cyl(0.24, 0.24, 0.04, 22, 0xe03828), 0, 0.05, 0);            // tomato
    put(g, cyl(0.27, 0.27, 0.05, 24, 0x7cc043), 0, 0.09, 0);            // ruffled lettuce
    put(g, sph(0.25, 0xe8a657), 0, 0.17, 0).scale.set(1, 0.62, 1);      // domed top bun
    for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; put(g, sph(0.022, 0xfff1dd), Math.cos(a) * 0.13, 0.26, Math.sin(a) * 0.13); } // sesame
    return g;
  } },
  salad: { build() {
    const g = new THREE.Group();
    put(g, cyl(0.32, 0.2, 0.2, 22, 0xfbf7ee), 0, 0, 0);                 // bowl
    put(g, cyl(0.3, 0.3, 0.04, 22, 0x4f8a45), 0, 0.09, 0);             // base of greens
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; put(g, sph(0.085, i % 2 ? 0x6fae3e : 0x8bc34a), Math.cos(a) * 0.15, 0.14, Math.sin(a) * 0.15); }
    put(g, sph(0.06, 0xe03828), 0.09, 0.18, 0.05); put(g, sph(0.055, 0xe03828), -0.08, 0.17, -0.06); // cherry tomatoes
    for (const [cx, cz] of [[0.02, -0.12], [-0.12, 0.06]]) put(g, cyl(0.05, 0.05, 0.03, 14, 0xd7eec0), cx, 0.19, cz); // cucumber slices
    put(g, tb(0.06, 0.05, 0.06, 0xe0b257), 0.13, 0.18, -0.02);         // crouton
    return g;
  } },
  sushi: { build() {
    const g = new THREE.Group();
    for (const [x, fc] of [[-0.16, 0xe98a6a], [0.16, 0xe0a44a]]) {
      put(g, cyl(0.12, 0.12, 0.13, 18, 0xfbf7ee), x, 0.065, 0);        // rice
      put(g, tb(0.25, 0.06, 0.18, fc), x, 0.15, 0);                    // fish slab
      put(g, tb(0.07, 0.15, 0.2, 0x223028), x, 0.075, 0);             // nori band
    }
    for (const [rx, rz] of [[-0.16, 0.0], [-0.13, 0.04]]) put(g, sph(0.02, 0xf08a2a), rx, 0.19, rz); // roe
    return g;
  } },
  ramen: { build() {
    const g = new THREE.Group();
    put(g, cyl(0.32, 0.2, 0.22, 24, 0xd9402a), 0, 0, 0);               // bowl
    put(g, cyl(0.3, 0.3, 0.03, 24, 0xfff1dd), 0, 0.1, 0);             // rim
    put(g, cyl(0.28, 0.28, 0.04, 24, 0xe8c878), 0, 0.085, 0);         // broth
    put(g, torus(0.13, 0.04, 0xf0d878), 0, 0.12, 0, Math.PI / 2, 0, 0); // noodles
    put(g, sph(0.08, 0xfbf7ee), 0.11, 0.13, 0.05).scale.set(1, 0.6, 1); // egg white
    put(g, sph(0.04, 0xe8a030), 0.11, 0.16, 0.05);                    // yolk
    put(g, cyl(0.07, 0.07, 0.02, 14, 0xe98a6a), -0.1, 0.12, 0.06);    // narutomaki
    for (const [sx, sr] of [[-0.05, 0.3], [0.0, 0.25]]) put(g, tb(0.04, 0.04, 0.34, 0xcaa06a), sx, 0.18, 0, sr, 0.22, 0); // chopsticks
    return g;
  } },
  coffee: { build() {
    const g = new THREE.Group();
    put(g, cyl(0.17, 0.13, 0.42, 20, 0x6a4630), 0, 0.21, 0);          // cup
    put(g, tb(0.22, 0.13, 0.005, 0xcaa06a), 0, 0.21, 0.135);          // sleeve band
    put(g, cyl(0.18, 0.18, 0.06, 20, 0xfbf7ee), 0, 0.44, 0);          // lid
    put(g, cyl(0.04, 0.04, 0.05, 12, 0xfbf7ee), 0, 0.49, 0);          // lid nub
    put(g, cyl(0.024, 0.024, 0.46, 8, 0xe85b6a), 0.05, 0.6, 0, 0.12, 0, 0); // straw
    return g;
  } },
  boba: { build() {
    const g = new THREE.Group();
    put(g, cyl(0.16, 0.13, 0.42, 20, 0xd8b48a), 0, 0.21, 0);          // milk tea
    for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; put(g, sph(0.035, 0x2a1a12), Math.cos(a) * 0.07, 0.05 + (i % 2) * 0.03, Math.sin(a) * 0.07); } // pearls
    put(g, cyl(0.17, 0.17, 0.05, 20, 0xeaf2f6), 0, 0.44, 0);          // domed lid
    put(g, cyl(0.035, 0.035, 0.56, 8, 0xff5fa2), 0.04, 0.58, 0, 0.1, 0, 0); // fat straw
    return g;
  } },
  donut: { build() {
    const g = new THREE.Group();
    put(g, torus(0.18, 0.092, 0xe0a45a), 0, 0, 0, Math.PI / 2, 0, 0); // dough
    put(g, torus(0.182, 0.082, 0xff7aa8), 0, 0.05, 0, Math.PI / 2, 0, 0); // pink glaze, drooping over the top
    // scattered sprinkles across the glaze
    const cols = [0xffffff, 0xffd166, 0x6be0a0, 0x5fd0ff, 0xff5fa2, 0x9b6dff];
    const r = rng(7);
    for (let i = 0; i < 24; i++) {
      const a = r() * Math.PI * 2, rad = 0.1 + r() * 0.16;
      put(g, tb(0.018, 0.014, 0.062, cols[i % cols.length]), Math.cos(a) * rad, 0.125, Math.sin(a) * rad, 0, r() * Math.PI, 0);
    }
    return g;
  } },
  taco: { build() {
    const g = new THREE.Group();
    // folded shell: a U-shaped cross-section (curved band) extruded into a length
    const sh = new THREE.Shape();
    const R = 0.27, ri = 0.22;
    sh.absarc(0, 0, R, Math.PI * 1.1, Math.PI * 1.9, false);
    sh.absarc(0, 0, ri, Math.PI * 1.9, Math.PI * 1.1, true);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.44, bevelEnabled: false, curveSegments: 18 });
    geo.translate(0, 0, -0.22); geo.rotateY(Math.PI / 2);
    const shell = new THREE.Mesh(geo, toonMat(0xe7b15a)); shell.castShadow = true;
    put(g, shell, 0, 0.27, 0);                                         // rests with bottom at y≈0
    put(g, tb(0.38, 0.11, 0.17, 0x7a3f23), 0, 0.16, 0);               // seasoned meat
    const r = rng(11);
    for (let i = 0; i < 6; i++) put(g, tb(0.06, 0.03, 0.1, 0x6fc63f), -0.17 + i * 0.07, 0.27, (r() - 0.5) * 0.12, 0, r() * Math.PI, 0); // lettuce shreds
    for (let i = 0; i < 5; i++) put(g, tb(0.07, 0.02, 0.022, 0xffd23d), -0.14 + i * 0.07, 0.25, (r() - 0.5) * 0.1); // shredded cheese
    put(g, sph(0.045, 0xe03828), 0.06, 0.28, 0.02); put(g, sph(0.04, 0xe03828), -0.09, 0.28, -0.03); // tomato/salsa
    return g;
  } },
  icecream: { build() {
    const g = new THREE.Group();
    put(g, cone(0.14, 0.42, 0xd8a860), 0, 0.0, 0, Math.PI, 0, 0);     // waffle cone, tip down
    put(g, sph(0.15, 0xfbd0dc), 0, 0.3, 0);                           // strawberry scoop
    put(g, sph(0.13, 0xfff4e2), 0.0, 0.45, 0);                        // vanilla scoop
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; put(g, tb(0.015, 0.012, 0.045, [0xff5fa2, 0x6be0a0, 0x5fd0ff][i % 3]), Math.cos(a) * 0.08, 0.52, Math.sin(a) * 0.08, 0, a, 0.3); } // sprinkles
    put(g, sph(0.04, 0xd9402a), 0, 0.58, 0);                          // cherry
    put(g, cyl(0.008, 0.008, 0.08, 6, 0x4f7a35), 0, 0.63, 0);        // stem
    return g;
  } },
};
