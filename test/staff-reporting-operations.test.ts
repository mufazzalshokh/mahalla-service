import { describe, expect, it, vi } from 'vitest';

import {
  StaffOperationsService,
  type StaffOperationDependencies,
} from '../src/application/triage/staff-operations-service.js';
import type { Principal } from '../src/domain/identity/permissions.js';
import type { OperationalReport } from '../src/domain/reporting/operational-report.js';
import { createReportingPeriod } from '../src/domain/reporting/reporting-period.js';

const now = new Date('2026-07-30T10:00:00Z');
const principal: Principal = {
  grants: [
    { permission: 'report.read', serviceAreaId: 'area-1' },
    { permission: 'report.export', serviceAreaId: 'area-1' },
    { permission: 'pdca.manage', serviceAreaId: 'area-1' },
  ],
  userId: 'staff',
};
const report: OperationalReport = {
  complaints: {
    closedInPeriod: 0,
    created: 0,
    openBacklog: 0,
    overdueOpen: 0,
    reopened: 0,
    withinWarranty: 0,
  },
  generatedAt: now,
  pdca: { active: 1, completedInPeriod: 0, createdInPeriod: 1, overdue: 1 },
  period: createReportingPeriod('WEEK', now),
  portfolio: {
    activeBacklog: 0,
    cancelled: 0,
    completed: 0,
    completionToIntakePercent: null,
    ordersCreated: 0,
    overdueActive: 0,
    requestsReceived: 0,
    urgentOrdersCreated: 0,
  },
  quality: {
    acceptanceCount: 0,
    averageRating: null,
    feedbackCount: 0,
    inspectionCount: 0,
    inspectionPassPercent: null,
    reworkCount: 0,
  },
  repeatProblems: {
    confirmedDuplicatePairs: 0,
    consolidatedOrders: 0,
    consolidatedRequests: 0,
    topCategories: [],
  },
  serviceAreaCount: 1,
  sla: {
    activePaused: 0,
    averageCompletionHours: null,
    completedLate: 0,
    completedOnTime: 0,
    escalationCount: 0,
    onTimePercent: null,
  },
};
const action = {
  code: 'PDC-2026-00000001',
  completedAt: null,
  createdAt: now,
  dueAt: new Date('2026-08-01T10:00:00Z'),
  expectedOutcome: 'No leak',
  id: 'action-1',
  ownerUserId: principal.userId,
  plannedAction: 'Replace pipe',
  problemStatement: 'Pipe leaks',
  result: null,
  serviceAreaId: 'area-1',
  stage: 'PLAN' as const,
  title: 'Stop leak',
  version: 0,
};

describe('staff reporting and PDCA operations', () => {
  it('formats summaries, returns CSV documents, and dispatches the PDCA lifecycle', async () => {
    const pdca = {
      create: vi.fn().mockResolvedValue(action),
      list: vi
        .fn()
        .mockResolvedValueOnce([{ ...action, overdue: true }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ ...action, overdue: false }]),
      transition: vi.fn().mockResolvedValue({ ...action, stage: 'DO' }),
    };
    const reporting = {
      exportCsv: vi.fn().mockResolvedValue({ content: 'header\r\n', fileName: 'report.csv' }),
      report: vi.fn().mockResolvedValue(report),
    };
    const dependencies = {
      pdca,
      principals: { loadByTelegramUserId: vi.fn().mockResolvedValue(principal) },
      reporting,
    } as unknown as StaffOperationDependencies;
    const service = new StaffOperationsService(dependencies);

    await expect(service.execute(1n, { kind: 'report', period: 'WEEK' })).resolves.toContain(
      'Toifalar bo‘yicha faollik yo‘q',
    );
    await expect(service.execute(1n, { kind: 'report-export', period: 'MONTH' })).resolves.toEqual({
      caption: 'Oylik operatsion hisobot',
      content: 'header\r\n',
      fileName: 'report.csv',
      kind: 'document',
    });
    await expect(service.execute(1n, { kind: 'pdca-list' })).resolves.toContain('MUDDAT O‘TGAN');
    await expect(service.execute(1n, { kind: 'pdca-list' })).resolves.toContain('Faol PDCA');
    await expect(service.execute(1n, { kind: 'pdca-list' })).resolves.not.toContain(
      'MUDDAT O‘TGAN',
    );
    await expect(
      service.execute(1n, {
        areaCode: 'DEMO',
        input: {
          dueAt: action.dueAt,
          expectedOutcome: action.expectedOutcome,
          plannedAction: action.plannedAction,
          problemStatement: action.problemStatement,
          title: action.title,
        },
        kind: 'pdca-create',
      }),
    ).resolves.toContain('PDCA PLAN');
    await expect(
      service.execute(1n, {
        code: action.code,
        kind: 'pdca-transition',
        reason: 'Work started',
        to: 'DO',
      }),
    ).resolves.toContain('bajarish');
    await expect(service.execute(1n, { kind: 'report', period: 'WEEK' }, 'ru')).resolves.toContain(
      'Нет активности по категориям',
    );
    expect(reporting.report).toHaveBeenCalledWith('WEEK', principal);
    expect(reporting.exportCsv).toHaveBeenCalledWith('MONTH', principal);
    expect(pdca.create).toHaveBeenCalledOnce();
    expect(pdca.transition).toHaveBeenCalledOnce();
  });
});
