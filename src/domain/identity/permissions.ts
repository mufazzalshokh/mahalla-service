export const permissionKeys = [
  'request.read.own',
  'request.read.area',
  'request.validate',
  'request.request_information',
  'request.provide_information',
  'request.register',
  'request.reject',
  'request.triage',
  'request.duplicate.review',
  'request.cancel.own',
  'order.read.area',
  'order.assign',
  'assignment.respond',
  'order.update_progress',
  'order.work_log.add',
  'order.evidence.add',
  'order.submit_completion',
  'order.start_rework',
  'order.cancel',
  'order.escalation.review',
  'quality.accept',
  'quality.require_rework',
  'priority.override',
  'staff.manage',
  'catalog.manage',
  'audit.read',
] as const;

export type PermissionKey = (typeof permissionKeys)[number];

export function isPermissionKey(value: string): value is PermissionKey {
  return (permissionKeys as readonly string[]).includes(value);
}

export interface PermissionGrant {
  readonly permission: PermissionKey;
  readonly serviceAreaId: string | null;
}

export interface Principal {
  readonly grants: readonly PermissionGrant[];
  readonly userId: string;
}

export function hasPermission(
  principal: Principal,
  permission: PermissionKey,
  serviceAreaId: string,
): boolean {
  return principal.grants.some(
    (grant) =>
      grant.permission === permission &&
      (grant.serviceAreaId === null || grant.serviceAreaId === serviceAreaId),
  );
}
