// Ephemeral player-made decals: spray-paint splats & chalk doodles stuck onto
// world surfaces. Strictly memory-capped (this game once OOM'd an iPhone):
//   - hard cap of MAX_DECALS live decals; spawning past it disposes the oldest
//   - every expired/evicted decal disposes its texture + material (geometry is
//     one shared unit plane, never disposed)
//
// PHASE-4 NOTE: the persisted entry shape
//   { locKey, pos:[x,y,z], normal:[x,y,z], color, kind, createdAt, seed }
// is intentionally kept flat/serializable — it is the future synced-ephemera
// payload (other players' tags arriving over the wire use the same shape).

import * as THREE from 'three';
import { state, save } from './state.js';

const MAX_DECALS = 24;
// seconds; mutable on purpose so playtests can fast-forward expiry
export const DECAL_LIFETIMES = { spray: 180, chalk: 300 };
const BASE_OPACITY = { spray: 0.95, chalk: 0.96 };

let getRoot = null;              // (locKey) => THREE.Group for that location
const live = [];                 // [{ mesh, entry }] in spawn order (oldest first)
const sharedGeo = new THREE.PlaneGeometry(1, 1); // shared; never disposed

// deterministic rng so a decal looks identical after a reload (same seed)
function rng(seed) {
  let s = (seed * 1e6) >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// ---------------------------------------------------------------- textures
function sprayTexture(color, seed) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const r = rng(seed);
  const cx = 128, cy = 112;
  // organic blobby splat: overlapping lobes around the centre
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(cx, cy, 58 + r() * 14, 0, Math.PI * 2); ctx.fill();
  const lobes = 7 + Math.floor(r() * 4);
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * Math.PI * 2 + r() * 0.8;
    const d = 38 + r() * 34, rad = 14 + r() * 24;
    ctx.beginPath(); ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, rad, 0, Math.PI * 2); ctx.fill();
  }
  // paint drips running "down" the texture
  const drips = 2 + Math.floor(r() * 3);
  for (let i = 0; i < drips; i++) {
    const dx = cx - 46 + r() * 92, top = cy + 20 + r() * 26, len = 26 + r() * 52, w = 5 + r() * 5;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(dx - w / 2, top, w, len, w / 2); // older iOS: plain rect
    else ctx.rect(dx - w / 2, top, w, len);
    ctx.fill();
    ctx.beginPath(); ctx.arc(dx, top + len, w * 0.75, 0, Math.PI * 2); ctx.fill();
  }
  // overspray speckles
  for (let i = 0; i < 46; i++) {
    const a = r() * Math.PI * 2, d = 62 + r() * 58;
    ctx.globalAlpha = 0.35 + r() * 0.5;
    ctx.beginPath(); ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1.2 + r() * 3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // subtle darker core for depth
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = 'rgba(0,0,0,0.14)';
  ctx.beginPath(); ctx.arc(cx + 10, cy + 10, 40, 0, Math.PI * 2); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const CHALK_TINTS = ['#ffffff', '#ffe9f3', '#e8f6ff', '#fdf6d8', '#eaffe9'];
function chalkTexture(seed) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const r = rng(seed);
  const tint = CHALK_TINTS[Math.floor(r() * CHALK_TINTS.length)];
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // hand-drawn wobble: jittered polylines; jitter is seeded per-pass so the
  // shadow pass traces the same wobble as the chalk pass
  const kind = Math.floor(r() * 4); // star / heart / smiley / arrow
  const jseed = r() * 1000;
  const drawShape = () => {
    const jr = rng(jseed);
    const wobbly = (pts, close) => {
      ctx.beginPath();
      const j = (v) => v + (jr() - 0.5) * 7;
      ctx.moveTo(j(pts[0][0]), j(pts[0][1]));
      for (let i = 1; i < pts.length; i++) ctx.lineTo(j(pts[i][0]), j(pts[i][1]));
      if (close) ctx.closePath();
      ctx.stroke();
    };
    if (kind === 0) {                 // 5-point star
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? 38 : 92;
        pts.push([128 + Math.cos(a) * rad, 128 + Math.sin(a) * rad]);
      }
      wobbly(pts, true);
    } else if (kind === 1) {          // heart
      ctx.beginPath();
      ctx.moveTo(128, 205);
      ctx.bezierCurveTo(20, 120, 55, 38, 128, 92);
      ctx.bezierCurveTo(201, 38, 236, 120, 128, 205);
      ctx.stroke();
    } else if (kind === 2) {          // smiley
      ctx.beginPath(); ctx.arc(128, 128, 86, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(128, 150, 48, 0.25 * Math.PI, 0.75 * Math.PI); ctx.stroke();
      const lw = ctx.lineWidth; ctx.lineWidth = lw + 4;
      ctx.beginPath(); ctx.arc(96, 100, 5, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(160, 100, 5, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = lw;
    } else {                          // arrow
      wobbly([[40, 170], [170, 74]]);
      wobbly([[170, 74], [118, 78]]);
      wobbly([[170, 74], [168, 126]]);
    }
  };
  // soft dark under-shadow so pale chalk reads on light sandy paths
  ctx.save();
  ctx.translate(4, 5);
  ctx.strokeStyle = 'rgba(40,32,20,0.4)';
  ctx.lineWidth = 15;
  drawShape();
  ctx.restore();
  ctx.strokeStyle = tint;
  ctx.lineWidth = 12;
  drawShape();
  // chalk dust: grainy speckles along a soft halo
  ctx.fillStyle = tint;
  for (let i = 0; i < 90; i++) {
    ctx.globalAlpha = 0.10 + r() * 0.22;
    ctx.beginPath(); ctx.arc(20 + r() * 216, 20 + r() * 216, 0.8 + r() * 1.8, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------- lifecycle
function disposeDecal(d) {
  if (d.mesh.parent) d.mesh.parent.remove(d.mesh);
  if (d.mesh.material.map) d.mesh.material.map.dispose();
  d.mesh.material.dispose();               // geometry is shared — never disposed
  const i = live.indexOf(d);
  if (i >= 0) live.splice(i, 1);
  const j = state.decals.indexOf(d.entry);
  if (j >= 0) state.decals.splice(j, 1);
}

// Spawn (or restore) a decal. `entry` may come from a save file; when
// persist=false it is assumed to already be inside state.decals.
export function spawnDecal(entry, { persist = true } = {}) {
  if (!getRoot) return null;
  const root = getRoot(entry.locKey);
  if (!root) return null;
  if (!entry.createdAt) entry.createdAt = Date.now();
  if (entry.seed === undefined) entry.seed = Math.random();

  while (live.length >= MAX_DECALS) disposeDecal(live[0]); // evict oldest

  const r = rng(entry.seed + 0.137);
  const tex = entry.kind === 'chalk' ? chalkTexture(entry.seed) : sprayTexture(entry.color || '#ff5fa2', entry.seed);
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    opacity: BASE_OPACITY[entry.kind] ?? 0.9,
  });
  const mesh = new THREE.Mesh(sharedGeo, mat);
  mesh.userData.isDecal = true;
  const size = 0.9 + r() * 0.5;                       // 0.9–1.4u
  mesh.scale.setScalar(size);
  const n = new THREE.Vector3().fromArray(entry.normal).normalize();
  mesh.position.fromArray(entry.pos).addScaledVector(n, 0.015);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
  mesh.rotateZ(r() * Math.PI * 2);                    // random spin around the normal
  root.add(mesh);

  const d = { mesh, entry };
  live.push(d);
  if (persist) {
    state.decals.push(entry);
    while (state.decals.length > MAX_DECALS) {
      const dropped = state.decals[0];
      const l = live.find(x => x.entry === dropped);
      if (l) disposeDecal(l); else state.decals.shift();
    }
    save();
  }
  return d;
}

// Boot/restore: drop expired saved decals, respawn the rest into their
// (possibly currently hidden) location roots.
export function initDecals(rootAccessor) {
  getRoot = rootAccessor;
  const now = Date.now();
  const keep = (state.decals || []).filter(e =>
    e && Array.isArray(e.pos) && Array.isArray(e.normal) && getRoot(e.locKey) &&
    (now - e.createdAt) / 1000 < (DECAL_LIFETIMES[e.kind] || 0));
  state.decals = keep.slice(-MAX_DECALS);
  for (const e of state.decals) spawnDecal(e, { persist: false });
  save();
}

// Fade the tail of each decal's life and dispose expired ones. Cheap enough to
// run every frame (24 decals max), but callers may throttle.
export function tickDecals() {
  if (!live.length) return;
  const now = Date.now();
  for (let i = live.length - 1; i >= 0; i--) {
    const d = live[i], e = d.entry;
    const life = DECAL_LIFETIMES[e.kind] || 180;
    const age = (now - e.createdAt) / 1000;
    if (age >= life) { disposeDecal(d); save(); continue; }
    const remain = life - age, fadeWin = life * 0.3; // opacity ramps down over the last 30%
    const base = BASE_OPACITY[e.kind] ?? 0.9;
    d.mesh.material.opacity = remain < fadeWin ? base * (remain / fadeWin) : base;
  }
}

export function clearAll() {
  while (live.length) disposeDecal(live[0]);
  state.decals = [];
  save();
}

export function decalCount() { return live.length; }
export function liveDecals() { return live; } // debug/tests

// ---------------------------------------------------------------- placement
// Raycast from the player's chest along their facing (with a slight downward
// tilt) into the current location's meshes; stick the decal on the first real
// surface within 4u. Chalk is ground-only: it always lands flat at the
// player's feet-front, as does spray when no wall is in range.
const _ray = new THREE.Raycaster();
const _fwd = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _norm = new THREE.Vector3();
const _meshes = [];  // reused scratch list (raycast Meshes only — Sprites need a camera and glow quads should never catch paint)

function hitIsValid(hit, root) {
  if (!hit.face || !hit.object.isMesh) return false;
  for (let o = hit.object; o && o !== root; o = o.parent) {
    if (o.visible === false) return false;         // pooled/hidden fx meshes
    if (o.userData.isDecal) return false;          // never stack raycasts on decals
    if (o.userData.animate || o.userData.legs) return false; // pets/NPCs
  }
  return true;
}

export function placeDecalFromPlayer(player, locKey, { kind, color }) {
  if (!getRoot) return null;
  const root = getRoot(locKey);
  if (!root) return null;
  _fwd.set(Math.sin(player.rotation.y), 0, Math.cos(player.rotation.y));
  const entry = { locKey, kind, color: color || null, createdAt: Date.now(), seed: Math.random() };

  if (kind !== 'chalk') {
    _origin.copy(player.position); _origin.y += 1.0;
    _ray.set(_origin, _fwd.clone().add(new THREE.Vector3(0, -0.18, 0)).normalize());
    _ray.far = 4;
    _meshes.length = 0;
    root.traverse(o => { if (o.isMesh) _meshes.push(o); });
    const hits = _ray.intersectObjects(_meshes, false);
    _meshes.length = 0;
    for (const h of hits) {
      if (!hitIsValid(h, root)) continue;
      _norm.copy(h.face.normal).transformDirection(h.object.matrixWorld).normalize();
      if (_norm.dot(_ray.ray.direction) > 0) _norm.negate(); // face the player side
      entry.pos = [h.point.x, h.point.y, h.point.z];
      entry.normal = [_norm.x, _norm.y, _norm.z];
      return spawnDecal(entry);
    }
  }
  // fallback / chalk: flat on the ground 1.2u in front of the player
  entry.pos = [player.position.x + _fwd.x * 1.2, player.position.y + 0.02, player.position.z + _fwd.z * 1.2];
  entry.normal = [0, 1, 0];
  return spawnDecal(entry);
}
