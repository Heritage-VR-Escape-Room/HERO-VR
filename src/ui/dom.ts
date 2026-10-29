/** Tiny DOM helpers shared by the UI screens. */
import type { I18n } from '../logic/i18n';

type Attrs = Record<string, string | boolean | undefined>;

/** Create an element with attributes (true = present, false/undefined = absent) and children. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') e.className = String(v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  e.append(...children);
  return e;
}

/** A full-screen UI layer appended to <body>, hidden until shown. */
export function layer(id: string, extraClass = ''): HTMLDivElement {
  const d = el('div', { id, class: `ui-layer ${extraClass}`.trim(), hidden: true });
  document.body.appendChild(d);
  return d;
}

/** Keep a layer's lang/dir in step with the current locale (the html element carries them too). */
export function localize(node: HTMLElement, i18n: I18n): void {
  node.lang = i18n.locale();
  node.dir = i18n.dir();
}

const NAMED: Record<string, string> = {
  Escape: 'Esc',
  Space: 'Space',
  ShiftLeft: 'Shift',
  ShiftRight: 'R-Shift',
  ControlLeft: 'Ctrl',
  ControlRight: 'R-Ctrl',
  AltLeft: 'Alt',
  AltRight: 'R-Alt',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Enter: 'Enter',
  Tab: 'Tab',
  Backspace: 'Backspace',
};

/** Human label for a KeyboardEvent.code: "KeyE" -> "E", "Digit1" -> "1", "ShiftLeft" -> "Shift". */
export function codeLabel(code: string): string {
  return NAMED[code] ?? code.replace(/^(Key|Digit)/, '').replace(/^Numpad/, 'Num ');
}
