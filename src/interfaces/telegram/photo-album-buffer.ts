interface PendingBatch<T> {
  readonly items: T[];
  timer: NodeJS.Timeout;
}

export class PhotoAlbumBuffer<T> {
  private readonly batches = new Map<string, PendingBatch<T>>();

  constructor(
    private readonly onFlush: (items: readonly T[]) => Promise<void>,
    private readonly onError: (error: unknown, items: readonly T[]) => void,
    private readonly delayMilliseconds = 650,
    private readonly maximumGroups = 500,
  ) {}

  add(key: string, item: T): void {
    const existing = this.batches.get(key);
    if (existing) {
      clearTimeout(existing.timer);
      existing.items.push(item);
      existing.timer = this.timer(key);
      return;
    }

    if (this.batches.size >= this.maximumGroups) {
      const oldest = this.batches.keys().next().value;
      if (oldest) this.flush(oldest);
    }
    this.batches.set(key, { items: [item], timer: this.timer(key) });
  }

  private timer(key: string): NodeJS.Timeout {
    return setTimeout(() => this.flush(key), this.delayMilliseconds);
  }

  private flush(key: string): void {
    const batch = this.batches.get(key);
    if (!batch) return;
    clearTimeout(batch.timer);
    this.batches.delete(key);
    void this.onFlush(batch.items).catch((error: unknown) => this.onError(error, batch.items));
  }
}
