// Dining hall interactions: a food-ordering menu and a "work a shift" cooking
// mini-game (serve the right dish before the timer runs out).

import { state, addCoins, FOOD_CATALOG, findFood, buyFood } from './state.js';
import { showModal } from './ui.js';
import { eat, toast, applyNeeds, track } from './systems.js';

const $ = (id) => document.getElementById(id);

// ----------------------------------------------------------- food menu
export function openFoodMenu() {
  function render() {
    let html = `<p class="dh-bal">🪙 ${state.coins} &nbsp; ⚡ ${Math.round(state.needs.energy)} &nbsp; 🍔 ${Math.round(state.needs.hunger)}</p>
      <p class="dh-hint">Tap to eat now · 🎁 to stock up for gifting friends</p>
      <div class="item-grid">`;
    for (const f of FOOD_CATALOG) {
      const fx = [f.hunger ? `🍔+${f.hunger}` : '', f.energy ? `⚡+${f.energy}` : '', f.fun ? `🎉+${f.fun}` : '', f.buff === 'focus' ? '📚 focus' : ''].filter(Boolean).join(' ');
      html += `<div class="item-card food-card" data-id="${f.id}">
        <button class="food-gift" data-stock="${f.id}" title="Stock up to gift">🎁</button>
        <div class="item-icon">${f.icon}</div>
        <div class="item-name">${f.name}</div>
        <div class="food-fx">${fx}</div>
        <div class="item-price">🪙 ${f.price}</div>
      </div>`;
    }
    html += '</div>';
    showModal('🍽️ Order food', html, [{ label: 'Done', primary: false }]);
    $('modal-body').querySelectorAll('[data-stock]').forEach(b => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const f = findFood(b.dataset.stock);
      if (!buyFood(f.id)) { toast('Not enough coins for that', '🪙'); return; }
      toast(`Bagged a ${f.name} to gift`, '🎁');
      render();
    }));
    $('modal-body').querySelectorAll('.food-card').forEach(c => c.addEventListener('click', () => {
      const f = findFood(c.dataset.id);
      if (state.coins < f.price) { toast('Not enough coins for that', '🪙'); return; }
      addCoins(-f.price);
      eat(f.id, { fromPantry: false });
      render();
    }));
  }
  render();
}

// ----------------------------------------------------------- cooking shift
let cook = null;
const COOK_FOODS = FOOD_CATALOG.filter(f => ['pizza', 'burger', 'ramen', 'taco', 'sushi', 'salad'].includes(f.id));

export function startCookJob(onDone) {
  const ov = $('cook-overlay');
  ov.classList.remove('hidden');
  cook = { score: 0, combo: 0, lives: 3, orderT: 0, orderMax: 3.6, order: null, onDone, last: performance.now(), raf: 0, over: false };
  buildButtons();
  nextOrder();
  cook.raf = requestAnimationFrame(loopCook);
}

function buildButtons() {
  const row = $('cook-buttons');
  row.innerHTML = '';
  for (const f of COOK_FOODS) {
    const b = document.createElement('button');
    b.className = 'cook-btn';
    b.innerHTML = f.icon;
    b.addEventListener('click', () => serve(f.id));
    row.appendChild(b);
  }
}

function nextOrder() {
  cook.order = COOK_FOODS[Math.floor(Math.random() * COOK_FOODS.length)];
  cook.orderT = cook.orderMax;
  cook.orderMax = Math.max(1.6, cook.orderMax - 0.06); // speeds up
  $('cook-order').textContent = cook.order.icon;
}

function serve(id) {
  if (!cook || cook.over) return;
  if (id === cook.order.id) {
    cook.combo++;
    cook.score += 1 + Math.floor(cook.combo / 4); // combo bonus
    flash('good');
    nextOrder();
  } else {
    cook.combo = 0;
    strike();
  }
  updateCookHud();
}

function strike() {
  cook.lives--;
  flash('bad');
  if (cook.lives <= 0) return endCook();
  nextOrder();
}

function flash(kind) {
  const el = $('cook-order');
  el.classList.remove('good', 'bad');
  void el.offsetWidth;
  el.classList.add(kind);
}

function updateCookHud() {
  $('cook-score').textContent = '🍽️ ' + cook.score;
  $('cook-lives').textContent = '❤️'.repeat(Math.max(0, cook.lives));
  $('cook-combo').textContent = cook.combo > 2 ? `🔥 ${cook.combo} combo` : '';
}

function loopCook(now) {
  if (!cook || cook.over) return;
  const dt = Math.min(0.05, (now - cook.last) / 1000); cook.last = now;
  cook.orderT -= dt;
  $('cook-timer-fill').style.width = Math.max(0, cook.orderT / cook.orderMax * 100) + '%';
  if (cook.orderT <= 0) { cook.combo = 0; strike(); }
  cook.raf = requestAnimationFrame(loopCook);
}

function endCook() {
  if (!cook || cook.over) return;
  cook.over = true;
  cancelAnimationFrame(cook.raf);
  $('cook-overlay').classList.add('hidden');
  const dishes = cook.score, coins = dishes * 3;
  addCoins(coins);
  applyNeeds({ energy: -16, social: 8, fun: 6 });
  if (dishes >= 12) track('games', 1); // a solid shift counts as a "win"
  const cb = cook.onDone; cook = null;
  showModal('👨‍🍳 Shift over!', `You served <b>${dishes}</b> dishes!<br>Tips earned: <b>🪙 ${coins}</b>`, [{ label: 'Nice', onClick: () => { if (cb) cb(); } }]);
}

export function initDiningUI() {
  $('cook-quit').addEventListener('click', endCook);
}
