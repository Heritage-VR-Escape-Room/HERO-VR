/**
 * The card shown when the slice ends: "End of Slice" / "Thank you for playing"
 * and a Main Menu button. The caller releases the pointer lock first (modal).
 */
import type { I18n } from '../logic/i18n';
import { el, layer, localize } from './dom';

export interface EndCard {
  show(): void;
  isOpen(): boolean;
}

export function createEndCard(i18n: I18n, onMainMenu: () => void): EndCard {
  const root = layer('end-card');
  const title = el('h2');
  const thanks = el('p');
  const button = el('button', { class: 'ui-btn primary', id: 'end-main-menu' });
  button.addEventListener('click', onMainMenu);
  root.append(title, thanks, button);
  const render = (): void => {
    localize(root, i18n);
    title.textContent = i18n.t('ui.end.title');
    thanks.textContent = i18n.t('ui.end.thanks');
    button.textContent = i18n.t('ui.common.main_menu');
  };
  i18n.onChange(render);
  render();
  return {
    show() {
      root.hidden = false;
      button.focus({ preventScroll: true });
    },
    isOpen: () => !root.hidden,
  };
}

export const USED_KEYS: readonly string[] = ['ui.end.title', 'ui.end.thanks', 'ui.common.main_menu'];
