/**
 * Gamepad support (standard mapping: Xbox / PlayStation / most USB pads).
 * Polled once per frame. Left stick moves, right stick looks; buttons give
 * just-pressed edges. Stick values pass a radial dead zone and are rescaled
 * so the response starts at zero just outside it.
 */

export const PAD = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  BACK: 8,
  START: 9,
  LS: 10,
  RS: 11,
  UP: 12,
  DOWN: 13,
  LEFT: 14,
  RIGHT: 15,
} as const;

export const DEAD_ZONE = 0.18;
/** Menu key-repeat: a held direction steps once, then again after 0.5 s, then every 0.25 s. */
export const NAV_FIRST_REPEAT_SEC = 0.5;
export const NAV_REPEAT_SEC = 0.25;

/** Radial dead zone, rescaled to 0..1 beyond it. */
export function deadzone(x: number, y: number, dz = DEAD_ZONE): { x: number; y: number } {
  const m = Math.hypot(x, y);
  if (m <= dz) return { x: 0, y: 0 };
  const k = Math.min(1, (m - dz) / (1 - dz)) / m;
  return { x: x * k, y: y * k };
}

type PadSource = () => ReadonlyArray<Gamepad | null>;

export class Gamepads {
  private prev: boolean[] = [];
  private now: boolean[] = [];
  private axes: readonly number[] = [];
  private connectedPad = false;
  private lastUse = -Infinity;
  /** Key-repeat state per navigation axis (they must not share one, or each resets the other every frame). */
  private readonly navState = { vertical: { dir: 0, t: 0 }, horizontal: { dir: 0, t: 0 } };

  constructor(private readonly source: PadSource = () => (navigator.getGamepads ? navigator.getGamepads() : [])) {}

  /** Read the first connected pad; call once per frame. */
  poll(): void {
    const pad = [...this.source()].find((p): p is Gamepad => !!p && p.connected);
    this.prev = this.now;
    if (!pad) {
      this.connectedPad = false;
      this.now = [];
      this.axes = [];
      return;
    }
    this.connectedPad = true;
    this.now = pad.buttons.map((b) => b.pressed || b.value > 0.5);
    this.axes = pad.axes;
    const moved = this.axes.some((a) => Math.abs(a) > 0.35);
    if (moved || this.now.some(Boolean)) this.lastUse = performance.now();
  }

  connected(): boolean {
    return this.connectedPad;
  }

  /** The pad was used in the last few seconds (prompts show pad buttons). */
  active(): boolean {
    return this.connectedPad && performance.now() - this.lastUse < 8000;
  }

  isDown(b: number): boolean {
    return !!this.now[b];
  }

  pressed(b: number): boolean {
    return !!this.now[b] && !this.prev[b];
  }

  released(b: number): boolean {
    return !this.now[b] && !!this.prev[b];
  }

  /** Left stick: x right, y forward (up on the stick). */
  move(): { x: number; y: number } {
    const d = deadzone(this.axes[0] ?? 0, this.axes[1] ?? 0);
    return { x: d.x, y: d.y === 0 ? 0 : -d.y };
  }

  /** Right stick: x right, y down. */
  look(): { x: number; y: number } {
    return deadzone(this.axes[2] ?? 0, this.axes[3] ?? 0);
  }

  /**
   * Menu navigation from the D-pad or the left stick: -1 up/left, +1
   * down/right, 0 none, with key-repeat while held.
   */
  nav(dt: number, axis: 'vertical' | 'horizontal'): number {
    const [neg, pos, ai] = axis === 'vertical' ? [PAD.UP, PAD.DOWN, 1] : [PAD.LEFT, PAD.RIGHT, 0];
    const a = this.axes[ai] ?? 0;
    const dir = this.isDown(neg) || a < -0.6 ? -1 : this.isDown(pos) || a > 0.6 ? 1 : 0;
    const st = this.navState[axis];
    if (dir === 0) {
      st.dir = 0;
      return 0;
    }
    if (dir !== st.dir) {
      st.dir = dir;
      st.t = NAV_FIRST_REPEAT_SEC;
      return dir;
    }
    st.t -= dt;
    if (st.t <= 0) {
      st.t = NAV_REPEAT_SEC;
      return dir;
    }
    return 0;
  }
}

/** Move keyboard focus among the visible buttons (menus, pause, end card, settings). */
export function focusStep(dir: number): void {
  const buttons = [...document.querySelectorAll<HTMLElement>('button, [role="button"], input[type="range"]')].filter(
    (b) => b.offsetParent !== null && !(b as HTMLButtonElement).disabled,
  );
  if (!buttons.length) return;
  const i = buttons.indexOf(document.activeElement as HTMLElement);
  const next = buttons[i < 0 ? 0 : (i + dir + buttons.length) % buttons.length]!;
  next.focus();
}

/** Click the focused button, or the first visible one. */
export function clickFocused(): void {
  const a = document.activeElement as HTMLElement | null;
  if (a && a !== document.body && a.offsetParent !== null) {
    a.click();
    return;
  }
  focusStep(0);
}

/** Send a key press to the game's existing keyboard handlers. */
export const tapLog: string[] = [];
export function tapKey(code: string): void {
  tapLog.push(code);
  const key = code === 'Escape' ? 'Escape' : code === 'Space' ? ' ' : code.replace(/^Key/, '').toLowerCase();
  window.dispatchEvent(new KeyboardEvent('keydown', { code, key, bubbles: true }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code, key, bubbles: true }));
}
