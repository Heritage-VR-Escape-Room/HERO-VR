/**
 * The Travel Journal page (J): the part's goal, its tasks with check marks,
 * the notes found so far and a sketch of the pyramid. A small toast says
 * when it changed.
 */
import type { I18n } from '../logic/i18n';
import type { Journal } from '../logic/journal';
import { el, layer } from './dom';

export interface JournalView {
  open(): void;
  close(): void;
  toggle(): void;
  isOpen(): boolean;
  /** Re-read the journal; toasts when a task or note was added. */
  refresh(): void;
}

const SKETCH = `<svg viewBox="0 0 200 150" aria-hidden="true" class="journal-sketch">
  <g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">
    <path d="M30 128 L170 128 L170 112 L30 112 Z"/>
    <path d="M40 112 L100 22 L160 112"/>
    <path d="M100 22 L118 112" opacity=".55"/>
    <path d="M92 128 L92 116 L108 116 L108 128"/>
    <path d="M86 76 L114 76 L114 92 L86 92 Z" opacity=".8"/>
    <path d="M18 134 Q100 140 182 134" opacity=".4"/>
  </g>
  <text x="100" y="146" text-anchor="middle" font-size="10" fill="currentColor" font-style="italic">Pyramide, Marktplatz · 1823</text>
</svg>`;

export function createJournalView(o: { i18n: I18n; journal: () => Journal; onOpenChange: (open: boolean) => void }): JournalView {
  const root = layer('journal');
  const page = el('div', { class: 'journal-page' });
  root.append(page);
  const toast = el('div', { id: 'journal-toast', hidden: true });
  document.body.append(toast);
  let last = '';
  let toastTimer = 0;

  const render = (): void => {
    const { i18n } = o;
    const j = o.journal();
    root.lang = i18n.locale();
    root.dir = i18n.dir();
    toast.dir = i18n.dir();
    page.replaceChildren(
      el('h1', { class: 'journal-title' }, i18n.t('ui.journal.title')),
      el('p', { class: 'journal-part' }, i18n.t(j.partKey)),
      el('h2', {}, i18n.t('ui.journal.goal')),
      el('p', { class: 'journal-goal' }, i18n.t(j.goalKey)),
      el('h2', {}, i18n.t('ui.journal.tasks')),
      el('ul', { class: 'journal-tasks' }, ...j.tasks.map((t) => el('li', { class: t.done ? 'done' : '' }, i18n.t(t.key)))),
      el('h2', {}, i18n.t('ui.journal.notes')),
      el('div', { class: 'journal-notes' }, ...j.notes.map((n) => el('p', {}, i18n.t(n)))),
      el('p', { class: 'journal-hint' }, i18n.t('ui.journal.hint')),
    );
    const sketch = document.createElement('div');
    sketch.innerHTML = SKETCH;
    page.querySelector('.journal-notes')!.prepend(sketch.firstElementChild!);
  };

  o.i18n.onChange(() => !root.hidden && render());

  const view: JournalView = {
    open() {
      if (!root.hidden) return;
      render();
      root.hidden = false;
      toast.hidden = true;
      o.onOpenChange(true);
    },
    close() {
      if (root.hidden) return;
      root.hidden = true;
      o.onOpenChange(false);
    },
    toggle: () => (root.hidden ? view.open() : view.close()),
    isOpen: () => !root.hidden,
    refresh() {
      const j = o.journal();
      const sig = JSON.stringify([j.tasks, j.notes]);
      if (sig === last) return;
      const first = last === '';
      last = sig;
      if (!root.hidden) render();
      if (first) return;
      toast.textContent = o.i18n.t('ui.journal.updated');
      toast.hidden = false;
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => (toast.hidden = true), 3500);
    },
  };
  return view;
}
