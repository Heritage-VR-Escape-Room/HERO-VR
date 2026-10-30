import { describe, expect, it } from 'vitest';
import { currentTask, journalFor } from '../../src/logic/journal';
import { initialStory, reduce } from '../../src/logic/story';

describe('travel journal', () => {
  it('starts with the prologue goal, the founding note and the first tasks', () => {
    const j = journalFor(initialStory());
    expect(j.goalKey).toBe('journal.goal.prologue');
    expect(j.notes).toEqual(['note.founded']);
    expect(j.tasks.map((t) => t.key)).toEqual(['task.anvin', 'task.circuit']);
    expect(currentTask(j)).toBe('task.anvin');
  });

  it('grows with the story and ticks tasks off', () => {
    let s = initialStory();
    for (const id of ['b_anvin', 'b_panel']) s = reduce(s, { type: 'beat', id });
    s = reduce(s, { type: 'solved', id: 'circuit_bridge' });
    let j = journalFor(s);
    expect(currentTask(j)).toBe('task.compartment');
    expect(j.notes).toContain('note.lid');
    s = reduce(s, { type: 'item', id: 'spectrum_lenses' });
    s = reduce(s, { type: 'beat', id: 'b_trails' });
    j = journalFor(s);
    expect(currentTask(j)).toBe('task.trail');
    expect(j.notes).toEqual(['note.founded', 'note.anvin', 'note.lid', 'note.lenses', 'note.trails']);
    s = reduce(s, { type: 'beat', id: 'b9_hook' });
    expect(currentTask(journalFor(s))).toBeNull();
  });
});
