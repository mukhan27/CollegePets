// Start-of-game character creator: a live, rotatable 3D preview plus category
// tabs to build the custom "Birchling" creature — or pick one of the 5 classic
// pets. Mirrors the fitting-room preview pattern in tryon.js.

import * as THREE from 'three';
import {
  createPet, defaultCreature, randomCreature, CREATURE_OPTIONS,
  COAT_SWATCHES, BELLY_SWATCHES, ACCENT_SWATCHES, EYE_SWATCHES,
} from './petFactory.js';
import { state, save, PET_TYPES } from './state.js';

const $ = (id) => document.getElementById(id);

// ---- preview stage (own renderer; same setup as tryon.js) ----
let renderer, scene, camera, pet, raf = null, spin = 0.5, dragging = false, lastX = 0;
// ---- working selection ----
let selectedType = 'creature', appearance = defaultCreature(), activeTab = 'kind';
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
  pet = createPet(selectedType, { equipped: {}, appearance });
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
  pattern: { none: ['⬜', 'Plain'], spots: ['🐆', 'Spots'], stripes: ['🦓', 'Stripes'], belly_patch: ['🥚', 'Belly'], freckles: ['✨', 'Freckles'] },
  ears: { cat: ['🐱', 'Cat'], bunny: ['🐰', 'Bunny'], bear: ['🐻', 'Bear'], fin: ['🐟', 'Fins'], floppy: ['🐶', 'Floppy'], none: ['🚫', 'None'] },
  tail: { puff: ['☁️', 'Puff'], long: ['🐈', 'Long'], bunny: ['🐰', 'Bob'], leaf: ['🍃', 'Leaf'], none: ['🚫', 'None'] },
  horns: { none: ['🚫', 'None'], nubs: ['🐐', 'Nubs'], antennae: ['🐜', 'Antennae'], unicorn: ['🦄', 'Unicorn'] },
  eyeStyle: { round: ['😊', 'Round'], sparkly: ['🤩', 'Sparkly'], sleepy: ['😌', 'Sleepy'] },
  snout: { button: ['🔘', 'Button'], muzzle: ['🐾', 'Muzzle'], beak: ['🦆', 'Beak'] },
};

const TABS = [
  { id: 'kind', label: 'Kind' },
  { id: 'body', label: 'Body', creatureOnly: true },
  { id: 'color', label: 'Colors', creatureOnly: true },
  { id: 'pattern', label: 'Pattern', creatureOnly: true },
  { id: 'eyes', label: 'Eyes', creatureOnly: true },
  { id: 'earstail', label: 'Ears & Tail', creatureOnly: true },
  { id: 'extras', label: 'Extras', creatureOnly: true },
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
    if (t.creatureOnly && selectedType !== 'creature') continue;
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
  if (activeTab === 'kind') {
    box.appendChild(chip('✨', 'Custom', 'Build your own', selectedType === 'creature', () => selectKind('creature')));
    for (const p of PET_TYPES) box.appendChild(chip(p.emoji, p.label, p.desc, selectedType === p.id, () => selectKind(p.id)));
    return;
  }
  if (selectedType !== 'creature') { activeTab = 'kind'; renderTabs(); return renderActiveTab(); }
  if (activeTab === 'body') {
    enumChips(box, 'build', 'Shape');
    enumChips(box, 'size', 'Size');
  } else if (activeTab === 'color') {
    swatchRow(box, 'bodyColor', COAT_SWATCHES, 'Body');
    swatchRow(box, 'bellyColor', BELLY_SWATCHES, 'Belly');
    swatchRow(box, 'accentColor', ACCENT_SWATCHES, 'Accent');
  } else if (activeTab === 'pattern') {
    enumChips(box, 'pattern', 'Markings');
    swatchRow(box, 'patternColor', COAT_SWATCHES, 'Marking colour');
  } else if (activeTab === 'eyes') {
    enumChips(box, 'eyeStyle', 'Eyes');
    swatchRow(box, 'eyeColor', EYE_SWATCHES, 'Eye colour');
    box.appendChild(header('Blush'));
    box.appendChild(chip('😊', 'On', '', appearance.blush === true, () => set('blush', true)));
    box.appendChild(chip('😐', 'Off', '', appearance.blush === false, () => set('blush', false)));
  } else if (activeTab === 'earstail') {
    enumChips(box, 'ears', 'Ears');
    enumChips(box, 'tail', 'Tail');
  } else if (activeTab === 'extras') {
    enumChips(box, 'horns', 'Horns');
    enumChips(box, 'snout', 'Snout');
  }
}

function selectKind(type) {
  selectedType = type;
  if (type !== 'creature' && TABS.find((t) => t.id === activeTab)?.creatureOnly) activeTab = 'kind';
  rebuildPet(); renderTabs(); renderActiveTab();
}

function updateStart() { $('creator-start').disabled = !$('creator-name').value.trim(); }

function start() {
  const nm = $('creator-name').value.trim();
  if (!nm) return;
  if (selectedType === 'creature') { state.creature = appearance; state.petType = 'creature'; }
  else { state.petType = selectedType; }
  state.petName = nm;
  save();
  close();
  if (onDone) onDone();
}

function bindOnce() {
  if (bound) return; bound = true;
  $('creator-name').addEventListener('input', updateStart);
  $('creator-start').addEventListener('click', start);
  $('creator-random').addEventListener('click', () => { selectedType = 'creature'; appearance = randomCreature(); rebuildPet(); renderTabs(); renderActiveTab(); });
  $('creator-left').addEventListener('click', () => { spin -= 0.6; });
  $('creator-right').addEventListener('click', () => { spin += 0.6; });
}

function isOpen() { const el = $('creator-screen'); return el && el.style.display !== 'none'; }

export function openCreator(done, { editing = false } = {}) {
  onDone = done;
  initStage();
  bindOnce();
  selectedType = editing || (state.petType === 'creature') ? 'creature'
    : (state.petType ? state.petType : 'creature');
  appearance = JSON.parse(JSON.stringify(state.creature || defaultCreature()));
  activeTab = 'kind';
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
