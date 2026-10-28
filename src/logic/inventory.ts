/** The player's carried items: a set of item ids kept in pickup order. */
export interface Inventory {
  items(): readonly string[];
  /** Returns false (and changes nothing) if the item is already present. */
  add(id: string): boolean;
  has(id: string): boolean;
  onAdd(cb: (id: string) => void): () => void;
}

export function createInventory(initial: readonly string[] = []): Inventory {
  const list: string[] = [];
  for (const id of initial) if (!list.includes(id)) list.push(id);
  const listeners = new Set<(id: string) => void>();
  return {
    items: () => list,
    add(id) {
      if (list.includes(id)) return false;
      list.push(id);
      for (const cb of [...listeners]) cb(id);
      return true;
    },
    has: (id) => list.includes(id),
    onAdd(cb) {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
  };
}
