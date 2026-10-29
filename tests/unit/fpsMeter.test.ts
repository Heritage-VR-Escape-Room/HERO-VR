import { describe, it, expect } from 'vitest';
import { createBenchmark, createFpsMeter } from '../../src/logic/fpsMeter';

describe('fps meter', () => {
  it('reports frames per second over its window', () => {
    const m = createFpsMeter(3000);
    expect(m.fps()).toBe(0);
    for (let t = 0; t <= 6000; t += 1000 / 30) m.tick(t);
    expect(m.fps()).toBeCloseTo(30, 0);
  });

  it('forgets frames older than the window', () => {
    const m = createFpsMeter(1000);
    for (let t = 0; t < 1000; t += 10) m.tick(t); // 100 fps
    for (let t = 1000; t <= 3000; t += 50) m.tick(t); // 20 fps
    expect(m.fps()).toBeCloseTo(20, 0);
  });
});

describe('benchmark', () => {
  it('averages fps over the measure window after a warm-up', () => {
    const b = createBenchmark({ warmupMs: 1000, measureMs: 10_000 });
    let result: number | null = null;
    // 10 fps during warm-up (ignored), 50 fps afterwards.
    for (let t = 0; t < 1000 && result === null; t += 100) result = b.tick(t);
    for (let t = 1000; t <= 12_000 && result === null; t += 20) result = b.tick(t);
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(50, 0);
    expect(b.done()).toBe(true);
    expect(b.tick(13_000)).toBeNull(); // reports once
  });

  it('restarts the warm-up after a shader-compile stall, so stalls never count', () => {
    const b = createBenchmark({ warmupMs: 1000, measureMs: 10_000 });
    let result: number | null = null;
    let t = 0;
    for (; t < 3000 && result === null; t += 20) result = b.tick(t); // 50 fps
    t += 8000; // an 8 s stall while the first scene pipelines compile
    for (const end = t + 12_000; t <= end && result === null; t += 20) result = b.tick(t);
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(50, 0);
  });

  it('a steadily slow machine still finishes (frame gaps below the stall threshold)', () => {
    const b = createBenchmark({ warmupMs: 1000, measureMs: 10_000 });
    let result: number | null = null;
    for (let t = 0; t <= 20_000 && result === null; t += 250) result = b.tick(t); // 4 fps
    expect(result).toBeCloseTo(4, 0);
  });
});
