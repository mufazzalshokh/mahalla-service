import { describe, expect, it } from 'vitest';

import {
  referencesFromText,
  requestActions,
  staffFinanceMenu,
  staffAccessActions,
  staffAccessListMenu,
  staffMenuActionForText,
} from '../src/interfaces/telegram/staff-menu.js';

describe('staff Telegram menu', () => {
  it('maps Uzbek and Russian menu buttons to the same safe actions', () => {
    expect(staffMenuActionForText('📥 So‘rovlar')).toBe('queue');
    expect(staffMenuActionForText('📥 Заявки')).toBe('queue');
    expect(staffMenuActionForText('🌐 Til')).toBe('language');
    expect(staffMenuActionForText('🌐 Язык')).toBe('language');
    expect(staffMenuActionForText('👥 Xodimlar')).toBe('staff');
    expect(staffMenuActionForText('💰 Moliya')).toBe('finance');
    expect(staffMenuActionForText('💰 Финансы')).toBe('finance');
    expect(staffMenuActionForText('unknown')).toBeUndefined();
  });

  it('offers bilingual guided commercial actions without raw command buttons', () => {
    const callbacks = staffFinanceMenu('uz')
      .inline_keyboard.flat()
      .map((button) => ('callback_data' in button ? button.callback_data : undefined));
    expect(callbacks).toEqual([
      'finance:summary',
      'finance:configure',
      'finance:quote',
      'finance:acceptquote',
      'finance:contract',
      'finance:certificate',
      'finance:payment',
      'finance:expense',
      'finance:document',
    ]);
  });

  it('provides add, suspend and restore staff controls without Telegram IDs in callbacks', () => {
    expect(staffAccessListMenu(['STF-2026-00000001'], 'uz').inline_keyboard).toEqual([
      [{ callback_data: 'staff:add', text: '➕ Xodim qo‘shish' }],
      [{ callback_data: 'entity:staff:STF-2026-00000001', text: 'STF-2026-00000001' }],
    ]);
    expect(staffAccessActions('STF-2026-00000001', 'ru').inline_keyboard.flat()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ callback_data: 'prompt:suspendstaff:STF-2026-00000001' }),
        expect.objectContaining({ callback_data: 'action:restorestaff:STF-2026-00000001' }),
      ]),
    );
  });

  it('extracts only bounded generated references and removes duplicates', () => {
    expect(
      referencesFromText('ORD-2026-00000001 — active\nORD-2026-00000001\nORD-2026-00000002', 'ORD'),
    ).toEqual(['ORD-2026-00000001', 'ORD-2026-00000002']);
  });

  it('offers bilingual request details before mutation actions', () => {
    expect(requestActions('MCK-1', 'uz').inline_keyboard[0]?.[0]).toMatchObject({
      callback_data: 'action:details:MCK-1',
      text: '👁 Tafsilotlar',
    });
    expect(requestActions('MCK-1', 'ru').inline_keyboard[0]?.[0]).toMatchObject({
      text: '👁 Подробности',
    });
  });
});
