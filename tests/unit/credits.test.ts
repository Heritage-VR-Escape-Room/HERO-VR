import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COLOR_SLOTS, NORMAL_SLOTS, texturePlan } from '../../tools/assets/ktx2Plan.mjs';

const root = join(__dirname, '..', '..');
const md = readFileSync(join(root, 'ASSET_CREDITS.md'), 'utf8');
const rows = md.split(/\r?\n/).filter((l) => l.startsWith('|'));
/** Split a table row on unescaped pipes. */
const cells = (l: string) => l.replace(/^\||\|$/g, '').split(/(?<!\\)\|/);

describe('ASSET_CREDITS.md', () => {
  it('every table row has the same cell count as the header', () => {
    const n = cells(rows[0]!).length;
    expect(n).toBe(5);
    for (const r of rows) expect(cells(r).length, r).toBe(n);
  });

  it('every public/assets folder has a credit row', () => {
    for (const d of readdirSync(join(root, 'public', 'assets'), { withFileTypes: true }).filter((x) => x.isDirectory())) {
      expect(md, d.name).toContain(`public/assets/${d.name}/`);
    }
  });
});

describe('texture plan', () => {
  it('uses WebP inside optimize when toktx is missing', () => {
    expect(texturePlan(false)).toEqual({ optimizeTextureCompress: 'webp', passes: [] });
  });
  it('uses UASTC for normal maps and ETC1S for the other slots when toktx exists', () => {
    const p = texturePlan(true);
    expect(p.optimizeTextureCompress).toBe('false');
    expect(p.passes).toEqual([
      { command: 'uastc', slots: NORMAL_SLOTS },
      { command: 'etc1s', slots: COLOR_SLOTS },
    ]);
    expect(COLOR_SLOTS).not.toContain('normal');
  });
});
