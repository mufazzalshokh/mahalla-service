import type { OperationalReport } from '../../domain/reporting/operational-report.js';
import { csvRow } from '../../domain/reporting/csv-policy.js';

function shown(value: number | null, suffix = ''): string {
  return value === null ? 'N/A' : `${value}${suffix}`;
}

function metricEntries(value: object): readonly (readonly [string, number | null])[] {
  return Object.entries(value) as readonly (readonly [string, number | null])[];
}

export function formatOperationalReport(report: OperationalReport): string {
  const { complaints, pdca, portfolio, quality, repeatProblems, sla } = report;
  const categories = repeatProblems.topCategories.length
    ? repeatProblems.topCategories
        .map(
          ({ categoryCode, complaintCount, confirmedDuplicateCount, requestCount, reworkCount }) =>
            `${categoryCode}: ${requestCount} req / ${confirmedDuplicateCount} dup / ${complaintCount} cmp / ${reworkCount} rework`,
        )
        .join('\n')
    : 'No category activity';
  return [
    report.period.label,
    `Areas: ${report.serviceAreaCount}`,
    `Portfolio — requests ${portfolio.requestsReceived}, orders ${portfolio.ordersCreated}, completed ${portfolio.completed}, cancelled ${portfolio.cancelled}, backlog ${portfolio.activeBacklog}, overdue ${portfolio.overdueActive}, urgent ${portfolio.urgentOrdersCreated}, completion/intake ${shown(portfolio.completionToIntakePercent, '%')}`,
    `SLA — on time ${sla.completedOnTime}, late ${sla.completedLate}, attainment ${shown(sla.onTimePercent, '%')}, avg completion ${shown(sla.averageCompletionHours, 'h')}, paused ${sla.activePaused}, escalations ${sla.escalationCount}`,
    `Quality — inspections ${quality.inspectionCount}, pass ${shown(quality.inspectionPassPercent, '%')}, acceptances ${quality.acceptanceCount}, rework ${quality.reworkCount}, feedback ${quality.feedbackCount}, avg rating ${shown(quality.averageRating)}`,
    `Complaints — created ${complaints.created}, closed ${complaints.closedInPeriod}, open ${complaints.openBacklog}, overdue ${complaints.overdueOpen}, reopened ${complaints.reopened}, in warranty ${complaints.withinWarranty}`,
    `Repeat — confirmed pairs ${repeatProblems.confirmedDuplicatePairs}, consolidated orders ${repeatProblems.consolidatedOrders}, linked requests ${repeatProblems.consolidatedRequests}`,
    categories,
    `PDCA — created ${pdca.createdInPeriod}, completed ${pdca.completedInPeriod}, active ${pdca.active}, overdue ${pdca.overdue}`,
  ].join('\n');
}

export function operationalReportCsv(report: OperationalReport): string {
  const rows: (readonly (string | number | null)[])[] = [
    ['period', 'section', 'metric', 'value', 'unit'],
  ];
  const add = (section: string, metric: string, value: number | null, unit = 'count'): void => {
    rows.push([report.period.label, section, metric, value, unit]);
  };
  add('scope', 'service_area_count', report.serviceAreaCount);
  for (const [metric, value] of metricEntries(report.portfolio)) {
    add('portfolio', metric, value, metric.endsWith('Percent') ? 'percent' : 'count');
  }
  for (const [metric, value] of metricEntries(report.sla)) {
    add(
      'sla',
      metric,
      value,
      metric.endsWith('Percent') ? 'percent' : metric.endsWith('Hours') ? 'hours' : 'count',
    );
  }
  for (const [metric, value] of metricEntries(report.quality)) {
    add(
      'quality',
      metric,
      value,
      metric.endsWith('Percent') ? 'percent' : metric === 'averageRating' ? 'rating_1_5' : 'count',
    );
  }
  for (const [metric, value] of metricEntries(report.complaints)) {
    add('complaints', metric, value);
  }
  add('repeat', 'confirmedDuplicatePairs', report.repeatProblems.confirmedDuplicatePairs);
  add('repeat', 'consolidatedOrders', report.repeatProblems.consolidatedOrders);
  add('repeat', 'consolidatedRequests', report.repeatProblems.consolidatedRequests);
  for (const category of report.repeatProblems.topCategories) {
    add(`category:${category.categoryCode}`, 'requests', category.requestCount);
    add(
      `category:${category.categoryCode}`,
      'confirmedDuplicates',
      category.confirmedDuplicateCount,
    );
    add(`category:${category.categoryCode}`, 'complaints', category.complaintCount);
    add(`category:${category.categoryCode}`, 'rework', category.reworkCount);
  }
  for (const [metric, value] of metricEntries(report.pdca)) add('pdca', metric, value);
  return `${rows.map(csvRow).join('\r\n')}\r\n`;
}
