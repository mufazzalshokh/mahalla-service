import { describe, expect, it } from 'vitest';

import { staffMessage, staffStatus } from '../src/application/triage/staff-messages.js';

describe('staff message localization', () => {
  it('renders equivalent Uzbek and Russian operation results', () => {
    expect(staffMessage('uz', 'validation_started', { reference: 'MCK-1' })).toContain('tekshiruv');
    expect(staffMessage('ru', 'validation_started', { reference: 'MCK-1' })).toContain('проверка');
    expect(staffStatus('uz', 'IN_PROGRESS')).toBe('bajarilmoqda');
    expect(staffStatus('ru', 'IN_PROGRESS')).toBe('в работе');
  });
});
