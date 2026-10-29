/**
 * Fritz, the raven companion (spec §6). He hops between named perches along a
 * cubic Bezier (apex 2 m above the higher endpoint, 6 m/s, banking up to 25 degrees)
 * and gives tiered hints for the active puzzle: a subtitle line, a 6 s outline
 * on that tier's targets, and a caw.
 *
 * The body is a low-poly placeholder with wing groups acting as "bones". Any
 * animation clip a loaded model lacks (`fly`, `perch`, `idle`, `caw`) is driven
 * procedurally instead: a 4 Hz wing flap for `fly`, head-tilt noise for `idle`.
 * `attachModel` is the seam for the real raven (Task 11). With
 * `wingAxes: 'world'` (the crow placeholder, whose bone axes are arbitrary)
 * the wings beat about the body's long axis and fold back along the body
 * while perched, driven by rotations about Fritz's own axes rather than a
 * bone-local `rotation.z`.
 */
import {
  AnimationMixer,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  ConeGeometry,
  BoxGeometry,
  Vector3,
  type AnimationAction,
  type AnimationClip,
  type Object3D,
} from 'three/webgpu';
import type { Line } from '../dialogue/runner';
import type { createHintScheduler } from '../logic/hints';

export const FRITZ_SPEED = 6;
export const FRITZ_APEX_M = 2;
export const FRITZ_MAX_BANK_DEG = 25;
export const FRITZ_FLAP_HZ = 4;
export const HINT_HIGHLIGHT_SEC = 6;

export type FritzState = 'fly' | 'perch' | 'idle' | 'caw';
export type FritzSound = 'raven_caw';

export interface HintablePuzzle {
  id: string;
  hintKeys: readonly string[];
  scheduler: ReturnType<typeof createHintScheduler>;
  /** Objects to outline for each tier (same length as hintKeys). */
  targets: Object3D[][];
}

export interface FritzDeps {
  runner: { play(lines: readonly Line[], onDone?: () => void): void };
  director: { say(id: string): boolean };
  highlight: { setHighlighted(objects: Object3D[]): void };
  /** Seconds. Injectable so tests can drive hint timing. */
  now: () => number;
  onSound?: (name: FritzSound) => void;
}

interface Perch {
  pos: Vector3;
  facingDeg: number;
}

interface Flight {
  points: Vector3[]; // sampled path
  cum: number[]; // cumulative length at each sample
  perchId: string;
  dist: number;
  resolve: () => void;
  lastYaw: number;
}

interface Rig {
  wings: Array<{ node: Object3D; side: 1 | -1; rest: number }>;
  head: Object3D | undefined;
  headRest: number;
  beak: Object3D | undefined;
}

const WING_L = /wing.*(^|[^a-z])(l|left)([^a-z]|$)|(^|[^a-z])(l|left)([^a-z]|$).*wing|(^|[^a-z])l[_\s]*(clavicle|shoulder|upperarm)/i;
const WING_R = /wing.*(^|[^a-z])(r|right)([^a-z]|$)|(^|[^a-z])(r|right)([^a-z]|$).*wing|(^|[^a-z])r[_\s]*(clavicle|shoulder|upperarm)/i;
const HEAD = /head|neck/i;

/** Find wing and head nodes by name; `head` prefers a node literally named head over a neck. */
export function findRig(root: Object3D): Rig {
  const rig: Rig = { wings: [], head: undefined, headRest: 0, beak: undefined };
  root.traverse((o) => {
    if (WING_L.test(o.name) && !rig.wings.some((w) => w.side === 1)) rig.wings.push({ node: o, side: 1, rest: o.rotation.z });
    else if (WING_R.test(o.name) && !rig.wings.some((w) => w.side === -1)) rig.wings.push({ node: o, side: -1, rest: o.rotation.z });
    else if (HEAD.test(o.name) && (!rig.head || /head/i.test(o.name))) {
      rig.head = o;
      rig.headRest = o.rotation.z;
    }
  });
  return rig;
}

/** Options for an attached model. */
export interface AttachOptions {
  /** 'local' (default): wings flap on bone-local rotation.z. 'world': about Fritz's own axes, folded on the perch. */
  wingAxes?: 'local' | 'world';
}

/** Wing chain and head of a bird rig driven by rotations about Fritz's own axes. */
interface BirdRig {
  wings: Array<{ side: 1 | -1; chain: Array<{ node: Object3D; rest: Quaternion }> }>;
  head: { node: Object3D; rest: Quaternion } | undefined;
}

/**
 * Folded-wing angles (radians), tuned on the crow placeholder: the whole wing
 * swept back about Fritz's up axis, the forearm turned a little forward and
 * the hand back (bigger folds tear the skinning), then rolled down against
 * the flank about the forward axis.
 */
export const WING_FOLD = { sweep: 1.6, forearm: 0.6, hand: 0.7, droop: 0.45 } as const;
const CHAIN = [/upper.?arm/i, /fore.?arm/i, /hand/i];

function birdRig(rig: Rig): BirdRig {
  const wings = rig.wings.map((w) => {
    const chain = [{ node: w.node, rest: w.node.quaternion.clone() }];
    let at: Object3D = w.node;
    for (const re of CHAIN) {
      let found: Object3D | undefined;
      at.traverse((o) => {
        if (!found && o !== at && re.test(o.name)) found = o;
      });
      if (!found) break;
      chain.push({ node: found, rest: found.quaternion.clone() });
      at = found;
    }
    return { side: w.side, chain };
  });
  return { wings, head: rig.head && { node: rig.head, rest: rig.head.quaternion.clone() } };
}

const _pq = new Quaternion();
const _dq = new Quaternion();
const _q = new Quaternion();
const _axis = new Vector3();

/** Set `node` to its rest pose turned by `delta` in world space. */
function turnInWorld(node: Object3D, rest: Quaternion, delta: Quaternion): void {
  node.quaternion.copy(rest);
  if (!node.parent) {
    node.quaternion.premultiply(delta);
    return;
  }
  node.parent.getWorldQuaternion(_pq);
  // local = parent^-1 * delta * parent * rest
  node.quaternion.copy(_pq).invert().multiply(delta).multiply(_pq).multiply(rest);
  node.updateMatrixWorld();
}

const CAW_SEC = 0.6;
const PERCH_TO_IDLE_SEC = 2;
const SAMPLES = 48;

export class Fritz {
  readonly root = new Group();
  onSound: ((name: FritzSound) => void) | undefined;

  private readonly perches = new Map<string, Perch>();
  /** Bones the procedural fallback drives: the placeholder's groups, or nodes found on an attached model. */
  private rig: Rig;
  /** Set when the attached model is driven about Fritz's own axes. */
  private bird: BirdRig | undefined;
  private model: Object3D | undefined;
  private mixer: AnimationMixer | undefined;
  private readonly actions = new Map<FritzState, AnimationAction>();
  private readonly placeholder: Group;

  private st: FritzState = 'perch';
  private stT = 0;
  private cawT = -1;
  private flight: Flight | undefined;
  private clock = 0;
  private bank = 0;
  private perchId: string | null = null;
  private highlightUntil = -1;
  private highlighted: Object3D[] = [];

  constructor(private readonly deps: FritzDeps) {
    this.onSound = deps.onSound;
    const mat = new MeshStandardMaterial({ color: '#5a3a24', roughness: 0.5, metalness: 0.4, emissive: '#2a170a' });
    const g = new Group();
    const body = new Mesh(new SphereGeometry(0.11, 10, 8), mat);
    body.scale.set(0.8, 0.75, 1.5);
    const head = new Group();
    head.position.set(0, 0.07, 0.17);
    head.add(new Mesh(new SphereGeometry(0.06, 8, 6), mat));
    const beak = new Group();
    beak.position.set(0, -0.005, 0.05);
    const cone = new Mesh(new ConeGeometry(0.025, 0.1, 6), mat);
    cone.rotation.x = Math.PI / 2;
    cone.position.z = 0.05;
    beak.add(cone);
    head.add(beak);
    const tail = new Mesh(new BoxGeometry(0.08, 0.01, 0.16), mat);
    tail.position.set(0, 0, -0.22);
    const wing = (side: 1 | -1): Group => {
      const w = new Group();
      w.position.set(side * 0.07, 0.04, 0.02);
      const blade = new Mesh(new BoxGeometry(0.28, 0.012, 0.13), mat);
      blade.position.x = side * 0.14;
      w.add(blade);
      return w;
    };
    const wl = wing(1);
    const wr = wing(-1);
    g.add(body, head, tail, wl, wr);
    this.placeholder = g;
    this.rig = {
      wings: [
        { node: wl, side: 1, rest: -0.4 },
        { node: wr, side: -1, rest: 0.4 },
      ],
      head,
      headRest: 0,
      beak,
    };
    this.root.add(g);
    this.root.name = 'fritz';
    this.pose('perch');
  }

  get state(): FritzState {
    return this.st;
  }

  get position(): Vector3 {
    return this.root.position;
  }

  currentPerch(): string | null {
    return this.perchId;
  }

  /** The objects currently outlined by a hint (empty once the 6 s are up). */
  highlightedObjects(): Object3D[] {
    return [...this.highlighted];
  }

  perchIds(): string[] {
    return [...this.perches.keys()];
  }

  addPerch(id: string, pos: Vector3, facingDeg: number): void {
    this.perches.set(id, { pos: pos.clone(), facingDeg });
  }

  /** Snap onto a perch without flying. */
  place(id: string): void {
    const p = this.perches.get(id);
    if (!p) throw new Error(`unknown perch ${id}`);
    this.root.position.copy(p.pos);
    this.root.rotation.set(0, -MathUtils.degToRad(p.facingDeg), 0);
    this.perchId = id;
    this.flight = undefined;
    this.setState('perch');
  }

  /** Swap the placeholder for a loaded model; clips named fly/perch/idle/caw replace procedural motion. */
  attachModel(gltf: { scene: Object3D; animations: AnimationClip[] }, opts: AttachOptions = {}): void {
    this.placeholder.visible = false;
    this.model?.removeFromParent();
    this.model = gltf.scene;
    this.root.add(gltf.scene);
    this.rig = findRig(gltf.scene);
    this.bird = opts.wingAxes === 'world' ? birdRig(this.rig) : undefined;
    this.mixer = new AnimationMixer(gltf.scene);
    this.actions.clear();
    for (const name of ['fly', 'perch', 'idle', 'caw'] as const) {
      const clip = gltf.animations.find((c) => c.name.toLowerCase() === name);
      if (clip) this.actions.set(name, this.mixer.clipAction(clip));
    }
    this.playAction(this.st);
  }

  flyTo(id: string): Promise<void> {
    const target = this.perches.get(id);
    if (!target) return Promise.reject(new Error(`unknown perch ${id}`));
    this.flight?.resolve();
    const a = this.root.position.clone();
    const b = target.pos;
    const apexY = Math.max(a.y, b.y) + FRITZ_APEX_M;
    // y1 = y2 = Y puts the curve's midpoint peak at apexY.
    const cy = (8 * apexY - a.y - b.y) / 6;
    const p1 = new Vector3().lerpVectors(a, b, 1 / 3).setY(cy);
    const p2 = new Vector3().lerpVectors(a, b, 2 / 3).setY(cy);
    const points: Vector3[] = [];
    const cum: number[] = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const t = i / SAMPLES;
      const u = 1 - t;
      const pt = new Vector3()
        .addScaledVector(a, u * u * u)
        .addScaledVector(p1, 3 * u * u * t)
        .addScaledVector(p2, 3 * u * t * t)
        .addScaledVector(b, t * t * t);
      cum.push(i === 0 ? 0 : cum[i - 1]! + pt.distanceTo(points[i - 1]!));
      points.push(pt);
    }
    this.perchId = null;
    this.bank = 0;
    this.setState('fly');
    return new Promise<void>((resolve) => {
      this.flight = { points, cum, perchId: id, dist: 0, resolve, lastYaw: this.root.rotation.y };
    });
  }

  /**
   * Give the next hint for `puzzle`: subtitle line, outline on the tier's
   * targets for 6 s, caw. With no puzzle, the `fritz_nohint` bark.
   */
  hint(puzzle: HintablePuzzle | null): void {
    if (!puzzle) {
      this.deps.director.say('fritz_nohint');
      this.caw();
      return;
    }
    const tier = puzzle.scheduler.request(this.deps.now());
    const key = puzzle.hintKeys[tier];
    if (key) this.deps.runner.play([{ speaker: 'spk.fritz', text: key }]);
    this.highlighted = puzzle.targets[tier] ?? [];
    this.deps.highlight.setHighlighted(this.highlighted);
    this.highlightUntil = this.deps.now() + HINT_HIGHLIGHT_SEC;
    this.caw();
  }

  caw(): void {
    this.onSound?.('raven_caw');
    if (this.st === 'fly') return;
    this.cawT = 0;
    this.setState('caw');
  }

  update(dt: number): void {
    this.clock += dt;
    this.stT += dt;
    if (this.highlightUntil >= 0 && this.deps.now() >= this.highlightUntil) {
      this.highlightUntil = -1;
      this.highlighted = [];
      this.deps.highlight.setHighlighted([]);
    }
    if (this.flight) this.advanceFlight(dt);
    else if (this.st === 'caw') {
      this.cawT += dt;
      if (this.cawT >= CAW_SEC) {
        this.cawT = -1;
        this.setState('perch');
      }
    } else if (this.st === 'perch' && this.stT >= PERCH_TO_IDLE_SEC) this.setState('idle');
    this.mixer?.update(dt);
    this.pose(this.st);
  }

  private setState(s: FritzState): void {
    if (this.st === s) return;
    this.st = s;
    this.stT = 0;
    this.playAction(s);
  }

  private playAction(s: FritzState): void {
    for (const [name, a] of this.actions) if (name !== s) a.fadeOut(0.15);
    this.actions.get(s)?.reset().fadeIn(0.15).play();
  }

  private advanceFlight(dt: number): void {
    const f = this.flight!;
    f.dist += FRITZ_SPEED * dt;
    const total = f.cum[f.cum.length - 1]!;
    if (f.dist >= total) {
      const done = f.resolve;
      this.flight = undefined;
      this.place(f.perchId);
      done();
      return;
    }
    let i = 1;
    while (f.cum[i]! < f.dist) i++;
    const seg = f.cum[i]! - f.cum[i - 1]!;
    const k = seg > 0 ? (f.dist - f.cum[i - 1]!) / seg : 0;
    const p0 = f.points[i - 1]!;
    const p1 = f.points[i]!;
    this.root.position.lerpVectors(p0, p1, k);
    const dx = p1.x - p0.x;
    const dz = p1.z - p0.z;
    if (dx * dx + dz * dz > 1e-8) {
      const yaw = Math.atan2(dx, dz);
      const dYaw = MathUtils.euclideanModulo(yaw - f.lastYaw + Math.PI, Math.PI * 2) - Math.PI;
      f.lastYaw = yaw;
      this.root.rotation.y = yaw;
      const rate = dt > 0 ? dYaw / dt : 0;
      const maxBank = MathUtils.degToRad(FRITZ_MAX_BANK_DEG);
      this.bank = MathUtils.clamp(MathUtils.lerp(this.bank, -rate * 0.6, 0.15), -maxBank, maxBank);
    }
    const climb = Math.atan2(p1.y - p0.y, Math.hypot(dx, dz));
    this.root.rotation.x = -climb * 0.5;
    this.root.rotation.z = this.bank;
  }

  /** Drive the rig's bones for states the loaded clips don't cover (all of them for the placeholder). */
  private pose(s: FritzState): void {
    if (s !== 'fly') {
      this.root.rotation.x = 0;
      this.root.rotation.z = 0;
    }
    if (this.model && this.actions.has(s)) return;
    if (this.bird) {
      this.poseBird(s);
      return;
    }
    const t = this.clock;
    const { wings, head, headRest, beak } = this.rig;
    const flap = Math.sin(t * 2 * Math.PI * FRITZ_FLAP_HZ) * 0.7;
    for (const w of wings) w.node.rotation.z = w.rest + (s === 'fly' ? w.side * flap : 0);
    if (head) {
      const noise = Math.sin(t * 1.3) * 0.3 + Math.sin(t * 2.9 + 1) * 0.1;
      head.rotation.z = headRest + (s === 'idle' ? noise : 0);
      head.rotation.x = s === 'caw' ? -0.4 : 0;
    }
    if (beak) beak.rotation.x = s === 'caw' ? 0.35 * (0.5 + 0.5 * Math.sin(this.cawT * 30)) : 0;
  }

  /** Bird rig: beat about the body's long axis in flight, fold back along the body otherwise. */
  private poseBird(s: FritzState): void {
    const bird = this.bird!;
    const t = this.clock;
    this.root.updateWorldMatrix(true, false);
    this.root.getWorldQuaternion(_q);
    const fwd = new Vector3(0, 0, 1).applyQuaternion(_q);
    const up = new Vector3(0, 1, 0).applyQuaternion(_q);
    const right = new Vector3(1, 0, 0).applyQuaternion(_q);
    const flap = Math.sin(t * 2 * Math.PI * FRITZ_FLAP_HZ) * 0.7;
    const about = (axis: Vector3, angle: number, out = new Quaternion()): Quaternion => out.setFromAxisAngle(_axis.copy(axis), angle);
    for (const w of bird.wings) {
      const [shoulder, ...rest] = w.chain;
      if (!shoulder) continue;
      if (s === 'fly') {
        turnInWorld(shoulder.node, shoulder.rest, about(fwd, w.side * flap, _dq));
        for (const b of rest) b.node.quaternion.copy(b.rest);
        continue;
      }
      // Sweep the arm back along the body (about up), then roll it down against the flank (about forward).
      const sweep = about(fwd, w.side * WING_FOLD.droop).multiply(about(up, w.side * WING_FOLD.sweep));
      turnInWorld(shoulder.node, shoulder.rest, sweep);
      const fold = [0, -WING_FOLD.forearm, WING_FOLD.hand];
      rest.forEach((b, i) => turnInWorld(b.node, b.rest, about(up, w.side * (fold[i] ?? 0), _dq)));
    }
    if (bird.head) {
      const noise = s === 'idle' ? Math.sin(t * 1.3) * 0.3 + Math.sin(t * 2.9 + 1) * 0.1 : 0;
      const d = about(up, noise).multiply(about(right, s === 'caw' ? 0.4 : 0));
      turnInWorld(bird.head.node, bird.head.rest, d);
    }
  }
}
