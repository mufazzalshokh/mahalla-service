import type { Principal } from '../../domain/identity/permissions.js';
import type { PdcaStage, ValidatedPdcaActionInput } from '../../domain/pdca/pdca-policy.js';

export interface PdcaActionRecord extends ValidatedPdcaActionInput {
  readonly code: string;
  readonly completedAt: Date | null;
  readonly createdAt: Date;
  readonly id: string;
  readonly ownerUserId: string;
  readonly result: string | null;
  readonly serviceAreaId: string;
  readonly stage: PdcaStage;
  readonly version: number;
}

export interface ServiceAreaRecord {
  readonly code: string;
  readonly id: string;
}

export interface PdcaRepository {
  create(
    input: ValidatedPdcaActionInput,
    serviceAreaId: string,
    actor: Principal,
    now: Date,
  ): Promise<PdcaActionRecord>;
  findAreaByCode(code: string): Promise<ServiceAreaRecord | undefined>;
  findByCode(code: string): Promise<PdcaActionRecord | undefined>;
  list(serviceAreaIds: readonly (string | null)[], now: Date): Promise<readonly PdcaActionRecord[]>;
  transition(
    action: PdcaActionRecord,
    to: PdcaStage,
    reason: string,
    actor: Principal,
    now: Date,
  ): Promise<PdcaActionRecord>;
}
