/**
 * Document overlay: a plain DOM panel showing `doc.<key>.title` and
 * `doc.<key>.body` from the i18n tables. Task 10 restyles it; the contract
 * (init / openDocument / closeDocument) stays.
 */
import type { I18n } from '../logic/i18n';

export interface DocumentViewDeps {
  i18n: I18n;
  /** Called with true on open and false on close (callers freeze/restore player input). */
  onOpenChange?: (open: boolean) => void;
}

let deps: DocumentViewDeps | null = null;
let root: HTMLDivElement | null = null;
let openKey: string | null = null;
let unsub: (() => void) | null = null;

export function initDocumentView(d: DocumentViewDeps): void {
  deps = d;
}

export function isDocumentOpen(): boolean {
  return openKey !== null;
}

function render(): void {
  if (!deps || !root || openKey === null) return;
  const { i18n } = deps;
  root.dir = i18n.dir();
  root.lang = i18n.locale();
  root.replaceChildren();
  const title = document.createElement('h2');
  title.textContent = i18n.t(`doc.${openKey}.title`);
  const body = document.createElement('p');
  body.textContent = i18n.t(`doc.${openKey}.body`);
  const close = document.createElement('button');
  close.textContent = i18n.t('ui.document.close');
  close.addEventListener('click', closeDocument);
  root.append(title, body, close);
}

const onKey = (e: KeyboardEvent): void => {
  if (e.code === 'Escape') closeDocument();
};

export function openDocument(docKey: string): void {
  if (!deps) throw new Error('document view not initialised');
  if (openKey === null) {
    root = document.createElement('div');
    root.id = 'document-view';
    root.style.cssText =
      'position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
      'background:rgba(10,12,9,0.82);color:#f2efe6;font:20px/1.6 "Noto Sans","Noto Naskh Arabic",sans-serif;' +
      'padding:48px;box-sizing:border-box;white-space:pre-wrap;z-index:20';
    document.body.appendChild(root);
    window.addEventListener('keydown', onKey);
    unsub = deps.i18n.onChange(render);
    deps.onOpenChange?.(true);
  }
  openKey = docKey;
  render();
}

export function closeDocument(): void {
  if (openKey === null) return;
  openKey = null;
  window.removeEventListener('keydown', onKey);
  unsub?.();
  unsub = null;
  root?.remove();
  root = null;
  deps?.onOpenChange?.(false);
}

export const USED_KEYS: readonly string[] = ['ui.document.close'];
