/**
 * A modal session (inspect view, document): player input off, held keys
 * dropped, cursor released without the pause flow. Exiting restores input and
 * asks for the pointer lock back (this works when the exit was scripted; if the
 * browser refuses, the next canvas click locks as usual).
 */
import type { PlayerController } from '../player/controller';
import type { PointerLock } from '../player/pointerLock';

export interface ModalSession {
  enter(): void;
  exit(): void;
  isActive(): boolean;
}

export interface ModalDeps {
  pointerLock: Pick<PointerLock, 'setSuppressPause' | 'request'>;
  controller: Pick<PlayerController, 'setInputEnabled'>;
  clearInput: () => void;
}

export function createModalSession(deps: ModalDeps): ModalSession {
  let active = false;
  return {
    enter() {
      if (active) return;
      active = true;
      deps.pointerLock.setSuppressPause(true);
      deps.controller.setInputEnabled(false);
      deps.clearInput();
      if (document.pointerLockElement) document.exitPointerLock();
    },
    exit() {
      if (!active) return;
      active = false;
      deps.controller.setInputEnabled(true);
      deps.pointerLock.setSuppressPause(false);
      deps.pointerLock.request();
    },
    isActive: () => active,
  };
}
