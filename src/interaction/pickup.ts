import type { Object3D } from 'three/webgpu';
import type { Inventory } from '../logic/inventory';
import type { Interactable } from './interactor';

export interface PickupOptions {
  id: string;
  itemId: string;
  object: Object3D;
  inventory: Inventory;
  /** Task 7 wires this to `director.markDisabled(id)`. */
  onPicked?: (id: string) => void;
  promptKey?: string;
}

/** An interactable that moves an item into the inventory and hides its mesh. */
export function createPickup(o: PickupOptions): Interactable {
  let picked = false;
  return {
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
