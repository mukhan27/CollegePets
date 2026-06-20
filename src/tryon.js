// Fitting-room try-on view: shows your pet in 3D and lets you wear / buy items
// and see them on the character live. Opened from the shop's mirror.

import * as THREE from 'three';
import { createPet, setWearables } from './petFactory.js';
import { state, save, owns, buy, CATALOG, clothesSlot } from './state.js';
import { wearablePreview } from './itemPreview.js';

const $ = (id) => document.getElementById(id);
const slotOf = (id) => clothesSlot(id);

let renderer, scene, camera, pet;
let raf = null, spin = 0.4, dragging = false, lastX = 0, onChanged = null;

function init() {
  if (renderer) return;
  const canvas = $('tryon-canvas');
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
}

function resize() {
  const canvas = $('tryon-canvas');
  const r = canvas.getBoundingClientRect();
  const w = Math.max(1, r.width), h = Math.max(1, r.height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}

function buildPet() {
  if (pet) scene.remove(pet);
  pet = createPet(state.petType || 'cat', { equipped: state.equipped });
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

function updateCoins() { $('tryon-coin-count').textContent = state.coins; }
function flashCoins() { const c = $('tryon-coins'); c.classList.add('flash'); setTimeout(() => c.classList.remove('flash'), 500); }

function renderItems() {
  const wrap = $('tryon-items');
  wrap.innerHTML = '';
  for (const item of CATALOG.clothes) {
    const owned = owns(item.id);
    const slot = slotOf(item.id);
    const on = state.equipped[slot] === item.id;
    const btn = document.createElement('button');
    btn.className = 'tryon-item' + (on ? ' on' : '') + (owned ? '' : ' locked');
    btn.innerHTML = `<img src="${wearablePreview(item.id)}" alt="">
      <span class="ti-text"><span class="ti-name">${item.name}</span>
      <span class="ti-tag">${owned ? (on ? 'Wearing ✓' : 'Tap to wear') : '🪙 ' + item.price}</span></span>`;
    btn.addEventListener('click', () => toggle(item));
    wrap.appendChild(btn);
  }
}

function toggle(item) {
  const slot = slotOf(item.id);
  if (!owns(item.id)) {
    if (!buy(item.id)) { flashCoins(); return; } // not enough coins
  }
  state.equipped[slot] = state.equipped[slot] === item.id ? null : item.id;
  save();
  setWearables(pet, state.equipped);
  if (onChanged) onChanged();
  updateCoins();
  renderItems();
}

export function openTryOn(_player, changed) {
  onChanged = changed;
  init();
  $('tryon-overlay').classList.remove('hidden');
  resize();
  buildPet();
  camera.position.set(0, 1.55, 4.3);
  camera.lookAt(0, 1.0, 0);
  updateCoins();
  renderItems();
  if (!raf) loop();
  $('tryon-done').onclick = close;
  $('tryon-left').onclick = () => { spin -= 0.6; };
  $('tryon-right').onclick = () => { spin += 0.6; };
}

function close() {
  $('tryon-overlay').classList.add('hidden');
  if (raf) { cancelAnimationFrame(raf); raf = null; }
}

export function isTryOnOpen() {
  const el = $('tryon-overlay');
  return el && !el.classList.contains('hidden');
}
