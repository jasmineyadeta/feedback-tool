/** In-isolate sliding-window limiter. Phase A runs a single local isolate, so this is exact there. */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}
  take(key: string, now = Date.now()): boolean {
    const from = now - this.windowMs;
    const arr = (this.hits.get(key) ?? []).filter((t) => t > from);
    if (arr.length >= this.max) {
      this.hits.set(key, arr);
      return false;
    }
    arr.push(now);
    this.hits.set(key, arr);
    if (this.hits.size > 10_000) this.hits.delete(this.hits.keys().next().value!);
    return true;
  }
}
