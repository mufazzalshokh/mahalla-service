import { describe, expect, it } from 'vitest';

import {
  hasPermission,
  isPermissionKey,
  permissionKeys,
  type Principal,
} from '../src/domain/identity/permissions.js';
import { roleCodes, rolePermissionMatrix } from '../src/domain/identity/role-permission-matrix.js';

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

describe('seed authorization matrix', () => {
  it('covers every role and gives only the administrator the complete permission set', () => {
    expect(Object.keys(rolePermissionMatrix).sort()).toEqual([...roleCodes].sort());
    expect(rolePermissionMatrix.administrator).toEqual(permissionKeys);
    for (const role of roleCodes) {
      expect(new Set(rolePermissionMatrix[role]).size).toBe(rolePermissionMatrix[role].length);
    }
  });

  it('keeps sensitive finance, export, staff and audit powers away from residents and executors', () => {
    const sensitive = ['audit.read', 'finance.manage', 'report.export', 'staff.manage'] as const;
    for (const role of ['resident', 'executor'] as const) {
      for (const permission of sensitive) {
        expect(rolePermissionMatrix[role]).not.toContain(permission);
      }
    }
    expect(rolePermissionMatrix.operator_manager).not.toContain('staff.manage');
  });
});
