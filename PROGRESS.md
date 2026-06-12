# College Pets — Visual Overhaul Progress

Tracking file so work can resume if a session is interrupted.
Goal: Animal Crossing-style look (toon shading, rounded models, textured terrain), campus + pets first.

## Milestones

- [x] A. Foundation: `src/palette.js`, `src/textures.js` (canvas textures + toon materials), renderer config in `src/main.js` (ACES tone mapping, sRGB, soft shadows)
- [x] B. World v2 (`src/world.js`): painted ground texture w/ rounded sandy paths, gradient sky dome + clouds, trees/bushes/rocks v2, buildings v2 (gable roofs, plank/brick textures, framed doors/windows), props (fences, signs, glow lamps), instanced grass + flowers, fountain v2, ambient leaves — verified via headless screenshots, zero console errors
- [x] C. Pets v2 (`src/petFactory.js`): AC proportions (big heads), smooth toon-shaded bodies, big eyes w/ highlights, blush, inverted-hull outlines, hop/squash walk; wearables re-fitted to new head size
- [x] D. Verification: full feature regression passed (chat, pomodoro lock, shop buy+wear, decorator, basketball, soda pong — zero console errors), ~200 draw calls at close-up, screenshots reviewed

## Constraints / decisions
- Stay on Three.js (no engine switch). Fully procedural, no external assets.
- NPC **behavior** unchanged (visuals update via shared `createPet`).
- Interiors keep v1 look this pass (Pass 2 later: interiors + UI reskin).
- Keep all gameplay APIs stable: `createPet(type,{equipped})`, `userData.head/animate`, `setWearables`, building positions/colliders/interactables unchanged.

## Resume notes
- Visual overhaul Pass 1 COMPLETE (campus + pets). Auto-deploys to GitHub Pages on every push to this branch.
- Next pass candidates (user to prioritize): interiors overhaul (library/dorm/bedroom toon look, warm lighting), UI reskin (AC-style rounded HUD), day/night cycle, minigame visual polish. NPC behavior stays as-is per user.
