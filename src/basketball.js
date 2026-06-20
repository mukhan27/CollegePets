// Basketball — a 2-on-2 half-court-feel pickup game in the campus toon scene
// with the normal 3rd-person follow camera. Inspired by NBA 2K / Hoop Land:
// shots are decided by a realistic make-% (release timing × contest × shot type
// & distance), misses brick into live rebounds, defense actually contests, and
// possession NEVER teleports players — the ball flows (makes inbound, misses are
// rebounded, steals/blocks are live). Entity-first so it can go multiplayer.

import * as THREE from 'three';
import { input } from './input.js';
import { addCoins, state } from './state.js';
import { showModal } from './ui.js';
import { track, applyNeeds } from './systems.js';
import { toonMat } from './textures.js';
import { createPet } from './petFactory.js';

const $ = (id) => document.getElementById(id);
const G = 16;
const SWEET = 0.81;            // centre of the green meter band
const HUMAN_SPD = 8.6, AI_SPD = 7.8, ACCEL = 9, JUMP_V = 6.3;
const GRAB = 1.25, SHOTCLOCK = 16, DIFF = 0.92; // DIFF = opponent shooting factor
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angDiff = (a, b) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
function launchVel(P, T, angleDeg) {
  const dx = T.x - P.x, dz = T.z - P.z, d = Math.hypot(dx, dz) || 0.001, h = T.y - P.y;
  const a = angleDeg * Math.PI / 180, ca = Math.cos(a), ta = Math.tan(a);
  const denom = 2 * ca * ca * (d * ta - h);
  if (denom <= 0.01) return null;
  const v = Math.sqrt(G * d * d / denom);
  return new THREE.Vector3(dx / d * v * ca, v * Math.sin(a), dz / d * v * ca);
}

export function createBasketball({ parent, court }) {
  const B = court.bounds, RIGHT = court.right, LEFT = court.left; // team A attacks RIGHT, team B attacks LEFT
  const CC = court.center;
  const group = new THREE.Group(); group.visible = false; parent.add(group);

  function makeNpc(type, teamColor) {
    const pet = createPet(type, {});
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.08, 8, 18), toonMat(teamColor));
    band.rotation.x = Math.PI / 2; band.position.y = 0.55; band.castShadow = true;
    pet.add(band);
    group.add(pet);
    return pet;
  }
  const BLUE = 0x3a78c8, RED = 0xd14b4b;
  const tmPet = makeNpc('dog', BLUE), e1Pet = makeNpc('bear', RED), e2Pet = makeNpc('cat', RED);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 14), toonMat(0xe07a33)); ball.castShadow = true; group.add(ball);
  const bs = { pos: new THREE.Vector3(), vel: new THREE.Vector3() };

  // ---- agents: one uniform shape for human + AI so logic is generic ----
  function agent(kind, team, mesh, attack, defend, seed) {
    return { kind, team, mesh, pos: kind === 'human' ? null : new THREE.Vector3(), attack, defend,
      vx: 0, vz: 0, jy: 0, vy: 0, jumping: false, seed, _moving: false,
      shootGather: 0, shootT: 0, stealCd: 0 };
  }
  const A0 = agent('human', 'A', null, RIGHT, LEFT, 0.0);
  const A1 = agent('ai', 'A', tmPet, RIGHT, LEFT, 1.3);
  const B0 = agent('ai', 'B', e1Pet, LEFT, RIGHT, 2.1);
  const B1 = agent('ai', 'B', e2Pet, LEFT, RIGHT, 3.7);
  const agents = [A0, A1, B0, B1];
  const teamA = [A0, A1], teamB = [B0, B1];

  // state
  let pl = null;
  let holder = A0, phase = 'play';      // play | shot | loose | pass | over
  let shot = null, passData = null, looseT = 0;
  let charging = false, meter = 0, meterDir = 1;   // shot charge meter (works on the ground or in the air)
  let scoreA = 0, scoreB = 0, makes = 0, timeLeft = 90, shotClock = SHOTCLOCK;
  let msgT = 0, pStealCool = 0;
  let onExit = null, active = false;

  const setMsg = (t, d = 1.1) => { $('bball-msg').textContent = t; msgT = t ? d : 0; };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const teamHas = (team) => holder && holder.team === team && phase === 'play';
  const matesOf = (a) => (a.team === 'A' ? teamA : teamB).filter(x => x !== a);
  const oppsOf = (a) => a.team === 'A' ? teamB : teamA;
  const nearestOpp = (a) => oppsOf(a).reduce((b, c) => dist(c.pos, a.pos) < dist(b.pos, a.pos) ? c : b);
  const rotOf = (a) => a.kind === 'human' ? pl.rotation.y : a.mesh.rotation.y;
  const handPoint = (a) => { const r = rotOf(a); return new THREE.Vector3(a.pos.x + Math.sin(r) * 0.45, 1.6 + a.jy, a.pos.z + Math.cos(r) * 0.45); };
  const nearestAgentToBall = () => agents.reduce((b, c) => dist(c.pos, bs.pos) < dist(b.pos, bs.pos) ? c : b);

  function giveBall(a, msg) {
    holder = a; phase = 'play'; shot = null; passData = null;
    shotClock = SHOTCLOCK; a.shootGather = 0; a.shootT = 0;
    if (msg) setMsg(msg, 0.8);
  }
  function turnover() {
    const a = oppsOf(holder).reduce((b, c) => dist(c.pos, bs.pos) < dist(b.pos, bs.pos) ? c : b);
    giveBall(a, 'Shot clock!');
  }

  // ---- shot resolution (the heart of the skill) ----
  function resolveShot(shooter, isDunk = false) {
    const hoop = shooter.attack;
    const d = dist(shooter.pos, hoop);
    const type = (isDunk || d < 2.0) ? 'rim' : d < 6.8 ? 'mid' : 'three';
    const base = type === 'rim' ? (isDunk ? 0.93 : 0.7) : type === 'mid' ? 0.45 : 0.33;
    const points = type === 'three' ? 3 : 2;
    // release timing
    let timing, label = '';
    if (shooter.kind === 'human') {
      const e = Math.abs(meter - SWEET);
      timing = e < 0.035 ? 1.0 : e < 0.09 ? 0.82 : e < 0.16 ? 0.5 : 0.2;
      label = e < 0.035 ? 'GREEN!' : (meter > SWEET ? 'Late' : 'Early');
    } else {
      timing = 0.66 + Math.random() * 0.34;
    }
    // contest from the nearest defender
    const def = nearestOpp(shooter), dd = dist(def.pos, shooter.pos);
    const elevated = shooter.kind === 'human' && shooter.jy > 0.25; // shooting out of your own jump
    let contest = dd > 3.2 ? 1.0 : dd > 2.2 ? 0.82 : dd > 1.4 ? 0.58 : 0.36;
    if (def.jumping && dd < 2.2) contest *= 0.6;          // hand in the face
    if (elevated) contest = Math.min(1, contest + 0.12);  // a jump shot rises over the closeout
    // facing the rim (turnaround/fadeaway penalty) + shooting on the move
    const toH = Math.atan2(hoop.z - shooter.pos.z, hoop.x - shooter.pos.x);
    const face = clamp(1 - Math.abs(angDiff(rotOf(shooter), toH)) / 2.4, 0.55, 1);
    const movePen = Math.hypot(shooter.vx, shooter.vz) > 4 ? 0.86 : 1;
    let pct = base * timing * contest * face * movePen;
    if (shooter.team === 'B') pct *= DIFF;
    pct = clamp(pct, 0.03, 0.95);
    // block on a smothered, mistimed shot (a jump shot is harder to block)
    let blocked = dd < 1.3 && def.jumping && timing < 0.55 && Math.random() < 0.55;
    if (blocked && elevated && Math.random() < 0.6) blocked = false;
    const make = !blocked && Math.random() < pct;

    const from = handPoint(shooter);
    phase = 'shot'; holder = null; charging = false; $('bball-meter').classList.add('hidden');
    if (blocked) { setMsg('BLOCKED! 🚫', 1.1); knockLoose(from); return; }
    shot = { team: shooter.team, hoop, points, willScore: make, type };
    const target = make
      ? new THREE.Vector3(hoop.x, hoop.y, hoop.z)
      : new THREE.Vector3(hoop.x + (Math.random() - 0.5) * 1.2, hoop.y + 0.05, hoop.z + (Math.random() - 0.5) * 1.2);
    const v = launchVel(from, target, type === 'rim' ? 47 : 53) || launchVel(from, target, 40) || new THREE.Vector3(target.x - from.x, 7, target.z - from.z);
    bs.pos.copy(from); bs.vel.copy(v);
    if (shooter.kind === 'human') setMsg(`${label}${make ? ' ✓' : ''}${contest < 0.6 ? ' · contested' : ''}`, 0.9);
  }
  function knockLoose(from) {
    bs.pos.copy(from); bs.vel.set((Math.random() - 0.5) * 4, 3.6, (Math.random() - 0.5) * 4);
    phase = 'loose'; looseT = 0; shot = null; holder = null;
  }

  // ---- ball simulation ----
  function simBall(dt) {
    if (phase === 'pass') return simPass(dt);
    const prevY = bs.pos.y;
    bs.vel.y -= G * dt; bs.pos.addScaledVector(bs.vel, dt);
    if (phase === 'shot' && shot) {
      const h = shot.hoop;
      if (bs.vel.y < 0 && prevY >= h.y && bs.pos.y < h.y) {
        const dxz = (bs.pos.x - h.x) ** 2 + (bs.pos.z - h.z) ** 2;
        if (shot.willScore && dxz < 0.5 * 0.5) { onScore(); return; }
        // brick off the rim → live rebound
        bs.vel.x = (bs.pos.x - h.x) * 2 + (Math.random() - 0.5) * 2.5;
        bs.vel.z = (bs.pos.z - h.z) * 2 + (Math.random() - 0.5) * 2.5;
        bs.vel.y = 3.0; phase = 'loose'; looseT = 0; shot = null; setMsg('Off the rim!', 0.7);
      }
    }
    if (bs.pos.y <= 0.24) { bs.pos.y = 0.24; bs.vel.y = Math.abs(bs.vel.y) * 0.5; bs.vel.x *= 0.7; bs.vel.z *= 0.7; if (phase === 'shot') { phase = 'loose'; looseT = 0; shot = null; } }
    if (bs.pos.x < B.minX || bs.pos.x > B.maxX) { bs.vel.x *= -0.6; bs.pos.x = clamp(bs.pos.x, B.minX, B.maxX); }
    if (bs.pos.z < B.minZ || bs.pos.z > B.maxZ) { bs.vel.z *= -0.6; bs.pos.z = clamp(bs.pos.z, B.minZ, B.maxZ); }
    ball.position.copy(bs.pos);
    if (phase === 'loose') {
      looseT += dt;
      if (bs.pos.y < 1.7 && looseT > 0.25) {
        const a = nearestAgentToBall();
        if (dist(a.pos, bs.pos) < GRAB) giveBall(a, a.team === 'A' ? 'Rebound!' : 'They rebound');
      }
      if (looseT > 6) giveBall(nearestAgentToBall());
    }
  }
  function simPass(dt) {
    const tgt = handPoint(passData.to);
    const dx = tgt.x - bs.pos.x, dy = tgt.y - bs.pos.y, dz = tgt.z - bs.pos.z, d = Math.hypot(dx, dy, dz);
    const step = Math.min(d, 17 * dt);
    if (d > 0.001) { bs.pos.x += dx / d * step; bs.pos.y += dy / d * step; bs.pos.z += dz / d * step; }
    ball.position.copy(bs.pos);
    for (const o of oppsOf(passData.from)) if (dist(o.pos, bs.pos) < 0.85 && Math.abs(o.jy + 1.2 - bs.pos.y) < 1.4) { giveBall(o, 'Intercepted!'); return; }
    if (d < 0.4) giveBall(passData.to);
  }
  function onScore() {
    const s = shot;
    if (s.team === 'A') { scoreA += s.points; makes++; setMsg('SWISH! +' + s.points, 1.4); }
    else { scoreB += s.points; setMsg('They score +' + s.points, 1.2); }
    const a = (s.team === 'A' ? teamB : teamA).reduce((b, c) => dist(c.pos, s.hoop) < dist(b.pos, s.hoop) ? c : b);
    shot = null; giveBall(a); // conceding team inbounds — nobody teleports
  }
  function passTo(from, to) { phase = 'pass'; bs.pos.copy(handPoint(from)); passData = { from, to }; holder = null; }
  function ballHold() {
    if (phase !== 'play' || !holder) return;
    const a = holder, r = rotOf(a);
    ball.position.set(a.pos.x + Math.sin(r) * 0.5, 1.15 + a.jy, a.pos.z + Math.cos(r) * 0.5);
  }

  // ---- movement ----
  function jumpPhysics(a, dt) { if (a.jumping) { a.vy -= G * dt; a.jy += a.vy * dt; if (a.jy <= 0) { a.jy = 0; a.jumping = false; } } }
  function moveHuman(dt) {
    const cy = Math.cos(input.camYaw), sy = Math.sin(input.camYaw);
    let tvx = 0, tvz = 0, moving = false;
    if (input.active && phase !== 'over') {
      const mx = input.x * cy + input.y * sy, mz = -input.x * sy + input.y * cy, m = Math.hypot(mx, mz);
      if (m > 0.01) { const sp = HUMAN_SPD * Math.min(1, m); tvx = mx / m * sp; tvz = mz / m * sp; }
    }
    A0.vx += (tvx - A0.vx) * Math.min(1, dt * ACCEL);
    A0.vz += (tvz - A0.vz) * Math.min(1, dt * ACCEL);
    A0.pos.x += A0.vx * dt; A0.pos.z += A0.vz * dt;
    const sp = Math.hypot(A0.vx, A0.vz);
    if (sp > 0.3) { pl.rotation.y = Math.atan2(A0.vx, A0.vz); moving = true; }
    jumpPhysics(A0, dt); A0._moving = moving;
  }
  function driveAI(a, tx, tz, spd, dt) {
    const dx = tx - a.pos.x, dz = tz - a.pos.z, d = Math.hypot(dx, dz);
    let tvx = 0, tvz = 0;
    if (d > 0.15 && spd > 0) { tvx = dx / d * spd; tvz = dz / d * spd; }
    a.vx += (tvx - a.vx) * Math.min(1, dt * ACCEL);
    a.vz += (tvz - a.vz) * Math.min(1, dt * ACCEL);
    a.pos.x += a.vx * dt; a.pos.z += a.vz * dt;
    const sp = Math.hypot(a.vx, a.vz);
    if (sp > 0.4) a.mesh.rotation.y = Math.atan2(a.vx, a.vz);
    jumpPhysics(a, dt); a._moving = sp > 0.6;
  }
  function separate() {
    for (let i = 0; i < agents.length; i++) for (let j = i + 1; j < agents.length; j++) {
      const a = agents[i].pos, b = agents[j].pos, dx = b.x - a.x, dz = b.z - a.z, dd = Math.hypot(dx, dz);
      if (dd > 0.0001 && dd < 1.15) { const p = (1.15 - dd) / 2, nx = dx / dd, nz = dz / dd; a.x -= nx * p; a.z -= nz * p; b.x += nx * p; b.z += nz * p; }
    }
    for (const a of agents) { a.pos.x = clamp(a.pos.x, B.minX, B.maxX); a.pos.z = clamp(a.pos.z, B.minZ, B.maxZ); }
  }
  function finalize(t) {
    for (const a of agents) {
      if (a.kind === 'human') pl.position.y = a.jy;
      else a.mesh.position.set(a.pos.x, a.jy, a.pos.z);
      const anim = a.kind === 'human' ? pl.userData.animate : a.mesh.userData.animate;
      if (anim) anim(t, a._moving);
    }
  }

  // ---- AI ----
  function aiAgent(a, dt, t) {
    if (phase === 'loose' || (phase === 'shot' && shot)) { driveAI(a, bs.pos.x, bs.pos.z, AI_SPD, dt); return; } // crash the boards
    if (phase !== 'play') { driveAI(a, a.pos.x, a.pos.z, 0, dt); return; }
    if (teamHas(a.team)) aiOffense(a, dt, t); else aiDefense(a, dt, t);
  }
  function aiOffense(a, dt, t) {
    const hoop = a.attack;
    if (a === holder) {
      a.shootT += dt;
      const d = dist(a.pos, hoop), def = nearestOpp(a), dd = dist(def.pos, a.pos);
      if (a.shootGather > 0) { a.shootGather -= dt; driveAI(a, a.pos.x, a.pos.z, 0, dt); if (a.shootGather <= 0) resolveShot(a, d < 1.8); return; }
      const open = dd > 2.5;
      if (d < 9 && (open || shotClock < 4 || (d < 2.0 && dd > 1.2))) { a.shootGather = 0.34; return; }
      // pressured? kick to an open teammate
      const mate = matesOf(a)[0];
      if (mate && dd < 1.7) { const md = nearestOpp(mate); if (dist(md.pos, mate.pos) > 3) { passTo(a, mate); return; } }
      // drive at the rim with a weave
      const dx = hoop.x - a.pos.x, dz = hoop.z - a.pos.z, dl = Math.hypot(dx, dz) || 1, px = -dz / dl, pz = dx / dl, w = Math.sin(t * 2 + a.seed) * 1.4;
      driveAI(a, a.pos.x + dx / dl * 3 + px * w, a.pos.z + dz / dl * 3 + pz * w, AI_SPD, dt);
    } else {
      const side = holder.pos.z > CC.z ? -1 : 1;             // spot up opposite the ball
      const inward = Math.sign(CC.x - hoop.x) || 1;          // pull toward mid-court, not off the baseline
      driveAI(a, hoop.x + inward * 5.5, CC.z + side * 4.8, AI_SPD * 0.9, dt);
    }
  }
  function assignment(a) {
    // 2v2 man defense: the defender closest to the ball-handler takes them
    if (!holder) return nearestOpp(a);
    const mates = a.team === 'A' ? teamA : teamB;
    const closestToBall = mates.reduce((b, c) => dist(c.pos, holder.pos) < dist(b.pos, holder.pos) ? c : b);
    if (a === closestToBall) return holder;
    return oppsOf(a).find(o => o !== holder) || holder;
  }
  function aiDefense(a, dt, t) {
    const man = assignment(a), mh = man.attack;
    const dx = mh.x - man.pos.x, dz = mh.z - man.pos.z, dl = Math.hypot(dx, dz) || 1;
    const gap = man === holder ? 1.25 : 1.9;
    driveAI(a, man.pos.x + dx / dl * gap, man.pos.z + dz / dl * gap, AI_SPD * 1.02, dt);
    a.stealCd -= dt;
    if (man === holder && dist(a.pos, man.pos) < 1.55) {
      if (man.shootGather > 0 && !a.jumping && Math.random() < 0.10) { a.jumping = true; a.vy = 6.0; } // contest
      if (dist(a.pos, man.pos) < 1.25 && a.stealCd <= 0) { a.stealCd = 1.3; if (Math.random() < 0.18) giveBall(a, a.team === 'A' ? 'Steal!' : 'They steal'); }
    }
  }

  // ---- player actions ----
  const airborne = () => A0.jumping || A0.jy > 0.05;
  // Shoot: release the charge meter in the green — from the ground OR mid-air. Jumping
  // first (with the Jump button) makes it a jump shot that rises over the defense.
  function playerShoot() {
    if (!charging || phase !== 'play' || holder !== A0) return;
    charging = false; $('bball-meter').classList.add('hidden');
    const isDunk = airborne() && dist(A0.pos, RIGHT) < 2.3; // jump at the rim → dunk/layup
    resolveShot(A0, isDunk);
  }
  function onJump() { if (!airborne()) { A0.vy = JUMP_V; A0.jumping = true; } }   // pure jump
  function onBlock() { if (!airborne()) { A0.vy = JUMP_V; A0.jumping = true; } }  // contest hop
  function playerPass() { if (phase === 'play' && holder === A0) { passTo(A0, A1); setMsg('Pass', 0.5); } }
  function playerSteal() {
    if (phase !== 'play' || !holder || holder.team !== 'B' || pStealCool > 0) return;
    pStealCool = 0.7;
    const bh = holder, d = dist(A0.pos, bh.pos);
    if (d > 2.0) { setMsg('Too far to steal', 0.6); return; }
    const toBall = Math.atan2(bh.pos.z - A0.pos.z, bh.pos.x - A0.pos.x);
    const face = clamp(1 - Math.abs(angDiff(pl.rotation.y, toBall)) / 1.5, 0, 1);
    if (Math.random() < clamp(0.5 * face * (1 - d / 2.4), 0.05, 0.62)) giveBall(A0, 'STEAL! 🤚');
    else setMsg('Missed the steal', 0.6);
  }

  // ---- main update ----
  function update(dt, t) {
    if (phase === 'over') return;
    timeLeft -= dt; if (timeLeft <= 0) return endGame();
    if (phase === 'play' && holder) { shotClock -= dt; if (shotClock <= 0) turnover(); }
    if (charging && !(phase === 'play' && holder === A0)) { charging = false; $('bball-meter').classList.add('hidden'); }
    if (charging) { meter += meterDir * dt * 1.3; if (meter > 1) { meter = 1; meterDir = -1; } if (meter < 0) { meter = 0; meterDir = 1; } $('bball-fill').style.width = (meter * 100) + '%'; }
    if (pStealCool > 0) pStealCool -= dt;

    moveHuman(dt);
    for (const a of [A1, B0, B1]) aiAgent(a, dt, t);
    separate();
    finalize(t);
    if (phase === 'shot' || phase === 'loose' || phase === 'pass') simBall(dt); else ballHold();

    const haveBall = phase === 'play' && holder === A0;
    const defending = phase === 'play' && holder && holder.team === 'B';
    $('bball-shoot').style.display = haveBall ? '' : 'none';
    $('bball-pass').style.display = haveBall ? '' : 'none';
    $('bball-steal').style.display = defending ? '' : 'none';
    $('bball-block').style.display = defending ? '' : 'none';
    $('bball-score').textContent = `You ${scoreA} · Opp ${scoreB}`;
    const sc = phase === 'play' && holder ? ` · ⏲${Math.ceil(Math.max(0, shotClock))}` : '';
    $('bball-time').textContent = '⏱ ' + Math.max(0, Math.ceil(timeLeft)) + sc;
    if (msgT > 0) { msgT -= dt; if (msgT <= 0) setMsg(''); }
  }

  function endGame() {
    phase = 'over';
    const coins = scoreA * 4 + makes * 2;
    addCoins(coins);
    if (makes > 0) track('hoops', makes);
    state.stats.hoopsScored = (state.stats.hoopsScored || 0) + makes;
    if (scoreA > scoreB) { track('games', 1); state.stats.gamesWon = (state.stats.gamesWon || 0) + 1; }
    applyNeeds({ fun: 24, hunger: -8 });
    $('bball-hud').classList.add('hidden');
    const win = scoreA > scoreB ? 'You win! 🎉' : scoreA === scoreB ? "It's a tie!" : 'Opponents win — run it back!';
    showModal('🏀 Final whistle!', `${win}<br>You ${scoreA} · Opp ${scoreB} · <b>${makes}</b> baskets.<br>Reward: <b>🪙 ${coins}</b>`, [{ label: 'Done', onClick: () => { if (onExit) onExit(); } }]);
  }

  // ---- buttons (once) ----
  // pointerdown (not click) so they fire instantly and work mid-move with a
  // second thumb on the joystick (multi-touch)
  const press = (id, fn) => $(id).addEventListener('pointerdown', (e) => { e.preventDefault(); fn(); });
  const sb = $('bball-shoot'); // hold to charge, release in the green to shoot
  sb.addEventListener('pointerdown', (e) => { e.preventDefault(); if (phase === 'play' && holder === A0) { charging = true; meter = 0; meterDir = 1; $('bball-meter').classList.remove('hidden'); } });
  const rel = (e) => { if (e) e.preventDefault(); if (charging) playerShoot(); };
  sb.addEventListener('pointerup', rel); sb.addEventListener('pointerleave', rel); sb.addEventListener('pointercancel', rel);
  press('bball-pass', playerPass);
  press('bball-steal', playerSteal);
  press('bball-jump', onJump);
  press('bball-block', onBlock);
  $('bball-quit').addEventListener('click', () => endGame());

  function enter(player, cb) {
    pl = player; onExit = cb; active = true;
    A0.mesh = pl; A0.pos = pl.position;
    scoreA = 0; scoreB = 0; makes = 0; timeLeft = 90; charging = false;
    for (const a of agents) { a.vx = a.vz = a.jy = a.vy = 0; a.jumping = false; a.shootGather = 0; a.shootT = 0; a.stealCd = 0; }
    msgT = 0; setMsg('');
    // initial tip-off placement (this is the only positioning — play never resets after)
    pl.position.set(CC.x - 5, 0, CC.z);
    A1.pos.set(CC.x - 3, 0, CC.z + 4.5);
    B0.pos.set(CC.x + 1.5, 0, CC.z - 1);
    B1.pos.set(CC.x + 3.5, 0, CC.z + 3.5);
    group.visible = true;
    input.camYaw = -Math.PI / 2; input.camPitch = 0;
    giveBall(A0, 'Your ball — go!');
    $('bball-meter').classList.add('hidden');
    $('bball-hud').classList.remove('hidden');
    $('hud').classList.add('playing-bball');
  }
  function exit() { active = false; group.visible = false; if (pl) pl.position.y = 0; input.camYaw = 0; $('bball-hud').classList.add('hidden'); $('hud').classList.remove('playing-bball'); }

  return { enter, exit, update, group, isActive: () => active };
}
