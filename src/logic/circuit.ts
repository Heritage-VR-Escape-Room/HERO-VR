/**
 * Act 0 Circuit Bridge (new script §6): a 4-node board on the pyramid's
 * panel. Power enters at node A. Copper traces: A-C round the outer edge
 * (switch 1), C-D along the bottom (fixed), D-B through the centre bridge slot
 * (switch 4). Anvin's crossed red wires ground A (switch 2) and C (switch 3):
 * closing one while its node is live shorts the board. The blue jumper (the
 * missing middle fuse's stand-in) carries B to the output only from the
 * top-right terminal.
 */

export type Node = 'A' | 'B' | 'C' | 'D' | 'OUT' | 'GND';
export type Terminal = 'TL' | 'TR' | 'BL' | 'BR';
export const TERMINALS: readonly Terminal[] = ['TL', 'TR', 'BL', 'BR'];

export interface Circuit {
  /** Switches 1-4 (index 0-3); true = closed. */
  switches: [boolean, boolean, boolean, boolean];
  jumper: Terminal;
}

/** Edges: [from, to, switch index or null for fixed]. */
export const EDGES: ReadonlyArray<readonly [Node, Node, number | null]> = [
  ['A', 'C', 0],
  ['A', 'GND', 1],
  ['C', 'GND', 2],
  ['D', 'B', 3],
  ['C', 'D', null],
];

export function initialCircuit(): Circuit {
  return { switches: [false, false, false, false], jumper: 'BR' };
}

export function toggle(c: Circuit, i: number): Circuit {
  const switches = [...c.switches] as Circuit['switches'];
  switches[i] = !switches[i];
  return { ...c, switches };
}

export function plug(c: Circuit, t: Terminal): Circuit {
  return { ...c, jumper: t };
}

export interface Evaluation {
  /** Live nodes in the order power reaches them (empty of GND). */
  live: Node[];
  /** A live node is grounded through a crossed red wire. */
  short: boolean;
  /** Closed edges carrying power, as "X-Y". */
  liveEdges: string[];
}

export function evaluate(c: Circuit): Evaluation {
  const edges: Array<[Node, Node]> = EDGES.filter(([, , sw]) => sw === null || c.switches[sw]).map(([a, b]) => [a, b]);
  if (c.jumper === 'TR') edges.push(['B', 'OUT']);
  const live: Node[] = ['A'];
  const liveEdges: string[] = [];
  let short = false;
  for (let i = 0; i < live.length; i++) {
    const n = live[i]!;
    for (const [a, b] of edges) {
      const other = a === n ? b : b === n ? a : null;
      if (!other) continue;
      if (!liveEdges.includes(`${a}-${b}`)) liveEdges.push(`${a}-${b}`);
      if (other === 'GND') short = true;
      else if (!live.includes(other)) live.push(other);
    }
  }
  return { live, short, liveEdges };
}

export function isSolved(c: Circuit): boolean {
  const e = evaluate(c);
  return !e.short && e.live.includes('OUT');
}
