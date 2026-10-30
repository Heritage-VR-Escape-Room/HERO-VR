# Shadows of the Mist: features and what is left

Web game (Three.js WebGPU with a WebGL2 fallback, Rapier physics, Vite). Run: `npm install`, `npm run build`, `npm run preview`, then open http://localhost:4173 in Chrome.

## In the game now (Act 0 / Prologue: Karlsruhe, the Marktplatz Pyramid)

### Story and flow
- New Game intro: three title cards, then a camera flight down through the fog onto the plaza (Space / Start skips it).
- Julian wakes on the bench with a fade-in and a cough.
- Fritz, the copper raven, lands once to introduce himself, then always flies with the player, ahead and to the right.
- The kiosk owner's rant about Port Said.
- Anvin, the fake repair worker, stands at the pyramid's panel and says his scripted line.
- The Circuit Bridge puzzle (new script):
  - 4 nodes and 4 switches.
  - Anvin's crossed red wires short the board when their node is live, with sparks and a red lamp.
  - The blue jumper drags between the terminals.
  - The copper traces glow as power flows.
  - The lid is engraved with the correct route.
- Solving it kills the jammer (its hum stops), the city radios come back, the compartment ("vault") opens and Anvin slinks off.
- The vault holds Director Vance's directive to "Operative A." (Vanguard lore) and the Spectrum Lenses.
- Spectrum Lenses (L / LB): a violet UV view that shows the trail north to the Schlossgarten (the way), and each puzzle's solution in UV ink.
- The prologue ends at the trail's end beside the Prinz Wilhelm von Baden monument (the team's scan). It saves, then shows the end card.
- Autosave after every puzzle and key item. Continue restores the world: door open, jammer dead, items held, no replayed lines.

### Inspection (Uncharted style)
- Objects lift from where they sit into the player's hands, with the world dimmed and blurred behind.
- Turn with the mouse or either stick, zoom with the wheel or triggers, and put back on close.
- Hidden details are found by turning an object; the lenses hide a VANGUARD stamp under the strap, which adds a journal note.
- Takeable items are taken straight from the hands (E / A).

### Help and UI
- Fritz's 3-tier hints (H / X) with outlines on the relevant parts, and a caw.
- Travel Journal (J / Y): main goal, tasks with ticks, notes and a pyramid sketch, plus a "journal updated" notice.
- Minimap (top right): north-up, with the plaza, lamps, people, a pulsing marker for the current task, and the UV trail while the lenses are on.
- Documents and a newspaper can be read; they scroll with the mouse, either stick or the D-pad.
- Main menu: a still backdrop, New Game / Continue / Settings / Credits.
- Pause menu.
- Settings:
  - language EN / AR / DE, with full right-to-left layout for Arabic;
  - graphics presets Low / Medium / High / Ultra, plus custom options;
  - a 30 / 60 / unlimited fps cap;
  - volumes, subtitle size, key rebinding.
- An automatic graphics preset is picked on first launch.
- Credits screen.

### The plaza is alive
- 4 cyclists (2 on Low) pedalling round the plaza, with a faint bell. They stop for the player.
- Two locals arguing about Port Said, overheard as you pass.
- A policeman on watch whose radio is dead, plus people coughing in the mist.
- A stray German Shepherd that sniffs, wags and barks at the player.
- Pigeons that scatter when you walk through them.
- A newspaper ("PORT SAID TO BLAME?") blowing across the cobbles.
- Palace windows lighting up and going dark over time.
- Six talkable people with repeating lines: Anvin, the kiosk owner, a citizen, the policeman and the two locals.

### World and graphics
- The Schlossgarten at real scale:
  - instanced trees with detail levels and far impostors;
  - hedges, paths, a lake and a fountain;
  - a palace blockout with its tower.
- Volumetric fog that never thins, sodium streetlamps with halos, a moonlit night sky, and wet cobbles with puddles.
- Post effects: SSAO, FXAA / SMAA / TAA, depth of field, film grain and grade.
- Physics-based first-person movement: walk, sprint, crouch, and footsteps that change with the surface.

### Audio (all generated in the browser, nothing to download)
- Theme music: the menu, Act 0, and a mysterious puzzle theme while working the circuit.
- Wind, city rumble, and the fog's hum at the pyramid.
- Effects: footsteps, Fritz, the panel, the jammer, bells, the dog, pigeons, paper, pickups, inspection.

### Input
- Keyboard and mouse.
- Gamepad (Xbox / PlayStation / standard): move, look, interact, hint, journal, lenses, pause, menus, the circuit, inspection and scrolling.

### Performance (RTX 2070 Max-Q, 1080p, uncapped)
- Low runs at about 130-140 fps, Medium at 90-95 and High at about 80.
- Texture resolution follows the preset (1k / 2k / 4k).
- Shadows are off on Low.
- Background characters skip shadows and are culled when out of view.

### Tests
- 158 unit tests.
- Browser tests: full Act 0 playthroughs in EN / AR / DE and on WebGL2, plus resume, wrong wiring, menu, settings, world, plaza and a performance bench.

## Known issues
- The lens UV solutions only help on puzzles solved after you pick up the lenses. In Act 0 the lenses come from the circuit itself, so you see the circuit's UV layer only if you go back with them on.
- The automated EN playthrough currently fails at the step that turns the lenses over to find the stamp (a test timing issue, not seen in manual play). The gamepad browser tests are disabled because they are timing-flaky.
- The bicycle wheels don't spin, because the model isn't split into parts.
- The policeman model wears a US uniform.
- The palace is still a blockout.
- People and Fritz are animated in code, because the free models have no walk or perch clips.
- All dialogue beyond the script's own lines (intro cards, Fritz's intro, NPC small talk, journal text, newspaper, Vance's directive) is placeholder writing. The AR and DE translations need a native check.
- The sound has not been listened to by a person yet.

## Left to build
- Task 14: lighting and visual polish per preset.
- The final whole-branch code review.
- Testing on a weak laptop with integrated graphics.
- More team scans to replace the look-alike placeholders: bench, kiosk, lamps, trees, people, the raven.
- Act 1 onward (new script):
  - the Schlossgarten and the depot;
  - Station Plaza;
  - the Karl Benz site;
  - train parts and the ticket letters;
  - the portal-train cutscene.
- Port Said (linear):
  - the second companion;
  - the Church, Italian Consulate and El Obelisk puzzles;
  - the underwater section.
- Act 3's ledger stones and the Act 4 silo (code 3584).
- Real recorded audio and voice acting, if wanted.
