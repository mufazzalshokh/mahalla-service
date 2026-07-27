/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/unbound-method */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Principal } from '../src/domain/identity/permissions.js';
import type {
  PriorityAssessmentRecord,
  TriageRepository,
  TriageRequestRecord,
} from '../src/application/triage/triage-repository.js';
import {
  AssessPriorityService,
  OverridePriorityService,
  RegisterRequestAsOrderService,
  SuggestDuplicatesService,
} from '../src/application/triage/triage-services.js';

const request: TriageRequestRecord = {
  addressLine: 'Amir Temur 10',
  categoryId: 'category',
  description: 'Suv quvuri yorilgan',
  id: 'request',
  latitude: 41.31,
  longitude: 69.27,
  requesterUserId: 'resident',
  serviceAreaId: 'area',
  sourceConfidence: 4,
  status: 'VALIDATING',
  ticketNumber: 'REQ-1',
  version: 1,
};
const assessment: PriorityAssessmentRecord = {
  calculatedBand: 'IMPORTANT',
  calculatedScore: 60,
  effectiveBand: 'IMPORTANT',
  effectiveScore: 60,
  explanation: 'explain',
  id: 'assessment',
  modelCode: 'IMPACT_V1',
  modelVersion: 1,
  overrideReason: null,
  requestId: request.id,
};
const operator: Principal = {
  grants: [
    { permission: 'request.triage', serviceAreaId: 'area' },
    { permission: 'request.duplicate.review', serviceAreaId: 'area' },
    { permission: 'request.register', serviceAreaId: 'area' },
    { permission: 'priority.override', serviceAreaId: 'area' },
  ],
  userId: 'operator',
};

function repository(): TriageRepository {
  return {
    decideDuplicate: vi.fn(),
    findDuplicateCandidates: vi.fn().mockResolvedValue([]),
    findPriorityAssessment: vi.fn().mockResolvedValue(assessment),
    findRequest: vi.fn().mockResolvedValue(request),
    listValidationQueue: vi.fn().mockResolvedValue([]),
    loadActivePriorityModel: vi.fn().mockResolvedValue({
      code: 'IMPACT_V1',
      criteria: [
        { code: 'SAFETY_RISK', maximumValue: 5, weight: 30 },
        { code: 'URGENCY', maximumValue: 5, weight: 25 },
        { code: 'RESIDENTS_AFFECTED', maximumValue: 5, weight: 20 },
        { code: 'SOCIAL_IMPACT', maximumValue: 5, weight: 15 },
        { code: 'SOURCE_CONFIDENCE', maximumValue: 5, weight: 10 },
      ],
      id: 'model',
      version: 1,
    }),
    overridePriority: vi.fn().mockResolvedValue(assessment),
    registerAsOrder: vi.fn().mockResolvedValue({
      linkedToExistingOrder: false,
      orderId: 'order',
      orderNumber: 'ORD-1',
      ticketNumber: 'REQ-1',
    }),
    saveDuplicateSuggestions: vi.fn().mockResolvedValue([]),
    savePriorityAssessment: vi.fn().mockResolvedValue(assessment),
  };
}

describe('triage application services', () => {
  let repo: TriageRepository;

  beforeEach(() => {
    repo = repository();
  });

  it('injects source confidence and saves an explainable assessment', async () => {
    await new AssessPriorityService(repo).execute(
      'REQ-1',
      { RESIDENTS_AFFECTED: 3, SAFETY_RISK: 4, SOCIAL_IMPACT: 2, URGENCY: 4 },
      operator,
    );
    expect(repo.savePriorityAssessment).toHaveBeenCalledWith(
      expect.objectContaining({ inputs: expect.objectContaining({ SOURCE_CONFIDENCE: 4 }) }),
    );
  });

  it('denies triage outside the principal area and non-validating requests', async () => {
    await expect(
      new AssessPriorityService(repo).execute(
        'REQ-1',
        { RESIDENTS_AFFECTED: 1, SAFETY_RISK: 1, SOCIAL_IMPACT: 1, URGENCY: 1 },
        { ...operator, grants: [] },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    vi.mocked(repo.findRequest).mockResolvedValue({ ...request, status: 'RECEIVED' });
    await expect(
      new AssessPriorityService(repo).execute(
        'REQ-1',
        { RESIDENTS_AFFECTED: 1, SAFETY_RISK: 1, SOCIAL_IMPACT: 1, URGENCY: 1 },
        operator,
      ),
    ).rejects.toMatchObject({ code: 'REQUEST_NOT_VALIDATING' });
  });

  it('only persists duplicate suggestions above the deterministic threshold', async () => {
    vi.mocked(repo.findDuplicateCandidates).mockResolvedValue([
      { ...request, id: 'match', ticketNumber: 'REQ-2' },
      {
        ...request,
        addressLine: 'Other street',
        description: 'Unrelated issue',
        id: 'unrelated',
        latitude: null,
        longitude: null,
        ticketNumber: 'REQ-3',
      },
    ]);
    await new SuggestDuplicatesService(repo).execute('REQ-1', operator);
    expect(repo.saveDuplicateSuggestions).toHaveBeenCalledWith(
      request,
      [expect.objectContaining({ candidate: expect.objectContaining({ id: 'match' }) })],
      operator,
    );
  });

  it('requires assessment before atomic registration', async () => {
    await new RegisterRequestAsOrderService(repo).execute('REQ-1', operator);
    expect(repo.registerAsOrder).toHaveBeenCalledWith(request, assessment, operator);
    vi.mocked(repo.findPriorityAssessment).mockResolvedValue(undefined);
    await expect(
      new RegisterRequestAsOrderService(repo).execute('REQ-1', operator),
    ).rejects.toMatchObject({ code: 'PRIORITY_REQUIRED' });
  });

  it('requires an override reason before writing the override', async () => {
    await expect(
      new OverridePriorityService(repo).execute('REQ-1', 90, 'URGENT', 'short', operator),
    ).rejects.toMatchObject({ code: 'PRIORITY_OVERRIDE_REASON_REQUIRED' });
    expect(repo.overridePriority).not.toHaveBeenCalled();
  });
});
