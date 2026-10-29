import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

interface Entry {
  slot: string;
  kind: 'model' | 'texture' | 'hdri';
  source: 'sketchfab' | 'polyhaven' | 'code' | 'alias';
  id: string;
  slug: string;
  title?: string;
  author?: string;
  license?: string;
  url?: string;
  targetSize?: { axis: 'height' | 'length'; meters: number };
}

const root = join(__dirname, '..', '..');
const manifest = JSON.parse(readFileSync(join(root, 'tools', 'assets', 'manifest.json'), 'utf8')) as { entries: Entry[] };
const ALLOWED = ['CC0 1.0', 'CC-BY 4.0'];
const SLOTS = [
  'pyramid', 'schloss', 'streetlamp', 'bench', 'kiosk', 'newspapers', 'tree_plane', 'tree_linden', 'tree_chestnut',
  'hedge', 'raven_rigged', 'human_npc_m', 'human_npc_f', 'hdri_night_overcast',
  'tex_cobble_wet', 'tex_sandstone_red', 'tex_bronze_patina', 'tex_grass', 'tex_gravel', 'tex_bark',
];
const thirdParty = manifest.entries.filter((e) => e.source === 'sketchfab' || e.source === 'polyhaven');

describe('asset manifest', () => {
  it('covers every spec slot', () => {
    const slots = manifest.entries.map((e) => e.slot);
    for (const s of SLOTS) expect(slots, s).toContain(s);
  });

  it('every manifest entry has an allowed license, author, url, and a public/assets/<slug> folder with a .glb or texture files', () => {
    for (const e of thirdParty) {
      expect(ALLOWED, `${e.slug} license`).toContain(e.license);
      expect(e.author, `${e.slug} author`).toBeTruthy();
      expect(e.url, `${e.slug} url`).toMatch(/^https:\/\//);
      const dir = join(root, 'public', 'assets', e.slug);
      expect(existsSync(dir), `${e.slug} folder`).toBe(true);
      const files = readdirSync(dir);
      const ok = e.kind === 'model' ? files.includes(`${e.slug}.glb`) : files.some((f) => /\.(webp|ktx2|jpg|png|hdr)$/.test(f));
      expect(ok, `${e.slug} has a .glb or texture files`).toBe(true);
    }
  });

  it('code-built and alias slots point at something real', () => {
    const slugs = new Set(manifest.entries.map((e) => e.slug));
    for (const e of manifest.entries.filter((x) => x.source === 'alias')) expect(slugs.has(e.id), e.slug).toBe(true);
    expect(manifest.entries.filter((e) => e.source === 'code').map((e) => e.slot).sort()).toEqual(['pyramid', 'schloss']);
  });

  it('models carry a target size and every credit row maps to a manifest entry', () => {
    for (const e of thirdParty.filter((x) => x.kind === 'model')) expect(e.targetSize?.meters, e.slug).toBeGreaterThan(0);
    const credits = JSON.parse(readFileSync(join(root, 'public', 'credits.json'), 'utf8')) as { entries: { source: string }[] };
    const urls = new Set(credits.entries.map((c) => c.source));
    for (const e of thirdParty) expect(urls.has(e.url!), `${e.slug} credited`).toBe(true);
  });
});
