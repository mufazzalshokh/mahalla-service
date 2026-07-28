import { permissionKeys, type PermissionKey } from './permissions.js';

export const roleCodes = ['administrator', 'executor', 'operator_manager', 'resident'] as const;
export type RoleCode = (typeof roleCodes)[number];

export const rolePermissionMatrix: Readonly<Record<RoleCode, readonly PermissionKey[]>> = {
  administrator: permissionKeys,
  executor: [
    'order.read.area',
    'assignment.respond',
    'order.update_progress',
    'order.work_log.add',
    'order.evidence.add',
    'order.submit_completion',
    'order.start_rework',
  ],
  operator_manager: [
    'request.read.area',
    'request.validate',
    'request.request_information',
    'request.provide_information',
    'request.register',
    'request.reject',
    'request.triage',
    'request.duplicate.review',
    'order.read.area',
    'order.assign',
    'order.cancel',
    'order.escalation.review',
    'order.escalation.manage',
    'notification.manage',
    'report.read',
    'report.export',
    'finance.read',
    'finance.manage',
    'document.read',
    'pdca.manage',
    'quality.inspect',
    'quality.accept',
    'quality.require_rework',
    'quality.complaint.review',
    'quality.reopen',
    'priority.override',
    'audit.read',
  ],
  resident: ['request.read.own', 'request.provide_information', 'request.cancel.own'],
};
