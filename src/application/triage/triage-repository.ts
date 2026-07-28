import type { RequestRecord } from '../requests/request-repository.js';
import type {
  PriorityBand,
  PriorityCriterionDefinition,
  PriorityInputs,
  PriorityResult,
} from '../../domain/priority/priority-calculator.js';
import type { DuplicateCandidateFacts } from '../../domain/duplicates/duplicate-confidence.js';
import type { Principal } from '../../domain/identity/permissions.js';

export interface TriageRequestRecord extends RequestRecord, DuplicateCandidateFacts {
  readonly sourceConfidence: number;
}

export interface ResidentRequestDetails {
  readonly addressLine: string;
  readonly categoryNameRu: string;
  readonly categoryNameUzLatn: string;
  readonly description: string;
  readonly fullName: string | null;
  readonly phone: string | null;
  readonly preferredVisitEnd: Date | null;
  readonly preferredVisitStart: Date | null;
  readonly residentDeclaredUrgency: 'CRITICAL' | 'IMPORTANT' | 'PLANNED' | null;
  readonly serviceAreaId: string;
  readonly status: RequestRecord['status'];
  readonly ticketNumber: string;
  readonly visitAsSoonAsPossible: boolean;
}

export interface PriorityModelRecord {
  readonly code: string;
  readonly criteria: readonly PriorityCriterionDefinition[];
  readonly id: string;
  readonly version: number;
}

export interface PriorityAssessmentRecord {
  readonly calculatedBand: PriorityBand;
  readonly calculatedScore: number;
  readonly effectiveBand: PriorityBand;
  readonly effectiveScore: number;
  readonly explanation: string;
  readonly id: string;
  readonly modelCode: string;
  readonly modelVersion: number;
  readonly overrideReason: string | null;
  readonly requestId: string;
}

export interface DuplicateSuggestionRecord {
  readonly candidateTicketNumber: string;
  readonly reasons: readonly string[];
  readonly score: number;
  readonly status: 'SUGGESTED' | 'CONFIRMED' | 'DISMISSED';
}

export interface SavePriorityAssessment {
  readonly actor: Principal;
  readonly inputs: PriorityInputs;
  readonly model: PriorityModelRecord;
  readonly request: TriageRequestRecord;
  readonly result: PriorityResult;
}

export interface OrderRegistrationResult {
  readonly linkedToExistingOrder: boolean;
  readonly orderId: string;
  readonly orderNumber: string;
  readonly ticketNumber: string;
}

export interface TriageRepository {
  findResidentRequestDetails(ticketNumber: string): Promise<ResidentRequestDetails | undefined>;
  findRequest(ticketNumber: string): Promise<TriageRequestRecord | undefined>;
  loadActivePriorityModel(): Promise<PriorityModelRecord | undefined>;
  savePriorityAssessment(command: SavePriorityAssessment): Promise<PriorityAssessmentRecord>;
  findPriorityAssessment(requestId: string): Promise<PriorityAssessmentRecord | undefined>;
  overridePriority(
    assessment: PriorityAssessmentRecord,
    score: number,
    band: PriorityBand,
    reason: string,
    actor: Principal,
  ): Promise<PriorityAssessmentRecord>;
  findDuplicateCandidates(request: TriageRequestRecord): Promise<readonly TriageRequestRecord[]>;
  saveDuplicateSuggestions(
    request: TriageRequestRecord,
    suggestions: readonly {
      candidate: TriageRequestRecord;
      reasons: readonly string[];
      score: number;
    }[],
    actor: Principal,
  ): Promise<readonly DuplicateSuggestionRecord[]>;
  decideDuplicate(
    request: TriageRequestRecord,
    candidateTicketNumber: string,
    decision: 'CONFIRMED' | 'DISMISSED',
    actor: Principal,
  ): Promise<DuplicateSuggestionRecord>;
  registerAsOrder(
    request: TriageRequestRecord,
    assessment: PriorityAssessmentRecord,
    actor: Principal,
  ): Promise<OrderRegistrationResult>;
  listValidationQueue(
    serviceAreaIds: readonly (string | null)[],
  ): Promise<readonly RequestRecord[]>;
}
