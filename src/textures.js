// Procedural canvas textures + toon material helpers — the core of the v2 look.

import * as THREE from 'three';

// ---------------------------------------------------------- toon shading
let gradientMap = null;
export function toonGradient() {
  if (gradientMap) return gradientMap;
  // Smooth multi-step ramp (linear-filtered) — soft, natural falloff across
  // surfaces rather than hard flat toon bands, which read as less flat/dull.
  const data = new Uint8Array([84, 128, 168, 202, 230, 255]);
  gradientMap = new THREE.DataTexture(data, 6, 1, THREE.RedFormat);
  gradientMap.minFilter = THREE.LinearFilter;
  gradientMap.magFilter = THREE.LinearFilter;
  gradientMap.needsUpdate = true;
  return gradientMap;
}

const matCache = new Map();
export function toonMat(color, opts = {}) {
  const { noCache, ...matOpts } = opts; // noCache is ours, not a material property
  const key = typeof color === 'number' && !matOpts.map && !noCache ? color : null;
  if (key !== null && matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), ...matOpts });
  if (key !== null) matCache.set(key, m);
  return m;
}

// ---------------------------------------------------------- canvas helpers
function canvasTexture(w, h, draw, { repeat, anisotropy = 8 } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  // three.js clamps this to the hardware max, so requesting 16 just means
  // "as sharp as the GPU allows" for grazing-angle ground/paths/floors.
  tex.anisotropy = anisotropy;
  if (repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
  }
  return tex;
}

function hex(n) { return '#' + n.toString(16).padStart(6, '0'); }

// multiply an "#rrggbb" colour by a factor (clamped) → "rgb(r,g,b)"
function shadeColor(hexStr, f) {
  const n = parseInt(hexStr.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  return `rgb(${r},${g},${b})`;
}

// Deterministic pseudo-random so textures look the same every load.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ---------------------------------------------------------- ground (painted map)
// One big texture for the whole campus ground: grass + rounded sandy paths.
// worldToUV must match the ground plane (220 x 160 centered at origin).
export function campusGroundTexture(GW = 220, GH = 160) {
  const W = 1536, H = Math.round(1536 * GH / GW);
  const X = (wx) => (wx + GW / 2) / GW * W;
  const Y = (wz) => (wz + GH / 2) / GH * H;
  const S = W / GW; // world units → pixels

  return canvasTexture(W, H, (ctx) => {
    const r = rng(42);

    // grass base with soft blotches
    ctx.fillStyle = '#7cc05e';
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 380; i++) {
      const shade = ['#86c968', '#74b856', '#8fce72', '#6fb352'][Math.floor(r() * 4)];
      ctx.fillStyle = shade;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.ellipse(r() * W, r() * H, 18 + r() * 60, 14 + r() * 44, r() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // sandy paths — rounded strokes (AC style). Coordinates mirror world.js layout.
    const path = (pts, width) => {
      ctx.strokeStyle = '#e8d5a8';
      ctx.lineWidth = width * S;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(X(pts[0][0]), Y(pts[0][1]));
      for (let i = 1; i < pts.length; i++) ctx.lineTo(X(pts[i][0]), Y(pts[i][1]));
      ctx.stroke();
      // darker edge pass for depth
      ctx.strokeStyle = 'rgba(160,135,90,0.25)';
      ctx.lineWidth = (width + 0.7) * S;
      ctx.globalCompositeOperation = 'destination-over';
      ctx.beginPath();
      ctx.moveTo(X(pts[0][0]), Y(pts[0][1]));
      for (let i = 1; i < pts.length; i++) ctx.lineTo(X(pts[i][0]), Y(pts[i][1]));
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    };

    path([[-95, 0], [95, 0]], 7);          // main horizontal
    path([[0, -65], [0, 65]], 7);          // main vertical
    path([[-55, -65], [-55, 65]], 6);      // west avenue
    path([[55, -65], [55, 65]], 6);        // east avenue
    path([[-95, -42], [95, -42]], 6);      // north walk
    path([[-95, 42], [95, 42]], 6);        // south walk

    // plaza circle around the fountain
    ctx.fillStyle = '#e8d5a8';
    ctx.beginPath();
    ctx.arc(X(0), Y(0), 9 * S, 0, Math.PI * 2);
    ctx.fill();

    // speckles: pebbles on sand, grass texture dots.
    // Sand test mirrors the path layout above (cheaper than getImageData).
    const isSandAt = (wx, wz) =>
      Math.abs(wz) < 3.5 || Math.abs(wx) < 3.5 ||
      Math.abs(wx - 55) < 3 || Math.abs(wx + 55) < 3 ||
      Math.abs(wz - 42) < 3 || Math.abs(wz + 42) < 3 ||
      Math.hypot(wx, wz) < 9;
    for (let i = 0; i < 5200; i++) {
      const px = r() * W, py = r() * H;
      const isSand = isSandAt(px / S - GW / 2, py / S - GH / 2);
      ctx.fillStyle = isSand
        ? (r() < 0.5 ? 'rgba(190,165,120,0.6)' : 'rgba(255,245,220,0.6)')
        : (r() < 0.5 ? 'rgba(100,160,75,0.5)' : 'rgba(150,210,115,0.5)');
      const sz = isSand ? 1.5 + r() * 2.5 : 1 + r() * 2;
      ctx.beginPath();
      ctx.arc(px, py, sz, 0, Math.PI * 2);
      ctx.fill();
    }
  }, { anisotropy: 16 });
}

// ---------------------------------------------------------- material textures
// Near-neutral by default so the material's color tint shows true.
export function woodPlanks(base = '#ece6da', dark = '#d8d0c0') {
  return canvasTexture(256, 256, (ctx, W, H) => {
    const r = rng(7);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, W, H);
    const rows = 6;
    for (let i = 0; i < rows; i++) {
      const y = i * H / rows;
      ctx.fillStyle = `rgba(0,0,0,${0.06 + r() * 0.05})`;
      ctx.fillRect(0, y, W, 3);
      // grain
      ctx.strokeStyle = 'rgba(80,70,55,0.15)';
      ctx.lineWidth = 1.5;
      for (let g = 0; g < 3; g++) {
        ctx.beginPath();
        const gy = y + 8 + r() * (H / rows - 14);
        ctx.moveTo(0, gy);
        ctx.bezierCurveTo(W * 0.3, gy + (r() - 0.5) * 8, W * 0.7, gy + (r() - 0.5) * 8, W, gy);
        ctx.stroke();
      }
      // plank seam offset
      const seam = ((i % 2) * 0.5 + r() * 0.3) * W;
      ctx.fillStyle = 'rgba(0,0,0,0.10)';
      ctx.fillRect(seam, y, 3, H / rows);
    }
    ctx.fillStyle = dark;
    ctx.globalAlpha = 0.12;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }, { repeat: [2, 1] });
}

export function brickTexture(base = '#e0b8a0', mortar = '#f2e8da') {
  return canvasTexture(256, 256, (ctx, W, H) => {
    const r = rng(13);
    ctx.fillStyle = mortar;
    ctx.fillRect(0, 0, W, H);
    const bh = H / 8, bw = W / 4;
    for (let row = 0; row < 8; row++) {
      const off = (row % 2) * bw / 2;
      for (let col = -1; col < 5; col++) {
        const shades = [base, '#d8ab90', '#e6c2ac', '#d4a288'];
        ctx.fillStyle = shades[Math.floor(r() * shades.length)];
        ctx.beginPath();
        ctx.roundRect(col * bw + off + 2, row * bh + 2, bw - 4, bh - 4, 3);
        ctx.fill();
      }
    }
  }, { repeat: [3, 2] });
}

export function shingleTexture(base = '#d96a55') {
  return canvasTexture(256, 256, (ctx, W, H) => {
    const r = rng(23);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, W, H);
    const rows = 7, sw = W / 6;
    for (let row = 0; row < rows; row++) {
      const y = row * H / rows;
      const off = (row % 2) * sw / 2;
      for (let col = -1; col < 7; col++) {
        ctx.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.08})`;
        ctx.beginPath();
        ctx.arc(col * sw + off + sw / 2, y + H / rows, sw / 2, Math.PI, 0);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(0, y, W, 2.5);
    }
  }, { repeat: [3, 2] });
}

export function awningTexture(c1 = '#e85d6a', c2 = '#fdf6ec') {
  return canvasTexture(128, 64, (ctx, W, H) => {
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? c1 : c2;
      ctx.fillRect(i * W / 8, 0, W / 8, H);
    }
  }, { repeat: [2, 1] });
}

export function courtTexture() {
  return canvasTexture(512, 320, (ctx, W, H) => {
    ctx.fillStyle = '#cf8455';
    ctx.fillRect(0, 0, W, H);
    const keyW = 102, keyH = 110, cy = H / 2;
    // painted keys (darker) at BOTH ends
    ctx.fillStyle = '#c2754a';
    ctx.fillRect(8, cy - keyH / 2, keyW, keyH);
    ctx.fillRect(W - 8 - keyW, cy - keyH / 2, keyW, keyH);
    ctx.strokeStyle = '#f5f0e0';
    ctx.lineWidth = 5;
    ctx.strokeRect(8, 8, W - 16, H - 16);
    ctx.beginPath(); ctx.moveTo(W / 2, 8); ctx.lineTo(W / 2, H - 8); ctx.stroke();
    ctx.beginPath(); ctx.arc(W / 2, cy, 42, 0, Math.PI * 2); ctx.stroke();
    // key boxes + free-throw arcs, mirrored on each end
    ctx.strokeRect(8, cy - keyH / 2, keyW, keyH);
    ctx.beginPath(); ctx.arc(8 + keyW, cy, 55, Math.PI / 2, Math.PI * 1.5); ctx.stroke();
    ctx.strokeRect(W - 8 - keyW, cy - keyH / 2, keyW, keyH);
    ctx.beginPath(); ctx.arc(W - 8 - keyW, cy, 55, -Math.PI / 2, Math.PI / 2); ctx.stroke();
  });
}

// gradient sky for the dome
export function skyTexture(top = '#6ec1e8', horizon = '#d8f0f4') {
  return canvasTexture(16, 256, (ctx, W, H) => {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, top);
    g.addColorStop(0.55, '#a8ddf0');
    g.addColorStop(1, horizon);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  });
}

// A reflective glass curtain-wall: a grid of tinted panels (sky-reflection
// gradient + diagonal highlight streaks, with a few warm-lit interior panels)
// separated by dark structural mullions. Baked lighting makes it read as glass
// under flat toon shading. `cols`/`rows` set the panel grid.
export function glassCurtain(cols = 7, rows = 4, { tint = '#86b9c8', frame = '#23262c', lit = 0.14, seed = 7 } = {}) {
  const cell = 110, m = 8; // panel size + mullion thickness (px)
  return canvasTexture(cols * cell, rows * cell, (ctx) => {
    const r = rng(seed * 131 + cols * 17 + rows);
    ctx.fillStyle = frame; ctx.fillRect(0, 0, cols * cell, rows * cell);
    for (let cx = 0; cx < cols; cx++) for (let cy = 0; cy < rows; cy++) {
      const x = cx * cell + m, y = cy * cell + m, w = cell - 2 * m, h = cell - 2 * m;
      const warm = r() < lit;
      const g = ctx.createLinearGradient(x, y, x, y + h);
      if (warm) { g.addColorStop(0, '#ffe7b6'); g.addColorStop(1, '#eaae5e'); }
      else {
        g.addColorStop(0, shadeColor(tint, 1.32 + (r() - 0.5) * 0.22));   // sky at top
        g.addColorStop(0.55, shadeColor(tint, 1.0 + (r() - 0.5) * 0.12));
        g.addColorStop(1, shadeColor(tint, 0.66 + (r() - 0.5) * 0.12));   // ground at bottom
      }
      ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
      // diagonal reflection streaks
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
      ctx.globalAlpha = warm ? 0.10 : 0.22; ctx.fillStyle = '#ffffff';
      const sw = w * 0.42;
      ctx.beginPath();
      ctx.moveTo(x + w * 0.05, y + h); ctx.lineTo(x + w * 0.05 + sw, y);
      ctx.lineTo(x + w * 0.22 + sw, y); ctx.lineTo(x + w * 0.22, y + h); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = warm ? 0.06 : 0.12;
      ctx.beginPath();
      ctx.moveTo(x + w * 0.55, y + h); ctx.lineTo(x + w * 0.55 + sw * 0.5, y);
      ctx.lineTo(x + w * 0.63 + sw * 0.5, y); ctx.lineTo(x + w * 0.63, y + h); ctx.closePath(); ctx.fill();
      ctx.restore();
      // crisp top + left highlight on the glass within its frame
      ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(x, y, w, 3);
    }
  });
}

// soft radial glow (for lamps) and round soft cloud puff
export function glowTexture(color = '255,235,170') {
  return canvasTexture(128, 128, (ctx, W, H) => {
    const g = ctx.createRadialGradient(W / 2, H / 2, 4, W / 2, H / 2, W / 2);
    g.addColorStop(0, `rgba(${color},0.85)`);
    g.addColorStop(0.4, `rgba(${color},0.3)`);
    g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  });
}

export function cloudTexture() {
  return canvasTexture(256, 128, (ctx, W, H) => {
    const r = rng(99);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      ctx.ellipse(W * 0.2 + r() * W * 0.6, H * 0.45 + (r() - 0.5) * H * 0.25,
        20 + r() * 38, 14 + r() * 22, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

export function leafTexture() {
  return canvasTexture(32, 32, (ctx, W, H) => {
    ctx.fillStyle = '#7cb55e';
    ctx.beginPath();
    ctx.ellipse(W / 2, H / 2, 9, 14, 0.6, 0, Math.PI * 2);
    ctx.fill();
  });
}

// ---------------------------------------------------------- library interior
// Aged, muted book-spine colours (Ref 3 cozy vibe).
// Muted, leather-bound vintage spines — deep maroons, forest greens, navy,
// walnut and aged-gold/parchment — for a cozy antique-library read (no neons).
const BOOK_SPINES = [
  '#5e2b2b', '#33445e', '#2f5742', '#8a6a24', '#473352', '#6e4230',
  '#5a2730', '#2f5559', '#7a5230', '#46532f', '#5e3424', '#b3a07a',
  '#3d2f24', '#704029', '#274038', '#8a7a4a',
];

// One bookcase unit, mapped 1:1 onto a fixed-size shelf face (no tiling, so
// no seam matching needed). Pass different seeds for variety between units.
export function bookcaseTexture(seed = 5) {
  return canvasTexture(384, 512, (ctx, W, H) => {
    const r = rng(seed);
    ctx.fillStyle = '#2c1f15'; // dark cabinet interior
    ctx.fillRect(0, 0, W, H);
    const rows = 5, rh = H / rows;
    for (let row = 0; row < rows; row++) {
      const shelfY = row * rh + rh - 7;
      let x = 4 + r() * 6;
      while (x < W - 10) {
        const bw = 8 + r() * 18;
        if (x + bw > W - 4) break;
        const bh = rh * (0.6 + r() * 0.32);
        const lean = r() < 0.12 ? (r() - 0.5) * 0.05 : 0;
        const col = BOOK_SPINES[Math.floor(r() * BOOK_SPINES.length)];
        ctx.save();
        ctx.translate(x + bw / 2, shelfY);
        ctx.rotate(lean);
        ctx.fillStyle = col;
        ctx.fillRect(-bw / 2, -bh, bw, bh);
        ctx.fillStyle = 'rgba(255,255,255,0.13)';
        ctx.fillRect(-bw / 2, -bh, 1.5, bh);           // spine highlight
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(bw / 2 - 1.5, -bh, 1.5, bh);       // spine shadow
        if (r() < 0.5) {                                // gilt band
          ctx.fillStyle = 'rgba(255,235,180,0.4)';
          ctx.fillRect(-bw / 2, -bh * (0.45 + r() * 0.25), bw, 2);
        }
        ctx.restore();
        x += bw + (r() < 0.1 ? 3 + r() * 5 : 0.6);
      }
      ctx.fillStyle = '#5d3e27';                         // wooden shelf board
      ctx.fillRect(0, shelfY, W, 7);
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(0, shelfY + 7, W, 3);
    }
  }, { anisotropy: 8 });
}

// Light marble/stone tile floor. 2x2 tiles with grid lines on the edges so the
// grid stays continuous when the texture repeats.
export function stoneFloor(base = '#e9e3d6') {
  return canvasTexture(256, 256, (ctx, W, H) => {
    const r = rng(31);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 120; i++) {
      ctx.fillStyle = `rgba(176,168,150,${0.04 + r() * 0.06})`;
      const s = 8 + r() * 38;
      ctx.beginPath();
      ctx.ellipse(r() * W, r() * H, s, s * 0.7, r() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(120,112,96,0.22)';
    ctx.lineWidth = 2;
    for (const x of [0, W / 2, W]) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (const y of [0, H / 2, H]) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  }, { repeat: [9, 6], anisotropy: 8 });
}

// Subtle cream plaster wall.
export function plaster(base = '#ece2cc') {
  return canvasTexture(256, 256, (ctx, W, H) => {
    const r = rng(17);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = `rgba(0,0,0,${0.02 + r() * 0.03})`;
      const s = 10 + r() * 28;
      ctx.beginPath();
      ctx.ellipse(r() * W, r() * H, s, s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }, { repeat: [4, 3], anisotropy: 4 });
}

// Soft round contact shadow — laid on the floor under props/furniture so objects
// feel grounded (cheap fake AO) instead of floating flatly on the floor.
export function softShadow() {
  return canvasTexture(128, 128, (ctx, W, H) => {
    const g = ctx.createRadialGradient(W / 2, H / 2, 2, W / 2, H / 2, W / 2);
    g.addColorStop(0, 'rgba(20,16,10,0.5)');
    g.addColorStop(0.55, 'rgba(20,16,10,0.22)');
    g.addColorStop(1, 'rgba(20,16,10,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  });
}

// Warm hardwood floorboards (cozier than marble for a library).
export function hardwoodFloor(base = '#94795a') {
  return canvasTexture(256, 256, (ctx, W, H) => {
    const r = rng(53);
    ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);
    const planks = 5, ph = H / planks;
    // cooler, more neutral oak boards — the old palette was orange-heavy and
    // read red under the warm library lights
    const tones = ['#9f8460', '#937a58', '#a98e68', '#8a7250', '#b0936f'];
    for (let i = 0; i < planks; i++) {
      const y = i * ph;
      ctx.fillStyle = tones[Math.floor(r() * tones.length)];
      ctx.fillRect(0, y + 1, W, ph - 2);
      ctx.strokeStyle = 'rgba(70,52,32,0.18)'; ctx.lineWidth = 1;
      for (let gg = 0; gg < 6; gg++) {
        ctx.beginPath(); const gy = y + r() * ph;
        ctx.moveTo(0, gy); ctx.bezierCurveTo(W * 0.3, gy + (r() - 0.5) * 6, W * 0.7, gy + (r() - 0.5) * 6, W, gy); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(38,26,14,0.40)'; ctx.fillRect(0, y, W, 2);            // board seam
      ctx.fillRect(((i % 2) * 0.5 + 0.25) * W, y, 2, ph);                          // staggered end joint
    }
  }, { repeat: [9, 7], anisotropy: 8 });
}

// Subtle woven fabric / leather grain for upholstery.
export function fabricTexture(base = '#7a4f33') {
  return canvasTexture(128, 128, (ctx, W, H) => {
    const r = rng(61);
    ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < W; i += 4) { ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(i, 0, 2, H); }
    for (let j = 0; j < H; j += 4) { ctx.fillStyle = 'rgba(0,0,0,0.06)'; ctx.fillRect(0, j, W, 2); }
    for (let i = 0; i < 500; i++) { ctx.fillStyle = `rgba(0,0,0,${r() * 0.05})`; ctx.fillRect(r() * W, r() * H, 2, 2); }
  }, { repeat: [2, 2] });
}

// Woven round rug with concentric borders + a centre medallion.
export function rugTexture(base = '#8ba2bb', border = '#5f7088') {
  return canvasTexture(256, 256, (ctx, W, H) => {
    const r = rng(71);
    ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 2600; i++) { ctx.fillStyle = `rgba(255,255,255,${r() * 0.06})`; ctx.fillRect(r() * W, r() * H, 2, 1); }
    for (let i = 0; i < 2600; i++) { ctx.fillStyle = `rgba(0,0,0,${r() * 0.06})`; ctx.fillRect(r() * W, r() * H, 1, 2); }
    ctx.strokeStyle = border;
    ctx.lineWidth = 12; ctx.beginPath(); ctx.arc(W / 2, H / 2, W * 0.45, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(W / 2, H / 2, W * 0.38, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(W / 2, H / 2, W * 0.16, 0, Math.PI * 2); ctx.stroke();
  });
}

export { hex };
