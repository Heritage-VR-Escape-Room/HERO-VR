/** Pause menu contract. This is a state-only stub; Task 10 builds the real menu. */
export interface PauseMenu {
  open(): void;
  close(): void;
  isOpen(): boolean;
}

export function createPauseStub(): PauseMenu {
  let open = false;
  return {
    open: () => void (open = true),
    close: () => void (open = false),
    isOpen: () => open,
  };
}
