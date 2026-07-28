import { afterEach, describe, expect, it, vi } from 'vitest';

import { PhotoAlbumBuffer } from '../src/interfaces/telegram/photo-album-buffer.js';

describe('resident photo album buffer', () => {
  afterEach(() => vi.useRealTimers());

  it('flushes several album photos once after the final photo', async () => {
    vi.useFakeTimers();
    const flush = vi.fn().mockResolvedValue(undefined);
    const buffer = new PhotoAlbumBuffer<number>(flush, vi.fn(), 650);
    buffer.add('resident:album', 1);
    await vi.advanceTimersByTimeAsync(400);
    buffer.add('resident:album', 2);
    await vi.advanceTimersByTimeAsync(649);
    expect(flush).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(flush).toHaveBeenCalledOnce();
    expect(flush).toHaveBeenCalledWith([1, 2]);
  });

  it('keeps different resident albums separate', async () => {
    vi.useFakeTimers();
    const flush = vi.fn().mockResolvedValue(undefined);
    const buffer = new PhotoAlbumBuffer<number>(flush, vi.fn(), 10);
    buffer.add('resident-1:album', 1);
    buffer.add('resident-2:album', 2);
    await vi.advanceTimersByTimeAsync(10);
    expect(flush).toHaveBeenCalledTimes(2);
  });
});
