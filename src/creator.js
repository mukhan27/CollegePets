// Start-of-game character creator: a live, rotatable 3D preview plus category
// tabs to build your "Aura" — the game's one original, customizable species.
// Mirrors the fitting-room preview pattern in tryon.js.

import * as THREE from 'three';
import {
  createPet, defaultCreature, randomCreature, CREATURE_OPTIONS,
  COAT_SWATCHES, MUZZLE_SWATCHES, EYE_SWATCHES,
} from './petFactory.js';
import { state, save } from './state.js';
import { earPreview } from './itemPreview.js';

const $ = (id) => document.getElementById(id);

// ---- preview stage (own renderer; same setup as tryon.js) ----
let renderer, scene, camera, pet, raf = null, spin = 0.5, dragging = false, lastX = 0;
// ---- working selection ----
let appearance = defaultCreature(), activeTab = 'body';
let onDone = null, bound = false;

function initStage() {
  if (renderer) return;
  const canvas = $('creator-canvas');
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9a8a78, 0.65));
  const key = new THREE.DirectionalLight(0xffffff, 0.85); key.position.set(3, 6, 4); scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.35); fill.position.set(-3, 2, 4); scene.add(fill);
  camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  canvas.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; });
  window.addEventListener('pointermove', (e) => { if (dragging) { spin += (e.clientX - lastX) * 0.012; lastX = e.clientX; } });
  window.addEventListener('pointerup', () => { dragging = false; });
  window.addEventListener('resize', () => { if (isOpen()) resize(); });
}

// Resize only when the canvas's displayed box actually changes. Called every
// frame so it self-corrects no matter when layout settles (fixes the
// open-time stretch / letterbox-gap race), and on explicit resize events.
function resize() {
  if (!renderer) return;
  const c = $('creator-canvas');
  const w = Math.max(1, c.clientWidth), h = Math.max(1, c.clientHeight);
  const pr = Math.min(window.devicePixelRatio, 2);
  const needW = Math.round(w * pr), needH = Math.round(h * pr);
  if (c.width === needW && c.height === needH) return;
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}

function rebuildPet() {
  if (pet) scene.remove(pet);
  pet = createPet('creature', { equipped: {}, appearance });
  scene.add(pet);
}

function loop() {
  raf = requestAnimationFrame(loop);
  resize();
  if (!pet) return;
  // no auto-spin — the player rotates the character by dragging (or arrows)
  pet.rotation.y = spin;
  if (pet.userData.animate) pet.userData.animate(performance.now() / 1000, false);
  renderer.render(scene, camera);
}

const TABS = [
  { id: 'color', label: 'Colour' },
  { id: 'muzzle', label: 'Muzzle' },
  { id: 'eyes', label: 'Eyes' },
  { id: 'ears', label: 'Ears' },
];

// ---- DOM builders ----
function header(text) { const el = document.createElement('div'); el.className = 'cc-section'; el.textContent = text; return el; }
function swatch(color, selected, onClick) {
  const el = document.createElement('button');
  el.className = 'cc-swatch' + (selected ? ' selected' : '');
  el.style.background = '#' + color.toString(16).padStart(6, '0');
  el.addEventListener('click', onClick);
  return el;
}
// set a field, refresh preview + the option highlights
function set(field, value) { appearance[field] = value; rebuildPet(); renderActiveTab(); }

function renderTabs() {
  const wrap = $('creator-tabs'); wrap.innerHTML = '';
  for (const t of TABS) {
    const b = document.createElement('button');
    b.className = 'cc-tab' + (activeTab === t.id ? ' active' : '');
    b.textContent = t.label;
    b.addEventListener('click', () => { activeTab = t.id; renderTabs(); renderActiveTab(); });
    wrap.appendChild(b);
  }
}

function swatchRow(box, field, colors, header_) {
  box.appendChild(header(header_));
  for (const c of colors) box.appendChild(swatch(c, appearance[field] === c, () => set(field, c)));
}
// ear picker: rendered thumbnails (real 3D previews) instead of emoji
function imgChip(src, label, selected, onClick) {
  const el = document.createElement('button');
  el.className = 'cc-opt' + (selected ? ' selected' : '');
  el.innerHTML = `<img class="cc-thumb" src="${src}" alt=""><div class="cc-label">${label}</div>`;
  el.addEventListener('click', onClick);
  return el;
}
function earChips(box) {
  box.appendChild(header('Ear shape'));
  for (const v of CREATURE_OPTIONS.ears) {
    const label = v[0].toUpperCase() + v.slice(1);
    box.appendChild(imgChip(earPreview(v), label, appearance.ears === v, () => set('ears', v)));
  }
}

function renderActiveTab() {
  const box = $('creator-options'); box.innerHTML = '';
  if (activeTab === 'color') {
    swatchRow(box, 'bodyColor', COAT_SWATCHES, 'Coat colour');
  } else if (activeTab === 'muzzle') {
    swatchRow(box, 'muzzleColor', MUZZLE_SWATCHES, 'Muzzle colour');
  } else if (activeTab === 'eyes') {
    swatchRow(box, 'eyeColor', EYE_SWATCHES, 'Eye colour');
  } else if (activeTab === 'ears') {
    earChips(box);
  }
}

function updateStart() { $('creator-start').disabled = !$('creator-name').value.trim(); }

function start() {
  const nm = $('creator-name').value.trim();
  if (!nm) return;
  state.creature = appearance;
  state.petType = 'creature';
  state.petName = nm;
  save();
  close();
  if (onDone) onDone();
}

function bindOnce() {
  if (bound) return; bound = true;
  $('creator-name').addEventListener('input', updateStart);
  $('creator-start').addEventListener('click', start);
  $('creator-random').addEventListener('click', () => { appearance = randomCreature(); rebuildPet(); renderTabs(); renderActiveTab(); });
  $('creator-left').addEventListener('click', () => { spin -= 0.6; });
  $('creator-right').addEventListener('click', () => { spin += 0.6; });
}

function isOpen() { const el = $('creator-screen'); return el && el.style.display !== 'none'; }

export function openCreator(done, { editing = false } = {}) {
  onDone = done;
  initStage();
  bindOnce();
  appearance = JSON.parse(JSON.stringify(state.creature || defaultCreature()));
  activeTab = 'color';
  $('creator-name').value = editing ? (state.petName || '') : '';
  $('creator-start').textContent = editing ? 'Save ✓' : 'Start College! 🎒';
  $('creator-screen').style.display = 'flex';
  resize();
  renderTabs(); renderActiveTab(); rebuildPet();
  updateStart();
  camera.position.set(0, 1.55, 4.3);
  camera.lookAt(0, 1.0, 0);
  if (!raf) loop();
}

export function closeCreator() { close(); }

function close() {
  $('creator-screen').style.display = 'none';
  if (raf) { cancelAnimationFrame(raf); raf = null; }
}
