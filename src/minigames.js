// Student-union arcade games (2D canvas, top-down): Air Hockey vs AI and a
// simplified 8-Ball pool vs AI. Both reuse the shared #minigame-overlay (title /
// score / quit are wired by initMinigameUI) and pay coins; a win bumps gamesWon.

import { state, save, addCoins } from './state.js';
import { showModal } from './ui.js';
import { track, applyNeeds } from './systems.js';

const overlay = () => document.getElementById('minigame-overlay');
const canvas = () => document.getElementById('minigame-canvas');
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

let current = null; // { stop(), finish() }

function openOverlay(title) {
  document.getElementById('minigame-title').textContent = title;
  document.getElementById('minigame-score').textContent = '';
  overlay().classList.remove('hidden');
  const c = canvas();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  c.width = window.innerWidth * dpr;
  c.height = window.innerHeight * dpr;
  const ctx = c.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, W: window.innerWidth, H: window.innerHeight };
}

function closeOverlay() {
  overlay().classList.add('hidden');
  if (current) { current.stop(); current = null; }
}

function setScore(text) { document.getElementById('minigame-score').textContent = text; }

export function initMinigameUI() {
  document.getElementById('minigame-quit').addEventListener('click', () => {
    if (current && current.finish) current.finish();
    else closeOverlay();
  });
}

// pointer position in CSS pixels relative to the (full-screen) canvas
function ptr(e) { const r = canvas().getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

// ============================================================== Air Hockey
export function startAirHockey(onDone) {
  const { ctx, W, H } = openOverlay('🏒 Air Hockey — first to 7');
  const TARGET = 7;
  const th = H * 0.92, tw = Math.min(W * 0.86, th * 0.58);
  const cx = W / 2, top = (H - th) / 2, bot = top + th, left = cx - tw / 2, right = cx + tw / 2;
  const midY = top + th / 2;
  const goalW = tw * 0.42, goalL = cx - goalW / 2, goalR = cx + goalW / 2;
  const puckR = tw * 0.052, malletR = tw * 0.085;
  const MAXV = tw * 0.075;

  let puck = { x: cx, y: midY, vx: 0, vy: 0 };
  const you = { x: cx, y: bot - th * 0.14, px: cx, py: bot - th * 0.14, vx: 0, vy: 0 };
  const ai = { x: cx, y: top + th * 0.14, px: cx, py: top + th * 0.14, vx: 0, vy: 0 };
  let sYou = 0, sOpp = 0, serveAt = performance.now() + 600;
  let msg = '', msgUntil = 0, raf = null, done = false;
  let dragging = false;
  const trail = [];                 // recent puck positions for a motion streak
  let flashAt = 0, flashWho = '';   // brief goal-mouth glow

  function resetPuck(dir) {
    puck = { x: cx, y: midY + dir * th * 0.12, vx: 0, vy: 0 };
    serveAt = performance.now() + 700;
  }
  function goal(who) {
    if (who === 'you') { sYou++; msg = 'GOAL! 🎉'; } else { sOpp++; msg = 'Opponent scores'; }
    msgUntil = performance.now() + 1000;
    flashAt = performance.now() + 600; flashWho = who; trail.length = 0;
    if (sYou >= TARGET || sOpp >= TARGET) { finish(); return; }
    resetPuck(who === 'you' ? 1 : -1);
  }

  const onDown = (e) => { dragging = true; moveMallet(e); e.preventDefault(); };
  const onMove = (e) => { if (dragging) { moveMallet(e); e.preventDefault(); } };
  const onUp = () => { dragging = false; };
  function moveMallet(e) {
    const p = ptr(e);
    you.x = clamp(p.x, left + malletR, right - malletR);
    you.y = clamp(p.y, midY + malletR, bot - malletR);
  }
  canvas().addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);

  function malletHit(m) {
    const dx = puck.x - m.x, dy = puck.y - m.y, d = Math.hypot(dx, dy), min = puckR + malletR;
    if (d < min && d > 0.001) {
      const nx = dx / d, ny = dy / d;
      puck.x = m.x + nx * min; puck.y = m.y + ny * min;
      const vdot = puck.vx * nx + puck.vy * ny;
      puck.vx -= 2 * vdot * nx; puck.vy -= 2 * vdot * ny;
      const mv = m.vx * nx + m.vy * ny;
      puck.vx += nx * (Math.abs(mv) * 1.1 + tw * 0.01);
      puck.vy += ny * (Math.abs(mv) * 1.1 + tw * 0.01);
    }
  }
  function aiMove() {
    ai.px = ai.x; ai.py = ai.y;
    let tx, ty;
    if (puck.y < midY) { tx = puck.x; ty = Math.min(puck.y, midY - malletR); }      // attack
    else { tx = clamp(puck.x, goalL + malletR, goalR - malletR); ty = top + th * 0.16; } // defend
    const sp = tw * 0.024;
    ai.x += clamp(tx - ai.x, -sp, sp);
    ai.y += clamp(ty - ai.y, -sp, sp);
    ai.x = clamp(ai.x, left + malletR, right - malletR);
    ai.y = clamp(ai.y, top + malletR, midY - malletR);
    ai.vx = ai.x - ai.px; ai.vy = ai.y - ai.py;
  }

  function step() {
    const now = performance.now();
    you.vx = you.x - you.px; you.vy = you.y - you.py; you.px = you.x; you.py = you.y;
    aiMove();
    if (now >= serveAt && !done) {
      puck.x += puck.vx; puck.y += puck.vy; puck.vx *= 0.999; puck.vy *= 0.999;
      const sp = Math.hypot(puck.vx, puck.vy);
      if (sp > MAXV) { puck.vx *= MAXV / sp; puck.vy *= MAXV / sp; }
      if (puck.x - puckR < left) { puck.x = left + puckR; puck.vx = Math.abs(puck.vx) * 0.94; }
      if (puck.x + puckR > right) { puck.x = right - puckR; puck.vx = -Math.abs(puck.vx) * 0.94; }
      if (puck.y - puckR < top) {
        if (puck.x > goalL && puck.x < goalR) { goal('you'); } else { puck.y = top + puckR; puck.vy = Math.abs(puck.vy) * 0.94; }
      }
      if (!done && puck.y + puckR > bot) {
        if (puck.x > goalL && puck.x < goalR) { goal('opp'); } else { puck.y = bot - puckR; puck.vy = -Math.abs(puck.vy) * 0.94; }
      }
      if (!done) { malletHit(you); malletHit(ai); }
      trail.push({ x: puck.x, y: puck.y }); if (trail.length > 12) trail.shift();
    }
    draw(now);
    setScore(`You ${sYou} — ${sOpp} Opp`);
    if (!done) raf = requestAnimationFrame(step);
  }

  function draw(now) {
    // backdrop
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0a101c'); bg.addColorStop(1, '#060a12');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    // ---- table bed (glossy rink) with neon rim ----
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 12;
    roundRect(ctx, left, top, tw, th, tw * 0.06);
    const bed = ctx.createLinearGradient(left, top, right, bot);
    bed.addColorStop(0, '#13314c'); bed.addColorStop(0.5, '#0f2740'); bed.addColorStop(1, '#0b1d31');
    ctx.fillStyle = bed; ctx.fill();
    ctx.restore();
    // air-hole texture
    ctx.save();
    roundRect(ctx, left, top, tw, th, tw * 0.06); ctx.clip();
    ctx.fillStyle = 'rgba(120,180,230,.06)';
    const gap = tw * 0.085;
    for (let gx = left + gap; gx < right; gx += gap) for (let gy = top + gap; gy < bot; gy += gap) {
      ctx.beginPath(); ctx.arc(gx, gy, Math.max(1, tw * 0.006), 0, Math.PI * 2); ctx.fill();
    }
    // top sheen
    const sheen = ctx.createLinearGradient(0, top, 0, midY);
    sheen.addColorStop(0, 'rgba(255,255,255,.07)'); sheen.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen; ctx.fillRect(left, top, tw, th * 0.5);
    ctx.restore();
    // neon border
    ctx.save();
    ctx.shadowColor = '#5fd0ff'; ctx.shadowBlur = 16;
    roundRect(ctx, left, top, tw, th, tw * 0.06); ctx.lineWidth = 4; ctx.strokeStyle = '#5fd0ff'; ctx.stroke();
    ctx.restore();
    // centre line + circle + face-off spots
    ctx.strokeStyle = 'rgba(150,220,255,.40)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(left, midY); ctx.lineTo(right, midY); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, midY, tw * 0.16, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(150,220,255,.5)';
    ctx.beginPath(); ctx.arc(cx, midY, tw * 0.02, 0, Math.PI * 2); ctx.fill();
    for (const sy of [top + th * 0.2, bot - th * 0.2]) { ctx.beginPath(); ctx.arc(cx, sy, tw * 0.018, 0, Math.PI * 2); ctx.fill(); }
    // ---- goals (glowing mouths + posts) ----
    drawGoal(top, goalL, goalR, '#ffd166', flashWho === 'you' ? now < flashAt : false, now);
    drawGoal(bot, goalL, goalR, '#ff5fa2', flashWho === 'opp' ? now < flashAt : false, now);
    // ---- puck motion streak ----
    for (let i = 0; i < trail.length; i++) {
      const t = trail[i], a = (i / trail.length) * 0.32;
      ctx.fillStyle = `rgba(120,200,255,${a})`;
      ctx.beginPath(); ctx.arc(t.x, t.y, puckR * (0.5 + 0.5 * i / trail.length), 0, Math.PI * 2); ctx.fill();
    }
    // mallets + puck
    drawMallet(ai.x, ai.y, '#ffd166'); drawMallet(you.x, you.y, '#ff5fa2');
    drawPuck();
    if (now < msgUntil) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 8;
      ctx.fillStyle = '#ffe08a'; ctx.textAlign = 'center'; ctx.font = 'bold 32px Trebuchet MS, sans-serif';
      ctx.fillText(msg, cx, midY); ctx.restore();
    }
  }
  function drawGoal(y, gL, gR, col, flashing, now) {
    const dir = y === top ? 1 : -1;
    ctx.save();
    ctx.shadowColor = col; ctx.shadowBlur = flashing ? 26 + 10 * Math.sin(now / 60) : 12;
    ctx.strokeStyle = col; ctx.lineWidth = flashing ? 9 : 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(gL, y); ctx.lineTo(gR, y); ctx.stroke();
    // posts curling into the bed
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(gL, y); ctx.lineTo(gL, y + dir * th * 0.04); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(gR, y); ctx.lineTo(gR, y + dir * th * 0.04); ctx.stroke();
    ctx.restore();
  }
  function drawPuck() {
    // contact shadow
    ctx.fillStyle = 'rgba(0,0,0,.4)';
    ctx.beginPath(); ctx.ellipse(puck.x + puckR * 0.18, puck.y + puckR * 0.32, puckR * 1.02, puckR * 0.82, 0, 0, Math.PI * 2); ctx.fill();
    // disc body
    const g = ctx.createRadialGradient(puck.x - puckR * 0.35, puck.y - puckR * 0.4, puckR * 0.15, puck.x, puck.y, puckR * 1.1);
    g.addColorStop(0, '#3a4250'); g.addColorStop(0.5, '#1a1f27'); g.addColorStop(1, '#05070a');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(puck.x, puck.y, puckR, 0, Math.PI * 2); ctx.fill();
    // inset top face
    ctx.strokeStyle = 'rgba(150,180,210,.4)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(puck.x, puck.y, puckR * 0.62, 0, Math.PI * 2); ctx.stroke();
    // highlight
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    ctx.beginPath(); ctx.arc(puck.x - puckR * 0.32, puck.y - puckR * 0.36, puckR * 0.16, 0, Math.PI * 2); ctx.fill();
  }
  function drawMallet(x, y, col) {
    // contact shadow
    ctx.fillStyle = 'rgba(0,0,0,.38)';
    ctx.beginPath(); ctx.ellipse(x + malletR * 0.16, y + malletR * 0.26, malletR * 1.02, malletR * 0.86, 0, 0, Math.PI * 2); ctx.fill();
    // glowing rim
    ctx.save();
    ctx.shadowColor = col; ctx.shadowBlur = 12;
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, malletR, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // body shading
    const g = ctx.createRadialGradient(x - malletR * 0.35, y - malletR * 0.4, malletR * 0.1, x, y, malletR * 1.1);
    g.addColorStop(0, 'rgba(255,255,255,.45)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,.35)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, malletR, 0, Math.PI * 2); ctx.fill();
    // central knob
    ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.arc(x, y, malletR * 0.5, 0, Math.PI * 2); ctx.fill();
    const kg = ctx.createRadialGradient(x - malletR * 0.18, y - malletR * 0.2, malletR * 0.05, x, y, malletR * 0.5);
    kg.addColorStop(0, 'rgba(255,255,255,.35)'); kg.addColorStop(1, 'rgba(0,0,0,.1)');
    ctx.fillStyle = kg; ctx.beginPath(); ctx.arc(x, y, malletR * 0.5, 0, Math.PI * 2); ctx.fill();
  }

  function finish() {
    if (done) return; done = true;
    cancelAnimationFrame(raf);
    canvas().removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    const won = sYou >= TARGET;
    const coins = won ? 30 : Math.max(0, sYou) * 3;
    if (coins > 0) addCoins(coins);
    applyNeeds({ fun: won ? 20 : 12 });
    if (won) { track('games', 1); state.stats.gamesWon = (state.stats.gamesWon || 0) + 1; }
    save();
    closeOverlay();
    showModal(won ? '🏒 You win!' : '🏒 Match over',
      `Final score <b>${sYou}–${sOpp}</b>.<br>Earned <b>🪙 ${coins}</b>.`,
      [{ label: 'Done', onClick: () => { if (onDone) onDone(); } }]);
  }

  current = { stop: () => { done = true; cancelAnimationFrame(raf); canvas().removeEventListener('pointerdown', onDown); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); }, finish };
  raf = requestAnimationFrame(step);
}

// ================================================================== 8-Ball
const POOL_COLORS = { 1: '#e8b923', 2: '#2b5fd0', 3: '#d83a2f', 4: '#7d3cc0', 5: '#e8772e', 6: '#1f9d55', 7: '#8c2f2f', 8: '#161616', 9: '#e8b923', 10: '#2b5fd0', 11: '#d83a2f', 12: '#7d3cc0', 13: '#e8772e', 14: '#1f9d55', 15: '#8c2f2f' };
const groupOf = (n) => (n === 8 ? 'eight' : n < 8 ? 'solid' : 'stripe');

export function startPool(onDone) {
  const { ctx, W, H } = openOverlay('🎱 8-Ball — pocket your group, then the 8');
  let tw = Math.min(W * 0.92, H * 0.8 * 2);
  let th = tw / 2;
  if (th > H * 0.78) { th = H * 0.78; tw = th * 2; }
  const cx = W / 2, cy = H / 2;
  const left = cx - tw / 2, right = cx + tw / 2, top = cy - th / 2, bot = cy + th / 2;
  const rail = th * 0.07;
  const pl = left + rail, pr = right - rail, pt = top + rail, pb = bot - rail;
  const R = th * 0.03;
  // 1.4R: forgiving mouth + reliable pots, but below the 1.41R corner-rest
  // distance so balls settling in a corner aren't falsely sunk
  const pocketR = R * 1.4;
  const pockets = [[pl, pt], [cx, pt - rail * 0.2], [pr, pt], [pl, pb], [cx, pb + rail * 0.2], [pr, pb]];
  // cap below one ball-diameter per sub-step so fast balls can't tunnel through each other
  const FRICTION = 0.992, STOP = 0.05, REST = 0.92, MAXV = R * 1.9, SUBSTEPS = 3;

  // ---- build the balls ----
  const balls = [];
  const cue = { n: 0, x: pl + (pr - pl) * 0.26, y: cy, vx: 0, vy: 0, r: R, pocketed: false };
  balls.push(cue);
  const rows = [[1], [9, 2], [10, 8, 3], [11, 4, 12, 5], [6, 13, 14, 7, 15]];
  const apexX = pl + (pr - pl) * 0.66, dx = R * 1.74, dy = R * 2.04;
  rows.forEach((row, r) => row.forEach((n, k) => {
    balls.push({ n, x: apexX + r * dx, y: cy + (k - r / 2) * dy, vx: 0, vy: 0, r: R, pocketed: false });
  }));

  // ---- state ----
  let phase = 'aim';            // 'aim' | 'ballinhand' | 'sim' | 'aithink' | 'over'
  let turn = 'you';
  const grp = { you: null, ai: null };
  let aimAng = Math.PI, aimPow = 0, aiming = false, placing = false, thinkAt = 0;
  let foulBallInHand = false;   // next player gets to place the cue ball
  let msg = 'Drag back from the cue ball to aim, pull back to power up & release', msgUntil = performance.now() + 2800;
  let raf = null, done = false, won = false;

  const live = () => balls.filter((b) => !b.pocketed);
  const moving = () => live().some((b) => Math.hypot(b.vx, b.vy) > STOP);

  // ---- input: aim (slingshot: drag away from the cue, shoot the opposite way),
  //      or, after a scratch, ball-in-hand drag-to-place the cue ball ----
  const onDown = (e) => {
    if (turn !== 'you') return;
    if (phase === 'ballinhand') { placing = true; moveCueTo(ptr(e)); e.preventDefault(); return; }
    if (phase === 'aim') { aiming = true; updateAim(e); e.preventDefault(); }
  };
  const onMove = (e) => {
    if (placing) { moveCueTo(ptr(e)); e.preventDefault(); return; }
    if (aiming) { updateAim(e); e.preventDefault(); }
  };
  const onUp = () => {
    if (placing) { placing = false; phase = 'aim'; aimPow = 0; aiming = false; return; }
    if (!aiming) return; aiming = false;
    if (aimPow > 0.05) strike(aimAng, aimPow);
  };
  function updateAim(e) {
    const p = ptr(e);
    const dxp = cue.x - p.x, dyp = cue.y - p.y, d = Math.hypot(dxp, dyp);
    if (d > 4) aimAng = Math.atan2(dyp, dxp);
    aimPow = clamp(d / (tw * 0.32), 0, 1);
  }
  // place the cue ball at p, kept on the felt and pushed clear of other balls
  function moveCueTo(p) {
    let x = clamp(p.x, pl + R, pr - R), y = clamp(p.y, pt + R, pb - R);
    for (let iter = 0; iter < 10; iter++) {
      let moved = false;
      for (const b of balls) {
        if (b === cue || b.pocketed) continue;
        const dx = x - b.x, dy = y - b.y, d = Math.hypot(dx, dy);
        if (d < 2 * R) {
          const nx = d > 1e-4 ? dx / d : 1, ny = d > 1e-4 ? dy / d : 0;
          x = b.x + nx * 2 * R; y = b.y + ny * 2 * R; moved = true;
        }
      }
      x = clamp(x, pl + R, pr - R); y = clamp(y, pt + R, pb - R);
      if (!moved) break;
    }
    cue.x = x; cue.y = y;
  }
  canvas().addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);

  function strike(ang, pow) {
    cue.vx = Math.cos(ang) * MAXV * pow;
    cue.vy = Math.sin(ang) * MAXV * pow;
    pottedThisShot = []; scratchedThisShot = false; firstHit = null;
    phase = 'sim';
  }

  let pottedThisShot = [], scratchedThisShot = false, firstHit = null;

  function physics() {
    const arr = live();
    for (const b of arr) {
      b.x += b.vx; b.y += b.vy; b.vx *= FRICTION; b.vy *= FRICTION;
      if (Math.hypot(b.vx, b.vy) < STOP) { b.vx = 0; b.vy = 0; }
      const sp = Math.hypot(b.vx, b.vy); if (sp > MAXV) { b.vx *= MAXV / sp; b.vy *= MAXV / sp; }
    }
    // pockets
    for (const b of arr) {
      for (const [px, py] of pockets) {
        if (Math.hypot(b.x - px, b.y - py) < pocketR) {
          b.pocketed = true; b.vx = b.vy = 0;
          if (b === cue) scratchedThisShot = true; else pottedThisShot.push(b.n);
          break;
        }
      }
    }
    // rails — but leave a "jaw" gap near each pocket so balls can roll in instead
    // of being clamped (and falsely captured) when they rest in a corner
    for (const b of live()) {
      if (pockets.some(([px, py]) => Math.hypot(b.x - px, b.y - py) < pocketR * 1.6)) continue;
      if (b.x - R < pl) { b.x = pl + R; b.vx = Math.abs(b.vx) * REST; }
      if (b.x + R > pr) { b.x = pr - R; b.vx = -Math.abs(b.vx) * REST; }
      if (b.y - R < pt) { b.y = pt + R; b.vy = Math.abs(b.vy) * REST; }
      if (b.y + R > pb) { b.y = pb - R; b.vy = -Math.abs(b.vy) * REST; }
    }
    // ball-ball collisions
    const L = live();
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      const a = L[i], b = L[j];
      const dxx = b.x - a.x, dyy = b.y - a.y, d = Math.hypot(dxx, dyy);
      if (d > 0 && d < 2 * R) {
        const nx = dxx / d, ny = dyy / d, overlap = 2 * R - d;
        a.x -= nx * overlap / 2; a.y -= ny * overlap / 2; b.x += nx * overlap / 2; b.y += ny * overlap / 2;
        const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (vn < 0) {
          const jimp = -(1.94) * vn / 2; // e≈0.94, equal mass
          a.vx -= jimp * nx; a.vy -= jimp * ny; b.vx += jimp * nx; b.vy += jimp * ny;
          if (a === cue && firstHit === null) firstHit = b.n;
          if (b === cue && firstHit === null) firstHit = a.n;
        }
      }
    }
  }

  function resolveShot() {
    const potted = pottedThisShot.slice();
    const myGroupPotted = potted.filter((n) => grp[turn] && groupOf(n) === grp[turn]);
    const other = turn === 'you' ? 'ai' : 'you';

    // assign groups on the first legal pot of a non-8 ball
    if (!grp[turn] && potted.some((n) => n !== 8)) {
      const first = potted.find((n) => n !== 8);
      grp[turn] = groupOf(first); grp[other] = grp[turn] === 'solid' ? 'stripe' : 'solid';
    }

    const clearedGroup = (who) => grp[who] && balls.filter((b) => !b.pocketed && groupOf(b.n) === grp[who]).length === 0;

    // 8-ball outcomes
    if (potted.includes(8)) {
      const legal = grp[turn] && clearedGroup(turn) && !scratchedThisShot;
      endGame(legal ? turn : other, legal ? `${turn === 'you' ? 'You' : 'Opponent'} sank the 8 — game!` : 'Sank the 8 too early!');
      return;
    }

    if (scratchedThisShot) { // foul → cue ball in hand for the other player
      cue.pocketed = false; cue.vx = cue.vy = 0;
      cue.x = pl + (pr - pl) * 0.26; cue.y = cy;
      foulBallInHand = true;
      msg = (turn === 'you' ? 'Scratch! Opponent has ball in hand.' : 'Opponent scratched — ball in hand!');
      msgUntil = performance.now() + 2200;
      switchTurn(other); return;
    }

    const continues = (!grp[turn] && potted.length > 0) || (grp[turn] && myGroupPotted.length > 0);
    if (continues) { msg = (turn === 'you' ? 'Nice — go again!' : 'Opponent pots, again.'); msgUntil = performance.now() + 1200; setPhaseFor(turn); }
    else switchTurn(other);
  }

  function switchTurn(who) { turn = who; setPhaseFor(who); }
  function setPhaseFor(who) {
    if (who === 'ai') {
      if (foulBallInHand) { aiPlaceCue(); foulBallInHand = false; }
      phase = 'aithink'; thinkAt = performance.now() + 650;
    } else if (foulBallInHand) {
      foulBallInHand = false; phase = 'ballinhand'; aimPow = 0; placing = false;
      msg = 'Ball in hand — drag the cue ball to place it'; msgUntil = performance.now() + 3000;
    } else { phase = 'aim'; aimPow = 0; }
  }

  // ---- AI: pick the easiest of its balls toward a pocket, aim the cue at the ghost ball ----
  function aiTargets() {
    return grp.ai
      ? (balls.filter((b) => !b.pocketed && groupOf(b.n) === grp.ai).length ? balls.filter((b) => !b.pocketed && groupOf(b.n) === grp.ai) : balls.filter((b) => !b.pocketed && b.n === 8))
      : balls.filter((b) => !b.pocketed && b.n !== 0 && b.n !== 8);
  }
  // ball-in-hand for the AI: drop the cue ball where it lines up its easiest pot
  function aiPlaceCue() {
    let best = null;
    for (const tb of aiTargets()) for (const [px, py] of pockets) {
      const tp = Math.hypot(px - tb.x, py - tb.y);
      const gx = tb.x - (px - tb.x) / tp * 2 * R, gy = tb.y - (py - tb.y) / tp * 2 * R; // ghost ball
      let cxp = gx - (px - tb.x) / tp * tw * 0.16, cyp = gy - (py - tb.y) / tp * tw * 0.16;
      cxp = clamp(cxp, pl + R, pr - R); cyp = clamp(cyp, pt + R, pb - R);
      const score = 1 / (tp + 1);
      if (!best || score > best.score) best = { score, x: cxp, y: cyp };
    }
    if (best) moveCueTo({ x: best.x, y: best.y });
    cue.pocketed = false; cue.vx = cue.vy = 0;
  }
  function aiShoot() {
    const targets = aiTargets();
    let best = null;
    for (const tb of targets) {
      for (const [px, py] of pockets) {
        const tp = Math.hypot(px - tb.x, py - tb.y);
        const gx = tb.x - (px - tb.x) / tp * 2 * R, gy = tb.y - (py - tb.y) / tp * 2 * R; // ghost-ball
        const cg = Math.hypot(gx - cue.x, gy - cue.y);
        const cut = ((tb.x - cue.x) * (px - tb.x) + (tb.y - cue.y) * (py - tb.y)) / (Math.hypot(tb.x - cue.x, tb.y - cue.y) * tp + 1e-6);
        if (cut < 0.2) continue; // pocket is behind the cut — skip
        const score = cut - (cg + tp) / (tw * 2);
        if (!best || score > best.score) best = { score, ang: Math.atan2(gy - cue.y, gx - cue.x), dist: cg + tp };
      }
    }
    let ang, pow;
    if (best) { ang = best.ang + (Math.random() - 0.5) * 0.06; pow = clamp(best.dist / (tw * 0.95) + 0.25, 0.3, 1); }
    else { ang = Math.random() * Math.PI * 2; pow = 0.55; } // no shot — just break something up
    strike(ang, pow);
  }

  function step() {
    const now = performance.now();
    if (phase === 'sim') {
      for (let s = 0; s < SUBSTEPS; s++) physics();  // sub-step for stability
      if (!moving()) resolveShot();
    } else if (phase === 'aithink' && now >= thinkAt) {
      aiShoot();
    }
    draw(now);
    if (!done) raf = requestAnimationFrame(step);
  }

  function draw(now) {
    ctx.fillStyle = '#0a120d'; ctx.fillRect(0, 0, W, H);
    // ---- table body (wood frame) with a soft drop shadow ----
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 34; ctx.shadowOffsetY = 14;
    roundRect(ctx, left, top, tw, th, rail * 0.9);
    const wood = ctx.createLinearGradient(left, top, left, bot);
    wood.addColorStop(0, '#7a4f2c'); wood.addColorStop(0.5, '#5a3a20'); wood.addColorStop(1, '#3d2613');
    ctx.fillStyle = wood; ctx.fill();
    ctx.restore();
    roundRect(ctx, left, top, tw, th, rail * 0.9);
    ctx.strokeStyle = 'rgba(255,214,150,.20)'; ctx.lineWidth = 2; ctx.stroke();
    // ---- felt ----
    roundRect(ctx, pl, pt, pr - pl, pb - pt, rail * 0.25);
    const felt = ctx.createRadialGradient(cx, cy, th * 0.08, cx, cy, tw * 0.72);
    felt.addColorStop(0, '#2bab66'); felt.addColorStop(1, '#136b3c');
    ctx.fillStyle = felt; ctx.fill();
    // felt inner shadow near the cushions (vignette)
    ctx.save();
    roundRect(ctx, pl, pt, pr - pl, pb - pt, rail * 0.25); ctx.clip();
    ctx.lineWidth = rail * 0.7; ctx.strokeStyle = 'rgba(0,0,0,.20)';
    roundRect(ctx, pl, pt, pr - pl, pb - pt, rail * 0.25); ctx.stroke();
    ctx.restore();
    // head string + spot (classic table markings)
    ctx.strokeStyle = 'rgba(255,255,255,.10)'; ctx.lineWidth = 1;
    const headX = pl + (pr - pl) * 0.26;
    ctx.beginPath(); ctx.moveTo(headX, pt); ctx.lineTo(headX, pb); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    ctx.beginPath(); ctx.arc(pl + (pr - pl) * 0.66, cy, R * 0.18, 0, Math.PI * 2); ctx.fill();
    // sight diamonds on the rail
    ctx.fillStyle = 'rgba(245,236,212,.8)';
    const diamond = (x, y) => { ctx.beginPath(); ctx.arc(x, y, Math.max(2, R * 0.16), 0, Math.PI * 2); ctx.fill(); };
    for (const f of [0.25, 0.5, 0.75]) { diamond(pl + (pr - pl) * f, top + rail * 0.5); diamond(pl + (pr - pl) * f, bot - rail * 0.5); }
    diamond(left + rail * 0.5, cy); diamond(right - rail * 0.5, cy);
    // ---- pockets (leather rim + dark mouth) ----
    for (const [px, py] of pockets) {
      ctx.fillStyle = '#241a12'; ctx.beginPath(); ctx.arc(px, py, pocketR * 1.06, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#050706'; ctx.beginPath(); ctx.arc(px, py, pocketR * 0.8, 0, Math.PI * 2); ctx.fill();
    }
    // balls
    for (const b of balls) {
      if (b.pocketed) continue;
      if (b.n === 0) { drawBall(b, '#f4f4f0', false, ''); continue; }
      drawBall(b, POOL_COLORS[b.n], b.n > 8, String(b.n));
    }
    // ball-in-hand: highlight the cue ball waiting to be placed
    if (phase === 'ballinhand' && turn === 'you') {
      const pulse = 0.5 + 0.5 * Math.sin(now / 220);
      ctx.strokeStyle = `rgba(255,230,120,${0.45 + 0.4 * pulse})`;
      ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.arc(cue.x, cue.y, R + 5 + pulse * 3, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    // aim guide + cue stick
    if (phase === 'aim' && turn === 'you') {
      const len = tw * 0.4 * (0.25 + aimPow);
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2; ctx.setLineDash([8, 8]);
      ctx.beginPath(); ctx.moveTo(cue.x, cue.y); ctx.lineTo(cue.x + Math.cos(aimAng) * len, cue.y + Math.sin(aimAng) * len); ctx.stroke();
      ctx.setLineDash([]);
      drawCue();
    }
    // HUD
    const yg = grp.you ? (grp.you === 'solid' ? 'Solids' : 'Stripes') : '—';
    const turnTxt = phase === 'over' ? '' : turn === 'you' ? 'Your shot' : 'Opponent…';
    setScore(`You: ${yg}   ·   ${turnTxt}`);
    if (now < msgUntil) { ctx.fillStyle = '#ffd166'; ctx.textAlign = 'center'; ctx.font = 'bold 24px Trebuchet MS, sans-serif'; ctx.fillText(msg, cx, top - 14); }
  }
  function drawBall(b, col, stripe, label) {
    // contact shadow on the felt
    ctx.fillStyle = 'rgba(0,0,0,.30)';
    ctx.beginPath(); ctx.ellipse(b.x + R * 0.16, b.y + R * 0.30, R * 0.98, R * 0.8, 0, 0, Math.PI * 2); ctx.fill();
    // base colour
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(b.x, b.y, R, 0, Math.PI * 2); ctx.fill();
    if (stripe) { ctx.fillStyle = '#f4f4f0'; ctx.fillRect(b.x - R, b.y - R * 0.42, 2 * R, R * 0.84); ctx.save(); ctx.beginPath(); ctx.arc(b.x, b.y, R, 0, Math.PI * 2); ctx.clip(); ctx.fillStyle = col; ctx.fillRect(b.x - R, b.y - R, 2 * R, R * 0.58); ctx.fillRect(b.x - R, b.y + R * 0.42, 2 * R, R * 0.58); ctx.restore(); }
    // number badge
    if (label) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(b.x, b.y, R * 0.46, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#222'; ctx.textAlign = 'center'; ctx.font = `bold ${Math.round(R * 0.7)}px sans-serif`; ctx.fillText(label, b.x, b.y + R * 0.25); }
    // spherical shading: bright top-left, dark bottom-right
    const g = ctx.createRadialGradient(b.x - R * 0.35, b.y - R * 0.4, R * 0.1, b.x, b.y, R * 1.08);
    g.addColorStop(0, 'rgba(255,255,255,.42)'); g.addColorStop(0.45, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,.40)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, R, 0, Math.PI * 2); ctx.fill();
    // specular highlight
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.beginPath(); ctx.arc(b.x - R * 0.34, b.y - R * 0.4, R * 0.17, 0, Math.PI * 2); ctx.fill();
    // rim
    ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(b.x, b.y, R, 0, Math.PI * 2); ctx.stroke();
  }
  // the cue stick: sits behind the cue ball along the aim line, pulled back with power
  function drawCue() {
    const back = aimAng + Math.PI;          // stick points opposite the shot
    const gap = R * (0.7 + aimPow * 6.5);   // pull-back grows with power
    const stickLen = tw * 0.42;
    const cosB = Math.cos(back), sinB = Math.sin(back);
    const tipx = cue.x + cosB * (R + gap), tipy = cue.y + sinB * (R + gap);
    const butx = tipx + cosB * stickLen, buty = tipy + sinB * stickLen;
    const px = -sinB, py = cosB;            // perpendicular
    const wTip = Math.max(1.4, R * 0.16), wBut = Math.max(2.4, R * 0.42);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 4;
    // tapered wooden shaft
    const grad = ctx.createLinearGradient(tipx, tipy, butx, buty);
    grad.addColorStop(0, '#e3c79a'); grad.addColorStop(0.12, '#cda469'); grad.addColorStop(0.55, '#9c6a35'); grad.addColorStop(1, '#5a3618');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(tipx + px * wTip, tipy + py * wTip);
    ctx.lineTo(tipx - px * wTip, tipy - py * wTip);
    ctx.lineTo(butx - px * wBut, buty - py * wBut);
    ctx.lineTo(butx + px * wBut, buty + py * wBut);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    // lengthwise sheen
    ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(tipx + px * wTip * 0.35, tipy + py * wTip * 0.35); ctx.lineTo(butx + px * wBut * 0.35, buty + py * wBut * 0.35); ctx.stroke();
    // white ferrule then leather tip
    const fx = tipx + cosB * R * 0.55, fy = tipy + sinB * R * 0.55;
    ctx.fillStyle = '#efe9da';
    ctx.beginPath();
    ctx.moveTo(tipx + px * wTip, tipy + py * wTip);
    ctx.lineTo(tipx - px * wTip, tipy - py * wTip);
    ctx.lineTo(fx - px * wTip * 1.05, fy - py * wTip * 1.05);
    ctx.lineTo(fx + px * wTip * 1.05, fy + py * wTip * 1.05);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = aimPow > 0.85 ? '#cf4a3a' : '#3b6fb0';
    ctx.beginPath(); ctx.arc(tipx, tipy, wTip * 1.1, 0, Math.PI * 2); ctx.fill();
  }

  function endGame(winner, text) {
    won = winner === 'you'; phase = 'over';
    msg = text; msgUntil = performance.now() + 3000;
    setTimeout(finish, 900);
  }
  function finish() {
    if (done) return; done = true;
    cancelAnimationFrame(raf);
    canvas().removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    const coins = won ? 35 : 8;
    addCoins(coins); applyNeeds({ fun: won ? 22 : 12 });
    if (won) { track('games', 1); state.stats.gamesWon = (state.stats.gamesWon || 0) + 1; }
    save();
    closeOverlay();
    showModal(won ? '🎱 You win!' : '🎱 Game over',
      won ? `You cleared your group and sank the 8!<br>Earned <b>🪙 ${coins}</b>.` : `Better luck next rack.<br>Earned <b>🪙 ${coins}</b>.`,
      [{ label: 'Done', onClick: () => { if (onDone) onDone(); } }]);
  }

  current = { stop: () => { done = true; cancelAnimationFrame(raf); canvas().removeEventListener('pointerdown', onDown); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); }, finish };
  raf = requestAnimationFrame(step);
}

// shared rounded-rect path helper
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
