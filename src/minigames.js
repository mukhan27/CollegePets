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

  function resetPuck(dir) {
    puck = { x: cx, y: midY + dir * th * 0.12, vx: 0, vy: 0 };
    serveAt = performance.now() + 700;
  }
  function goal(who) {
    if (who === 'you') { sYou++; msg = 'GOAL! 🎉'; } else { sOpp++; msg = 'Opponent scores'; }
    msgUntil = performance.now() + 1000;
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
    }
    draw(now);
    setScore(`You ${sYou} — ${sOpp} Opp`);
    if (!done) raf = requestAnimationFrame(step);
  }

  function draw(now) {
    ctx.fillStyle = '#0e1622'; ctx.fillRect(0, 0, W, H);
    // table
    roundRect(ctx, left, top, tw, th, tw * 0.06); ctx.fillStyle = '#16314a'; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = '#5fd0ff'; ctx.stroke();
    // centre line + circle
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(left, midY); ctx.lineTo(right, midY); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, midY, tw * 0.16, 0, Math.PI * 2); ctx.stroke();
    // goals
    ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(goalL, top); ctx.lineTo(goalR, top); ctx.stroke();
    ctx.strokeStyle = '#ff5fa2';
    ctx.beginPath(); ctx.moveTo(goalL, bot); ctx.lineTo(goalR, bot); ctx.stroke();
    // mallets
    drawMallet(ai.x, ai.y, '#ffd166'); drawMallet(you.x, you.y, '#ff5fa2');
    // puck
    ctx.fillStyle = '#0c0f14'; ctx.beginPath(); ctx.arc(puck.x, puck.y, puckR, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 2; ctx.stroke();
    if (now < msgUntil) { ctx.fillStyle = '#ffd166'; ctx.textAlign = 'center'; ctx.font = 'bold 30px Trebuchet MS, sans-serif'; ctx.fillText(msg, cx, top + th * 0.3); }
  }
  function drawMallet(x, y, col) {
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, malletR, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.arc(x, y, malletR * 0.55, 0, Math.PI * 2); ctx.fill();
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
  let phase = 'aim';            // 'aim' | 'sim' | 'aithink' | 'over'
  let turn = 'you';
  const grp = { you: null, ai: null };
  let aimAng = Math.PI, aimPow = 0, aiming = false, thinkAt = 0;
  let msg = 'Drag back from the cue ball to aim & shoot', msgUntil = performance.now() + 2600;
  let raf = null, done = false, won = false;

  const live = () => balls.filter((b) => !b.pocketed);
  const moving = () => live().some((b) => Math.hypot(b.vx, b.vy) > STOP);

  // ---- aiming (player slingshot: drag away from the cue, shoot the opposite way) ----
  const onDown = (e) => {
    if (phase !== 'aim' || turn !== 'you') return;
    aiming = true; updateAim(e); e.preventDefault();
  };
  const onMove = (e) => { if (aiming) { updateAim(e); e.preventDefault(); } };
  const onUp = () => {
    if (!aiming) return; aiming = false;
    if (aimPow > 0.05) strike(aimAng, aimPow);
  };
  function updateAim(e) {
    const p = ptr(e);
    const dxp = cue.x - p.x, dyp = cue.y - p.y, d = Math.hypot(dxp, dyp);
    if (d > 4) aimAng = Math.atan2(dyp, dxp);
    aimPow = clamp(d / (tw * 0.32), 0, 1);
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

    if (scratchedThisShot) { // foul → respot cue, pass turn
      respotCue();
      msg = (turn === 'you' ? 'Scratch! ' : 'Opponent scratched. ') + 'Turn passes.'; msgUntil = performance.now() + 1800;
      switchTurn(other); return;
    }

    const continues = (!grp[turn] && potted.length > 0) || (grp[turn] && myGroupPotted.length > 0);
    if (continues) { msg = (turn === 'you' ? 'Nice — go again!' : 'Opponent pots, again.'); msgUntil = performance.now() + 1200; setPhaseFor(turn); }
    else switchTurn(other);
  }

  function respotCue() {
    cue.pocketed = false; cue.vx = cue.vy = 0;
    cue.x = pl + (pr - pl) * 0.26; cue.y = cy;
    // nudge off any overlap
    for (const b of live()) if (b !== cue && Math.hypot(b.x - cue.x, b.y - cue.y) < 2 * R) cue.x -= 2 * R;
  }
  function switchTurn(who) { turn = who; setPhaseFor(who); }
  function setPhaseFor(who) {
    if (who === 'ai') { phase = 'aithink'; thinkAt = performance.now() + 650; }
    else { phase = 'aim'; aimPow = 0; }
  }

  // ---- AI: pick the easiest of its balls toward a pocket, aim the cue at the ghost ball ----
  function aiShoot() {
    const targets = grp.ai
      ? (balls.filter((b) => !b.pocketed && groupOf(b.n) === grp.ai).length ? balls.filter((b) => !b.pocketed && groupOf(b.n) === grp.ai) : balls.filter((b) => !b.pocketed && b.n === 8))
      : balls.filter((b) => !b.pocketed && b.n !== 0 && b.n !== 8);
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
    ctx.fillStyle = '#0c1410'; ctx.fillRect(0, 0, W, H);
    // rails + felt
    roundRect(ctx, left, top, tw, th, rail * 0.8); ctx.fillStyle = '#5a3a22'; ctx.fill();
    roundRect(ctx, pl, pt, pr - pl, pb - pt, rail * 0.3); ctx.fillStyle = '#1f8a52'; ctx.fill();
    // pockets
    ctx.fillStyle = '#0a0d0b';
    for (const [px, py] of pockets) { ctx.beginPath(); ctx.arc(px, py, pocketR * 0.82, 0, Math.PI * 2); ctx.fill(); }
    // balls
    for (const b of balls) {
      if (b.pocketed) continue;
      if (b.n === 0) { drawBall(b, '#f4f4f0', false, ''); continue; }
      drawBall(b, POOL_COLORS[b.n], b.n > 8, String(b.n));
    }
    // aim guide
    if (phase === 'aim' && turn === 'you') {
      const len = tw * 0.4 * (0.25 + aimPow);
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2; ctx.setLineDash([8, 8]);
      ctx.beginPath(); ctx.moveTo(cue.x, cue.y); ctx.lineTo(cue.x + Math.cos(aimAng) * len, cue.y + Math.sin(aimAng) * len); ctx.stroke();
      ctx.setLineDash([]);
      if (aiming) { // power pip
        ctx.fillStyle = aimPow > 0.85 ? '#e74c3c' : '#ffd166';
        ctx.beginPath(); ctx.arc(cue.x - Math.cos(aimAng) * tw * 0.32 * aimPow, cue.y - Math.sin(aimAng) * tw * 0.32 * aimPow, R * 0.7, 0, Math.PI * 2); ctx.fill();
      }
    }
    // HUD
    const yg = grp.you ? (grp.you === 'solid' ? 'Solids' : 'Stripes') : '—';
    const turnTxt = phase === 'over' ? '' : turn === 'you' ? 'Your shot' : 'Opponent…';
    setScore(`You: ${yg}   ·   ${turnTxt}`);
    if (now < msgUntil) { ctx.fillStyle = '#ffd166'; ctx.textAlign = 'center'; ctx.font = 'bold 24px Trebuchet MS, sans-serif'; ctx.fillText(msg, cx, top - 14); }
  }
  function drawBall(b, col, stripe, label) {
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(b.x, b.y, R, 0, Math.PI * 2); ctx.fill();
    if (stripe) { ctx.fillStyle = '#f4f4f0'; ctx.fillRect(b.x - R, b.y - R * 0.42, 2 * R, R * 0.84); ctx.save(); ctx.beginPath(); ctx.arc(b.x, b.y, R, 0, Math.PI * 2); ctx.clip(); ctx.fillStyle = col; ctx.fillRect(b.x - R, b.y - R, 2 * R, R * 0.58); ctx.fillRect(b.x - R, b.y + R * 0.42, 2 * R, R * 0.58); ctx.restore(); }
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(b.x, b.y, R, 0, Math.PI * 2); ctx.stroke();
    if (label) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(b.x, b.y, R * 0.46, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#222'; ctx.textAlign = 'center'; ctx.font = `bold ${Math.round(R * 0.7)}px sans-serif`; ctx.fillText(label, b.x, b.y + R * 0.25); }
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
