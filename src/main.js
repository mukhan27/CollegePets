// College Pets — entry point. Scene setup, pet selection, player movement,
// location switching, and the contextual interaction system.

import * as THREE from 'three';
import { state, save, PET_TYPES } from './state.js';
import { initInput, input } from './input.js';
import { createPet, setWearables } from './petFactory.js';
import { buildCampus } from './world.js';
import { buildLibrary, buildDormCommon, buildBedroom } from './interiors.js';
import { createNpcs, updateNpcs, updateNpcBubbles, clearNpcBubbles } from './npcs.js';
import {
  showModal, isModalOpen, initChatUI, openChat, openShop, openDecorator,
  openPomodoroSetup, startPomodoro,
} from './ui.js';
import { initMinigameUI, startBasketball, startSodaPong } from './minigames.js';
import { createComposer } from './postfx.js';

const $ = (id) => document.getElementById(id);

// ----------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({
  canvas: $('game-canvas'),
  antialias: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd8f0f4);
scene.fog = new THREE.Fog(0xd8f0f4, 90, 220);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 600);

// lights — warm sun + sky-tinted fill
scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x6a9a52, 0.85));
const sun = new THREE.DirectionalLight(0xfff0d0, 1.45);
sun.position.set(45, 80, 35);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -95; sun.shadow.camera.right = 95;
sun.shadow.camera.top = 95; sun.shadow.camera.bottom = -95;
sun.shadow.bias = -0.0004;
scene.add(sun);

// cool sky-bounce fill from the shadow side (no shadow) lifts dark faces
const fill = new THREE.DirectionalLight(0xbcd6ff, 0.32);
fill.position.set(-55, 38, -42);
scene.add(fill);
// warm rim/back light pops silhouettes — the AC "soft glowing edge" read
const rim = new THREE.DirectionalLight(0xfff1de, 0.5);
rim.position.set(-25, 26, -75);
scene.add(rim);

// ----------------------------------------------------------- post-processing
// Quality tier chosen up front (phones get cheaper bloom + tilt-shift);
// override at runtime with __cp.setQuality('high'|'low').
function detectTier() {
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
  const small = Math.min(window.innerWidth, window.innerHeight) < 500;
  const heavyDpr = window.devicePixelRatio > 2.5;
  return mobile || small || heavyDpr ? 'low' : 'high';
}
const fx = createComposer(renderer, scene, camera, { tier: detectTier() });

function resize() {
  const w = window.innerWidth || document.documentElement.clientWidth;
  const h = window.innerHeight || document.documentElement.clientHeight;
  if (!w || !h) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  fx.setSize(w, h);
}
window.addEventListener('resize', resize);
// Re-fit once the canvas actually has a layout box — guards against a 0-sized
// viewport at boot (late layout) and mobile chrome show/hide changing the height.
new ResizeObserver(resize).observe($('game-canvas'));

// ----------------------------------------------------------- locations
const campus = buildCampus();
const library = buildLibrary();
const dormCommon = buildDormCommon();
const bedroom = buildBedroom();
bedroom.rebuildDecor(state.room);

campus.spawn = { x: 0, z: 10 };
campus.camOffset = new THREE.Vector3(0, 21, 16);
// interiors: lower, cozier 3/4 angle (sits below the column/light tops so their
// caps aren't visible — they rise out of frame — and gives the warm AC feel)
library.camOffset = new THREE.Vector3(0, 11, 18);
dormCommon.camOffset = new THREE.Vector3(0, 9, 14);
bedroom.camOffset = new THREE.Vector3(0, 8, 12);

const LOCATIONS = {
  campus: { def: campus, name: '🏫 Campus', sky: 0xd8f0f4 },
  library: { def: library, name: '📚 Library', sky: 0x3a3328 },
  dormCommon: { def: dormCommon, name: '🏠 Maple Dorm', sky: 0x40364a },
  bedroom: { def: bedroom, name: '🛏️ My Room', sky: 0x2e3a4a },
};
for (const loc of Object.values(LOCATIONS)) {
  loc.def.root.visible = false;
  scene.add(loc.def.root);
}

let currentLoc = null;
let player = null;
let npcs = [];
let chattingWith = null;
let seated = false;
let activeLevel = 0;     // which floor the player is on (multi-level locations only)
let playerTargetY = 0;   // smoothed target elevation (stairs / mezzanine)

function switchLocation(key, spawnOverride) {
  if (currentLoc) LOCATIONS[currentLoc].def.root.visible = false;
  if (currentLoc === 'campus') clearNpcBubbles(npcs);

  currentLoc = key;
  const loc = LOCATIONS[key];
  loc.def.root.visible = true;
  scene.background.set(loc.sky);
  scene.fog.color.set(loc.sky);
  scene.fog.near = key === 'campus' ? 90 : 1000;
  scene.fog.far = key === 'campus' ? 200 : 2000;

  const sp = spawnOverride || loc.def.spawn;
  player.position.set(sp.x, 0, sp.z);
  activeLevel = 0; playerTargetY = 0; // always spawn on the ground floor
  player.rotation.y = key === 'campus' ? Math.PI : Math.PI; // face the camera-ish
  $('hud-location').textContent = loc.name;

  // snap camera so we don't lerp across the map
  camera.position.copy(player.position).add(loc.def.camOffset);
  camera.lookAt(player.position);
}

// ----------------------------------------------------------- movement
function moveWithCollision(pos, dx, dz, def) {
  const R = 0.7; // player radius
  const tryAxis = (nx, nz) => {
    for (const c of def.colliders) {
      if (nx > c.x - c.w / 2 - R && nx < c.x + c.w / 2 + R &&
          nz > c.z - c.d / 2 - R && nz < c.z + c.d / 2 + R) return false;
    }
    return true;
  };
  const b = def.bounds;
  let nx = THREE.MathUtils.clamp(pos.x + dx, b.minX, b.maxX);
  if (tryAxis(nx, pos.z)) pos.x = nx;
  let nz = THREE.MathUtils.clamp(pos.z + dz, b.minZ, b.maxZ);
  if (tryAxis(pos.x, nz)) pos.z = nz;
}

// Multi-level movement. Locations without `levels`/`stairs` behave exactly as
// before (flat ground). The library adds a walkable mezzanine reached by a
// staircase: while inside a stair zone the player is funneled along the steps
// and lifted in Y; crossing either landing flips the active floor.
function levelDef(def) {
  if (def.levels) return def.levels[activeLevel] || def.levels[0];
  return { y: 0, bounds: def.bounds, colliders: def.colliders };
}
function stairAt(def, x, z) {
  if (!def.stairs) return null;
  for (const s of def.stairs) {
    if (x >= s.xMin && x <= s.xMax && z >= s.zMin && z <= s.zMax) return s;
  }
  return null;
}
function rampHeight(s, z) {
  const p = THREE.MathUtils.clamp((s.zBottom - z) / (s.zBottom - s.zTop), 0, 1);
  return s.yBottom + p * (s.yTop - s.yBottom);
}
function movePlayer(def, dx, dz) {
  const pos = player.position;
  const s = stairAt(def, pos.x, pos.z);
  if (s) {
    // funnel along the tread in X; move freely in Z and hand off to a floor at
    // either landing (no Z clamp, so the player can step off onto the balcony).
    const R = 0.7;
    pos.x = THREE.MathUtils.clamp(pos.x + dx, s.xMin + R, s.xMax - R);
    pos.z += dz;
    if (pos.z < s.zTop) { activeLevel = 1; playerTargetY = s.yTop; }
    else if (pos.z > s.zBottom) { activeLevel = 0; playerTargetY = s.yBottom; }
    else playerTargetY = rampHeight(s, pos.z);
    return;
  }
  const lvl = levelDef(def);
  moveWithCollision(pos, dx, dz, lvl);
  const entered = stairAt(def, pos.x, pos.z);
  playerTargetY = entered ? rampHeight(entered, pos.z) : lvl.y;
}

// ----------------------------------------------------------- interactions
const interactBtn = $('interact-btn');
let activeInteract = null;

function findInteract() {
  if (!player || seated) return null;
  const def = LOCATIONS[currentLoc].def;
  let best = null, bestDist = Infinity;
  for (const it of def.interactables) {
    const d = Math.hypot(player.position.x - it.x, player.position.z - it.z);
    if (d < it.r && d < bestDist) { best = it; bestDist = d; }
  }
  // NPCs are mobile interactables on campus
  if (currentLoc === 'campus') {
    for (const n of npcs) {
      const d = Math.hypot(player.position.x - n.mesh.position.x, player.position.z - n.mesh.position.z);
      if (d < 2.6 && d < bestDist) {
        best = { id: 'chat', npc: n, label: `💬 Chat with ${n.def.name}` };
        bestDist = d;
      }
    }
  }
  return best;
}

function runInteract(it) {
  switch (it.id) {
    case 'chat':
      chattingWith = it.npc;
      openChat(it.npc, () => { chattingWith = null; });
      break;
    case 'library': switchLocation('library'); break;
    case 'exit_library': switchLocation('campus', { x: campus.doors.library.x, z: campus.doors.library.z + 1 }); break;
    case 'dorm': switchLocation('dormCommon'); break;
    case 'exit_dorm': switchLocation('campus', { x: campus.doors.dorm.x, z: campus.doors.dorm.z + 1 }); break;
    case 'enter_bedroom': switchLocation('bedroom'); break;
    case 'exit_bedroom': switchLocation('dormCommon', { x: 8, z: -6.5 }); break;
    case 'shop': openShop(() => setWearables(player, state.equipped)); break;
    case 'decorate': openDecorator(() => bedroom.rebuildDecor(state.room)); break;
    case 'basketball': startBasketball(); break;
    case 'studentcenter': startSodaPong(); break;
    case 'study_seat': beginStudy(it); break;
    case 'vending':
      showModal('🥤 Vending machine', 'You grab a fizzy soda. Refreshing! (+ vibes, no charge — RA covered it)');
      break;
    case 'cafeteria':
      showModal('🍕 Dining Hall', 'You grab a slice of legendary dining-hall pizza. It\'s… edible! Energy restored. 💪');
      break;
  }
}

interactBtn.addEventListener('click', () => {
  if (activeInteract && !isModalOpen()) runInteract(activeInteract);
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyE' && e.target.tagName !== 'INPUT' && activeInteract && !isModalOpen()) {
    runInteract(activeInteract);
  }
});

// ----------------------------------------------------------- studying
function beginStudy(it) {
  const floorY = it.seatPos.y || 0; // seats can be on the mezzanine
  openPomodoroSetup((minutes) => {
    seated = true;
    player.position.set(it.seatPos.x, floorY + 0.45, it.seatPos.z);
    player.rotation.y = Math.PI; // face the desk
    startPomodoro(minutes, () => {
      seated = false;
      player.position.set(it.seatPos.x, floorY, it.seatPos.z + 1.6);
      playerTargetY = floorY; // hold the floor height after standing up
    });
  });
}

// ----------------------------------------------------------- pet selection
function setupSelectScreen() {
  const cards = $('pet-cards');
  let selected = state.petType || null;
  for (const p of PET_TYPES) {
    const card = document.createElement('div');
    card.className = 'pet-card' + (selected === p.id ? ' selected' : '');
    card.innerHTML = `<div class="pet-emoji">${p.emoji}</div>
      <div class="pet-label">${p.label}</div>
      <div class="pet-desc">${p.desc}</div>`;
    card.addEventListener('click', () => {
      selected = p.id;
      cards.querySelectorAll('.pet-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      updateStartBtn();
    });
    cards.appendChild(card);
  }
  const nameInput = $('pet-name-input');
  nameInput.value = state.petName || '';
  const startBtn = $('start-btn');
  function updateStartBtn() {
    startBtn.disabled = !(selected && nameInput.value.trim().length > 0);
  }
  nameInput.addEventListener('input', updateStartBtn);
  updateStartBtn();

  startBtn.addEventListener('click', () => {
    state.petType = selected;
    state.petName = nameInput.value.trim();
    save();
    $('select-screen').classList.add('hidden');
    startGame();
  });
}

// ----------------------------------------------------------- game start + loop
const clock = new THREE.Clock();

function startGame() {
  player = createPet(state.petType, { equipped: state.equipped });
  scene.add(player);

  npcs = createNpcs(campus.root);

  $('hud').classList.remove('hidden');
  $('hud-name').textContent = state.petName;
  $('coin-count').textContent = state.coins;

  switchLocation('campus');
  showModal(`Welcome to Birchwood University, ${state.petName}! 🎉`,
    `Roam the campus with the <b>joystick</b> (or WASD).<br><br>
     📚 <b>Library</b> — sit down for a pomodoro study session (earns coins)<br>
     💬 <b>Students</b> — walk up to a pet and chat<br>
     🏀 <b>Court</b> & 🥤 <b>Student Center</b> — mini-games<br>
     🛍️ <b>Campus Store</b> — clothes & room decor<br>
     🏠 <b>Maple Dorm</b> — your customizable room`);
}

function frame(dt, t) {
  if (!player || !currentLoc) { fx.composer.render(dt); return; }

  const loc = LOCATIONS[currentLoc].def;
  const uiOpen = isModalOpen();
  let moving = false;

  if (!uiOpen && !seated && input.active) {
    const speed = currentLoc === 'campus' ? 9 : 6;
    const dx = input.x * speed * dt;
    const dz = input.y * speed * dt;
    movePlayer(loc, dx, dz);
    player.rotation.y = Math.atan2(input.x, input.y);
    moving = true;
  }
  player.userData.animate(t, moving);
  // smooth elevation toward the active floor / stair height (not while seated)
  if (!seated) player.position.y += (playerTargetY - player.position.y) * Math.min(1, dt * 12);

  // camera follow
  const targetCam = player.position.clone().add(loc.camOffset);
  camera.position.lerp(targetCam, Math.min(1, dt * 5));
  camera.lookAt(player.position.x, player.position.y + 1, player.position.z);

  // NPCs + ambient world animation (campus only)
  if (currentLoc === 'campus') {
    updateNpcs(npcs, dt, t, player.position, chattingWith);
    updateNpcBubbles(npcs, camera, t);
    if (campus.animate) campus.animate(t, dt);
  }

  // interaction prompt
  const it = uiOpen || seated ? null : findInteract();
  if (it) {
    activeInteract = it;
    interactBtn.textContent = it.label;
    interactBtn.classList.remove('hidden');
  } else {
    activeInteract = null;
    interactBtn.classList.add('hidden');
  }

  fx.composer.render(dt);
}

function tick() {
  frame(Math.min(clock.getDelta(), 0.05), clock.elapsedTime);
}

// ----------------------------------------------------------- boot
initInput();
initChatUI();
initMinigameUI();
setupSelectScreen();
renderer.setAnimationLoop(tick);

// debug/playtest hook (console): __cp.goto('library'), __cp.player.position, …
window.__cp = {
  get player() { return player; },
  get npcs() { return npcs; },
  get level() { return activeLevel; },
  goto: (key, sp) => switchLocation(key, sp),
  warp: (x, z) => { if (player) player.position.set(x, player.position.y, z); },
  interact: (it) => runInteract(it),
  state,
  LOCATIONS,
  renderer,
  fx,
  setQuality: (n) => fx.setQuality(n),
  pause: () => renderer.setAnimationLoop(null),
  resume: () => renderer.setAnimationLoop(tick),
  step: (dt = 0.05, n = 1) => { for (let i = 0; i < n; i++) frame(dt, performance.now() / 1000); },
  redress: () => setWearables(player, state.equipped),
};
