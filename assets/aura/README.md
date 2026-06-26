# Aura model assets

The player's "Aura" species loads from here via `src/auraModel.js`. **If these
files are absent the game still boots** — `createPet('creature', …)` falls back to
the primitive `buildCreature` in `src/petFactory.js`.

## Files

| File | What it is |
| --- | --- |
| `body.glb` | **Required.** The rigged base Aura (torso, head, arms, legs) with the plain white-fur texture. Recolour works on this. |
| `body_retex.glb` | **Optional.** A Meshy **Retexture** of the *same* model with an art-directed face (baked muzzle + eyebrows). If present it is loaded **instead of** `body.glb`. |

The loader prefers `body_retex.glb` when it exists, so you can drop the
retextured model in next to `body.glb` without overwriting anything.

## How recolouring works (read this before retexturing)

At runtime the coat colour comes from the creator swatches. `auraModel.js`
repaints **only the bright fur pixels** of the texture — found by a flood-fill
that starts at the image borders. Every region that is **not bright fur** is left
exactly as the texture bakes it:

- **Bright / light pixels** (the body fur) → repainted to the chosen coat colour.
- **Mid-tone & dark pixels** (muzzle, eyebrows, nose, mouth) → **kept as baked.**
- **Light pixels fully enclosed by dark** (the eye catchlights) → **kept as baked**
  (so the eye highlight never tints with the coat).

This is exactly why a Meshy Retexture gives you a contrasting muzzle and brows for
free: bake them as their own shades and they survive recolouring, while the body
fur stays swatch-driven.

## Meshy Retexture recipe (for the muzzle + eyebrows)

1. In Meshy, run **Retexture / AI Texturing** on the existing base model so the
   **mesh and UVs are unchanged** (do *not* regenerate the model from scratch —
   that makes a new, incompatible mesh).
2. Prompt for a look where the zones are clearly separated by tone, e.g.:
   > *"Soft cartoon puppy. Body fur bright near-white. A clearly lighter-vs-body
   > tan **muzzle** patch around the nose. Subtle dark-brown **eyebrows** above the
   > eyes. Big glossy near-black eyes each with a small white highlight. Dark nose."*
3. **Keep the body fur the brightest thing in the texture.** The muzzle should be a
   distinct **mid-tone** (clearly darker than the body so it is preserved), and the
   eyebrows darker still. If the muzzle is as bright as the body it will recolour
   with the coat instead of staying a contrast.
4. Export as **glTF Binary (`.glb`)** and save it here as **`body_retex.glb`**.

Hand the `.glb` to me and I'll drop it in. If the body doesn't recolour or the
muzzle picks up the coat colour, it's just the one brightness threshold in
`buildTexturePrep` (`lum > 165`) — I'll calibrate it to your actual texture.

## Export contract (unchanged)

- **Format:** glTF Binary (`.glb`); **Y-up**; character facing **+Z**.
- **Scale / origin:** don't stress — `auraModel.js` auto-normalises the body to
  ~1.7 units tall, centres it on X/Z and drops the feet to y=0.
- **Rig:** keep the existing skeleton + idle clip (the game plays clip 0).
- **Poly count:** keep the body under ~50k triangles (mobile target).

## Tuning

The head/ear anchors and the fur brightness threshold live as constants in
`src/auraModel.js`. They only need a tweak if hats sit wrong or the new texture's
fur isn't bright enough to recolour.
