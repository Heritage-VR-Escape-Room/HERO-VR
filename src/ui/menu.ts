/**
 * Main menu over the orbiting backdrop: Continue (only with a valid save),
 * New Game (asks before wiping a save), Settings, Credits. Also owns the
 * first-launch graphics auto-pick, fed by the backdrop's render loop.
 */
import type { I18n } from '../logic/i18n';
import type { Settings } from '../logic/settings';
import { pickPreset } from '../logic/autoPicker';
import { createBenchmark } from '../logic/fpsMeter';
import { el, layer, localize } from './dom';
import type { SettingsScreen } from './settingsScreen';
import type { CreditsScreen } from './credits';

export interface MainMenuDeps {
  i18n: I18n;
  save: { hasValidSave(): boolean; clear(): void };
  settingsScreen: SettingsScreen;
  credits: CreditsScreen;
  onContinue: () => void;
  onNewGame: () => void;
}

export interface MainMenu {
  show(): void;
  hide(): void;
  isOpen(): boolean;
}

export function createMainMenu(deps: MainMenuDeps): MainMenu {
  const { i18n } = deps;
  const root = layer('menu');
  const title = el('h1', { class: 'menu-title' });
  const cont = el('button', { class: 'menu-item', id: 'menu-continue' });
  const fresh = el('button', { class: 'menu-item', id: 'menu-new' });
  const settings = el('button', { class: 'menu-item', id: 'menu-settings' });
  const credits = el('button', { class: 'menu-item', id: 'menu-credits' });
  root.append(
    el('div', { class: 'menu-column' }, title, el('div', { class: 'menu-rule', 'aria-hidden': 'true' }, el('span')), el('nav', { class: 'menu-items' }, cont, fresh, settings, credits)),
  );

  // New Game over an existing save asks first.
  const confirm = layer('confirm', 'scrim');
  const confirmText = el('p');
  const yes = el('button', { class: 'ui-btn primary', id: 'confirm-yes' });
  const no = el('button', { class: 'ui-btn', id: 'confirm-no' });
  confirm.append(el('div', { class: 'plate', role: 'alertdialog', 'aria-modal': 'true' }, confirmText, el('div', { class: 'plate-actions' }, no, yes)));
  const closeConfirm = (): void => {
    confirm.hidden = true;
    fresh.focus({ preventScroll: true });
  };
  no.addEventListener('click', closeConfirm);
  yes.addEventListener('click', () => {
    confirm.hidden = true;
    deps.save.clear();
    deps.onNewGame();
  });
  window.addEventListener(
    'keydown',
    (e) => {
      if (confirm.hidden || e.code !== 'Escape') return;
      e.stopImmediatePropagation();
      closeConfirm();
    },
    true,
  );

  const backToMenu = (focus: HTMLElement) => (): void => {
    root.hidden = false;
    focus.focus({ preventScroll: true });
  };
  cont.addEventListener('click', () => deps.onContinue());
  fresh.addEventListener('click', () => {
    if (deps.save.hasValidSave()) {
      confirm.hidden = false;
      no.focus({ preventScroll: true });
    } else deps.onNewGame();
  });
  settings.addEventListener('click', () => {
    root.hidden = true;
    deps.settingsScreen.open(backToMenu(settings));
  });
  credits.addEventListener('click', () => {
    root.hidden = true;
    deps.credits.open(backToMenu(credits));
  });

  const render = (): void => {
    localize(root, i18n);
    localize(confirm, i18n);
    title.textContent = i18n.t('ui.menu.title');
    cont.textContent = i18n.t('ui.menu.continue');
    fresh.textContent = i18n.t('ui.menu.new');
    settings.textContent = i18n.t('ui.menu.settings');
    credits.textContent = i18n.t('ui.menu.credits');
    confirmText.textContent = i18n.t('ui.menu.confirm_new');
    yes.textContent = i18n.t('ui.menu.confirm_yes');
    no.textContent = i18n.t('ui.common.cancel');
  };
  i18n.onChange(render);
  render();

  return {
    show() {
      cont.hidden = !deps.save.hasValidSave();
      root.hidden = false;
      (cont.hidden ? fresh : cont).focus({ preventScroll: true });
    },
    hide() {
      root.hidden = true;
      confirm.hidden = true;
    },
    isOpen: () => !root.hidden || deps.settingsScreen.isOpen() || deps.credits.isOpen(),
  };
}

export const AUTO_PICK = { warmupMs: 1000, measureMs: 10_000 } as const;

export interface AutoPick {
  /** True while measuring: the backdrop renders uncapped so the measure isn't the cap. */
  running(): boolean;
  /** Feed every rendered frame time (ms). */
  tick(t: number): void;
}

/**
 * First launch (`!presetAutoPicked`): average the fps over 10 s on the menu
 * backdrop, apply pickPreset, set the flag. If the player picks graphics
 * themselves meanwhile, their choice stands and the flag is set.
 */
export function createAutoPick(settings: {
  get(): Settings;
  update(patch: Partial<Settings>): void;
  onChange(cb: (s: Settings) => void): () => void;
}): AutoPick {
  const bench = createBenchmark(AUTO_PICK);
  if (settings.get().presetAutoPicked) bench.cancel();
  const graphicsOf = (s: Settings): string => JSON.stringify([s.preset, s.custom]);
  const startGraphics = graphicsOf(settings.get());
  const unsub = settings.onChange((s) => {
    if (bench.done() || graphicsOf(s) === startGraphics) return;
    bench.cancel();
    unsub();
    settings.update({ presetAutoPicked: true });
  });
  return {
    running: () => !bench.done(),
    tick(t) {
      const avg = bench.tick(t);
      if (avg === null) return;
      unsub();
      const s = settings.get();
      const preset = pickPreset(avg, s.preset);
      console.info(`[auto-pick] ${avg.toFixed(1)} fps -> ${preset}`);
      settings.update({ preset, presetAutoPicked: true });
    },
  };
}

export const USED_KEYS: readonly string[] = [
  'ui.menu.title',
  'ui.menu.continue',
  'ui.menu.new',
  'ui.menu.settings',
  'ui.menu.credits',
  'ui.menu.confirm_new',
  'ui.menu.confirm_yes',
  'ui.common.cancel',
];
