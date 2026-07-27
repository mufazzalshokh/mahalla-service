/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, it, vi } from 'vitest';

import type { PdcaActionRecord, PdcaRepository } from '../src/application/pdca/pdca-repository.js';
import { PdcaService } from '../src/application/pdca/pdca-service.js';
import type { Principal } from '../src/domain/identity/permissions.js';

const now = new Date('2026-07-27T10:00:00Z');
const input = {
  dueAt: new Date('2026-08-01T10:00:00Z'),
  expectedOutcome: 'Leak stopped',
  plannedAction: 'Replace damaged pipe',
  problemStatement: 'Pipe repeatedly leaks',
  title: 'Stop recurring leak',
};
const action: PdcaActionRecord = {
  ...input,
  code: 'PDC-2026-1',
  completedAt: null,
  createdAt: now,
  id: 'pdca-1',
  ownerUserId: 'staff',
  result: null,
  serviceAreaId: 'area-1',
  stage: 'PLAN',
  version: 1,
};
const manager: Principal = {
  grants: [{ permission: 'pdca.manage', serviceAreaId: 'area-1' }],
  userId: 'staff',
};

function repository(): PdcaRepository {
  return {
    create: vi.fn().mockResolvedValue(action),
    findAreaByCode: vi.fn().mockResolvedValue({ code: 'DEMO', id: 'area-1' }),
    findByCode: vi.fn().mockResolvedValue(action),
    list: vi.fn().mockResolvedValue([action]),
    transition: vi.fn().mockResolvedValue({ ...action, stage: 'DO', version: 2 }),
  };
}

describe('PdcaService', () => {
  it('creates, scopes, lists, and transitions actions', async () => {
    const repo = repository();
    const service = new PdcaService(repo, () => now);
    await expect(service.create(' demo ', input, manager)).resolves.toBe(action);
    expect(repo.findAreaByCode).toHaveBeenCalledWith('DEMO');
    await expect(service.list(manager)).resolves.toEqual([{ ...action, overdue: false }]);
    expect(repo.list).toHaveBeenCalledWith(['area-1'], now);
    await expect(
      service.transition(' pdc-2026-1 ', 'DO', 'Started work', manager),
    ).resolves.toMatchObject({ stage: 'DO' });
    expect(repo.transition).toHaveBeenCalledWith(action, 'DO', 'Started work', manager, now);
  });

  it('marks overdue actions and rejects missing, forbidden, and closed actions', async () => {
    const repo = repository();
    vi.mocked(repo.list).mockResolvedValueOnce([
      { ...action, dueAt: new Date('2026-07-26T10:00:00Z') },
    ]);
    const service = new PdcaService(repo, () => now);
    await expect(service.list(manager)).resolves.toMatchObject([{ overdue: true }]);
    await expect(service.list({ grants: [], userId: 'x' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    vi.mocked(repo.findAreaByCode).mockResolvedValueOnce(undefined);
    await expect(service.create('none', input, manager)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    vi.mocked(repo.findAreaByCode).mockResolvedValueOnce({ code: 'OTHER', id: 'area-2' });
    await expect(service.create('other', input, manager)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    vi.mocked(repo.findByCode).mockResolvedValueOnce(undefined);
    await expect(service.transition('none', 'DO', 'Started work', manager)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    vi.mocked(repo.findByCode).mockResolvedValueOnce({ ...action, serviceAreaId: 'area-2' });
    await expect(
      service.transition(action.code, 'DO', 'Started work', manager),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    vi.mocked(repo.findByCode).mockResolvedValueOnce({ ...action, stage: 'COMPLETED' });
    await expect(
      service.transition(action.code, 'DO', 'Started work', manager),
    ).rejects.toMatchObject({ code: 'PDCA_ALREADY_CLOSED' });
  });
});
