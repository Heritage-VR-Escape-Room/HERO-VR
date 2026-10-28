import type { KV } from './storage';

export interface SaveData {
  version: 1;
  checkpointId: string;
  solvedPuzzles: string[];
  inventory: string[];
  firedBeats: string[];
  disabledObjects: string[];
  savedAtUtc: string;
}

export const SAVE_KEY = 'som.save.v1';

const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

function parse(raw: string | null): SaveData | null {
  if (raw === null) return null;
  try {
    const o = JSON.parse(raw) as Record<string, unknown> | null;
    if (!o || typeof o !== 'object' || o.version !== 1) return null;
    if (typeof o.checkpointId !== 'string' || typeof o.savedAtUtc !== 'string') return null;
    if (!isStrArr(o.solvedPuzzles) || !isStrArr(o.inventory) || !isStrArr(o.firedBeats) || !isStrArr(o.disabledObjects)) return null;
    return {
      version: 1,
      checkpointId: o.checkpointId,
      solvedPuzzles: o.solvedPuzzles,
      inventory: o.inventory,
      firedBeats: o.firedBeats,
      disabledObjects: o.disabledObjects,
      savedAtUtc: o.savedAtUtc,
    };
  } catch {
    return null;
  }
}

export function createSaveService(kv: KV) {
  const read = (): SaveData | null => {
    try {
      return parse(kv.get(SAVE_KEY));
    } catch {
      return null;
    }
  };
  return {
    save(d: Omit<SaveData, 'version' | 'savedAtUtc'>): void {
      const full: SaveData = { ...d, version: 1, savedAtUtc: new Date().toISOString() };
      try {
        kv.set(SAVE_KEY, JSON.stringify(full));
      } catch {
        /* storage failure must never break gameplay */
      }
    },
    load: read,
    hasValidSave: () => read() !== null,
    clear(): void {
      try {
        kv.del(SAVE_KEY);
      } catch {
        /* ignore */
      }
    },
  };
}
