/**
 * Picks the next footstep variant: random, never the same one twice in a row,
 * with a slight random pitch so repeats don't sound mechanical.
 */
export interface Picker {
  next(): { index: number; pitch: number };
}

export function createPicker(count: number, random: () => number = Math.random): Picker {
  let last = -1;
  return {
    next() {
      let index = 0;
      if (count > 1) {
        // Draw from the others and skip past the last one.
        index = Math.floor(random() * (count - 1));
        if (index >= last && last >= 0) index++;
      }
      last = index;
      return { index, pitch: 0.95 + random() * 0.1 };
    },
  };
}
