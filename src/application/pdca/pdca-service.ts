import { hasPermission, type Principal } from '../../domain/identity/permissions.js';
import {
  isPdcaClosed,
  planPdcaTransition,
  validatePdcaAction,
  type PdcaActionInput,
  type PdcaStage,
} from '../../domain/pdca/pdca-policy.js';
import {
  AuthorizationError,
  DomainRuleError,
  EntityNotFoundError,
} from '../../domain/shared/domain-errors.js';
import type { PdcaActionRecord, PdcaRepository } from './pdca-repository.js';

export interface PdcaActionView extends PdcaActionRecord {
  readonly overdue: boolean;
}

export class PdcaService {
  constructor(
    private readonly repository: PdcaRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async create(
    areaCode: string,
    input: PdcaActionInput,
    principal: Principal,
  ): Promise<PdcaActionRecord> {
    const area = await this.repository.findAreaByCode(areaCode.trim().toUpperCase());
    if (!area) throw new EntityNotFoundError('ServiceArea', areaCode);
    if (!hasPermission(principal, 'pdca.manage', area.id)) {
      throw new AuthorizationError('pdca.manage');
    }
    const now = this.now();
    return this.repository.create(validatePdcaAction(input, now), area.id, principal, now);
  }

  async list(principal: Principal): Promise<readonly PdcaActionView[]> {
    const serviceAreaIds = principal.grants
      .filter(({ permission }) => permission === 'pdca.manage')
      .map(({ serviceAreaId }) => serviceAreaId);
    if (serviceAreaIds.length === 0) throw new AuthorizationError('pdca.manage');
    const now = this.now();
    const actions = await this.repository.list(serviceAreaIds, now);
    return actions.map((action) => ({ ...action, overdue: action.dueAt < now }));
  }

  async transition(
    code: string,
    to: PdcaStage,
    reason: string,
    principal: Principal,
  ): Promise<PdcaActionRecord> {
    const action = await this.repository.findByCode(code.trim().toUpperCase());
    if (!action) throw new EntityNotFoundError('PdcaAction', code);
    if (!hasPermission(principal, 'pdca.manage', action.serviceAreaId)) {
      throw new AuthorizationError('pdca.manage');
    }
    if (isPdcaClosed(action.stage)) {
      throw new DomainRuleError('PDCA_ALREADY_CLOSED', 'A closed PDCA action cannot transition');
    }
    const plan = planPdcaTransition(action.stage, to, reason);
    return this.repository.transition(action, plan.to, plan.reason, principal, this.now());
  }
}
