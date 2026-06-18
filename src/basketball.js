// Basketball mini-game — played on the campus court in the main (toon-shaded)
// scene with the normal 3rd-person follow camera, so the art style matches.
// You (your pet) + an NPC teammate vs an NPC enemy. Pass, shoot, jump/dunk,
// and block. Designed entity-first so it can become multiplayer later.

import * as THREE from 'three';
import { input } from './input.js';
import { addCoins } from './state.js';
import { showModal } from './ui.js';
import { toonMat } from './textures.js';
import { createPet } from './petFactory.js';

const $ = (id) => document.getElementById(id);
const G = 16;
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
  const group = new THREE.Group(); group.visible = false; parent.add(group);

  // NPCs are real animal pets (matching the campus art) wearing a team-colored
  // jersey band so you can tell teammate from opponent at a glance.
  function makeNpc(type, teamColor) {
    const pet = createPet(type, {});
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.08, 8, 18), toonMat(teamColor));
    band.rotation.x = Math.PI / 2; band.position.y = 0.55; band.castShadow = true;
    pet.add(band);
    group.add(pet);
    return { mesh: pet, pos: new THREE.Vector3(), jy: 0, vy: 0, jumping: false };
  }
  const teammate = makeNpc('dog', 0x3a78c8), enemy = makeNpc('bear', 0xd14b4b);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 14), toonMat(0xe07a33)); ball.castShadow = true; group.add(ball);
  const bs = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), inAir: false };

  // state
  let pl = null;                 // the player's pet
  let pjy = 0, pvy = 0, pjump = false;
  let owner = 'player';          // player | tm | enemy | null
  let phase = 'play';            // play | shot | over
  let shot = null;               // { team:'A'|'B', target, points, scored }
  let charging = false, meter = 0, meterDir = 1;
  let scoreA = 0, scoreB = 0, makes = 0, timeLeft = 75;
  let msgT = 0, oppShootT = 0, stealCool = 0, pStealCool = 0, resetT = 0, resetTeam = null;
  let onExit = null, active = false;

  const setMsg = (t, d = 1.2) => { $('bball-msg').textContent = t; msgT = t ? d : 0; };
  const teamOf = (o) => (o === 'enemy') ? 'B' : 'A';
  const ent = (o) => o === 'player' ? { pos: pl.position, jy: pjy } : (o === 'tm' ? teammate : enemy);
  function handOf(o) { const e = ent(o); const r = o === 'player' ? pl.rotation.y : (ent(o).mesh ? ent(o).mesh.rotation.y : 0); return new THREE.Vector3(e.pos.x, 1.5 + (e.jy || 0), e.pos.z); }
  const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

  function resetPossession(team) {
    phase = 'play'; bs.inAir = false; shot = null; oppShootT = 0; stealCool = 0;
    if (team === 'A') {
      owner = 'player'; setMsg('Your ball', 0.9);
      pl.position.set(court.center.x - 6, 0, court.center.z + (Math.random() - 0.5) * 6);
      enemy.pos.set(pl.position.x + 3, 0, pl.position.z);
      teammate.pos.set(court.center.x + 3, 0, court.center.z + (Math.random() > 0.5 ? 5 : -5));
    } else {
      owner = 'enemy'; setMsg('Defend!', 0.9);
      enemy.pos.set(court.center.x + 5, 0, court.center.z + (Math.random() - 0.5) * 4);
      teammate.pos.set(court.center.x, 0, court.center.z + 4);
    }
  }
  const resetSoon = (team, delay = 1.1) => { resetT = delay; resetTeam = team; };

  // ---- actions ----
  function launchShot(from, hoop, q, points, team) {
    const err = clamp(1 - q, 0, 1);
    const t = new THREE.Vector3(hoop.x, hoop.y, hoop.z).add(new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.45), (Math.random() - 0.5) * 2).multiplyScalar(err * 1.3));
    const v = launchVel(from, t, 55) || launchVel(from, t, 42) || new THREE.Vector3(hoop.x - from.x, 7, hoop.z - from.z);
    bs.pos.copy(from); bs.vel.copy(v); bs.inAir = true; owner = null;
    shot = { team, hoop, points, scored: false }; phase = 'shot';
  }
  function playerShoot() {
    if (phase !== 'play' || owner !== 'player' || !charging) return;
    charging = false; $('bball-meter').classList.add('hidden');
    const d = dist2(pl.position, RIGHT);
    const open = clamp(dist2(pl.position, enemy.pos) / 3, 0.35, 1);
    const toHoop = Math.atan2(RIGHT.z - pl.position.z, RIGHT.x - pl.position.x);
    const faceF = clamp(1 - Math.abs(angDiff(pl.rotation.y, toHoop)) / 1.2, 0.4, 1);
    const sweet = 0.82, tol = clamp(0.34 - d * 0.012, 0.1, 0.34);
    const meterF = clamp(1 - Math.abs(meter - sweet) / tol, 0, 1);
    const q = meterF * open * faceF;
    if (dist2(pl.position, enemy.pos) < 1.6 && enemy.jumping && q < 0.6) { setMsg('BLOCKED!'); bumpBall(); resetSoon('B'); return; }
    launchShot(handOf('player'), RIGHT, q, d > 6.5 ? 3 : 2, 'A');
  }
  function bumpBall() { bs.pos.copy(handOf('player')); bs.vel.set((Math.random() - 0.5) * 5, 4, (Math.random() - 0.5) * 5); bs.inAir = true; owner = null; shot = { team: 'A', hoop: RIGHT, points: 0, scored: true }; phase = 'shot'; }
  function playerPass() {
    if (phase !== 'play' || owner !== 'player') return;
    const contested = dist2(pl.position, enemy.pos) < 2.4;
    bs.pos.copy(handOf('player')); bs.inAir = false; owner = 'tm';
    teammate.catchT = 0.0; teammate.willShoot = 0.55; teammate.contested = contested;
    setMsg('Pass!', 0.8);
  }
  function playerJump() {
    if (!pjump) { pvy = 6.5; pjump = true; }
    if (phase === 'play' && owner === 'player' && dist2(pl.position, RIGHT) < 3.2) { setMsg('DUNK! +2'); launchShot(new THREE.Vector3(RIGHT.x - 0.6, 3.1, RIGHT.z), RIGHT, 1, 2, 'A'); }
  }
  function playerBlock() {
    if (!pjump) { pvy = 6.5; pjump = true; }
    if (phase === 'play' && owner === 'enemy' && oppShootT > 0 && dist2(pl.position, enemy.pos) < 2.6) { enemy.blocked = true; setMsg('BLOCK! Ball back', 1.3); }
  }
  function playerSteal() {
    if (phase !== 'play' || owner !== 'enemy' || pStealCool > 0) return;
    pStealCool = 0.7;
    const d = dist2(pl.position, enemy.pos);
    if (d > 2.2) { setMsg('Too far to steal', 0.7); return; }
    // closer + facing the ball-handler = better odds
    const toBall = Math.atan2(enemy.pos.z - pl.position.z, enemy.pos.x - pl.position.x);
    const face = clamp(1 - Math.abs(angDiff(pl.rotation.y, toBall)) / 1.4, 0, 1);
    const chance = clamp(0.55 * face * (1 - d / 2.6), 0.05, 0.7);
    if (Math.random() < chance) { setMsg('STEAL! Your ball'); owner = 'player'; oppShootT = 0; enemy.blocked = false; }
    else setMsg('Missed the steal', 0.7);
  }

  // ---- per-frame ----
  function movePlayer(dt, t) {
    const cy = Math.cos(input.camYaw), sy = Math.sin(input.camYaw);
    let moving = false;
    if (input.active && phase !== 'over') {
      const mx = input.x * cy + input.y * sy, mz = -input.x * sy + input.y * cy;
      pl.position.x = clamp(pl.position.x + mx * 8 * dt, B.minX, B.maxX);
      pl.position.z = clamp(pl.position.z + mz * 8 * dt, B.minZ, B.maxZ);
      if (mx || mz) { pl.rotation.y = Math.atan2(mx, mz); moving = true; }
    }
    if (pjump) { pvy -= G * dt; pjy += pvy * dt; if (pjy <= 0) { pjy = 0; pjump = false; } }
    pl.position.y = pjy;
    if (pl.userData.animate) pl.userData.animate(t, moving);
  }
  function moveTo(e, tx, tz, spd, dt, t) {
    const dx = tx - e.pos.x, dz = tz - e.pos.z, d = Math.hypot(dx, dz);
    let moving = false;
    if (d > 0.06 && spd > 0) { const s = Math.min(spd * dt, d); e.pos.x += dx / d * s; e.pos.z += dz / d * s; e.mesh.rotation.y = Math.atan2(dx, dz); moving = true; }
    e.pos.x = clamp(e.pos.x, B.minX, B.maxX); e.pos.z = clamp(e.pos.z, B.minZ, B.maxZ);
    if (e.jumping) { e.vy -= G * dt; e.jy += e.vy * dt; if (e.jy <= 0) { e.jy = 0; e.jumping = false; } }
    e.mesh.position.set(e.pos.x, e.jy, e.pos.z);
    if (e.mesh.userData.animate) e.mesh.userData.animate(t, moving);
  }
  function aiTeammate(dt, t) {
    if (owner === 'tm') {
      teammate.willShoot -= dt;
      moveTo(teammate, teammate.pos.x, teammate.pos.z, 0, dt, t);
      if (teammate.willShoot <= 0) { const d = dist2(teammate.pos, RIGHT); launchShot(new THREE.Vector3(teammate.pos.x, 1.6, teammate.pos.z), RIGHT, teammate.contested ? 0.95 : 0.72, d > 6.5 ? 3 : 2, 'A'); }
      return;
    }
    if (teamOf(owner) === 'A') { // spot up open, away from the enemy, toward the right wing
      const side = (court.center.z > enemy.pos.z) ? -4.5 : 4.5;
      moveTo(teammate, RIGHT.x - 5, court.center.z + side, 4.5, dt, t);
    } else { // help defend
      moveTo(teammate, (enemy.pos.x + LEFT.x) / 2, enemy.pos.z, 4.2, dt, t);
    }
  }
  function aiEnemy(dt, t) {
    if (owner === 'enemy') {
      // drive toward the left hoop with a 2D weave, then pull up and shoot
      const dh = dist2(enemy.pos, LEFT);
      if (dh > 5 && oppShootT === 0) {
        const dx = LEFT.x - enemy.pos.x, dz = LEFT.z - enemy.pos.z, dl = Math.hypot(dx, dz);
        const perpX = -dz / dl, perpZ = dx / dl, weave = Math.sin(t * 2.5) * 2.4;
        moveTo(enemy, enemy.pos.x + dx / dl * 3 + perpX * weave, enemy.pos.z + dz / dl * 3 + perpZ * weave, 6, dt, t);
      } else {
        oppShootT += dt;
        moveTo(enemy, enemy.pos.x, enemy.pos.z, 0, dt, t); // idle pull-up animation
        if (oppShootT > 1.2) {
          if (enemy.blocked) { enemy.blocked = false; scoreA += 0; resetPossession('A'); }
          else launchShot(new THREE.Vector3(enemy.pos.x, 1.6, enemy.pos.z), LEFT, 0.84, 2, 'B');
        }
      }
      return;
    }
    // defend the ball-handler: slide to stay between them and the right hoop (2D)
    const h = owner === 'player' ? pl.position : teammate.pos;
    const dx = RIGHT.x - h.x, dz = RIGHT.z - h.z, dl = Math.hypot(dx, dz) || 1;
    moveTo(enemy, h.x + dx / dl * 1.9, h.z + dz / dl * 1.9, 6.2, dt, t);
    if (stealCool > 0) stealCool -= dt;
    if (owner === 'player' && stealCool <= 0 && dist2(enemy.pos, pl.position) < 1.3 && Math.random() < 0.4 * dt) { setMsg('Stolen!'); resetPossession('B'); }
  }
  function simBall(dt) {
    const prevY = bs.pos.y;
    bs.vel.y -= G * dt; bs.pos.addScaledVector(bs.vel, dt);
    for (const h of [RIGHT, LEFT]) {
      if (bs.vel.y < 0 && prevY >= h.y && bs.pos.y < h.y) {
        if ((bs.pos.x - h.x) ** 2 + (bs.pos.z - h.z) ** 2 < 0.4 * 0.4 && shot && !shot.scored && shot.hoop === h) onScore();
      }
    }
    ball.position.copy(bs.pos);
    if (bs.pos.y <= 0.24) { bs.pos.y = 0.24; ball.position.copy(bs.pos); onLand(); }
  }
  function onScore() {
    shot.scored = true;
    if (shot.team === 'A') { scoreA += shot.points; makes++; setMsg('SWISH! +' + shot.points, 1.5); }
    else { scoreB += shot.points; setMsg('They score', 1.2); }
    resetSoon(shot.team === 'A' ? 'B' : 'A');
  }
  function onLand() {
    bs.inAir = false;
    if (shot && !shot.scored) { setMsg(shot.team === 'A' ? 'Miss!' : 'They miss', 1.0); resetSoon(shot.team === 'A' ? 'B' : 'A'); }
  }
  function ballHold() {
    if (owner === 'player') { const c = Math.cos(pl.rotation.y), s = Math.sin(pl.rotation.y); ball.position.set(pl.position.x + c * 0.5, 1.2 + pjy, pl.position.z + s * 0.5); }
    else if (owner === 'tm') { const r = teammate.mesh.rotation.y; ball.position.set(teammate.pos.x + Math.sin(r) * 0.72, 1.0 + teammate.jy, teammate.pos.z + Math.cos(r) * 0.72); }
    else if (owner === 'enemy') { const r = enemy.mesh.rotation.y; ball.position.set(enemy.pos.x + Math.sin(r) * 0.72, 1.0 + enemy.jy, enemy.pos.z + Math.cos(r) * 0.72); }
  }

  function update(dt, t) {
    if (phase === 'over') return;
    timeLeft -= dt; if (timeLeft <= 0) return endGame();
    if (charging && !(phase === 'play' && owner === 'player')) { charging = false; $('bball-meter').classList.add('hidden'); }
    if (resetT > 0) { resetT -= dt; if (resetT <= 0) resetPossession(resetTeam); }
    if (pStealCool > 0) pStealCool -= dt;
    if (charging) { meter += meterDir * dt * 1.5; if (meter > 1) { meter = 1; meterDir = -1; } if (meter < 0) { meter = 0; meterDir = 1; } $('bball-fill').style.width = (meter * 100) + '%'; }
    movePlayer(dt, t);
    aiTeammate(dt, t); aiEnemy(dt, t);
    if (bs.inAir) simBall(dt); else ballHold();
    $('bball-score').textContent = `You ${scoreA} · Opp ${scoreB}`;
    $('bball-time').textContent = '⏱ ' + Math.max(0, Math.ceil(timeLeft));
    if (msgT > 0) { msgT -= dt; if (msgT <= 0) setMsg(''); }
  }

  function endGame() {
    phase = 'over';
    const coins = scoreA * 4 + makes;
    addCoins(coins);
    $('bball-hud').classList.add('hidden');
    showModal('🏀 Final whistle!', `You scored <b>${scoreA}</b> (opp ${scoreB}) on <b>${makes}</b> baskets.<br>Reward: <b>🪙 ${coins}</b>`, [{ label: 'Done', onClick: () => { if (onExit) onExit(); } }]);
  }

  // ---- buttons (once) ----
  const sb = $('bball-shoot');
  sb.addEventListener('pointerdown', (e) => { e.preventDefault(); if (phase === 'play' && owner === 'player') { charging = true; meter = 0; meterDir = 1; $('bball-meter').classList.remove('hidden'); } });
  const rel = (e) => { if (e) e.preventDefault(); if (charging) playerShoot(); };
  sb.addEventListener('pointerup', rel); sb.addEventListener('pointerleave', rel); sb.addEventListener('pointercancel', rel);
  $('bball-pass').addEventListener('click', playerPass);
  $('bball-steal').addEventListener('click', playerSteal);
  $('bball-jump').addEventListener('click', playerJump);
  $('bball-block').addEventListener('click', playerBlock);
  $('bball-quit').addEventListener('click', () => endGame());

  function enter(player, cb) {
    pl = player; onExit = cb; active = true;
    scoreA = 0; scoreB = 0; makes = 0; timeLeft = 75; charging = false; pjy = 0; pvy = 0; pjump = false;
    resetT = 0; msgT = 0; setMsg('');
    group.visible = true;
    input.camYaw = -Math.PI / 2; input.camPitch = 0; // start with the court ahead
    resetPossession('A');
    $('bball-meter').classList.add('hidden');
    $('bball-hud').classList.remove('hidden');
    $('hud').classList.add('playing-bball');
  }
  function exit() { active = false; group.visible = false; if (pl) pl.position.y = 0; input.camYaw = 0; $('bball-hud').classList.add('hidden'); $('hud').classList.remove('playing-bball'); }

  return { enter, exit, update, group, isActive: () => active };
}
