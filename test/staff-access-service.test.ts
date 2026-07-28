/* eslint-disable @typescript-eslint/unbound-method */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  StaffAccessService,
  type StaffAccessRecord,
  type StaffAccessRepository,
} from '../src/application/identity/staff-access-service.js';
import type { Principal } from '../src/domain/identity/permissions.js';

const admin: Principal = {
  grants: [{ permission: 'staff.manage', serviceAreaId: 'area-1' }],
  userId: 'admin',
};
const record: StaffAccessRecord = {
  code: 'STF-2026-00000001',
  displayName: 'Ali Valiyev',
  role: 'operator_manager',
  serviceAreaCode: 'DEMO',
  serviceAreaId: 'area-1',
  status: 'ACTIVE',
  telegramUserId: 123n,
  userId: 'staff-1',
};

function repository(): StaffAccessRepository {
  return {
    findArea: vi.fn().mockResolvedValue({ code: 'DEMO', id: 'area-1' }),
    findByCode: vi.fn().mockResolvedValue(record),
    grant: vi.fn().mockResolvedValue(record),
    list: vi.fn().mockResolvedValue([record]),
    restore: vi.fn().mockResolvedValue({ ...record, status: 'ACTIVE' }),
    suspend: vi.fn().mockResolvedValue({ ...record, status: 'SUSPENDED' }),
  };
}

describe('staff access service', () => {
  let repo: StaffAccessRepository;
  let service: StaffAccessService;

  beforeEach(() => {
    repo = repository();
    service = new StaffAccessService(repo);
  });

  it('grants only controlled roles inside an authorized area', async () => {
    await expect(
      service.grant(123n, '  Ali   Valiyev ', 'operator_manager', 'demo', admin),
    ).resolves.toBe(record);
    expect(repo.grant).toHaveBeenCalledWith({
      actorUserId: 'admin',
      area: { code: 'DEMO', id: 'area-1' },
      displayName: 'Ali Valiyev',
      role: 'operator_manager',
      telegramUserId: 123n,
    });
    await expect(
      service.grant(123n, 'Ali Valiyev', 'executor', 'DEMO', {
        grants: [],
        userId: 'outsider',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rejects invalid identity data', async () => {
    await expect(service.grant(0n, 'Ali Valiyev', 'executor', 'DEMO', admin)).rejects.toMatchObject(
      {
        code: 'TELEGRAM_ID_INVALID',
      },
    );
    await expect(service.grant(123n, 'A', 'executor', 'DEMO', admin)).rejects.toMatchObject({
      code: 'STAFF_NAME_INVALID',
    });
  });

  it('prevents self-suspension and requires a reason', async () => {
    await expect(
      service.suspend(record.code, 'Pilot ended', { ...admin, userId: record.userId }),
    ).rejects.toMatchObject({ code: 'STAFF_SELF_SUSPEND' });
    await expect(service.suspend(record.code, 'x', admin)).rejects.toMatchObject({
      code: 'STAFF_REASON_INVALID',
    });
    await expect(service.suspend(record.code, 'Pilot ended', admin)).resolves.toMatchObject({
      status: 'SUSPENDED',
    });
  });

  it('lists and restores only through staff.manage scopes', async () => {
    await expect(service.list(admin)).resolves.toEqual([record]);
    expect(repo.list).toHaveBeenCalledWith(['area-1']);
    await expect(service.restore(record.code, admin)).resolves.toBe(record);
    await expect(service.list({ grants: [], userId: 'outsider' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});
