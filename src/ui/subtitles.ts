/**
 * Subtitle panel: speaker name plus line, plain DOM inside #ui (Task 10
 * restyles). Logical CSS properties only, so RTL needs nothing extra. The
 * panel follows the subtitles on/off and size settings live.
 */
import type { Settings } from '../logic/settings';
import type { ResolvedLine, SubtitleSink } from '../dialogue/runner';

export const SUBTITLE_SIZES_PX: Record<Settings['subtitleSize'], number> = { S: 22, M: 28, L: 36 };

export interface SubtitleSettings {
  get(): Pick<Settings, 'subtitles' | 'subtitleSize'>;
  onChange(cb: () => void): () => void;
}

/** The shared HUD layer for DOM UI; created on first use. */
export function uiRoot(): HTMLElement {
  let root = document.getElementById('ui');
  if (!root) {
    root = document.createElement('div');
    root.id = 'ui';
    root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:15';
    document.body.appendChild(root);
  }
  return root;
}

export function createSubtitles(settings: SubtitleSettings): SubtitleSink {
  const panel = document.createElement('div');
  panel.id = 'subtitle';
  panel.style.cssText =
    'position:absolute;inset-inline:0;inset-block-end:9vh;margin-inline:auto;inline-size:fit-content;max-inline-size:min(70ch,80vw);' +
    'padding-block:0.45em;padding-inline:0.9em;border-radius:6px;background:rgba(18,16,14,0.82);color:#f2efe6;' +
    'font-family:"Noto Sans","Noto Naskh Arabic",sans-serif;line-height:1.4;text-align:center;display:none';
  const speaker = document.createElement('div');
  speaker.id = 'subtitle-speaker';
  speaker.style.cssText = 'font-size:0.72em;font-weight:700;letter-spacing:0.04em;color:#d9b36c;margin-block-end:0.15em';
  const text = document.createElement('div');
  text.id = 'subtitle-text';
  panel.append(speaker, text);
  uiRoot().appendChild(panel);

  let current: ResolvedLine | null = null;
  const render = (): void => {
    const s = settings.get();
    panel.style.fontSize = `${SUBTITLE_SIZES_PX[s.subtitleSize]}px`;
    if (!current) {
      panel.style.display = 'none';
      return;
    }
    panel.dir = current.dir;
    panel.lang = current.lang;
    speaker.textContent = current.speaker;
    text.textContent = current.text;
    panel.style.display = s.subtitles ? 'block' : 'none';
  };
  settings.onChange(render);
  render();

  return {
    show(line) {
      current = line;
      render();
    },
    hide() {
      current = null;
      render();
    },
  };
}
