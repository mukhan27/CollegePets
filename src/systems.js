// Campus-life systems: needs (energy/hunger/social/fun), XP & levels, daily
// quests, friendship, food/buffs, and the unified "Campus" menu panel. Pure
// state + DOM (no Three.js), so it's easy to reason about and test.

import { state, save, addCoins, FOOD_CATALOG, findFood, pantryCount, takeFromPantry } from './state.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v));
const todayStamp = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };

export const NEEDS = [
  { key: 'energy', icon: '⚡', label: 'Energy', color: '#ffd166' },
  { key: 'hunger', icon: '🍔', label: 'Hunger', color: '#ff9f43' },
  { key: 'social', icon: '💬', label: 'Social', color: '#6be0a0' },
  { key: 'fun',    icon: '🎉', label: 'Fun',    color: '#7ec8e3' },
];
// per-minute decay
const DECAY = { energy: 1.6, hunger: 2.2, social: 1.5, fun: 1.6 };

const QUEST_TEMPLATES = [
  { id: 'study', icon: '📚', type: 'studyMin', verb: 'Study for', unit: 'min', goals: [25, 50], reward: 35 },
  { id: 'hoops', icon: '🏀', type: 'hoops',    verb: 'Score',      unit: 'baskets', goals: [3, 6], reward: 25 },
  { id: 'chat',  icon: '💬', type: 'chats',    verb: 'Chat with',  unit: 'students', goals: [2, 3], reward: 20 },
  { id: 'spend', icon: '🛍️', type: 'spend',    verb: 'Spend',      unit: 'coins', goals: [40, 80], reward: 15 },
  { id: 'meals', icon: '🍽️', type: 'meals',    verb: 'Eat',        unit: 'meals', goals: [1, 2], reward: 18 },
  { id: 'games', icon: '🎮', type: 'games',    verb: 'Win',        unit: 'mini-games', goals: [1, 2], reward: 30 },
];

export function xpForLevel(l) { return 80 + (l - 1) * 60; } // xp needed to go from level l → l+1

// solo, multiplayer-agnostic milestones (no NPC dependency)
const ACHIEVEMENTS = [
  { id: 'lvl5',     icon: '⭐', name: 'Rising Star',  desc: 'Reach level 5',          goal: 5,   cur: () => state.level },
  { id: 'study100', icon: '📚', name: 'Bookworm',     desc: 'Study 100 minutes',      goal: 100, cur: () => Math.round(state.stats.focusMinutes || 0) },
  { id: 'hoops50',  icon: '🏀', name: 'Baller',       desc: 'Score 50 baskets',       goal: 50,  cur: () => state.stats.hoopsScored || 0 },
  { id: 'meals20',  icon: '🍽️', name: 'Foodie',       desc: 'Eat 20 meals',           goal: 20,  cur: () => state.stats.mealsEaten || 0 },
  { id: 'games10',  icon: '🎮', name: 'Arcade Pro',   desc: 'Win 10 mini-games',      goal: 10,  cur: () => state.stats.gamesWon || 0 },
  { id: 'fish25',   icon: '🎣', name: 'Angler',       desc: 'Catch 25 fish',          goal: 25,  cur: () => state.stats.fishCaught || 0 },
  { id: 'days7',    icon: '📅', name: 'Regular',      desc: 'Spend 7 days on campus',  goal: 7,   cur: () => state.stats.daysActive || 1 },
  { id: 'fits5',    icon: '🧢', name: 'Fashionista',  desc: 'Own 5 outfit items',     goal: 5,   cur: () => state.owned.length },
];
const ACH_REWARD = 50;

export function checkAchievements() {
  let any = false;
  for (const a of ACHIEVEMENTS) {
    if (!state.achievements[a.id] && a.cur() >= a.goal) {
      state.achievements[a.id] = true; any = true;
      addCoins(ACH_REWARD);
      toast(`Achievement: ${a.name}! +🪙${ACH_REWARD}`, a.icon);
    }
  }
  if (any) { save(); if (isCampusOpen()) renderCampus(); }
}

// ---------------------------------------------------------------- toasts
let toastTimer = null;
export function toast(msg, icon = '✨') {
  let el = $('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.innerHTML = `<span>${icon}</span> ${msg}`;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// ---------------------------------------------------------------- needs
let acc = 0;
export function tickSystems(dt) {
  acc += dt;
  if (acc < 1) return;          // update needs roughly once a second
  const mins = acc / 60; acc = 0;
  for (const n of NEEDS) state.needs[n.key] = clamp(state.needs[n.key] - DECAY[n.key] * mins);
  state.needsTick = Date.now();
  expireBuffs();
  renderNeeds();
}

function applyOfflineDecay() {
  const mins = Math.min(600, (Date.now() - (state.needsTick || Date.now())) / 60000);
  if (mins > 1) for (const n of NEEDS) state.needs[n.key] = clamp(state.needs[n.key] - DECAY[n.key] * mins * 0.5);
  state.needsTick = Date.now();
}

export function applyNeeds(deltas) {
  for (const k in deltas) if (state.needs[k] !== undefined) state.needs[k] = clamp(state.needs[k] + deltas[k]);
  save(); renderNeeds();
}

function renderNeeds() {
  for (const n of NEEDS) {
    const fill = $(`need-${n.key}-fill`);
    if (fill) { const v = state.needs[n.key]; fill.style.width = v + '%'; fill.style.background = v < 22 ? '#e15b5b' : n.color; }
  }
  const lv = $('level-num'); if (lv) lv.textContent = state.level;
  const xf = $('xp-fill'); if (xf) xf.style.width = Math.min(100, state.xp / xpForLevel(state.level) * 100) + '%';
}

// ---------------------------------------------------------------- buffs
export function hasBuff(name) { return (state.buffs[name] || 0) > Date.now(); }
export function grantBuff(name, minutes) { state.buffs[name] = Date.now() + minutes * 60000; save(); }
function expireBuffs() { for (const k in state.buffs) if (state.buffs[k] < Date.now()) delete state.buffs[k]; }

// ---------------------------------------------------------------- xp / level
export function addXp(n) {
  state.xp += n;
  while (state.xp >= xpForLevel(state.level)) {
    state.xp -= xpForLevel(state.level);
    state.level++;
    const bonus = 20 + state.level * 10;
    addCoins(bonus);
    toast(`Level ${state.level}! +🪙${bonus}`, '⭐');
  }
  save(); renderNeeds(); checkAchievements();
}

// ---------------------------------------------------------------- quests
function genQuests() {
  const pool = [...QUEST_TEMPLATES];
  const picks = [];
  while (picks.length < 3 && pool.length) {
    const t = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    const goal = t.goals[Math.floor(Math.random() * t.goals.length)];
    picks.push({ id: t.id, icon: t.icon, type: t.type, verb: t.verb, unit: t.unit, goal, reward: t.reward, claimed: false });
  }
  state.quests = picks;
  state.questStamp = todayStamp();
  save();
}

const stampToDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m, d); };
const dayDiff = (a, b) => Math.round((stampToDate(a) - stampToDate(b)) / 86400000);

export function newDayCheck() {
  const today = todayStamp();
  if (state.dayStamp !== today) {
    if (state.dayStamp !== null) { state.day++; state.stats.daysActive = (state.stats.daysActive || 1) + 1; }
    state.dayStamp = today;
    state.daily = { studyMin: 0, hoops: 0, chats: 0, spend: 0, meals: 0, games: 0, chatNames: [] };
    // daily login streak bonus
    const prev = state.lastLogin;
    state.loginStreak = (prev && dayDiff(today, prev) === 1) ? (state.loginStreak || 1) + 1 : 1;
    state.lastLogin = today;
    const bonus = 20 + Math.min(state.loginStreak, 7) * 10;
    addCoins(bonus);
    setTimeout(() => toast(`Day ${state.loginStreak} streak! +🪙${bonus}`, '🎁'), 400);
    genQuests();
    save();
    return true;
  }
  if (!state.quests || !state.quests.length) genQuests();
  return false;
}

export function track(type, amount = 1, meta = null) {
  if (state.daily[type] === undefined) state.daily[type] = 0;
  // chats count unique students per day
  if (type === 'chats' && meta) {
    if (state.daily.chatNames.includes(meta)) return;
    state.daily.chatNames.push(meta);
    state.daily.chats = state.daily.chatNames.length;
  } else {
    state.daily[type] += amount;
  }
  // small need/xp nudges for doing things
  if (type === 'chats') applyNeeds({ social: 10 });
  if (type === 'games') addXp(8);
  if (type === 'hoops') addXp(amount);
  if (type === 'studyMin') addXp(Math.round(amount / 5));
  // surface quest completions
  for (const q of state.quests) {
    if (q.type === type && !q.claimed && !q._done && (state.daily[q.type] || 0) >= q.goal) {
      q._done = true;
      toast(`Quest ready: ${q.verb} ${q.goal} ${q.unit}`, q.icon);
    }
  }
  save();
  checkAchievements();
  if (isCampusOpen()) renderCampus();
}

function claimQuest(i) {
  const q = state.quests[i];
  if (!q || q.claimed || (state.daily[q.type] || 0) < q.goal) return;
  q.claimed = true;
  addCoins(q.reward); addXp(20);
  toast(`+🪙${q.reward} · ${q.verb} ${q.goal} ${q.unit} done!`, '✅');
  save(); renderCampus();
}

// ---------------------------------------------------------------- friendship
const TIERS = [
  { min: 0, label: 'New Face', icon: '🙂' },
  { min: 30, label: 'Acquaintance', icon: '😺' },
  { min: 80, label: 'Friend', icon: '💛' },
  { min: 160, label: 'Close Friend', icon: '💖' },
  { min: 280, label: 'Bestie', icon: '🌟' },
];
export function friendPoints(name) { return state.friends[name] || 0; }
export function friendTier(name) { const p = friendPoints(name); let t = TIERS[0]; for (const x of TIERS) if (p >= x.min) t = x; return t; }
export function addFriendship(name, pts) {
  const before = friendTier(name).label;
  state.friends[name] = (state.friends[name] || 0) + pts;
  save();
  const after = friendTier(name);
  if (after.label !== before) toast(`${name} is now your ${after.label}!`, after.icon);
  if (isCampusOpen()) renderCampus();
}

// ---------------------------------------------------------------- eating
export function eat(foodId, { fromPantry = true } = {}) {
  const f = findFood(foodId);
  if (!f) return false;
  if (fromPantry && !takeFromPantry(foodId)) return false;
  applyNeeds({ hunger: f.hunger || 0, energy: f.energy || 0, fun: f.fun || 0 });
  state.stats.mealsEaten = (state.stats.mealsEaten || 0) + 1;
  track('meals', 1);
  if (f.buff === 'focus') { grantBuff('focus', 30); toast(`${f.name} — focus boost for studying!`, f.icon); }
  else toast(`Ate ${f.name}. Yum!`, f.icon);
  return true;
}

// ---------------------------------------------------------------- Campus panel
let campusTab = 'quests';
export function isCampusOpen() { const el = $('campus-panel'); return el && !el.classList.contains('hidden'); }
export function openCampus(tab) { campusTab = tab || campusTab; checkAchievements(); $('campus-panel').classList.remove('hidden'); renderCampus(); }
export function closeCampus() { $('campus-panel').classList.add('hidden'); }

function bar(v, color) { return `<div class="cp-bar"><div class="cp-bar-fill" style="width:${clamp(v)}%;background:${v < 22 ? '#e15b5b' : color}"></div></div>`; }

function renderCampus() {
  const body = $('campus-body');
  const tabs = [['quests', '📋'], ['awards', '🏆'], ['friends', '💛'], ['me', '🐾']];
  let html = `<div class="cp-tabs">${tabs.map(([k, l]) => `<button class="cp-tab ${campusTab === k ? 'active' : ''}" data-tab="${k}">${l}</button>`).join('')}</div><div class="cp-content">`;

  if (campusTab === 'quests') {
    html += `<div class="cp-day">Day ${state.day} · Daily Quests</div>`;
    if (!state.quests.length) html += `<p class="cp-empty">No quests right now — check back tomorrow!</p>`;
    state.quests.forEach((q, i) => {
      const prog = Math.min(state.daily[q.type] || 0, q.goal);
      const done = prog >= q.goal;
      html += `<div class="cp-quest ${q.claimed ? 'claimed' : done ? 'done' : ''}">
        <div class="cp-q-icon">${q.icon}</div>
        <div class="cp-q-main">
          <div class="cp-q-text">${q.verb} ${q.goal} ${q.unit}</div>
          ${bar(prog / q.goal * 100, '#6be0a0')}
          <div class="cp-q-sub">${prog}/${q.goal} · 🪙${q.reward}</div>
        </div>
        <button class="cp-q-btn" data-claim="${i}" ${q.claimed || !done ? 'disabled' : ''}>${q.claimed ? '✓' : done ? 'Claim' : '…'}</button>
      </div>`;
    });
  } else if (campusTab === 'friends') {
    const names = Object.keys(state.friends);
    html += `<div class="cp-day">Campus Friends</div>`;
    if (!names.length) html += `<p class="cp-empty">Walk up to students and chat to make friends!</p>`;
    names.sort((a, b) => state.friends[b] - state.friends[a]).forEach((n) => {
      const t = friendTier(n);
      html += `<div class="cp-friend"><span class="cp-f-icon">${t.icon}</span>
        <div class="cp-f-main"><div class="cp-f-name">${n}</div><div class="cp-f-tier">${t.label} · ${friendPoints(n)} pts</div></div></div>`;
    });
  } else if (campusTab === 'awards') {
    const got = ACHIEVEMENTS.filter(a => state.achievements[a.id]).length;
    html += `<div class="cp-day">Achievements · ${got}/${ACHIEVEMENTS.length}</div>`;
    for (const a of ACHIEVEMENTS) {
      const cur = Math.min(a.cur(), a.goal), done = !!state.achievements[a.id];
      html += `<div class="cp-quest ${done ? 'done' : ''}">
        <div class="cp-q-icon">${a.icon}</div>
        <div class="cp-q-main">
          <div class="cp-q-text">${a.name}${done ? ' ✓' : ''}</div>
          ${bar(cur / a.goal * 100, '#ffd166')}
          <div class="cp-q-sub">${a.desc} · ${cur}/${a.goal}</div>
        </div>
      </div>`;
    }
  } else {
    const s = state.stats;
    html += `<div class="cp-day">${state.petName} · Level ${state.level}</div>
      <div class="cp-xp">XP ${state.xp}/${xpForLevel(state.level)}${bar(state.xp / xpForLevel(state.level) * 100, '#7ec8e3')}</div>
      <div class="cp-needs">`;
    for (const n of NEEDS) html += `<div class="cp-need"><span>${n.icon} ${n.label}</span>${bar(state.needs[n.key], n.color)}</div>`;
    html += `</div><div class="cp-stats">
      <div>📚 ${Math.round(s.focusMinutes || 0)} focus min</div>
      <div>🏀 ${s.hoopsScored || 0} baskets</div>
      <div>🍽️ ${s.mealsEaten || 0} meals</div>
      <div>🎮 ${s.gamesWon || 0} games won</div>
      <div>🎣 ${s.fishCaught || 0} fish</div>
      <div>📅 ${s.daysActive || 1} days on campus</div>
    </div>`;
  }
  html += '</div>';
  body.innerHTML = html;
  body.querySelectorAll('.cp-tab').forEach(b => b.addEventListener('click', () => { campusTab = b.dataset.tab; renderCampus(); }));
  body.querySelectorAll('[data-claim]').forEach(b => b.addEventListener('click', () => claimQuest(+b.dataset.claim)));
}

// ---------------------------------------------------------------- init
export function initSystems() {
  applyOfflineDecay();
  newDayCheck();
  checkAchievements();
  renderNeeds();
  $('campus-close')?.addEventListener('click', closeCampus);
  $('menu-btn')?.addEventListener('click', () => (isCampusOpen() ? closeCampus() : openCampus()));
  // mark quests already satisfied (so claim works) without spamming toasts
  for (const q of state.quests) if ((state.daily[q.type] || 0) >= q.goal) q._done = true;
}
