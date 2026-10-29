/**
 * HUD: a 4 px crosshair dot, the interact prompt "[E] Inspect" (key from the
 * current binding) and, before the first click locks the pointer, a
 * "click to play" line. Everything hides outside free play (menus, pause,
 * inspect, documents).
 */
import type { I18n } from '../logic/i18n';
import { el, layer, localize } from './dom';

export type HudMode = 'playing' | 'click-to-play' | 'hidden';

export interface Hud {
  /** Show the prompt for `promptKey`, or clear it on null. */
  showPrompt(promptKey: string | null): void;
  /** Cheap to call every frame: the DOM only changes when the mode does. */
  setMode(mode: HudMode): void;
}

export function createHud(i18n: I18n, keyLabel: () => string): Hud {
  const root = layer('hud');
  const cross = el('div', { id: 'crosshair', hidden: true });
  const prompt = el('div', { id: 'interact-prompt', hidden: true });
  const click = el('div', { id: 'click-to-play', hidden: true });
  root.append(cross, prompt, click);
  root.hidden = false;

  let key: string | null = null;
  let mode: HudMode = 'hidden';
  const render = (): void => {
    localize(root, i18n);
    cross.hidden = mode !== 'playing';
    click.hidden = mode !== 'click-to-play';
    click.textContent = i18n.t('ui.hud.click_to_play');
    prompt.hidden = mode !== 'playing' || key === null;
    if (key !== null) prompt.replaceChildren(el('span', { class: 'key', dir: 'ltr' }, `[${keyLabel()}]`), ' ', i18n.t(key));
  };
  i18n.onChange(render);
  render();
  return {
    showPrompt(k) {
      if (k === key) return;
      key = k;
      render();
    },
    setMode(m) {
      if (m === mode) return;
      mode = m;
      render();
    },
  };
}

/** Prompt keys the interactables use (prompt.read: documents, prompt.pickup: pickups). */
export const USED_KEYS: readonly string[] = ['prompt.inspect', 'prompt.pickup', 'prompt.read', 'ui.hud.click_to_play'];
