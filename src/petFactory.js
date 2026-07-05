// Pet builder — every character in College Ducks is a duck. createPet returns a
// Group with userData { head, animate(t, moving) }; setWearables re-dresses a pet.
// The player's authored GLB duck is preferred; a procedural toon duck is the
// fallback when the GLB fails to load. Appearance {bodyColor, shirtColor,
// muzzleColor, eyeColor} recolours both, so NPCs are just recolored instances.

import * as THREE from 'three';
import { toonMat, toonGradient } from './textures.js';
import { isDuckReady, buildGlbDuck, duckShellGeo, legShellGeo, duckRadiusAt } from './glbDuck.js';

function ball(r, color, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), toonMat(color));
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  return m;
}
function capsule(r, len, color) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 12), toonMat(color));
  m.castShadow = true;
  return m;
}
function box(w, h, d, color) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toonMat(color));
  m.castShadow = true;
  return m;
}

// soft dark outline via inverted hull (cheap, mobile-friendly)
const outlineMat = new THREE.MeshBasicMaterial({ color: 0x4a3a30, side: THREE.BackSide });
function addOutline(target, scale = 1.05) {
  const o = new THREE.Mesh(target.geometry, outlineMat);
  o.scale.copy(target.scale).multiplyScalar(scale);
  o.position.copy(target.position);
  o.rotation.copy(target.rotation);
  target.parent.add(o);
}

// ===================================================================== the duck
// The one species: appearance is {bodyColor (feathers), shirtColor, muzzleColor
// (bill + feet), eyeColor} (+ size). The palettes below feed the character
// creator's swatch rows and drive both the GLB duck and the procedural fallback.

// eye / iris colours — vivid but believable: rich browns, amber/hazel, then a
// clear blue / green / grey / violet, plus a deep near-black for a classic look.
export const EYE_SWATCHES = [
  0x6b4324, 0x9c6a30, 0xc28a3a, 0x3f7bbf, 0x3f9e6a, 0x8a6a3e, 0x6f6086, 0x2a241e,
];
// shirt / pants colours — playful, saturated wardrobe palette (recoloured texture zones)
export const SHIRT_SWATCHES = [
  0xffd21e, 0xff7e1a, 0xee3b34, 0xf76fa0, 0x9b5de5, 0x4a86e8, 0x1fc4b0, 0x55b76a, 0x3a3f4a, 0xf4f2ec,
];
// Duck feather colours — believable plumage first (duckling yellow, white, cream,
// golden, tan, mallard brown, charcoal) then a few playful pastels. Ordered so the
// natural tones lead.
export const DUCK_BODY_SWATCHES = [
  0xffd23e, 0xf7e7a8, 0xf7f1e6, 0xf0c060, 0xe3a857, 0xc98a4b, 0x8a5a32, 0x3c4047,
  0xef8d6a, 0x7ec98a, 0x5f9fe0, 0xc98fd0,
];
// Beak & feet colours — warm bill tones: classic orange, amber, yellow-orange,
// deep orange, coral, tan, brown, and a slate for a darker bill. Ordered light→dark.
export const BEAK_SWATCHES = [
  0xff9e2c, 0xf2a93b, 0xffc04d, 0xe07b2e, 0xd6584f, 0xb07b46, 0x8a5a32, 0x4a4f57,
];
export function defaultCreature() {
  // the canon duck: duckling-yellow feathers, orange bill & feet, dark eyes,
  // green shirt. (Extra legacy fields are kept so old saves round-trip cleanly.)
  return {
    build: 'round', size: 'medium',
    bodyColor: 0xffd23e, bellyColor: 0xfff3cf, accentColor: 0xffb3a3,   // duckling yellow
    muzzleColor: 0xff9e2c,                                              // orange bill / feet
    pattern: 'none', patternColor: 0xcfcfcf, fur: 'velvety',
    ears: 'floppy', tail: 'none',
    eyeColor: 0x232020, eyeStyle: 'round', blush: false,               // dark duck eyes
    shirtColor: 0x5a9e44, pantsColor: 0xff7e1a,   // duck torso "sweater" (green) / legacy
  };
}

// Randomize only the fields the duck actually renders (and the creator exposes);
// everything else stays at the canon defaults.
export function randomCreature() {
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  return {
    ...defaultCreature(),
    bodyColor: pick(DUCK_BODY_SWATCHES),
    muzzleColor: pick(BEAK_SWATCHES),
    eyeColor: pick(EYE_SWATCHES),
    shirtColor: pick(SHIRT_SWATCHES),
  };
}

// ---- wearables (fitted to v2 head radius ~0.52, attach to head group) ----
const WEARABLES = {
  cap_red:  (h) => capMesh(h, 0xd64541),
  cap_blue: (h) => capMesh(h, 0x3a6ea8),
  beanie(head) {
    const g = new THREE.Group();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.48, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), toonMat(0x8e6bbf));
    dome.castShadow = true;
    g.add(dome);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.06, 8, 18), toonMat(0x7657a6));
    band.rotation.x = Math.PI / 2;
    g.add(band);
    const pom = ball(0.13, 0xf0e8f8);
    pom.position.y = 0.5;
    g.add(pom);
    g.position.y = 0.18;
    head.add(g);
    return g;
  },
  gradcap(head) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.4, 0.2, 10), toonMat(0x2a2a3c));
    base.castShadow = true;
    g.add(base);
    const board = box(0.95, 0.07, 0.95, 0x2a2a3c);
    board.position.y = 0.14;
    g.add(board);
    const button = ball(0.05, 0xf2c14e);
    button.position.y = 0.2;
    g.add(button);
    const tassel = box(0.06, 0.34, 0.06, 0xf2c14e);
    tassel.position.set(0.42, -0.02, 0.42);
    g.add(tassel);
    g.position.y = 0.42;
    head.add(g);
    return g;
  },
  // Hair bow: two teardrop lobes pinched into a centre knot, SEATED on the crown —
  // the group is positioned on the reference head surface and tilted so its base
  // plane matches the local crown slope (no floating).
  bow(head) {
    const g = new THREE.Group();
    const c = 0xe75480, dark = 0xc23b66;
    for (const s of [-1, 1]) {
      const lobe = new THREE.Mesh(new THREE.ConeGeometry(0.105, 0.26, 12), toonMat(c));
      lobe.scale.y = 0.9; lobe.scale.z = 0.5;                  // flatten into a ribbon loop
      lobe.rotation.z = s * (Math.PI / 2 + 0.35);              // tip points into the knot, outer end lifted
      lobe.position.set(s * 0.125, 0.055, 0);
      lobe.castShadow = true; g.add(lobe);
    }
    const knot = ball(0.062, dark, 0.9, 0.85, 0.8); knot.position.y = 0.045; g.add(knot);
    for (const s of [-1, 1]) {                                  // little ribbon tails
      const tail = box(0.07, 0.14, 0.02, c);
      tail.position.set(s * 0.05, -0.055, -0.01); tail.rotation.z = s * 0.35; g.add(tail);
    }
    // seat: put the bow's base on the head surface at an upper-side point, base plane
    // tangent to the sphere there (local +y = surface normal)
    const n = new THREE.Vector3(0.44, 0.82, 0.28).normalize();
    g.position.copy(n).multiplyScalar(0.50);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    head.add(g);
    return g;
  },
  glasses(head) {
    const g = new THREE.Group();
    const lensMat = new THREE.MeshToonMaterial({ color: 0x66ccee, transparent: true, opacity: 0.5 });
    for (const s of [-1, 1]) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.025, 8, 14), toonMat(0x2a2420));
      rim.position.set(s * 0.2, 0.1, 0.47);
      g.add(rim);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.13, 14), lensMat);
      lens.position.set(s * 0.2, 0.1, 0.47);
      g.add(lens);
    }
    const bridge = box(0.14, 0.03, 0.03, 0x2a2420);
    bridge.position.set(0, 0.1, 0.48);
    g.add(bridge);
    head.add(g);
    return g;
  },
  scarf(head) {
    const g = new THREE.Group();
    const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.11, 8, 18), toonMat(0xc0392b));
    wrap.rotation.x = Math.PI / 2;
    g.add(wrap);
    const tail1 = box(0.17, 0.4, 0.08, 0xc0392b);
    tail1.position.set(0.14, -0.26, 0.34);
    g.add(tail1);
    const fringe = box(0.17, 0.07, 0.09, 0xe8e0d0);
    fringe.position.set(0.14, -0.48, 0.34);
    g.add(fringe);
    g.position.y = -0.42;
    head.add(g);
    return g;
  },
  crown(head) {
    const g = new THREE.Group();
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.42, 0.18, 14), toonMat(0xf2c14e));
    band.castShadow = true; g.add(band);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.24, 6), toonMat(0xf2c14e));
      spike.position.set(Math.cos(a) * 0.38, 0.18, Math.sin(a) * 0.38); g.add(spike);
      const gem = ball(0.05, 0xe0556b); gem.position.set(Math.cos(a) * 0.38, 0.28, Math.sin(a) * 0.38); g.add(gem);
    }
    g.position.y = 0.52; head.add(g); return g;
  },
  party_hat(head) {
    const g = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.82, 16), toonMat(0xff5fa2));
    cone.castShadow = true; g.add(cone);
    for (const [y, c] of [[0.05, 0xffd166], [-0.18, 0x6be0a0]]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.03, 6, 16), toonMat(c)); ring.rotation.x = Math.PI / 2; ring.position.y = y; g.add(ring); }
    const pom = ball(0.1, 0xfff0a0); pom.position.y = 0.46; g.add(pom);
    g.position.y = 0.56; head.add(g); return g;
  },
  headphones(head) {
    const g = new THREE.Group();
    // NOTE: TorusGeometry's 5th arg is the arc itself (there is no thetaStart) — an
    // extra leading 0 made arc=0, so the band never rendered at all.
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 8, 20, Math.PI), toonMat(0x2a2d34));
    band.scale.set(1.05, 1.15, 1);   // tall arc: clears the duck's egg-shaped crown instead of sinking in
    band.castShadow = true; g.add(band);
    for (const s of [-1, 1]) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.13, 14), toonMat(0x33353b));
      cup.rotation.z = Math.PI / 2; cup.position.set(s * 0.5, 0.02, 0); g.add(cup);
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.16, 12), toonMat(0xff5fa2));
      pad.rotation.z = Math.PI / 2; pad.position.set(s * 0.45, 0.02, 0); g.add(pad);   // pads face the head
    }
    g.position.y = 0.16; head.add(g); return g;
  },
  sunglasses(head) {
    const g = new THREE.Group();
    const lensMat = toonMat(0x14181d);
    for (const s of [-1, 1]) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.03, 8, 14), toonMat(0x2a2420));
      rim.position.set(s * 0.2, 0.1, 0.47); g.add(rim);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.14, 14), lensMat);
      lens.position.set(s * 0.2, 0.1, 0.475); g.add(lens);
    }
    const bridge = box(0.14, 0.03, 0.03, 0x2a2420); bridge.position.set(0, 0.12, 0.48); g.add(bridge);
    head.add(g); return g;
  },
  flower(head) {
    const g = new THREE.Group();
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; const petal = ball(0.08, 0xff8fb0, 1, 1, 0.6); petal.position.set(Math.cos(a) * 0.1, Math.sin(a) * 0.1, 0); g.add(petal); }
    const center = ball(0.06, 0xffd166); center.position.z = 0.02; g.add(center);
    // seat flat against the head surface (petals face outward along the local normal)
    const n = new THREE.Vector3(0.44, 0.80, 0.32).normalize();
    g.position.copy(n).multiplyScalar(0.50);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    head.add(g); return g;
  },
  bucket_hat(head) {
    const g = new THREE.Group();
    const c = 0xc9b48a, dark = 0xa89163;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.40, 0.46, 0.30, 16), toonMat(c));
    crown.castShadow = true; crown.position.y = 0.18; g.add(crown);
    const top = ball(0.40, c, 1, 0.3, 1); top.position.y = 0.33; g.add(top);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.63, 0.1, 18), toonMat(c));
    brim.castShadow = true; brim.position.y = 0.02; g.add(brim);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.465, 0.475, 0.08, 16), toonMat(dark));
    band.position.y = 0.1; g.add(band);
    g.position.y = 0.28; head.add(g); return g;
  },
  // A real cowboy-hat silhouette, built from lathe profiles instead of squashed spheres:
  // a flat oval brim whose SIDES roll up (classic taco curl), a tall pinched crown with a
  // centre crease running front-to-back, and a thin dark hat band at the crown base.
  cowboy_hat(head) {
    const g = new THREE.Group();
    const c = 0x9a6a3f, bandC = 0x50331d;
    const mat = toonMat(c, { noCache: true, side: THREE.DoubleSide });
    // brim: open lathe profile (bottom run out, rounded edge, top run back in) —
    // kept tight so the tall crown, not the brim, dominates the silhouette
    const prof = [
      [0.26, 0.000], [0.40, -0.012], [0.50, 0.000], [0.555, 0.020], [0.57, 0.048],
      [0.555, 0.070], [0.50, 0.054], [0.40, 0.040], [0.26, 0.050],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const brimGeo = new THREE.LatheGeometry(prof, 28);
    { // curl the sides (±x) up hard (classic taco roll), droop the front lip a touch
      const p = brimGeo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z) || 1;
        const f = Math.max(0, (r - 0.28) / 0.29);
        p.setY(i, p.getY(i) + f * f * (0.34 * (x / r) * (x / r) - 0.045 * (Math.max(0, z / r) ** 2)));
      }
      brimGeo.scale(1, 1, 1.06);
      brimGeo.computeVertexNormals();
    }
    const brim = new THREE.Mesh(brimGeo, mat); brim.castShadow = true; g.add(brim);
    // crown: TALL pinched dome (height ≈ brim radius) with a front-back crease dented in
    const cprof = [
      [0.305, 0.015], [0.33, 0.17], [0.325, 0.32], [0.295, 0.44], [0.245, 0.54], [0.155, 0.615], [0.0, 0.64],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const crGeo = new THREE.LatheGeometry(cprof, 22);
    {
      const p = crGeo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i);
        if (y > 0.36) p.setY(i, y - ((y - 0.36) / 0.28) * 0.13 * Math.exp(-((x / 0.12) ** 2)));
      }
      crGeo.scale(1, 1, 1.10);
      crGeo.computeVertexNormals();
    }
    const crown = new THREE.Mesh(crGeo, mat); crown.castShadow = true; g.add(crown);
    const hb = new THREE.Mesh(new THREE.CylinderGeometry(0.322, 0.34, 0.10, 22), toonMat(bandC));
    hb.scale.z = 1.10; hb.position.y = 0.085; g.add(hb);
    g.position.y = 0.40; head.add(g); return g;
  },
  wizard_hat(head) {
    const g = new THREE.Group();
    const c = 0x4a3d8f, trim = 0xf2c14e;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.7, 0.09, 18), toonMat(c));
    brim.castShadow = true; g.add(brim);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.0, 16), toonMat(c));
    cone.castShadow = true; cone.position.y = 0.52; g.add(cone);
    const tip = ball(0.08, trim); tip.position.y = 1.02; g.add(tip);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.43, 0.11, 16), toonMat(trim));
    band.position.y = 0.1; g.add(band);
    for (const [x, y, z] of [[0.16, 0.45, 0.2], [-0.12, 0.65, 0.13], [0.05, 0.85, 0.08]]) {  // gold star studs
      const star = ball(0.05, trim, 1, 1, 0.5);
      star.position.set(x, y, z); star.lookAt(x * 3, y, z * 3); g.add(star);
    }
    g.position.y = 0.33; head.add(g); return g;
  },
  round_glasses(head) {
    const g = new THREE.Group();
    const gold = 0xc9a227;
    const lensMat = new THREE.MeshToonMaterial({ color: 0xdfe9f2, transparent: true, opacity: 0.35 });
    for (const s of [-1, 1]) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.02, 8, 20), toonMat(gold));
      rim.position.set(s * 0.19, 0.1, 0.47); g.add(rim);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.12, 16), lensMat);
      lens.position.set(s * 0.19, 0.1, 0.47); g.add(lens);
    }
    const bridge = box(0.13, 0.024, 0.024, gold); bridge.position.set(0, 0.14, 0.48); g.add(bridge);
    head.add(g); return g;
  },
  star_shades(head) {
    const g = new THREE.Group();
    const rimC = 0xf2c14e, lensC = 0xd94fa3;
    for (const s of [-1, 1]) {
      const rim = new THREE.Mesh(new THREE.ExtrudeGeometry(starShape(0.2), { depth: 0.02, bevelEnabled: false }), toonMat(rimC));
      rim.position.set(s * 0.21, 0.1, 0.44); g.add(rim);
      const lens = new THREE.Mesh(new THREE.ExtrudeGeometry(starShape(0.15), { depth: 0.02, bevelEnabled: false }), toonMat(lensC));
      lens.position.set(s * 0.21, 0.1, 0.455); g.add(lens);
    }
    const bridge = box(0.12, 0.03, 0.03, rimC); bridge.position.set(0, 0.12, 0.47); g.add(bridge);
    head.add(g); return g;
  },
  bowtie(head) {
    const g = new THREE.Group();
    const c = 0xd6584f, dark = tintHex(0xd6584f, -0.25);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.04, 8, 20), toonMat(dark));
    band.rotation.x = Math.PI / 2; g.add(band);
    for (const s of [-1, 1]) {
      const wing = ball(0.1, c, 1.3, 0.75, 0.5);
      wing.position.set(s * 0.115, 0, 0.375); wing.rotation.y = s * 0.35; g.add(wing);
    }
    const knot = ball(0.055, dark, 0.85, 0.85, 0.7); knot.position.set(0, 0, 0.43); g.add(knot);
    g.position.y = -0.42; head.add(g); return g;
  },
  chain_gold(head) {
    const g = new THREE.Group();
    const gold = 0xf2c14e;
    const chain = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.035, 8, 24), toonMat(gold));
    chain.rotation.x = Math.PI / 2 + 0.16; g.add(chain);   // draped slightly forward
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 16), toonMat(gold));
    coin.rotation.x = Math.PI / 2; coin.position.set(0, -0.12, 0.38); coin.castShadow = true; g.add(coin);
    const gem = ball(0.035, 0xd6584f, 1, 1, 0.6); gem.position.set(0, -0.12, 0.4); g.add(gem);
    g.position.y = -0.42; head.add(g); return g;
  },
  // ---- body-worn accessories (attached to the torso anchor) ----
  // NOTE: on the GLB duck the `top` slot never builds these meshes — equipping a shirt
  // repaints the duck's baked shirt zone instead (see SHIRT_COLORS / buildFitted).
  shirt_white: (b) => shirtMesh(b, 0xf2f1ee),
  shirt_blue:  (b) => shirtMesh(b, 0x4a78c8),
  shirt_red:   (b) => shirtMesh(b, 0xd6584f),
  shirt_green: (b) => shirtMesh(b, 0x4f9e6a),
  jacket_denim: (b) => shirtMesh(b, 0x4f74a8),   // simple fallback for the procedural duck;
  jacket_black: (b) => shirtMesh(b, 0x2e3138),   // the GLB duck gets the real fitted jacket
  pants_blue:  (b) => pantsMesh(b, 0x3f567f),
  pants_khaki: (b) => pantsMesh(b, 0xc2a172),
  pants_grey:  (b) => pantsMesh(b, 0x5b6068),
  bag_navy:    (b) => backpackMesh(b, 0x2f3a66),
  bag_red:     (b) => backpackMesh(b, 0xbe3b32),
  bag_green:   (b) => backpackMesh(b, 0x3c7a4e),
};

// tint a hex toward white (t>0) or black (t<0) by |t|
const tintHex = (c, t) => new THREE.Color(c).lerp(new THREE.Color(t < 0 ? 0x000000 : 0xffffff), Math.abs(t)).getHex();

// Body accessories sit in the Aura's normalised space (feet y=0, ~1.7 tall). The
// big chibi head spans y≈0.81–1.70, so the torso is ~0.45–0.81 and the legs below.
// Positions/sizes are tuned to that; the constants below make them easy to nudge.
const TORSO_Y = 0.60, TORSO_R = 0.37, HIPS_Y = 0.33;
// Simple tee for the procedural pets (the GLB duck never builds this — its shirt is a
// repainted texture zone, see SHIRT_COLORS).
function shirtMesh(body, color) {
  const g = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.SphereGeometry(TORSO_R, 18, 14), toonMat(color));
  torso.scale.set(1.06, 0.86, 1.02); torso.castShadow = true; g.add(torso);
  for (const s of [-1, 1]) {
    const sl = ball(0.145, color, 1, 0.85, 1);
    sl.position.set(s * 0.35, 0.02, 0);
    g.add(sl);
  }
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.03, 8, 16), toonMat(tintHex(color, 0.35)));
  collar.rotation.x = Math.PI / 2; collar.position.y = 0.27;
  g.add(collar);
  const hem = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.028, 8, 18), toonMat(tintHex(color, 0.22)));
  hem.rotation.x = Math.PI / 2; hem.position.y = -0.27;
  g.add(hem);
  g.position.set(0, TORSO_Y, 0); body.add(g); return g;
}
function pantsMesh(body, color) {
  const g = new THREE.Group();
  const hips = new THREE.Mesh(new THREE.SphereGeometry(0.33, 16, 12), toonMat(color));
  hips.scale.set(1.06, 0.74, 1.02); hips.castShadow = true; g.add(hips);
  for (const s of [-1, 1]) { const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.2, 4, 10), toonMat(color)); leg.position.set(s * 0.14, -0.26, 0.02); leg.castShadow = true; g.add(leg); }
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.03, 8, 18), toonMat(tintHex(color, -0.3)));
  belt.rotation.x = Math.PI / 2; belt.position.y = 0.13; g.add(belt);
  g.position.set(0, HIPS_Y, 0); body.add(g); return g;
}
// A rounded 2D arch outline (flat-front backpack silhouette): rounded dome top,
// gently rounded bottom corners. Used as an extrude profile.
function archShape(w, h, rTop, rBot) {
  const s = new THREE.Shape();
  const hw = w / 2, hh = h / 2;
  s.moveTo(-hw, -hh + rBot);
  s.lineTo(-hw, hh - rTop);
  s.quadraticCurveTo(-hw, hh, -hw + rTop, hh);
  s.lineTo(hw - rTop, hh);
  s.quadraticCurveTo(hw, hh, hw, hh - rTop);
  s.lineTo(hw, -hh + rBot);
  s.quadraticCurveTo(hw, -hh, hw - rBot, -hh);
  s.lineTo(-hw + rBot, -hh);
  s.quadraticCurveTo(-hw, -hh, -hw, -hh + rBot);
  return s;
}
// Extrude an arch profile into a soft, bevelled slab (rounded front + edges).
function archSlab(w, h, depth, rTop, rBot, color, bevel = 0.03) {
  const geo = new THREE.ExtrudeGeometry(archShape(w, h, rTop, rBot), {
    depth: depth - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel,
    bevelSegments: 3, steps: 1, curveSegments: 24,
  });
  geo.translate(0, 0, -(depth - bevel * 2) / 2);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, toonMat(color));
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// School backpack modelled after a real one: rounded dome body, contrasting leather
// base, front zip pocket, top carry loop, and padded straps that arc over the
// shoulders to the chest. Built in the model's own space (height ~1.7; torso hips
// y0.41 -> shoulders y0.75; back surface near z-0.25) and parented to the torso.
const BAG = { cy: 0.60, cz: -0.30, w: 0.46, h: 0.54, d: 0.24 };
const BAG_LEATHER = 0x6f4a2c, BAG_DARK = 0x2b2b30;
function backpackMesh(body, color) {
  const g = new THREE.Group();
  const frontZ = BAG.cz - BAG.d / 2;                 // outward-facing plane (away from back)
  // main body
  const main = archSlab(BAG.w, BAG.h, BAG.d, BAG.w * 0.48, 0.07, color);
  main.position.set(0, BAG.cy, BAG.cz); g.add(main);
  // leather base wrapping the bottom
  const baseH = 0.17;
  const base = archSlab(BAG.w * 1.01, baseH, BAG.d * 1.04, 0.03, 0.07, BAG_LEATHER, 0.025);
  base.position.set(0, BAG.cy - BAG.h / 2 + baseH / 2, BAG.cz); g.add(base);
  // front pocket (slightly proud of the face) with a zip line
  const pocket = archSlab(BAG.w * 0.66, 0.24, 0.06, 0.05, 0.05, color, 0.02);
  pocket.position.set(0, BAG.cy - 0.05, frontZ - 0.02); g.add(pocket);
  const zip = box(BAG.w * 0.6, 0.018, 0.025, BAG_DARK);
  zip.position.set(0, BAG.cy + 0.06, frontZ - 0.05); g.add(zip);
  const pull = box(0.03, 0.05, 0.03, BAG_DARK);
  pull.position.set(BAG.w * 0.22, BAG.cy + 0.05, frontZ - 0.05); g.add(pull);
  // top carry loop
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.018, 8, 18, Math.PI), toonMat(BAG_DARK));
  handle.position.set(0, BAG.cy + BAG.h / 2 - 0.01, BAG.cz + 0.03); handle.castShadow = true; g.add(handle);
  // padded shoulder straps: a flattened tube arcing from the bag top, over each
  // shoulder, down to the chest — so the straps actually wrap the body.
  for (const sx of [-1, 1]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(sx * 0.12, BAG.cy + BAG.h * 0.34, BAG.cz + BAG.d * 0.35),
      new THREE.Vector3(sx * 0.17, 0.83, -0.02),
      new THREE.Vector3(sx * 0.16, 0.66, 0.17),
      new THREE.Vector3(sx * 0.13, 0.49, 0.21),
    ]);
    const strap = new THREE.Mesh(new THREE.TubeGeometry(curve, 28, 0.032, 10, false), toonMat(BAG_DARK));
    strap.scale.x = 1.5; strap.castShadow = true; g.add(strap);
  }
  body.add(g); return g;
}

// ==================================================================================
// Duck-space wearables — built directly in the GLB duck's own normalized space
// (feet y=0, height 2, facing +z) from MEASURED geometry, so they fit exactly.
// Body garments are shells derived from the duck's own mesh (duckShellGeo): the
// duck's skin, offset outward — they can't gap, float or mis-fit by construction.
// ==================================================================================

// thin cylinder connecting two points (glasses temples / bridges)
function barBetween(a, b, r, color) {
  const d = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 8), toonMat(color));
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
  m.castShadow = true;
  return m;
}

function shellMesh(opts, color) {
  const geo = duckShellGeo(opts);
  if (!geo) return null;
  const m = new THREE.Mesh(geo, toonMat(color, { noCache: true, side: THREE.DoubleSide }));
  m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
  return m;
}

// Pants: a shell over the lower belly (its own skin, inflated), with a thicker,
// darker waistband ring standing a little prouder at the top edge, plus a small
// trouser-leg sleeve cut from EACH LEG's own geometry. The sleeves are parented to
// the hip pivots (same -hip offset as the leg meshes), so they swing with the walk.
// Sleeve band: above the webbed-foot flare (feet stay bare, flare tops out ~y0.11),
// up under the belly so the hip end stays tucked behind the pants shell mid-swing.
const SLEEVE = { y0: 0.135, y1: 0.345, cuffY: 0.19, inflate: 0.02, cuffInflate: 0.036 };
function duckPants(pet, color) {
  const g = new THREE.Group();
  const main = shellMesh({ yMin: 0.26, yMax: 0.78, inflate: 0.028 }, color);
  if (main) g.add(main);
  const waist = shellMesh({ yMin: 0.70, yMax: 0.82, inflate: 0.048 }, tintHex(color, -0.32));
  if (waist) g.add(waist);
  g.userData.coParts = [];
  (pet.userData.legs || []).forEach((piv, i) => {
    const sleeve = legShellGeo(i, { yMin: SLEEVE.y0, yMax: SLEEVE.y1, inflate: SLEEVE.inflate });
    const cuff = legShellGeo(i, { yMin: SLEEVE.y0, yMax: SLEEVE.cuffY, inflate: SLEEVE.cuffInflate });
    for (const [geo, c] of [[sleeve, color], [cuff, tintHex(color, -0.32)]]) {
      if (!geo) continue;
      const m = new THREE.Mesh(geo, toonMat(c, { noCache: true, side: THREE.DoubleSide }));
      m.castShadow = true; m.frustumCulled = false;
      m.position.copy(piv.position).negate();   // duck-space geometry inside the hip pivot
      piv.add(m);
      g.userData.coParts.push(m);
    }
  });
  pet.userData.body.add(g);
  return g;
}

// Jacket: torso shell with an open front (the shirt zone shows through), the tail
// left poking out under the back hem, cap-sleeve shells over the wing area, collar
// flaps at the neckline and buttons down the right placket edge.
function duckJacket(pet, color, trimC, buttonC) {
  const g = new THREE.Group();
  const OPEN_HW = 0.15;                    // half-width of the front opening
  const YB = 0.76;                         // hem height
  const INF = 0.034;
  // Neckline: a TILTED plane — low at the front (under the chin, y≈1.30 @ z 0.5) and
  // high over the steep back dome (y≈1.46 @ z −0.3), like a real jacket back that
  // rises to the collar. A horizontal cut left the whole upper back exposed.
  const topClip = { n: [0, -1, -0.20], d: -1.40 };
  // The open front is a non-convex cut, so the body is three complementary clipped
  // pieces sharing exact boundary planes (no overlap, no gap): back+sides, and the
  // two front panels flanking the opening. The tail exits under the back hem.
  const tailClip = { n: [0, 0, 1], d: -0.49, when: (x, y) => y < 1.06 };
  const backP = shellMesh({ yMin: YB, inflate: INF, clips: [topClip, { n: [0, 0, -1], d: -0.32 }, tailClip] }, color);
  if (backP) g.add(backP);
  for (const s of [-1, 1]) {
    const panel = shellMesh({ yMin: YB, inflate: INF, clips: [topClip, { n: [0, 0, 1], d: 0.32 }, { n: [s, 0, 0], d: OPEN_HW }] }, color);
    if (panel) g.add(panel);
    // cap sleeve: a clean-edged patch over the wing area, riding prouder than the body
    const sleeve = shellMesh({
      yMin: 0.78, yMax: 1.12, inflate: 0.055,
      clips: [{ n: [s, 0, 0], d: 0.40 }, { n: [0, 0, 1], d: -0.30 }, { n: [0, 0, -1], d: -0.40 }],
      filter: (x) => Math.sign(x) === s,
    }, trimC);
    if (sleeve) g.add(sleeve);
  }
  // stand collar: a raised band riding along the tilted neckline (proud of the body,
  // wrapping behind the neck like a real jacket collar)
  const collar = shellMesh({
    inflate: 0.06,
    clips: [{ n: [0, 1, 0.20], d: 1.355 }, { n: [0, -1, -0.20], d: -1.475 }],
  }, trimC);
  if (collar) g.add(collar);
  // collar points: two small flattened flaps folding down-outward at the front
  for (const s of [-1, 1]) {
    const flap = box(0.17, 0.04, 0.13, trimC);
    flap.position.set(s * 0.21, 1.27, 0.48);
    flap.rotation.set(-0.62, s * 0.5, s * 0.22);
    g.add(flap);
  }
  // buttons down the right placket edge (front surface measured: z≈0.72 @ y1.0)
  for (const [y, z] of [[1.16, 0.66], [1.00, 0.755], [0.86, 0.765]]) {
    const b = ball(0.03, buttonC, 1, 1, 0.55);
    b.position.set(OPEN_HW + 0.05, y, z);
    g.add(b);
  }
  pet.userData.body.add(g);
  return g;
}

// Backpack: lies along the duck's steep upper-back slope (measured ~55° from
// vertical), sized and seated so its lowest rear corner clears the tail envelope
// (tail: y 0.60–1.11 for z < -0.55) through the whole walk cycle — the tail wiggles
// WITH the body group, so clearance here is clearance always.
const DBAG = { tilt: 0.95, cy: 1.385, cz: -0.415, w: 0.56, h: 0.52, d: 0.28 };
function duckBag(pet, color) {
  const g = new THREE.Group();
  const s = new THREE.Group();                 // the tilted slab frame
  s.position.set(0, DBAG.cy, DBAG.cz);
  s.rotation.x = DBAG.tilt;                    // local +y runs up the back slope, -z faces outward
  g.add(s);
  const outZ = -DBAG.d / 2;
  const main = archSlab(DBAG.w, DBAG.h, DBAG.d, DBAG.w * 0.46, 0.07, color);
  s.add(main);
  const baseH = 0.15;
  const base = archSlab(DBAG.w * 1.02, baseH, DBAG.d * 1.05, 0.03, 0.07, BAG_LEATHER, 0.025);
  base.position.y = -DBAG.h / 2 + baseH / 2;
  s.add(base);
  const pocket = archSlab(DBAG.w * 0.62, 0.20, 0.06, 0.05, 0.05, color, 0.02);
  pocket.position.set(0, -0.035, outZ - 0.018);
  s.add(pocket);
  const zip = box(DBAG.w * 0.56, 0.018, 0.024, BAG_DARK);
  zip.position.set(0, 0.09, outZ - 0.045); s.add(zip);
  const pull = box(0.028, 0.05, 0.028, BAG_DARK);
  pull.position.set(DBAG.w * 0.2, 0.08, outZ - 0.045); s.add(pull);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.017, 8, 18, Math.PI), toonMat(BAG_DARK));
  handle.position.set(0, DBAG.h / 2 - 0.01, 0.02); handle.castShadow = true; s.add(handle);
  // straps: padded tubes from the bag's top inner corners, over the shoulders,
  // down the chest — control points measured against the body surface (+~0.01 proud)
  for (const sx of [-1, 1]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(sx * 0.16, 1.53, -0.245),
      new THREE.Vector3(sx * 0.29, 1.40, 0.12),
      new THREE.Vector3(sx * 0.32, 1.17, 0.50),
      new THREE.Vector3(sx * 0.25, 0.97, 0.68),
    ]);
    const strap = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.036, 8, false), toonMat(BAG_DARK));
    strap.castShadow = true; g.add(strap);
  }
  pet.userData.body.add(g);
  return g;
}

// Gold chain: a real chain — chunky torus links whose positions are PROJECTED onto
// the measured body surface (duckRadiusAt) so the drape hugs the chest/nape exactly,
// links oriented along the drape tangent with alternating 90° twists (flat / edge-on,
// like real interlocked links), plus a medallion hanging at the lowest point.
function duckChain(pet) {
  const g = new THREE.Group();
  const gold = new THREE.MeshToonMaterial({
    color: 0xf0ad25, gradientMap: toonGradient(), emissive: 0x7a4e06, emissiveIntensity: 0.4,
  });
  const goldLight = new THREE.MeshToonMaterial({
    color: 0xffd75e, gradientMap: toonGradient(), emissive: 0x8a5c07, emissiveIntensity: 0.35,
  });
  // The drape is parametrized BY AZIMUTH around the body axis: a collar-height loop
  // that dips into a V at the front. Each sample is snapped to the measured surface
  // radius + PROUD, so the loop hugs the neck/chest and can never double back.
  const PROUD = 0.024, LINK_R = 0.036, TUBE = 0.016;
  const yAt = (az) => {                        // az 0 = front
    const w = 0.5 + 0.5 * Math.cos(az);        // 1 at front, 0 at nape
    return 1.28 - 0.40 * w * w;                // nape 1.28 → front dip 0.88
  };
  const S = 160, dense = [];
  for (let i = 0; i < S; i++) {
    const az = (i / S) * Math.PI * 2 - Math.PI; // start at the nape so the front V is mid-array
    const y = yAt(az);
    const r = (duckRadiusAt(y, az) || 0.5) + PROUD;
    dense.push(new THREE.Vector3(Math.sin(az) * r, y, Math.cos(az) * r));
  }
  let len = 0;
  const cum = [0];
  for (let i = 1; i <= S; i++) { len += dense[i % S].distanceTo(dense[i - 1]); cum.push(len); }
  const N = Math.round(len / (LINK_R * 1.25));  // centres closer than a link diameter → interlock
  const at = (d) => {                           // point at arc distance d
    d = ((d % len) + len) % len;
    let i = 1;
    while (cum[i] < d) i++;
    const t = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
    return dense[i - 1].clone().lerp(dense[i % S], t);
  };
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < N; i++) {
    const d = (i / N) * len;
    const p = at(d);
    const tan = at(d + 0.03).sub(at(d - 0.03)).normalize();
    const link = new THREE.Mesh(new THREE.TorusGeometry(LINK_R, TUBE, 6, 12), i % 2 ? goldLight : gold);
    link.position.copy(p);
    // torus plane contains the tangent; alternate links twist 90° about it, exactly
    // like the alternating flat/edge-on links of a real curb chain
    const outward = p.clone().setY(0).normalize().lerp(up, 0.2).normalize();
    link.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(
      new THREE.Vector3(), tan, outward));
    link.rotateZ(Math.PI / 2);
    if (i % 2) link.rotateY(Math.PI / 2);
    link.castShadow = true;
    g.add(link);
  }
  // medallion hanging from the V's lowest link, flat against the chest (normal
  // points outward, only barely up, so it reads as a full disc from the front)
  const dipY = 0.865;
  const mr = (duckRadiusAt(dipY, 0) || 0.70) + PROUD + 0.03;
  const medC = new THREE.Vector3(0, dipY, mr);
  const slope = new THREE.Vector3(0, 0.18, 1).normalize();
  const med = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.03, 20), gold);
  med.position.copy(medC);
  med.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), slope);
  med.castShadow = true; g.add(med);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.096, 0.017, 6, 20), goldLight);
  rim.position.copy(medC).addScaledVector(slope, 0.006);
  rim.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(), slope, up));
  g.add(rim);
  const gem = ball(0.036, 0xc03a4e, 1, 1, 0.5);
  gem.position.copy(medC).addScaledVector(slope, 0.02);
  gem.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), slope);
  g.add(gem);
  pet.userData.body.add(g);
  return g;
}

// Glasses, fitted to the MEASURED painted-eye centroids (mounts.eyes): each lens is
// centred on an eye and faces along the local outward normal (duck eyes look
// outward-forward ~45°), the bridge bows over the bill base, and thin temple arms
// sweep back along the head sides. Nothing touches the bill or cuts into the head.
function duckSpecs(pet, style) {
  const m = pet.userData.mounts;
  const g = new THREE.Group();
  const headC = new THREE.Vector3(...m.head.pos);
  const eyes = m.eyes.map((e) => new THREE.Vector3(...e));
  const S = {
    smart: { rimR: 0.145, rimT: 0.024, rimC: 0x2a2420, lensC: 0x86c8e8, lensOp: 0.45, off: 0.055 },
    shade: { rimR: 0.15, rimT: 0.026, rimC: 0x1d1a17, lensC: 0x14181d, lensOp: 1.0, off: 0.06 },
    round: { rimR: 0.125, rimT: 0.016, rimC: 0xc9a227, lensC: 0xdfe9f2, lensOp: 0.32, off: 0.05 },
    star:  { rimR: 0.15, rimT: 0, rimC: 0xf2c14e, lensC: 0xd94fa3, lensOp: 1.0, off: 0.055 },
  }[style];
  const rimMat = toonMat(S.rimC, { noCache: true });
  const lensMat = new THREE.MeshToonMaterial({
    color: S.lensC, gradientMap: toonGradient(),
    transparent: S.lensOp < 1, opacity: S.lensOp, side: THREE.DoubleSide,
  });
  const inner = [];
  for (const e of eyes) {
    const sgn = Math.sign(e.x) || 1;
    const n = e.clone().sub(headC).normalize();          // outward normal at the eye
    const c = e.clone().addScaledVector(n, S.off);       // lens centre, proud of the surface
    const toCentre = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), n)
      .multiplyScalar(-sgn).normalize();                 // unit vector toward the nose bridge
    if (style === 'star') {
      const rim = new THREE.Mesh(new THREE.ExtrudeGeometry(starShape(0.19), { depth: 0.022, bevelEnabled: false }), rimMat);
      rim.position.copy(c); rim.lookAt(c.clone().add(n)); g.add(rim);
      const lens = new THREE.Mesh(new THREE.ExtrudeGeometry(starShape(0.14), { depth: 0.024, bevelEnabled: false }), lensMat);
      lens.position.copy(c); lens.lookAt(c.clone().add(n)); g.add(lens);
    } else {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(S.rimR, S.rimT, 8, 20), rimMat);
      rim.position.copy(c); rim.lookAt(c.clone().add(n)); rim.castShadow = true; g.add(rim);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(S.rimR - S.rimT * 0.5, 20), lensMat);
      lens.position.copy(c).addScaledVector(n, -0.004); lens.lookAt(lens.position.clone().add(n)); g.add(lens);
    }
    inner.push(c.clone().addScaledVector(toCentre, S.rimR));
    // temple arm: from the lens's outer edge back along the side of the head
    const outerP = c.clone().addScaledVector(toCentre, -S.rimR * 0.9);
    const templeEnd = new THREE.Vector3(sgn * 0.255, e.y + 0.07, headC.z - 0.16);
    g.add(barBetween(outerP, templeEnd, 0.014, S.rimC));
  }
  // bridge: bowed slightly up and forward so it clears the bill base
  const mid = inner[0].clone().add(inner[1]).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.03, 0.025));
  const bridge = new THREE.Mesh(new THREE.TubeGeometry(
    new THREE.QuadraticBezierCurve3(inner[0], mid, inner[1]), 10, 0.014, 6, false), rimMat);
  g.add(bridge);
  pet.userData.body.add(g);
  return g;
}

// Headphones, fitted to the MEASURED head: the band is an arc whose top rests ON the
// crown point and whose ends land on the ear cups; the cups' pads are placed just
// inside the skull's measured half-width so they visibly press the head sides.
function duckHeadphones(pet) {
  const m = pet.userData.mounts;
  const g = new THREE.Group();
  const R = m.head.radius;                     // skull half-width (~0.30)
  const cupY = m.head.pos[1] - 0.02;           // ear height: just below the skull centre
  const cupZ = m.head.pos[2];                  // ear depth: the skull centre line
  const bandR = (m.crown.pos[1] + 0.025) - cupY;   // arc top = crown + tube sink
  // band: half-torus in the x/y plane, squashed in x so its ends meet the cup tops
  const band = new THREE.Mesh(new THREE.TorusGeometry(bandR, 0.048, 10, 24, Math.PI), toonMat(0x2a2d34));
  band.position.set(0, cupY, cupZ);
  band.scale.x = (R + 0.085) / bandR;
  band.castShadow = true; g.add(band);
  for (const s of [-1, 1]) {
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.07, 14), toonMat(0xff5fa2));
    pad.rotation.z = Math.PI / 2;
    pad.position.set(s * R, cupY, cupZ);       // inner face sinks ~0.035 into the head: contact
    g.add(pad);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.145, 0.11, 16), toonMat(0x33353b));
    cup.rotation.z = s * Math.PI / 2;
    cup.position.set(s * (R + 0.085), cupY, cupZ);
    cup.castShadow = true; g.add(cup);
  }
  pet.userData.body.add(g);
  return g;
}

// ---- shoes ('feet' slot) -------------------------------------------------------------------
// Built per-foot from that leg's own MEASURED geometry (webbed-foot extents + shin column),
// parented to the hip pivots so they swing with the walk. The shoe volume fully contains the
// webbed fan (sole slightly larger than the foot outline), so the foot can never poke out.
function roundedRectShape(w, d, r) {
  const s = new THREE.Shape(), hw = w / 2, hd = d / 2;
  s.moveTo(-hw + r, -hd);
  s.lineTo(hw - r, -hd); s.quadraticCurveTo(hw, -hd, hw, -hd + r);
  s.lineTo(hw, hd - r); s.quadraticCurveTo(hw, hd, hw - r, hd);
  s.lineTo(-hw + r, hd); s.quadraticCurveTo(-hw, hd, -hw, hd - r);
  s.lineTo(-hw, -hd + r); s.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
  return s;
}
// a soft rounded slab lying flat (footprint w × d in x/z), bottom face at y0
function shoeSlab(w, d, thick, y0, color, r = 0.13) {
  const bev = Math.min(0.03, thick * 0.3);
  const geo = new THREE.ExtrudeGeometry(roundedRectShape(w, d, Math.min(r, w / 2 - 0.01, d / 2 - 0.01)), {
    depth: thick - bev * 2, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 3, curveSegments: 12,
  });
  geo.rotateX(-Math.PI / 2);
  geo.computeBoundingBox();
  geo.translate(0, y0 - geo.boundingBox.min.y, 0);
  const m = new THREE.Mesh(geo, toonMat(color, { noCache: true }));
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
const SHOE_STYLES = {
  sneaker_white: { body: 0xf2f1ee, sole: 0xd7d2c4, trim: 0xd6584f, lace: 0xb9b3a4, boot: false },
  sneaker_red:   { body: 0xd6453c, sole: 0xf2f1ee, trim: 0xf2f1ee, lace: 0x33353b, boot: false },
  boots_brown:   { body: 0x7a5230, sole: 0x40301e, trim: 0xa5804e, lace: 0x4a3826, boot: true },
};
function duckShoes(pet, styleId) {
  const S = SHOE_STYLES[styleId];
  const g = new THREE.Group();                 // bookkeeping handle (parts live on the pivots)
  g.userData.coParts = [];
  (pet.userData.legs || []).forEach((piv) => {
    const wrap = new THREE.Group();
    wrap.position.copy(piv.position).negate(); // duck-space build inside the hip pivot
    // measure THIS leg: webbed-foot extents (below the flare top) + shin centre
    const pos = piv.children[0].geometry.attributes.position;
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, sx = 0, sz = 0, sc = 0;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (y < 0.12) {
        x0 = Math.min(x0, x); x1 = Math.max(x1, x);
        z0 = Math.min(z0, z); z1 = Math.max(z1, z);
      } else if (y < 0.3) { sx += x; sz += z; sc++; }
    }
    const fx = (x0 + x1) / 2, fz = (z0 + z1) / 2;
    const shinX = sc ? sx / sc : fx, shinZ = sc ? sz / sc : fz - 0.12;
    const W = (x1 - x0), D = (z1 - z0);
    // sole slab: a touch larger than the foot outline all round
    const sole = shoeSlab(W + 0.10, D + 0.14, 0.06, -0.008, S.sole, 0.15);
    sole.position.set(fx, 0, fz);
    wrap.add(sole);
    // upper: chunky rounded body over the whole fan (toe box + heel in one)
    const upper = shoeSlab(W + 0.05, D + 0.08, 0.13, 0.04, S.body, 0.14);
    upper.position.set(fx, 0, fz);
    wrap.add(upper);
    if (S.boot) {
      // boots: ankle shaft around the shin with a folded contrast cuff on top
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.12, 0.18, 12), toonMat(S.body, { noCache: true }));
      shaft.position.set(shinX, 0.215, shinZ); shaft.castShadow = true; wrap.add(shaft);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.108, 0.07, 12), toonMat(S.trim, { noCache: true }));
      cuff.position.set(shinX, 0.30, shinZ); cuff.castShadow = true; wrap.add(cuff);
    } else {
      // sneakers: padded ankle collar + two lace bars across the instep + heel tab
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.105, 0.09, 12), toonMat(S.body, { noCache: true }));
      collar.position.set(shinX, 0.20, shinZ); collar.castShadow = true; wrap.add(collar);
      for (const [y, z] of [[0.19, 0.10], [0.168, 0.17]]) {
        const lace = box(W * 0.52, 0.022, 0.04, S.lace);
        lace.position.set(fx, y, shinZ + z); lace.rotation.x = 0.35; wrap.add(lace);
      }
      const tab = box(0.07, 0.06, 0.03, S.trim);
      tab.position.set(shinX, 0.175, shinZ - 0.09); wrap.add(tab);
    }
    piv.add(wrap);
    g.userData.coParts.push(wrap);
  });
  pet.userData.body.add(g);
  return g;
}

// registry: item id -> duck-space builder (used on the GLB duck instead of the
// generic reference-space builders above; the procedural fallback keeps those)
const DUCK_WEAR = {
  headphones: (pet) => duckHeadphones(pet),
  sneaker_white: (pet) => duckShoes(pet, 'sneaker_white'),
  sneaker_red:   (pet) => duckShoes(pet, 'sneaker_red'),
  boots_brown:   (pet) => duckShoes(pet, 'boots_brown'),
  pants_blue:  (pet) => duckPants(pet, 0x3f567f),
  pants_khaki: (pet) => duckPants(pet, 0xc2a172),
  pants_grey:  (pet) => duckPants(pet, 0x5b6068),
  jacket_denim: (pet) => duckJacket(pet, 0x4f74a8, 0x3d5c88, 0xd8c49a),
  jacket_black: (pet) => duckJacket(pet, 0x2e3138, 0x1f2126, 0x9aa0ab),
  bag_navy:  (pet) => duckBag(pet, 0x2f3a66),
  bag_red:   (pet) => duckBag(pet, 0xbe3b32),
  bag_green: (pet) => duckBag(pet, 0x3c7a4e),
  chain_gold: (pet) => duckChain(pet),
  glasses:       (pet) => duckSpecs(pet, 'smart'),
  sunglasses:    (pet) => duckSpecs(pet, 'shade'),
  round_glasses: (pet) => duckSpecs(pet, 'round'),
  star_shades:   (pet) => duckSpecs(pet, 'star'),
};

// Flat five-point star outline (point-up), used by the star shades.
function starShape(r) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}

function capMesh(head, color) {
  const g = new THREE.Group();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.46, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), toonMat(color));
  dome.castShadow = true;
  dome.scale.y = 0.8;
  g.add(dome);
  const brim = ball(0.24, color, 1.6, 0.18, 1.2);
  brim.position.set(0, 0.02, 0.42);
  g.add(brim);
  const button = ball(0.05, color);
  button.position.y = 0.38;
  g.add(button);
  g.position.y = 0.22;
  head.add(g);
  return g;
}

// ---- College Ducks: the player character, modelled natively (no GLB). A plump egg
// body, big round head, broad two-part bill, webbed feet, little wings, an upturned
// tail tuft and a cheeky head feather. Anchors kept clean for accessories: the `head`
// group (hats/glasses) and the torso `inner` (shirt / backpack). Body + head take the
// coat colour; bill + feet take the "muzzle" colour; eyes take the eye colour. ----

// A webbed-foot outline: a heel that fans into three soft lobes at the front.
function duckFootShape(w, len) {
  const s = new THREE.Shape();
  s.moveTo(0, -0.02);
  s.lineTo(-w, len * 0.5);
  s.quadraticCurveTo(-w * 1.06, len, -w * 0.5, len * 0.9);
  s.quadraticCurveTo(0, len * 1.08, w * 0.5, len * 0.9);
  s.quadraticCurveTo(w * 1.06, len, w, len * 0.5);
  s.lineTo(0, -0.02);
  return s;
}
function duckFoot(color) {
  const geo = new THREE.ExtrudeGeometry(duckFootShape(0.12, 0.24), {
    depth: 0.045, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2, steps: 1, curveSegments: 16,
  });
  geo.rotateX(-Math.PI / 2);          // lie flat, toes point +z
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, toonMat(color));
  m.castShadow = true;
  return m;
}
// Loft a single smooth surface from a stack of horizontal cross-sections. `keys` are
// [y, z, rx, rz] control points (bottom→top); each level is an ellipse of half-width
// rx / half-depth rz, centred at (0, y, z). Catmull-Rom-smoothed and capped top+bottom
// → one continuous watertight body (no stuck-together spheres).
function loftBody(keys, SEG, RES) {
  const ch = (i) => new THREE.CatmullRomCurve3(keys.map((k, n) => new THREE.Vector3(n, k[i], 0)), false, 'catmullrom', 0.5);
  const yS = ch(0), zS = ch(1), xrS = ch(2), zrS = ch(3);
  const at = (sp, u) => sp.getPoint(u).y;        // u in [0,1] spans the whole spline
  const pos = [], idx = [], rings = [];
  for (let r = 0; r <= RES; r++) {
    const u = r / RES, y = at(yS, u), zc = at(zS, u), rx = Math.max(1e-3, at(xrS, u)), rz = Math.max(1e-3, at(zrS, u));
    const ring = [];
    for (let s = 0; s < SEG; s++) {
      const ang = (s / SEG) * Math.PI * 2;
      ring.push(pos.length / 3);
      pos.push(Math.cos(ang) * rx, y, zc + Math.sin(ang) * rz);
    }
    rings.push(ring);
  }
  for (let r = 0; r < RES; r++) for (let s = 0; s < SEG; s++) {
    const s2 = (s + 1) % SEG, a = rings[r][s], b = rings[r][s2], c = rings[r + 1][s2], d = rings[r + 1][s];
    idx.push(a, c, b, a, d, c);                 // outward winding (front faces face out)
  }
  const botC = pos.length / 3; pos.push(0, at(yS, 0) - 0.03, at(zS, 0));
  for (let s = 0; s < SEG; s++) idx.push(botC, rings[0][s], rings[0][(s + 1) % SEG]);
  const topC = pos.length / 3; pos.push(0, at(yS, 1) + 0.03, at(zS, 1));
  for (let s = 0; s < SEG; s++) idx.push(topC, rings[RES][(s + 1) % SEG], rings[RES][s]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// Flat duck-bill outline (top view): a rounded scoop, a touch wider at the front.
function duckBillShape(hw, len) {
  const s = new THREE.Shape();
  s.moveTo(-hw * 0.66, 0);
  s.lineTo(-hw, len * 0.5);
  s.quadraticCurveTo(-hw, len, -hw * 0.45, len);
  s.quadraticCurveTo(0, len * 1.08, hw * 0.45, len);
  s.quadraticCurveTo(hw, len, hw, len * 0.5);
  s.lineTo(hw * 0.66, 0);
  s.quadraticCurveTo(0, -len * 0.16, -hw * 0.66, 0);
  return s;
}
function duckBill(hw, len, color) {
  const geo = new THREE.ExtrudeGeometry(duckBillShape(hw, len), {
    depth: 0.05, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.03, bevelSegments: 3, steps: 1, curveSegments: 20,
  });
  geo.rotateX(Math.PI / 2);           // lay flat; the scoop length now points +z (forward)
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, toonMat(color)); m.castShadow = true;
  return m;
}

// A leg: a slim shin pivoted at the hip with a small webbed foot (so it can step).
function duckLeg(color) {
  const g = new THREE.Group();
  const shin = capsule(0.045, 0.2, color); shin.position.y = -0.15; g.add(shin);
  const foot = duckFoot(color); foot.scale.setScalar(0.55); foot.position.set(0, -0.32, 0.05); g.add(foot);
  return g;
}

// The shared duck model — a cozy toon duckling in the game's style (toonMat + inverted-
// hull outlines, like the NPC animals). The whole body→neck→head is ONE continuous
// lofted surface (a deep neck pinch + a forward-bloomed head) so it reads as a real
// duckling, not stacked spheres. Two-tone: `coat` (yellow feathers + belly + head +
// wings + tail), `saddle` (green back vest), `beak` (orange beak + legs + feet), `eye`.
// Returns a custom waddle `animate` (legs swing + body bob; the face is part of the body
// loft, so we never rotate the head). Both the player and NPC ducks build from this.
function duckModel(inner, { coat, saddle, beak, eye, sizeScale = 1 }) {
  inner.scale.setScalar(sizeScale);

  // legs (hip-pivoted) first, so the body overlaps them
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = duckLeg(beak); leg.position.set(s * 0.15, 0.4, 0.04); inner.add(leg); legs.push(leg);
  }

  // BODY + NECK + HEAD as one smooth continuous loft. keys = [y, z, rx, rz]: an ellipse
  // at height y centred (0,y,z). Egg body deeper than wide, a deep neck pinch at y0.90,
  // then the head blooms out and pushes FORWARD (+z) so it sits up-and-forward.
  const bodyKeys = [
    [0.30, -0.02, 0.10, 0.12],
    [0.40, 0.02, 0.30, 0.34],
    [0.52, 0.04, 0.42, 0.46],     // widest chest
    [0.64, 0.02, 0.42, 0.45],
    [0.74, -0.04, 0.37, 0.40],
    [0.83, -0.05, 0.25, 0.26],
    [0.90, -0.02, 0.16, 0.16],    // neck pinch (anti-peanut)
    [0.97, 0.06, 0.20, 0.20],
    [1.05, 0.12, 0.27, 0.27],
    [1.16, 0.16, 0.31, 0.31],     // head equator, forward over the chest
    [1.27, 0.16, 0.27, 0.27],
    [1.34, 0.15, 0.18, 0.18],
    [1.40, 0.14, 0.09, 0.09],     // rounded crown
  ];
  const geo = loftBody(bodyKeys, 56, 48);       // higher resolution → a smooth round head
  geo.computeBoundingBox();
  const c = new THREE.Vector3(); geo.boundingBox.getCenter(c);
  geo.translate(-c.x, -c.y, -c.z);            // centre at origin so the outline scales evenly
  const body = new THREE.Mesh(geo, toonMat(coat));
  body.position.copy(c); body.castShadow = true; body.receiveShadow = true;
  inner.add(body); addOutline(body, 1.035);

  // head anchor (face parts ride here; hats attach here). NOT animated.
  const head = new THREE.Group(); head.position.set(0, 1.16, 0.16); inner.add(head);
  // beak — flat scoop protruding from the head front, tip dipped slightly down (orange
  // reads clearly against the yellow head, so no outline needed)
  const bk = duckBill(0.16, 0.26, beak); bk.position.set(0, -0.04, 0.24); bk.rotation.x = 0.12; head.add(bk);
  // eyes + tiny catchlights, one per side
  for (const s of [-1, 1]) {
    const e = ball(0.045, eye); e.position.set(s * 0.19, 0.05, 0.225); head.add(e);
    const hi = ball(0.015, 0xffffff); hi.position.set(s * 0.175, 0.075, 0.26); head.add(hi);
  }

  // green saddle vest over the back/upper sides, ridden high so a yellow belly shows
  const sad = ball(0.4, saddle, 1.16, 0.62, 1.12); sad.position.set(0, 0.66, -0.04); sad.rotation.x = 0.12;
  inner.add(sad); addOutline(sad, 1.04);

  // yellow teardrop wing patches — same colour as the body, so their outline defines them
  for (const s of [-1, 1]) {
    const wing = ball(0.14, coat, 0.46, 0.92, 1.3);
    wing.position.set(s * 0.38, 0.54, 0.04); wing.rotation.set(0, s * 0.12, s * 0.2);
    inner.add(wing); addOutline(wing, 1.07);
  }

  // small upturned tail tuft
  const tail = ball(0.14, coat, 0.9, 0.8, 1.1); tail.position.set(0, 0.78, -0.4); tail.rotation.x = -0.55;
  inner.add(tail); addOutline(tail, 1.06);

  // gentle waddle: legs swing + a hop/squash when moving; a soft breathe when idle.
  const baseScaleY = inner.scale.y;
  const animate = (t, moving) => {
    if (moving) {
      const hop = Math.abs(Math.sin(t * 8));
      inner.position.y = hop * 0.05;
      inner.scale.y = baseScaleY * (1 + (hop - 0.5) * 0.04);
      legs.forEach((leg, i) => { leg.rotation.x = Math.sin(t * 8 + (i % 2) * Math.PI) * 0.5; });
    } else {
      inner.position.y = 0;
      inner.scale.y = baseScaleY * (1 + Math.sin(t * 2.0) * 0.012);
      legs.forEach((leg) => { leg.rotation.x = 0; });
    }
  };

  return { head, legs, tail, ears: [], animate };
}

// The player's customizable duck — drives the shared model from the appearance fields.
function buildDuck(inner, a) {
  return duckModel(inner, {
    coat: a.bodyColor ?? 0xf6d33b,        // feathers
    saddle: a.shirtColor ?? 0x5a9e44,     // green back (edited by the "Back" tab)
    beak: a.muzzleColor ?? 0xf0922f,      // beak + legs + feet
    eye: a.eyeColor ?? 0x1a1714,
    sizeScale: a.size === 'small' ? 0.9 : a.size === 'tall' ? 1.12 : 1.0,
  });
}

// Every pet is a duck. The `type` argument is kept for API compatibility —
// unknown / legacy animal types ('cat', 'dog', …, from old saves or callers)
// all route to the duck.
export function createPet(type, { equipped = {}, appearance = null } = {}) {
  const g = new THREE.Group();
  const inner = new THREE.Group();
  g.add(inner);
  const a = appearance || defaultCreature();
  const parts = isDuckReady()
    ? buildGlbDuck(inner, a)     // authored low-poly GLB (rigged)
    : buildDuck(inner, a);       // procedural toon fallback
  g.userData.head = parts.head;
  g.userData.body = inner;          // torso anchor for body wearables (shirt/pants/bag)
  g.userData.legs = parts.legs || [];   // hip pivots (pant sleeves / shoes swing with these)
  g.userData.mounts = parts.mounts || null;   // measured attach points (GLB duck only)
  g.userData.setShirtColor = parts.setShirtColor || null;   // live shirt-zone repaint (GLB duck only)
  g.userData.skin = parts.skin || null;   // {skeleton, bindMatrix, root} for skinned clothing
  g.userData.petType = 'creature';
  g.userData.wearables = [];

  setWearables(g, equipped);

  // both duck builders supply their own animator (waddle walk + idle breathe)
  g.userData.animate = parts.animate;
  return g;
}

// Build a wearable on a fresh anchor group (for standalone preview thumbnails).
export function buildWearable(id) {
  const anchor = new THREE.Group();
  if (WEARABLES[id]) WEARABLES[id](anchor);
  return anchor;
}

// Body-worn slots attach to the torso anchor; everything else to the head.
const BODY_SLOTS = { top: 1, bottom: 1, back: 1 };

// On the GLB duck the baked green texture zone IS the shirt, so a `top` item is a shirt
// COLOUR, not geometry: equipping repaints that zone via the pet's setShirtColor hook.
const SHIRT_COLORS = {
  shirt_white: 0xf2f1ee,
  shirt_blue:  0x4a78c8,
  shirt_red:   0xd6584f,
  shirt_green: 0x4f9e6a,
};

// ---- mount-based fitting (GLB duck) -------------------------------------------------------
// Every wearable builder above is hand-tuned to the old procedural pet: head items assume a
// head of radius 0.52 centred on the head-group origin; body items assume a torso centred at
// y=0.60 with radius 0.37 on the pet root. Rather than fork 19 builders for the GLB duck,
// each wearable is built inside a wrapper group that maps that reference space onto the
// duck's MEASURED mounts (see glbDuck computeMounts): one uniform radius-to-radius scale,
// plus a small per-slot nudge (and a per-item nudge where a single item still sits off).
// Nudge fields (duck local space): dx/dy/dz offset, rx lean (radians), s extra uniform
// scale, sx/sy/sz per-axis multipliers (the egg-shaped duck is deeper than it is wide, so
// body garments need a slightly stretched depth and a squashed height to hug it).
const REF_HEAD_R = 0.52, REF_TORSO_Y = TORSO_Y, REF_TORSO_R = TORSO_R;   // stay in lock-step with the builders' tuning
const SLOT_FIT = {
  hat:    { s: 1.12 },   // seating comes from the measured crown point (see buildFitted)
  face:   { s: 1.55, dy: -0.06, dz: -0.10 },
  neck:   { s: 1.35 },
  top:    { s: 1.03, sy: 1.09, sz: 1.21, dy: -0.03 },
  bottom: { s: 0.93, sy: 0.68, sz: 0.95, dy: -0.15, dz: 0.03 },
  back:   { s: 0.85, dy: 0.26, dz: -0.14, rx: 0.40 },
};
const ITEM_FIT = {
  // duck units, applied after the crown-seat mapping. Tuned visually per hat.
  cap_red:   { dz: 0.06 },               // brim forward, over (not behind) the eye line
  cap_blue:  { dz: 0.06 },
  beanie:    { dz: 0.05 },               // band forward so it hugs the forehead
  party_hat: { dy: 0.17 },               // cone base ON the crown, not sunk into the skull
};
function fitNudge(slot, id, key) {
  const a = SLOT_FIT[slot], b = ITEM_FIT[id];
  if (key === 's' || key === 'sx' || key === 'sy' || key === 'sz')
    return (a && a[key] != null ? a[key] : 1) * (b && b[key] != null ? b[key] : 1);
  return ((a && a[key]) || 0) + ((b && b[key]) || 0);
}

// Build wearable `id` fitted to this pet. Procedural pets (no mounts) keep the untouched
// legacy path: the builder attaches straight to the head/torso anchor.
function buildFitted(pet, slot, id) {
  const head = pet.userData.head, body = pet.userData.body || pet.userData.head;
  const m = pet.userData.mounts;
  // GLB duck shirts: no geometry — repaint the baked shirt zone and hand back an empty
  // placeholder so the wearables bookkeeping stays uniform (setWearables already reverted
  // the zone to the player's own colour before re-applying equips).
  if (m && slot === 'top' && pet.userData.setShirtColor && SHIRT_COLORS[id] != null) {
    pet.userData.setShirtColor(SHIRT_COLORS[id]);
    return new THREE.Group();
  }
  // GLB duck: garments/accessories authored directly in the duck's own space from
  // measured geometry (mesh-derived shells, measured eye/back/tail mounts).
  if (m && DUCK_WEAR[id]) return DUCK_WEAR[id](pet);
  // procedural fallback: no duck-space builder and no legacy builder (e.g. shoes) → skip
  if (!m) return WEARABLES[id] ? WEARABLES[id](BODY_SLOTS[slot] ? body : head) : new THREE.Group();
  const s = fitNudge(slot, id, 's');
  const wrap = new THREE.Group();
  wrap.rotation.x = fitNudge(slot, id, 'rx');
  if (BODY_SLOTS[slot]) {
    // wrapper sits at the torso mount so nudges/rotation pivot about the torso centre;
    // the inner `space` re-creates the builder's pet-root frame (torso centre at y 0.60).
    const k = (m.torso.radius / REF_TORSO_R) * s;
    wrap.scale.set(k * fitNudge(slot, id, 'sx'), k * fitNudge(slot, id, 'sy'), k * fitNudge(slot, id, 'sz'));
    wrap.position.set(
      m.torso.pos[0] + fitNudge(slot, id, 'dx'),
      m.torso.pos[1] + fitNudge(slot, id, 'dy'),
      m.torso.pos[2] + fitNudge(slot, id, 'dz'));
    const space = new THREE.Group();
    space.position.y = -REF_TORSO_Y;
    wrap.add(space);
    WEARABLES[id](space);
    body.add(wrap);
  } else {
    // head items: the head group already sits at the measured skull centre.
    const k = (m.head.radius / REF_HEAD_R) * s;
    wrap.scale.set(k * fitNudge(slot, id, 'sx'), k * fitNudge(slot, id, 'sy'), k * fitNudge(slot, id, 'sz'));
    if (slot === 'hat' && m.crown) {
      // seat hats against the MEASURED top of the head: hats are authored around a
      // reference head sphere (r 0.52, centred on the group origin), so mapping that
      // sphere's top onto the real crown point makes the rim rest ON the crown —
      // never floating behind it (the skull centroid sits behind the visual crown).
      const hp = m.head.pos, cp = m.crown.pos;
      wrap.position.set(
        cp[0] - hp[0] + fitNudge(slot, id, 'dx'),
        cp[1] - hp[1] - REF_HEAD_R * k + fitNudge(slot, id, 'dy'),
        cp[2] - hp[2] + fitNudge(slot, id, 'dz'));
    } else {
      wrap.position.set(fitNudge(slot, id, 'dx'), fitNudge(slot, id, 'dy'), fitNudge(slot, id, 'dz'));
    }
    WEARABLES[id](wrap);
    head.add(wrap);
  }
  return wrap;
}

export function setWearables(pet, equipped) {
  // The duck's feather/back/beak colours come from its appearance, not wearables.
  // Only genuine add-on accessories (e.g. backpack) are built here.
  for (const w of pet.userData.wearables) {
    // co-parts live on OTHER anchors (leg pivots) — remove them alongside the main group
    if (w.userData && w.userData.coParts) for (const p of w.userData.coParts) if (p.parent) p.parent.remove(p);
    if (w.parent) w.parent.remove(w);
  }
  pet.userData.wearables = [];
  // GLB duck: reset the shirt zone to the player's own colour first, so an unequipped /
  // un-previewed top always reverts; an equipped shirt re-applies below via buildFitted.
  if (pet.userData.setShirtColor) pet.userData.setShirtColor(null);
  for (const [slot, id] of Object.entries(equipped)) {
    if (!id || (!WEARABLES[id] && !DUCK_WEAR[id])) continue;
    pet.userData.wearables.push(buildFitted(pet, slot, id));
  }
}
