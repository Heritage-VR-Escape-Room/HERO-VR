// Turn raw downloads into game-ready assets under public/assets/<slug>/.
//   node tools/assets/optimize.mjs [--only slug ...]
//
// Models:   raw glb -> Blender fix_transform.py (size, pivot, facing) -> gltf-transform simplify (only when over
//           the entry's maxTris budget) -> gltf-transform optimize (meshopt; textures per ktx2Plan.mjs).
// Textures: Poly Haven JPG maps -> WebP always (these standalone maps are never KTX2).
//
// Model textures: without the `toktx` binary (KTX-Software) they become WebP (what ships now). If toktx is on PATH,
// re-running this script for a model GLB instead writes KTX2: UASTC for normal maps, ETC1S for the other slots.
// Standalone texture sets (tex_*) stay WebP either way. The runtime loader handles both formats.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { texturePlan } from './ktx2Plan.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const cache = join(here, '.cache');
const blender = process.env.SOM_BLENDER ?? 'C:\\Users\\Work\\.local\\bin\\HERO-VR-scans\\tools\\blender-4.5.14-windows-x64\\blender.exe';
const gltfCli = join(root, 'node_modules', '@gltf-transform', 'cli', 'bin', 'cli.js');
const manifest = JSON.parse(readFileSync(join(here, 'manifest.json'), 'utf8'));
const only = process.argv.includes('--only') ? process.argv.slice(process.argv.indexOf('--only') + 1) : null;

const hasToktx = spawnSync('toktx --version', { shell: true }).status === 0;
const plan = texturePlan(hasToktx);
const textureCompress = hasToktx ? 'ktx2 (uastc normals, etc1s rest)' : 'webp';

function run(cmd, args, label) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.status !== 0) {
    console.error(`${label} failed:\n${r.stdout.slice(-1500)}\n${r.stderr.slice(-1500)}`);
    process.exit(1);
  }
  return r.stdout;
}

const gt = (...args) => run(process.execPath, [gltfCli, ...args], `gltf-transform ${args[0]}`);

function triCount(file) {
  const out = run(process.execPath, [join(here, 'inspect.mjs'), file], 'inspect');
  return JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1)).tris;
}

function findSource(dir) {
  const files = readdirSync(dir, { recursive: true }).map(String);
  return files.find((f) => f.endsWith('.glb')) ?? files.find((f) => f.endsWith('.gltf'));
}

function optimizeModel(e) {
  const rawDir = join(cache, 'raw', e.slug);
  const src = findSource(rawDir);
  if (!src) throw new Error(`${e.slug}: nothing in ${rawDir}`);
  mkdirSync(join(cache, 'fixed'), { recursive: true });
  const fixed = join(cache, 'fixed', `${e.slug}.glb`);
  const bargs = ['-b', '-P', join(here, 'blender', 'fix_transform.py'), '--', join(rawDir, src), fixed,
    '--size', String(e.targetSize.meters), '--axis', e.targetSize.axis];
  for (const k of ['keep', 'drop', 'yaw']) if (e.fix?.[k] !== undefined) bargs.push(`--${k}`, String(e.fix[k]));
  const blog = run(blender, bargs, `blender ${e.slug}`);
  const fixLine = blog.split('\n').find((l) => l.startsWith('FIX_RESULT')) ?? '';
  const skinned = fixLine.includes('skinned');

  // Skinned models keep their authored pose: re-apply Blender's measured transform to the raw file instead of
  // using Blender's export (which writes the rest pose).
  let base = fixed;
  if (skinned) {
    const xform = blog.split('\n').find((l) => l.startsWith('FIX_XFORM')).slice('FIX_XFORM '.length).trim();
    base = join(cache, 'fixed', `${e.slug}.posed.glb`);
    run(process.execPath, [join(here, 'apply_transform.mjs'), join(rawDir, src), base, xform], 'apply_transform');
  }
  let input = base;
  const before = triCount(base);
  if (e.maxTris && before > e.maxTris) {
    input = join(cache, 'fixed', `${e.slug}.simplified.glb`);
    const ratio = Math.max(0.02, Math.min(1, (e.maxTris * 0.98) / before));
    gt('simplify', base, input, '--ratio', ratio.toFixed(4), '--error', '0.02');
  }
  const outDir = join(root, 'public', 'assets', e.slug);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, `${e.slug}.glb`);
  // With toktx: KTX2 passes run before `optimize` (UASTC for normal maps, ETC1S for the rest).
  plan.passes.forEach((pass, i) => {
    const next = join(cache, 'fixed', `${e.slug}.${pass.command}${i}.glb`);
    gt(pass.command, input, next, '--slots', pass.slots);
    input = next;
  });
  const oargs = ['optimize', input, out, '--compress', 'meshopt', '--texture-compress', plan.optimizeTextureCompress,
    '--palette', 'false', '--simplify', 'false'];
  if (skinned) oargs.push('--join', 'false');
  gt(...oargs);
  const after = triCount(out);
  console.log(`${e.slug}: ${fixLine.replace('FIX_RESULT ', '')} | tris ${before} -> ${after} | ${(statSync(out).size / 1024).toFixed(0)} KiB (${textureCompress})`);
}

async function optimizeTexture(e) {
  const rawDir = join(cache, 'raw', e.slug);
  const outDir = join(root, 'public', 'assets', e.slug);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  let total = 0;
  for (const f of readdirSync(rawDir).filter((n) => n.endsWith('.jpg'))) {
    const out = join(outDir, f.replace(/\.jpg$/, '.webp'));
    // normal and ARM maps need more precision than color
    await sharp(join(rawDir, f)).webp({ quality: f.startsWith('diff') ? 85 : 92 }).toFile(out);
    total += statSync(out).size;
  }
  console.log(`${e.slug}: webp maps ${(total / 1024 / 1024).toFixed(1)} MiB`);
}

for (const e of manifest.entries) {
  if (only && !only.includes(e.slug)) continue;
  if (e.kind === 'model' && (e.source === 'sketchfab' || e.source === 'team-scan')) optimizeModel(e);
  else if (e.kind === 'texture') await optimizeTexture(e);
}
if (!existsSync(join(root, 'public', 'assets'))) process.exit(1);
