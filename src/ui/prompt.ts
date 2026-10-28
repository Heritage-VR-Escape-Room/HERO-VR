/** Crosshair and interaction prompt (minimal DOM; Task 10 restyles). */
import type { I18n } from '../logic/i18n';

export interface InteractPrompt {
  /** Show the prompt for `promptKey` with the bound key label, or hide it on null. */
  show(promptKey: string | null): void;
}

export function createInteractPrompt(i18n: I18n, keyLabel: () => string): InteractPrompt {
  const cross = document.createElement('div');
  cross.id = 'crosshair';
  cross.style.cssText =
    'position:fixed;left:50%;top:50%;width:4px;height:4px;margin:-2px 0 0 -2px;border-radius:50%;' +
    'background:#f2efe6;opacity:0.7;pointer-events:none;z-index:10';
  const text = document.createElement('div');
  text.id = 'interact-prompt';
  text.style.cssText =
    'position:fixed;left:0;right:0;top:56%;text-align:center;color:#f2efe6;font:18px "Noto Sans","Noto Naskh Arabic",sans-serif;' +
    'text-shadow:0 1px 4px #000;pointer-events:none;z-index:10;display:none';
  document.body.append(cross, text);

  let key: string | null = null;
  const render = (): void => {
    if (key === null) {
      text.style.display = 'none';
      return;
    }
    text.dir = i18n.dir();
    text.textContent = `[${keyLabel()}] ${i18n.t(key)}`;
    text.style.display = 'block';
  };
  i18n.onChange(render);
  return {
    show(k) {
      key = k;
      render();
    },
  };
}

/** "KeyE" -> "E", "Digit1" -> "1"; other codes pass through. */
export function codeLabel(code: string): string {
  return code.replace(/^(Key|Digit)/, '');
}
