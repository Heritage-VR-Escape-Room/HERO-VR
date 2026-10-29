/**
 * Subtitle panel: speaker name plus line inside #ui, styled by styles.css
 * (logical properties only, so RTL needs nothing extra). The panel follows the
 * subtitles on/off and size settings live.
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
  panel.style.display = 'none';
  const speaker = document.createElement('div');
  speaker.id = 'subtitle-speaker';
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
