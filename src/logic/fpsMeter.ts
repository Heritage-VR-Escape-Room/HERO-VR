/** Rendered-frame rate over a sliding window of render timestamps (ms). */
export function createFpsMeter(windowMs = 3000) {
  const stamps: number[] = [];
  return {
    tick(t: number): void {
      stamps.push(t);
      while (stamps.length > 0 && stamps[0]! < t - windowMs) stamps.shift();
    },
    /** Frames per second across the stamps still inside the window. */
    fps(): number {
      if (stamps.length < 2) return 0;
      const span = stamps[stamps.length - 1]! - stamps[0]!;
      return span > 0 ? ((stamps.length - 1) * 1000) / span : 0;
    },
  };
}

/** A gap between frames this long is a stall (pipelines compiling), not the machine's frame rate. */
export const BENCH_STALL_MS = 1000;

/**
 * First-launch benchmark: ignores a warm-up (shader compiles), then counts
 * frames for `measureMs` and reports the average fps once. A stall (a frame
 * gap of BENCH_STALL_MS or more, e.g. the first frames of a big scene
 * compiling) restarts the warm-up, so stalls never count against the machine.
 */
export function createBenchmark({ warmupMs, measureMs }: { warmupMs: number; measureMs: number }) {
  let start: number | null = null;
  let last: number | null = null;
  let frames = 0;
  let finished = false;
  return {
    /** Feed every rendered frame; returns the average fps on the frame that completes the run, else null. */
    tick(t: number): number | null {
      if (finished) return null;
      if (last !== null && t - last >= BENCH_STALL_MS) {
        start = t;
        frames = 0;
      }
      last = t;
      start ??= t;
      const from = start + warmupMs;
      if (t < from) return null;
      if (t >= from + measureMs) {
        finished = true;
        return (frames * 1000) / measureMs;
      }
      frames++;
      return null;
    },
    done: () => finished,
    cancel(): void {
      finished = true;
    },
  };
}
