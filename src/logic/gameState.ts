/** Top-level game state. The real menus arrive in Task 10. */
export type GameState = 'menu' | 'playing' | 'paused';

export interface GameStateStore {
  get(): GameState;
  set(s: GameState): void;
  onChange(cb: (s: GameState) => void): () => void;
}

export function createGameState(initial: GameState = 'menu'): GameStateStore {
  let current = initial;
  const listeners = new Set<(s: GameState) => void>();
  return {
    get: () => current,
    set(s) {
      if (s === current) return;
      current = s;
      for (const cb of [...listeners]) cb(s);
    },
    onChange(cb) {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
  };
}
