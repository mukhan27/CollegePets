// DOM UI: modal dialogs, chat panel, shop, room decorator, pomodoro lock.

import { state, save, addCoins, buy, owns, CATALOG } from './state.js';
import { npcReply } from './npcs.js';

const $ = (id) => document.getElementById(id);

// ----------------------------------------------------------- modal
export function showModal(title, bodyHTML, buttons = [{ label: 'OK' }]) {
  $('modal-title').textContent = title;
  $('modal-body').innerHTML = bodyHTML;
  const btnRow = $('modal-buttons');
  btnRow.innerHTML = '';
  for (const b of buttons) {
    const el = document.createElement('button');
    el.className = 'btn ' + (b.primary === false ? '' : 'btn-primary');
    el.textContent = b.label;
    el.addEventListener('click', () => {
      hideModal();
      if (b.onClick) b.onClick();
    });
    btnRow.appendChild(el);
  }
  $('modal').classList.remove('hidden');
}
export function hideModal() { $('modal').classList.add('hidden'); }
export function isModalOpen() {
  return !$('modal').classList.contains('hidden')
    || !$('chat-panel').classList.contains('hidden')
    || !$('focus-overlay').classList.contains('hidden')
    || !$('minigame-overlay').classList.contains('hidden');
}

// ----------------------------------------------------------- chat
let activeNpc = null;
let onChatClose = null;

export function openChat(npc, onClose) {
  activeNpc = npc;
  onChatClose = onClose;
  $('chat-avatar').textContent = npc.def.emoji;
  $('chat-name').textContent = npc.def.name;
  $('chat-sub').textContent = `${npc.def.major} major`;
  $('chat-messages').innerHTML = '';
  addChatMsg('them', npc.def.greet);
  $('chat-panel').classList.remove('hidden');
  $('chat-input').value = '';
}

function addChatMsg(who, text) {
  const el = document.createElement('div');
  el.className = 'msg ' + who;
  el.textContent = text;
  const box = $('chat-messages');
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
}

function sendChat() {
  const inp = $('chat-input');
  const text = inp.value.trim();
  if (!text || !activeNpc) return;
  inp.value = '';
  addChatMsg('me', text);
  const npc = activeNpc;
  setTimeout(() => {
    if (activeNpc === npc) addChatMsg('them', npcReply(npc.def, text));
  }, 500 + Math.random() * 600);
}

export function initChatUI() {
  $('chat-send').addEventListener('click', sendChat);
  $('chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChat();
  });
  $('chat-close').addEventListener('click', () => {
    $('chat-panel').classList.add('hidden');
    activeNpc = null;
    if (onChatClose) { onChatClose(); onChatClose = null; }
  });
}

// ----------------------------------------------------------- shop
export function openShop(onWearablesChanged) {
  let tab = 'clothes';

  function render() {
    const items = CATALOG[tab];
    let html = `<div class="shop-tabs">
      <button class="shop-tab ${tab === 'clothes' ? 'active' : ''}" data-tab="clothes">👕 Clothes</button>
      <button class="shop-tab ${tab === 'decor' ? 'active' : ''}" data-tab="decor">🛋️ Room Decor</button>
    </div><div class="item-grid">`;
    for (const item of items) {
      const owned = owns(item.id);
      const equipped = tab === 'clothes' && state.equipped.hat === item.id
        || tab === 'clothes' && state.equipped.face === item.id
        || tab === 'clothes' && state.equipped.neck === item.id;
      html += `<div class="item-card ${owned ? 'owned' : ''} ${equipped ? 'equipped' : ''}" data-id="${item.id}">
        <div class="item-icon">${item.icon}</div>
        <div class="item-name">${item.name}</div>
        ${owned
          ? `<div class="item-status">${equipped ? 'Wearing ✓' : (tab === 'clothes' ? 'Tap to wear' : 'Owned ✓')}</div>`
          : `<div class="item-price">🪙 ${item.price}</div>`}
      </div>`;
    }
    html += '</div>';
    showModal(`🛍️ Campus Store — 🪙 ${state.coins}`, html, [{ label: 'Done', primary: false }]);

    $('modal-body').querySelectorAll('.shop-tab').forEach(btn => {
      btn.addEventListener('click', () => { tab = btn.dataset.tab; render(); });
    });
    $('modal-body').querySelectorAll('.item-card').forEach(card => {
      card.addEventListener('click', () => handleItem(card.dataset.id));
    });
  }

  function handleItem(id) {
    const item = CATALOG.clothes.find(i => i.id === id) || CATALOG.decor.find(i => i.id === id);
    if (!owns(id)) {
      if (state.coins < item.price) {
        showModal('Not enough coins 😿',
          `You need 🪙 ${item.price} but only have 🪙 ${state.coins}.<br>Earn coins by studying in the library or winning mini-games!`,
          [{ label: 'Back to shop', onClick: render }]);
        return;
      }
      buy(id);
      if (CATALOG.decor.includes(item)) applyDecorPurchase(item);
      render();
      return;
    }
    // owned clothes → toggle wear
    if (CATALOG.clothes.includes(item)) {
      const slot = id === 'glasses' ? 'face' : id === 'scarf' ? 'neck' : 'hat';
      state.equipped[slot] = state.equipped[slot] === id ? null : id;
      save();
      if (onWearablesChanged) onWearablesChanged();
      render();
    }
  }

  render();
}

function applyDecorPurchase(item) {
  // newly bought decor is auto-placed; the decorator panel can change it later
  if (item.slot === 'bed') state.room.bed = item.id;
  else if (item.slot === 'rug') state.room.rug = item.id;
  else if (item.slot === 'poster') state.room.poster = item.id;
  else state.room[item.slot] = true;
  save();
}

// ----------------------------------------------------------- room decorator
export function openDecorator(onRoomChanged) {
  function render() {
    const slots = [
      { key: 'bed', label: '🛏️ Bedding', options: ['bed_red', ...CATALOG.decor.filter(d => d.slot === 'bed').map(d => d.id)] },
      { key: 'rug', label: '🟦 Rug', options: [null, ...CATALOG.decor.filter(d => d.slot === 'rug').map(d => d.id)] },
      { key: 'poster', label: '🖼️ Poster', options: [null, ...CATALOG.decor.filter(d => d.slot === 'poster').map(d => d.id)] },
      { key: 'plant', label: '🪴 Plant', toggle: 'plant' },
      { key: 'lamp', label: '🛋️ Lava Lamp', toggle: 'lamp_lava' },
      { key: 'beanbag', label: '🫘 Beanbag', toggle: 'beanbag' },
    ];
    let html = '<div class="item-grid">';
    for (const slot of slots) {
      if (slot.toggle) {
        const owned = owns(slot.toggle);
        const on = !!state.room[slot.key];
        html += `<div class="item-card ${on ? 'equipped' : owned ? 'owned' : ''}" data-slot="${slot.key}" data-toggle="${slot.toggle}">
          <div class="item-name">${slot.label}</div>
          <div class="item-status">${owned ? (on ? 'Placed ✓ (tap to remove)' : 'Tap to place') : 'Buy at Campus Store'}</div>
        </div>`;
      } else {
        for (const opt of slot.options) {
          const isFreeDefault = slot.key === 'bed' && opt === 'bed_red';
          const ownedOpt = opt === null || isFreeDefault || owns(opt);
          if (!ownedOpt) continue;
          const selected = (state.room[slot.key] || null) === opt || (slot.key === 'bed' && state.room.bed === opt);
          const name = opt === null ? `No ${slot.label.split(' ')[1]}` :
            isFreeDefault ? 'Red Bedding' :
            (CATALOG.decor.find(d => d.id === opt)?.name || opt);
          html += `<div class="item-card ${selected ? 'equipped' : 'owned'}" data-slot="${slot.key}" data-value="${opt ?? ''}">
            <div class="item-name">${slot.label}</div>
            <div class="item-status">${name}${selected ? ' ✓' : ''}</div>
          </div>`;
        }
      }
    }
    html += '</div><p style="margin-top:8px;font-size:12px;color:#8a96a3">Buy more decor at the Campus Store!</p>';
    showModal('🎨 Decorate your room', html, [{ label: 'Done', primary: false }]);

    $('modal-body').querySelectorAll('.item-card').forEach(card => {
      card.addEventListener('click', () => {
        const slot = card.dataset.slot;
        if (card.dataset.toggle) {
          if (!owns(card.dataset.toggle)) return;
          state.room[slot] = !state.room[slot];
        } else {
          state.room[slot] = card.dataset.value === '' ? (slot === 'bed' ? 'bed_red' : null) : card.dataset.value;
        }
        save();
        if (onRoomChanged) onRoomChanged();
        render();
      });
    });
  }
  render();
}

// ----------------------------------------------------------- pomodoro
const QUOTES = [
  '"The secret of getting ahead is getting started."',
  '"Little by little, a little becomes a lot."',
  '"Your future self is watching you right now."',
  '"Done is better than perfect."',
  '"Stay pawsitive. Keep studying."',
];

let focusTimer = null;
let wakeLock = null;

export function startPomodoro(minutes, onDone) {
  const overlay = $('focus-overlay');
  const timerEl = $('focus-timer');
  let remaining = minutes * 60;

  $('focus-quote').textContent = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  overlay.classList.remove('hidden');

  // keep the screen awake during the focus session if the browser allows it
  if (navigator.wakeLock) {
    navigator.wakeLock.request('screen').then(l => { wakeLock = l; }).catch(() => {});
  }
  if (document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(() => {});
  }

  function fmt(s) {
    const m = Math.floor(s / 60), sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  timerEl.textContent = fmt(remaining);

  focusTimer = setInterval(() => {
    remaining--;
    timerEl.textContent = fmt(remaining);
    if (remaining <= 0) endPomodoro(true, minutes, onDone);
  }, 1000);

  // hold-to-give-up (3 seconds)
  const btn = $('focus-giveup');
  btn.innerHTML = '<div class="fill"></div><span>Hold to give up</span>';
  const fill = btn.querySelector('.fill');
  let holdStart = null, holdRAF = null;

  function holdLoop() {
    if (holdStart === null) return;
    const pct = Math.min(1, (performance.now() - holdStart) / 3000);
    fill.style.width = (pct * 100) + '%';
    if (pct >= 1) {
      const elapsed = minutes * 60 - remaining;
      endPomodoro(false, Math.floor(elapsed / 60), onDone);
      return;
    }
    holdRAF = requestAnimationFrame(holdLoop);
  }
  const down = (e) => { e.preventDefault(); holdStart = performance.now(); holdLoop(); };
  const up = () => { holdStart = null; fill.style.width = '0%'; if (holdRAF) cancelAnimationFrame(holdRAF); };
  btn.onpointerdown = down;
  btn.onpointerup = up;
  btn.onpointerleave = up;
  btn.onpointercancel = up;
}

function endPomodoro(completed, minutes, onDone) {
  clearInterval(focusTimer);
  focusTimer = null;
  $('focus-overlay').classList.add('hidden');
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});

  if (completed) {
    const reward = minutes * 2;
    state.stats.focusMinutes += minutes;
    state.stats.pomodorosDone++;
    addCoins(reward);
    showModal('🎉 Focus session complete!',
      `You studied for <b>${minutes} minutes</b> straight!<br>Reward: <b>🪙 ${reward}</b><br><br>Total focus time: ${state.stats.focusMinutes} min across ${state.stats.pomodorosDone} session${state.stats.pomodorosDone === 1 ? '' : 's'}.`);
  } else {
    showModal('😿 Session abandoned',
      'No coins this time. The books will be waiting when you\'re ready!');
  }
  if (onDone) onDone(completed);
}

export function openPomodoroSetup(onStart) {
  showModal('📚 Study session',
    'Sit down, pick a length, and your screen locks into focus mode until the timer ends.<br><br>Earn <b>🪙 2 per minute</b> of completed focus!',
    [
      { label: '1 min (test)', onClick: () => onStart(1) },
      { label: '25 min', onClick: () => onStart(25) },
      { label: '50 min', onClick: () => onStart(50) },
      { label: 'Cancel', primary: false },
    ]);
}
