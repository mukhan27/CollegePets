// Toon-shaded 3D models for each food in FOOD_CATALOG, built centred at the
// origin (~0.4 units). Used for inventory/menu thumbnails (via itemPreview) and
// placed on the plate in the first-person dining view.

import * as THREE from 'three';
import { toonMat } from './textures.js';

const tb = (w, h, d, c) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toonMat(c)); m.castShadow = true; return m; };
const cyl = (rt, rb, h, n, c, open = false) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, n, 1, open), toonMat(c)); m.castShadow = true; return m; };
const sph = (r, c) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 12), toonMat(c)); m.castShadow = true; return m; };
const torus = (r, t, c) => { const m = new THREE.Mesh(new THREE.TorusGeometry(r, t, 10, 22), toonMat(c)); m.castShadow = true; return m; };
const cone = (r, h, c) => { const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 16), toonMat(c)); m.castShadow = true; return m; };
const put = (g, m, x, y, z, rx = 0, ry = 0, rz = 0) => { m.position.set(x, y, z); m.rotation.set(rx, ry, rz); g.add(m); return m; };

export const FOOD_MODELS = {
  pizza: { build() {
    const g = new THREE.Group();
    const cheese = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 26, 1, false, 0, Math.PI / 3.4), toonMat(0xf2c860));
    cheese.castShadow = true; put(g, cheese, 0, 0, 0, 0, -Math.PI / 7, 0);
    const crust = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 8, 10, 0, Math.PI / 3.4), toonMat(0xd8a24a));
    put(g, crust, 0, 0, 0, Math.PI / 2, 0, -Math.PI / 7);
    for (const [px, pz] of [[0.2, 0.05], [0.27, -0.06], [0.13, -0.07]]) put(g, cyl(0.05, 0.05, 0.02, 10, 0xc0392b), px, 0.04, pz);
    return g;
  } },
  burger: { build() {
    const g = new THREE.Group();
    put(g, sph(0.24, 0xe8a85a), 0, 0.2, 0).scale.set(1, 0.62, 1);  // top bun
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; put(g, sph(0.035, 0xfff1dd), Math.cos(a) * 0.12, 0.3, Math.sin(a) * 0.12); } // sesame
    put(g, cyl(0.23, 0.23, 0.05, 18, 0x6fae3e), 0, 0.07, 0);       // lettuce
    put(g, cyl(0.21, 0.21, 0.07, 18, 0x8a4a2a), 0, 0.0, 0);        // patty
    put(g, cyl(0.2, 0.2, 0.04, 18, 0xd9402a), 0, 0.07, 0);         // tomato (peeking)
    put(g, cyl(0.23, 0.25, 0.09, 18, 0xd89a55), 0, -0.08, 0);      // bottom bun
    return g;
  } },
  salad: { build() {
    const g = new THREE.Group();
    put(g, cyl(0.3, 0.2, 0.2, 20, 0xfbf7ee), 0, 0, 0);
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; put(g, sph(0.09, i % 2 ? 0x6fae3e : 0x88c44a), Math.cos(a) * 0.14, 0.13, Math.sin(a) * 0.14); }
    put(g, sph(0.06, 0xd9402a), 0.08, 0.17, 0.05); put(g, sph(0.06, 0xd9402a), -0.07, 0.16, -0.06);
    return g;
  } },
  sushi: { build() {
    const g = new THREE.Group();
    for (const [x, fc] of [[-0.15, 0xe98a6a], [0.15, 0xe0a44a]]) {
      put(g, cyl(0.12, 0.12, 0.12, 16, 0xfbf7ee), x, 0.06, 0);
      put(g, tb(0.24, 0.05, 0.17, fc), x, 0.14, 0);
      put(g, tb(0.06, 0.13, 0.19, 0x223028), x, 0.07, 0);
    }
    return g;
  } },
  ramen: { build() {
    const g = new THREE.Group();
    put(g, cyl(0.32, 0.2, 0.22, 22, 0xd9402a), 0, 0, 0);
    put(g, cyl(0.28, 0.28, 0.04, 22, 0xe8c878), 0, 0.09, 0);
    put(g, torus(0.13, 0.04, 0xf0d878), 0, 0.12, 0, Math.PI / 2, 0, 0);
    put(g, sph(0.08, 0xfbf7ee), 0.11, 0.13, 0.05).scale.set(1, 0.7, 1);
    put(g, sph(0.04, 0xe8a030), 0.11, 0.16, 0.05);
    put(g, tb(0.04, 0.04, 0.34, 0xcaa06a), -0.05, 0.18, 0, 0.3, 0.2, 0); // chopsticks
    put(g, tb(0.04, 0.04, 0.34, 0xcaa06a), 0.0, 0.18, 0, 0.3, 0.25, 0);
    return g;
  } },
  coffee: { build() {
    const g = new THREE.Group();
    put(g, cyl(0.17, 0.13, 0.42, 18, 0x6a4630), 0, 0.21, 0);
    put(g, cyl(0.18, 0.18, 0.05, 18, 0xfbf7ee), 0, 0.43, 0);
    put(g, cyl(0.025, 0.025, 0.5, 8, 0xe85b6a), 0.05, 0.58, 0, 0.12, 0, 0);
    put(g, tb(0.22, 0.12, 0.005, 0xcaa06a), 0, 0.21, 0.135);  // a little label band
    return g;
  } },
  boba: { build() {
    const g = new THREE.Group();
    put(g, cyl(0.16, 0.13, 0.42, 18, 0xd8b48a), 0, 0.21, 0);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; put(g, sph(0.035, 0x2a1a12), Math.cos(a) * 0.07, 0.06, Math.sin(a) * 0.07); }
    put(g, cyl(0.17, 0.17, 0.05, 18, 0xeaf2f6), 0, 0.44, 0);
    put(g, cyl(0.035, 0.035, 0.56, 8, 0xff5fa2), 0.04, 0.58, 0, 0.1, 0, 0);
    return g;
  } },
  donut: { build() {
    const g = new THREE.Group();
    put(g, torus(0.18, 0.09, 0xe0a45a), 0, 0, 0, Math.PI / 2, 0, 0);
    put(g, torus(0.18, 0.075, 0xff8fb0), 0, 0.045, 0, Math.PI / 2, 0, 0);
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; put(g, tb(0.02, 0.02, 0.06, [0xffd166, 0x6be0a0, 0x7ec8e3][i % 3]), Math.cos(a) * 0.18, 0.09, Math.sin(a) * 0.18, 0, a, 0); }
    return g;
  } },
  taco: { build() {
    const g = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.36, 22, 1, true, Math.PI * 0.06, Math.PI * 0.88), toonMat(0xe8b85a));
    shell.castShadow = true; put(g, shell, 0, 0.18, 0, Math.PI / 2, 0, 0);
    put(g, tb(0.34, 0.07, 0.12, 0x8a4a2a), 0, 0.18, 0);          // meat
    for (let i = 0; i < 4; i++) put(g, sph(0.04, 0x6fae3e), -0.12 + i * 0.08, 0.24, 0.02);
    put(g, sph(0.035, 0xd9402a), 0.06, 0.25, -0.02);
    return g;
  } },
  icecream: { build() {
    const g = new THREE.Group();
    put(g, cone(0.14, 0.42, 0xd8a860), 0, 0.0, 0, Math.PI, 0, 0);  // cone, tip down
    put(g, sph(0.15, 0xfbd0dc), 0, 0.3, 0);                         // strawberry scoop
    put(g, sph(0.13, 0xfff4e2), 0.0, 0.45, 0);                      // vanilla scoop
    put(g, sph(0.04, 0xd9402a), 0, 0.57, 0);                        // cherry
    return g;
  } },
};
