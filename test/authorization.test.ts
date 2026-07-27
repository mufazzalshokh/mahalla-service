import { describe, expect, it } from 'vitest';

import {
  hasPermission,
  isPermissionKey,
  permissionKeys,
  type Principal,
} from '../src/domain/identity/permissions.js';

describe('scoped permissions', () => {
  const principal: Principal = {
    grants: [
      { permission: 'order.assign', serviceAreaId: 'area-a' },
      { permission: 'audit.read', serviceAreaId: null },
    ],
    userId: 'operator',
  };

  it('allows matching area and global grants', () => {
    expect(hasPermission(principal, 'order.assign', 'area-a')).toBe(true);
    expect(hasPermission(principal, 'audit.read', 'area-b')).toBe(true);
  });

  it('denies another area or a missing permission', () => {
    expect(hasPermission(principal, 'order.assign', 'area-b')).toBe(false);
    expect(hasPermission(principal, 'staff.manage', 'area-a')).toBe(false);
  });

  it('validates persisted permission identifiers', () => {
    expect(permissionKeys.every(isPermissionKey)).toBe(true);
    expect(isPermissionKey('order.destroy')).toBe(false);
  });
});
