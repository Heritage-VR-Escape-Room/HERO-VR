/** Tiered hints: each request may reveal the next tier, but no sooner than `minSecondsBetween` after the last advance. */
export function createHintScheduler(tierCount: number, minSecondsBetween = 45) {
  let tier = 0;
  let lastAdvance: number | null = null;
  return {
    request(nowSec: number): number {
      if (lastAdvance === null) {
        lastAdvance = nowSec;
      } else if (tier < tierCount - 1 && nowSec - lastAdvance >= minSecondsBetween) {
        tier++;
        lastAdvance = nowSec;
      }
      return tier;
    },
    current: () => tier,
  };
}
