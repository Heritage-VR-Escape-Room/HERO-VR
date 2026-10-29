/**
 * Act 0 story wiring (spec §7): turns world events into beats. The director
 * keeps every beat one-shot, so calling these twice is harmless.
 */
import type { StoryDirector } from './director';

/** Reading the manifesto is recorded as a disabled object so saves keep it. */
export const MANIFESTO_READ = 'manifesto_read';
export const ACT0_END = 'act0_end';
const KIOSK_RADIUS_M = 10;

export interface Act0Deps {
  director: Pick<StoryDirector, 'fire' | 'state' | 'markDisabled' | 'autosave'>;
  flyFritzTo: (perch: string) => void;
  showEndCard: () => void;
  kiosk: { x: number; z: number };
}

export interface Act0 {
  /** New Game (not Continue) opens with the wake beat. */
  start(newGame: boolean): void;
  lockUsed(): void;
  plaqueInspected(): void;
  manifestoRead(): void;
  /** Every tick: proximity beats, the lock opening, the ending. */
  update(player: { x: number; z: number }, lockSolved: boolean): void;
}

export function createAct0(d: Act0Deps): Act0 {
  const { director } = d;
  // The lock opening only plays when the solve happens in this session (a
  // restored save already shows the door open).
  let wasSolved: boolean | null = null;
  let ended = director.state().firedBeats.includes('b9_hook');

  const has = (list: readonly string[], id: string): boolean => list.includes(id);

  return {
    start(newGame) {
      if (newGame) director.fire('b1_wake');
    },
    lockUsed() {
      if (director.fire('b4_fritz_arrives')) d.flyFritzTo('pyramid_tip');
    },
    plaqueInspected() {
      director.fire('b5_latin_translation');
    },
    manifestoRead() {
      director.markDisabled(MANIFESTO_READ);
    },
    update(player, lockSolved) {
      if (Math.hypot(player.x - d.kiosk.x, player.z - d.kiosk.z) <= KIOSK_RADIUS_M) director.fire('b2_newsstand');
      if (wasSolved === false && lockSolved) director.fire('b7_opening');
      wasSolved = lockSolved;
      if (ended) return;
      const s = director.state();
      if (has(s.disabledObjects, 'jammer') && has(s.disabledObjects, MANIFESTO_READ) && has(s.inventory, 'ticket_printer_part')) {
        ended = true;
        const finish = (): void => {
          director.autosave(ACT0_END);
          d.showEndCard();
        };
        if (!director.fire('b9_hook', finish)) finish();
      }
    },
  };
}
