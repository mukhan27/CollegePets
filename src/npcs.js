// NPC students: wandering pets on the quad with speech bubbles and a
// keyword-based chat brain (single-player stand-in for real students).

import * as THREE from 'three';
import { createPet } from './petFactory.js';

// Every student is a duck; each gets a distinct feather/shirt/bill/eye palette
// so they stay recognizable at a glance ({bodyColor, shirtColor, muzzleColor,
// eyeColor} — the same appearance fields as the player's duck).
export const NPC_DEFS = [
  { name: 'Maya',   emoji: '🦆', major: 'Art History',  vibe: 'dreamy',
    appearance: { bodyColor: 0xf7e7a8, shirtColor: 0xf76fa0, muzzleColor: 0xf2a93b, eyeColor: 0x6b4324 }, // cream + pink
    greet: "Oh hey! I was just sketching the fountain. It never sits still though… rude." },
  { name: 'Boomer', emoji: '🦆', major: 'Kinesiology',  vibe: 'hype',
    appearance: { bodyColor: 0xf0c060, shirtColor: 0xee3b34, muzzleColor: 0xe07b2e, eyeColor: 0x2a241e }, // golden + red
    greet: "YO!! New face!! Wanna run laps with me?? Or not!! Either way, HI!!" },
  { name: 'Bruno',  emoji: '🦆', major: 'Philosophy',   vibe: 'chill',
    appearance: { bodyColor: 0x8a5a32, shirtColor: 0x3a3f4a, muzzleColor: 0xffc04d, eyeColor: 0x2a241e }, // brown + navy
    greet: "Hey. I was just thinking about hibernation as a metaphor for finals week." },
  { name: 'Quincy', emoji: '🦆', major: 'Marine Bio',   vibe: 'quirky',
    appearance: { bodyColor: 0xffd23e, shirtColor: 0x55b76a, muzzleColor: 0xff9e2c, eyeColor: 0x1a1714 }, // classic yellow + green
    greet: "Quack— I mean, hi. Sorry, I code-switch around new people." },
  { name: 'Pip',    emoji: '🦆', major: 'Computer Sci', vibe: 'nerdy',
    appearance: { bodyColor: 0xf7f1e6, shirtColor: 0x1fc4b0, muzzleColor: 0xd6584f, eyeColor: 0x3f7bbf }, // white + teal
    greet: "Hi!! Sorry if I'm jittery, I've had four espressos and a sunflower seed." },
  { name: 'Cleo',   emoji: '🦆', major: 'Economics',    vibe: 'sassy',
    appearance: { bodyColor: 0x9aa0a6, shirtColor: 0x9b5de5, muzzleColor: 0x4a4f57, eyeColor: 0x6f6086 }, // grey + purple
    greet: "Hi. I'd love to chat, but my nap schedule is brutal. You've got 5 minutes." },
];

const REPLY_POOLS = {
  hello: [
    "Hey hey! Good to see you around campus!",
    "Hi! You settling in okay?",
    "Heyyy! Love the energy.",
  ],
  study: [
    "The library is the move. Grab a seat and do a pomodoro — the focus lock is brutal but it works.",
    "I study best in the library. 25 minutes on, then a treat. That's the system.",
    "Honestly? Pomodoros saved my GPA. The library seats are great for it.",
  ],
  game: [
    "The hoops by the Rec Gym are open all day. I've got a mean jump shot for someone with no thumbs.",
    "The new Lecture Hall has a huge screen — and the upstairs study desks are clutch before exams.",
    "Basketball court's behind the gym. First to 10 buckets buys snacks!",
  ],
  food: [
    "Dining hall pizza is mid but it's OUR mid, you know?",
    "I'd fight a goose for the dining hall's mac and cheese. Respectfully.",
    "Snack tip: vending machine in the dorm common room. Third button is the good one.",
  ],
  major: [
    "I'm loving my classes this term. Mostly. Okay, two of them.",
    "My major chose me, honestly. The 8am lectures did not.",
    "It's a grind, but the professors here are actually great.",
  ],
  shop: [
    "Campus Store has the cutest hats. The grad cap is pricey but ICONIC.",
    "I spent all my coins on a scarf and I regret NOTHING.",
    "If you earn coins studying you can deck out your whole room. Capitalism, but make it cozy.",
  ],
  dorm: [
    "Maple Dorm common room has a vending machine and a TV nobody can agree on.",
    "You can decorate your room! Mine is 90% posters at this point.",
    "Dorm life is great until someone microwaves fish. Dark times.",
  ],
  bye: [
    "See you around campus! 👋",
    "Later! Come find me if you wanna hang.",
    "Bye!! Good luck with classes!",
  ],
  fallback: [
    "Haha, totally. Campus life, right?",
    "Ooh interesting. Tell me more next time — I have a lecture in 10!",
    "Honestly? Same.",
    "That's so real.",
    "Wild. Anyway, have you tried studying in the library yet? The seats are comfy.",
    "Hmm! Never thought about it like that.",
  ],
};

const KEYWORDS = [
  [/\b(hi|hey|hello|sup|yo|howdy)\b/i, 'hello'],
  [/\b(study|studying|library|exam|test|homework|pomodoro|focus|class)\b/i, 'study'],
  [/\b(game|basketball|hoops|pong|play|fun|sport)\b/i, 'game'],
  [/\b(food|eat|hungry|pizza|snack|lunch|dinner|cafeteria|dining)\b/i, 'food'],
  [/\b(major|degree|course|professor|lecture)\b/i, 'major'],
  [/\b(shop|store|clothes|hat|buy|coin|money)\b/i, 'shop'],
  [/\b(dorm|room|sleep|bed|roommate|decorate)\b/i, 'dorm'],
  [/\b(bye|later|cya|see you|gtg|gotta go)\b/i, 'bye'],
];

export function npcReply(npc, message) {
  let pool = 'fallback';
  for (const [re, key] of KEYWORDS) {
    if (re.test(message)) { pool = key; break; }
  }
  const lines = REPLY_POOLS[pool];
  let line = lines[Math.floor(Math.random() * lines.length)];
  if (npc.vibe === 'hype') line = line.replace(/!/g, '!!').toUpperCase().slice(0, 1) + line.slice(1);
  if (npc.vibe === 'quirky' && Math.random() < 0.3) line += ' Quack.';
  return line;
}

const IDLE_BUBBLES = ['☀️', '🎵', '💭', '📖', '🦆', '✨', '🍂', '☕'];

// Spawn NPCs on the quad; each wanders between random waypoints.
export function createNpcs(scene) {
  const npcs = [];
  const spots = [
    [-15, 12], [18, -10], [-22, -14], [25, 14], [-5, 22], [12, -22],
  ];
  NPC_DEFS.forEach((def, i) => {
    const mesh = createPet('creature', { appearance: def.appearance });
    const [sx, sz] = spots[i % spots.length];
    mesh.position.set(sx, 0, sz);
    scene.add(mesh);
    npcs.push({
      def, mesh,
      target: null,
      waitUntil: Math.random() * 4,
      bubbleUntil: 0,
      bubbleEl: null,
    });
  });
  return npcs;
}

const WANDER = { minX: -34, maxX: 34, minZ: -26, maxZ: 26 };

export function updateNpcs(npcs, dt, t, playerPos, chattingWith) {
  for (const n of npcs) {
    const m = n.mesh;
    // face the player and stand still while chatting
    if (chattingWith === n) {
      const dx = playerPos.x - m.position.x, dz = playerPos.z - m.position.z;
      m.rotation.y = Math.atan2(dx, dz);
      m.userData.animate(t, false);
      continue;
    }
    if (n.waitUntil > 0) {
      n.waitUntil -= dt;
      m.userData.animate(t, false);
    } else if (!n.target) {
      n.target = {
        x: WANDER.minX + Math.random() * (WANDER.maxX - WANDER.minX),
        z: WANDER.minZ + Math.random() * (WANDER.maxZ - WANDER.minZ),
      };
    } else {
      const dx = n.target.x - m.position.x, dz = n.target.z - m.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.5) {
        n.target = null;
        n.waitUntil = 2 + Math.random() * 5;
        if (Math.random() < 0.5) {
          n.bubbleText = IDLE_BUBBLES[Math.floor(Math.random() * IDLE_BUBBLES.length)];
          n.bubbleUntil = t + 2.5;
        }
      } else {
        const speed = 2.2;
        m.position.x += dx / dist * speed * dt;
        m.position.z += dz / dist * speed * dt;
        m.rotation.y = Math.atan2(dx, dz);
      }
      m.userData.animate(t, dist >= 0.5);
    }
  }
}

// DOM speech bubbles projected from 3D positions.
const tmpV = new THREE.Vector3();
export function updateNpcBubbles(npcs, camera, t) {
  for (const n of npcs) {
    const show = n.bubbleUntil > t;
    if (show && !n.bubbleEl) {
      n.bubbleEl = document.createElement('div');
      n.bubbleEl.className = 'speech-bubble';
      document.body.appendChild(n.bubbleEl);
    }
    if (!show) {
      if (n.bubbleEl) { n.bubbleEl.remove(); n.bubbleEl = null; }
      continue;
    }
    n.bubbleEl.textContent = n.bubbleText;
    tmpV.copy(n.mesh.position);
    tmpV.y += 2.4;
    tmpV.project(camera);
    if (tmpV.z > 1) { n.bubbleEl.style.display = 'none'; continue; }
    n.bubbleEl.style.display = '';
    n.bubbleEl.style.left = ((tmpV.x + 1) / 2 * window.innerWidth) + 'px';
    n.bubbleEl.style.top = ((1 - tmpV.y) / 2 * window.innerHeight) + 'px';
  }
}

export function clearNpcBubbles(npcs) {
  for (const n of npcs) {
    if (n.bubbleEl) { n.bubbleEl.remove(); n.bubbleEl = null; }
    n.bubbleUntil = 0;
  }
}
