/** Bounded process-local cache. Failures and incomplete research are never retained. */
export class ResearchCache<T> {
  private readonly values = new Map<string, { value: T; expires: number }>();
  private readonly pending = new Map<string, Promise<T>>();
  private readonly maxEntries: number;
  private readonly ttlMs: number;
  private readonly now: () => number;
  constructor(maxEntries: number, ttlMs: number, now = Date.now) {
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
    this.now = now;
  }

  async run(key: string, load: () => Promise<T>, cacheable: (value: T) => boolean): Promise<T> {
    const hit = this.values.get(key);
    if (hit && hit.expires > this.now()) return structuredClone(hit.value);
    if (hit) this.values.delete(key);
    const existing = this.pending.get(key);
    if (existing) return structuredClone(await existing);
    // Do not retain an unbounded number of in-flight keys during request bursts.
    if (this.pending.size >= this.maxEntries) return load();
    const request = Promise.resolve().then(load).then(value => {
      if (cacheable(value)) {
        for (const [entryKey, entry] of this.values) if (entry.expires <= this.now()) this.values.delete(entryKey);
        if (this.values.size >= this.maxEntries) this.values.delete(this.values.keys().next().value!);
        this.values.set(key, { value: structuredClone(value), expires: this.now() + this.ttlMs });
      }
      return value;
    });
    this.pending.set(key, request);
    try { return structuredClone(await request); }
    finally { this.pending.delete(key); }
  }
}

/** Preserve input order while limiting independent upstream research calls. */
export async function mapResearch<T, R>(items: T[], concurrency: number, run: (item: T, index: number) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const result: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      try { result[index] = { status: "fulfilled", value: await run(items[index], index) }; }
      catch (reason) { result[index] = { status: "rejected", reason }; }
    }
  }));
  return result;
}
