// Limits apply to this API process. Entries expire and the map has a hard bound.
export class McpLimits {
  private readonly entries = new Map<
    string,
    { resetAt: number; count: number; active: number }
  >();

  acquire(keys: string[], limit: number, concurrency: number) {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= now && entry.active === 0) this.entries.delete(key);
    }
    const entries = keys.map((key) => {
      let entry = this.entries.get(key);
      if (!entry) {
        if (this.entries.size >= 2000) return null;
        entry = { resetAt: now + 60_000, count: 0, active: 0 };
        this.entries.set(key, entry);
      }
      if (entry.resetAt <= now) {
        entry.resetAt = now + 60_000;
        entry.count = 0;
      }
      return entry;
    });
    if (
      entries.some(
        (entry) =>
          !entry || entry.count >= limit || entry.active >= concurrency,
      )
    )
      return null;
    for (const entry of entries) {
      if (entry) {
        entry.count++;
        entry.active++;
      }
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      for (const entry of entries) if (entry) entry.active--;
    };
  }
}
