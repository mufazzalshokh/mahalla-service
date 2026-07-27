interface StoredValue<T> {
  readonly expiresAt: number;
  readonly value: T;
}

export class TransientStore<T> {
  private readonly values = new Map<string, StoredValue<T>>();

  constructor(
    private readonly ttlMilliseconds: number,
    private readonly maximumEntries = 500,
    private readonly now: () => number = Date.now,
  ) {
    if (ttlMilliseconds <= 0 || maximumEntries <= 0) {
      throw new RangeError('Transient store limits must be positive');
    }
  }

  delete(key: string): void {
    this.values.delete(key);
  }

  get(key: string): T | undefined {
    const stored = this.values.get(key);
    if (!stored) return undefined;
    if (stored.expiresAt <= this.now()) {
      this.values.delete(key);
      return undefined;
    }
    return stored.value;
  }

  set(key: string, value: T): void {
    const now = this.now();
    for (const [candidate, stored] of this.values) {
      if (stored.expiresAt <= now) this.values.delete(candidate);
    }
    if (!this.values.has(key) && this.values.size >= this.maximumEntries) {
      const oldest = this.values.keys().next().value;
      if (oldest) this.values.delete(oldest);
    }
    this.values.delete(key);
    this.values.set(key, { expiresAt: now + this.ttlMilliseconds, value });
  }
}
