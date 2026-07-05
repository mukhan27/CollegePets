// Persistent inventory HUD (the 🎒 bag). Lists fun tools (from state.tools,
// with a Use button) and the foods you own (from state.pantry) with 3D-model
// thumbnails; "Eat"/"Use" fire callbacks that main.js routes to the world
// (chew animation, decals, particle effects, …).

import { state, findFood, findConsumable, CATALOG, toolUses, save } from './state.js';
import { foodPreview } from './itemPreview.js';

const $ = (id) => document.getElementById(id);
let onEatCb = null, open = false;
let onUseCb = null, canUseCb = null;   // tool callbacks provided by main.js

// spray-paint color chips (last pick remembered in state.flags.sprayColor)
export const SPRAY_COLORS = ['#ff5fa2', '#ff8b3a', '#ffd166', '#6be0a0', '#5fd0ff', '#b98bff'];

export function initInventory(onEat, { onUse, canUse } = {}) {
  onEatCb = onEat;
  onUseCb = onUse || null;
  canUseCb = canUse || (() => ({ ok: true }));
  $('inv-btn').addEventListener('click', () => (open ? closeInventory() : openInventory()));
  $('inv-close').addEventListener('click', closeInventory);
}
export function isInventoryOpen() { return open; }
export function openInventory() { open = true; $('inventory-panel').classList.remove('hidden'); renderInventory(); }
export function closeInventory() { open = false; $('inventory-panel').classList.add('hidden'); }

function toolCard(id) {
  const t = findConsumable(id);
  const uses = toolUses(id);
  const chk = canUseCb(id) || { ok: true };
  const isSpray = id === 'spray_paint';
  const sel = state.flags.sprayColor || SPRAY_COLORS[0];
  let chips = '';
  if (isSpray) {
    chips = `<div class="tool-chips">${SPRAY_COLORS.map(c =>
      `<button class="chip ${c === sel ? 'sel' : ''}" data-chip="${c}" style="background:${c}" aria-label="color ${c}"></button>`).join('')}</div>`;
  }
  return `<div class="item-card tool-card">
    <div class="item-icon fun-icon">${t.icon}</div>
    <div class="item-name">${t.name}</div>
    <div class="item-status">✨ ${uses} use${uses === 1 ? '' : 's'} left</div>
    ${chips}
    <button class="inv-use" data-use="${id}" ${chk.ok ? '' : 'disabled'}>Use</button>
    ${chk.ok ? '' : `<div class="tool-hint">${chk.hint || 'Can’t use here'}</div>`}
  </div>`;
}

export function renderInventory() {
  const body = $('inventory-body');
  const toolIds = CATALOG.consumables.map(c => c.id).filter(id => toolUses(id) > 0);
  const foodIds = Object.keys(state.pantry || {}).filter(id => state.pantry[id] > 0 && findFood(id));
  if (!toolIds.length && !foodIds.length) { body.innerHTML = '<p class="cp-empty">Your bag is empty.</p>'; return; }

  let html = '';
  if (toolIds.length) {
    html += `<div class="inv-section">🎉 Fun stuff</div><div class="item-grid">`;
    for (const id of toolIds) html += toolCard(id);
    html += '</div>';
  }
  if (foodIds.length) {
    html += `${toolIds.length ? '<div class="inv-section">🍔 Snacks</div>' : ''}<div class="item-grid">`;
    for (const id of foodIds) {
      const f = findFood(id);
      html += `<div class="item-card food-card">
        <div class="item-icon"><img class="item-img" src="${foodPreview(id)}" alt=""></div>
        <div class="item-name">${f.name}</div>
        <div class="item-status">🎒 ${state.pantry[id]}</div>
        <button class="inv-eat" data-eat="${id}">Eat</button>
      </div>`;
    }
    html += '</div>';
  }
  body.innerHTML = html;
  body.querySelectorAll('[data-eat]').forEach(b => b.addEventListener('click', () => { if (onEatCb) onEatCb(b.dataset.eat); }));
  body.querySelectorAll('[data-use]').forEach(b => b.addEventListener('click', () => { if (onUseCb && !b.disabled) onUseCb(b.dataset.use); }));
  body.querySelectorAll('[data-chip]').forEach(b => b.addEventListener('click', () => {
    state.flags.sprayColor = b.dataset.chip; save(); renderInventory();
  }));
}
