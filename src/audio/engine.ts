/**
 * The game's sound: one mixer for the page, synthesized effects (global or at
 * a world position), footsteps, the jammer's hum loop, the night ambience and
 * the listener that follows the camera.
 */
import type { Camera } from 'three/webgpu';
import { Vector3 } from 'three/webgpu';
import { createPicker, type Picker } from '../logic/footstepPicker';
import type { Surface } from '../world/colliders';
import { startAmbience, panner } from './ambience';
import { createMixer, type Volumes } from './mixer';
import { footstep, sfx, type SfxName } from './synth';
import { createMusic, type ThemeId } from './music';

type Vec3 = { x: number; y: number; z: number };

export interface AudioEngine {
  play(name: SfxName, at?: Vec3, replay?: boolean): void;
  footstep(surface: Surface): void;
  /** Start the night ambience (game only). */
  ambience(opts: { humAt: Vec3 }): void;
  /** The jammer's hum; `quiet` stops it without the shutdown sound (save restore). */
  hum(on: boolean, at: Vec3, quiet?: boolean): void;
  /** Crossfade to a theme (null: silence). */
  music(id: ThemeId | null): void;
  setVolumes(v: Volumes): void;
  /** Move the listener to the camera; call once per frame. */
  update(camera: Camera): void;
  /** Names played so far (for tests). */
  log(): readonly string[];
  state(): AudioContextState;
}

export function createAudio(volumes: Volumes): AudioEngine {
  const m = createMixer(volumes);
  const { ctx } = m;
  const played: string[] = [];
  const music = createMusic(ctx, m.music);
  const pickers = new Map<Surface, Picker>();
  const fwd = new Vector3();
  let humNode: { stop(): void } | null = null;

  const voice = (out: AudioNode, pitch = 1, gain = 1) => ({ ctx, out, when: ctx.currentTime + 0.005, pitch, gain });
  const outAt = (at: Vec3 | undefined, refDistance = 3): AudioNode => (at ? panner(ctx, at, m.sfx, refDistance) : m.sfx);
  // Sounds asked for before the first click (the page starts with audio
  // blocked) play once it is allowed, if they are still recent.
  const pending: Array<{ name: SfxName; at?: Vec3; t: number }> = [];
  ctx.addEventListener('statechange', () => {
    if (ctx.state !== 'running') return;
    const now = performance.now();
    for (const p of pending.splice(0)) if (now - p.t < 8000) engine.play(p.name, p.at, true);
  });
  const note = (name: string): void => {
    played.push(name);
    if (played.length > 200) played.shift();
  };

  const engine: AudioEngine = {
    play(name, at, replay = false) {
      if (!replay) note(name);
      if (ctx.state !== 'running') {
        if (pending.length < 8 && !name.startsWith('ui_')) pending.push({ name, at, t: performance.now() });
        return;
      }
      const pitch = name === 'raven_caw' ? 0.94 + Math.random() * 0.12 : 1;
      sfx(voice(outAt(at, name === 'raven_caw' ? 6 : 3), pitch), name);
    },
    footstep(surface) {
      note(`step_${surface}`);
      if (ctx.state !== 'running') return;
      let p = pickers.get(surface);
      if (!p) pickers.set(surface, (p = createPicker(4)));
      const { index, pitch } = p.next();
      footstep(voice(m.sfx, pitch, 0.55), surface, index);
    },
    ambience(opts) {
      startAmbience(ctx, m.ambience, opts);
    },
    hum(on, at, quiet = false) {
      note(on ? 'jammer_hum_start' : 'jammer_hum_stop');
      if (!on) {
        humNode?.stop();
        humNode = null;
        if (!quiet) this.play('jammer_off', at);
        return;
      }
      if (humNode) return;
      // A mains buzz with a slow electronic warble, close to the door.
      const out = panner(ctx, at, m.sfx, 1.5, 1.6);
      const g = ctx.createGain();
      g.gain.value = 0.06;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 900;
      f.connect(g).connect(out);
      const oscs = [60, 120, 181].map((hz, i) => {
        const o = ctx.createOscillator();
        o.type = i === 0 ? 'sawtooth' : 'square';
        o.frequency.value = hz;
        o.connect(f);
        o.start();
        return o;
      });
      const wob = ctx.createOscillator();
      wob.frequency.value = 3.3;
      const wd = ctx.createGain();
      wd.gain.value = 0.025;
      wob.connect(wd).connect(g.gain);
      wob.start();
      humNode = { stop: () => [...oscs, wob].forEach((o) => o.stop()) };
    },
    music(id) {
      note(`music_${id ?? 'none'}`);
      music.play(id);
    },
    setVolumes: (v) => m.setVolumes(v),
    update(camera) {
      const l = ctx.listener;
      const p = camera.position;
      camera.getWorldDirection(fwd);
      const t = ctx.currentTime;
      if (l.positionX) {
        l.positionX.setTargetAtTime(p.x, t, 0.02);
        l.positionY.setTargetAtTime(p.y, t, 0.02);
        l.positionZ.setTargetAtTime(p.z, t, 0.02);
        l.forwardX.setTargetAtTime(fwd.x, t, 0.02);
        l.forwardY.setTargetAtTime(fwd.y, t, 0.02);
        l.forwardZ.setTargetAtTime(fwd.z, t, 0.02);
        l.upX.value = 0;
        l.upY.value = 1;
        l.upZ.value = 0;
      } else {
        l.setPosition(p.x, p.y, p.z);
        l.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0);
      }
    },
    log: () => played,
    state: () => ctx.state,
  };
  return engine;
}
