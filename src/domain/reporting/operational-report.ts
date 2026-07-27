import type { ReportingPeriod } from './reporting-period.js';

export interface PortfolioMetrics {
  readonly activeBacklog: number;
  readonly cancelled: number;
  readonly completed: number;
  readonly completionToIntakePercent: number | null;
  readonly ordersCreated: number;
  readonly overdueActive: number;
  readonly requestsReceived: number;
  readonly urgentOrdersCreated: number;
}

export interface SlaMetrics {
  readonly activePaused: number;
  readonly averageCompletionHours: number | null;
  readonly completedLate: number;
  readonly completedOnTime: number;
  readonly escalationCount: number;
  readonly onTimePercent: number | null;
}

export interface QualityMetrics {
  readonly acceptanceCount: number;
  readonly averageRating: number | null;
  readonly feedbackCount: number;
  readonly inspectionCount: number;
  readonly inspectionPassPercent: number | null;
  readonly reworkCount: number;
}

export interface ComplaintMetrics {
  readonly closedInPeriod: number;
  readonly created: number;
  readonly openBacklog: number;
  readonly overdueOpen: number;
  readonly reopened: number;
  readonly withinWarranty: number;
}

export interface RepeatCategoryMetric {
  readonly categoryCode: string;
  readonly complaintCount: number;
  readonly confirmedDuplicateCount: number;
  readonly requestCount: number;
  readonly reworkCount: number;
}

export interface RepeatProblemMetrics {
  readonly confirmedDuplicatePairs: number;
  readonly consolidatedOrders: number;
  readonly consolidatedRequests: number;
  readonly topCategories: readonly RepeatCategoryMetric[];
}

export interface PdcaMetrics {
  readonly active: number;
  readonly completedInPeriod: number;
  readonly createdInPeriod: number;
  readonly overdue: number;
}

export interface OperationalReport {
  readonly complaints: ComplaintMetrics;
  readonly generatedAt: Date;
  readonly pdca: PdcaMetrics;
  readonly period: ReportingPeriod;
  readonly portfolio: PortfolioMetrics;
  readonly quality: QualityMetrics;
  readonly repeatProblems: RepeatProblemMetrics;
  readonly serviceAreaCount: number;
  readonly sla: SlaMetrics;
}
