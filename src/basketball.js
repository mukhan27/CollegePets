// 3D first-person basketball mini-game. Reuses the shared WebGL renderer but
// renders its own scene/camera. Controls: joystick = move (relative to facing),
// right-drag = look/aim, SHOOT (hold-to-time the meter), PASS (kick to the open
// teammate), JUMP (dunk near the rim / block on defense).

import * as THREE from 'three';
import { input } from './input.js';
import { addCoins } from './state.js';
import { showModal } from './ui.js';

const $ = (id) => document.getElementById(id);
const G = 21;                  // gravity
const RIMY = 3.05, HOOPX = 12.5, RIMR = 0.42;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angDiff = (a, b) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

// velocity to throw from P to T at launch elevation `angleDeg` under gravity G
function launchVel(P, T, angleDeg) {
  const dx = T.x - P.x, dz = T.z - P.z;
  const d = Math.hypot(dx, dz) || 0.001;
  const h = T.y - P.y;
  const a = angleDeg * Math.PI / 180, ca = Math.cos(a), ta = Math.tan(a);
  const denom = 2 * ca * ca * (d * ta - h);
  if (denom <= 0.01) return null;
  const v = Math.sqrt(G * d * d / denom);
  return new THREE.Vector3(dx / d * v * ca, v * Math.sin(a), dz / d * v * ca);
}

export function createBasketball(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x16222e);
  const camera = new THREE.PerspectiveCamera(74, 1, 0.1, 300);

  scene.add(new THREE.HemisphereLight(0xdfeaf4, 0x222a30, 1.0));
  const sun = new THREE.DirectionalLight(0xfff4e2, 1.0); sun.position.set(12, 30, 8); scene.add(sun);

  const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
  const box = (w, h, d, c, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(c)); m.position.set(x, y, z); return m; };

  // ---- court ----
  const CL = 28, CW = 15;
  { const f = new THREE.Mesh(new THREE.PlaneGeometry(CL + 8, CW + 8), lam(0xc89a5e)); f.rotation.x = -Math.PI / 2; f.receiveShadow = true; scene.add(f); }
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xf2efe6 });
  const addLine = (w, d, x, z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lineMat); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.02, z); scene.add(m); };
  addLine(CL, 0.16, 0, -CW / 2); addLine(CL, 0.16, 0, CW / 2); addLine(0.16, CW, -CL / 2, 0); addLine(0.16, CW, CL / 2, 0); addLine(0.22, CW, 0, 0);
  { const c = new THREE.Mesh(new THREE.RingGeometry(1.7, 1.85, 28), lineMat); c.rotation.x = -Math.PI / 2; c.position.y = 0.02; scene.add(c); }
  for (const s of [-1, 1]) { const arc = new THREE.Mesh(new THREE.RingGeometry(6.0, 6.18, 30, 1, s > 0 ? Math.PI / 2 : -Math.PI / 2, Math.PI), lineMat); arc.rotation.x = -Math.PI / 2; arc.position.set(s * HOOPX, 0.02, 0); scene.add(arc); }
  for (const [w, d, x, z] of [[CL + 10, 0.5, 0, -CW / 2 - 3], [CL + 10, 0.5, 0, CW / 2 + 3], [0.5, CW + 7, -CL / 2 - 3, 0], [0.5, CW + 7, CL / 2 + 3, 0]]) scene.add(box(w, 8, d, 0x223444, x, 4, z));

  // ---- hoops (dir +1 = +x end; rim faces into the court) ----
  function makeHoop(dir) {
    const g = new THREE.Group();
    g.add(box(0.18, 4.4, 0.18, 0x46505a, dir * 0.45, 2.2, 0));
    g.add(box(0.12, 1.7, 2.6, 0xeef2f6, dir * 0.2, 4.0, 0));
    g.add(box(0.14, 0.8, 1.0, 0xe07840, dir * 0.13, 3.75, 0));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.05, 8, 18), lam(0xd64541));
    rim.rotation.x = Math.PI / 2; rim.position.set(-dir * 0.3, RIMY, 0); g.add(rim);
    const net = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.26, 0.55, 8, 3, true),
      new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.75 }));
    net.position.set(-dir * 0.3, RIMY - 0.3, 0); g.add(net);
    g.position.set(dir * HOOPX, 0, 0); scene.add(g);
    return { center: new THREE.Vector3(dir * HOOPX - dir * 0.3, RIMY, 0), boardX: dir * HOOPX + dir * 0.2, dir };
  }
  const hoopR = makeHoop(1), hoopL = makeHoop(-1); // player attacks hoopR

  // ---- ball + figures ----
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 14), lam(0xe07a33)); scene.add(ball);
  function figure(c) {
    const g = new THREE.Group();
    const add = (geo, col, x, y, z) => { const m = new THREE.Mesh(geo, lam(col)); m.position.set(x, y, z); g.add(m); };
    add(new THREE.CylinderGeometry(0.34, 0.4, 1.2, 10), c, 0, 1.0, 0);
    add(new THREE.SphereGeometry(0.31, 12, 10), 0xf0c49a, 0, 1.85, 0);
    for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.12, 0.12, 0.95, 8), c, s * 0.46, 1.1, 0);
    for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.15, 0.13, 0.95, 8), 0x2a3340, s * 0.18, 0.45, 0);
    scene.add(g); return g;
  }
  const defFig = figure(0xd14b4b), tmFig = figure(0x4b8fd1);

  // ---- state ----
  const player = { pos: new THREE.Vector3(-6, 0, 0), yaw: 0, pitch: -0.12, y: 0, vy: 0, onGround: true };
  const defender = { pos: new THREE.Vector3(0, 0, 0) };
  const teammate = { pos: new THREE.Vector3(7, 0, 5) };
  const bs = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), inAir: false };
  let phase = 'offense';   // offense | shooting | passing | defense | over
  let holder = 'player';   // player | def | tm | null
  let charging = false, meter = 0, meterDir = 1;
  let score = 0, oppScore = 0, makes = 0, timeLeft = 60;
  let shot = null;         // { target:'R'|'L', points, scored }
  let msgT = 0, pass = null, defState = null;
  let onExit = null, started = false;

  // ---- helpers ----
  const setMsg = (t, dur = 1.2) => { $('bball-msg').textContent = t; msgT = t ? dur : 0; };
  function handPos() { const c = Math.cos(player.yaw), s = Math.sin(player.yaw); return new THREE.Vector3(player.pos.x + c * 0.5, 1.7 + player.y, player.pos.z + s * 0.5); }
  function contestInfo() {
    const d = Math.hypot(defender.pos.x - player.pos.x, defender.pos.z - player.pos.z);
    const toHoop = Math.atan2(hoopR.center.z - player.pos.z, hoopR.center.x - player.pos.x);
    const toDef = Math.atan2(defender.pos.z - player.pos.z, defender.pos.x - player.pos.x);
    const inFront = Math.abs(angDiff(toHoop, toDef)) < 0.9;
    return { dist: d, contested: d < 2.4 && inFront };
  }

  function newOffense(keep) {
    phase = 'offense'; holder = 'player'; bs.inAir = false; pass = null; defState = null;
    player.pos.set(-5 - Math.random() * 4, 0, (Math.random() - 0.5) * 8); player.y = 0; player.vy = 0; player.onGround = true;
    defender.pos.set(player.pos.x + 3, 0, player.pos.z + (Math.random() - 0.5) * 3);
    teammate.pos.set(6 + Math.random() * 3, 0, (Math.random() > 0.5 ? 1 : -1) * (4 + Math.random() * 2));
  }
  function startDefense() {
    phase = 'defense'; holder = 'def'; bs.inAir = false;
    defender.pos.set(2, 0, (Math.random() - 0.5) * 6);
    defState = { t: 0, windup: 0, shooting: false };
  }

  // ---- shooting ----
  function launchShot(from, rim, q, points, target) {
    const err = clamp(1 - q, 0, 1);
    const t = rim.center.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.45), (Math.random() - 0.5) * 2).multiplyScalar(err * 1.25));
    let v = launchVel(from, t, 54) || launchVel(from, t, 40) || new THREE.Vector3(rim.center.x - from.x, 6, rim.center.z - from.z);
    bs.pos.copy(from); bs.vel.copy(v); bs.inAir = true; holder = null;
    shot = { target, points, scored: false };
    phase = 'shooting';
  }
  function shoot() {
    if (phase !== 'offense' || holder !== 'player' || !charging) return;
    charging = false; $('bball-meter').classList.add('hidden');
    const dist = Math.hypot(hoopR.center.x - player.pos.x, hoopR.center.z - player.pos.z);
    const toHoop = Math.atan2(hoopR.center.z - player.pos.z, hoopR.center.x - player.pos.x);
    const facingF = clamp(1 - Math.abs(angDiff(player.yaw, toHoop)) / 1.0, 0.25, 1);
    const { dist: dd, contested } = contestInfo();
    const sweet = 0.82, tol = clamp(0.34 - dist * 0.012 - (contested ? 0.07 : 0), 0.08, 0.34);
    const meterF = clamp(1 - Math.abs(meter - sweet) / tol, 0, 1);
    const q = meterF * facingF * (contested ? 0.7 : 1);
    if (contested && dd < 1.6 && q < 0.45 && Math.random() < 0.5) { setMsg('BLOCKED!'); newOffenseSoon(); bounceOff(); return; }
    launchShot(handPos(), hoopR, q, dist > 6.0 ? 3 : 2, 'R');
  }
  function bounceOff() { bs.pos.copy(handPos()); bs.vel.set((Math.random() - 0.5) * 4, 3, (Math.random() - 0.5) * 4); bs.inAir = true; holder = null; shot = { target: 'R', points: 0, scored: false }; phase = 'shooting'; }
  let resetTimer = 0, resetFn = null;
  const newOffenseSoon = (def) => { resetTimer = 1.1; resetFn = def ? startDefense : newOffense; };

  function jump() {
    if (phase === 'offense' && holder === 'player') {
      const d = Math.hypot(hoopR.center.x - player.pos.x, hoopR.center.z - player.pos.z);
      if (d < 3.4) { setMsg('DUNK! +2'); launchShot(new THREE.Vector3(hoopR.center.x - 0.6, 3.0, hoopR.center.z), hoopR, 1, 2, 'R'); player.vy = 6; player.onGround = false; return; }
    }
    if (phase === 'defense' && defState && defState.shooting) {
      const d = Math.hypot(defender.pos.x - player.pos.x, defender.pos.z - player.pos.z);
      if (d < 2.6) { defState.blocked = true; setMsg('BLOCK! Steal +1'); }
    }
    if (player.onGround) { player.vy = 7; player.onGround = false; }
  }
  function doPass() {
    if (phase !== 'offense' || holder !== 'player') return;
    const { contested } = contestInfo();
    pass = { stage: 'fly', t: 0, contested };
    bs.pos.copy(handPos()); bs.inAir = false; holder = 'tm-fly'; phase = 'passing';
    setMsg('Pass!');
  }

  // ---- per-frame ----
  function updateMovement(dt) {
    if ((phase === 'offense' || phase === 'defense') && input.active) {
      const c = Math.cos(player.yaw), s = Math.sin(player.yaw), fwd = -input.y, st = input.x;
      player.pos.x = clamp(player.pos.x + (c * fwd + s * st) * 7 * dt, -13.5, 13.5);
      player.pos.z = clamp(player.pos.z + (s * fwd - c * st) * 7 * dt, -7, 7);
    }
    if (!player.onGround) { player.vy -= G * dt; player.y += player.vy * dt; if (player.y <= 0) { player.y = 0; player.vy = 0; player.onGround = true; } }
    player.yaw = input.camYaw; player.pitch = clamp(-0.12 + input.camPitch, -1.0, 0.5);
  }
  function updateCamera() {
    const eye = 1.65 + player.y;
    camera.position.set(player.pos.x, eye, player.pos.z);
    const cp = Math.cos(player.pitch);
    camera.lookAt(player.pos.x + Math.cos(player.yaw) * cp, eye + Math.sin(player.pitch), player.pos.z + Math.sin(player.yaw) * cp);
  }
  function updateBallHold() {
    if (holder === 'player') { const c = Math.cos(player.yaw), s = Math.sin(player.yaw); ball.position.set(player.pos.x + c * 0.65, 1.25 + player.y, player.pos.z + s * 0.65); }
    else if (holder === 'def') ball.position.set(defender.pos.x, 1.5, defender.pos.z);
    else if (holder === 'tm') ball.position.set(teammate.pos.x, 1.5, teammate.pos.z);
  }
  function simBall(dt) {
    const prevY = bs.pos.y;
    bs.vel.y -= G * dt;
    bs.pos.addScaledVector(bs.vel, dt);
    // backboard bounce
    for (const h of [hoopR, hoopL]) { if (Math.abs(bs.pos.x - h.boardX) < 0.3 && bs.pos.y > RIMY && bs.pos.y < 4.7 && Math.abs(bs.pos.z) < 1.3 && Math.sign(bs.vel.x) === h.dir) bs.vel.x *= -0.5; }
    // score
    for (const [h, tag] of [[hoopR, 'R'], [hoopL, 'L']]) {
      if (bs.vel.y < 0 && prevY >= h.center.y && bs.pos.y < h.center.y) {
        const dx = bs.pos.x - h.center.x, dz = bs.pos.z - h.center.z;
        if (dx * dx + dz * dz < RIMR * RIMR && shot && !shot.scored) onScore(tag);
      }
    }
    ball.position.copy(bs.pos);
    if (bs.pos.y <= 0.24) { bs.pos.y = 0.24; ball.position.copy(bs.pos); onLand(); }
  }
  function onScore(tag) {
    shot.scored = true;
    if (tag === 'R' && shot.target === 'R') { score += shot.points; makes++; setMsg('SWISH! +' + shot.points, 1.4); newOffenseSoon(false); }
    else if (tag === 'L' && shot.target === 'L') { oppScore += 2; setMsg('They score'); newOffenseSoon(false); }
  }
  function onLand() {
    bs.inAir = false;
    if (shot && !shot.scored) {
      if (shot.target === 'R') { setMsg(shot.points === 0 ? 'Off the mark' : 'Miss — rebound', 1.1); newOffenseSoon(true); } // missed → you defend
      else { setMsg('They miss'); newOffenseSoon(false); }
    }
  }
  function updateDefender(dt) {
    // slide to stay between the player and the basket
    const guard = new THREE.Vector3(player.pos.x + 1.8, 0, player.pos.z + clamp(0, -1, 1));
    guard.x = Math.min(guard.x, hoopR.center.x - 1);
    defender.pos.x += clamp(guard.x - defender.pos.x, -1, 1) * 4 * dt;
    defender.pos.z += clamp(player.pos.z - defender.pos.z, -1, 1) * 4 * dt;
  }
  function updateOppOffense(dt) {
    const d = defState; const targetX = -8;
    if (!d.shooting) {
      defender.pos.x += clamp(targetX - defender.pos.x, -1, 1) * 5 * dt;
      defender.pos.z += clamp(0 - defender.pos.z, -1, 1) * 5 * dt;
      if (defender.pos.x < targetX + 1) { d.shooting = true; d.windup = 0; }
    } else {
      d.windup += dt;
      if (d.windup > 1.1) {
        if (d.blocked) { setMsg('Stolen! +1 — your ball', 1.4); score += 1; makes++; newOffense(); }
        else { launchShot(new THREE.Vector3(defender.pos.x, 1.7, defender.pos.z), hoopL, 0.85, 2, 'L'); }
      }
    }
  }
  function updatePass(dt) {
    pass.t += dt;
    if (pass.stage === 'fly') {
      const tm = new THREE.Vector3(teammate.pos.x, 1.45, teammate.pos.z);
      ball.position.lerp(tm, Math.min(1, dt * 7));
      bs.pos.copy(ball.position);
      if (ball.position.distanceTo(tm) < 0.4) { pass.stage = 'shoot'; holder = 'tm';
        const dist = Math.hypot(hoopR.center.x - teammate.pos.x, hoopR.center.z - teammate.pos.z);
        launchShot(new THREE.Vector3(teammate.pos.x, 1.8, teammate.pos.z), hoopR, pass.contested ? 0.95 : 0.7, dist > 6 ? 3 : 2, 'R');
      }
    }
  }

  function tickMeter(dt) { if (charging) { meter += meterDir * dt * 1.5; if (meter > 1) { meter = 1; meterDir = -1; } if (meter < 0) { meter = 0; meterDir = 1; }
    $('bball-fill').style.width = (meter * 100) + '%'; } }

  function updateHUD() {
    $('bball-score').textContent = `You ${score} · Opp ${oppScore}`;
    $('bball-time').textContent = '⏱ ' + Math.max(0, Math.ceil(timeLeft));
  }

  function update(dt) {
    if (phase === 'over') return;
    if (charging && phase !== 'offense') { charging = false; $('bball-meter').classList.add('hidden'); }
    timeLeft -= dt;
    if (timeLeft <= 0) return endGame();
    if (resetTimer > 0) { resetTimer -= dt; if (resetTimer <= 0 && resetFn) { const f = resetFn; resetFn = null; f(); } }
    updateMovement(dt); tickMeter(dt);
    if (phase === 'passing' && pass) updatePass(dt);
    if (phase === 'defense' && defState) updateOppOffense(dt);
    else if (phase === 'offense' || phase === 'shooting') updateDefender(dt);
    if (bs.inAir) simBall(dt); else updateBallHold();
    defFig.position.set(defender.pos.x, 0, defender.pos.z);
    tmFig.position.set(teammate.pos.x, 0, teammate.pos.z);
    tmFig.visible = (phase === 'offense' || phase === 'passing');
    updateCamera();
    if (msgT > 0) { msgT -= dt; if (msgT <= 0) setMsg(''); }
  }

  function endGame() {
    phase = 'over';
    const coins = score * 4 + makes;
    addCoins(coins);
    $('bball-hud').classList.add('hidden');
    showModal('🏀 Final whistle!', `You scored <b>${score}</b> (opp ${oppScore}) on <b>${makes}</b> made baskets.<br>Reward: <b>🪙 ${coins}</b>`, [{ label: 'Nice', onClick: () => { if (onExit) onExit(); } }]);
  }

  // ---- buttons (wired once) ----
  function wire() {
    const sb = $('bball-shoot');
    sb.addEventListener('pointerdown', (e) => { e.preventDefault(); if (phase === 'offense' && holder === 'player') { charging = true; meter = 0; meterDir = 1; $('bball-meter').classList.remove('hidden'); } });
    const release = (e) => { if (e) e.preventDefault(); if (charging) shoot(); };
    sb.addEventListener('pointerup', release); sb.addEventListener('pointerleave', release); sb.addEventListener('pointercancel', release);
    $('bball-pass').addEventListener('click', doPass);
    $('bball-jump').addEventListener('click', jump);
    $('bball-quit').addEventListener('click', () => endGame());
  }
  wire();

  function resize() { const w = window.innerWidth, h = window.innerHeight; camera.aspect = w / h; camera.updateProjectionMatrix(); }
  window.addEventListener('resize', () => { if (active()) resize(); });
  let _active = false; const active = () => _active;

  function enter(cb) {
    onExit = cb; _active = true; started = true;
    score = 0; oppScore = 0; makes = 0; timeLeft = 60; charging = false;
    shot = null; pass = null; defState = null; resetTimer = 0; resetFn = null; msgT = 0; setMsg('');
    input.camYaw = 0; input.camPitch = 0;
    newOffense(false);
    $('bball-meter').classList.add('hidden');
    $('bball-hud').classList.remove('hidden');
    $('hud').classList.add('playing-bball');
    resize();
  }
  function exit() { _active = false; input.camYaw = 0; input.camPitch = 0; $('bball-hud').classList.add('hidden'); $('hud').classList.remove('playing-bball'); }

  return { scene, camera, enter, exit, update, resize, active };
}
