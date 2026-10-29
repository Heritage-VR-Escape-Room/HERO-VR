/**
 * Pointer lock: a click on the canvas (the user gesture browsers require)
 * requests the lock; mouse deltas drive the look only while locked. Losing
 * the lock mid-play (Escape, alt-tab, exitPointerLock) opens the pause menu
 * and freezes player input.
 */
import type { GameStateStore } from '../logic/gameState';
import type { PauseMenu } from '../ui/pause';
import type { PlayerController } from './controller';

export interface PointerLockDeps {
  canvas: HTMLCanvasElement;
  state: GameStateStore;
  pause: PauseMenu;
  controller: Pick<PlayerController, 'setInputEnabled' | 'look'>;
  /** Drop held keys so nothing stays "pressed" across a pause. */
  clearInput: () => void;
}

export class PointerLock {
  /** While true (inspect view, documents) losing the lock does not open the pause menu, and clicks do not relock. */
  private suppressPause = false;
  private readonly onClick = (): void => {
    if (!this.suppressPause) this.request();
  };
  private readonly onChange = (): void => this.sync();
  private readonly onError = (): void => {
    console.warn('[pointer-lock] request refused');
    this.deps.pause.lockRefused();
  };
  private readonly onMove = (e: MouseEvent): void => {
    if (this.isLocked()) this.deps.controller.look(e.movementX, e.movementY);
  };

  constructor(private readonly deps: PointerLockDeps) {
    deps.canvas.addEventListener('click', this.onClick);
    document.addEventListener('pointerlockchange', this.onChange);
    document.addEventListener('pointerlockerror', this.onError);
    document.addEventListener('mousemove', this.onMove);
  }

  setSuppressPause(on: boolean): void {
    this.suppressPause = on;
  }

  isLocked(): boolean {
    return document.pointerLockElement === this.deps.canvas;
  }

  /** Must run inside a user gesture (the canvas click, the pause menu's Resume). */
  request(): void {
    if (this.isLocked()) return;
    // Chrome returns a promise that rejects if the request is refused (e.g. too soon after an exit).
    const p = this.deps.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
    p?.catch?.(() => this.onError());
  }

  dispose(): void {
    this.deps.canvas.removeEventListener('click', this.onClick);
    document.removeEventListener('pointerlockchange', this.onChange);
    document.removeEventListener('pointerlockerror', this.onError);
    document.removeEventListener('mousemove', this.onMove);
  }

  private sync(): void {
    const { state, pause, controller, clearInput } = this.deps;
    if (this.isLocked()) {
      pause.close();
      state.set('playing');
      controller.setInputEnabled(true);
    } else if (state.get() === 'playing' && !this.suppressPause) {
      pause.open();
      controller.setInputEnabled(false);
      clearInput();
      state.set('paused');
    }
  }
}
