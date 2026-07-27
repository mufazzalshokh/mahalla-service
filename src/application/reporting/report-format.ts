import type { OperationalReport } from '../../domain/reporting/operational-report.js';
import { csvRow } from '../../domain/reporting/csv-policy.js';
import { formatTashkentDate } from '../../domain/shared/tashkent-date-time.js';
import type { BotLanguage } from '../localization/bot-language.js';

function shown(value: number | null, suffix = ''): string {
  return value === null ? 'N/A' : `${value}${suffix}`;
}

function metricEntries(value: object): readonly (readonly [string, number | null])[] {
  return Object.entries(value) as readonly (readonly [string, number | null])[];
}

export function formatOperationalReport(
  report: OperationalReport,
  language: BotLanguage = 'uz',
): string {
  const { complaints, pdca, portfolio, quality, repeatProblems, sla } = report;
  const periodLabel =
    language === 'ru'
      ? `${report.period.kind === 'WEEK' ? 'Неделя' : 'Месяц'}: ${formatTashkentDate(report.period.startInclusive)}–${formatTashkentDate(report.period.asOf)}`
      : report.period.label;
  const categories = repeatProblems.topCategories.length
    ? repeatProblems.topCategories
        .map(
          ({ categoryCode, complaintCount, confirmedDuplicateCount, requestCount, reworkCount }) =>
            language === 'ru'
              ? `${categoryCode}: заявок ${requestCount} / повторов ${confirmedDuplicateCount} / жалоб ${complaintCount} / доработок ${reworkCount}`
              : `${categoryCode}: so‘rov ${requestCount} / takror ${confirmedDuplicateCount} / shikoyat ${complaintCount} / qayta ish ${reworkCount}`,
        )
        .join('\n')
    : language === 'ru'
      ? 'Нет активности по категориям'
      : 'Toifalar bo‘yicha faollik yo‘q';
  return language === 'ru'
    ? [
        periodLabel,
        `Участки: ${report.serviceAreaCount}`,
        `Портфель — заявки ${portfolio.requestsReceived}, заказы ${portfolio.ordersCreated}, завершено ${portfolio.completed}, отменено ${portfolio.cancelled}, в работе ${portfolio.activeBacklog}, просрочено ${portfolio.overdueActive}, срочно ${portfolio.urgentOrdersCreated}, завершение/приём ${shown(portfolio.completionToIntakePercent, '%')}`,
        `SLA — вовремя ${sla.completedOnTime}, с опозданием ${sla.completedLate}, выполнение ${shown(sla.onTimePercent, '%')}, среднее время ${shown(sla.averageCompletionHours, ' ч')}, на паузе ${sla.activePaused}, эскалации ${sla.escalationCount}`,
        `Качество — проверки ${quality.inspectionCount}, успешно ${shown(quality.inspectionPassPercent, '%')}, приёмки ${quality.acceptanceCount}, доработки ${quality.reworkCount}, отзывы ${quality.feedbackCount}, средняя оценка ${shown(quality.averageRating)}`,
        `Жалобы — создано ${complaints.created}, закрыто ${complaints.closedInPeriod}, открыто ${complaints.openBacklog}, просрочено ${complaints.overdueOpen}, переоткрыто ${complaints.reopened}, по гарантии ${complaints.withinWarranty}`,
        `Повторы — подтверждено ${repeatProblems.confirmedDuplicatePairs}, объединено заказов ${repeatProblems.consolidatedOrders}, связанных заявок ${repeatProblems.consolidatedRequests}`,
        categories,
        `PDCA — создано ${pdca.createdInPeriod}, завершено ${pdca.completedInPeriod}, активно ${pdca.active}, просрочено ${pdca.overdue}`,
      ].join('\n')
    : [
        periodLabel,
        `Hududlar: ${report.serviceAreaCount}`,
        `Portfel — so‘rovlar ${portfolio.requestsReceived}, buyurtmalar ${portfolio.ordersCreated}, yakunlangan ${portfolio.completed}, bekor qilingan ${portfolio.cancelled}, faol ${portfolio.activeBacklog}, kechikkan ${portfolio.overdueActive}, shoshilinch ${portfolio.urgentOrdersCreated}, yakun/so‘rov ${shown(portfolio.completionToIntakePercent, '%')}`,
        `SLA — vaqtida ${sla.completedOnTime}, kech ${sla.completedLate}, bajarilish ${shown(sla.onTimePercent, '%')}, o‘rtacha vaqt ${shown(sla.averageCompletionHours, ' soat')}, pauzada ${sla.activePaused}, eskalatsiya ${sla.escalationCount}`,
        `Sifat — tekshiruvlar ${quality.inspectionCount}, o‘tgan ${shown(quality.inspectionPassPercent, '%')}, qabul ${quality.acceptanceCount}, qayta ish ${quality.reworkCount}, baholar ${quality.feedbackCount}, o‘rtacha baho ${shown(quality.averageRating)}`,
        `Shikoyatlar — yaratildi ${complaints.created}, yopildi ${complaints.closedInPeriod}, ochiq ${complaints.openBacklog}, kechikkan ${complaints.overdueOpen}, qayta ochilgan ${complaints.reopened}, kafolatda ${complaints.withinWarranty}`,
        `Takrorlar — tasdiqlangan ${repeatProblems.confirmedDuplicatePairs}, birlashtirilgan buyurtmalar ${repeatProblems.consolidatedOrders}, bog‘langan so‘rovlar ${repeatProblems.consolidatedRequests}`,
        categories,
        `PDCA — yaratildi ${pdca.createdInPeriod}, yakunlandi ${pdca.completedInPeriod}, faol ${pdca.active}, kechikkan ${pdca.overdue}`,
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
