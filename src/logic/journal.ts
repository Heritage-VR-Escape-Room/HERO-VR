/**
 * The Travel Journal (new script §3): the part's main goal, its tasks and the
 * notes found so far, all derived from the story state, so a restored save
 * shows the same journal. Notes never spell out a puzzle answer.
 */
import type { StoryState } from './story';

export interface JournalEntry {
  key: string;
  done: boolean;
}

export interface Journal {
  partKey: string;
  goalKey: string;
  tasks: JournalEntry[];
  notes: string[];
}

export function journalFor(s: StoryState): Journal {
  const beat = (id: string): boolean => s.firedBeats.includes(id);
  const tasks: JournalEntry[] = [
    { key: 'task.anvin', done: beat('b_anvin') },
    { key: 'task.circuit', done: s.solvedPuzzles.includes('circuit_bridge') },
  ];
  if (s.solvedPuzzles.includes('circuit_bridge')) tasks.push({ key: 'task.compartment', done: s.inventory.includes('spectrum_lenses') });
  if (s.inventory.includes('spectrum_lenses')) tasks.push({ key: 'task.lenses', done: beat('b_trails') });
  if (beat('b_trails')) tasks.push({ key: 'task.trail', done: beat('b9_hook') });
  const notes = ['note.founded'];
  if (beat('b_anvin')) notes.push('note.anvin');
  if (beat('b_panel')) notes.push('note.lid');
  if (s.disabledObjects.includes('manifesto_read')) notes.push('note.manifesto');
  if (s.inventory.includes('spectrum_lenses')) notes.push('note.lenses');
  if (beat('b_trails')) notes.push('note.trails');
  return { partKey: 'journal.part.prologue', goalKey: 'journal.goal.prologue', tasks, notes };
}

/** The first task not yet done (the minimap marks it). */
export function currentTask(j: Journal): string | null {
  return j.tasks.find((t) => !t.done)?.key ?? null;
}

export const USED_KEYS: readonly string[] = [
  'journal.part.prologue',
  'journal.goal.prologue',
  'task.anvin',
  'task.circuit',
  'task.compartment',
  'task.lenses',
  'task.trail',
  'note.founded',
  'note.anvin',
  'note.lid',
  'note.manifesto',
  'note.lenses',
  'note.trails',
  'ui.journal.title',
  'ui.journal.goal',
  'ui.journal.tasks',
  'ui.journal.notes',
  'ui.journal.hint',
  'ui.journal.updated',
];
