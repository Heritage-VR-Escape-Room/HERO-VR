// Writes 2k and 1k copies of every Poly Haven texture set in public/assets/tex_*
// (from the largest source present) so the game can pick a resolution per preset.
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const ROOT = new URL('../../public/assets/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const SIZES = { '2k': 2048, '1k': 1024 };

for (const slug of readdirSync(ROOT).filter((d) => d.startsWith('tex_'))) {
  const dir = join(ROOT, slug);
  for (const map of ['diff', 'nor', 'arm']) {
    const src = ['4k', '2k'].map((r) => join(dir, `${map}_${r}.webp`)).find(existsSync);
    if (!src) continue;
    for (const [res, px] of Object.entries(SIZES)) {
      const out = join(dir, `${map}_${res}.webp`);
      if (existsSync(out)) continue;
      // Normal and ARM maps are data: keep them near-lossless.
      await sharp(src).resize(px, px).webp({ quality: map === 'diff' ? 85 : 92 }).toFile(out);
      console.log('wrote', out);
    }
  }
}
