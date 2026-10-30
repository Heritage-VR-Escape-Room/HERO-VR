/**
 * Act 0 story wiring (new script §6): turns world events into beats. The
 * director keeps every beat one-shot, so calling these twice is harmless.
 *
 *   wake -> Fritz flies down and introduces himself, then follows the player
 *   -> the kiosk owner's rant (near the kiosk) -> Anvin at the panel (near the
 *   pyramid) -> Julian's line on first using the panel -> the Circuit Bridge
 *   -> power back, the jammer dies, the compartment opens, Anvin slinks off
 *   -> the Spectrum Lenses -> the UV trail -> its end: the hook, the end card.
 */
import type { StoryDirector } from './director';

/** Reading the manifesto is recorded as a disabled object so saves keep it. */
export const MANIFESTO_READ = 'manifesto_read';
export const ACT0_END = 'act0_end';
const KIOSK_RADIUS_M = 10;
const ANVIN_RADIUS_M = 7;
const TRAIL_END_RADIUS_M = 3.5;

type XZ = { x: number; z: number };

export interface Act0Deps {
  director: Pick<StoryDirector, 'fire' | 'state' | 'markDisabled' | 'autosave'>;
  /** Fritz flies down to a perch near the bench; resolves on landing. */
  fritzArrive: () => Promise<void>;
  /** Fritz starts (or stops) following the player. */
  fritzFollow: (on: boolean) => void;
  /** Anvin leaves the plaza. */
  anvinLeave: () => void;
  showEndCard: () => void;
  places: { kiosk: XZ; anvin: XZ; trailEnd: XZ };
}

export interface Act0 {
  /** New Game opens with the wake beat and Fritz's introduction; Continue resumes following. */
  start(newGame: boolean): void;
  panelUsed(): void;
  manifestoRead(): void;
  lensesTaken(): void;
  /** Every tick: proximity beats, the solve, the lenses, the ending. */
  update(player: XZ, circuitSolved: boolean, lensesOn: boolean): void;
}

const near = (a: XZ, b: XZ, r: number): boolean => Math.hypot(a.x - b.x, a.z - b.z) <= r;

export function createAct0(d: Act0Deps): Act0 {
  const { director } = d;
  const fired = (id: string): boolean => director.state().firedBeats.includes(id);
  // The solve lines only play when the solve happens in this session.
  let wasSolved: boolean | null = null;
  let ended = fired('b9_hook');

  const introduceFritz = (): void => {
    void d.fritzArrive().then(() => director.fire('b_fritz_intro', () => d.fritzFollow(true)));
  };

  return {
    start(newGame) {
      if (newGame) {
        director.fire('b1_wake', introduceFritz);
        return;
      }
      if (fired('b_anvin_flees')) d.anvinLeave();
      if (fired('b_fritz_intro')) d.fritzFollow(true);
      else introduceFritz();
    },
    panelUsed() {
      director.fire('b_panel');
    },
    manifestoRead() {
      if (director.state().disabledObjects.includes(MANIFESTO_READ)) return;
      director.markDisabled(MANIFESTO_READ);
      director.autosave(MANIFESTO_READ);
    },
    lensesTaken() {
      director.fire('b_lenses');
    },
    update(player, circuitSolved, lensesOn) {
      if (near(player, d.places.kiosk, KIOSK_RADIUS_M)) director.fire('b2_newsstand');
      if (near(player, d.places.anvin, ANVIN_RADIUS_M) && !circuitSolved) director.fire('b_anvin');
      if (wasSolved === false && circuitSolved) {
        director.fire('b_circuit_solved', () => director.fire('b_anvin_flees', d.anvinLeave));
      }
      wasSolved = circuitSolved;
      if (lensesOn) director.fire('b_trails');
      if (ended || !lensesOn || !fired('b_trails') || !near(player, d.places.trailEnd, TRAIL_END_RADIUS_M)) return;
      ended = true;
      const finish = (): void => {
        director.autosave(ACT0_END);
        d.showEndCard();
      };
      if (!director.fire('b9_hook', finish)) finish();
    },
  };
}
