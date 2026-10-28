import type { Object3D } from 'three/webgpu';
import { openDocument as show } from '../ui/documentView';
import type { Interactable } from './interactor';

/** Open the document overlay for `docKey` (text lives under `doc.<docKey>.*`). */
export function openDocument(docKey: string): void {
  show(docKey);
}

/** An interactable that reads a document when used. */
export function createDocumentInteractable(o: { id: string; docKey: string; object: Object3D }): Interactable {
  return {
    id: o.id,
    promptKey: 'prompt.read',
    object: o.object,
    canInteract: () => true,
    interact: () => openDocument(o.docKey),
  };
}
