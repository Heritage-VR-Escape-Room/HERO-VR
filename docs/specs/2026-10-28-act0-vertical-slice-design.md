# Shadows of the Mist — Act 0 Vertical Slice Design

Date: 2026-10-28
Project: HERO-VR game, pure web build at `.local/bin/shadows-of-the-mist` (Three.js + WebGPU; Unity dropped 2026-10-28)
Source material: `Downloads/HERO-VR/Shadows_of_the_Mist_Script.docx` (script + lore), `Downloads/HERO-VR/WhatsApp Image 2026-10-28 at 7.34.29 PM.jpeg` (level map)

## 1. Intent

HERO-VR is a big university project: a first-person narrative puzzle game set in real heritage sites in Karlsruhe and Port Said. Eventually it will use the team's own 3D scans of those monuments. Until the scans exist, internet models stand in for them.

The owner wants the graphics to be the headline. Karlsruhe is an open area the player wanders freely, so it has to hold up at close range from every angle. Port Said is linear but needs the same level of detail. The owner's words: "go all out."

This first deliverable is a **vertical slice of Act 0 (the prologue)**: one small playable stretch built at final quality, using every core system once. It proves the look, the loop and the web build before the other acts get built.

## 2. Decisions made by the owner

| Topic | Decision |
|---|---|
| Repo / location | Pure web, no Unity. A new local project at `.local/bin/shadows-of-the-mist`. Work stays local. Nothing is pushed. |
| Platform | Web build. WebGPU is allowed wherever it helps. |
| Devices | Desktop and laptop browsers only. No mobile, no VR headset. |
| Download size | No limit. |
| Prologue cipher | Broken as written ("1-7-1-5 = K-A-R-L"). Fix it. |
| Karlsruhe layout | Karlsruhe is the Schlossgarten circle from the map. The script's Station Plaza, Marktplatz pyramid and Karl Benz monument move **into the Schlossgarten**. |
| Map-only landmarks | Church (Cathedral), Italian Consulate and El Obelisk 1956 each get a puzzle (in later acts, not this slice). |
| Obelisk | Stands on its own in the north, as on the map, not in Ferial Garden. |
| Duplicate label | Port Said Lighthouse appears only once: the southern one, near De Lesseps. |
| Structure | Karlsruhe = open free-roam. Port Said = linear. |
| Act 2 train | Cutscene only. |
| Act 3 underwater | Builder's choice: whatever is smoothest and looks best. |
| Dialogue | Subtitles only for now (voice is undecided). Fix any logic problems in the dialogue. |
| Companion hints | Static (scripted) hints. |
| Characters | Placeholder humanoids are fine. |
| Saving | Autosave after every puzzle. |
| Fog | Real volumetric fog is worth the performance cost. |
| Time of day | Fixed per area (Karlsruhe at night, Port Said by day). |
| Placeholder assets | Big uni project; go all out on quality. |
| Languages | English, Arabic and German, plus a settings screen for language, controls and graphics. |
| Input | Keyboard and mouse only, for now. |
| First milestone | The Act 0 vertical slice described here. |

## 3. Goals

1. A playable Act 0, start to finish, in a desktop browser: wake on the bench → explore the plaza → read the founder's plaque → get hints from Fritz → solve the pyramid lock → door opens → read the Vanguard manifesto → pick up the ticket-printer component → end-of-slice card.
2. Graphics at portfolio level: thick volumetric night fog lit by sodium streetlights, high-detail scanned-quality monuments, convincing night lighting and post-processing.
3. Every core system working once, built to be reused by later acts: player controller, inspect/interact, puzzle framework, companion hints, subtitles, save/load, localization (EN/AR/DE with correct Arabic RTL), settings, main and pause menus.
4. A credits screen listing every placeholder asset and its license.

## 4. Non-goals (this slice)

- Acts 1–4 content, the portal train cutscene, Port Said, Anubis.
- Puzzles for the Church, Consulate and Obelisk (decided; built later).
- Voice acting, gamepad, mobile. VR is dropped permanently.
- Pushing to GitHub or opening PRs.
- The team's real scans, including the existing ones in `HERO-VR-scans` (owner: don't use any). The asset-swap rule (section 10) must still let scans replace placeholders later without rework.

## 5. Anti-goals (failures even if it "works")

- It looks like a generic tech demo: flat lighting, thin fog, untextured graybox in places the player can reach.
- Arabic text renders disconnected or left-to-right.
- Puzzle logic only works if you already know the answer. Every solution must follow from clues the player can see in the game.
- Placeholders with licenses we can't credit, or that block a public university showcase.
- Systems hard-coded to Act 0, so Act 1 needs a rewrite.

## 6. Setting for the slice

**Place:** the Schlossgarten, Karlsruhe, at night. The whole garden circle from the map is the open-world area: the Schloss with its tower, the 32 fan-shaped radial paths, the lake with the fountain, the Schlossgartenbahn miniature railway and the tree belts.

**Slice area at final quality:** the starting plaza on the southern fan, between the Schloss forecourt and the garden entrance. It contains:
- the bench where Julian wakes
- the founder's pyramid (moved here from Marktplatz, per the owner)
- a newsstand kiosk with its shouting owner
- 2–3 hostile citizens
- streetlights

**Rest of the circle:** blocked out with real layout, trees, terrain and the Schloss silhouette visible through the fog. The player can walk to the edge of the slice area; soft blockers (fog walls, barriers, Fritz saying "not yet") keep them inside. *Builder's call:* exactly where the blockers sit.

**Mood (from the script):** air thick with sickly grey aerosol, streetlights giving dull yellow halos, distant sirens, citizens glaring at each other.

## 7. Act 0 — revised beat sheet and dialogue

The owner asked for logic fixes. Changes from the script:

- **Location** moved to the Schlossgarten.
- **Cipher** replaced with one that actually works and that the player can solve from in-game clues.
- **Fritz** no longer just reads out the answer. His hints come in tiers.

### Beats

1. **Wake** — Black screen, then coughing. Julian wakes on a bench and the camera fades in. Subtitle: JULIAN: "Where... what is this air?"
2. **Newsstand** — The kiosk owner shouts at a passer-by. OWNER: "Foreign tankers are poisoning the Rhine! Read it yourself! Port Said did this!" The passer-by spits and walks off. This sets up the theme of manufactured hatred. NPCs glare at the player if approached.
3. **The pyramid** — The player is drawn to the pyramid; a faint red indicator glows at its base. The base has a small brass door with a **cipher disc lock** and four letters engraved above it: **Y O F Z**.
4. **Fritz arrives** — The first time the player inspects the door, Fritz flutters down onto the pyramid tip. FRITZ: "Caw! Careful, friend. The mist eats your memory if you breathe it too long. That door hides something that should not be in this city."
5. **The plaque** — The founder's bronze plaque is on the southern face of the pyramid. When inspected, it reads (localized): *"Here rests Margrave Karl Wilhelm of Baden-Durlach, who founded this city on 17 June 1715."* Above it is a Latin line: **"ANNI NATALIS SUMMA ROTAM VERTIT"**. After Fritz translates it (the script gives him that role), the inspect view shows the localized meaning: *"The sum of the birth year turns the wheel."* With this line the puzzle can be solved without hints: the plaque gives 1715, the line says to sum it (14) and turn the ring by that much. *(My call.)*
6. **The lock** — The lock is a two-ring cipher disc: an outer fixed alphabet ring and an inner rotating alphabet ring, with four letter tumblers below it. The engraved letters YOFZ are KARL with every letter shifted forward 14 places. 14 is the digit sum of the founding year, 1+7+1+5.
   - The player turns the inner ring until **A sits under O** (a shift of 14).
   - Each engraved letter on the outer ring then lines up with its plaintext on the inner ring: Y→K, O→A, F→R, Z→L.
   - The player sets the tumblers to **K A R L** and pulls the handle.
7. **Opening** — The door unlocks with a mechanical clunk and steam. FRITZ: "KARL! The founder's own name guards the door. Vanguard has a sense of humour."
8. **Inside** — The door opens on a shallow lit alcove in the pyramid base (a reach-in compartment, not a walk-in room; *my call*, keeps the slice to one environment). In it sits the Vanguard **signal jammer**, humming and venting aerosol. Interacting with it shuts it down: its red light dies and the hum stops. The fog does **not** change (owner decision). The player then reads the Vanguard Armaments manifesto (an inspectable document, localized). It mentions missile shipments routed through the portal train line to Port Said. The player picks up the damaged ticket-printer component.
9. **Hook** — JULIAN: "Vanguard... missile shipments. Through the station?" FRITZ: "The old garden railway. It runs further than people think. Come — but not tonight." The game autosaves, then shows the "End of Slice" card.

### Fritz's tiered hints (H key, static)

| Tier | Hint |
|---|---|
| 1 | "The founder always watches over his city. Read what his plaque says." |
| 2 | "The year this city was born holds four digits. Add them together, friend." |
| 3 | "Fourteen! Turn the inner ring until A sits under O, then read the old letters through it." |
| 4 | "K-A-R-L. Spin it in." |

Each tier unlocks after the previous one has been shown and at least 45 seconds have passed. *Builder's call:* exact timing and presentation. While a hint is active, Fritz's eye lights up the relevant object (plaque, disc or tumblers).

### Script problems found in later acts (for later; not part of this slice)

The owner approved these fixes. Apply them when those acts are built.

- **Act 4:** 1869 is the year the Suez Canal opened, not a city's founding (Port Said was founded in 1859).
  - Fritz's line changes to: *"Julian! Link the terminal ciphers! The year Karlsruhe was born, and the year the Canal opened!"*
  - The code stays 1715 + 1869 = **3584**.
- **Act 3:** the valve code 4-8-15-16 now has a clue chain.
  - Four ledger registry stones each record one ship's cargo. The crate count is engraved in Eastern Arabic numerals (٤, ٨, ١٥, ١٦).
  - Each stone carries a carved symbol (anchor, sail, ship's wheel, star) that matches one of the four valve handles.
  - Anubis helps decode the Arabic trade script (his role in the script), so the player learns to read the numerals.
  - The player sets each valve to its stone's count.
- **Act 0/1:** with the pyramid moved into the Schlossgarten, Act 1's Benz monument does too (per the owner).

## 8. Systems

All systems are data-driven (ScriptableObjects or similar) so later acts add content, not code. *Builder's call:* the internal architecture.

1. **First-person controller** — Input System, keyboard and mouse. Walk, sprint and crouch; footsteps that change with the ground surface; subtle head-bob, toggleable. Mouse sensitivity and invert-Y settings.
2. **Interaction and inspect**
   - Looking at an object shows a crosshair prompt. E interacts.
   - Inspecting brings the object up close; the player rotates it with the mouse, zooms, and reads any text, which is localized.
   - Documents open in a readable overlay.
   - Inventory for picked-up story items. A simple list is enough for the slice.
3. **Puzzle framework** — Each puzzle has an id, a state, clue objects, hint tiers and a solved event. Solving a puzzle fires: save → story beat → companion line. The cipher-disc lock is the first puzzle type: drag or scroll to turn the ring, click tumblers to change letters.
4. **Companion (Fritz)** — Flies between perch points near the active objective. Idle animations. Speaks hint tiers. His eye highlights objects through an outline or emissive pulse. Placeholder model: an animated raven, given a copper/brass material to suggest "clockwork".
5. **Dialogue and subtitles** — Lines are localized string keys with a speaker and a duration. Subtitles have a speaker name, an optional background, and a size setting. There is a simple trigger system for story beats.
6. **Save and load** — Autosave after every puzzle plus at story checkpoints. Saves are stored in the browser so they survive reloads. Main menu: Continue, New Game, Settings, Credits.
7. **Localization** — English, Arabic and German. Arabic must render shaped and right-to-left in all UI, subtitles and documents. Language can be switched at runtime from settings.
8. **Settings** —
   - Language.
   - Controls: rebind every action, sensitivity, invert-Y.
   - Graphics: Low, Medium, High and Ultra presets, plus individual options for render scale, shadows, fog quality, ambient occlusion, anti-aliasing and motion blur.
   - Audio: master, music, SFX and ambience volumes.
   - Subtitles: on/off and size.
   - Settings persist between sessions.
9. **Menus** — Main menu (the game's own title screen over a fog-filled Schlossgarten backdrop), pause menu, end-of-slice card, and a credits screen listing every asset and its license.
10. **Audio** — Night ambience, wind, distant sirens, the fog's low hum, footsteps, UI sounds, Fritz's caws and clockwork chimes, and the lock's mechanical sounds. Placeholder sound comes from CC0/CC-BY sources and is credited.

## 9. Graphics direction

- **Volumetric fog:** real, raymarched or froxel-based. Local lights (streetlights, the pyramid's red indicator, Fritz's eye) scatter in it as visible halos and light shafts. The fog is a slightly sickly grey-green (Compound-7), not neutral white, and it drifts slowly.
- **Lighting:** fixed night. Moonlight as the main light, sodium-yellow streetlights, plus global illumination (baked or probe-based) so the scene doesn't look flat. Reflection probes for wet stone and the lake. Light settles on surfaces.
- **Surfaces:** wet cobblestones/paths with puddle reflections, high-detail materials on monuments (normal maps and detail maps), bronze and copper patina on the plaque and Fritz.
- **Post-processing:** HDR, filmic tonemapping, bloom, color grading toward cold blue shadows and sodium highlights, ambient occlusion, vignette, light film grain, temporal anti-aliasing.
- **Vegetation:** dense tree belts and hedges that read well through the fog, with wind sway.
- **Performance targets:**
  - **High:** 60 fps at 1080p on an RTX 2060/2070-class laptop in Chrome or Edge.
  - **Low:** a **hard requirement** (owner): a steady 30 fps on integrated GPUs (Intel Iris Xe / AMD Radeon Vega class) at 1080p with render scale reduced. Low keeps volumetric fog at reduced resolution and step count; it does not fall back to flat fog unless it can't hold 30 fps.
  - **Ultra:** may go below 60 fps.
  - **Frame-rate cap:** 30 / 60 / unlimited, available in settings.

## 10. Technical constraints

- **Engine (owner decision, 2026-10-28):** pure web, **no Unity**. The game is TypeScript + Three.js (WebGPURenderer with TSL), bundled by Vite and run straight in the browser. It lives in a new local project at `.local/bin/shadows-of-the-mist`; the Unity HERO-VR repo isn't used.
- **Graphics API:** WebGPU as the primary target. Three's WebGPURenderer falls back to WebGL2 automatically; on WebGL2 the fog drops to its cheapest tier.
- **Download size:** no limit. Assets are compressed (meshopt geometry, KTX2 textures) and loaded per area so the menu appears quickly.
- **Placeholder imports:** glTF/GLB. Model scale, orientation and pivots must match real-world proportions, so the team's scans can replace placeholders object for object.
- **Asset swap rule:** every monument is described by a data entry: model file, transform, collider shapes and interaction points. A scan replaces only the model file.
- **Existing scan pipeline:** `.local/bin/HERO-VR-scans` (Polycam GLB → Blender cleanup). Its GLB output must load without code changes.
- **Credits:** an `ASSET_CREDITS.md` file in the project, plus the in-game credits screen, listing each asset's source, author, license and link.
- **Git:** a new local git repo with no remote. Nothing is pushed.

## 11. Placeholder assets needed

| Asset | Wanted | Likely source |
|---|---|---|
| Karlsruhe pyramid | Photogrammetry scan of the real pyramid if one exists; otherwise a high-detail sandstone pyramid | Sketchfab |
| Schloss Karlsruhe | Exterior at background distance | Sketchfab, or blocked out with a high-detail facade |
| Founder plaque, brass door, cipher disc | Custom-built and textured | Built in-engine / Blender |
| Cobblestones, sandstone, bronze, grass, bark | Photoscanned PBR materials | Poly Haven (CC0), ambientCG (CC0) |
| Trees, hedges | Realistic European trees (plane, linden, chestnut) | Poly Haven, Sketchfab |
| Streetlights, benches, kiosk, newspapers | Period-appropriate street furniture | Sketchfab / Poly Haven |
| Raven (Fritz) | Rigged and animated (fly, perch, idle, caw) | Sketchfab (CC-BY) |
| Humans (Julian's hands optional; NPCs) | Rigged, with idle/angry/gesture animations | Mixamo or Quaternius-style CC0 packs |
| Sky / HDRI | Night sky, overcast | Poly Haven (CC0) |
| Audio | Night ambience, sirens, footsteps, raven, mechanical | Freesound (CC0/CC-BY), Sonniss GDC packs |

*My call:* CC0 and CC-BY are fine (it's a university project), as long as everything is credited. Avoid NC/ND licenses in case the project is ever shown publicly or developed further.

## 11a. Owner answers after builder review

- **Scale:** the Schlossgarten is built at real-world scale (garden roughly 1 km across, with the 32 real radial axes) but follows the level map's arrangement of landmarks where the map and reality differ. The world is large, so it streams in sections; the slice plaza is the first finished section.
- **VR:** dropped for good. All systems are desktop screen-space first-person only.
- **Assets:** free assets only. The owner supplies a Sketchfab API token so CC-BY models can be downloaded directly. Mixamo and Asset Store items go on a list for the owner to download.

## 11b. Calls made after builder review

- **Cipher check:** the lock checks the tumblers only (KARL); the ring is a decoding aid. Guessing KARL from the plaque's name is acceptable.
- **Jammer:** shutting it down kills its light and sound only. The fog never thins in the slice (owner decision).
- **GitHub:** nothing goes to GitHub, not even pushes to a branch (owner decision). Local commits only. `ASSET_CREDITS.md` records each asset's license, so licenses can be checked before any future push.
- **Translations:** Claude writes the EN/AR/DE strings in a single exportable string table (CSV-compatible). Native-speaker review by the team comes later and does not block the slice.
- **Existing scans:** none are used (owner decision). Every monument uses a look-alike placeholder fetched from the internet. The asset-swap rule in section 10 still applies.
- **Frame rate:** the settings include a frame-rate cap (30 / 60 / unlimited). The game must also run on much weaker machines, including integrated GPUs (owner decision).

## 12. Left to the builder

- Code architecture, folder layout and naming.
- Which volumetric fog technique to use, as long as it meets section 9.
- Choice between baked lightmaps and realtime/probe lighting.
- Exact placeholder picks within the rules in section 11.
- UI visual style, as long as it is readable, period-flavoured (brass, paper, ink) and works in RTL.
- How to verify (play-mode tests, web build smoke tests, screenshots).

## 13. Done means

- The production build (`vite build`) runs locally in Chrome/Edge and you can play Act 0 from the main menu to the end-of-slice card with no console errors.
- Switching to Arabic shows correctly shaped right-to-left text everywhere; German fits without overflow.
- Reloading the page after the puzzle and choosing Continue resumes after the lock.
- Every setting applies immediately and persists.
- Hint tiers 1–4 work, and the cipher can be solved from in-game clues alone.
- The fog visibly scatters streetlight; screenshots of the plaza look portfolio-grade.
- The High preset meets the frame-rate target on the dev laptop (RTX 2070).
- The Low preset holds 30 fps with the cap on. It is tested on the dev laptop's integrated GPU if it has one; otherwise it is simulated by forcing the integrated adapter or lowering resolution and clocks. That method is the builder's call and is stated in the results.
- Credits list every third-party asset.
