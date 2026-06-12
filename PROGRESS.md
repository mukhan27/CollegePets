# College Pets — Visual Overhaul Progress

Tracking file so work can resume if a session is interrupted.
Goal: Animal Crossing-style look (toon shading, rounded models, textured terrain), campus + pets first.

## Milestones

- [x] A. Foundation: `src/palette.js`, `src/textures.js` (canvas textures + toon materials), renderer config in `src/main.js` (ACES tone mapping, sRGB, soft shadows)
- [x] B. World v2 (`src/world.js`): painted ground texture w/ rounded sandy paths, gradient sky dome + clouds, trees/bushes/rocks v2, buildings v2 (gable roofs, plank/brick textures, framed doors/windows), props (fences, signs, glow lamps), instanced grass + flowers, fountain v2, ambient leaves — verified via headless screenshots, zero console errors
- [ ] C. Pets v2 (`src/petFactory.js`): AC proportions (big heads), smooth toon-shaded bodies, big eyes w/ highlights, blush, inverted-hull outlines, hop/squash walk; wearables re-fitted to new head size
- [ ] D. Verification: headless screenshots vs reference, full feature regression (`/tmp/deep.mjs`), draw-call/FPS check, push → Pages deploy

## Constraints / decisions
- Stay on Three.js (no engine switch). Fully procedural, no external assets.
- NPC **behavior** unchanged (visuals update via shared `createPet`).
- Interiors keep v1 look this pass (Pass 2 later: interiors + UI reskin).
- Keep all gameplay APIs stable: `createPet(type,{equipped})`, `userData.head/animate`, `setWearables`, building positions/colliders/interactables unchanged.

## Resume notes
(updated as work proceeds)
- A+B done & verified. NEXT: Milestone C — rewrite `src/petFactory.js` (AC proportions: big head, toon mats from `src/textures.js` `toonMat`, big eyes + highlights, blush, inverted-hull outlines, hop walk). Keep API: `createPet(type,{equipped})`, `userData.head`, `userData.animate(t,moving)`, `setWearables(pet, equipped)`; re-fit WEARABLES offsets to head radius ~0.5. Then Milestone D verification (run `/tmp/deep.mjs` regression + screenshots) and push.
