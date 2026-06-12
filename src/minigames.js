// Canvas 2D mini-games: Basketball (hold to charge, release to shoot) and
// Soda Pong (drag to aim, release to throw). Both pay out coins on exit.

import { state, save, addCoins } from './state.js';
import { showModal } from './ui.js';

const overlay = () => document.getElementById('minigame-overlay');
const canvas = () => document.getElementById('minigame-canvas');

let current = null; // { stop() }

function openOverlay(title) {
  document.getElementById('minigame-title').textContent = title;
  document.getElementById('minigame-score').textContent = '';
  overlay().classList.remove('hidden');
  const c = canvas();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  c.width = window.innerWidth * dpr;
  c.height = window.innerHeight * dpr;
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  return { ctx, W: window.innerWidth, H: window.innerHeight };
}

function closeOverlay() {
  overlay().classList.add('hidden');
  if (current) { current.stop(); current = null; }
}

export function initMinigameUI() {
  document.getElementById('minigame-quit').addEventListener('click', () => {
    if (current && current.finish) current.finish();
    else closeOverlay();
  });
}

function setScore(text) {
  document.getElementById('minigame-score').textContent = text;
}

// ================================================================ basketball
export function startBasketball(onDone) {
  const { ctx, W, H } = openOverlay('🏀 Basketball — hold & release to shoot');
  const groundY = H * 0.82;
  const hoopX = W * 0.78, rimY = H * 0.38, rimR = 34;
  const ballStart = { x: W * 0.2, y: groundY - 30 };

  let ball = { ...ballStart, vx: 0, vy: 0, flying: false, r: 18 };
  let charge = 0, charging = false;
  let score = 0, ballsLeft = 10;
  let raf = null, done = false;
  let msg = '', msgUntil = 0;

  function shoot() {
    const power = 11 + charge * 17;
    const ang = -Math.PI / 3.2; // fixed launch angle; power is the skill
    ball.vx = Math.cos(ang) * power;
    ball.vy = Math.sin(ang) * power;
    ball.flying = true;
  }

  function resetBall() {
    ball = { ...ballStart, vx: 0, vy: 0, flying: false, r: 18 };
    charge = 0;
  }

  const onDown = (e) => { if (!ball.flying && ballsLeft > 0) { charging = true; e.preventDefault(); } };
  const onUp = () => {
    if (charging && !ball.flying && ballsLeft > 0) {
      charging = false;
      ballsLeft--;
      shoot();
    }
  };
  canvas().addEventListener('pointerdown', onDown);
  window.addEventListener('pointerup', onUp);

  let prevBallY = ball.y;
  function step() {
    if (charging) charge = Math.min(1, charge + 0.018);

    if (ball.flying) {
      prevBallY = ball.y;
      ball.x += ball.vx;
      ball.y += ball.vy;
      ball.vy += 0.55; // gravity

      // score: ball crosses rim plane downward within the rim
      if (prevBallY < rimY && ball.y >= rimY && Math.abs(ball.x - hoopX) < rimR - 6 && ball.vy > 0) {
        score++;
        state.stats.hoopsScored++;
        msg = 'SWISH! 🔥'; msgUntil = performance.now() + 900;
      }
      // backboard bounce
      const bbX = hoopX + rimR + 14;
      if (ball.x + ball.r > bbX && ball.y > rimY - 90 && ball.y < rimY + 40 && ball.vx > 0) {
        ball.vx *= -0.55;
        ball.x = bbX - ball.r;
      }
      if (ball.y > groundY + 60 || ball.x > W + 60 || ball.x < -60) {
        if (ballsLeft > 0) resetBall();
        else finish();
      }
    }

    draw();
    setScore(`Score: ${score}  |  Balls: ${ballsLeft}`);
    if (!done) raf = requestAnimationFrame(step);
  }

  function draw() {
    ctx.fillStyle = '#16324a';
    ctx.fillRect(0, 0, W, H);
    // floor
    ctx.fillStyle = '#b5703f';
    ctx.fillRect(0, groundY, W, H - groundY);
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, groundY); ctx.lineTo(W, groundY); ctx.stroke();

    // hoop: pole, backboard, rim
    ctx.fillStyle = '#3c4854';
    ctx.fillRect(hoopX + rimR + 14, rimY - 110, 10, groundY - rimY + 110);
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(hoopX + rimR + 6, rimY - 100, 10, 120);
    ctx.strokeStyle = '#d64541';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(hoopX - rimR, rimY);
    ctx.lineTo(hoopX + rimR, rimY);
    ctx.stroke();
    // net
    ctx.strokeStyle = 'rgba(255,255,255,.5)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i <= 4; i++) {
      const nx = hoopX - rimR + (i / 4) * rimR * 2;
      ctx.beginPath();
      ctx.moveTo(nx, rimY);
      ctx.lineTo(hoopX - rimR * 0.5 + (i / 4) * rimR, rimY + 40);
      ctx.stroke();
    }

    // shooter pet (simple)
    ctx.font = '46px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(petEmoji(), ballStart.x - 40, groundY - 8);

    // power bar
    if (!ball.flying && ballsLeft > 0) {
      ctx.fillStyle = 'rgba(255,255,255,.2)';
      ctx.fillRect(ballStart.x - 60, groundY + 18, 160, 14);
      ctx.fillStyle = charge > 0.85 ? '#e74c3c' : '#ffd166';
      ctx.fillRect(ballStart.x - 60, groundY + 18, 160 * charge, 14);
    }

    // ball
    ctx.fillStyle = '#e8923a';
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#8a4b1d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.moveTo(ball.x - ball.r, ball.y);
    ctx.lineTo(ball.x + ball.r, ball.y);
    ctx.stroke();

    if (performance.now() < msgUntil) {
      ctx.fillStyle = '#ffd166';
      ctx.font = 'bold 34px Trebuchet MS, sans-serif';
      ctx.fillText(msg, W / 2, H * 0.25);
    }
  }

  function finish() {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    canvas().removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointerup', onUp);
    const coins = score * 5;
    save();
    if (coins > 0) addCoins(coins);
    closeOverlay();
    showModal('🏀 Game over!',
      `You sank <b>${score}</b> bucket${score === 1 ? '' : 's'}!<br>Earned <b>🪙 ${coins}</b>.`);
    if (onDone) onDone();
  }

  current = { stop: () => { done = true; cancelAnimationFrame(raf); }, finish };
  raf = requestAnimationFrame(step);
}

// ================================================================ soda pong
export function startSodaPong(onDone) {
  const { ctx, W, H } = openOverlay('🥤 Soda Pong — drag to aim, release to throw');
  // top-down table view: throw from bottom toward cups at top
  const tableX = W * 0.3, tableW = W * 0.4;
  const cupR = Math.min(26, tableW / 10);

  // 6-cup triangle at the far end
  const cups = [];
  const cy0 = H * 0.18;
  const rows = [[0], [-1, 1], [-2, 0, 2]];
  rows.forEach((row, ri) => {
    for (const off of row) {
      cups.push({ x: W / 2 + off * cupR * 1.3, y: cy0 + ri * cupR * 2.1, alive: true });
    }
  });

  const start = { x: W / 2, y: H * 0.86 };
  let ball = null; // { x, y, vx, vy }
  let aim = null;  // { dx, dy } while dragging
  let throwsLeft = 10, sunk = 0;
  let raf = null, done = false;
  let msg = '', msgUntil = 0;

  const onDown = (e) => {
    if (ball || throwsLeft <= 0) return;
    aim = { x0: e.clientX, y0: e.clientY, dx: 0, dy: 0 };
    e.preventDefault();
  };
  const onMove = (e) => {
    if (!aim) return;
    aim.dx = e.clientX - aim.x0;
    aim.dy = e.clientY - aim.y0;
  };
  const onUp = () => {
    if (!aim) return;
    const power = Math.min(1, Math.hypot(aim.dx, aim.dy) / 220);
    if (power > 0.15 && aim.dy < 0) { // must drag upward
      throwsLeft--;
      const len = Math.hypot(aim.dx, aim.dy);
      ball = {
        x: start.x, y: start.y,
        vx: (aim.dx / len) * power * 26,
        vy: (aim.dy / len) * power * 26,
      };
    }
    aim = null;
  };
  canvas().addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);

  function step() {
    if (ball) {
      ball.x += ball.vx;
      ball.y += ball.vy;
      ball.vx *= 0.985; // table friction
      ball.vy *= 0.985;
      // side wall bounce
      if (ball.x < tableX || ball.x > tableX + tableW) ball.vx *= -0.7;
      ball.x = Math.max(tableX, Math.min(tableX + tableW, ball.x));

      for (const cup of cups) {
        if (!cup.alive) continue;
        if (Math.hypot(ball.x - cup.x, ball.y - cup.y) < cupR * 0.8) {
          cup.alive = false;
          sunk++;
          state.stats.cupsSunk++;
          msg = 'SPLASH! 🥤'; msgUntil = performance.now() + 900;
          ball = null;
          break;
        }
      }
      if (ball && (ball.y < -40 || Math.hypot(ball.vx, ball.vy) < 0.4)) ball = null;
    }

    if (!ball && (throwsLeft <= 0 || cups.every(c => !c.alive))) {
      draw();
      finish();
      return;
    }

    draw();
    setScore(`Cups: ${sunk}/6  |  Throws: ${throwsLeft}`);
    if (!done) raf = requestAnimationFrame(step);
  }

  function draw() {
    ctx.fillStyle = '#1d2e3e';
    ctx.fillRect(0, 0, W, H);
    // table
    ctx.fillStyle = '#3e7cb1';
    ctx.fillRect(tableX, H * 0.08, tableW, H * 0.84);
    ctx.strokeStyle = 'rgba(255,255,255,.4)';
    ctx.lineWidth = 4;
    ctx.strokeRect(tableX, H * 0.08, tableW, H * 0.84);

    // cups
    for (const cup of cups) {
      if (!cup.alive) continue;
      ctx.fillStyle = '#d64541';
      ctx.beginPath();
      ctx.arc(cup.x, cup.y, cupR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#7a1f1c';
      ctx.beginPath();
      ctx.arc(cup.x, cup.y, cupR * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }

    // thrower pet
    ctx.font = '44px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(petEmoji(), start.x, start.y + 50);

    // aim arrow
    if (aim) {
      const power = Math.min(1, Math.hypot(aim.dx, aim.dy) / 220);
      ctx.strokeStyle = power > 0.8 ? '#e74c3c' : '#ffd166';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(start.x + aim.dx * 1.2, start.y + aim.dy * 1.2);
      ctx.stroke();
    }

    // ball
    const bx = ball ? ball.x : start.x;
    const by = ball ? ball.y : start.y;
    ctx.fillStyle = '#f5f0e0';
    ctx.beginPath();
    ctx.arc(bx, by, 11, 0, Math.PI * 2);
    ctx.fill();

    if (performance.now() < msgUntil) {
      ctx.fillStyle = '#ffd166';
      ctx.font = 'bold 34px Trebuchet MS, sans-serif';
      ctx.fillText(msg, W / 2, H * 0.5);
    }
  }

  function finish() {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    canvas().removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    const coins = sunk * 8 + (cups.every(c => !c.alive) ? 20 : 0);
    save();
    if (coins > 0) addCoins(coins);
    closeOverlay();
    showModal('🥤 Soda Pong over!',
      `You sank <b>${sunk}/6</b> cups!${cups.every(c => !c.alive) ? ' PERFECT GAME! +🪙 20 bonus!' : ''}<br>Earned <b>🪙 ${coins}</b>.`);
    if (onDone) onDone();
  }

  current = { stop: () => { done = true; cancelAnimationFrame(raf); }, finish };
  raf = requestAnimationFrame(step);
}

function petEmoji() {
  const map = { cat: '🐱', dog: '🐶', bear: '🐻', duck: '🦆', hamster: '🐹' };
  return map[state.petType] || '🐾';
}
