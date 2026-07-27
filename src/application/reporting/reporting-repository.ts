import type { OperationalReport } from '../../domain/reporting/operational-report.js';
import type { ReportingPeriod } from '../../domain/reporting/reporting-period.js';

export interface ReportingRepository {
  generate(
    period: ReportingPeriod,
    serviceAreaIds: readonly (string | null)[],
  ): Promise<OperationalReport>;
}
