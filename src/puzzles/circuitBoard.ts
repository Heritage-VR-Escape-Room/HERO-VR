/**
 * The Circuit Bridge (new script §6): the open electrical panel on the
 * pyramid's base. Using it blends the camera to the board; the mouse flips
 * the four switches and drags the blue jumper between the four corner
 * terminals. Copper traces glow as power reaches them; a crossed red wire on a
 * live node shorts the board (sparks, red lamp). Solved: the lamp turns green,
 * the jammer powers down and the compartment opens (via `onSolved`).
 */
import {
  CanvasTexture,
  CatmullRomCurve3,
  CylinderGeometry,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Plane,
  PlaneGeometry,
  Quaternion,
  Raycaster,
  SphereGeometry,
  SRGBColorSpace,
  TubeGeometry,
  BoxGeometry,
  Vector2,
  Vector3,
  type PerspectiveCamera,
} from 'three/webgpu';
import { evaluate, initialCircuit, isSolved, plug, TERMINALS, toggle, type Circuit, type Node, type Terminal } from '../logic/circuit';
import type { I18n } from '../logic/i18n';
import type { StoryDirector } from '../dialogue/director';
import type { Interactable } from '../interaction/interactor';
import type { ModalSession } from '../interaction/modal';

export const CIRCUIT_PUZZLE_ID = 'circuit_bridge';
export const CIRCUIT_HINT_KEYS = ['hint.circuit.1', 'hint.circuit.2', 'hint.circuit.3'] as const;

/** Board size (m) and the canvas that draws it. */
const W = 0.56;
const H = 0.4;
const PX = 1024;
const PY = Math.round((PX * H) / W);
const BLEND_SEC = 0.5;

type UV = readonly [number, number];
/** Board layout in canvas units (0..1 across, 0..1 down). */
const NODE_UV: Record<Exclude<Node, 'GND' | 'OUT'>, UV> = { A: [0.2, 0.24], B: [0.64, 0.24], C: [0.2, 0.76], D: [0.64, 0.76] };
const TERMINAL_UV: Record<Terminal, UV> = { TL: [0.07, 0.09], TR: [0.93, 0.09], BL: [0.07, 0.91], BR: [0.93, 0.91] };
/** Trace polylines per edge; the switch sits at `sw` along the route. */
const TRACES: Record<string, { pts: UV[]; sw: UV | null; red?: boolean }> = {
  'A-C': { pts: [[0.2, 0.24], [0.05, 0.24], [0.05, 0.76], [0.2, 0.76]], sw: [0.05, 0.5] },
  'C-D': { pts: [[0.2, 0.76], [0.64, 0.76]], sw: null },
  'D-B': { pts: [[0.64, 0.76], [0.42, 0.62], [0.42, 0.38], [0.64, 0.24]], sw: [0.42, 0.5] },
  'A-GND': { pts: [[0.2, 0.24], [0.33, 0.66]], sw: [0.245, 0.385], red: true },
  'C-GND': { pts: [[0.2, 0.76], [0.33, 0.34]], sw: [0.245, 0.615], red: true },
};
const SWITCH_EDGE = ['A-C', 'A-GND', 'C-GND', 'D-B'] as const;
const GROUND_UV: UV[] = [[0.33, 0.66], [0.33, 0.34]];

export type CircuitSound = 'tumbler_click' | 'ring_tick' | 'lock_clunk' | 'handle_rattle';

export interface CircuitDeps {
  director: Pick<StoryDirector, 'markSolved' | 'autosave' | 'registerPuzzle'>;
  modal: ModalSession;
  camera: PerspectiveCamera;
  canvas: HTMLCanvasElement;
  target: EventTarget;
  i18n: I18n;
  onSound?: (s: CircuitSound) => void;
  /** Power restored (also on a save restore, with `restored` true). */
  onSolved?: (restored: boolean) => void;
  onFocusChange?: (focused: boolean) => void;
}

export interface CircuitState {
  focused: boolean;
  ready: boolean;
  solved: boolean;
  short: boolean;
  switches: boolean[];
  jumper: Terminal;
  live: string[];
}

const toLocal = ([u, v]: UV, z = 0): Vector3 => new Vector3((u - 0.5) * W, (0.5 - v) * H, z);

/** The panel lid's inside: the intended routes, engraved (Fritz's first hint points here). */
function lidTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = PX;
  c.height = PY;
  const g = c.getContext('2d')!;
  g.fillStyle = '#3a3f44';
  g.fillRect(0, 0, PX, PY);
  g.strokeStyle = '#8a8f94';
  g.lineWidth = 10;
  g.strokeRect(20, 20, PX - 40, PY - 40);
  const line = (pts: UV[]): void => {
    g.beginPath();
    pts.forEach(([u, v], i) => (i ? g.lineTo(u * PX, v * PY) : g.moveTo(u * PX, v * PY)));
    g.stroke();
  };
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.setLineDash([]);
  g.strokeStyle = '#c9a36a';
  g.lineWidth = 12;
  line(TRACES['A-C']!.pts);
  line(TRACES['C-D']!.pts);
  line(TRACES['D-B']!.pts);
  line([NODE_UV.B, TERMINAL_UV.TR]);
  g.fillStyle = '#c9a36a';
  g.font = 'bold 54px "Noto Sans", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const [n, [u, v]] of Object.entries(NODE_UV)) {
    g.beginPath();
    g.arc(u * PX, v * PY, 22, 0, Math.PI * 2);
    g.fill();
    g.fillText(n, u * PX + (u < 0.5 ? 50 : 50), v * PY - 40);
  }
  g.fillText('OUT', TERMINAL_UV.TR[0] * PX - 20, TERMINAL_UV.TR[1] * PY + 60);
  g.font = 'italic 34px "IM Fell English", serif';
  g.fillText('Stadtwerke Karlsruhe · Schaltplan', PX / 2, PY - 60);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export class CircuitBoard {
  readonly id = CIRCUIT_PUZZLE_ID;
  readonly root = new Group();
  readonly interactable: Interactable;
  /** Everything Fritz outlines per hint tier. */
  readonly lid: Mesh;
  readonly switchMeshes: Object3D[] = [];
  readonly terminalMeshes: Object3D[] = [];
  readonly plugMesh: Mesh;

  private c: Circuit = initialCircuit();
  private solved = false;
  private focused = false;
  private blend = 0;
  private solveT = -1;
  private flicker = 0;
  private dragging = false;
  private readonly canvasEl = document.createElement('canvas');
  private readonly tex: CanvasTexture;
  private readonly lamp: Mesh;
  private wire: Mesh | null = null;
  private readonly view = new Object3D();
  private readonly ray = new Raycaster();
  private readonly ndc = new Vector2();
  private readonly plane = new Plane();
  private readonly hintEl: HTMLDivElement;
  private readonly poseP = new Vector3();
  private readonly poseQ = new Quaternion();
  private readonly viewP = new Vector3();
  private readonly viewQ = new Quaternion();
  private readonly scale = new Vector3();
  private readonly wireMat = new MeshStandardMaterial({ color: '#2f6bff', roughness: 0.45, emissive: '#0b2a80', emissiveIntensity: 0.6 });

  private readonly onKey = (e: Event): void => {
    if (this.focused && (e as KeyboardEvent).code === 'Escape') this.leave();
  };
  private readonly onDown = (e: MouseEvent): void => {
    if (!this.ready() || e.button !== 0) return;
    const hit = this.pick(e.clientX, e.clientY, [...this.switchMeshes, ...this.terminalMeshes, this.plugMesh]);
    if (!hit) return;
    const ud = hit.userData;
    if (ud['plug']) this.dragging = true;
    else if (typeof ud['switch'] === 'number') this.flip(ud['switch'] as number);
    else if (ud['terminal']) this.plugInto(ud['terminal'] as Terminal);
  };
  private readonly onMove = (e: MouseEvent): void => {
    if (!this.dragging) return;
    const p = this.boardPoint(e.clientX, e.clientY);
    if (p) {
      this.plugMesh.position.set(p.x, p.y, 0.03);
      this.rebuildWire();
    }
  };
  private readonly onUp = (e: MouseEvent): void => {
    if (!this.dragging) return;
    this.dragging = false;
    const p = this.boardPoint(e.clientX, e.clientY);
    let best: Terminal | null = null;
    let bestD = 0.07;
    if (p)
      for (const t of TERMINALS) {
        const d = toLocal(TERMINAL_UV[t]).distanceTo(new Vector3(p.x, p.y, 0));
        if (d < bestD) {
          bestD = d;
          best = t;
        }
      }
    this.plugInto(best ?? this.c.jumper);
  };

  constructor(private readonly deps: CircuitDeps) {
    this.root.name = 'circuit_panel';
    const steel = new MeshStandardMaterial({ color: '#4b5157', roughness: 0.55, metalness: 0.7 });
    const box = new Mesh(new BoxGeometry(W + 0.06, H + 0.06, 0.08), steel);
    box.position.z = -0.045;
    box.castShadow = box.receiveShadow = true;
    this.root.add(box);

    this.canvasEl.width = PX;
    this.canvasEl.height = PY;
    this.tex = new CanvasTexture(this.canvasEl);
    this.tex.colorSpace = SRGBColorSpace;
    // The board reads at night: its print glows faintly through the emissive map.
    const boardMat = new MeshStandardMaterial({ map: this.tex, emissiveMap: this.tex, emissive: '#ffffff', emissiveIntensity: 0.55, roughness: 0.6 });
    const board = new Mesh(new PlaneGeometry(W, H), boardMat);
    board.position.z = 0.001;
    this.root.add(board);

    // Lid: hinged on the left edge, swung open towards the viewer's left.
    const lidPivot = new Group();
    lidPivot.position.set(-W / 2 - 0.03, 0, 0.0);
    lidPivot.rotation.y = -MathUtils.degToRad(172); // nearly flat against the wall, engraving out
    this.root.add(lidPivot);
    const lidTex = lidTexture();
    this.lid = new Mesh(new PlaneGeometry(W + 0.06, H + 0.06), [
      new MeshStandardMaterial({ map: lidTex, emissiveMap: lidTex, emissive: '#ffffff', emissiveIntensity: 0.35, roughness: 0.5, metalness: 0.4 }),
    ][0]!);
    this.lid.name = 'panel_lid';
    this.lid.position.set((W + 0.06) / 2, 0, 0.005);
    this.lid.rotation.y = Math.PI; // the engraved inside faces out once swung open
    const lidBack = new Mesh(new PlaneGeometry(W + 0.06, H + 0.06), steel);
    lidBack.position.copy(this.lid.position);
    lidPivot.add(this.lid, lidBack);

    // Switches 1-4 on their traces.
    const leverMat = new MeshStandardMaterial({ color: '#d9d4c7', roughness: 0.3, metalness: 0.6 });
    const baseMat = new MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.6 });
    SWITCH_EDGE.forEach((edge, i) => {
      const sw = new Group();
      sw.position.copy(toLocal(TRACES[edge]!.sw!, 0.004));
      const base = new Mesh(new BoxGeometry(0.036, 0.05, 0.012), baseMat);
      base.position.z = 0.006;
      const lever = new Mesh(new CylinderGeometry(0.005, 0.006, 0.04, 10), leverMat);
      lever.position.set(0, 0, 0.012);
      lever.geometry.translate(0, 0.02, 0);
      lever.name = 'lever';
      base.userData['switch'] = i;
      lever.userData['switch'] = i;
      sw.add(base, lever);
      sw.name = `switch_${i + 1}`;
      this.root.add(sw);
      this.switchMeshes.push(base, lever);
    });

    // Corner terminals (brass posts).
    const brass = new MeshStandardMaterial({ color: '#c9a04f', roughness: 0.35, metalness: 0.9 });
    for (const t of TERMINALS) {
      const post = new Mesh(new CylinderGeometry(0.011, 0.013, 0.022, 14), brass);
      post.rotation.x = Math.PI / 2;
      post.position.copy(toLocal(TERMINAL_UV[t], 0.011));
      post.userData['terminal'] = t;
      post.name = `terminal_${t}`;
      this.root.add(post);
      this.terminalMeshes.push(post);
    }

    // The blue jumper's plug.
    this.plugMesh = new Mesh(new CylinderGeometry(0.012, 0.012, 0.03, 14), this.wireMat);
    this.plugMesh.rotation.x = Math.PI / 2;
    this.plugMesh.userData['plug'] = true;
    this.plugMesh.name = 'jumper_plug';
    this.root.add(this.plugMesh);

    // Status lamp above the board.
    this.lamp = new Mesh(new SphereGeometry(0.012, 12, 10), new MeshStandardMaterial({ color: '#200', emissive: '#ff6a00', emissiveIntensity: 1.5 }));
    this.lamp.position.set(W / 2 - 0.03, H / 2 + 0.012, 0.01);
    this.root.add(this.lamp);

    this.view.position.set(0, 0.02, 0.52);
    this.root.add(this.view);

    this.hintEl = document.createElement('div');
    this.hintEl.id = 'circuit-hint';
    this.hintEl.style.cssText =
      'position:fixed;left:0;right:0;bottom:6vh;text-align:center;color:#f2efe6;opacity:0.85;font:16px "Noto Sans","Noto Naskh Arabic",sans-serif;' +
      'text-shadow:0 1px 4px #000;pointer-events:none;z-index:10;display:none';
    document.body.append(this.hintEl);
    deps.i18n.onChange(() => this.renderHint());

    this.interactable = {
      id: CIRCUIT_PUZZLE_ID,
      promptKey: 'prompt.use',
      object: this.root,
      canInteract: () => !this.solved && !this.focused,
      interact: () => this.focus(),
    };
    deps.target.addEventListener('keydown', this.onKey);
    deps.canvas.addEventListener('mousedown', this.onDown);
    window.addEventListener('mousemove', this.onMove);
    window.addEventListener('mouseup', this.onUp);
    this.placePlug();
    this.redraw();
    deps.director.registerPuzzle(CIRCUIT_PUZZLE_ID, () => this.forceSolved());
  }

  state(): CircuitState {
    const e = evaluate(this.c);
    return {
      focused: this.focused,
      ready: this.ready(),
      solved: this.solved,
      short: e.short,
      switches: [...this.c.switches],
      jumper: this.c.jumper,
      live: e.live,
    };
  }

  ready(): boolean {
    return this.focused && this.blend >= 1 && !this.solved;
  }

  focus(): void {
    if (this.focused || this.solved) return;
    this.focused = true;
    this.deps.modal.enter();
    this.deps.onFocusChange?.(true);
    this.renderHint();
  }

  leave(): void {
    if (!this.focused) return;
    this.focused = false;
    this.dragging = false;
    this.hintEl.style.display = 'none';
    this.deps.onFocusChange?.(false);
    if (this.blend === 0) this.deps.modal.exit();
  }

  /** Flip switch i (0-3). */
  flip(i: number): void {
    if (this.solved) return;
    this.c = toggle(this.c, i);
    this.deps.onSound?.('tumbler_click');
    this.changed();
  }

  plugInto(t: Terminal): void {
    if (this.solved) return;
    this.c = plug(this.c, t);
    this.placePlug();
    this.deps.onSound?.('ring_tick');
    this.changed();
  }

  forceSolved(): void {
    this.c = plug(toggle(toggle(initialCircuit(), 0), 3), 'TR');
    this.solved = true;
    this.placePlug();
    this.redraw();
    this.deps.onSolved?.(true);
  }

  update(dt: number): void {
    const prev = this.blend;
    this.blend = MathUtils.clamp(this.blend + (this.focused ? dt : -dt) / BLEND_SEC, 0, 1);
    if (prev > 0 && this.blend === 0 && !this.focused) this.deps.modal.exit();
    if (this.blend > 0) this.applyCamera(this.blend * this.blend * (3 - 2 * this.blend));
    // Lever angles follow the switches.
    this.switchMeshes.forEach((m) => {
      if (m.name === 'lever') m.rotation.x = this.c.switches[m.userData['switch'] as number] ? -0.6 : 0.6;
    });
    const e = evaluate(this.c);
    if (e.short && !this.solved) {
      this.flicker += dt;
      if (this.flicker > 0.08) {
        this.flicker = 0;
        this.redraw();
      }
    }
    if (this.solveT >= 0) {
      this.solveT += dt;
      if (this.solveT > 1.4) {
        this.solveT = -1;
        this.leave();
      }
    }
  }

  dispose(): void {
    this.deps.target.removeEventListener('keydown', this.onKey);
    this.deps.canvas.removeEventListener('mousedown', this.onDown);
    window.removeEventListener('mousemove', this.onMove);
    window.removeEventListener('mouseup', this.onUp);
    this.hintEl.remove();
  }

  private changed(): void {
    const e = evaluate(this.c);
    if (e.short) this.deps.onSound?.('handle_rattle');
    this.redraw();
    if (isSolved(this.c)) {
      this.solved = true;
      this.solveT = 0;
      this.hintEl.style.display = 'none';
      this.deps.onSound?.('lock_clunk');
      this.deps.director.markSolved(CIRCUIT_PUZZLE_ID);
      this.deps.director.autosave(CIRCUIT_PUZZLE_ID);
      this.deps.onSolved?.(false);
    }
  }

  private placePlug(): void {
    this.plugMesh.position.copy(toLocal(TERMINAL_UV[this.c.jumper], 0.03));
    this.rebuildWire();
  }

  private rebuildWire(): void {
    const a = toLocal(NODE_UV.B, 0.012);
    const b = this.plugMesh.position.clone().setZ(0.02);
    const mid = a.clone().lerp(b, 0.5).setZ(0.06);
    const geo = new TubeGeometry(new CatmullRomCurve3([a, mid, b]), 24, 0.005, 8, false);
    if (this.wire) {
      this.wire.geometry.dispose();
      this.wire.geometry = geo;
    } else {
      this.wire = new Mesh(geo, this.wireMat);
      this.wire.name = 'jumper_wire';
      this.root.add(this.wire);
    }
  }

  private pick(x: number, y: number, objects: Object3D[]): Object3D | null {
    const r = this.deps.canvas.getBoundingClientRect();
    this.ndc.set(((x - r.left) / r.width) * 2 - 1, -(((y - r.top) / r.height) * 2 - 1));
    this.deps.camera.updateMatrixWorld();
    this.ray.setFromCamera(this.ndc, this.deps.camera);
    return this.ray.intersectObjects(objects, false)[0]?.object ?? null;
  }

  /** The board-local point under the cursor (on the board's plane). */
  private boardPoint(x: number, y: number): Vector3 | null {
    const r = this.deps.canvas.getBoundingClientRect();
    this.ndc.set(((x - r.left) / r.width) * 2 - 1, -(((y - r.top) / r.height) * 2 - 1));
    this.ray.setFromCamera(this.ndc, this.deps.camera);
    this.root.updateWorldMatrix(true, false);
    const n = new Vector3(0, 0, 1).applyQuaternion(this.root.getWorldQuaternion(new Quaternion()));
    this.plane.setFromNormalAndCoplanarPoint(n, this.root.getWorldPosition(new Vector3()));
    const hit = this.ray.ray.intersectPlane(this.plane, new Vector3());
    if (!hit) return null;
    const p = this.root.worldToLocal(hit);
    p.x = MathUtils.clamp(p.x, -W / 2, W / 2);
    p.y = MathUtils.clamp(p.y, -H / 2, H / 2);
    return p;
  }

  private applyCamera(e: number): void {
    const cam = this.deps.camera;
    this.view.updateWorldMatrix(true, false);
    this.view.matrixWorld.decompose(this.viewP, this.viewQ, this.scale);
    this.poseP.copy(cam.position);
    this.poseQ.copy(cam.quaternion);
    cam.position.lerpVectors(this.poseP, this.viewP, e);
    cam.quaternion.slerpQuaternions(this.poseQ, this.viewQ, e);
  }

  private renderHint(): void {
    if (!this.focused) return;
    this.hintEl.dir = this.deps.i18n.dir();
    this.hintEl.textContent = this.deps.i18n.t('ui.circuit.hint');
    this.hintEl.style.display = 'block';
  }

  /** Draw the board: dim copper, live traces glowing, red wires sparking on a short. */
  private redraw(): void {
    const g = this.canvasEl.getContext('2d')!;
    const e = evaluate(this.c);
    g.fillStyle = '#16402a';
    g.fillRect(0, 0, PX, PY);
    // Fine grid of the printed board.
    g.strokeStyle = 'rgba(255,255,255,0.04)';
    g.lineWidth = 1;
    for (let x = 0; x < PX; x += 32) g.strokeRect(x, 0, 0.5, PY);
    for (let y = 0; y < PY; y += 32) g.strokeRect(0, y, PX, 0.5);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const path = (pts: UV[]): void => {
      g.beginPath();
      pts.forEach(([u, v], i) => (i ? g.lineTo(u * PX, v * PY) : g.moveTo(u * PX, v * PY)));
      g.stroke();
    };
    const spark = e.short && Math.random() < 0.6;
    for (const [key, tr] of Object.entries(TRACES)) {
      const closed = tr.sw === null || this.c.switches[SWITCH_EDGE.indexOf(key as never)];
      const live = e.liveEdges.includes(key) && closed;
      g.shadowBlur = live ? 24 : 0;
      if (tr.red) {
        g.strokeStyle = live ? (spark ? '#ffffff' : '#ff2a1a') : '#8c1f17';
        g.shadowColor = '#ff2a1a';
        g.lineWidth = 9;
      } else {
        g.strokeStyle = live && !e.short ? '#ffc25a' : '#9a6232';
        g.shadowColor = '#ffb347';
        g.lineWidth = 14;
      }
      path(tr.pts);
    }
    g.shadowBlur = 0;
    // Ground symbols.
    g.strokeStyle = '#c8c8c8';
    g.lineWidth = 5;
    for (const [u, v] of GROUND_UV) {
      for (let k = 0; k < 3; k++) path([[u - 0.025 + k * 0.008, v + 0.03 + k * 0.025], [u + 0.025 - k * 0.008, v + 0.03 + k * 0.025]]);
      path([[u, v], [u, v + 0.03]]);
    }
    // Nodes and labels.
    g.font = 'bold 44px "Noto Sans", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const [n, [u, v]] of Object.entries(NODE_UV)) {
      const live = e.live.includes(n as Node) && !e.short;
      g.fillStyle = live ? '#ffd27a' : '#b8864e';
      g.beginPath();
      g.arc(u * PX, v * PY, 24, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#f1ead8';
      g.fillText(n, u * PX + 44, v * PY - 38);
    }
    g.font = '30px "Noto Sans", sans-serif';
    g.fillStyle = '#f1ead8';
    g.fillText('PWR', NODE_UV.A[0] * PX - 0, NODE_UV.A[1] * PY - 62);
    g.fillText('OUT', TERMINAL_UV.TR[0] * PX - 10, TERMINAL_UV.TR[1] * PY + 56);
    SWITCH_EDGE.forEach((edge, i) => {
      const [u, v] = TRACES[edge]!.sw!;
      g.fillText(String(i + 1), u * PX + 42, v * PY);
    });
    for (const t of TERMINALS) {
      const [u, v] = TERMINAL_UV[t];
      g.strokeStyle = '#d6b36a';
      g.lineWidth = 4;
      g.beginPath();
      g.arc(u * PX, v * PY, 26, 0, Math.PI * 2);
      g.stroke();
    }
    // A gap where the middle fuse was pulled.
    g.strokeStyle = '#f1ead8';
    g.setLineDash([8, 8]);
    g.lineWidth = 3;
    g.strokeRect(0.47 * PX, 0.44 * PY, 0.08 * PX, 0.12 * PY);
    g.setLineDash([]);
    g.font = '24px "Noto Sans", sans-serif';
    g.fillText('FUSE', 0.51 * PX, 0.5 * PY);
    this.tex.needsUpdate = true;
    const lampMat = this.lamp.material as MeshStandardMaterial;
    lampMat.emissive.set(this.solved || isSolved(this.c) ? '#2bff6a' : e.short ? '#ff1a1a' : '#ff9a00');
  }
}
