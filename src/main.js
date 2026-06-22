// College Pets — entry point. Scene setup, pet selection, player movement,
// location switching, and the contextual interaction system.

import * as THREE from 'three';
import { state, save, PET_TYPES, furnitureCount } from './state.js';
import { initInput, input } from './input.js';
import { createPet, setWearables } from './petFactory.js';
import { buildCampus } from './world.js';
import { buildLibrary, buildDormCommon, buildBedroom, buildLectureRoom, buildLectureLobby, buildShop, buildDiningHall, buildStudentUnion } from './interiors.js';
import { openFoodMenu, initDiningUI } from './dining.js';
import { createCupPong } from './cuppong.js';
import { startTrivia, startMemory, initArcadeUI } from './arcade.js';
import { startFishing, initFishingUI } from './fishing.js';
import { createNpcs, updateNpcs, updateNpcBubbles, clearNpcBubbles } from './npcs.js';
import {
  showModal, isModalOpen, initChatUI, openChat, openShop, openDecorator,
  openPomodoroSetup, startPomodoro,
} from './ui.js';
import { initMinigameUI } from './minigames.js';
import { createComposer } from './postfx.js';
import { createBasketball } from './basketball.js';
import { openTryOn, isTryOnOpen } from './tryon.js';
import { initSystems, tickSystems, track, openCampus, applyNeeds, newDayCheck, toast } from './systems.js';

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
  // explicit override for testing, e.g. open the page with ?q=high (or ?q=low)
  const forced = new URLSearchParams(location.search).get('q');
  if (forced === 'high' || forced === 'low') return forced;
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
const lectureLobby = buildLectureLobby();
const lectureRoom = buildLectureRoom();
const dormCommon = buildDormCommon();
const shopInterior = buildShop();
const diningHall = buildDiningHall();
const studentUnion = buildStudentUnion();
const bedroom = buildBedroom(state.room.layout);
state.room.layout = bedroom.editor.layout; // keep state in sync with the live layout

campus.spawn = { x: 0, z: 10 };
campus.camOffset = new THREE.Vector3(0, 12, 19); // closer 3/4 angle, matched to the interior view
// Ground elevation field: the player rises up the library steps onto its raised
// stone porch (building sits at -58,-36; porch top = 1.4) instead of clipping
// through them. 0 everywhere else.
campus.groundHeight = (x, z) => {
  if (x < -67 || x > -49) return 0;          // outside the porch width
  if (z <= -17) return 1.4;                   // up on the porch
  if (z >= -13.6) return 0;                    // lawn in front of the steps
  return 1.4 * (z + 13.6) / (-17 + 13.6);      // ramp up the steps
};
// interiors: lower, cozier 3/4 angle (sits below the column/light tops so their
// caps aren't visible — they rise out of frame — and gives the warm AC feel)
library.camOffset = new THREE.Vector3(0, 11, 18);
lectureLobby.camOffset = new THREE.Vector3(0, 11, 17);
lectureRoom.camOffset = new THREE.Vector3(0, 13, 21);
dormCommon.camOffset = new THREE.Vector3(0, 9, 14);
shopInterior.camOffset = new THREE.Vector3(0, 10, 16);
diningHall.camOffset = new THREE.Vector3(0, 11, 17);
studentUnion.camOffset = new THREE.Vector3(0, 12, 18);
bedroom.camOffset = new THREE.Vector3(0, 8, 12);

// Per-location colour mood (exposure + tilt-shift grade). The library is graded
// darker, warmer and more vignetted for a cosy, candle-lit feel; everywhere
// else uses the bright default.
const DEFAULT_MOOD = { exposure: 1.12, vignette: 0.42, warmth: 0.022, saturation: 1.12 };
const LOCATIONS = {
  campus: { def: campus, name: '🏫 Campus', sky: 0xd8f0f4 },
  library: { def: library, name: '📚 Library', sky: 0x2a2018,
    mood: { exposure: 0.95, vignette: 0.55, warmth: 0.045, saturation: 1.06 } },
  lectureLobby: { def: lectureLobby, name: '🏛️ Lecture Building', sky: 0x2a3340 },
  lectureRoom: { def: lectureRoom, name: '🏛️ Lecture Hall', sky: 0x1e2630 },
  dormCommon: { def: dormCommon, name: '🏠 Maple Dorm', sky: 0x40364a },
  shopInterior: { def: shopInterior, name: '🛍️ Campus Store', sky: 0x3a2a20 },
  diningHall: { def: diningHall, name: '🍽️ Dining Hall', sky: 0x2e2620 },
  studentUnion: { def: studentUnion, name: '🎮 Student Union', sky: 0x241f33 },
  bedroom: { def: bedroom, name: '🛏️ My Room', sky: 0x2e3a4a },
};
for (const loc of Object.values(LOCATIONS)) {
  loc.def.root.visible = false;
  scene.add(loc.def.root);
}

const basketball = createBasketball({ parent: campus.root, court: campus.court });
let bballActive = false;
const BBALL_CAM_OFFSET = new THREE.Vector3(0, 7, 11); // closer than the campus follow
const cuppong = createCupPong(scene);
let cuppongActive = false;

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

  // apply the location's colour mood (exposure + grade)
  const mood = loc.mood || DEFAULT_MOOD;
  renderer.toneMappingExposure = mood.exposure;
  const gu = fx.passes.grade.uniforms;
  gu.vignetteStrength.value = mood.vignette;
  gu.warmth.value = mood.warmth;
  gu.saturation.value = mood.saturation;

  input.camYaw = 0; // reset the view rotation entering a new scene

  const sp = spawnOverride || loc.def.spawn;
  player.position.set(sp.x, 0, sp.z);
  activeLevel = 0; playerTargetY = 0; // always spawn on the ground floor
  player.rotation.y = key === 'campus' ? Math.PI : Math.PI; // face the camera-ish
  $('hud-location').textContent = loc.name;
  $('edit-room-btn').classList.toggle('hidden', key !== 'bedroom'); // bottom-left edit button in the bedroom

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

// Safety net: if the player ends up *inside* a collider (e.g. after standing off
// a bench, exiting a mini-game, or a teleport), nudge them out to the nearest
// edge so they can never get permanently stuck.
function resolveStuck(pos, colliders, R = 0.7) {
  for (const c of colliders) {
    const minX = c.x - c.w / 2 - R, maxX = c.x + c.w / 2 + R, minZ = c.z - c.d / 2 - R, maxZ = c.z + c.d / 2 + R;
    if (pos.x > minX && pos.x < maxX && pos.z > minZ && pos.z < maxZ) {
      const dxL = pos.x - minX, dxR = maxX - pos.x, dzL = pos.z - minZ, dzR = maxZ - pos.z;
      const m = Math.min(dxL, dxR, dzL, dzR);
      if (m === dxL) pos.x = minX; else if (m === dxR) pos.x = maxX;
      else if (m === dzL) pos.z = minZ; else pos.z = maxZ;
    }
  }
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
  if (entered) playerTargetY = rampHeight(entered, pos.z);
  else if (def.groundHeight) playerTargetY = lvl.y + def.groundHeight(pos.x, pos.z);
  else playerTargetY = lvl.y;
}

// How far (0..1) the camera can sit along the player→desired-camera line before
// it would sink into a large building, so the trailing camera doesn't clip
// through walls when the player rounds the back of a building.
function cameraClearT(px, pz, cx, cz, colliders) {
  const steps = 18;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const sx = px + (cx - px) * t, sz = pz + (cz - pz) * t;
    for (const c of colliders) {
      if (c.w < 14 && c.d < 13) continue; // buildings only
      const hw = c.w / 2 + 0.4, hd = c.d / 2 + 0.4;
      if (sx > c.x - hw && sx < c.x + hw && sz > c.z - hd && sz < c.z + hd) {
        return Math.max(0.06, (i - 1) / steps); // stop just before the wall
      }
    }
  }
  return 1;
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
    case 'lecturehall': switchLocation('lectureLobby'); break;
    case 'exit_lecture': switchLocation('campus', { x: campus.doors.lecturehall.x, z: campus.doors.lecturehall.z + 1 }); break;
    case 'enter_lecture_room': switchLocation('lectureRoom'); break;
    case 'exit_lecture_room': switchLocation('lectureLobby', { x: -8, z: -11 }); break;
    case 'dorm': switchLocation('dormCommon'); break;
    case 'exit_dorm': switchLocation('campus', { x: campus.doors.dorm.x, z: campus.doors.dorm.z + 1 }); break;
    case 'enter_bedroom': switchLocation('bedroom'); break;
    case 'exit_bedroom': switchLocation('dormCommon', { x: 8, z: -6.5 }); break;
    case 'shop': switchLocation('shopInterior'); break;
    case 'exit_shop': switchLocation('campus', { x: campus.doors.shop.x, z: campus.doors.shop.z + 1 }); break;
    case 'shop_buy': openShop(() => setWearables(player, state.equipped)); break;
    case 'try_on': openTryOn(player, () => setWearables(player, state.equipped)); break;
    case 'decorate': enterEdit(); break;
    case 'basketball':
      bballActive = true;
      basketball.enter(player, () => { bballActive = false; basketball.exit(); });
      break;
    case 'study_seat': beginStudy(it); break;
    case 'lounge': beginLounge(it); break;
    case 'relax': beginLounge(it); applyNeeds({ fun: 16, social: 10 }); toast('Ahh… that\'s relaxing.', '🌳'); break;
    case 'fish': startFishing(); break;
    case 'stand_up': endLounge(); break;
    case 'vending':
      showModal('🥤 Vending machine', 'You grab a fizzy soda. Refreshing! (+ vibes, no charge — RA covered it)');
      break;
    case 'cafeteria': switchLocation('diningHall'); break;
    case 'exit_dining': switchLocation('campus', { x: campus.doors.cafeteria.x, z: campus.doors.cafeteria.z + 1 }); break;
    case 'order_food': openFoodMenu(); break;
    case 'cup_pong': cuppongActive = true; cuppong.enter(() => { cuppongActive = false; cuppong.exit(); }); break;
    case 'dine': beginLounge(it); openFoodMenu(); break;
    case 'lecture': switchLocation('studentUnion'); break;
    case 'exit_union': switchLocation('campus', { x: campus.doors.lecture.x, z: campus.doors.lecture.z + 1 }); break;
    case 'arcade_trivia': startTrivia(); break;
    case 'arcade_memory': startMemory(); break;
    case 'arcade_hoops_info': showModal('🏀 Hoops', 'Real hoops are on the court outside — head east past the dorms for a full 3-on-3 game!'); break;
    case 'quest_board': openCampus('awards'); break;
    case 'sleep': doSleep(); break;
  }
}

function doSleep() {
  showModal('😴 Take a nap?', 'Curl up for a cozy nap — a fresh day rolls your login streak.', [
    { label: 'Sleep 💤', onClick: () => {
      const fade = $('sleep-fade'); if (fade) { fade.classList.add('show'); setTimeout(() => fade.classList.remove('show'), 1400); }
      applyNeeds({ social: 8, fun: 10 });
      const newDay = newDayCheck();
      save();
      setTimeout(() => {
        toast('Good morning! ☀️', '🌅');
        if (newDay) showModal(`🌅 Day ${state.day}`, 'A fresh day on campus. Go hang out, play some games, and decorate your space!');
      }, 700);
    } },
    { label: 'Not now', primary: false },
  ]);
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
  openPomodoroSetup((focusMin, breakMin) => {
    seated = true;
    player.position.set(it.seatPos.x, floorY + 0.45, it.seatPos.z);
    player.rotation.y = it.face ?? Math.PI; // face the desk/table
    startPomodoro(focusMin, () => {
      seated = false;
      const back = it.stepBack || { x: it.seatPos.x, z: it.seatPos.z + 1.6 };
      player.position.set(back.x, floorY, back.z);
      playerTargetY = floorY; // hold the floor height after standing up
    }, { breakMin });
  });
}

// ----------------------------------------------------------- lounging (couches)
let loungeActive = false;
let loungeStand = null;
let loungeFloorY = 0;
function beginLounge(it) {
  loungeFloorY = it.seatPos.y || 0;
  loungeStand = it.stepBack || { x: it.seatPos.x, z: it.seatPos.z + 1.8 };
  seated = true;
  loungeActive = true;
  player.position.set(it.seatPos.x, it.sitY ?? (loungeFloorY + 0.45), it.seatPos.z);
  player.rotation.y = it.face ?? Math.PI; // face the way the couch faces
}
function endLounge() {
  seated = false;
  loungeActive = false;
  player.position.set(loungeStand.x, loungeFloorY, loungeStand.z);
  playerTargetY = loungeFloorY;
}

// ----------------------------------------------------------- room editor
let editMode = false;
let editSel = -1;          // selected layout index (-1 = none)
let editDragging = false;
const editRay = new THREE.Raycaster();
const editNdc = new THREE.Vector2();
const editPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const selHighlight = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({ color: 0x6be0a0, transparent: true, opacity: 0.32, depthWrite: false }),
);
selHighlight.rotation.x = -Math.PI / 2; selHighlight.position.y = 0.05; selHighlight.visible = false;
bedroom.root.add(selHighlight);

function enterEdit() {
  editMode = true; editSel = -1; editDragging = false;
  if (player) player.visible = false;
  bedroom.editor.showGrid(true);
  buildPalette();
  refreshSelUI();
  $('hud').classList.add('editing');
  $('room-editor').classList.remove('hidden');
}
function exitEdit() {
  editMode = false; selHighlight.visible = false;
  bedroom.editor.showGrid(false);
  if (player) player.visible = true;
  $('hud').classList.remove('editing');
  $('room-editor').classList.add('hidden');
  state.room.layout = bedroom.editor.layout;
  save();
}

function placedCount(typeId) { return bedroom.editor.layout.filter(i => i.t === typeId).length; }
function buildPalette() {
  const pal = $('re-palette');
  pal.innerHTML = '';
  for (const t of bedroom.editor.types) {
    const avail = furnitureCount(t.id) - placedCount(t.id);
    const b = document.createElement('button');
    b.className = 're-item' + (avail <= 0 ? ' disabled' : '');
    b.innerHTML = `<span class="ic">${t.icon}</span><span class="nm">${t.name}</span><span class="ct">×${Math.max(0, avail)}</span>`;
    b.onclick = () => {
      if (furnitureCount(t.id) - placedCount(t.id) <= 0) return; // own none left to place
      const i = bedroom.editor.add(t.id); selectIndex(i); buildPalette();
    };
    pal.appendChild(b);
  }
}

function selGroup() {
  return bedroom.editor.group.children.find(c => c.userData.layoutIndex === editSel) || null;
}
function updateHighlight() {
  const g = selGroup();
  if (!g) { selHighlight.visible = false; return; }
  const box = new THREE.Box3().setFromObject(g);
  const size = new THREE.Vector3(), center = new THREE.Vector3();
  box.getSize(size); box.getCenter(center);
  selHighlight.position.set(center.x, 0.05, center.z);
  selHighlight.scale.set(size.x + 0.5, size.z + 0.5, 1);
  selHighlight.visible = true;
}
function selectIndex(i) { editSel = i; refreshSelUI(); updateHighlight(); }
function refreshSelUI() { $('re-sel').classList.toggle('hidden', editSel < 0); }

// pointer → select / drag furniture across the floor grid
function editPointer(e, ndcOnly) {
  const rect = renderer.domElement.getBoundingClientRect();
  editNdc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  editRay.setFromCamera(editNdc, camera);
}
window.addEventListener('pointerdown', (e) => {
  if (!editMode || e.target.closest('#room-editor')) return;
  editPointer(e);
  const hits = editRay.intersectObjects(bedroom.editor.group.children, true);
  if (hits.length) {
    let o = hits[0].object;
    while (o && o.userData.layoutIndex === undefined) o = o.parent;
    if (o) { selectIndex(o.userData.layoutIndex); editDragging = true; }
  } else { editSel = -1; refreshSelUI(); selHighlight.visible = false; }
});
window.addEventListener('pointermove', (e) => {
  if (!editMode || !editDragging || editSel < 0) return;
  editPointer(e);
  const p = new THREE.Vector3();
  if (!editRay.ray.intersectPlane(editPlane, p)) return;
  const gr = bedroom.editor.grid;
  const gx = THREE.MathUtils.clamp(Math.round(p.x), Math.ceil(gr.minX), Math.floor(gr.maxX));
  const gz = THREE.MathUtils.clamp(Math.round(p.z), Math.ceil(gr.minZ), Math.floor(gr.maxZ));
  const item = bedroom.editor.layout[editSel];
  if (item && (item.gx !== gx || item.gz !== gz)) {
    item.gx = gx; item.gz = gz; bedroom.editor.rebuild(); updateHighlight();
  }
});
window.addEventListener('pointerup', () => { editDragging = false; });

let editShopOpen = false;
$('re-done').addEventListener('click', exitEdit);
$('re-shop').addEventListener('click', () => {
  editShopOpen = true; $('room-editor').classList.add('hidden');
  openShop(() => setWearables(player, state.equipped), 'furniture');
});
$('re-rotate').addEventListener('click', () => {
  const item = bedroom.editor.layout[editSel]; if (!item) return;
  item.r = ((item.r || 0) + 1) % 4; bedroom.editor.rebuild(); updateHighlight();
});
$('re-delete').addEventListener('click', () => {
  if (editSel < 0) return;
  bedroom.editor.layout.splice(editSel, 1); editSel = -1;
  bedroom.editor.rebuild(); refreshSelUI(); selHighlight.visible = false; buildPalette();
});
$('edit-room-btn').addEventListener('click', () => { if (currentLoc === 'bedroom' && !editMode) enterEdit(); });

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
  initSystems();

  switchLocation('campus');
  showModal(`Welcome to Birchwood University, ${state.petName}! 🎉`,
    `Roam the campus with the <b>joystick</b> (or WASD) and hang out. Tap <b>📋</b> (top-right) for your <b>trophies, friends & stats</b>.<br><br>
     📚 <b>Library</b> — pomodoro study sessions earn coins<br>
     🏀 <b>Court</b> — a skill-based 2-on-2 pickup game<br>
     🍽️ <b>Dining Hall</b> — grab food & play swipe Cup Pong<br>
     🎮 <b>Student Union</b> — arcade games & coffee<br>
     🦆 <b>Birch Pond</b> — fish and relax<br>
     🛍️ <b>Campus Store</b> · 🏠 <b>Maple Dorm</b> — deck out your pet & room`);
}

function frame(dt, t) {
  if (bballActive) {
    basketball.update(dt, t);
    // same 3rd-person follow as the campus but pulled in closer to the player
    const off = BBALL_CAM_OFFSET;
    const px = player.position.x, py = player.position.y, pz = player.position.z;
    const bcy = Math.cos(input.camYaw), bsy = Math.sin(input.camYaw);
    let bx = px + (off.x * bcy + off.z * bsy);
    let bz = pz + (-off.x * bsy + off.z * bcy);
    let by = py + off.y, lx = px, ly = py + 1.2, lz = pz, lerpK = Math.min(1, dt * 6);
    const dunk = basketball.dunkCam();    // cinematic zoom while dunking
    if (dunk) {
      const s = dunk.strength, L = THREE.MathUtils.lerp;
      bx = L(bx, px + (bx - px) * 0.5, s); bz = L(bz, pz + (bz - pz) * 0.5, s); by = L(by, py + off.y * 0.6, s);
      lx = L(lx, dunk.focus.x, s * 0.5); ly = L(ly, dunk.focus.y, s * 0.6); lz = L(lz, dunk.focus.z, s * 0.5);
      lerpK = Math.min(1, dt * 10);
    }
    camera.position.lerp(new THREE.Vector3(bx, by, bz), lerpK);
    camera.lookAt(lx, ly, lz);
    fx.composer.render(dt);
    return;
  }
  if (cuppongActive) {
    cuppong.update(dt, t);
    const c = cuppong.cam();
    camera.position.set(c.px, c.py, c.pz);
    camera.lookAt(c.lx, c.ly, c.lz);
    fx.composer.render(dt);
    return;
  }
  if (!player || !currentLoc) { fx.composer.render(dt); return; }

  tickSystems(dt); // needs decay, buff expiry, HUD bars

  const loc = LOCATIONS[currentLoc].def;
  const uiOpen = isModalOpen() || isTryOnOpen();
  let moving = false;

  // restore the editor + refresh palette counts after the furniture shop closes
  if (editShopOpen && !uiOpen) {
    editShopOpen = false;
    if (editMode) { $('room-editor').classList.remove('hidden'); buildPalette(); }
  }

  // camera yaw rotates both the view and the movement frame, so "up" on the
  // stick always walks away from the camera no matter which way it's turned
  const cy = Math.cos(input.camYaw), sy = Math.sin(input.camYaw);
  if (!uiOpen && !seated && !editMode && input.active) {
    const speed = currentLoc === 'campus' ? 9 : 6;
    const mx = input.x * cy + input.y * sy;
    const mz = -input.x * sy + input.y * cy;
    movePlayer(loc, mx * speed * dt, mz * speed * dt);
    player.rotation.y = Math.atan2(mx, mz);
    moving = true;
  }
  player.userData.animate(t, moving);
  // never let the player get stuck inside a collider (runs even without input)
  if (!seated && !editMode) resolveStuck(player.position, levelDef(loc).colliders);
  // smooth elevation toward the active floor / stair height (not while seated)
  if (!seated) player.position.y += (playerTargetY - player.position.y) * Math.min(1, dt * 12);

  if (editMode) {
    // overhead 3/4 view of the whole room while decorating
    camera.position.lerp(new THREE.Vector3(0, 16, 14), Math.min(1, dt * 5));
    camera.lookAt(0, 0.5, 0);
  } else {
    // camera follow — offset rotated by the player-controlled yaw, then pulled
    // in if a building would otherwise swallow it
    const off = loc.camOffset;
    let camX = player.position.x + (off.x * cy + off.z * sy);
    let camZ = player.position.z + (-off.x * sy + off.z * cy);
    if (currentLoc === 'campus') {
      const t = cameraClearT(player.position.x, player.position.z, camX, camZ, loc.colliders);
      camX = player.position.x + (camX - player.position.x) * t;
      camZ = player.position.z + (camZ - player.position.z) * t;
    }
    const targetCam = new THREE.Vector3(camX, player.position.y + off.y, camZ);
    camera.position.lerp(targetCam, Math.min(1, dt * 5));
    camera.lookAt(player.position.x, player.position.y + 1, player.position.z);
  }

  // NPCs + ambient world animation (campus only)
  if (currentLoc === 'campus') {
    updateNpcs(npcs, dt, t, player.position, chattingWith);
    updateNpcBubbles(npcs, camera, t);
    if (campus.animate) campus.animate(t, dt);
  } else if (loc.animate) {
    loc.animate(t, dt); // interior ambient animation (e.g. the fireplace flicker)
  }

  // interaction prompt (while lounging on a couch, offer a stand-up button)
  const it = editMode ? null
    : (seated && loungeActive && !uiOpen)
      ? { id: 'stand_up', label: '🧍 Stand up' }
      : (uiOpen || seated ? null : findInteract());
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
initDiningUI();
initArcadeUI();
initFishingUI();
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
  bballEnemies: (on = true) => basketball.setEnemiesPaused(!on), // __cp.bballEnemies(false) freezes them

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
