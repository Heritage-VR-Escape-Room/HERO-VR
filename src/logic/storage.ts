/** Tiny key-value abstraction over localStorage so logic stays testable. */
export interface KV {
  get(k: string): string | null;
  set(k: string, v: string): void;
  del(k: string): void;
}

/** localStorage wrapper that swallows every exception (private mode, quota, absent). */
export function localKV(): KV {
  let warned = false;
  const warn = (e: unknown) => {
    if (warned) return;
    warned = true;
    console.warn('[storage] localStorage unavailable; changes will not persist', e);
  };
  const ls = (): Storage | undefined => {
    try {
      return (globalThis as { localStorage?: Storage }).localStorage;
    } catch {
      return undefined;
    }
  };
  return {
    get(k) {
      try {
        return ls()?.getItem(k) ?? null;
      } catch {
        return null;
      }
    },
    set(k, v) {
      try {
        const s = ls();
        if (!s) return warn('missing');
        s.setItem(k, v);
      } catch (e) {
        warn(e);
      }
    },
    del(k) {
      try {
        ls()?.removeItem(k);
      } catch {
        /* ignore */
      }
    },
  };
}

export function memoryKV(): KV {
  const m = new Map<string, string>();
  return {
    get: (k) => m.get(k) ?? null,
    set: (k, v) => void m.set(k, v),
    del: (k) => void m.delete(k),
  };
}
