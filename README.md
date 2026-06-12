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

### Things to do

- **🐾 Pick a pet** — cat, dog, bear, duck, or hamster, with a custom name.
- **💬 Chat** — walk up to any wandering student pet and talk to them (canned single-player brains, each with a personality).
- **📚 Library** — sit at a desk and start a pomodoro (1 / 25 / 50 min). The screen locks into focus mode (hold 3s to give up). Completing a session pays **🪙 2/min**.
- **🏀 Basketball** — at the court by the Rec Gym. Hold to charge, release to shoot. 🪙 5 per bucket.
- **🥤 Soda Pong** — at the Student Center. Drag to aim, release to throw. 🪙 8 per cup + perfect-game bonus.
- **🛍️ Campus Store** — buy hats, glasses, scarves (worn on your pet) and room decor.
- **🏠 Maple Dorm** — common room with vending machine, plus **your own bedroom** you can decorate (bedding colors, rugs, posters, plants, lava lamp, beanbag).

Progress (pet, coins, purchases, room decor, study stats) is saved in `localStorage`.

## 🗂️ Code layout

```
index.html          page shell + all UI overlays
css/style.css       HUD, panels, joystick, focus-lock styling
vendor/three.module.js  vendored Three.js (no CDN / no npm needed at runtime)
src/
  main.js           scene, camera, game loop, location switching, interactions
  world.js          outdoor campus (buildings, quad, court, trees)
  interiors.js      library, dorm common room, customizable bedroom
  petFactory.js     low-poly pets + wearable attachments
  npcs.js           wandering students, speech bubbles, chat brain
  ui.js             modals, chat panel, shop, decorator, pomodoro lock
  minigames.js      basketball & soda pong (canvas 2D)
  state.js          save/load, coins, item catalog
  input.js          virtual joystick + keyboard
```

## 🔭 Next steps (multiplayer)

The chat panel, NPC roster, and location system are built so NPCs can be swapped for real connected players later (e.g. WebSocket presence + chat relay).
