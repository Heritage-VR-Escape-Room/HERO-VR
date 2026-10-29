# Asset picks (Task 11 placeholders)

The owner checkpoint was replaced by the controller's picks (`.superpowers/.../asset-picks.md`). Everything here is a
placeholder, all CC0 or CC-BY, listed in `ASSET_CREDITS.md` and the in-game credits. The contact sheet for review is
`tools/assets/.cache/contact_sheet.html` (git-ignored; regenerate with `py -3 -I tools/assets/fetch_assets.py contact-sheet`
after `search` runs). Source of truth for ids and sizes is `tools/assets/manifest.json`.

| Slot | Pick | Author / license | Final size, triangles | Notes |
|---|---|---|---|---|
| pyramid | Built in code (6.8 m, sandstone) | none | n/a | As picked. Fallback mesh `pyramid_fallback` (Sketchfab "Pyramid" by quedlin, CC-BY) fetched for Task 13 to compare: 464 tris, 10.2 m base x 6.8 m high. Its base is wider than a 6.8 m monument should be; scale or build in code |
| schloss | Blockout in code | none | n/a | As picked |
| streetlamp | **Substitution**: "Classic Street Lamp Post" by sacapuntas (`dea5920f...`) | CC-BY 4.0 | 4.5 m high, 11,012 tris | Picked "Victorian Street Lamp" was a wall-mounted lantern bracket, not a standing lamp. Second candidate (dasmodal "Vintage lamp post", globe twin-head) also looked fine; sacapuntas has a clean single lantern |
| bench | Park Bench, DutraBR98 | CC-BY 4.0 | 1.8 m long, 29,389 tris (decimated from 101,612) | Imported facing -Z; rotated 180 degrees so the seat faces +Z. Seat is 0.85 m to the backrest top |
| kiosk | Soviet Kiosk, dimmeyster | CC-BY 4.0 | 3.2 m high, 19,167 tris | As picked. Grey-blue paint, counter window faces +Z. Retint toward a German kiosk later |
| newspapers | Newspaper Stack, karlwirbelwind | CC-BY 4.0 (title says CC0; the API says CC-BY, treated as CC-BY) | 0.4 m long, 2,132 tris | As picked |
| tree_linden | One of the four trees in "4 Linden Trees Pack", Sereib | CC-BY 4.0 | 18 m high, 33,706 tris | Extracted one tree (mesh `Object_2`). It is a bare, leafless winter tree: fits the fog mood, but has no foliage |
| tree_plane | Alias of tree_linden | n/a | n/a | No separate plane-tree model; Task 13 reuses `tree_linden` scaled to 22 m |
| tree_chestnut | `Acer_large_1_LOD0` from "Maple trees pack", LOLIPOP | CC-BY 4.0 | 16 m high, 22,490 tris | Extracted one maple LOD0 as the chestnut stand-in (the pack's LOD1/LOD2/billboard variants were dropped; make far LODs with `simplify` when needed). Leafy, unlike the linden |
| hedge | **Substitution**: "Square Hedge" by RBG_illustrations (`bd335c9b...`) | CC-BY 4.0 | 2 m long, 1.45 m high, 420 tris | Picked "Shrub tiles pack" was a sheet of alpha cards and topiary, unusable as a hedge segment. The 420-triangle block is a bit rounded; tile it for hedge rows. (Also rejected: "Hedge 01", a sphere; "Hedge / green fence", 152k tris) |
| raven_rigged | Crow, Alexei Ostapenko | CC-BY 4.0 | 0.64 m body length, 1.32 m wingspan, 2,208 tris, 92 bones | As picked. Authored pose is a flat flight pose (wings spread); one clip `root|TakeOff`. See the report for bone names |
| human_npc_m | **Substitution**: "Middle Age Man, Rigged and Animated" by Animator05 (`3e660352...`) | CC-BY 4.0 | 1.75 m, 29,396 tris (decimated from 38,286) | Picked "Realistic Old Russian Guy" is a shirtless fighter in shorts (and 74 MB raw); a man in a jacket and jeans suits a newsstand owner. Ships one clip, `Character Dying Action`, which is not usable for an idle newsstand owner (idle sway is procedural) |
| human_npc_m2 | Eric Rigged 001, Renderpeople | CC-BY 4.0 | 1.75 m, 20,542 tris | As picked. T-pose, rigged, no clips (idle sway and head look-at are procedural) |
| human_npc_f | Carla Rigged 001, Renderpeople | CC-BY 4.0 | 1.65 m, 19,988 tris | As picked. Same |
| hdri_night_overcast | Kloppenheim 07 (Pure Sky), Poly Haven | CC0 | 1k HDR | Already in the repo from Task 3 |
| tex_cobble_wet | `cobblestone_floor_04` (tags: damp, wet), Rob Tuytel | CC0 | 4K diffuse, normal, ARM | |
| tex_sandstone_red | `red_sandstone_wall`, Amal Kumar | CC0 | 4K | For the pyramid and Schloss |
| tex_bronze_patina | **Substitution**: `green_metal_rust`, Rob Tuytel | CC0 | 4K | Poly Haven has no bronze, copper or verdigris texture. Green weathered metal is the closest; the real patina look can come from a tint on the plaque material |
| tex_grass | `leafy_grass`, Charlotte Baglioni | CC0 | 2K | |
| tex_gravel | `rocky_gravel`, Dario Barresi and Dimitrios Savva | CC0 | 2K | |
| tex_bark | `bark_platanus`, Dimitrios Savva | CC0 | 2K | Platanus is the plane tree |

## Processing choices

- Models: Blender (portable, headless) scales to the real size, puts the pivot at bottom-center and fixes facing;
  `gltf-transform` simplify runs only when a model is over its triangle budget; `optimize` applies meshopt.
- Skinned models (crow, humans) are not round-tripped through Blender, because Blender exports the rest pose
  instead of the authored pose. Blender only measures; `tools/assets/apply_transform.mjs` wraps the raw scene in
  one scaled, offset root node.
- Textures are WebP, not KTX2, because the KTX-Software `toktx` binary is not installed here. Re-run
  `node tools/assets/optimize.mjs` after installing it and it switches to KTX2 (UASTC/ETC1S) by itself; the loader
  already handles KTX2.
