// Cup Pong — a 3D physics beer-pong game rendered in the main toon scene (like
// basketball), so it matches the art. Swipe up to flick the ball: the swipe is
// the launch velocity (strength = distance, angle = left/right). Real physics —
// the ball arcs, bounces off the table and cup rims, and drops into cups. You vs
// an AI; clear the far rack to win. No aim assist.

import * as THREE from 'three';
import { toonMat } from './textures.js';
import { addCoins } from './state.js';
import { showModal } from './ui.js';
import { track, applyNeeds } from './systems.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TABLE_ORIGIN = new THREE.Vector3(0, 0, 150); // off in empty space; camera goes here to play
const TTOP = 1.0;     // table-top height (local)
const R = 0.12;       // ball radius
const GRAV = 9;       // gravity
const CUP_R = 0.225;  // cup mouth radius
const CUP_H = 0.5;    // cup height
const MOUTH_Y = TTOP + CUP_H;

export function createCupPong(scene) {
  const group = new THREE.Group(); group.visible = false; group.position.copy(TABLE_ORIGIN); scene.add(group);
  const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };

  // ---- table ----
  const top = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.22, 8.2), toonMat(0x1c2533));
  top.position.y = TTOP - 0.11; top.receiveShadow = true; group.add(top);
  for (const sx of [-1.45, 1.45]) for (const sz of [-3.7, 3.7])
    group.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.18, TTOP - 0.22, 0.18), toonMat(0x3a2a1c)), sx, (TTOP - 0.22) / 2, sz));
  const line = toonMat(0xf2f2ee), ly = TTOP + 0.005;
  group.add(at(new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.02, 0.07), line), 0, ly, -4.0));
  group.add(at(new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.02, 0.07), line), 0, ly, 4.0));
  group.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.02, 8.0), line), -1.5, ly, 0));
  group.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.02, 8.0), line), 1.5, ly, 0));
  group.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 8.0), line), 0, ly, 0));

  // ---- cups ----
  function makeCupMesh() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(CUP_R, CUP_R - 0.06, CUP_H, 18, 1, true), toonMat(0xcf2a25));
    body.position.y = CUP_H / 2; body.castShadow = true; g.add(body);
    g.add(at(new THREE.Mesh(new THREE.CircleGeometry(CUP_R - 0.06, 16), toonMat(0xcf2a25)).rotateX(-Math.PI / 2), 0, 0.005, 0));
    g.add(at(new THREE.Mesh(new THREE.CircleGeometry(CUP_R - 0.03, 16), toonMat(0x5e120e)).rotateX(-Math.PI / 2), 0, CUP_H - 0.04, 0)); // dark interior
    const rim = new THREE.Mesh(new THREE.TorusGeometry(CUP_R, 0.028, 8, 22), toonMat(0xf4f4f0));
    rim.rotation.x = Math.PI / 2; rim.position.y = CUP_H; g.add(rim);
    return g;
  }
  const cups = [];
  function rack(team, baseZ, dir) {
    const sx = 0.5, sz = 0.47;
    for (let i = 0; i < 3; i++) { const count = 3 - i, z = baseZ + dir * i * sz;
      for (let j = 0; j < count; j++) { const x = (j - (count - 1) / 2) * sx;
        const mesh = makeCupMesh(); mesh.position.set(x, TTOP, z); group.add(mesh);
        cups.push({ mesh, x, z, alive: true, team }); } }
  }
  rack('opp', -3.3, 1);   // far end, apex toward centre
  rack('you', 3.3, -1);   // near end

  const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(R, 20, 16), toonMat(0xf6f4ec));
  ballMesh.castShadow = true; ballMesh.visible = false; group.add(ballMesh);

  // ---- state ----
  let ball = null, turn = 'you', aiT = 0, over = false, active = false, onExit = null, msgT = 0, msg = '';
  let drag = null, onDown, onMove, onUp;

  const setMsg = (t, d = 1.1) => { msg = t; msgT = d; $('cuppong-msg').textContent = t; };

  function throwSwipe(ux, uy) {
    if (uy < 30) { setMsg('Swipe up to throw', 0.8); return; }
    // fixed arc; forward speed scales linearly with the swipe length (less sensitive,
    // and a long swipe lands in the cups rather than sailing off the table)
    const un = clamp(uy / (window.innerHeight * 0.82), 0.08, 1.0);
    const sn = clamp(ux / (window.innerHeight * 0.82), -0.6, 0.6);
    ball = { x: 0, y: TTOP + 0.18, z: 4.0, vx: sn * 3.5, vy: 4.8, vz: -un * 8.9, t: 0, rest: 0, bounced: false };
    ballMesh.visible = true; ballMesh.position.set(ball.x, ball.y, ball.z);
  }
  function aiThrow() {
    const targets = cups.filter(c => c.team === 'you' && c.alive);
    if (!targets.length) return;
    const c = targets[Math.floor(Math.random() * targets.length)];
    const T = 1.05, sx = 0, sy = TTOP + 0.4, sz = -3.9;
    const tx = c.x + (Math.random() - 0.5) * 0.4, tz = c.z + (Math.random() - 0.5) * 0.4;
    ball = { x: sx, y: sy, z: sz, vx: (tx - sx) / T, vy: (MOUTH_Y - sy) / T + 0.5 * GRAV * T, vz: (tz - sz) / T, t: 0, rest: 0, bounced: false };
    ballMesh.visible = true; ballMesh.position.set(sx, sy, sz);
    setMsg('Opponent throws…', 0.8);
  }

  function sink(c) {
    c.alive = false; c.mesh.visible = false; ball = null; ballMesh.visible = false;
    setMsg(turn === 'you' ? 'Splash! 🎯' : 'They sink one', 1.0);
    if (cups.filter(x => x.team === c.team && x.alive).length === 0) return endGame(c.team === 'opp');
    if (turn === 'opp') aiT = 0.7; // make → shoot again (you: turn stays, swipe re-enables)
  }
  function miss() {
    ball = null; ballMesh.visible = false;
    setMsg(turn === 'you' ? 'Missed!' : 'They miss', 0.9);
    turn = turn === 'you' ? 'opp' : 'you';
    if (turn === 'opp') aiT = 0.9;
  }

  function physics(dt) {
    const b = ball; b.t += dt; const prevY = b.y;
    b.vy -= GRAV * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    // table bounce (lively — must clear a cup rim so bank shots can drop in)
    if (b.vy < 0 && b.y - R <= TTOP && Math.abs(b.x) < 1.6 && b.z > -4.1 && b.z < 4.1) {
      b.y = TTOP + R; b.vy = -b.vy * 0.78; b.vx *= 0.88; b.vz *= 0.88; b.bounced = true;
    }
    // cup interactions — only the rack you're aiming at (you throw OVER your own cups)
    const targetTeam = turn === 'you' ? 'opp' : 'you';
    for (const c of cups) {
      if (!c.alive || c.team !== targetTeam) continue;
      const dx = b.x - c.x, dz = b.z - c.z, h = Math.hypot(dx, dz) || 0.0001;
      if (b.vy < 0 && prevY > MOUTH_Y && b.y <= MOUTH_Y) {           // crossing the mouth plane
        if (h < CUP_R - R * 0.5) { sink(c); return; }
        if (h < CUP_R + R) {                                          // rim-out bounce
          const nx = dx / h, nz = dz / h, s = Math.abs(b.vy) * 0.6;
          b.vx = nx * s + b.vx * 0.3; b.vz = nz * s + b.vz * 0.3; b.vy = Math.abs(b.vy) * 0.55; b.y = MOUTH_Y + R; b.bounced = true;
        }
      } else if (b.y < MOUTH_Y && h < CUP_R + R) {                   // hit the cup wall
        const nx = dx / h, nz = dz / h, pen = (CUP_R + R) - h;
        b.x += nx * pen; b.z += nz * pen;
        const vn = b.vx * nx + b.vz * nz; if (vn < 0) { b.vx -= 2 * vn * nx * 0.6; b.vz -= 2 * vn * nz * 0.6; } b.bounced = true;
      }
    }
    ballMesh.position.set(b.x, b.y, b.z); ballMesh.rotation.x -= dt * 6;
    const speed = Math.hypot(b.vx, b.vy, b.vz);
    if (b.y < TTOP - 2 || Math.abs(b.x) > 2.5 || b.z < -5.2 || b.z > 5.2) { miss(); return; }
    if (b.bounced && b.y <= TTOP + R + 0.05 && speed < 0.8) { b.rest += dt; if (b.rest > 0.25) miss(); } else b.rest = 0;
    if (b.t > 5) miss();
  }

  function update(dt) {
    if (msgT > 0) { msgT -= dt; if (msgT <= 0) $('cuppong-msg').textContent = (turn === 'you' && !ball ? 'Your throw' : ''); }
    if (over) return;
    if (!ball && turn === 'opp' && aiT > 0) { aiT -= dt; if (aiT <= 0) { aiT = 0; aiThrow(); } }
    if (ball) physics(dt);
    $('cuppong-you').textContent = '🐾 ' + cups.filter(c => c.team === 'you' && c.alive).length;
    $('cuppong-opp').textContent = cups.filter(c => c.team === 'opp' && c.alive).length + ' 🤖';
  }
  function cam() {
    const o = TABLE_ORIGIN; // steep ~40° look down the table so you see the cup mouths, not the sides
    return { px: o.x, py: o.y + 7.0, pz: o.z + 6.2, lx: o.x, ly: o.y + 0.9, lz: o.z - 1.0 };
  }

  // ---- input ----
  function bind() {
    const ov = $('cuppong-overlay');
    onDown = (e) => { if (turn !== 'you' || ball || over || e.target.id === 'cuppong-quit') return; e.preventDefault(); drag = { x0: e.clientX, y0: e.clientY }; };
    onMove = () => {};
    onUp = (e) => { if (!drag) return; const d = drag; drag = null; throwSwipe(e.clientX - d.x0, d.y0 - e.clientY); };
    ov.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }
  function unbind() {
    const ov = $('cuppong-overlay');
    if (onDown) ov.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  }

  function enter(cb) {
    onExit = cb; active = true; over = false; turn = 'you'; aiT = 0; ball = null; drag = null;
    for (const c of cups) { c.alive = true; c.mesh.visible = true; }
    ballMesh.visible = false; group.visible = true;
    $('cuppong-overlay').classList.remove('hidden');
    setMsg('Swipe up to throw! 🏓', 1.8);
    bind();
  }
  function exit() { active = false; group.visible = false; $('cuppong-overlay').classList.add('hidden'); unbind(); }
  function endGame(youWon) {
    if (over) return; over = true;
    $('cuppong-overlay').classList.add('hidden'); unbind();
    const left = cups.filter(c => c.team === 'opp' && c.alive).length;
    const coins = youWon ? 30 + (6 - left) * 2 : 8;
    addCoins(coins); applyNeeds({ fun: 18, social: 10 });
    if (youWon) track('games', 1);
    showModal('🥤 Cup Pong', (youWon ? 'You ran the table! 🏆' : 'You lost — rematch?') + `<br>Reward: <b>🪙 ${coins}</b>`, [{ label: 'Done', onClick: () => { if (onExit) onExit(); } }]);
  }

  $('cuppong-quit').addEventListener('click', () => {
    if (over) return; over = true; $('cuppong-overlay').classList.add('hidden'); unbind();
    if (onExit) onExit();
  });

  return { enter, exit, update, cam, isActive: () => active };
}
