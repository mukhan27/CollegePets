// Pet builder — every character in College Ducks is a duck. createPet returns a
// Group with userData { head, animate(t, moving) }; setWearables re-dresses a pet.
// The player's authored GLB duck is preferred; a procedural toon duck is the
// fallback when the GLB fails to load. Appearance {bodyColor, shirtColor,
// muzzleColor, eyeColor} recolours both, so NPCs are just recolored instances.

import * as THREE from 'three';
import { toonMat } from './textures.js';
import { isDuckReady, buildGlbDuck } from './glbDuck.js';

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
  bow(head) {
    const g = new THREE.Group();
    for (const s of [-1, 1]) {
      const loop = ball(0.12, 0xe75480, 1.3, 0.9, 0.5);
      loop.position.x = s * 0.13;
      loop.rotation.z = s * 0.5;
      g.add(loop);
    }
    const knot = ball(0.07, 0xc23b66);
    g.add(knot);
    g.position.set(0.25, 0.44, 0.1);
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
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 8, 20, 0, Math.PI), toonMat(0x2a2d34));
    band.castShadow = true; g.add(band);
    for (const s of [-1, 1]) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.13, 14), toonMat(0x33353b));
      cup.rotation.z = Math.PI / 2; cup.position.set(s * 0.5, 0.02, 0); g.add(cup);
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.16, 12), toonMat(0xff5fa2));
      pad.rotation.z = Math.PI / 2; pad.position.set(s * 0.55, 0.02, 0); g.add(pad);
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
    const center = ball(0.06, 0xffd166); g.add(center);
    g.position.set(0.26, 0.45, 0.12); head.add(g); return g;
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
  cowboy_hat(head) {
    const g = new THREE.Group();
    const c = 0x9a6a3f, bandC = 0x5e3d22;
    const brim = ball(0.3, c, 2.55, 0.13, 1.95); g.add(brim);       // wide oval brim
    for (const s of [-1, 1]) {                                       // rolled-up brim edges
      const curl = ball(0.3, c, 0.38, 0.42, 1.75);
      curl.position.set(s * 0.68, 0.08, 0); curl.rotation.z = s * 0.5; g.add(curl);
    }
    const dome = ball(0.42, c, 1.02, 0.72, 1.14); dome.position.y = 0.16; g.add(dome);
    const crease = ball(0.24, c, 0.55, 0.5, 1.2); crease.position.y = 0.42; g.add(crease);
    const hb = new THREE.Mesh(new THREE.CylinderGeometry(0.415, 0.44, 0.09, 16), toonMat(bandC));
    hb.position.y = 0.1; g.add(hb);
    g.position.y = 0.32; head.add(g); return g;
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
  hat:    { s: 1.12, dy: 0.06, dz: -0.07 },   // seated on the crown, pushed back off the eyes
  face:   { s: 1.55, dy: -0.06, dz: -0.10 },
  neck:   { s: 1.35 },
  top:    { s: 1.03, sy: 1.09, sz: 1.21, dy: -0.03 },
  bottom: { s: 0.93, sy: 0.68, sz: 0.95, dy: -0.15, dz: 0.03 },
  back:   { s: 0.85, dy: 0.26, dz: -0.14, rx: 0.40 },
};
const ITEM_FIT = {
  beanie:     { dy: -0.05, s: 1.1 },
  party_hat:  { dy: -0.06 },
  cowboy_hat: { dy: -0.05, dz: 0.04 },   // deep hat: re-seat it down + forward onto the crown
  bow:       { dx: 0.10, dy: 0.05 },   // corner-placed: push out of the duck's fuller crown
  flower:    { dx: 0.09, dy: 0.05 },
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
  if (!m) return WEARABLES[id](BODY_SLOTS[slot] ? body : head);
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
    wrap.position.set(fitNudge(slot, id, 'dx'), fitNudge(slot, id, 'dy'), fitNudge(slot, id, 'dz'));
    WEARABLES[id](wrap);
    head.add(wrap);
  }
  return wrap;
}

export function setWearables(pet, equipped) {
  // The duck's feather/back/beak colours come from its appearance, not wearables.
  // Only genuine add-on accessories (e.g. backpack) are built here.
  for (const w of pet.userData.wearables) if (w.parent) w.parent.remove(w);
  pet.userData.wearables = [];
  // GLB duck: reset the shirt zone to the player's own colour first, so an unequipped /
  // un-previewed top always reverts; an equipped shirt re-applies below via buildFitted.
  if (pet.userData.setShirtColor) pet.userData.setShirtColor(null);
  for (const [slot, id] of Object.entries(equipped)) {
    if (!id || !WEARABLES[id]) continue;
    pet.userData.wearables.push(buildFitted(pet, slot, id));
  }
}
