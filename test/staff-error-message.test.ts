import { describe, expect, it } from 'vitest';

import { DomainRuleError } from '../src/domain/shared/domain-errors.js';
import { staffErrorMessage } from '../src/interfaces/telegram/staff-error-message.js';

describe('staff bot error messages', () => {
  it('guides staff back to the ordered workflow for an invalid transition', () => {
    const error = new DomainRuleError('INVALID_TRANSITION', 'internal workflow detail');

    expect(staffErrorMessage(error, 'uz')).toContain('raqamlangan bosqichlarni');
    expect(staffErrorMessage(error, 'ru')).toContain('шаги по порядку');
  });

  it('explains the priority prerequisite before order creation', () => {
    const error = new DomainRuleError('PRIORITY_REQUIRED', 'internal workflow detail');

    expect(staffErrorMessage(error, 'uz')).toContain('Ustuvorlikni baholash');
    expect(staffErrorMessage(error, 'ru')).toContain('Оценить приоритет');
  });

  it('does not expose unexpected internal errors', () => {
    expect(staffErrorMessage(new Error('database credentials'), 'uz')).not.toContain(
      'database credentials',
    );
  });
});
