// Persistent game state (localStorage) + item catalog.

const SAVE_KEY = 'collegepets-save-v1';

export const PET_TYPES = [
  { id: 'cat',     emoji: '🐱', label: 'Cat',     desc: 'Cool & curious' },
  { id: 'dog',     emoji: '🐶', label: 'Dog',     desc: 'Loyal & upbeat' },
  { id: 'bear',    emoji: '🐻', label: 'Bear',    desc: 'Big & friendly' },
  { id: 'duck',    emoji: '🦆', label: 'Duck',    desc: 'Chill & quirky' },
  { id: 'hamster', emoji: '🐹', label: 'Hamster', desc: 'Tiny & speedy' },
];

// Wearables attach to the pet's head/neck. Decor goes in the dorm bedroom.
export const CATALOG = {
  clothes: [
    { id: 'cap_red',   icon: '🧢', name: 'Red Cap',      price: 50 },
    { id: 'cap_blue',  icon: '🧢', name: 'Blue Cap',     price: 50 },
    { id: 'beanie',    icon: '🎿', name: 'Beanie',       price: 60 },
    { id: 'gradcap',   icon: '🎓', name: 'Grad Cap',     price: 150 },
    { id: 'bow',       icon: '🎀', name: 'Hair Bow',     price: 40 },
    { id: 'glasses',   icon: '👓', name: 'Smart Glasses',price: 80 },
    { id: 'scarf',     icon: '🧣', name: 'Team Scarf',   price: 70 },
  ],
  decor: [
    { id: 'rug_blue',    icon: '🟦', name: 'Blue Rug',     price: 40,  slot: 'rug' },
    { id: 'rug_pink',    icon: '🟪', name: 'Pink Rug',     price: 40,  slot: 'rug' },
    { id: 'poster_band', icon: '🎸', name: 'Band Poster',  price: 30,  slot: 'poster' },
    { id: 'poster_study',icon: '📈', name: 'Grind Poster', price: 30,  slot: 'poster' },
    { id: 'plant',       icon: '🪴', name: 'Plant Buddy',  price: 50,  slot: 'plant' },
    { id: 'lamp_lava',   icon: '🛋️', name: 'Lava Lamp',    price: 60,  slot: 'lamp' },
    { id: 'beanbag',     icon: '🫘', name: 'Beanbag',      price: 70,  slot: 'beanbag' },
    { id: 'bed_blue',    icon: '🛏️', name: 'Blue Bedding', price: 25,  slot: 'bed' },
    { id: 'bed_pink',    icon: '🛏️', name: 'Pink Bedding', price: 25,  slot: 'bed' },
    { id: 'bed_green',   icon: '🛏️', name: 'Green Bedding',price: 25,  slot: 'bed' },
  ],
};

export function findItem(id) {
  return CATALOG.clothes.find(i => i.id === id) || CATALOG.decor.find(i => i.id === id) || null;
}

function defaults() {
  return {
    petType: null,
    petName: '',
    coins: 100,
    owned: [],                 // item ids
    equipped: { hat: null, face: null, neck: null },
    room: { rug: null, poster: null, plant: false, lamp: false, beanbag: false, bed: 'bed_red', layout: null },
    stats: { focusMinutes: 0, pomodorosDone: 0, hoopsScored: 0, cupsSunk: 0 },
  };
}

export const state = load();

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return Object.assign(defaults(), JSON.parse(raw));
  } catch (e) { /* corrupted save — start fresh */ }
  return defaults();
}

export function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) { /* storage full/blocked */ }
}

export function addCoins(n) {
  state.coins = Math.max(0, state.coins + n);
  save();
  const el = document.getElementById('coin-count');
  if (el) el.textContent = state.coins;
}

export function owns(id) { return state.owned.includes(id); }

export function buy(id) {
  const item = findItem(id);
  if (!item || owns(id) || state.coins < item.price) return false;
  state.coins -= item.price;
  state.owned.push(id);
  save();
  const el = document.getElementById('coin-count');
  if (el) el.textContent = state.coins;
  return true;
}
