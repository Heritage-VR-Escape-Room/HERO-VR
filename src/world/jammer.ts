/**
 * The Vanguard signal jammer in the pyramid alcove (spec §7 beat 8): a steel
 * box with a red emissive lens, a hum loop and aerosol puffing from its vent.
 * Its red light also leaks through the door seam as the faint indicator at the
 * pyramid's base (beat 3). Shutting it down kills the light, the hum and the
 * vent, and nothing else: the fog never changes (owner decision).
 *
 * Sound goes out through `onSound` until the audio system (Task 15) exists.
 */
import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  MathUtils,
  Mesh,
  MeshStandardNodeMaterial,
  PointLight,
  Sprite,
  SpriteNodeMaterial,
  type Object3D,
} from 'three/webgpu';
import { float, uniform, uv, vec2 } from 'three/tsl';
import type { Interactable } from '../interaction/interactor';
import { darkSteel } from './plazaMaterials';

export const JAMMER_ID = 'jammer';
export const JAMMER_RED = '#ff2a12';
/** Indicator light power: faint, but enough to halo in the fog. */
const INDICATOR_POWER = 3;
const LENS_EMISSIVE = 6;
const PUFFS = 14;
const PUFF_LIFE_SEC = 3.2;

export type JammerSound = 'jammer_hum_start' | 'jammer_hum_stop';

export interface JammerState {
  light: boolean;
  hum: boolean;
  vent: boolean;
}

export interface Jammer {
  root: Group;
  /** The red light leaking at the pyramid base; the caller positions it at the door seam. */
  indicator: PointLight;
  interactable: Interactable;
  state(): JammerState;
  /** Shut it down. `silent` skips the sound cue (save restore). */
  disable(silent?: boolean): void;
  update(dt: number): void;
}

export function createJammer(opts: { onDisabled: () => void; onSound?: (s: JammerSound) => void }): Jammer {
  const root = new Group();
  root.name = 'jammer';
  const steel = darkSteel('JammerSteel');
  const box = new Mesh(new BoxGeometry(0.42, 0.26, 0.3), steel);
  box.position.y = 0.13;
  box.castShadow = box.receiveShadow = true;
  root.add(box);
  // Cooling fins on top, an antenna stub and a vent grille on the front.
  for (let i = 0; i < 5; i++) {
    const fin = new Mesh(new BoxGeometry(0.36, 0.03, 0.012), steel);
    fin.position.set(0, 0.275, -0.11 + i * 0.055);
    root.add(fin);
  }
  const antenna = new Mesh(new CylinderGeometry(0.006, 0.01, 0.3, 8), steel);
  antenna.position.set(0.16, 0.42, -0.08);
  root.add(antenna);
  const grille = new Mesh(new BoxGeometry(0.16, 0.1, 0.01), new MeshStandardNodeMaterial({ color: '#0d0e0f', roughness: 0.8 }));
  grille.position.set(-0.08, 0.14, 0.152);
  root.add(grille);

  const lensMat = new MeshStandardNodeMaterial({ color: '#300', roughness: 0.2 });
  lensMat.emissive.set(JAMMER_RED);
  lensMat.emissiveIntensity = LENS_EMISSIVE;
  const lens = new Mesh(new CylinderGeometry(0.03, 0.03, 0.02, 20), lensMat);
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0.11, 0.15, 0.155);
  root.add(lens);

  const indicator = new PointLight(JAMMER_RED);
  indicator.name = 'jammer_indicator';
  indicator.power = INDICATOR_POWER;
  indicator.distance = 4;
  indicator.decay = 2;

  // Aerosol puffs from the vent: soft grey sprites rising and fading.
  const puffMat = new SpriteNodeMaterial({ transparent: true, depthWrite: false });
  const fade = uniform(1);
  const d = uv().sub(vec2(0.5)).length();
  puffMat.colorNode = float(0.62);
  puffMat.opacityNode = float(1).sub(d.mul(2)).clamp(0, 1).pow(1.6).mul(0.35).mul(fade);
  const puffs: Sprite[] = [];
  const vent = new Group();
  vent.position.set(-0.08, 0.14, 0.17);
  root.add(vent);
  for (let i = 0; i < PUFFS; i++) {
    const s = new Sprite(puffMat);
    s.userData['phase'] = i / PUFFS;
    s.userData['drift'] = Math.random() - 0.5;
    vent.add(s);
    puffs.push(s);
  }

  let on = true;
  let t = 0;
  let fadeOut = 1;
  const disable = (silent = false): void => {
    if (!on) return;
    on = false;
    lensMat.emissiveIntensity = 0;
    indicator.intensity = 0; // the light stays in the scene: no light-set change, no shader rebuild
    if (!silent) opts.onSound?.('jammer_hum_stop');
  };

  const interactable: Interactable = {
    id: JAMMER_ID,
    promptKey: 'prompt.use',
    object: root as Object3D,
    canInteract: () => on,
    interact: () => {
      if (!on) return;
      disable();
      opts.onDisabled();
    },
  };

  opts.onSound?.('jammer_hum_start');
  return {
    root,
    indicator,
    interactable,
    state: () => ({ light: on, hum: on, vent: on }),
    disable,
    update(dt: number): void {
      t += dt;
      if (!on) fadeOut = Math.max(0, fadeOut - dt / 0.8);
      fade.value = fadeOut;
      vent.visible = fadeOut > 0;
      if (!vent.visible) return;
      for (const s of puffs) {
        const k = (t / PUFF_LIFE_SEC + (s.userData['phase'] as number)) % 1;
        const drift = s.userData['drift'] as number;
        // Out of the vent and up, staying inside the alcove (behind the door while it is shut).
        s.position.set(drift * 0.25 * k, MathUtils.lerp(0, 0.75, k * k), 0.04 + 0.3 * k);
        s.scale.setScalar(0.05 + 0.2 * k);
      }
      if (on) indicator.intensity = INDICATOR_POWER / (4 * Math.PI) * (0.85 + 0.15 * Math.sin(t * 2.3));
    },
  };
}
