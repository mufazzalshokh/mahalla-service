import { describe, expect, it } from 'vitest';

import {
  referencesFromText,
  staffMenuActionForText,
} from '../src/interfaces/telegram/staff-menu.js';

describe('staff Telegram menu', () => {
  it('maps Uzbek and Russian menu buttons to the same safe actions', () => {
    expect(staffMenuActionForText('📥 So‘rovlar')).toBe('queue');
    expect(staffMenuActionForText('📥 Заявки')).toBe('queue');
    expect(staffMenuActionForText('🌐 Til')).toBe('language');
    expect(staffMenuActionForText('🌐 Язык')).toBe('language');
    expect(staffMenuActionForText('unknown')).toBeUndefined();
  });

  it('extracts only bounded generated references and removes duplicates', () => {
    expect(
      referencesFromText('ORD-2026-00000001 — active\nORD-2026-00000001\nORD-2026-00000002', 'ORD'),
    ).toEqual(['ORD-2026-00000001', 'ORD-2026-00000002']);
  });
});
