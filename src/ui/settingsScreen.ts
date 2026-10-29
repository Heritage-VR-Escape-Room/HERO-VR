/**
 * Settings screen: Language, Controls, Graphics, Audio and Subtitles tabs.
 * Every control writes through settings.update(); the game applies changes
 * live from settings.onChange (graphics rebuilds only what an option affects).
 */
import type { Backend } from '../render/renderer';
import type { I18n, Locale } from '../logic/i18n';
import type { Settings } from '../logic/settings';
import { rebind, type ActionName } from '../logic/bindings';
import { GRAPHICS_PRESETS, type GraphicsOptions } from '../logic/presets';
import { el, layer, localize, codeLabel } from './dom';

export interface SettingsStore {
  get(): Settings;
  update(patch: Partial<Settings>): void;
  onChange(cb: (s: Settings) => void): () => void;
  effectiveGraphics(): GraphicsOptions;
}

export interface SettingsScreen {
  /** Show the screen; `onClose` runs when the player leaves it (Back or Esc). */
  open(onClose?: () => void): void;
  close(): void;
  isOpen(): boolean;
}

export type SettingsTab = 'language' | 'controls' | 'graphics' | 'audio' | 'subtitles';
const TABS: readonly SettingsTab[] = ['language', 'controls', 'graphics', 'audio', 'subtitles'];

/** Each language's name in its own script. */
const LANGUAGES: ReadonlyArray<readonly [Locale, string]> = [
  ['en', 'English'],
  ['ar', 'العربية'],
  ['de', 'Deutsch'],
];

const ACTIONS: readonly ActionName[] = ['forward', 'back', 'left', 'right', 'sprint', 'crouch', 'interact', 'hint', 'skip', 'pause'];
/** Pause stays on Esc: the browser releases the pointer lock on Esc whatever the binding. */
const FIXED_ACTIONS: readonly ActionName[] = ['pause'];

export const SENSITIVITY = { min: 0.2, max: 3, step: 0.05 } as const;

type Option<T> = readonly [value: T, label: () => string];

export function createSettingsScreen(deps: { i18n: I18n; settings: SettingsStore; backend: Backend }): SettingsScreen {
  const { i18n, settings, backend } = deps;
  const t = (k: string, v?: Record<string, string | number>): string => i18n.t(k, v);

  const root = layer('settings', 'scrim');
  const title = el('h2');
  const tabs = el('div', { class: 'tabs', role: 'tablist' });
  const body = el('div', { class: 'tab-body', role: 'tabpanel' });
  const back = el('button', { class: 'ui-btn', id: 'settings-back' });
  root.append(el('div', { class: 'plate', role: 'dialog', 'aria-modal': 'true' }, title, tabs, body, el('div', { class: 'plate-actions' }, back)));

  let tab: SettingsTab = 'language';
  let onClose: (() => void) | undefined;
  /** Action waiting for a key press, if any. */
  let listening: ActionName | null = null;
  /** The last rebind outcome, kept as a key so it re-translates. */
  let message: { key: string; vars: () => Record<string, string> } | null = null;
  /** Set while a slider is being dragged, so the update it causes doesn't rebuild the slider. */
  let fromSlider = false;

  back.addEventListener('click', () => close());

  // ---- small builders ----------------------------------------------------
  const row = (label: string, control: Node, note?: string): HTMLElement =>
    el('div', { class: 'row' }, el('span', { class: 'row-label' }, label), control, ...(note ? [el('span', { class: 'row-note' }, note)] : []));

  function segmented<T extends string | number | boolean>(
    field: string,
    options: readonly Option<T>[],
    current: T | null,
    pick: (v: T) => void,
    opts: { disabled?: boolean } = {},
  ): HTMLElement {
    const wrap = el('div', { class: 'seg', role: 'group' });
    for (const [value, label] of options) {
      const b = el('button', {
        'data-field': field,
        'data-value': String(value),
        'aria-pressed': String(value === current),
        disabled: opts.disabled,
      }, label());
      b.addEventListener('click', () => pick(value));
      wrap.append(b);
    }
    return wrap;
  }

  function slider(field: string, value: number, range: { min: number; max: number; step: number }, format: (v: number) => string, set: (v: number) => void): HTMLElement {
    const input = el('input', {
      type: 'range',
      'data-field': field,
      min: String(range.min),
      max: String(range.max),
      step: String(range.step),
      value: String(value),
    });
    const out = el('output', {}, format(value));
    input.addEventListener('input', () => {
      const v = Number(input.value);
      out.textContent = format(v);
      fromSlider = true;
      try {
        set(v);
      } finally {
        fromSlider = false;
      }
    });
    return el('div', { class: 'slider' }, input, out);
  }

  const onOff: readonly Option<boolean>[] = [
    [false, () => t('ui.common.off')],
    [true, () => t('ui.common.on')],
  ];
  const pct = (v: number): string => `${Math.round(v * 100)}%`;

  /** Changing any single graphics field turns the preset into a custom set. */
  const setGraphics = (patch: Partial<GraphicsOptions>): void =>
    settings.update({ custom: { ...settings.effectiveGraphics(), ...patch } });

  // ---- tabs --------------------------------------------------------------
  function languageTab(s: Settings): Node[] {
    const wrap = el('div', { class: 'seg lang', role: 'group' });
    for (const [l, name] of LANGUAGES) {
      const b = el('button', { 'data-locale': l, lang: l, dir: l === 'ar' ? 'rtl' : 'ltr', 'aria-pressed': String(s.locale === l) }, name);
      b.addEventListener('click', () => settings.update({ locale: l }));
      wrap.append(b);
    }
    return [row(t('ui.settings.language'), wrap)];
  }

  function controlsTab(s: Settings): Node[] {
    const rows: Node[] = [el('p', { id: 'rebind-msg', 'aria-live': 'polite' }, message ? t(message.key, message.vars()) : t('ui.settings.rebind_hint'))];
    for (const a of ACTIONS) {
      const fixed = FIXED_ACTIONS.includes(a);
      const cap = el(
        'button',
        { class: `keycap${listening === a ? ' listening' : ''}`, 'data-rebind': a, disabled: fixed, dir: 'ltr' },
        listening === a ? t('ui.settings.press_key') : codeLabel(s.bindings[a]),
      );
      cap.addEventListener('click', () => {
        listening = listening === a ? null : a;
        render();
      });
      rows.push(row(t(`ui.action.${a}`), cap));
    }
    rows.push(
      row(t('ui.settings.sensitivity'), slider('mouseSensitivity', s.mouseSensitivity, SENSITIVITY, (v) => v.toFixed(2), (v) => settings.update({ mouseSensitivity: v }))),
      row(t('ui.settings.invert_y'), segmented('invertY', onOff, s.invertY, (v) => settings.update({ invertY: v }))),
      row(t('ui.settings.head_bob'), segmented('headBob', onOff, s.headBob, (v) => settings.update({ headBob: v }))),
    );
    return rows;
  }

  function graphicsTab(s: Settings): Node[] {
    const g = settings.effectiveGraphics();
    const q = (k: string) => () => t(`ui.quality.${k}`);
    const presets: Option<string>[] = GRAPHICS_PRESETS.map((p) => [p, q(p.toLowerCase())] as const);
    presets.push(['Custom', () => t('ui.settings.custom')]);
    const presetSeg = segmented('preset', presets, s.custom ? 'Custom' : s.preset, (v) => {
      if (v !== 'Custom') settings.update({ preset: v as Settings['preset'], custom: null });
    });
    presetSeg.querySelector<HTMLButtonElement>('[data-value="Custom"]')!.disabled = true;
    const webgl2 = backend === 'webgl2';
    return [
      row(t('ui.settings.preset'), presetSeg),
      row(
        t('ui.settings.render_scale'),
        segmented('renderScale', ([0.5, 0.67, 0.85, 1] as const).map((v) => [v, () => pct(v)] as const), g.renderScale, (v) => setGraphics({ renderScale: v })),
      ),
      row(
        t('ui.settings.shadows'),
        segmented('shadows', (['Off', 'Low', 'Medium', 'High'] as const).map((v) => [v, q(v.toLowerCase())] as const), g.shadows, (v) => setGraphics({ shadows: v })),
      ),
      row(
        t('ui.settings.fog'),
        segmented('fog', (['Low', 'Medium', 'High', 'Ultra'] as const).map((v) => [v, q(v.toLowerCase())] as const), webgl2 ? null : g.fog, (v) => setGraphics({ fog: v }), { disabled: webgl2 }),
        webgl2 ? t('ui.settings.fog_webgl2') : undefined,
      ),
      row(t('ui.settings.ssao'), segmented('ssao', onOff, g.ssao, (v) => setGraphics({ ssao: v }))),
      row(
        t('ui.settings.aa'),
        segmented('aa', (['Off', 'FXAA', 'SMAA', 'TAA'] as const).map((v) => [v, v === 'Off' ? () => t('ui.common.off') : () => v] as const), g.aa, (v) => setGraphics({ aa: v })),
      ),
      row(t('ui.settings.motion_blur'), segmented('motionBlur', onOff, g.motionBlur, (v) => setGraphics({ motionBlur: v }))),
      row(
        t('ui.settings.frame_cap'),
        segmented('frameCap', [[30, () => '30'], [60, () => '60'], [0, () => t('ui.settings.unlimited')]] as const, g.frameCap, (v) => setGraphics({ frameCap: v })),
      ),
    ];
  }

  function audioTab(s: Settings): Node[] {
    return (['master', 'music', 'sfx', 'ambience'] as const).map((k) =>
      row(
        t(`ui.settings.volume.${k}`),
        slider(`volumes.${k}`, s.volumes[k], { min: 0, max: 1, step: 0.01 }, pct, (v) => settings.update({ volumes: { ...settings.get().volumes, [k]: v } })),
      ),
    );
  }

  function subtitlesTab(s: Settings): Node[] {
    return [
      row(t('ui.settings.subtitles'), segmented('subtitles', onOff, s.subtitles, (v) => settings.update({ subtitles: v }))),
      row(
        t('ui.settings.subtitle_size'),
        segmented('subtitleSize', (['S', 'M', 'L'] as const).map((v) => [v, () => t(`ui.size.${v.toLowerCase()}`)] as const), s.subtitleSize, (v) => settings.update({ subtitleSize: v })),
      ),
    ];
  }

  const BUILDERS: Record<SettingsTab, (s: Settings) => Node[]> = {
    language: languageTab,
    controls: controlsTab,
    graphics: graphicsTab,
    audio: audioTab,
    subtitles: subtitlesTab,
  };

  function render(): void {
    localize(root, i18n);
    title.textContent = t('ui.settings.title');
    back.textContent = t('ui.common.back');
    tabs.replaceChildren(
      ...TABS.map((id) => {
        const b = el('button', { class: 'tab', role: 'tab', 'data-tab': id, 'aria-selected': String(id === tab) }, t(`ui.settings.tab.${id}`));
        b.addEventListener('click', () => {
          tab = id;
          listening = null;
          message = null;
          render();
        });
        return b;
      }),
    );
    const scroll = body.scrollTop;
    body.replaceChildren(...BUILDERS[tab](settings.get()));
    body.scrollTop = scroll;
  }

  // ---- keyboard: rebinding and Esc ----------------------------------------
  const onKey = (e: KeyboardEvent): void => {
    if (root.hidden) return;
    if (listening) {
      e.preventDefault();
      e.stopImmediatePropagation();
      const action = listening;
      const before = settings.get().bindings;
      const r = rebind(before, action, e.code);
      listening = null;
      if (!r.ok) {
        const code = e.code;
        message = { key: 'ui.settings.reserved', vars: () => ({ key: codeLabel(code) }) };
        render();
        return;
      }
      const swapped = ACTIONS.find((a) => a !== action && r.bindings[a] !== before[a]);
      message = swapped ? { key: 'ui.settings.swapped', vars: () => ({ action: t(`ui.action.${swapped}`) }) } : null;
      settings.update({ bindings: r.bindings }); // re-renders through onChange
      render();
      return;
    }
    if (e.code === 'Escape') {
      e.stopImmediatePropagation();
      close();
    }
  };
  window.addEventListener('keydown', onKey, true);

  settings.onChange(() => {
    if (!root.hidden && !fromSlider) render();
  });
  i18n.onChange(() => {
    if (!root.hidden) render();
  });

  function close(): void {
    if (root.hidden) return;
    root.hidden = true;
    listening = null;
    message = null;
    const cb = onClose;
    onClose = undefined;
    cb?.();
  }

  return {
    open(cb) {
      onClose = cb;
      root.hidden = false;
      render();
      tabs.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus({ preventScroll: true });
    },
    close,
    isOpen: () => !root.hidden,
  };
}

export const USED_KEYS: readonly string[] = [
  'ui.settings.title',
  'ui.common.back',
  'ui.common.on',
  'ui.common.off',
  ...TABS.map((id) => `ui.settings.tab.${id}`),
  'ui.settings.language',
  'ui.settings.rebind_hint',
  'ui.settings.press_key',
  'ui.settings.reserved',
  'ui.settings.swapped',
  ...ACTIONS.map((a) => `ui.action.${a}`),
  'ui.settings.sensitivity',
  'ui.settings.invert_y',
  'ui.settings.head_bob',
  'ui.settings.preset',
  'ui.settings.custom',
  'ui.quality.off',
  'ui.quality.low',
  'ui.quality.medium',
  'ui.quality.high',
  'ui.quality.ultra',
  'ui.settings.render_scale',
  'ui.settings.shadows',
  'ui.settings.fog',
  'ui.settings.fog_webgl2',
  'ui.settings.ssao',
  'ui.settings.aa',
  'ui.settings.motion_blur',
  'ui.settings.frame_cap',
  'ui.settings.unlimited',
  'ui.settings.volume.master',
  'ui.settings.volume.music',
  'ui.settings.volume.sfx',
  'ui.settings.volume.ambience',
  'ui.settings.subtitles',
  'ui.settings.subtitle_size',
  'ui.size.s',
  'ui.size.m',
  'ui.size.l',
];
