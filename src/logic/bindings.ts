export type ActionName =
  | 'forward' | 'back' | 'left' | 'right' | 'sprint' | 'crouch' | 'interact' | 'hint' | 'pause' | 'skip';

export const DEFAULT_BINDINGS: Readonly<Record<ActionName, string>> = {
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  sprint: 'ShiftLeft',
  crouch: 'KeyC',
  interact: 'KeyE',
  hint: 'KeyH',
  pause: 'Escape',
  skip: 'Space',
};

export const RESERVED_CODES: readonly string[] = ['Escape'];

export type RebindResult =
  | { ok: true; bindings: Record<ActionName, string> }
  | { ok: false; reason: 'reserved' };

/** Rebinds `action` to `code`. A conflict swaps the two actions' codes. Pure: returns a new map. */
export function rebind(b: Record<ActionName, string>, action: ActionName, code: string): RebindResult {
  if (RESERVED_CODES.includes(code)) return { ok: false, reason: 'reserved' };
  const next = { ...b };
  const old = next[action];
  for (const k of Object.keys(next) as ActionName[]) {
    if (k !== action && next[k] === code) next[k] = old;
  }
  next[action] = code;
  return { ok: true, bindings: next };
}
