// DOM UI: modal dialogs, chat panel, shop, room decorator, pomodoro lock.

import { state, save, addCoins, buy, owns, CATALOG, FURNITURE_CATALOG, furnitureCount, buyFurniture } from './state.js';
import { npcReply } from './npcs.js';
import { wearablePreview, furniturePreview } from './itemPreview.js';
import { track, applyNeeds, hasBuff, addFriendship } from './systems.js';

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
    || !$('minigame-overlay').classList.contains('hidden')
    || !$('campus-panel').classList.contains('hidden');
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
  track('chats', 1, npc.def.name);   // counts unique students/day
  addFriendship(npc.def.name, 8);    // saying hi builds the friendship
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
  addFriendship(npc.def.name, 3); applyNeeds({ social: 4 });
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
export function openShop(onWearablesChanged, initialTab = 'clothes') {
  let tab = initialTab;

  function render() {
    let html = `<div class="shop-tabs">
      <button class="shop-tab ${tab === 'clothes' ? 'active' : ''}" data-tab="clothes">👕 Clothes</button>
      <button class="shop-tab ${tab === 'furniture' ? 'active' : ''}" data-tab="furniture">🛋️ Furniture</button>
    </div><div class="item-grid">`;
    if (tab === 'clothes') {
      for (const item of CATALOG.clothes) {
        const owned = owns(item.id);
        const equipped = state.equipped.hat === item.id || state.equipped.face === item.id || state.equipped.neck === item.id;
        html += `<div class="item-card ${owned ? 'owned' : ''} ${equipped ? 'equipped' : ''}" data-id="${item.id}">
          <div class="item-icon"><img class="item-img" src="${wearablePreview(item.id)}" alt=""></div><div class="item-name">${item.name}</div>
          ${owned
            ? `<div class="item-status">${equipped ? 'Wearing ✓' : 'Tap to wear'}</div>`
            : `<div class="item-price">🪙 ${item.price}</div>`}</div>`;
      }
    } else {
      for (const item of FURNITURE_CATALOG) {
        const n = furnitureCount(item.id);
        html += `<div class="item-card ${n > 0 ? 'owned' : ''}" data-id="${item.id}">
          <div class="item-icon"><img class="item-img" src="${furniturePreview(item.id)}" alt=""></div><div class="item-name">${item.name}</div>
          <div class="item-status">${n > 0 ? `Own ${n} · ` : ''}🪙 ${item.price}</div>
          <div class="item-buy">Buy +1</div></div>`;
      }
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

  function notEnough(price) {
    showModal('Not enough coins 😿',
      `You need 🪙 ${price} but only have 🪙 ${state.coins}.<br>Earn coins by studying in the library or winning mini-games!`,
      [{ label: 'Back to shop', onClick: render }]);
  }

  function handleItem(id) {
    if (tab === 'furniture') {
      const item = FURNITURE_CATALOG.find(f => f.id === id);
      if (state.coins < item.price) { notEnough(item.price); return; }
      buyFurniture(id); track('spend', item.price);
      render();
      return;
    }
    const item = CATALOG.clothes.find(i => i.id === id);
    if (!owns(id)) {
      if (state.coins < item.price) { notEnough(item.price); return; }
      buy(id); track('spend', item.price); render(); return;
    }
    const slot = id === 'glasses' ? 'face' : id === 'scarf' ? 'neck' : 'hat';
    state.equipped[slot] = state.equipped[slot] === id ? null : id;
    save();
    if (onWearablesChanged) onWearablesChanged();
    render();
  }

  render();
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

function fmtClock(s) {
  const m = Math.floor(s / 60), sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

// Start a focus session, optionally rolling into a break. The overlay is kept
// translucent (see css) so the player can still watch their character study.
// onDone(completed) fires once the whole session ends, so the player stands up.
export function startPomodoro(minutes, onDone, opts = {}) {
  beginPhase('focus', minutes, { focusMin: Math.round(minutes), breakMin: Math.round(opts.breakMin || 0), reward: 0, onDone });
}

function beginPhase(mode, minutes, ctx) {
  const overlay = $('focus-overlay');
  const timerEl = $('focus-timer');
  const isBreak = mode === 'break';
  let remaining = Math.max(1, Math.round(minutes * 60));

  overlay.classList.remove('hidden');
  overlay.classList.toggle('is-break', isBreak);
  $('focus-emoji').textContent = isBreak ? '☕' : '📚';
  $('focus-label').textContent = isBreak
    ? `Break — relax! (earned 🪙${ctx.reward})`
    : 'Focus mode';
  $('focus-quote').textContent = QUOTES[Math.floor(Math.random() * QUOTES.length)];

  if (!isBreak && navigator.wakeLock) {
    navigator.wakeLock.request('screen').then(l => { wakeLock = l; }).catch(() => {});
  }

  timerEl.textContent = fmtClock(remaining);
  clearInterval(focusTimer);
  focusTimer = setInterval(() => {
    remaining--;
    timerEl.textContent = fmtClock(remaining);
    if (remaining <= 0) phaseComplete(mode, ctx);
  }, 1000);

  // hold-to-confirm button (give up a focus session / skip a break)
  const btn = $('focus-giveup');
  btn.innerHTML = `<div class="fill"></div><span>${isBreak ? 'Hold to skip break' : 'Hold to give up'}</span>`;
  const fill = btn.querySelector('.fill');
  let holdStart = null, holdRAF = null;
  function holdLoop() {
    if (holdStart === null) return;
    const pct = Math.min(1, (performance.now() - holdStart) / 2000);
    fill.style.width = (pct * 100) + '%';
    if (pct >= 1) { holdStart = null; phaseAbort(mode, ctx); return; }
    holdRAF = requestAnimationFrame(holdLoop);
  }
  const down = (e) => { e.preventDefault(); holdStart = performance.now(); holdLoop(); };
  const up = () => { holdStart = null; fill.style.width = '0%'; if (holdRAF) cancelAnimationFrame(holdRAF); };
  btn.onpointerdown = down; btn.onpointerup = up; btn.onpointerleave = up; btn.onpointercancel = up;
}

function phaseComplete(mode, ctx) {
  clearInterval(focusTimer); focusTimer = null;
  if (mode === 'focus') {
    ctx.reward = ctx.focusMin * 2;
    if (hasBuff('focus')) ctx.reward = Math.round(ctx.reward * 1.5); // cold-brew focus buff
    state.stats.focusMinutes += ctx.focusMin;
    state.stats.pomodorosDone++;
    addCoins(ctx.reward);
    track('studyMin', ctx.focusMin);
    applyNeeds({ energy: -10, fun: -6, hunger: -6 }); // studying is tiring & makes you peckish
    if (ctx.breakMin > 0) beginPhase('break', ctx.breakMin, ctx);
    else finishSession(true, ctx, false);
  } else {
    finishSession(true, ctx, true);
  }
}

function phaseAbort(mode, ctx) {
  clearInterval(focusTimer); focusTimer = null;
  if (mode === 'focus') finishSession(false, ctx, false);
  else finishSession(true, ctx, true); // skipping the break; focus reward already given
}

function finishSession(completed, ctx, fromBreak) {
  const overlay = $('focus-overlay');
  overlay.classList.add('hidden');
  overlay.classList.remove('is-break');
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }

  if (!completed) {
    showModal('😿 Session abandoned', 'No coins this time. The books will be waiting when you\'re ready!');
  } else if (fromBreak) {
    showModal('✅ Break over!',
      `Refreshed and ready. Total focus: <b>${state.stats.focusMinutes} min</b> across ${state.stats.pomodorosDone} session${state.stats.pomodorosDone === 1 ? '' : 's'}.`);
  } else {
    showModal('🎉 Focus session complete!',
      `You studied for <b>${ctx.focusMin} minutes</b> straight!<br>Reward: <b>🪙 ${ctx.reward}</b><br><br>Total focus time: ${state.stats.focusMinutes} min across ${state.stats.pomodorosDone} session${state.stats.pomodorosDone === 1 ? '' : 's'}.`);
  }
  if (ctx.onDone) ctx.onDone(completed);
}

// Setup screen: a focus length + break length the player can dial to the minute.
export function openPomodoroSetup(onStart) {
  let focusMin = 25, breakMin = 5;
  const body = `
    <div class="pomo">
      <div class="pomo-row">
        <span class="pomo-cap">📚 Focus</span>
        <div class="stepper">
          <button type="button" data-act="f-">–</button>
          <b id="pomo-f">25</b><i>min</i>
          <button type="button" data-act="f+">+</button>
        </div>
      </div>
      <div class="pomo-presets" data-group="f">
        <button type="button" data-v="15">15</button>
        <button type="button" data-v="25">25</button>
        <button type="button" data-v="50">50</button>
        <button type="button" data-v="90">90</button>
      </div>
      <div class="pomo-row">
        <span class="pomo-cap">☕ Break</span>
        <div class="stepper">
          <button type="button" data-act="b-">–</button>
          <b id="pomo-b">5</b><i>min</i>
          <button type="button" data-act="b+">+</button>
        </div>
      </div>
      <div class="pomo-presets" data-group="b">
        <button type="button" data-v="0">None</button>
        <button type="button" data-v="5">5</button>
        <button type="button" data-v="10">10</button>
        <button type="button" data-v="15">15</button>
      </div>
      <p class="pomo-hint">Adjustable to the minute · earn 🪙 2 per focus minute</p>
    </div>`;
  showModal('📚 Study session', body, [
    { label: 'Start studying', onClick: () => onStart(focusMin, breakMin) },
    { label: 'Cancel', primary: false },
  ]);

  const fEl = $('pomo-f'), bEl = $('pomo-b');
  const clampF = v => Math.max(1, Math.min(180, v));
  const clampB = v => Math.max(0, Math.min(60, v));
  const render = () => { fEl.textContent = focusMin; bEl.textContent = breakMin; };
  $('modal-body').querySelectorAll('[data-act]').forEach(btn => {
    btn.onclick = () => {
      const a = btn.dataset.act;
      if (a === 'f-') focusMin = clampF(focusMin - 1);
      else if (a === 'f+') focusMin = clampF(focusMin + 1);
      else if (a === 'b-') breakMin = clampB(breakMin - 1);
      else if (a === 'b+') breakMin = clampB(breakMin + 1);
      render();
    };
  });
  $('modal-body').querySelectorAll('.pomo-presets').forEach(group => {
    group.querySelectorAll('[data-v]').forEach(btn => {
      btn.onclick = () => {
        if (group.dataset.group === 'f') focusMin = clampF(+btn.dataset.v);
        else breakMin = clampB(+btn.dataset.v);
        render();
      };
    });
  });
  render();
}
