# Asset tooling

Run order (Windows Python; msys python fails HTTPS verification here):

1. `py -3 -I tools/assets/fetch_assets.py search --slot <slot> --q "<query>"`, then `contact-sheet`
2. edit `manifest.json` with the chosen ids, then `resolve` (fills title/author/license/url, rejects non CC0/CC-BY)
3. `fetch` (raw downloads into `.cache/raw/<slug>/`, git-ignored)
4. `node tools/assets/optimize.mjs [--only slug ...]` (Blender fix, simplify, meshopt, textures; writes `public/assets/<slug>/`)
5. `py -3 -I tools/assets/make_credits.py` (writes `ASSET_CREDITS.md` and `public/credits.json`)

Sketchfab token file: `SOM_SKETCHFAB_TOKEN_FILE` (default `C:/Users/Work/Desktop/API.txt`). Never commit or log it.
Blender: `SOM_BLENDER` (default portable build under HERO-VR-scans/tools). `node tools/assets/inspect.mjs file.glb` summarizes a GLB.
