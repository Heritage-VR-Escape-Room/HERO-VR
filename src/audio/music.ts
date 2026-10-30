/**
 * Theme music, generated live: each act and puzzle has its own theme (a chord
 * progression, a pad, a bass and a melody voice), scheduled a little ahead on
 * the AudioContext clock. Switching themes crossfades over two seconds.
 */

export type ThemeId = 'menu' | 'act0' | 'puzzle_circuit';

interface Theme {
  bpm: number;
  /** Chords as MIDI note numbers, one per bar (4 beats). */
  chords: number[][];
  /** Melody: per bar, 8 eighth-note slots; a number is an index into the chord (+12 per octave), null is a rest. */
  melody: Array<Array<number | null>>;
  pad: { type: OscillatorType; gain: number; cutoff: number };
  lead: { type: OscillatorType; gain: number; decay: number };
  bass: number;
  /** A ticking clockwork pulse on every eighth (puzzles). */
  tick: boolean;
}

const _ = null;

/** Note n of a chord, wrapping up an octave per extra index. */
function chordNote(chord: number[], i: number): number {
  const n = chord.length;
  return chord[((i % n) + n) % n]! + 12 * Math.floor(i / n);
}

export const THEMES: Record<ThemeId, Theme> = {
  // Karlsruhe at night: D minor, slow, a music-box melody over a soft pad.
  act0: {
    bpm: 66,
    chords: [
      [50, 53, 57, 62], // Dm
      [46, 50, 53, 58], // Bb
      [41, 45, 48, 53], // F
      [48, 52, 55, 60], // C
      [50, 53, 57, 62], // Dm
      [43, 46, 50, 55], // Gm
      [45, 49, 52, 57], // A
      [45, 49, 52, 57], // A
    ],
    melody: [
      [4, _, 6, _, 5, _, _, _],
      [4, _, _, 3, 4, _, _, _],
      [5, _, 6, _, 7, _, 6, _],
      [5, _, _, _, 4, _, _, _],
      [6, _, 5, _, 4, _, 3, _],
      [4, _, _, _, 5, _, 4, _],
      [5, _, 4, _, 3, _, _, _],
      [_, _, _, _, _, _, _, _],
    ],
    pad: { type: 'triangle', gain: 0.05, cutoff: 900 },
    lead: { type: 'sine', gain: 0.07, decay: 1.4 },
    bass: 0.08,
    tick: false,
  },
  // Puzzles: tense A minor, a clockwork tick and a busy arpeggio.
  puzzle_circuit: {
    bpm: 96,
    chords: [
      [45, 48, 52, 57], // Am
      [41, 45, 48, 53], // F
      [43, 47, 50, 55], // G
      [40, 44, 47, 52], // E
    ],
    melody: [
      [4, 5, 6, 5, 4, 5, 6, 7],
      [4, 5, 6, 5, 4, 5, 6, 5],
      [4, 5, 6, 7, 6, 5, 4, 5],
      [4, 6, 5, 7, 6, 8, 7, 6],
    ],
    pad: { type: 'sawtooth', gain: 0.025, cutoff: 600 },
    lead: { type: 'triangle', gain: 0.04, decay: 0.25 },
    bass: 0.09,
    tick: true,
  },
  // Main menu: the Act 0 theme, sparser and slower.
  menu: {
    bpm: 54,
    chords: [
      [50, 53, 57, 62],
      [46, 50, 53, 58],
      [43, 46, 50, 55],
      [45, 49, 52, 57],
    ],
    melody: [
      [4, _, _, _, 6, _, _, _],
      [5, _, _, _, _, _, _, _],
      [4, _, _, _, 3, _, _, _],
      [_, _, _, _, _, _, _, _],
    ],
    pad: { type: 'triangle', gain: 0.05, cutoff: 700 },
    lead: { type: 'sine', gain: 0.06, decay: 2 },
    bass: 0.06,
    tick: false,
  },
};

const hz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

export interface Music {
  play(id: ThemeId | null): void;
  current(): ThemeId | null;
}

export function createMusic(ctx: AudioContext, out: AudioNode): Music {
  let current: ThemeId | null = null;
  let voice: { gain: GainNode; timer: number } | null = null;

  const note = (dest: AudioNode, type: OscillatorType, f: number, at: number, peak: number, attack: number, decay: number): void => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(peak, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
    o.connect(g).connect(dest);
    o.start(at);
    o.stop(at + attack + decay + 0.05);
  };

  const start = (id: ThemeId): { gain: GainNode; timer: number } => {
    const th = THEMES[id];
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(1, ctx.currentTime + 2);
    gain.connect(out);
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = th.pad.cutoff;
    padFilter.connect(gain);
    const beat = 60 / th.bpm;
    let bar = 0;
    let barStart = ctx.currentTime + 0.1;
    const schedule = (): void => {
      // Keep about one bar scheduled ahead.
      while (barStart < ctx.currentTime + 4 * beat) {
        const i = bar % th.chords.length;
        const chord = th.chords[i]!;
        const barLen = 4 * beat;
        for (const n of chord) note(padFilter, th.pad.type, hz(n), barStart, th.pad.gain, barLen * 0.3, barLen * 0.9);
        note(gain, 'sine', hz(chord[0]! - 12), barStart, th.bass, 0.02, barLen * 0.8);
        th.melody[i % th.melody.length]!.forEach((m, k) => {
          const at = barStart + (k * beat) / 2;
          if (m !== null) note(gain, th.lead.type, hz(chordNote(chord, m) + 12), at, th.lead.gain, 0.01, th.lead.decay);
          if (th.tick) note(gain, 'square', k % 2 ? 3200 : 2400, at, 0.012, 0.001, 0.02);
        });
        barStart += barLen;
        bar++;
      }
    };
    schedule();
    return { gain, timer: window.setInterval(schedule, 200) };
  };

  const stop = (v: { gain: GainNode; timer: number }): void => {
    const t = ctx.currentTime;
    v.gain.gain.cancelScheduledValues(t);
    v.gain.gain.setValueAtTime(v.gain.gain.value, t);
    v.gain.gain.linearRampToValueAtTime(0.0001, t + 2);
    window.setTimeout(() => {
      window.clearInterval(v.timer);
      v.gain.disconnect();
    }, 2200);
  };

  return {
    play(id) {
      if (id === current) return;
      current = id;
      if (voice) stop(voice);
      voice = id ? start(id) : null;
    },
    current: () => current,
  };
}
