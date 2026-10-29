# Owner download list (Mixamo animations)

No free rigged, animated human or raven with the clips the slice needs was found on Sketchfab/Poly Haven under CC0 or
CC-BY. The placeholder rigs ship without usable clips (crow: `root|TakeOff` only; people: none, or a death animation),
so idle sway, head look-at and Fritz's perch/idle/caw are procedural for now. Fritz's procedural fallback covers the
raven.

Mixamo needs an Adobe login, so it cannot be fetched automatically. To get real human motion:

1. Upload `public/assets/human_npc_m2/human_npc_m2.glb` (or the raw FBX from the Renderpeople page) to mixamo.com,
   or pick a Mixamo character. Mixamo content is royalty-free but is not CC-BY: add a credits line for it.
2. Download these animations as FBX, "With Skin" off, 30 fps, in place:
   - Idle
   - Angry Gesture
   - Shouting
   - Looking Around
3. Convert to glTF (Blender FBX import, export GLB) and merge each clip into the character GLB with
   `gltf-transform merge`, naming the clips `idle`, `angry`, `shout`, `look`.
4. Drop the result into `tools/assets/.cache/raw/<slug>/` and re-run `node tools/assets/optimize.mjs --only <slug>`.

For the raven, any CC-BY crow with perch, fly and caw clips would replace `raven_rigged`; Fritz picks clips by the names
`fly`, `perch`, `idle`, `caw`.
