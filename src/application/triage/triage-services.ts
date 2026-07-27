import { calculateDuplicateConfidence } from '../../domain/duplicates/duplicate-confidence.js';
import { hasPermission, type Principal } from '../../domain/identity/permissions.js';
import {
  calculatePriority,
  validatePriorityOverride,
  type PriorityBand,
  type PriorityInputs,
} from '../../domain/priority/priority-calculator.js';
import {
  AuthorizationError,
  DomainRuleError,
  EntityNotFoundError,
} from '../../domain/shared/domain-errors.js';
import { planRequestTransition } from '../../domain/requests/request-state-machine.js';
import type {
  DuplicateSuggestionRecord,
  OrderRegistrationResult,
  PriorityAssessmentRecord,
  TriageRepository,
  TriageRequestRecord,
} from './triage-repository.js';
import type { RequestRecord } from '../requests/request-repository.js';

async function requireRequest(
  repository: TriageRepository,
  ticketNumber: string,
): Promise<TriageRequestRecord> {
  const request = await repository.findRequest(ticketNumber);
  if (!request) throw new EntityNotFoundError('ServiceRequest', ticketNumber);
  return request;
}

export class AssessPriorityService {
  constructor(private readonly repository: TriageRepository) {}

  async execute(
    ticketNumber: string,
    operatorInputs: Omit<PriorityInputs, 'SOURCE_CONFIDENCE'>,
    principal: Principal,
  ): Promise<PriorityAssessmentRecord> {
    const request = await requireRequest(this.repository, ticketNumber);
    if (!hasPermission(principal, 'request.triage', request.serviceAreaId)) {
      throw new AuthorizationError('request.triage');
    }
    if (request.status !== 'VALIDATING') {
      throw new DomainRuleError(
        'REQUEST_NOT_VALIDATING',
        'Only validating requests may be triaged',
      );
    }
    const model = await this.repository.loadActivePriorityModel();
    if (!model)
      throw new DomainRuleError('PRIORITY_MODEL_MISSING', 'No active priority model exists');
    const inputs: PriorityInputs = {
      ...operatorInputs,
      SOURCE_CONFIDENCE: request.sourceConfidence,
    };
    const result = calculatePriority(model.criteria, inputs);
    return this.repository.savePriorityAssessment({
      actor: principal,
      inputs,
      model,
      request,
      result,
    });
  }
}

export class SuggestDuplicatesService {
  constructor(private readonly repository: TriageRepository) {}

  async execute(
    ticketNumber: string,
    principal: Principal,
  ): Promise<readonly DuplicateSuggestionRecord[]> {
    const request = await requireRequest(this.repository, ticketNumber);
    if (!hasPermission(principal, 'request.duplicate.review', request.serviceAreaId)) {
      throw new AuthorizationError('request.duplicate.review');
    }
    const candidates = await this.repository.findDuplicateCandidates(request);
    const suggestions = candidates
      .map((candidate) => ({ candidate, ...calculateDuplicateConfidence(request, candidate) }))
      .filter(({ suggested }) => suggested)
      .map(({ candidate, reasons, score }) => ({ candidate, reasons, score }));
    return this.repository.saveDuplicateSuggestions(request, suggestions, principal);
  }
}

export class DecideDuplicateService {
  constructor(private readonly repository: TriageRepository) {}

  async execute(
    ticketNumber: string,
    candidateTicketNumber: string,
    decision: 'CONFIRMED' | 'DISMISSED',
    principal: Principal,
  ): Promise<DuplicateSuggestionRecord> {
    const request = await requireRequest(this.repository, ticketNumber);
    if (!hasPermission(principal, 'request.duplicate.review', request.serviceAreaId)) {
      throw new AuthorizationError('request.duplicate.review');
    }
    return this.repository.decideDuplicate(request, candidateTicketNumber, decision, principal);
  }
}

export class OverridePriorityService {
  constructor(private readonly repository: TriageRepository) {}

  async execute(
    ticketNumber: string,
    score: number,
    band: PriorityBand,
    reason: string,
    principal: Principal,
  ): Promise<PriorityAssessmentRecord> {
    const request = await requireRequest(this.repository, ticketNumber);
    if (!hasPermission(principal, 'priority.override', request.serviceAreaId)) {
      throw new AuthorizationError('priority.override');
    }
    validatePriorityOverride(score, band, reason);
    const assessment = await this.repository.findPriorityAssessment(request.id);
    if (!assessment)
      throw new DomainRuleError('PRIORITY_REQUIRED', 'Priority assessment is required');
    return this.repository.overridePriority(assessment, score, band, reason.trim(), principal);
  }
}

export class RegisterRequestAsOrderService {
  constructor(private readonly repository: TriageRepository) {}

  async execute(ticketNumber: string, principal: Principal): Promise<OrderRegistrationResult> {
    const request = await requireRequest(this.repository, ticketNumber);
    planRequestTransition(request, 'REGISTERED', {}, principal);
    const assessment = await this.repository.findPriorityAssessment(request.id);
    if (!assessment)
      throw new DomainRuleError('PRIORITY_REQUIRED', 'Priority assessment is required');
    return this.repository.registerAsOrder(request, assessment, principal);
  }
}

export class ListValidationQueueService {
  constructor(private readonly repository: TriageRepository) {}

  execute(principal: Principal): Promise<readonly RequestRecord[]> {
    const scopes = principal.grants
      .filter(({ permission }) => permission === 'request.read.area')
      .map(({ serviceAreaId }) => serviceAreaId);
    if (scopes.length === 0) throw new AuthorizationError('request.read.area');
    return this.repository.listValidationQueue(scopes);
  }
}
