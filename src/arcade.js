// Student-union arcade mini-games: a trivia quiz and a memory match. Both pay
// out coins and feed the fun/needs + daily-quest systems.

import { addCoins } from './state.js';
import { showModal } from './ui.js';
import { track, applyNeeds, toast } from './systems.js';

const $ = (id) => document.getElementById(id);
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// ------------------------------------------------------------ trivia
const TRIVIA = [
  { q: 'How long is a classic Pomodoro focus block?', a: ['10 min', '25 min', '45 min', '60 min'], c: 1 },
  { q: 'What does GPA stand for?', a: ['Great Pet Award', 'Grade Point Average', 'General Pass Audit', 'Group Project Add'], c: 1 },
  { q: 'Best cure for a 9am lecture?', a: ['Cold brew ☕', 'Skipping it', 'More sleep', 'All of the above'], c: 3 },
  { q: 'How many players per side in basketball?', a: ['4', '5', '6', '7'], c: 1 },
  { q: 'A "syllabus" is…', a: ['A dinosaur', 'The course outline', 'A type of pasta', 'A study app'], c: 1 },
  { q: 'Which restores Energy fastest here?', a: ['Salad 🥗', 'Cold Brew ☕', 'Ice Cream 🍦', 'Donut 🍩'], c: 1 },
  { q: 'Where do you earn coins by studying?', a: ['The court', 'The Library', 'The dorm', 'The store'], c: 1 },
  { q: 'What boosts your Social need?', a: ['Sleeping', 'Chatting with students', 'Studying', 'Shopping'], c: 1 },
  { q: 'Finals week is best survived with…', a: ['Panic', 'A study plan + breaks', 'No sleep', 'Pure vibes'], c: 1 },
  { q: 'The dining hall lets you…', a: ['Only look', 'Order food & work a shift', 'Sleep', 'Take exams'], c: 1 },
  { q: 'Which is a healthy study habit?', a: ['All-nighters', 'Spaced repetition', 'Cramming only', 'Ignoring notes'], c: 1 },
  { q: 'What raises a friendship tier?', a: ['Ignoring people', 'Chatting & hanging out', 'Spending coins', 'Sleeping'], c: 1 },
];

let triv = null;
export function startTrivia(onDone) {
  triv = { qs: shuffle([...TRIVIA]).slice(0, 5), i: 0, score: 0, locked: false, onDone };
  $('trivia-overlay').classList.remove('hidden');
  renderTriv();
}
function renderTriv() {
  const cur = triv.qs[triv.i];
  $('trivia-progress').textContent = `Q${triv.i + 1}/${triv.qs.length}`;
  $('trivia-score').textContent = `✅ ${triv.score}`;
  $('trivia-q').textContent = cur.q;
  const wrap = $('trivia-options'); wrap.innerHTML = '';
  cur.a.forEach((opt, idx) => {
    const b = document.createElement('button');
    b.className = 'trivia-opt'; b.textContent = opt;
    b.addEventListener('click', () => answerTriv(idx, b));
    wrap.appendChild(b);
  });
}
function answerTriv(idx, btn) {
  if (triv.locked) return;
  triv.locked = true;
  const cur = triv.qs[triv.i];
  const opts = $('trivia-options').children;
  opts[cur.c].classList.add('correct');
  if (idx === cur.c) triv.score++;
  else btn.classList.add('wrong');
  setTimeout(() => {
    triv.i++; triv.locked = false;
    if (triv.i >= triv.qs.length) endTriv();
    else renderTriv();
  }, 850);
}
function endTriv() {
  $('trivia-overlay').classList.add('hidden');
  const coins = triv.score * 6;
  addCoins(coins);
  applyNeeds({ fun: 18, social: 4 });
  if (triv.score >= 3) track('games', 1);
  const sc = triv.score, cb = triv.onDone; triv = null;
  showModal('🧠 Trivia complete!', `You got <b>${sc}/5</b> right!<br>Reward: <b>🪙 ${coins}</b>`, [{ label: 'Done', onClick: () => { if (cb) cb(); } }]);
}

// ------------------------------------------------------------ memory match
const MEM_EMOJI = ['🐱', '🐶', '🐻', '🦆', '🐹', '🍕', '☕', '🏀'];
let mem = null;
export function startMemory(onDone) {
  const faces = shuffle([...MEM_EMOJI]).slice(0, 6);
  const deck = shuffle([...faces, ...faces].map((e, i) => ({ e, id: i })));
  mem = { deck, flipped: [], matched: 0, moves: 0, locked: false, onDone };
  $('memory-overlay').classList.remove('hidden');
  renderMem();
}
function renderMem() {
  $('memory-moves').textContent = `Moves: ${mem.moves}`;
  const grid = $('memory-grid'); grid.innerHTML = '';
  mem.deck.forEach((card, idx) => {
    const b = document.createElement('button');
    const shown = card.up || card.done;
    b.className = 'mem-card' + (shown ? ' up' : '') + (card.done ? ' done' : '');
    b.textContent = shown ? card.e : '';
    b.addEventListener('click', () => flipMem(idx));
    grid.appendChild(b);
  });
}
function flipMem(idx) {
  if (mem.locked) return;
  const card = mem.deck[idx];
  if (card.up || card.done) return;
  card.up = true;
  mem.flipped.push(idx);
  if (mem.flipped.length === 2) {
    mem.moves++; mem.locked = true;
    const [a, b] = mem.flipped.map(i => mem.deck[i]);
    if (a.e === b.e) {
      a.done = b.done = true; mem.matched++;
      mem.flipped = []; mem.locked = false;
      renderMem();
      if (mem.matched === 6) endMem();
    } else {
      renderMem();
      setTimeout(() => { a.up = b.up = false; mem.flipped = []; mem.locked = false; renderMem(); }, 750);
    }
  } else {
    renderMem();
  }
}
function endMem() {
  $('memory-overlay').classList.add('hidden');
  const coins = Math.max(8, 40 - Math.max(0, mem.moves - 6) * 3); // fewer moves = more coins
  addCoins(coins);
  applyNeeds({ fun: 16 });
  track('games', 1);
  const mv = mem.moves, cb = mem.onDone; mem = null;
  showModal('🃏 Memory cleared!', `Solved in <b>${mv}</b> moves!<br>Reward: <b>🪙 ${coins}</b>`, [{ label: 'Done', onClick: () => { if (cb) cb(); } }]);
}

export function initArcadeUI() {
  $('trivia-quit').addEventListener('click', () => { if (triv) { $('trivia-overlay').classList.add('hidden'); const cb = triv.onDone; triv = null; if (cb) cb(); } });
  $('memory-quit').addEventListener('click', () => { if (mem) { $('memory-overlay').classList.add('hidden'); const cb = mem.onDone; mem = null; if (cb) cb(); } });
}
