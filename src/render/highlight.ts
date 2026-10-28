/**
 * Interactable highlight: a pulsing copper outline (three's OutlineNode).
 * With nothing selected the outline passes are skipped entirely.
 */
import { Color, type Camera, type Node, type Object3D, type Scene } from 'three/webgpu';
import { float, sin, time, uniform } from 'three/tsl';
import { outline } from 'three/addons/tsl/display/OutlineNode.js';

export const HIGHLIGHT_COLOR = '#D98A3D';
export const HIGHLIGHT_PULSE_HZ = 1.2;

export class Highlight {
  private readonly pass: ReturnType<typeof outline>;
  private readonly selected: Object3D[] = [];

  constructor(scene: Scene, camera: Camera) {
    const pulse = sin(time.mul(2 * Math.PI * HIGHLIGHT_PULSE_HZ)).mul(0.5).add(0.5);
    this.pass = outline(scene, camera, {
      selectedObjects: this.selected,
      edgeThickness: float(1.5),
      edgeGlow: pulse,
    });
    const { visibleEdge, hiddenEdge } = this.pass;
    const strength = pulse.mul(2).add(1.5);
    this.node = visibleEdge.add(hiddenEdge.mul(0.25)).mul(uniform(new Color(HIGHLIGHT_COLOR))).mul(strength);
  }

  /** Additive outline colour (linear HDR); the post chain adds it before bloom. */
  readonly node: Node;

  setHighlighted(objects: Object3D[]): void {
    this.selected.length = 0;
    this.selected.push(...objects);
  }

  dispose(): void {
    this.pass.dispose();
  }
}
