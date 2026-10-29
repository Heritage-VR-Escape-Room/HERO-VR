import * as THREE from 'three';
import type { I18n, Locale } from '../logic/i18n';
import { loadFonts } from './fonts';

export interface DrawTextOptions {
  dir: 'rtl' | 'ltr';
  font: string;
  color: string;
  maxWidth: number;
  lineHeight: number;
  align: 'start' | 'center';
}

/**
 * Word-wrap `text` to `maxWidth` and draw it from the canvas origin (0,0) downwards.
 * Returns the height drawn (lines x lineHeight).
 * `align: 'start'` follows the text direction (right edge for rtl, left edge for ltr).
 * Shaping and bidi are left to the browser via `ctx.direction`.
 */
export function drawText(ctx: CanvasRenderingContext2D, text: string, opts: DrawTextOptions): number {
  ctx.save();
  ctx.direction = opts.dir;
  ctx.font = opts.font;
  ctx.fillStyle = opts.color;
  ctx.textBaseline = 'top';
  if (opts.align === 'center') {
    ctx.textAlign = 'center';
  } else {
    ctx.textAlign = 'start';
  }
  const x = opts.align === 'center' ? opts.maxWidth / 2 : opts.dir === 'rtl' ? opts.maxWidth : 0;

  let y = 0;
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > opts.maxWidth) {
        ctx.fillText(line, x, y);
        y += opts.lineHeight;
        line = word;
      } else {
        line = candidate;
      }
    }
    ctx.fillText(line, x, y);
    y += opts.lineHeight;
  }
  ctx.restore();
  return y;
}

export interface LocalizedCanvasTextureOptions {
  width: number;
  height: number;
  /** Canvas font shorthand, or a function of the active locale. */
  font: string | ((locale: Locale) => string);
  color: string;
  lineHeight: number;
  align: 'start' | 'center';
  background?: string;
  padding?: number;
  /**
   * A line drawn centred above the localized text, always left-to-right
   * (e.g. the plaque's Latin, which stays Latin in every language).
   */
  header?: { key: string; font: string; lineHeight: number; color?: string };
  /** Space between the header and the text (px). */
  headerGap?: number;
  /** Draws under the text after the background (borders, ornaments). */
  decorate?: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
}

/** A THREE.CanvasTexture that draws an i18n key and redraws on every locale change. */
export class LocalizedCanvasTexture {
  readonly canvas: HTMLCanvasElement;
  readonly texture: THREE.CanvasTexture;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly unsubscribe: () => void;
  private fontsReady = false;
  private disposed = false;
  private drawn: Locale | null = null;

  constructor(
    private readonly i18n: I18n,
    private key: string,
    private readonly opts: LocalizedCanvasTextureOptions,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = opts.width;
    this.canvas.height = opts.height;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.ctx = ctx;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.unsubscribe = i18n.onChange(() => this.redraw());
    void loadFonts().then(() => {
      this.fontsReady = true;
      this.redraw();
    });
  }

  /** The locale the texture was last drawn in (null before the fonts have loaded). */
  drawnLocale(): Locale | null {
    return this.drawn;
  }

  setKey(key: string): void {
    this.key = key;
    this.redraw();
  }

  redraw(): void {
    // Drawing before fonts load would bake fallback glyphs into the texture.
    if (!this.fontsReady || this.disposed) return;
    const { width, height, background, padding = 0 } = this.opts;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, width, height);
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
    }
    this.opts.decorate?.(ctx, width, height);
    const locale = this.i18n.locale();
    ctx.save();
    ctx.translate(padding, padding);
    const header = this.opts.header;
    if (header) {
      const used = drawText(ctx, this.i18n.t(header.key), {
        dir: 'ltr',
        font: header.font,
        color: header.color ?? this.opts.color,
        maxWidth: width - padding * 2,
        lineHeight: header.lineHeight,
        align: 'center',
      });
      ctx.translate(0, used + (this.opts.headerGap ?? 0));
    }
    drawText(ctx, this.i18n.t(this.key), {
      dir: this.i18n.dir(),
      font: typeof this.opts.font === 'function' ? this.opts.font(locale) : this.opts.font,
      color: this.opts.color,
      maxWidth: width - padding * 2,
      lineHeight: this.opts.lineHeight,
      align: this.opts.align,
    });
    ctx.restore();
    this.texture.needsUpdate = true;
    this.drawn = locale;
  }

  dispose(): void {
    this.disposed = true;
    this.unsubscribe();
    this.texture.dispose();
  }
}
