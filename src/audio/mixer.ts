/**
 * Web Audio buses: master -> { music, sfx, ambience }, each a GainNode whose
 * gain is the settings slider squared (perceptually even). Browsers start an
 * AudioContext suspended; it resumes on the first user gesture.
 */

export interface Volumes {
  master: number;
  music: number;
  sfx: number;
  ambience: number;
}

export interface Mixer {
  ctx: AudioContext;
  master: GainNode;
  music: GainNode;
  sfx: GainNode;
  ambience: GainNode;
  setVolumes(v: Volumes): void;
}

/** Slider (0..1) to gain. */
export function volumeGain(slider: number): number {
  const s = Math.min(1, Math.max(0, slider));
  return s * s;
}

export function createMixer(volumes: Volumes, target: EventTarget = window): Mixer {
  const ctx = new AudioContext({ latencyHint: 'interactive' });
  const master = ctx.createGain();
  // A gentle limiter so overlapping sounds never clip.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.15;
  master.connect(limiter).connect(ctx.destination);
  const bus = (): GainNode => {
    const g = ctx.createGain();
    g.connect(master);
    return g;
  };
  const mixer: Mixer = {
    ctx,
    master,
    music: bus(),
    sfx: bus(),
    ambience: bus(),
    setVolumes(v) {
      const t = ctx.currentTime;
      master.gain.setTargetAtTime(volumeGain(v.master), t, 0.02);
      mixer.music.gain.setTargetAtTime(volumeGain(v.music), t, 0.02);
      mixer.sfx.gain.setTargetAtTime(volumeGain(v.sfx), t, 0.02);
      mixer.ambience.gain.setTargetAtTime(volumeGain(v.ambience), t, 0.02);
    },
  };
  master.gain.value = volumeGain(volumes.master);
  mixer.music.gain.value = volumeGain(volumes.music);
  mixer.sfx.gain.value = volumeGain(volumes.sfx);
  mixer.ambience.gain.value = volumeGain(volumes.ambience);

  const resume = (): void => {
    if (ctx.state === 'suspended') void ctx.resume();
    if (ctx.state === 'running') for (const e of ['pointerdown', 'keydown']) target.removeEventListener(e, resume);
  };
  for (const e of ['pointerdown', 'keydown']) target.addEventListener(e, resume);
  return mixer;
}
