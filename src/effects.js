// Small shared one-shot particle effects for consumable fun items: confetti
// bursts, spray puffs, bubbles and fireworks. (The basketball court keeps its
// own pooled confetti inside createBasketball; this module replicates that
// look for use anywhere without importing across minigames.)
//
// Memory-safe by construction: geometries, textures and materials are all
// module-level caches shared by every particle and NEVER disposed (bounded,
// tiny), particles are plain Mesh/Sprite objects removed from the scene when
// their life ends, and a global particle cap drops the oldest first.

import * as THREE from 'three';
import { glowTexture } from './textures.js';

const MAX_PARTICLES = 420;

let group = null;              // one container group added to the scene
const parts = [];              // live particles: { mesh, update(dt)->alive }
const timers = [];             // staggered spawns: { t, fn }

// ---- shared cached resources (never disposed) ----
const CONF_COLORS = [0xff5fa2, 0x5fd0ff, 0xffd166, 0x6be0a0, 0xff8b3a, 0xb98bff, 0xffffff];
const confGeo = new THREE.PlaneGeometry(0.16, 0.16);
const confMats = CONF_COLORS.map(c => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
const bubbleGeo = new THREE.SphereGeometry(0.12, 10, 8);
const bubbleMat = new THREE.MeshBasicMaterial({
  color: 0xbfe4ff, transparent: true, opacity: 0.55,
  blending: THREE.AdditiveBlending, depthWrite: false,
});
let glowTex = null;
const spriteMats = new Map(); // colorHex -> SpriteMaterial (additive glow)
function spriteMat(color) {
  let m = spriteMats.get(color);
  if (!m) {
    if (!glowTex) glowTex = glowTexture('255,255,255');
    // normal blending on purpose: additive glow disappears against the bright
    // daytime sky; a soft alpha blob reads on any background
    m = new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, depthWrite: false });
    spriteMats.set(color, m);
  }
  return m;
}

export function initEffects(scene) {
  group = new THREE.Group();
  scene.add(group);
}

function push(mesh, update) {
  while (parts.length >= MAX_PARTICLES) kill(parts[0]);
  group.add(mesh);
  parts.push({ mesh, update });
}
function kill(p) {
  group.remove(p.mesh);               // resources are shared — nothing to dispose
  const i = parts.indexOf(p);
  if (i >= 0) parts.splice(i, 1);
}

export function tickEffects(dt) {
  if (!group) return;
  for (let i = timers.length - 1; i >= 0; i--) {
    timers[i].t -= dt;
    if (timers[i].t <= 0) { const fn = timers[i].fn; timers.splice(i, 1); fn(); }
  }
  for (let i = parts.length - 1; i >= 0; i--) {
    if (!parts[i].update(dt)) kill(parts[i]);
  }
}

export function effectCount() { return parts.length; } // debug/tests

// ------------------------------------------------------------- confetti
// Same look as the basketball celebration: tumbling colored squares.
export function spawnConfetti(pos, n = 30) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(confGeo, confMats[i % confMats.length]);
    m.position.set(pos.x, pos.y, pos.z);
    const ang = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * 3.5;
    let vx = Math.cos(ang) * sp, vy = 3 + Math.random() * 3.5, vz = Math.sin(ang) * sp;
    const sx = (Math.random() - 0.5) * 14, sy = (Math.random() - 0.5) * 14, sz = (Math.random() - 0.5) * 14;
    let life = 1.1 + Math.random() * 0.7;
    push(m, (dt) => {
      life -= dt; if (life <= 0) return false;
      vy -= 9 * dt;
      m.position.x += vx * dt; m.position.y += vy * dt; m.position.z += vz * dt;
      m.rotation.x += sx * dt; m.rotation.y += sy * dt; m.rotation.z += sz * dt;
      return true;
    });
  }
}

// ------------------------------------------------------------- spray puff
// Brief soft cloud of tinted glow where the spray lands.
export function spawnSprayPuff(pos, color = '#ffffff') {
  const mat = spriteMat(color);
  for (let i = 0; i < 7; i++) {
    const s = new THREE.Sprite(mat);
    s.position.set(pos.x + (Math.random() - 0.5) * 0.4, pos.y + (Math.random() - 0.5) * 0.4, pos.z + (Math.random() - 0.5) * 0.4);
    const vx = (Math.random() - 0.5) * 1.2, vy = 0.3 + Math.random() * 0.7, vz = (Math.random() - 0.5) * 1.2;
    let life = 0.45 + Math.random() * 0.25;
    const ttl = life, base = 0.25 + Math.random() * 0.3;
    push(s, (dt) => {
      life -= dt; if (life <= 0) return false;
      s.position.x += vx * dt; s.position.y += vy * dt; s.position.z += vz * dt;
      s.scale.setScalar(base + (1 - life / ttl) * 0.6); // expands as it fades
      return true;
    });
  }
}

// ------------------------------------------------------------- bubbles
// 6–10 slow-rising transparent bubbles that drift, wobble and pop (scale-out).
export function spawnBubbles(pos) {
  const n = 6 + Math.floor(Math.random() * 5);
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(bubbleGeo, bubbleMat);
    const base = 0.6 + Math.random() * 0.9;
    m.scale.setScalar(base);
    m.position.set(pos.x + (Math.random() - 0.5) * 0.7, pos.y + Math.random() * 0.5, pos.z + (Math.random() - 0.5) * 0.7);
    const rise = 0.35 + Math.random() * 0.35;
    const dx = (Math.random() - 0.5) * 0.4, dz = (Math.random() - 0.5) * 0.4;
    const wob = 1.5 + Math.random() * 2, phase = Math.random() * Math.PI * 2;
    let life = 5.5 + Math.random() * 2.5;   // pops between ~5.5 and 8s
    let t = 0;
    push(m, (dt) => {
      life -= dt; t += dt;
      if (life <= 0) return false;
      m.position.y += rise * dt;
      m.position.x += (dx + Math.sin(t * wob + phase) * 0.25) * dt;
      m.position.z += (dz + Math.cos(t * wob * 0.8 + phase) * 0.25) * dt;
      if (life < 0.3) m.scale.setScalar(base * (1 + (0.3 - life) * 3)); // pop: quick scale-out
      return true;
    });
  }
}

// ------------------------------------------------------------- fireworks
// 3 staggered rockets: a glowing streak up, then a radial spark burst.
const FW_COLORS = ['#ff6a9c', '#ffd166', '#7ec8ff', '#8affc1', '#d9a2ff'];
export function spawnFireworks(pos) {
  for (let i = 0; i < 3; i++) {
    timers.push({ t: i * 0.55, fn: () => launchRocket(pos, FW_COLORS[Math.floor(Math.random() * FW_COLORS.length)]) });
  }
}
function launchRocket(pos, color) {
  const mat = spriteMat(color);
  const rocket = new THREE.Sprite(mat);
  const x = pos.x + (Math.random() - 0.5) * 3, z = pos.z + (Math.random() - 0.5) * 3;
  rocket.position.set(x, pos.y + 0.8, z);
  rocket.scale.setScalar(0.55);
  // keep the apex low enough to burst inside the default follow-camera frame
  const apex = pos.y + 5.5 + Math.random() * 1.5;
  const vy = 9 + Math.random() * 2;
  // faint trail puffs while rising
  let trailAcc = 0;
  push(rocket, (dt) => {
    rocket.position.y += vy * dt;
    trailAcc += dt;
    if (trailAcc > 0.05) {
      trailAcc = 0;
      const puff = new THREE.Sprite(mat);
      puff.position.copy(rocket.position);
      puff.scale.setScalar(0.3);
      let pl = 0.35;
      push(puff, (d2) => { pl -= d2; if (pl <= 0) return false; puff.scale.setScalar(0.3 * (pl / 0.35)); return true; });
    }
    if (rocket.position.y >= apex) { burst(rocket.position, color); return false; }
    return true;
  });
}
function burst(at, color) {
  const mat = spriteMat(color);
  const white = spriteMat('#ffffff');
  const n = 34;
  for (let i = 0; i < n; i++) {
    const s = new THREE.Sprite(i % 5 === 0 ? white : mat);
    s.position.copy(at);
    // radial sphere directions
    const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    const sp = 4.5 + Math.random() * 3.5;
    let vx = Math.sin(ph) * Math.cos(th) * sp, vy = Math.cos(ph) * sp, vz = Math.sin(ph) * Math.sin(th) * sp;
    let life = 0.9 + Math.random() * 0.5;
    const ttl = life, base = 0.7 + Math.random() * 0.45;
    push(s, (dt) => {
      life -= dt; if (life <= 0) return false;
      vy -= 3.2 * dt;                       // gentle gravity
      vx *= (1 - 1.6 * dt); vz *= (1 - 1.6 * dt); // drag
      s.position.x += vx * dt; s.position.y += vy * dt; s.position.z += vz * dt;
      s.scale.setScalar(base * (life / ttl)); // shrink out (shared material — fade via scale)
      return true;
    });
  }
}
