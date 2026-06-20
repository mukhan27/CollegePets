// Birch Pond fishing — a quick reaction mini-game. Cast, wait for a bite, then
// reel in time. Catches pay coins, lift Fun, and fill a little fish log.

import { state, save, addCoins } from './state.js';
import { applyNeeds, toast } from './systems.js';

const $ = (id) => document.getElementById(id);

const FISH = [
  { e: '🥾', name: 'Old Boot',      coins: 1,  weight: 12, rare: 'junk' },
  { e: '🐟', name: 'Minnow',        coins: 8,  weight: 30 },
  { e: '🐠', name: 'Sunfish',       coins: 13, weight: 24 },
  { e: '🦀', name: 'Crawfish',      coins: 18, weight: 14 },
  { e: '🐡', name: 'Pufferfish',    coins: 24, weight: 9 },
  { e: '🐢', name: 'Pond Turtle',   coins: 32, weight: 5, rare: 'rare' },
  { e: '🦑', name: 'Mystery Squid', coins: 42, weight: 4, rare: 'rare' },
];

let fish = null;

export function startFishing(onDone) {
  $('fish-overlay').classList.remove('hidden');
  fish = { onDone, phase: 'idle', biteT: null, windowT: null };
  setUI('idle');
}

function setUI(phase, html) {
  fish.phase = phase;
  const btn = $('fish-action'), msg = $('fish-msg'), pic = $('fish-pic');
  btn.disabled = false; btn.className = 'fish-btn';
  if (phase === 'idle') { btn.textContent = '🎣 Cast Line'; msg.textContent = 'Cast your line into Birch Pond.'; pic.textContent = '🎣'; }
  else if (phase === 'waiting') { btn.textContent = '…'; btn.disabled = true; msg.textContent = 'Waiting for a bite…'; pic.textContent = '🌊'; }
  else if (phase === 'bite') { btn.textContent = 'REEL IT IN!'; btn.className = 'fish-btn reel'; msg.textContent = 'A bite!'; pic.textContent = '❗'; }
  else if (phase === 'result') { btn.textContent = 'Cast Again'; msg.innerHTML = html; }
}

function onAction() {
  if (!fish) return;
  if (fish.phase === 'idle' || fish.phase === 'result') cast();
  else if (fish.phase === 'bite') reel();
}

function cast() {
  setUI('waiting');
  fish.biteT = setTimeout(() => {
    if (!fish) return;
    setUI('bite');
    fish.windowT = setTimeout(() => { if (fish && fish.phase === 'bite') miss(); }, 1100);
  }, 1400 + Math.random() * 2600);
}

function reel() {
  clearTimeout(fish.windowT);
  const f = pick();
  state.fishLog[f.e] = (state.fishLog[f.e] || 0) + 1;
  if (f.rare !== 'junk') state.stats.fishCaught = (state.stats.fishCaught || 0) + 1;
  addCoins(f.coins); applyNeeds({ fun: 12 }); save();
  const tag = f.rare === 'rare' ? ' <span class="fish-rare">✨ RARE ✨</span>' : f.rare === 'junk' ? ' (junk)' : '';
  $('fish-pic').textContent = f.e;
  setUI('result', `You caught a <b>${f.name}</b>${tag}!<br>+🪙 ${f.coins}`);
  if (f.rare === 'rare') toast(`Rare catch: ${f.name}!`, f.e);
}

function miss() {
  $('fish-pic').textContent = '💨';
  setUI('result', 'It got away — too slow! Cast again.');
}

function pick() {
  const total = FISH.reduce((s, f) => s + f.weight, 0);
  let r = Math.random() * total;
  for (const f of FISH) { if ((r -= f.weight) <= 0) return f; }
  return FISH[1];
}

function close() {
  if (!fish) return;
  clearTimeout(fish.biteT); clearTimeout(fish.windowT);
  $('fish-overlay').classList.add('hidden');
  const cb = fish.onDone; fish = null;
  if (cb) cb();
}

export function initFishingUI() {
  $('fish-action').addEventListener('click', onAction);
  $('fish-quit').addEventListener('click', close);
}
