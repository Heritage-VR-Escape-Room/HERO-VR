/**
 * Plays a sequence of subtitle lines. Lines hold i18n keys; the runner resolves
 * them when shown and again whenever the language changes mid-line. It knows
 * nothing about the DOM: a SubtitleSink draws (or, with subtitles off, hides).
 */
import type { I18n } from '../logic/i18n';
import { durationFor } from '../logic/subtitleTiming';

export interface Line {
  /** i18n key of the speaker's name. */
  speaker: string;
  /** i18n key of the line. */
  text: string;
  /** Seconds on screen; default durationFor(resolved text). */
  duration?: number;
}

export interface ResolvedLine {
  speaker: string;
  text: string;
  dir: 'rtl' | 'ltr';
  lang: string;
}

export interface SubtitleSink {
  show(line: ResolvedLine): void;
  hide(): void;
}

export class DialogueRunner {
  private lines: readonly Line[] = [];
  private index = -1;
  private onDone: (() => void) | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly i18n: I18n,
    private readonly sink: SubtitleSink,
  ) {
    i18n.onChange(() => {
      if (this.isPlaying()) this.sink.show(this.resolve(this.lines[this.index]!));
    });
  }

  /** Start `lines`, interrupting anything already playing (its onDone is dropped). */
  play(lines: readonly Line[], onDone?: () => void): void {
    this.stopTimer();
    this.lines = lines;
    this.onDone = onDone;
    this.index = -1;
    this.next();
  }

  isPlaying(): boolean {
    return this.index >= 0 && this.index < this.lines.length;
  }

  /** Cut the current line short and move on. */
  skip(): void {
    if (this.isPlaying()) this.next();
  }

  private next(): void {
    this.stopTimer();
    this.index++;
    const line = this.lines[this.index];
    if (!line) {
      this.index = -1;
      this.lines = [];
      this.sink.hide();
      const done = this.onDone;
      this.onDone = undefined;
      done?.();
      return;
    }
    const resolved = this.resolve(line);
    this.sink.show(resolved);
    const seconds = line.duration ?? durationFor(resolved.text);
    this.timer = setTimeout(() => this.next(), seconds * 1000);
  }

  private stopTimer(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private resolve(line: Line): ResolvedLine {
    return {
      speaker: this.i18n.t(line.speaker),
      text: this.i18n.t(line.text),
      dir: this.i18n.dir(),
      lang: this.i18n.locale(),
    };
  }
}
