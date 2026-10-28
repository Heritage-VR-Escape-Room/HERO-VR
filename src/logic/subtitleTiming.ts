/** Seconds a subtitle line stays up: 1.2 s plus one second per 15 characters, clamped to 2..8 s. */
export function durationFor(text: string): number {
  return Math.min(8, Math.max(2, 1.2 + text.length / 15));
}
