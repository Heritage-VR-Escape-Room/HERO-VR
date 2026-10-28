/**
 * Story state as a pure reducer. Every list is a set kept in event order, so
 * replaying an event is a no-op and returns the same state object.
 */
import type { SaveData } from './save';

export interface StoryState {
  firedBeats: string[];
  solvedPuzzles: string[];
  disabledObjects: string[];
  inventory: string[];
  checkpointId: string;
}

export type StoryEvent =
  | { type: 'beat'; id: string }
  | { type: 'solved'; id: string }
  | { type: 'disabled'; id: string }
  | { type: 'item'; id: string }
  | { type: 'checkpoint'; id: string };

const LIST: Record<Exclude<StoryEvent['type'], 'checkpoint'>, keyof Omit<StoryState, 'checkpointId'>> = {
  beat: 'firedBeats',
  solved: 'solvedPuzzles',
  disabled: 'disabledObjects',
  item: 'inventory',
};

export const START_CHECKPOINT = 'start';

export function initialStory(): StoryState {
  return { firedBeats: [], solvedPuzzles: [], disabledObjects: [], inventory: [], checkpointId: START_CHECKPOINT };
}

export function reduce(s: StoryState, e: StoryEvent): StoryState {
  if (e.type === 'checkpoint') return s.checkpointId === e.id ? s : { ...s, checkpointId: e.id };
  const key = LIST[e.type];
  if (s[key].includes(e.id)) return s;
  return { ...s, [key]: [...s[key], e.id] };
}

export function canFire(s: StoryState, beatId: string): boolean {
  return !s.firedBeats.includes(beatId);
}

export function storyFromSave(d: SaveData): StoryState {
  return {
    firedBeats: [...d.firedBeats],
    solvedPuzzles: [...d.solvedPuzzles],
    disabledObjects: [...d.disabledObjects],
    inventory: [...d.inventory],
    checkpointId: d.checkpointId,
  };
}
