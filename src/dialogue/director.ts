/**
 * Owns the StoryState. Fires one-shot beats, records puzzle/object/item
 * changes, autosaves, and restores a save by re-applying world changes through
 * registries (without replaying any beat).
 */
import type { Inventory } from '../logic/inventory';
import type { SaveData } from '../logic/save';
import { canFire, initialStory, reduce, storyFromSave, type StoryEvent, type StoryState } from '../logic/story';
import { BEATS } from './beats';
import type { Line } from './runner';

export interface StoryDirectorDeps {
  runner: { play(lines: readonly Line[], onDone?: () => void): void };
  save: { save(d: Omit<SaveData, 'version' | 'savedAtUtc'>): void };
  /** When given, every item added to it is recorded, and restore refills it. */
  inventory?: Inventory;
  beats?: Record<string, Line[]>;
}

export class StoryDirector {
  private s: StoryState = initialStory();
  private readonly puzzles = new Map<string, () => void>();
  private readonly disableables = new Map<string, () => void>();
  private readonly beats: Record<string, Line[]>;

  constructor(private readonly deps: StoryDirectorDeps) {
    this.beats = deps.beats ?? BEATS;
    deps.inventory?.onAdd((id) => this.apply({ type: 'item', id }));
  }

  state(): StoryState {
    return this.s;
  }

  /** Play a one-shot beat. Returns false if it already fired or doesn't exist. */
  fire(beatId: string, onDone?: () => void): boolean {
    const lines = this.beats[beatId];
    if (!lines || !canFire(this.s, beatId)) return false;
    this.apply({ type: 'beat', id: beatId });
    this.deps.runner.play(lines, onDone);
    return true;
  }

  /** Play a repeatable line set (barks); nothing is recorded. */
  say(id: string, onDone?: () => void): boolean {
    const lines = this.beats[id];
    if (!lines) return false;
    this.deps.runner.play(lines, onDone);
    return true;
  }

  markSolved(id: string): void {
    this.apply({ type: 'solved', id });
  }

  markDisabled(id: string): void {
    this.apply({ type: 'disabled', id });
  }

  addItem(id: string): void {
    this.apply({ type: 'item', id });
    this.deps.inventory?.add(id);
  }

  autosave(checkpointId: string): void {
    this.apply({ type: 'checkpoint', id: checkpointId });
    const { firedBeats, solvedPuzzles, disabledObjects, inventory } = this.s;
    this.deps.save.save({ checkpointId, firedBeats, solvedPuzzles, disabledObjects, inventory });
  }

  /** A puzzle that can be put straight into its solved state. Applied now if the story already has it solved. */
  registerPuzzle(id: string, forceSolved: () => void): void {
    this.puzzles.set(id, forceSolved);
    if (this.s.solvedPuzzles.includes(id)) forceSolved();
  }

  /** A world object that a save can switch off (picked up, shut down). Applied now if already disabled. */
  registerDisableable(id: string, disable: () => void): void {
    this.disableables.set(id, disable);
    if (this.s.disabledObjects.includes(id)) disable();
  }

  restore(save: SaveData): void {
    this.s = storyFromSave(save);
    for (const id of this.s.disabledObjects) this.disableables.get(id)?.();
    for (const id of this.s.solvedPuzzles) this.puzzles.get(id)?.();
    for (const id of this.s.inventory) this.deps.inventory?.add(id);
  }

  private apply(e: StoryEvent): void {
    this.s = reduce(this.s, e);
  }
}
