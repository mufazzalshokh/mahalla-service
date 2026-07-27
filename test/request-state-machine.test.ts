import { describe, expect, it } from 'vitest';

import type { Principal } from '../src/domain/identity/permissions.js';
import {
  planRequestTransition,
  requestTransitionDefinitions,
  type ServiceRequestSnapshot,
} from '../src/domain/requests/request-state-machine.js';
import {
  ActorConstraintError,
  AuthorizationError,
  InvalidTransitionError,
  MissingTransitionDataError,
} from '../src/domain/shared/domain-errors.js';

const request: ServiceRequestSnapshot = {
  id: 'request-1',
  requesterUserId: 'resident-1',
  serviceAreaId: 'area-a',
  status: 'RECEIVED',
  version: 0,
};
const operator: Principal = {
  grants: [
    { permission: 'request.validate', serviceAreaId: 'area-a' },
    { permission: 'request.request_information', serviceAreaId: 'area-a' },
  ],
  userId: 'operator-1',
};

describe('request state machine', () => {
  it('defines complete operational metadata for every transition', () => {
    expect(requestTransitionDefinitions.length).toBeGreaterThan(5);
    for (const definition of requestTransitionDefinitions) {
      expect(definition.auditEvent).not.toHaveLength(0);
      expect(definition.compensation).not.toHaveLength(0);
      expect(definition.failureBehavior).not.toHaveLength(0);
      expect(definition.notification).toBeTruthy();
      expect(definition.permission).toBeTruthy();
      expect(definition.preconditions.length).toBeGreaterThan(0);
      expect(definition.sideEffects.length).toBeGreaterThan(0);
      expect(definition.slaEffect).toBeTruthy();
    }
  });

  it('plans an authorized area-scoped validation', () => {
    expect(planRequestTransition(request, 'VALIDATING', {}, operator)).toMatchObject({
      from: 'RECEIVED',
      to: 'VALIDATING',
    });
  });

  it('allows the requester to cancel and provide information', () => {
    const resident: Principal = { grants: [], userId: 'resident-1' };
    expect(
      planRequestTransition(
        request,
        'CANCELLED',
        { cancellationReason: 'No longer needed' },
        resident,
      ),
    ).toMatchObject({ to: 'CANCELLED' });
    expect(
      planRequestTransition(
        { ...request, status: 'NEEDS_INFORMATION' },
        'VALIDATING',
        { providedInformation: 'Quvur yerto‘lada, ikkinchi kirish yonida.' },
        resident,
      ),
    ).toMatchObject({ to: 'VALIDATING' });
  });

  it('enforces ownership, scope, required data and valid edges', () => {
    expect(() =>
      planRequestTransition(request, 'CANCELLED', { cancellationReason: 'x' }, operator),
    ).toThrow(ActorConstraintError);
    expect(() =>
      planRequestTransition(request, 'VALIDATING', {}, { ...operator, grants: [] }),
    ).toThrow(AuthorizationError);
    expect(() =>
      planRequestTransition(
        { ...request, status: 'VALIDATING' },
        'NEEDS_INFORMATION',
        {},
        operator,
      ),
    ).toThrow(MissingTransitionDataError);
    expect(() => planRequestTransition(request, 'REGISTERED', {}, operator)).toThrow(
      InvalidTransitionError,
    );
  });
});
