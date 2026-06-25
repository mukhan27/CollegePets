# Aura model assets

Drop the AI-generated `.glb` files for the player's "Aura" species here. The game
loads them via `src/auraModel.js`. **If these files are absent, the game still
boots** — `createPet('creature', …)` falls back to the primitive `buildCreature`
in `src/petFactory.js`.

## Files

| File | What it is |
| --- | --- |
| `body.glb` | **Required.** Base Aura: torso, head, arms, legs. Ideally **no ears, no tail** (those swap separately). |
| `ears_rounded.glb` | A *pair* of short rounded ears, modeled around the origin. |
| `ears_upright.glb` | A *pair* of tall upright ears. |
| `ears_floppy.glb` | A *pair* of wide floppy ears. |
| `tail_fluffy.glb` | Long fluffy tail, modeled around the origin. |
| `tail_pom.glb` | Short pom-pom tail. |

Only `body.glb` is needed to light up the model; ear/tail parts are optional and
each one simply enables that swap when present.

## Export contract

- **Format:** glTF Binary (`.glb`).
- **Up axis:** Y-up (glTF default).
- **Facing:** +Z (character front toward the camera).
- **Scale / origin:** don't stress — `auraModel.js` auto-normalizes the body to
  ~1.7 units tall, centers it on X/Z, and drops the feet to y=0. Export ear/tail
  **parts at the same scale as the body** so they match after normalization.
- **Materials:** textures are fine; the loader re-shades everything to the game's
  toon look. For best **per-zone recoloring**, name materials/meshes with hints:
  `coat`, `belly`, `eye`, and `inner` (inner ear). Unnamed meshes are tinted as
  coat. Colors come from the creator swatches in `src/petFactory.js`.
- **Poly count:** keep the body under ~50k triangles (mobile target).

## Tuning anchors

Ear/tail/head attachment offsets live as constants at the top of
`src/auraModel.js` (`HEAD_ANCHOR`, `EAR_ANCHOR`, `TAIL_ANCHOR`). Adjust them once
the real model is in if parts or hats don't sit perfectly.
