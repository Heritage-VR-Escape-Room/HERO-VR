/**
 * Fixed-timestep accumulator. `advance` runs `step(h)` as many times as the
 * elapsed time allows (at most `maxSubsteps`, dropping any backlog beyond
 * that) and returns the interpolation fraction of the leftover time.
 */
export function createFixedStep(hz = 60, maxSubsteps = 5) {
  const h = 1 / hz;
  let acc = 0;
  return {
    advance(dtSec: number, step: (dt: number) => void): number {
      acc += Math.max(0, dtSec);
      let n = 0;
      // Small epsilon so float drift in the accumulator doesn't skip a due step.
      while (acc >= h - 1e-9 && n < maxSubsteps) {
        step(h);
        acc -= h;
        n++;
      }
      if (n === maxSubsteps && acc >= h) acc = 0; // too far behind: drop the backlog
      acc = Math.max(0, acc);
      return acc / h;
    },
  };
}
