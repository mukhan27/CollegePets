# 🎓 College Pets

A top-down 3D campus-life game for mobile (landscape). Pick a pet, roam a college campus, chat with student pets, study with a screen-locking pomodoro timer, decorate your dorm room, buy outfits, and play mini-games.

**This is the single-player prototype** for playtesting. Multiplayer (real student chat) comes later.

## ▶️ Run it

No build step — it's plain ES modules with a vendored copy of Three.js. Just serve the folder:

```bash
npm start            # uses npx serve
# or
python3 -m http.server 3000
```

Then open `http://localhost:3000` — on a phone, open your computer's LAN IP (e.g. `http://192.168.1.x:3000`) and rotate to landscape.

## 🎮 How to play

| Control | Action |
|---|---|
| Left-thumb joystick / WASD | Move your pet |
| Yellow button / `E` | Context action (enter, chat, sit, play) |

### Campus life

Your pet has four **needs** — ⚡ Energy, 🍔 Hunger, 💬 Social, 🎉 Fun — shown top-left.
They drain over time and you top them up by living campus life: eat, sleep, hang
out, and play. Tap **📋** (top-right) any time for the **Campus** panel:

- **📋 Daily quests** — study, score baskets, chat, eat, win mini-games → earn 🪙 and **level up** (levels pay coin bonuses).
- **💛 Friends** — every student has a friendship tier that rises as you chat and gift; reach Bestie.
- **🐾 Me** — your level, XP, needs and lifetime stats.

### Things to do

- **🐾 Pick a pet** — cat, dog, bear, duck, or hamster, with a custom name.
- **💬 Chat & gift** — walk up to any wandering student and talk (each has a personality); 🎁 gift them snacks to grow your friendship.
- **📚 Library** — sit at a desk and start a pomodoro (1 / 25 / 50 min). Focus mode locks the screen; completing a session pays coins (a ☕ cold-brew buff boosts the payout).
- **🏀 Basketball** — a skill-based 2-on-2 pickup game: real make-% from your release **timing × contest × shot type/distance**, live rebounds off misses, momentum movement, and smart defense. Move, time the **Shoot** meter, **Pass**, **Jump**/dunk, **Block** & **Steal** — possession flows, nothing teleports. Coins for baskets.
- **🍽️ Dining Hall** — order food that restores your needs, sit at the communal tables, or play **Cup Pong** — a swipe-to-flick beer-pong game vs an AI (sink the rack to win).
- **🎮 Student Union** — the campus arcade: **Trivia** and **Memory** mini-games, a coffee bar, hangout couches, a dance floor and a quest board.
- **🏛️ Lecture Hall** — a big-screen hall with tiered seating + stage, and a study mezzanine of pomodoro desks upstairs.
- **🛍️ Campus Store** — walk in, browse real item previews, buy hats/glasses/scarves & furniture, and use the **fitting-room mirror** to try outfits on your pet live.
- **🏠 Maple Dorm** — a furnished common room with sit-able couches, plus **your own bedroom** with a grid-based furniture editor — and a bed to **sleep** and restore energy.
- **🦆 Birch Pond** — a quiet park corner with benches to sit and relax.

Progress (pet, coins, purchases, room decor, needs, level, quests, friends, stats) is saved in `localStorage`.

## 🗂️ Code layout

```
index.html          page shell + all UI overlays
css/style.css       HUD, panels, joystick, focus-lock styling
vendor/three.module.js  vendored Three.js (no CDN / no npm needed at runtime)
src/
  main.js           scene, camera, game loop, location switching, interactions
  world.js          outdoor campus (buildings, quad, court, pond, trees)
  interiors.js      library, dorm, bedroom, shop, dining hall, student union
  furniture.js      shared furniture mesh registry (bedroom + shop previews)
  petFactory.js     low-poly pets + wearable attachments
  npcs.js           wandering students, speech bubbles, chat brain
  systems.js        needs, XP/levels, daily quests, friendship, Campus panel
  ui.js             modals, chat, shop, decorator, pomodoro lock, gifting
  itemPreview.js    offscreen 3D thumbnails for shop/try-on
  tryon.js          fitting-room live try-on view
  dining.js         food ordering menu
  cuppong.js        swipe Cup Pong mini-game
  arcade.js         trivia + memory mini-games
  basketball.js     3D 3rd-person basketball game
  state.js          save/load, coins, item + food catalogs
  input.js          virtual joystick + keyboard
```

## 🔭 Multiplayer direction

This is a **multiplayer game at heart** — the long-term vision is a shared campus
where the other pets are **real students**, not NPCs. The current wandering
students are throwaway placeholders so the campus isn't empty while building out
the single-player systems; they'll be replaced by networked players (presence +
chat relay). Everything else is designed to be multiplayer-friendly:

- **Needs, XP/levels, quests, economy, customization, jobs and mini-games** are
  all per-player and server-syncable — no NPC dependency.
- The location/interaction system streams players in/out of rooms cleanly.
- Friendship/gifting carries over directly to real players.

New gameplay work focuses on shared-world content (mini-games, jobs, customization,
events), not NPC behavior.
