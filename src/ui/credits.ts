/**
 * Credits screen: every third-party asset, read from /credits.json (generated
 * from ASSET_CREDITS.md). Entries stay in their source language; the frame
 * and labels are localized.
 */
import type { I18n } from '../logic/i18n';
import { el, layer, localize } from './dom';

export interface CreditEntry {
  asset: string;
  author: string;
  license: string;
  source: string;
}

export interface CreditsFile {
  entries: CreditEntry[];
  notes: string[];
}

export interface CreditsScreen {
  open(onClose?: () => void): void;
  close(): void;
  isOpen(): boolean;
}

export async function fetchCredits(url = `${import.meta.env.BASE_URL}credits.json`): Promise<CreditsFile> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`credits: HTTP ${res.status}`);
  return (await res.json()) as CreditsFile;
}

export function createCredits(i18n: I18n, load: () => Promise<CreditsFile> = () => fetchCredits()): CreditsScreen {
  const root = layer('credits', 'scrim');
  const title = el('h2');
  const list = el('ul', { class: 'credits-list' });
  const notes = el('div', { class: 'credits-notes', lang: 'en', dir: 'ltr' });
  const back = el('button', { class: 'ui-btn', id: 'credits-back' });
  root.append(el('div', { class: 'plate', role: 'dialog', 'aria-modal': 'true' }, title, list, notes, el('div', { class: 'plate-actions' }, back)));

  let data: CreditsFile | null = null;
  let failed = false;
  let onClose: (() => void) | undefined;

  const render = (): void => {
    localize(root, i18n);
    title.textContent = i18n.t('ui.menu.credits');
    back.textContent = i18n.t('ui.common.back');
    if (failed) {
      list.replaceChildren(el('li', {}, i18n.t('ui.credits.error')));
      notes.replaceChildren();
      return;
    }
    if (!data) return;
    list.replaceChildren(
      ...data.entries.map((c) =>
        el(
          'li',
          { lang: 'en', dir: 'ltr' },
          el('div', { class: 'credits-asset' }, c.asset),
          el('div', { class: 'credits-meta' }, c.author),
          el('div', { class: 'credits-meta' }, c.license),
          el('div', { class: 'credits-meta' }, c.source),
        ),
      ),
    );
    notes.replaceChildren(...data.notes.map((n) => el('p', {}, n)));
  };

  const close = (): void => {
    if (root.hidden) return;
    root.hidden = true;
    const cb = onClose;
    onClose = undefined;
    cb?.();
  };
  back.addEventListener('click', close);
  window.addEventListener(
    'keydown',
    (e) => {
      if (root.hidden || e.code !== 'Escape') return;
      e.stopImmediatePropagation();
      close();
    },
    true,
  );
  i18n.onChange(render);

  return {
    open(cb) {
      onClose = cb;
      root.hidden = false;
      render();
      back.focus({ preventScroll: true });
      if (!data && !failed)
        load()
          .then((d) => (data = d))
          .catch((e: unknown) => {
            console.warn('[credits]', e);
            failed = true;
          })
          .finally(render);
    },
    close,
    isOpen: () => !root.hidden,
  };
}

export const USED_KEYS: readonly string[] = ['ui.menu.credits', 'ui.common.back', 'ui.credits.error'];
