import type { Principal } from '../../domain/identity/permissions.js';
import { AuthorizationError } from '../../domain/shared/domain-errors.js';
import {
  createReportingPeriod,
  type ReportPeriodKind,
} from '../../domain/reporting/reporting-period.js';
import type { OperationalReport } from '../../domain/reporting/operational-report.js';
import { formatTashkentDate } from '../../domain/shared/tashkent-date-time.js';
import { operationalReportCsv } from './report-format.js';
import type { ReportingRepository } from './reporting-repository.js';

function scopes(
  principal: Principal,
  permission: 'report.export' | 'report.read',
): readonly (string | null)[] {
  const values = principal.grants
    .filter((grant) => grant.permission === permission)
    .map(({ serviceAreaId }) => serviceAreaId);
  if (values.length === 0) throw new AuthorizationError(permission);
  return values;
}

export class ReportingService {
  constructor(
    private readonly repository: ReportingRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async report(kind: ReportPeriodKind, principal: Principal): Promise<OperationalReport> {
    const period = createReportingPeriod(kind, this.now());
    return this.repository.generate(period, scopes(principal, 'report.read'));
  }

  async exportCsv(
    kind: ReportPeriodKind,
    principal: Principal,
  ): Promise<{ readonly content: string; readonly fileName: string }> {
    const period = createReportingPeriod(kind, this.now());
    const report = await this.repository.generate(period, scopes(principal, 'report.export'));
    return {
      content: operationalReportCsv(report),
      fileName: `mck-${kind.toLowerCase()}-${formatTashkentDate(period.startInclusive)}.csv`,
    };
  }
}
