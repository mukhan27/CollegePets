---
name: duck-cosmetics-modeling
description: Model, fit, and verify cosmetics (hats, garments, glasses, shoes, bags) for the College Ducks GLB character. Use whenever adding or fixing wearables, character geometry, mounts, or fit/clipping/floating issues — the process is measured-mounts + mesh-derived shells + a mandatory headless render-iterate loop. Never eyeball placements and never ship a cosmetic without looking at rendered screenshots from multiple angles.
---

# Duck cosmetics modeling & fitting

The proven pipeline for authoring wearables on the College Ducks player character
(a single-mesh GLB duck). It replaced two failed generations of work: hand-placed
primitives ("three spheres that don't fit the body") and guessed anchor offsets.
The user's quality bar is a picky art director: nothing floats, nothing clips,
nothing is "a basic oversized shape."

## Core principles (in priority order)

1. **Measure, never eyeball.** Every anchor comes from the geometry or texture,
   computed at load in `src/glbDuck.js → computeMounts()`. Available mounts:
   `head {pos,radius}`, `torso {pos,radius}`, `back`, `crown` (true top-of-head
   vertex — hats seat against THIS, not the skull centroid, which sits too far
   back), `eyes` (centroids of the texture's painted eye zone via UV sampling —
   the eyes are painted, not modeled), `tail` (keep-out envelope for bags).
   If you need a new anchor (e.g. "wrist"), add it to computeMounts as a
   measured region — fractions of `TARGET_H`, so a model swap re-measures.

2. **Body garments are shells cut from the character's own skin.** Never build
   a body garment from spheres/boxes — it cannot fit. Use
   `duckShellGeo({yMin,yMax,inflate,filter})` (body) or `legShellGeo(side,...)`
   (per-leg): band-select triangles, plane-clip WITH triangle splitting (clean
   hems), inflate along smoothed area-weighted welded normals (radial fallback
   where opposing faces cancel, e.g. thin fins). The shell fits exactly by
   construction. Proven garments: pants (+waistband + per-leg sleeves + cuff),
   open-front jackets (front wedge excluded, tilted neckline plane, collar band,
   cap-sleeve shells), shirts (NO geometry at all — recolor the baked shirt
   texture zone via the `setShirtColor` hook; the model's green zone IS the shirt).

3. **Attach to the thing that moves.** The duck is a rigid body + two swinging
   hip-pivot legs (`pet.userData.legs`). Anything on legs/feet (pant sleeves,
   shoes) parents to the pivots with the same −hip offset as the leg meshes, so
   it swings with the gait; removal goes through the `coParts` mechanism in
   `setWearables`. Head items parent to the measured head group; body shells to
   the body. Nothing is skinned — rigid pieces on pivots only (blended skinning
   smears this mesh; that bug shipped once).

4. **Head items are crafted primitives, but CRAFTED.** Multi-part silhouettes
   with reference-recognizable shapes (cowboy hat = lathe brim with rolled
   sides + pinched creased crown + band; chain = torus links draped on a curve
   projected onto the measured surface via `duckRadiusAt(y, az)`). Seat by
   computed contact: hat rims rest ON `mounts.crown`; glasses lenses center on
   `mounts.eyes` with the bridge bowed over the bill; pads/knots sink ~0.02-0.04
   INTO the surface to guarantee visible contact (floating reads instantly).

5. **Fitting layer, not forked builders.** Legacy builder-space items map onto
   mounts via `buildFitted` + `SLOT_FIT` (per-slot) and `ITEM_FIT` (per-item)
   nudge tables in `src/petFactory.js`. Prefer a duck-space builder (DUCK_WEAR)
   for anything that needs real contact. New catalog items: `CATALOG.clothes`
   in `src/state.js` (id/icon/name/price/slot) + thumbnail support in
   `src/itemPreview.js` (bust the preview cache key when visuals change).

## The mandatory verification loop

No cosmetic ships without this. Words like "should fit now" are worthless;
only rendered pixels count.

1. Server: `cd /home/user/CollegePets && nohup python3 -m http.server 8099 &`
   (it dies often — always curl-check first).
2. Headless chromium (playwright-core): executablePath
   `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, args
   `--no-sandbox --use-gl=angle --use-angle=swiftshader
   --enable-unsafe-swiftshader --disable-dev-shm-usage`, viewport 1280x720,
   `setTimeout(()=>process.exit(1), 55000)` hard-kill (these hang), capture
   `pageerror` + console errors — **zero errors is a hard gate**.
3. Boot past the creator (`page.fill('#creator-name','Test')`, click
   `#creator-start`), then drive state: `__cp.state.owned.push(id);
   __cp.state.equipped[slot]=id; __cp.redress();` and rotate with
   `__cp.player.rotation.y`.
4. Screenshot EVERY touched item from front + side + 3/4 (+ back and 2+ walk
   frames for anything on the body/legs/back — the walk exposes clipping that
   standing poses hide). Save to the session scratchpad.
5. **Read every screenshot and look at it.** Self-critique against the
   complaint/reference: touching? clipping? proportionate? recognizable
   silhouette? Then fix and re-render. Multiple rounds are normal; the cowboy
   hat took 3, the gold chain took 3.
6. Regression shots: previously-approved items in the same slot family, plus
   `node --check` on every changed file.

## Known traps (each of these shipped as a bug once — don't repeat them)

- Skull-centroid hat anchoring → hats float behind the head. Use `crown`.
- Bilinear texture downscale → grainy zone edges. Nearest-neighbor only.
- Full 4096² recolor textures → iOS Safari OOM crash-loop. Cap at 1024²,
  cap the texture cache (≤6).
- `TorusGeometry` arg mistakes can silently render nothing (the headphones
  band was invisible for weeks) — if a part looks absent, it probably is.
- Welded-normal inflation on thin double-sided fins → degenerate (cancelled)
  normals → spikes. Use the radial fallback.
- Preview thumbnails cache by id — bust the cache key when an item's visual
  changes or the shop shows stale/wrong models.
- Duplicated tuning constants (e.g. re-declaring TORSO_Y) silently desync the
  fit layer — alias the real constant.
- The tail spike pierces anything mounted low on the back; check against
  `mounts.tail` through the whole gait, not just standing.
