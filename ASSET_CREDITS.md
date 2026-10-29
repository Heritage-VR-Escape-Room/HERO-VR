# Asset credits

Every third-party asset in the game. Allowed licenses: CC0, CC-BY, OFL (fonts).

| Asset | File | Source | Author | License |
|---|---|---|---|---|
| Kloppenheim 07 (Pure Sky) HDRI, night sky placeholder | `public/assets/hdri_night/kloppenheim_07_puresky_1k.hdr` | https://polyhaven.com/a/kloppenheim_07_puresky | Greg Zaal (original), Jarod Guest (sky edits) | CC0 1.0 |
| IM Fell English (UI headings) | `@fontsource/im-fell-english` | https://fontsource.org/fonts/im-fell-english | Igino Marini (Fell Types revival) | OFL 1.1 |
| Amiri (Arabic headings, plaque) | `@fontsource/amiri` | https://github.com/aliftype/amiri | The Amiri Project Authors (Khaled Hosny) | OFL 1.1 |
| Noto Sans (UI body text) | `@fontsource/noto-sans` | https://github.com/notofonts/latin-greek-cyrillic | The Noto Project Authors | OFL 1.1 |
| Noto Naskh Arabic (Arabic body text) | `@fontsource/noto-naskh-arabic` | https://github.com/notofonts/arabic | The Noto Project Authors | OFL 1.1 |

## Notes

- Fritz (companion raven): the current bird is a built-in low-poly primitive placeholder, no third-party asset. When a loaded raven model lacks an animation clip (`fly`, `perch`, `idle`, `caw`), that motion is procedural: a 4 Hz wing-bone flap for `fly`, head-tilt noise for `idle`.
- `public/credits.json` mirrors this file for the in-game Credits screen; keep both in step.
