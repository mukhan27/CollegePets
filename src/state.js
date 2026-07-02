// Persistent game state (localStorage) + item catalog.

import { defaultCreature } from './petFactory.js';

const SAVE_KEY = 'collegepets-save-v1';

// Wearables attach to the pet's head/neck. Decor goes in the dorm bedroom.
export const CATALOG = {
  clothes: [
    { id: 'cap_red',    icon: '🧢', name: 'Red Cap',       price: 50,  slot: 'hat' },
    { id: 'cap_blue',   icon: '🧢', name: 'Blue Cap',      price: 50,  slot: 'hat' },
    { id: 'beanie',     icon: '🎿', name: 'Beanie',        price: 60,  slot: 'hat' },
    { id: 'gradcap',    icon: '🎓', name: 'Grad Cap',      price: 150, slot: 'hat' },
    { id: 'party_hat',  icon: '🎉', name: 'Party Hat',     price: 45,  slot: 'hat' },
    { id: 'flower',     icon: '🌸', name: 'Flower',        price: 55,  slot: 'hat' },
    { id: 'headphones', icon: '🎧', name: 'Headphones',    price: 110, slot: 'hat' },
    { id: 'crown',      icon: '👑', name: 'Golden Crown',  price: 220, slot: 'hat' },
    { id: 'bow',        icon: '🎀', name: 'Hair Bow',      price: 40,  slot: 'hat' },
    { id: 'bucket_hat', icon: '👒', name: 'Bucket Hat',    price: 55,  slot: 'hat' },
    { id: 'cowboy_hat', icon: '🤠', name: 'Cowboy Hat',    price: 75,  slot: 'hat' },
    { id: 'wizard_hat', icon: '🧙', name: 'Wizard Hat',    price: 95,  slot: 'hat' },
    { id: 'glasses',    icon: '👓', name: 'Smart Glasses', price: 80,  slot: 'face' },
    { id: 'sunglasses', icon: '🕶️', name: 'Shades',        price: 90,  slot: 'face' },
    { id: 'round_glasses', icon: '🤓', name: 'Round Glasses', price: 60, slot: 'face' },
    { id: 'star_shades',   icon: '⭐', name: 'Star Shades',   price: 85, slot: 'face' },
    { id: 'scarf',      icon: '🧣', name: 'Team Scarf',    price: 70,  slot: 'neck' },
    { id: 'bowtie',     icon: '🎀', name: 'Bow Tie',       price: 45,  slot: 'neck' },
    { id: 'chain_gold', icon: '📿', name: 'Gold Chain',    price: 70,  slot: 'neck' },
    // free starter accessories (offered in the character creator). On the duck the
    // "top" slot recolours its baked shirt zone — these are shirt COLOURS, not overlays.
    { id: 'shirt_white', icon: '👕', name: 'White Shirt',  price: 0, slot: 'top',    starter: true },
    { id: 'shirt_blue',  icon: '👕', name: 'Blue Shirt',   price: 0, slot: 'top',    starter: true },
    { id: 'shirt_red',   icon: '👕', name: 'Red Shirt',    price: 0, slot: 'top',    starter: true },
    { id: 'shirt_green', icon: '👕', name: 'Green Shirt',  price: 0, slot: 'top',    starter: true },
    { id: 'pants_blue',  icon: '👖', name: 'Blue Jeans',   price: 0, slot: 'bottom', starter: true },
    { id: 'pants_khaki', icon: '👖', name: 'Khakis',       price: 0, slot: 'bottom', starter: true },
    { id: 'pants_grey',  icon: '👖', name: 'Grey Joggers', price: 0, slot: 'bottom', starter: true },
    { id: 'bag_navy',    icon: '🎒', name: 'Navy Backpack',price: 0, slot: 'back',   starter: true },
    { id: 'bag_red',     icon: '🎒', name: 'Red Backpack', price: 0, slot: 'back',   starter: true },
    { id: 'bag_green',   icon: '🎒', name: 'Green Backpack',price: 0,slot: 'back',   starter: true },
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

// which equip slot a clothing item uses (hat / face / neck)
export function clothesSlot(id) {
  const i = CATALOG.clothes.find(c => c.id === id);
  return i ? i.slot : 'hat';
}

// Placeable bedroom furniture — bought repeatably; players own a quantity of
// each and can place up to that many in the grid editor.
export const FURNITURE_CATALOG = [
  { id: 'bed',        icon: '🛏️', name: 'Bed',        price: 80 },
  { id: 'desk',       icon: '🖥️', name: 'Desk',       price: 60 },
  { id: 'nightstand', icon: '🕰️', name: 'Nightstand', price: 35 },
  { id: 'bookshelf',  icon: '📚', name: 'Bookshelf',  price: 50 },
  { id: 'dresser',    icon: '🗄️', name: 'Dresser',    price: 55 },
  { id: 'wardrobe',   icon: '🚪', name: 'Wardrobe',   price: 70 },
  { id: 'sofa',       icon: '🛋️', name: 'Sofa',       price: 90 },
  { id: 'tv',         icon: '📺', name: 'TV',          price: 75 },
  { id: 'beanbag',    icon: '🫘', name: 'Beanbag',     price: 45 },
  { id: 'plant',      icon: '🪴', name: 'Plant',       price: 30 },
  { id: 'lamp',       icon: '💡', name: 'Floor Lamp',  price: 40 },
  { id: 'rug',        icon: '🟪', name: 'Rug',         price: 35 },
  { id: 'mini_fridge',   icon: '🧊', name: 'Mini Fridge',   price: 55 },
  { id: 'gaming_chair',  icon: '🎮', name: 'Gaming Chair',  price: 85 },
  { id: 'floor_mirror',  icon: '🪞', name: 'Floor Mirror',  price: 60 },
  { id: 'aquarium',      icon: '🐠', name: 'Aquarium',      price: 100 },
  { id: 'string_lights', icon: '✨', name: 'String Lights', price: 45 },
  { id: 'rug_round',     icon: '🟣', name: 'Round Rug',     price: 35 },
];

// Dining-hall menu. Each food tops up the gentle hunger/fun meters (and cold brew
// gives a study focus buff); foods can also be gifted to friends.
export const FOOD_CATALOG = [
  { id: 'pizza',    icon: '🍕', name: 'Pizza Slice',   price: 12, hunger: 30, fun: 10 },
  { id: 'burger',   icon: '🍔', name: 'Cheeseburger',  price: 16, hunger: 40, fun: 6 },
  { id: 'salad',    icon: '🥗', name: 'Garden Salad',  price: 14, hunger: 30, fun: 8 },
  { id: 'sushi',    icon: '🍣', name: 'Sushi Combo',   price: 22, hunger: 40, fun: 10 },
  { id: 'ramen',    icon: '🍜', name: 'Spicy Ramen',   price: 15, hunger: 38, fun: 8 },
  { id: 'coffee',   icon: '☕', name: 'Cold Brew',     price: 8,  hunger: 6,  fun: 6, buff: 'focus' },
  { id: 'boba',     icon: '🧋', name: 'Boba Tea',      price: 10, hunger: 10, fun: 18 },
  { id: 'donut',    icon: '🍩', name: 'Sprinkle Donut',price: 6,  hunger: 16, fun: 14 },
  { id: 'icecream', icon: '🍦', name: 'Ice Cream',     price: 7,  hunger: 12, fun: 22 },
];

export function findFood(id) { return FOOD_CATALOG.find(f => f.id === id) || null; }

function defaults() {
  return {
    petType: null,
    petName: '',
    creature: defaultCreature(), // custom "Birchling" appearance (used when petType === 'creature')
    coins: 100,
    owned: [],                 // item ids
    equipped: { hat: null, face: null, neck: null, top: null, bottom: null, back: null },
    room: { rug: null, poster: null, plant: false, lamp: false, beanbag: false, bed: 'bed_red', layout: null },
    furniture: { bed: 1, desk: 1, nightstand: 1, bookshelf: 1, rug: 1, plant: 1, lamp: 1, beanbag: 1 }, // owned counts
    stats: { focusMinutes: 0, pomodorosDone: 0, hoopsScored: 0, cupsSunk: 0, mealsEaten: 0, gamesWon: 0, daysActive: 1, fishCaught: 0 },
    fishLog: {},               // emoji -> count caught
    // ---- campus-life layer (gentle, never-punishing flavor meters) ----
    needs: { hunger: 80, social: 70, fun: 70 },
    needsTick: Date.now(),     // last time needs decayed (for offline decay)
    level: 1, xp: 0,
    day: 1, dayStamp: null,    // YYYY-M-D the current game day was started on
    loginStreak: 0, lastLogin: null, // daily-streak bonus
    friends: {},               // student name -> friendship points
    achievements: {},          // unlocked achievement ids
    pantry: {},                // owned food/gift items: id -> count
    pet2: null,                // a second adopted pet (companion), future use
    buffs: {},                 // name -> expiry timestamp
  };
}

// Backfill any missing nested fields so older saves keep working after updates.
function ensureShape(s) {
  const d = defaults();
  for (const k of Object.keys(d)) if (s[k] === undefined) s[k] = d[k];
  for (const k of ['stats', 'needs', 'friends', 'pantry', 'buffs', 'room', 'furniture', 'equipped', 'creature']) {
    if (typeof s[k] !== 'object' || s[k] === null) s[k] = d[k];
    else if (d[k] && !Array.isArray(d[k])) for (const f of Object.keys(d[k])) if (s[k][f] === undefined) s[k][f] = d[k][f];
  }
  delete s.needs.energy;       // energy meter retired
  delete s.quests; delete s.questStamp; delete s.daily; // quest system retired
  // legacy animal pets (cat/dog/bear/duck/hamster) retired — everyone's a duck now.
  // Old saves keep their name/coins/etc; the pet becomes the default duck.
  if (s.petType && s.petType !== 'creature') {
    s.petType = 'creature';
    if (!s.creature || typeof s.creature !== 'object') s.creature = d.creature;
  }
  return s;
}

export const state = load();

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return ensureShape(Object.assign(defaults(), JSON.parse(raw)));
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

export function furnitureCount(id) { return (state.furniture && state.furniture[id]) || 0; }
export function buyFurniture(id) {
  const item = FURNITURE_CATALOG.find(f => f.id === id);
  if (!item || state.coins < item.price) return false;
  state.coins -= item.price;
  if (!state.furniture) state.furniture = {};
  state.furniture[id] = (state.furniture[id] || 0) + 1;
  save();
  const el = document.getElementById('coin-count');
  if (el) el.textContent = state.coins;
  return true;
}

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

function refreshCoins() { const el = document.getElementById('coin-count'); if (el) el.textContent = state.coins; }

// pantry: owned food / giftable items
export function pantryCount(id) { return (state.pantry && state.pantry[id]) || 0; }
export function addToPantry(id, n = 1) { state.pantry[id] = (state.pantry[id] || 0) + n; save(); }
export function takeFromPantry(id, n = 1) {
  if (pantryCount(id) < n) return false;
  state.pantry[id] -= n; if (state.pantry[id] <= 0) delete state.pantry[id];
  save(); return true;
}
export function buyFood(id) {
  const f = findFood(id);
  if (!f || state.coins < f.price) return false;
  state.coins -= f.price;
  addToPantry(id, 1);
  refreshCoins();
  return true;
}
