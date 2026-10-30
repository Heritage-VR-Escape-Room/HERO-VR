/**
 * Every sound effect, synthesized with Web Audio: no files to download and no
 * licences to track. Each recipe plays once into `out` at `when` and cleans
 * up after itself; `pitch` scales its frequencies.
 */
import type { Surface } from '../world/colliders';

export type SfxName =
  | 'raven_caw'
  | 'ring_tick'
  | 'tumbler_click'
  | 'handle_rattle'
  | 'lock_clunk'
  | 'steam'
  | 'jammer_off'
  | 'paper_rustle'
  | 'item_pickup'
  | 'ui_hover'
  | 'ui_click'
  | 'cough'
  | 'bike_bell'
  | 'dog_bark'
  | 'pigeon_flutter';

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

/** Two seconds of white noise, shared by every recipe. */
export function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let b = noiseCache.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseCache.set(ctx, b);
  }
  return b;
}

interface Voice {
  ctx: BaseAudioContext;
  out: AudioNode;
  when: number;
  pitch: number;
  gain: number;
}

/** A gain envelope: attack to `peak`, exponential decay to silence over `decay` s. */
function env(v: Voice, peak: number, attack: number, decay: number, at = v.when): GainNode {
  const g = v.ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(peak * v.gain, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  g.connect(v.out);
  return g;
}

/** Filtered noise burst. */
function noise(v: Voice, type: BiquadFilterType, freq: number, q: number, peak: number, attack: number, decay: number, at = v.when): void {
  const src = v.ctx.createBufferSource();
  src.buffer = noiseBuffer(v.ctx);
  src.playbackRate.value = v.pitch;
  const f = v.ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq * v.pitch;
  f.Q.value = q;
  src.connect(f).connect(env(v, peak, attack, decay, at));
  src.start(at, Math.random() * 1.5);
  src.stop(at + attack + decay + 0.05);
}

/** Pitched tone with an optional glide. */
function tone(v: Voice, type: OscillatorType, f0: number, f1: number, peak: number, attack: number, decay: number, at = v.when): OscillatorNode {
  const o = v.ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0 * v.pitch, at);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1 * v.pitch), at + attack + decay);
  o.connect(env(v, peak, attack, decay, at));
  o.start(at);
  o.stop(at + attack + decay + 0.05);
  return o;
}

/** Footstep on a surface; `variant` (0..3) shifts the character slightly. */
export function footstep(v: Voice, surface: Surface, variant: number): void {
  const k = 1 + (variant - 1.5) * 0.06;
  switch (surface) {
    case 'cobble':
      tone(v, 'sine', 140 * k, 70, 0.5, 0.002, 0.07);
      noise(v, 'bandpass', 1900 * k, 1.2, 0.35, 0.002, 0.06);
      break;
    case 'gravel':
      for (let i = 0; i < 4; i++) noise(v, 'highpass', 2500 * k, 0.7, 0.22, 0.002, 0.03 + Math.random() * 0.03, v.when + i * 0.018 + Math.random() * 0.01);
      tone(v, 'sine', 110 * k, 60, 0.3, 0.003, 0.06);
      break;
    case 'grass':
      noise(v, 'lowpass', 1100 * k, 0.6, 0.3, 0.02, 0.13);
      break;
    case 'wood':
      tone(v, 'triangle', 210 * k, 120, 0.5, 0.002, 0.11);
      noise(v, 'bandpass', 900 * k, 2, 0.2, 0.002, 0.05);
      break;
    case 'metal':
      tone(v, 'sine', 870 * k, 860, 0.18, 0.002, 0.28);
      tone(v, 'sine', 1430 * k, 1420, 0.1, 0.002, 0.2);
      noise(v, 'bandpass', 3200 * k, 3, 0.3, 0.001, 0.04);
      break;
  }
}

export function sfx(v: Voice, name: SfxName): void {
  const t = v.when;
  switch (name) {
    case 'raven_caw':
      // Two hoarse caws: a buzzy glide through a nasal formant.
      for (const at of [t, t + 0.32]) {
        const o = v.ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(720 * v.pitch, at);
        o.frequency.exponentialRampToValueAtTime(430 * v.pitch, at + 0.22);
        const f = v.ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 1400 * v.pitch;
        f.Q.value = 2.5;
        o.connect(f).connect(env(v, 0.55, 0.015, 0.22, at));
        o.start(at);
        o.stop(at + 0.3);
        noise(v, 'bandpass', 1600, 1.5, 0.18, 0.01, 0.2, at);
      }
      break;
    case 'ring_tick':
      noise(v, 'highpass', 4200, 0.8, 0.35, 0.001, 0.015);
      tone(v, 'sine', 2600, 2500, 0.15, 0.001, 0.03);
      break;
    case 'tumbler_click':
      noise(v, 'bandpass', 1500, 1.5, 0.45, 0.001, 0.025);
      tone(v, 'sine', 1200, 1100, 0.15, 0.001, 0.04);
      break;
    case 'handle_rattle':
      for (let i = 0; i < 6; i++) noise(v, 'bandpass', 1100 + Math.random() * 900, 2, 0.4, 0.001, 0.03, t + i * 0.05 + Math.random() * 0.02);
      tone(v, 'triangle', 160, 120, 0.3, 0.003, 0.15);
      break;
    case 'lock_clunk':
      tone(v, 'sine', 95, 45, 0.9, 0.003, 0.35);
      noise(v, 'lowpass', 500, 0.8, 0.5, 0.002, 0.2);
      noise(v, 'bandpass', 2200, 2, 0.25, 0.001, 0.05, t + 0.06);
      break;
    case 'steam':
      noise(v, 'highpass', 1800, 0.5, 0.35, 0.08, 1.3);
      break;
    case 'jammer_off':
      tone(v, 'sawtooth', 240, 30, 0.25, 0.005, 0.7);
      noise(v, 'bandpass', 2000, 2, 0.3, 0.001, 0.04);
      break;
    case 'paper_rustle':
      for (let i = 0; i < 5; i++) noise(v, 'bandpass', 2800 + Math.random() * 2000, 1, 0.25, 0.02, 0.07, t + i * 0.07 + Math.random() * 0.03);
      break;
    case 'item_pickup':
      tone(v, 'sine', 660, 660, 0.25, 0.01, 0.35);
      tone(v, 'sine', 990, 990, 0.2, 0.01, 0.45, t + 0.09);
      noise(v, 'bandpass', 1800, 1.5, 0.2, 0.002, 0.05);
      break;
    case 'ui_hover':
      tone(v, 'sine', 1800, 1700, 0.05, 0.002, 0.04);
      break;
    case 'ui_click':
      noise(v, 'bandpass', 2400, 2, 0.25, 0.001, 0.03);
      tone(v, 'sine', 900, 700, 0.12, 0.002, 0.08);
      break;
    case 'bike_bell':
      // Two quick rings of a bicycle bell, faint (somewhere out in the fog).
      for (const at of [t, t + 0.16]) {
        tone(v, 'sine', 2350, 2340, 0.045, 0.002, 0.5, at);
        tone(v, 'sine', 3720, 3700, 0.02, 0.002, 0.35, at);
      }
      break;
    case 'dog_bark':
      // Two barks: a falling growl through a mouth formant.
      for (const at of [t, t + 0.28]) {
        const o = v.ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(520, at);
        o.frequency.exponentialRampToValueAtTime(240, at + 0.14);
        const f = v.ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 900;
        f.Q.value = 1.6;
        o.connect(f).connect(env(v, 0.6, 0.008, 0.15, at));
        o.start(at);
        o.stop(at + 0.2);
        noise(v, 'bandpass', 1200, 1.2, 0.2, 0.005, 0.12, at);
      }
      break;
    case 'pigeon_flutter':
      for (let i = 0; i < 9; i++) noise(v, 'bandpass', 700 + Math.random() * 600, 0.9, 0.3, 0.004, 0.05, t + i * 0.055);
      break;
    case 'cough':
      // Two dry coughs: a voiced burst through a throat formant.
      for (const at of [t, t + 0.45]) {
        noise(v, 'bandpass', 650, 1.2, 0.7, 0.01, 0.22, at);
        noise(v, 'bandpass', 1700, 2, 0.25, 0.01, 0.15, at);
        tone(v, 'sawtooth', 160, 110, 0.12, 0.01, 0.18, at);
      }
      break;
  }
}
