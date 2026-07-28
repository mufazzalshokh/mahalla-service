import { describe, expect, it } from 'vitest';

import {
  isManualAddressButton,
  residentMainMenu,
  residentMenuActionForText,
} from '../src/interfaces/telegram/resident-menu.js';

describe('resident Telegram menu', () => {
  it('maps Uzbek and Russian menu labels to safe actions', () => {
    expect(residentMenuActionForText('🛠 Yangi so‘rov')).toBe('new-request');
    expect(residentMenuActionForText('🔎 Проверить статус')).toBe('status');
    expect(residentMenuActionForText('unknown')).toBeUndefined();
  });

  it('renders a persistent two-language main menu', () => {
    expect(residentMainMenu('uz').keyboard).toHaveLength(2);
    expect(residentMainMenu('ru').keyboard[0]?.[0]).toMatchObject({ text: '🛠 Новая заявка' });
  });

  it('recognizes only the controlled manual-address buttons', () => {
    expect(isManualAddressButton('⌨️ Manzilni yozish')).toBe(true);
    expect(isManualAddressButton('⌨️ Ввести адрес')).toBe(true);
    expect(isManualAddressButton('Some address')).toBe(false);
  });
});
