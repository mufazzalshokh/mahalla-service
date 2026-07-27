/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, it, vi } from 'vitest';

import { formatOperationalReport } from '../src/application/reporting/report-format.js';
import type { ReportingRepository } from '../src/application/reporting/reporting-repository.js';
import { ReportingService } from '../src/application/reporting/reporting-service.js';
import type { Principal } from '../src/domain/identity/permissions.js';
import type { OperationalReport } from '../src/domain/reporting/operational-report.js';
import { createReportingPeriod } from '../src/domain/reporting/reporting-period.js';

const now = new Date('2026-07-30T10:00:00Z');
const report: OperationalReport = {
  complaints: {
    closedInPeriod: 1,
    created: 2,
    openBacklog: 1,
    overdueOpen: 1,
    reopened: 1,
    withinWarranty: 2,
  },
  generatedAt: now,
  pdca: { active: 2, completedInPeriod: 1, createdInPeriod: 3, overdue: 1 },
  period: createReportingPeriod('WEEK', now),
  portfolio: {
    activeBacklog: 4,
    cancelled: 1,
    completed: 2,
    completionToIntakePercent: 50,
    ordersCreated: 3,
    overdueActive: 1,
    requestsReceived: 4,
    urgentOrdersCreated: 1,
  },
  quality: {
    acceptanceCount: 2,
    averageRating: 4.5,
    feedbackCount: 2,
    inspectionCount: 3,
    inspectionPassPercent: 66.7,
    reworkCount: 1,
  },
  repeatProblems: {
    confirmedDuplicatePairs: 1,
    consolidatedOrders: 1,
    consolidatedRequests: 2,
    topCategories: [
      {
        categoryCode: '=DANGER',
        complaintCount: 1,
        confirmedDuplicateCount: 1,
        requestCount: 3,
        reworkCount: 1,
      },
    ],
  },
  serviceAreaCount: 1,
  sla: {
    activePaused: 1,
    averageCompletionHours: 6.5,
    completedLate: 1,
    completedOnTime: 1,
    escalationCount: 2,
    onTimePercent: 50,
  },
};

function principal(permission: 'report.read' | 'report.export'): Principal {
  return { grants: [{ permission, serviceAreaId: 'area-1' }], userId: 'staff' };
}

describe('ReportingService', () => {
  it('generates a scoped summary and a spreadsheet-safe CSV document', async () => {
    const repository: ReportingRepository = { generate: vi.fn().mockResolvedValue(report) };
    const service = new ReportingService(repository, () => now);
    await expect(service.report('WEEK', principal('report.read'))).resolves.toBe(report);
    expect(repository.generate).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'WEEK' }),
      ['area-1'],
    );
    const exported = await service.exportCsv('MONTH', principal('report.export'));
    expect(exported.fileName).toBe('mck-month-01.07.2026.csv');
    expect(exported.content).toContain('category:=DANGER');
    expect(exported.content).toMatch(/\r\n$/u);
    expect(formatOperationalReport(report)).toContain('SLA — vaqtida 1');
    expect(formatOperationalReport(report, 'ru')).toContain('SLA — вовремя 1');
  });

  it('keeps read and export permissions separate', async () => {
    const service = new ReportingService({ generate: vi.fn() }, () => now);
    await expect(service.report('WEEK', { grants: [], userId: 'x' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(service.exportCsv('WEEK', principal('report.read'))).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});
