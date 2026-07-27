/* eslint-disable @typescript-eslint/unbound-method */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ComplaintRecord,
  QualityOrderRecord,
  QualityPolicyRecord,
  QualityRepository,
} from '../src/application/quality/quality-repository.js';
import {
  QualityService,
  ResidentQualityService,
} from '../src/application/quality/quality-service.js';
import type { TransitionOrderService } from '../src/application/orders/transition-order-service.js';
import type { Principal } from '../src/domain/identity/permissions.js';

const order: QualityOrderRecord = {
  assignedExecutorUserId: 'executor',
  categoryId: 'category',
  id: 'order-id',
  orderNumber: 'ORD-1',
  requesterUserIds: ['resident'],
  serviceAreaId: 'area',
  status: 'AWAITING_ACCEPTANCE',
  version: 4,
};
const policy: QualityPolicyRecord = {
  acceptanceMode: 'RESIDENT_OR_OPERATOR',
  complaintReviewHours: 48,
  inspectionRequired: true,
  items: [{ code: 'WORK', isRequired: true, labelUzCyrl: 'Иш', labelUzLatn: 'Ish' }],
  latestPassingInspectionId: 'inspection-id',
  reworkTargetHours: 24,
  templateId: 'template',
  templateVersion: 1,
  warrantyDays: 7,
};
const resident: Principal = { grants: [], userId: 'resident' };
const operator: Principal = {
  grants: [
    { permission: 'quality.inspect', serviceAreaId: 'area' },
    { permission: 'quality.accept', serviceAreaId: 'area' },
    { permission: 'quality.require_rework', serviceAreaId: 'area' },
    { permission: 'quality.complaint.review', serviceAreaId: 'area' },
    { permission: 'quality.reopen', serviceAreaId: 'area' },
  ],
  userId: 'operator',
};

interface SetupResult {
  readonly quality: QualityService;
  readonly repository: QualityRepository;
  setOrder(value: QualityOrderRecord): void;
  setPolicy(value: QualityPolicyRecord): void;
  readonly transitions: { execute: ReturnType<typeof vi.fn<TransitionOrderService['execute']>> };
}

function setup(): SetupResult {
  let currentOrder = order;
  let currentPolicy = policy;
  const repository = {
    createComplaint: vi.fn(),
    decideComplaint: vi.fn(),
    findComplaintByCode: vi.fn(),
    findOrderByNumber: vi.fn().mockImplementation(() => Promise.resolve(currentOrder)),
    findWarranty: vi.fn(),
    listOpenComplaints: vi.fn().mockResolvedValue([]),
    loadPolicy: vi.fn().mockImplementation(() => Promise.resolve(currentPolicy)),
    recordInspection: vi.fn().mockResolvedValue({ attempt: 1, id: 'inspection', outcome: 'PASS' }),
    saveFeedback: vi.fn(),
  } as unknown as QualityRepository;
  const transitions = {
    execute: vi.fn<TransitionOrderService['execute']>().mockResolvedValue(order),
  };
  const quality = new QualityService(
    repository,
    transitions as unknown as TransitionOrderService,
    () => new Date('2026-07-27T10:00:00Z'),
  );
  return {
    quality,
    repository,
    setOrder(value: QualityOrderRecord): void {
      currentOrder = value;
    },
    setPolicy(value: QualityPolicyRecord): void {
      currentPolicy = value;
    },
    transitions,
  };
}

describe('quality service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('authorizes checklist access and validates inspection input', async () => {
    const { quality, repository } = setup();
    await expect(quality.checklist('ord-1', resident)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(quality.checklist('ord-1', operator)).resolves.toBe(policy);
    await expect(
      quality.inspect('ord-1', [{ code: 'WORK', result: 'PASS' }], 'Checked', operator),
    ).resolves.toMatchObject({ outcome: 'PASS' });
    expect(repository.recordInspection).toHaveBeenCalledWith(
      order,
      policy,
      expect.objectContaining({ outcome: 'PASS', summary: 'Checked' }),
      operator,
    );
  });

  it('requires the category inspection and resident ownership before acceptance', async () => {
    const { quality, setPolicy, transitions } = setup();
    setPolicy({ ...policy, latestPassingInspectionId: null });
    await expect(quality.accept('ORD-1', 'RESIDENT', resident)).rejects.toMatchObject({
      code: 'PASSING_INSPECTION_REQUIRED',
    });
    setPolicy(policy);
    await quality.accept('ORD-1', 'RESIDENT', resident);
    const acceptanceCall = transitions.execute.mock.calls[0];
    expect(acceptanceCall?.[0]).toMatchObject({
      data: {
        acceptanceSource: 'RESIDENT',
        inspectionId: 'inspection-id',
        warrantyDays: 7,
      },
      to: 'COMPLETED',
    });
    expect(acceptanceCall?.[1].grants).toContainEqual({
      permission: 'quality.accept',
      serviceAreaId: 'area',
    });
    await expect(
      quality.accept('ORD-1', 'RESIDENT', { grants: [], userId: 'stranger' }),
    ).rejects.toMatchObject({ code: 'ACTOR_CONSTRAINT_FAILED' });
  });

  it('honors operator-only acceptance and creates a future rework cycle', async () => {
    const { quality, setPolicy, transitions } = setup();
    setPolicy({ ...policy, acceptanceMode: 'OPERATOR_ONLY' });
    await expect(quality.accept('ORD-1', 'RESIDENT', resident)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await quality.accept('ORD-1', 'OPERATOR', operator);
    await quality.requireRework('ORD-1', 'Work still leaks', 'OPERATOR', operator);
    expect(transitions.execute).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: {
          reworkDueAt: new Date('2026-07-28T10:00:00Z'),
          reworkReason: 'Work still leaks',
        },
        to: 'REWORK_REQUIRED',
      }),
      operator,
    );
  });

  it('stores one owner feedback and classifies complaints by warranty', async () => {
    const { quality, repository, setOrder } = setup();
    const completed = { ...order, status: 'COMPLETED' as const };
    setOrder(completed);
    vi.mocked(repository.findWarranty).mockResolvedValue({
      endsAt: new Date('2026-08-03T10:00:00Z'),
      startsAt: new Date('2026-07-27T10:00:00Z'),
      warrantyDays: 7,
    });
    const complaint = { code: 'CMP-1' } as ComplaintRecord;
    vi.mocked(repository.createComplaint).mockResolvedValue(complaint);
    await quality.feedback('ORD-1', 5, 'Very good', resident);
    expect(repository.saveFeedback).toHaveBeenCalledWith(completed, 5, 'Very good', resident);
    await expect(quality.complaint('ORD-1', 'Leak returned', resident)).resolves.toBe(complaint);
    expect(repository.createComplaint).toHaveBeenCalledWith(
      completed,
      'Leak returned',
      new Date('2026-07-29T10:00:00Z'),
      resident,
      true,
    );
    await expect(quality.warranty('ORD-1', resident)).resolves.toMatchObject({ warrantyDays: 7 });
  });

  it('lists scoped complaints and reopens only an open linked complaint', async () => {
    const { quality, repository, setOrder, transitions } = setup();
    const completed = { ...order, status: 'COMPLETED' as const };
    setOrder(completed);
    const complaint: ComplaintRecord = {
      code: 'CMP-1',
      id: 'complaint-id',
      order: completed,
      reason: 'Leak returned',
      reviewDueAt: new Date('2026-07-29T10:00:00Z'),
      status: 'OPEN',
      withinWarranty: true,
    };
    vi.mocked(repository.findComplaintByCode).mockResolvedValue(complaint);
    vi.mocked(repository.listOpenComplaints).mockResolvedValue([complaint]);
    await expect(quality.listComplaints(operator)).resolves.toEqual([complaint]);
    await quality.reopen('cmp-1', 'Warranty correction', operator);
    const reopenCall = transitions.execute.mock.calls[0];
    expect(reopenCall?.[0]).toMatchObject({
      data: { complaintId: 'complaint-id' },
      to: 'REWORK_REQUIRED',
    });
    expect(reopenCall?.[1]).toBe(operator);

    vi.mocked(repository.findComplaintByCode).mockResolvedValue({
      ...complaint,
      order: completed,
      status: 'REOPENED',
    });
    await quality.decideComplaint('CMP-1', 'RESOLVED', 'Correction accepted', operator);
    const decisionCall = vi.mocked(repository.decideComplaint).mock.calls[0];
    expect(decisionCall?.[0].status).toBe('REOPENED');
    expect(decisionCall?.slice(1)).toEqual(['RESOLVED', 'Correction accepted', operator]);
  });

  it('resolves resident Telegram identity before quality operations', async () => {
    const { quality } = setup();
    const principals = {
      load: vi.fn().mockResolvedValue(resident),
      loadByTelegramUserId: vi.fn().mockResolvedValue(resident),
    };
    const residentQuality = new ResidentQualityService(principals, quality);
    await expect(residentQuality.accept(10n, 'ORD-1')).resolves.toMatchObject({
      orderNumber: 'ORD-1',
    });
    principals.loadByTelegramUserId.mockResolvedValue(undefined);
    await expect(residentQuality.warranty(99n, 'ORD-1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('rejects unauthorized, closed, and prematurely resolved complaints', async () => {
    const { quality, repository } = setup();
    const openComplaint: ComplaintRecord = {
      code: 'CMP-2',
      id: 'complaint-2',
      order: { ...order, status: 'COMPLETED' },
      reason: 'Issue returned',
      reviewDueAt: new Date('2026-07-29T10:00:00Z'),
      status: 'OPEN',
      withinWarranty: true,
    };
    vi.mocked(repository.findComplaintByCode).mockResolvedValue(openComplaint);
    await expect(
      quality.decideComplaint('CMP-2', 'REJECTED', 'Not a service defect', resident),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    vi.mocked(repository.findComplaintByCode).mockResolvedValue({
      ...openComplaint,
      status: 'RESOLVED',
    });
    await expect(
      quality.decideComplaint('CMP-2', 'RESOLVED', 'Already handled', operator),
    ).rejects.toMatchObject({ code: 'COMPLAINT_NOT_REVIEWABLE' });
    vi.mocked(repository.findComplaintByCode).mockResolvedValue({
      ...openComplaint,
      order: { ...order, status: 'IN_PROGRESS' },
      status: 'REOPENED',
    });
    await expect(
      quality.decideComplaint('CMP-2', 'RESOLVED', 'Trying too early', operator),
    ).rejects.toMatchObject({ code: 'REWORK_NOT_COMPLETED' });
  });
});
