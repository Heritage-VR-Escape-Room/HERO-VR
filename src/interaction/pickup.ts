import type { Object3D } from 'three/webgpu';
import type { Inventory } from '../logic/inventory';
import type { Interactable } from './interactor';

export interface PickupOptions {
  id: string;
  itemId: string;
  object: Object3D;
  inventory: Inventory;
  /**
   * Called with the pickup's id after a real pickup. Wire it to
   * `director.markDisabled(id)`; the item itself reaches the story through the
   * director's inventory subscription. For restores, register
   * `director.registerDisableable(id, pickup.markPicked)`.
   */
  onPicked?: (id: string) => void;
  promptKey?: string;
}

export interface Pickup extends Interactable {
  /** Hide it and stop it being interactable, without touching the inventory or callbacks (save restore). */
  markPicked(): void;
}

/** An interactable that moves an item into the inventory and hides its mesh. */
export function createPickup(o: PickupOptions): Pickup {
  let picked = false;
  return {
    markPicked() {
      picked = true;
      o.object.visible = false;
    },
    id: o.id,
    promptKey: o.promptKey ?? 'prompt.pickup',
    object: o.object,
    canInteract: () => !picked,
    interact() {
      if (picked) return;
      picked = true;
      o.inventory.add(o.itemId);
      o.object.visible = false;
      o.onPicked?.(o.id);
    },
  };
}
