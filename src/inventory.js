// Persistent inventory HUD (the 🎒 bag). Lists the foods you own (from
// state.pantry) with 3D-model thumbnails; tapping "Eat" fires an onEat(id)
// callback that main.js routes to eat-anywhere (animated) or the dining plate.

import { state, findFood } from './state.js';
import { foodPreview } from './itemPreview.js';

const $ = (id) => document.getElementById(id);
let onEatCb = null, open = false;

export function initInventory(onEat) {
  onEatCb = onEat;
  $('inv-btn').addEventListener('click', () => (open ? closeInventory() : openInventory()));
  $('inv-close').addEventListener('click', closeInventory);
}
export function isInventoryOpen() { return open; }
export function openInventory() { open = true; $('inventory-panel').classList.remove('hidden'); renderInventory(); }
export function closeInventory() { open = false; $('inventory-panel').classList.add('hidden'); }

export function renderInventory() {
  const body = $('inventory-body');
  const ids = Object.keys(state.pantry || {}).filter(id => state.pantry[id] > 0 && findFood(id));
  if (!ids.length) { body.innerHTML = '<p class="cp-empty">Your bag is empty.</p>'; return; }
  let html = '<div class="item-grid">';
  for (const id of ids) {
    const f = findFood(id);
    html += `<div class="item-card food-card">
      <div class="item-icon"><img class="item-img" src="${foodPreview(id)}" alt=""></div>
      <div class="item-name">${f.name}</div>
      <div class="item-status">🎒 ${state.pantry[id]}</div>
      <button class="inv-eat" data-eat="${id}">Eat</button>
    </div>`;
  }
  body.innerHTML = html + '</div>';
  body.querySelectorAll('[data-eat]').forEach(b => b.addEventListener('click', () => { if (onEatCb) onEatCb(b.dataset.eat); }));
}
