/**
 * Keyboard state keyed by KeyboardEvent.code, read through the player's
 * current bindings (so a rebind takes effect immediately).
 */
import type { ActionName } from '../logic/bindings';
import type { MoveInput } from './controller';

export class KeyboardInput {
  private readonly down = new Set<string>();
  private readonly onDown = (e: Event): void => void this.down.add((e as KeyboardEvent).code);
  private readonly onUp = (e: Event): void => void this.down.delete((e as KeyboardEvent).code);
  private readonly onBlur = (): void => this.clear();

  constructor(
    private readonly target: EventTarget,
    private readonly bindings: () => Readonly<Record<ActionName, string>>,
  ) {
    target.addEventListener('keydown', this.onDown);
    target.addEventListener('keyup', this.onUp);
    target.addEventListener('blur', this.onBlur);
  }

  isDown(action: ActionName): boolean {
    return this.down.has(this.bindings()[action]);
  }

  move(): MoveInput {
    return {
      forward: this.isDown('forward'),
      back: this.isDown('back'),
      left: this.isDown('left'),
      right: this.isDown('right'),
      sprint: this.isDown('sprint'),
      crouch: this.isDown('crouch'),
    };
  }

  clear(): void {
    this.down.clear();
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onDown);
    this.target.removeEventListener('keyup', this.onUp);
    this.target.removeEventListener('blur', this.onBlur);
    this.clear();
  }
}
