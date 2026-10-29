/**
 * Pause menu: Resume, Settings, Main Menu. Resume re-requests the pointer lock
 * from the click (the user gesture browsers require). Chrome refuses a re-lock
 * for about a second after the player leaves it with Esc, so a refused request
 * leaves the menu open with a note to click again. Esc does not resume: the
 * Escape key grants no user activation, so its lock request would be refused.
 */
import type { I18n } from '../logic/i18n';
import { el, layer, localize } from './dom';

export interface PauseMenu {
  open(): void;
  close(): void;
  isOpen(): boolean;
  /** The browser refused the pointer lock: ask for another click. */
  lockRefused(): void;
}

export interface PauseDeps {
  i18n: I18n;
  /** Must run inside the click handler (requests the pointer lock). */
  onResume: () => void;
  onSettings: () => void;
  onMainMenu: () => void;
}

export function createPauseMenu(deps: PauseDeps): PauseMenu {
  const { i18n } = deps;
  const root = layer('pause', 'scrim');
  const title = el('h2');
  const note = el('p', { class: 'pause-note', hidden: true });
  const resume = el('button', { class: 'menu-item', id: 'pause-resume' });
  const settings = el('button', { class: 'menu-item', id: 'pause-settings' });
  const mainMenu = el('button', { class: 'menu-item', id: 'pause-main-menu' });
  root.append(el('div', { class: 'plate', role: 'dialog', 'aria-modal': 'true' }, title, el('nav', { class: 'menu-items' }, resume, settings, mainMenu), note));

  resume.addEventListener('click', () => deps.onResume());
  settings.addEventListener('click', () => deps.onSettings());
  mainMenu.addEventListener('click', () => deps.onMainMenu());

  const render = (): void => {
    localize(root, i18n);
    title.textContent = i18n.t('ui.pause.title');
    resume.textContent = i18n.t('ui.pause.resume');
    settings.textContent = i18n.t('ui.menu.settings');
    mainMenu.textContent = i18n.t('ui.common.main_menu');
    note.textContent = i18n.t('ui.pause.retry');
  };
  i18n.onChange(render);
  render();

  return {
    open() {
      if (!root.hidden) return;
      note.hidden = true;
      root.hidden = false;
      resume.focus({ preventScroll: true });
    },
    close() {
      root.hidden = true;
    },
    isOpen: () => !root.hidden,
    lockRefused() {
      if (!root.hidden) note.hidden = false;
    },
  };
}

export const USED_KEYS: readonly string[] = [
  'ui.pause.title',
  'ui.pause.resume',
  'ui.pause.retry',
  'ui.menu.settings',
  'ui.common.main_menu',
];
