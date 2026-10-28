export function shouldRender(nowMs: number, lastRenderMs: number, cap: 30 | 60 | 0): boolean {
  return cap === 0 || nowMs - lastRenderMs >= 1000 / cap - 1;
}
