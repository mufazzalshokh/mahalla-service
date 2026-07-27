import { describe, expect, it } from 'vitest';

import { TransientStore } from '../src/interfaces/telegram/transient-store.js';

describe('Telegram transient state store', () => {
  it('expires guided state and evicts the oldest entry at its bound', () => {
    let now = 1_000;
    const store = new TransientStore<string>(100, 2, () => now);
    store.set('a', 'one');
    store.set('b', 'two');
    store.set('c', 'three');
    expect(store.get('a')).toBeUndefined();
    expect(store.get('b')).toBe('two');
    now = 1_101;
    expect(store.get('b')).toBeUndefined();
    expect(store.get('c')).toBeUndefined();
  });

  it('rejects unsafe limits', () => {
    expect(() => new TransientStore(0)).toThrow(RangeError);
    expect(() => new TransientStore(1, 0)).toThrow(RangeError);
  });
});
