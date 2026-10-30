/**
 * The night around the plaza: wind everywhere, a city rumble, and a low hum
 * from the fog around the pyramid (positional).
 */
import { noiseBuffer } from './synth';

type Vec3 = { x: number; y: number; z: number };

/** A positional emitter (inverse distance model) feeding `out`. */
export function panner(ctx: AudioContext, pos: Vec3, out: AudioNode, refDistance: number, rolloff = 1): PannerNode {
  const p = ctx.createPanner();
  p.panningModel = 'equalpower';
  p.distanceModel = 'inverse';
  p.refDistance = refDistance;
  p.rolloffFactor = rolloff;
  p.maxDistance = 10_000;
  p.positionX.value = pos.x;
  p.positionY.value = pos.y;
  p.positionZ.value = pos.z;
  p.connect(out);
  return p;
}

function loopNoise(ctx: AudioContext): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  return src;
}

export interface Ambience {
  stop(): void;
}

export function startAmbience(ctx: AudioContext, out: AudioNode, opts: { humAt: Vec3 }): Ambience {
  const nodes: AudioScheduledSourceNode[] = [];
  const start = <T extends AudioScheduledSourceNode>(n: T): T => {
    n.start();
    nodes.push(n);
    return n;
  };

  // Wind: noise through a low-pass whose cutoff wanders slowly.
  const wind = loopNoise(ctx);
  const wf = ctx.createBiquadFilter();
  wf.type = 'lowpass';
  wf.frequency.value = 520;
  wf.Q.value = 0.7;
  const wg = ctx.createGain();
  wg.gain.value = 0.16;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.07;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 300;
  lfo.connect(lfoDepth).connect(wf.frequency);
  wind.connect(wf).connect(wg).connect(out);
  start(wind);
  start(lfo);

  // City rumble: very low noise.
  const rumble = loopNoise(ctx);
  rumble.playbackRate.value = 0.5;
  const rf = ctx.createBiquadFilter();
  rf.type = 'lowpass';
  rf.frequency.value = 110;
  const rg = ctx.createGain();
  rg.gain.value = 0.22;
  rumble.connect(rf).connect(rg).connect(out);
  start(rumble);

  // The fog's hum around the pyramid: two detuned low tones, slowly beating.
  const humOut = panner(ctx, opts.humAt, out, 8, 1);
  const hg = ctx.createGain();
  hg.gain.value = 0.07;
  hg.connect(humOut);
  for (const f of [55, 55.6, 110.4]) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    o.connect(hg);
    start(o);
  }

  return {
    stop() {
      for (const n of nodes) n.stop();
    },
  };
}
