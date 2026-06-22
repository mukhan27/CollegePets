// Cup Pong — a GamePigeon-style swipe-to-flick beer-pong game, rendered as a
// 2.5D canvas (perspective table, red Solo cups). You vs an AI: flick the ball
// up the table to land it in the far rack of cups; sink them all to win. Make a
// cup and you shoot again; miss and it's the opponent's turn.

import { addCoins } from './state.js';
import { showModal } from './ui.js';
import { track, applyNeeds } from './systems.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const GRAV = 4.6;                 // arc gravity in table-height units
const CUP_RX = 0.06, CUP_RZ = 0.052; // hit tolerance in table space

let G = null;

function makeRack(far) {
  const cups = [], sp = 0.135, baseZ = far ? 0.93 : 0.07, dz = far ? -0.072 : 0.072;
  for (let i = 0; i < 4; i++) {
    const count = 4 - i, z = baseZ + dz * i;
    for (let j = 0; j < count; j++) cups.push({ tx: (j - (count - 1) / 2) * sp, tz: z, alive: true });
  }
  return cups;
}

export function startCupPong(onDone) {
  const ov = $('cuppong-overlay'); ov.classList.remove('hidden');
  const canvas = $('cuppong-canvas'), ctx = canvas.getContext('2d');
  const W = window.innerWidth, H = window.innerHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  G = {
    canvas, ctx, W, H, onDone, raf: 0, last: performance.now(), over: false,
    you: makeRack(false), opp: makeRack(true), turn: 'you', ball: null,
    aiT: 0, msg: '', msgT: 0, drag: null,
    proj: { ny: H * 0.92, fy: H * 0.13, nhw: W * 0.46, fhw: W * 0.19, cx: W / 2 },
  };
  bindInput();
  setMsg('Your throw — swipe up! 🏓', 2);
  G.raf = requestAnimationFrame(loop);
}

function setMsg(t, d = 1.2) { G.msg = t; G.msgT = d; }
function project(tx, tz) {
  const p = G.proj, sy = p.ny + (p.fy - p.ny) * tz, hw = p.nhw + (p.fhw - p.nhw) * tz;
  return { sx: p.cx + tx * hw, sy, scale: 1 + (0.4 - 1) * tz };
}

// ---- input: flick up to throw ----
function bindInput() {
  const c = G.canvas;
  G.onDown = (e) => { if (G.turn !== 'you' || G.ball || G.over) return; e.preventDefault(); G.drag = { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY }; };
  G.onMove = (e) => { if (G.drag) { G.drag.x = e.clientX; G.drag.y = e.clientY; } };
  G.onUp = () => { if (!G.drag) return; const d = G.drag; G.drag = null; doSwipe(d.x0, d.y0, d.x, d.y); };
  c.addEventListener('pointerdown', G.onDown);
  window.addEventListener('pointermove', G.onMove);
  window.addEventListener('pointerup', G.onUp);
}
// The flick becomes the ball's launch velocity directly: how far/fast you swipe
// up controls the throw strength (distance), and the swipe angle controls
// left/right. Physics decides where it lands — no aim assist.
function doSwipe(x0, y0, x1, y1) {
  const ux = x1 - x0, uy = y0 - y1;        // uy > 0 means swiped up the table
  if (uy < 30) { setMsg('Swipe up to throw', 0.8); return; }
  const un = clamp(uy / (G.H * 0.4), 0.05, 1.45);  // up power → forward + arc
  const sn = clamp(ux / (G.H * 0.4), -1.1, 1.1);    // sideways from the horizontal swipe
  G.ball = { t: 0, tx: 0, tz: 0.04, ty: 0, vtx: sn * 1.0, vtz: un * 1.0, vty: un * 3.2 };
}

// ---- AI (aims at a cup with some error — it's allowed to be precise) ----
function aiThrow() {
  const targets = G.you.filter(c => c.alive);
  if (!targets.length) return;
  const c = targets[Math.floor(Math.random() * targets.length)];
  const err = 0.07, startTz = 0.97, T = 0.78;
  const tx = c.tx + (Math.random() - 0.5) * err * 2, tz = c.tz + (Math.random() - 0.5) * err * 2;
  G.ball = { t: 0, tx: 0, tz: startTz, ty: 0, vtx: tx / T, vtz: (tz - startTz) / T, vty: 0.5 * GRAV * T };
  setMsg('Opponent throws…', 0.8);
}

// ---- resolution ----
function land() {
  const b = G.ball; G.ball = null;
  const rack = G.turn === 'you' ? G.opp : G.you;
  let hit = null, best = 1;
  for (const c of rack) {
    if (!c.alive) continue;
    const d = Math.hypot((b.tx - c.tx) / CUP_RX, (b.tz - c.tz) / CUP_RZ);
    if (d < 1 && d < best) { best = d; hit = c; }
  }
  if (hit) {
    hit.alive = false;
    setMsg(G.turn === 'you' ? 'Splash! 🎯' : 'They sink one', 1.0);
    if (rack.every(c => !c.alive)) return endGame(G.turn === 'you');
    if (G.turn === 'opp') G.aiT = 0.7;        // make → shoot again
  } else {
    setMsg(G.turn === 'you' ? 'Missed!' : 'They miss', 0.9);
    G.turn = G.turn === 'you' ? 'opp' : 'you';
    if (G.turn === 'opp') G.aiT = 0.9;
  }
}

function loop(now) {
  if (!G) return;
  G.raf = requestAnimationFrame(loop);
  const dt = Math.min(0.033, (now - G.last) / 1000); G.last = now;
  if (!G.over) {
    const b = G.ball;
    if (b) { b.t += dt; b.tx += b.vtx * dt; b.tz += b.vtz * dt; b.vty -= GRAV * dt; b.ty += b.vty * dt; if (b.ty <= 0 && b.t > 0.05) land(); }
    else if (G.turn === 'opp' && G.aiT > 0) { G.aiT -= dt; if (G.aiT <= 0) { G.aiT = 0; aiThrow(); } }
    if (G && G.msgT > 0) G.msgT -= dt; // land() may have ended the game
  }
  if (!G) return;                      // game ended this frame
  render();
}

// ---- rendering ----
function drawTable() {
  const ctx = G.ctx, p = G.proj;
  ctx.clearRect(0, 0, G.W, G.H);
  ctx.fillStyle = '#caa36a'; ctx.fillRect(0, 0, G.W, G.H); // wood floor
  ctx.beginPath();
  ctx.moveTo(p.cx - p.nhw, p.ny); ctx.lineTo(p.cx + p.nhw, p.ny);
  ctx.lineTo(p.cx + p.fhw, p.fy); ctx.lineTo(p.cx - p.fhw, p.fy); ctx.closePath();
  ctx.fillStyle = '#1f8a4c'; ctx.fill();
  ctx.lineWidth = 5; ctx.strokeStyle = '#eaf5ee'; ctx.stroke();
  ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(p.cx, p.ny); ctx.lineTo(p.cx, p.fy); ctx.stroke(); // centre line
}
function drawCup(sx, sy, scale) {
  const ctx = G.ctx, rx = 22 * scale, ry = 9 * scale, bh = 26 * scale;
  ctx.fillStyle = '#cf2a25';
  ctx.beginPath(); ctx.moveTo(sx - rx, sy); ctx.lineTo(sx + rx, sy);
  ctx.lineTo(sx + rx * 0.66, sy + bh); ctx.lineTo(sx - rx * 0.66, sy + bh); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(sx, sy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(sx, sy, rx * 0.72, ry * 0.72, 0, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 2.5 * scale; ctx.strokeStyle = '#a81f1b'; ctx.beginPath(); ctx.ellipse(sx, sy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
}
function drawBall(b) {
  const ctx = G.ctx, p = project(b.tx, b.tz), off = b.ty * (G.H * 0.46);
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(p.sx, p.sy, 9 * p.scale, 4 * p.scale, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f6f4ec'; ctx.beginPath(); ctx.arc(p.sx, p.sy - off, 10 * p.scale, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = '#cdc7b6'; ctx.stroke();
}
function drawSwipe() {
  if (!G.drag || G.ball) return;             // just show the gesture — no landing predictor
  const ctx = G.ctx, d = G.drag;
  ctx.setLineDash([7, 9]); ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,.5)';
  ctx.beginPath(); ctx.moveTo(d.x0, d.y0); ctx.lineTo(d.x, d.y); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,255,255,.65)'; ctx.beginPath(); ctx.arc(d.x0, d.y0, 8, 0, Math.PI * 2); ctx.fill();
}
function render() {
  drawTable();
  const cups = [];
  for (const c of G.opp) if (c.alive) cups.push(c);
  for (const c of G.you) if (c.alive) cups.push(c);
  cups.sort((a, b) => b.tz - a.tz); // far first (painter's order)
  for (const c of cups) { const p = project(c.tx, c.tz); drawCup(p.sx, p.sy, p.scale); }
  if (G.ball) drawBall(G.ball);
  drawSwipe();
  $('cuppong-you').textContent = '🐾 ' + G.you.filter(c => c.alive).length;
  $('cuppong-opp').textContent = G.opp.filter(c => c.alive).length + ' 🤖';
  $('cuppong-msg').textContent = G.msgT > 0 ? G.msg : (G.turn === 'you' && !G.ball ? 'Your throw' : '');
}

// ---- end ----
function cleanup() {
  if (!G) return;
  cancelAnimationFrame(G.raf);
  G.canvas.removeEventListener('pointerdown', G.onDown);
  window.removeEventListener('pointermove', G.onMove);
  window.removeEventListener('pointerup', G.onUp);
  $('cuppong-overlay').classList.add('hidden');
}
function endGame(youWon) {
  if (!G || G.over) return;
  G.over = true;
  const left = G.opp.filter(c => c.alive).length;
  const coins = youWon ? 30 + (10 - left) : 8;
  addCoins(coins); applyNeeds({ fun: 18, social: 10 });
  if (youWon) track('games', 1);
  const cb = G.onDone; cleanup(); G = null;
  showModal('🥤 Cup Pong', (youWon ? 'You ran the table! 🏆' : 'You lost this round — rematch?') + `<br>Reward: <b>🪙 ${coins}</b>`, [{ label: 'Done', onClick: () => { if (cb) cb(); } }]);
}

export function initCupPongUI() {
  $('cuppong-quit').addEventListener('click', () => { const cb = G && G.onDone; cleanup(); G = null; if (cb) cb(); });
}
