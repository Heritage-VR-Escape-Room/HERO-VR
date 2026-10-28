/** The cipher-disc lock's logic (spec §7 beat 6, §11b). */
const A = 65;
const N = 26;
const mod = (n: number): number => ((n % N) + N) % N;

export function encode(plain: string, shift: number): string {
  return [...plain].map((ch) => String.fromCharCode(A + mod(ch.charCodeAt(0) - A + shift))).join('');
}

/**
 * The inner ring starts with A under A; `rotateRing` slides it. `isCorrect`
 * checks the tumblers only: the ring is a decoding aid.
 */
export function createCipherDisc(target = 'KARL', engraved = 'YOFZ') {
  let offset = 0;
  const tumblers = [...engraved].map(() => 0);
  return {
    ringOffset: (): number => offset,
    rotateRing(steps: number): void {
      offset = mod(offset + steps);
    },
    /** The plain letter on the inner ring beneath outer-ring letter `outer`. */
    plainUnder: (outer: string): string => String.fromCharCode(A + mod(outer.charCodeAt(0) - A - offset)),
    tumbler: (i: number): string => String.fromCharCode(A + (tumblers[i] ?? 0)),
    cycleTumbler(i: number, dir: 1 | -1): void {
      if (i >= 0 && i < tumblers.length) tumblers[i] = mod((tumblers[i] ?? 0) + dir);
    },
    isCorrect: (): boolean => tumblers.every((t, i) => String.fromCharCode(A + t) === target[i]),
  };
}
