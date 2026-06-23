// Dining hall — the order-food menu. Ordering adds the dish to your inventory
// (your 🎒 bag); you eat it from the inventory HUD or by sitting at a table.

import { state, FOOD_CATALOG, findFood, buyFood, pantryCount } from './state.js';
import { showModal } from './ui.js';
import { toast } from './systems.js';
import { foodPreview } from './itemPreview.js';

const $ = (id) => document.getElementById(id);

export function openFoodMenu() {
  function render() {
    let html = `<p class="dh-bal">🪙 ${state.coins}</p>
      <p class="dh-hint">Order food to stock your 🎒 bag — eat it from the inventory or by sitting at a table.</p>
      <div class="item-grid">`;
    for (const f of FOOD_CATALOG) {
      const fx = [f.hunger ? `🍔 +${f.hunger}` : '', f.fun ? `🎉 +${f.fun}` : '', f.buff === 'focus' ? '📚 focus' : ''].filter(Boolean).join(' ');
      const owned = pantryCount(f.id);
      html += `<div class="item-card food-card" data-id="${f.id}">
        <div class="item-icon"><img class="item-img" src="${foodPreview(f.id)}" alt=""></div>
        <div class="item-name">${f.name}</div>
        <div class="food-fx">${fx}</div>
        <div class="item-price">🪙 ${f.price}${owned ? ` · 🎒 ${owned}` : ''}</div>
      </div>`;
    }
    html += '</div>';
    showModal('🍽️ Order food', html, [{ label: 'Done', primary: false }]);
    $('modal-body').querySelectorAll('.food-card').forEach(c => c.addEventListener('click', () => {
      const f = findFood(c.dataset.id);
      if (!buyFood(f.id)) { toast('Not enough coins for that', '🪙'); return; }
      toast(`Added ${f.name} to your bag`, '🎒');
      render();
    }));
  }
  render();
}

export function initDiningUI() { /* table HUD is wired by the dine view */ }
