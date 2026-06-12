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

const $ = (id) => document.getElementById(id);

// ----------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({
  canvas: $('game-canvas'),
  antialias: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9ed4e8);
scene.fog = new THREE.Fog(0x9ed4e8, 90, 200);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 400);

// lights
scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x5a7a4a, 0.9));
const sun = new THREE.DirectionalLight(0xfff2d8, 1.2);
sun.position.set(40, 70, 30);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -90; sun.shadow.camera.right = 90;
sun.shadow.camera.top = 90; sun.shadow.camera.bottom = -90;
scene.add(sun);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ----------------------------------------------------------- locations
const campus = buildCampus();
const library = buildLibrary();
const dormCommon = buildDormCommon();
const bedroom = buildBedroom();
bedroom.rebuildDecor(state.room);

campus.spawn = { x: 0, z: 10 };
campus.camOffset = new THREE.Vector3(0, 21, 16);
library.camOffset = new THREE.Vector3(0, 19, 13);
dormCommon.camOffset = new THREE.Vector3(0, 17, 12);
bedroom.camOffset = new THREE.Vector3(0, 14, 10);

const LOCATIONS = {
  campus: { def: campus, name: '🏫 Campus', sky: 0x9ed4e8 },
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
  openPomodoroSetup((minutes) => {
    seated = true;
    player.position.set(it.seatPos.x, 0.45, it.seatPos.z);
    player.rotation.y = Math.PI; // face the desk
    startPomodoro(minutes, () => {
      seated = false;
      player.position.set(it.seatPos.x, 0, it.seatPos.z + 1.6);
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

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  if (!player || !currentLoc) { renderer.render(scene, camera); return; }

  const loc = LOCATIONS[currentLoc].def;
  const uiOpen = isModalOpen();
  let moving = false;

  if (!uiOpen && !seated && input.active) {
    const speed = currentLoc === 'campus' ? 9 : 6;
    const dx = input.x * speed * dt;
    const dz = input.y * speed * dt;
    moveWithCollision(player.position, dx, dz, loc);
    player.rotation.y = Math.atan2(input.x, input.y);
    moving = true;
  }
  player.userData.animate(t, moving);

  // camera follow
  const targetCam = player.position.clone().add(loc.camOffset);
  camera.position.lerp(targetCam, Math.min(1, dt * 5));
  camera.lookAt(player.position.x, player.position.y + 1, player.position.z);

  // NPCs (campus only)
  if (currentLoc === 'campus') {
    updateNpcs(npcs, dt, t, player.position, chattingWith);
    updateNpcBubbles(npcs, camera, t);
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

  renderer.render(scene, camera);
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
  goto: (key, sp) => switchLocation(key, sp),
  interact: (it) => runInteract(it),
  state,
};
