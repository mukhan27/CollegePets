// Start-of-game character creator: a live, rotatable 3D preview plus category
// tabs to build your "Aura" — the game's one original, customizable species.
// Mirrors the fitting-room preview pattern in tryon.js.

import * as THREE from 'three';
import {
  createPet, defaultCreature, randomCreature, CREATURE_OPTIONS,
  COAT_SWATCHES, BELLY_SWATCHES, ACCENT_SWATCHES, SPOT_SWATCHES, EYE_SWATCHES,
} from './petFactory.js';
import { state, save } from './state.js';

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
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9a8a78, 1.15));
  const key = new THREE.DirectionalLight(0xffffff, 1.3); key.position.set(3, 6, 4); scene.add(key);
  const fill = new THREE.DirectionalLight(0xcfe0ff, 0.45); fill.position.set(-3, 2, -2); scene.add(fill);
  camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  canvas.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; });
  window.addEventListener('pointermove', (e) => { if (dragging) { spin += (e.clientX - lastX) * 0.012; lastX = e.clientX; } });
  window.addEventListener('pointerup', () => { dragging = false; });
  window.addEventListener('resize', () => { if (isOpen()) resize(); });
}

function resize() {
  const c = $('creator-canvas'); const r = c.getBoundingClientRect();
  const w = Math.max(1, r.width), h = Math.max(1, r.height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
  if (!pet) return;
  if (!dragging) spin += 0.004;
  pet.rotation.y = spin;
  if (pet.userData.animate) pet.userData.animate(performance.now() / 1000, false);
  renderer.render(scene, camera);
}

// ---- option metadata (emoji + label per value) ----
const LABELS = {
  build: { slim: ['🥒', 'Slim'], round: ['🔵', 'Round'], chonky: ['🟠', 'Chonky'] },
  size: { small: ['🐁', 'Small'], medium: ['🐈', 'Medium'], tall: ['🦒', 'Tall'] },
  fur: { velvety: ['⚪', 'Smooth'], silky: ['🪶', 'Soft'], shaggy: ['🧶', 'Fuzzy'] },
  pattern: { none: ['⬜', 'Plain'], spots: ['🐆', 'Spots'], stripes: ['🦓', 'Stripes'], patch: ['🥚', 'Patch'], freckles: ['✨', 'Freckles'] },
  ears: { rounded: ['🐻', 'Rounded'], upright: ['🐰', 'Upright'], floppy: ['🐶', 'Floppy'] },
  tail: { none: ['🚫', 'None'], fluffy: ['🐿️', 'Fluffy'], pom: ['☁️', 'Pom-Pom'] },
  eyeStyle: { round: ['😊', 'Round'], sparkly: ['🤩', 'Sparkly'], sleepy: ['😌', 'Sleepy'] },
};

const TABS = [
  { id: 'body', label: 'Body' },
  { id: 'color', label: 'Colors' },
  { id: 'coat', label: 'Coat' },
  { id: 'eyes', label: 'Eyes' },
  { id: 'earstail', label: 'Ears & Tail' },
];

// ---- DOM builders ----
function header(text) { const el = document.createElement('div'); el.className = 'cc-section'; el.textContent = text; return el; }
function chip(emoji, label, desc, selected, onClick) {
  const el = document.createElement('button');
  el.className = 'cc-opt' + (selected ? ' selected' : '');
  el.innerHTML = `<div class="cc-emoji">${emoji}</div><div class="cc-label">${label}</div>` + (desc ? `<div class="cc-desc">${desc}</div>` : '');
  el.addEventListener('click', onClick);
  return el;
}
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

function enumChips(box, field, header_) {
  if (header_) box.appendChild(header(header_));
  for (const v of CREATURE_OPTIONS[field]) {
    const [emoji, label] = LABELS[field][v];
    box.appendChild(chip(emoji, label, '', appearance[field] === v, () => set(field, v)));
  }
}
function swatchRow(box, field, colors, header_) {
  box.appendChild(header(header_));
  for (const c of colors) box.appendChild(swatch(c, appearance[field] === c, () => set(field, c)));
}

function renderActiveTab() {
  const box = $('creator-options'); box.innerHTML = '';
  if (activeTab === 'body') {
    enumChips(box, 'build', 'Shape');
    enumChips(box, 'size', 'Size');
  } else if (activeTab === 'color') {
    swatchRow(box, 'bodyColor', COAT_SWATCHES, 'Coat');
    swatchRow(box, 'bellyColor', BELLY_SWATCHES, 'Belly');
    swatchRow(box, 'accentColor', ACCENT_SWATCHES, 'Inner ear');
  } else if (activeTab === 'coat') {
    enumChips(box, 'fur', 'Fur texture');
    enumChips(box, 'pattern', 'Markings');
    swatchRow(box, 'patternColor', SPOT_SWATCHES, 'Marking colour');
  } else if (activeTab === 'eyes') {
    enumChips(box, 'eyeStyle', 'Eyes');
    swatchRow(box, 'eyeColor', EYE_SWATCHES, 'Eye colour');
    box.appendChild(header('Blush'));
    box.appendChild(chip('😊', 'On', '', appearance.blush === true, () => set('blush', true)));
    box.appendChild(chip('😐', 'Off', '', appearance.blush === false, () => set('blush', false)));
  } else if (activeTab === 'earstail') {
    enumChips(box, 'ears', 'Ears');
    enumChips(box, 'tail', 'Tail');
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
  activeTab = 'body';
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
