import { DomainRuleError, InvalidTransitionError } from '../shared/domain-errors.js';

export const pdcaStages = ['PLAN', 'DO', 'CHECK', 'ACT', 'COMPLETED', 'CANCELLED'] as const;
export type PdcaStage = (typeof pdcaStages)[number];

export interface PdcaActionInput {
  readonly dueAt: Date;
  readonly expectedOutcome: string;
  readonly plannedAction: string;
  readonly problemStatement: string;
  readonly title: string;
}

export type ValidatedPdcaActionInput = PdcaActionInput;

const transitions: Readonly<Record<PdcaStage, readonly PdcaStage[]>> = {
  ACT: ['COMPLETED', 'PLAN', 'CANCELLED'],
  CANCELLED: [],
  CHECK: ['ACT', 'PLAN', 'CANCELLED'],
  COMPLETED: [],
  DO: ['CHECK', 'CANCELLED'],
  PLAN: ['DO', 'CANCELLED'],
};

function bounded(value: string, field: string, minimum: number, maximum: number): string {
  const normalized = value.trim().replace(/\s+/gu, ' ');
  if (normalized.length < minimum || normalized.length > maximum) {
    throw new DomainRuleError(
      'PDCA_TEXT_INVALID',
      `${field} must contain ${minimum} to ${maximum} characters`,
    );
  }
  return normalized;
}

export function validatePdcaAction(input: PdcaActionInput, now: Date): ValidatedPdcaActionInput {
  if (Number.isNaN(input.dueAt.valueOf()) || input.dueAt <= now) {
    throw new DomainRuleError('PDCA_DEADLINE_INVALID', 'PDCA deadline must be in the future');
  }
  if (input.dueAt.getTime() > now.getTime() + 366 * 24 * 60 * 60 * 1_000) {
    throw new DomainRuleError('PDCA_DEADLINE_INVALID', 'PDCA deadline must be within 366 days');
  }
  return {
    dueAt: new Date(input.dueAt),
    expectedOutcome: bounded(input.expectedOutcome, 'expectedOutcome', 3, 1000),
    plannedAction: bounded(input.plannedAction, 'plannedAction', 3, 2000),
    problemStatement: bounded(input.problemStatement, 'problemStatement', 3, 2000),
    title: bounded(input.title, 'title', 3, 200),
  };
}

export function planPdcaTransition(
  from: PdcaStage,
  to: PdcaStage,
  reason: string,
): { readonly reason: string; readonly to: PdcaStage } {
  if (!transitions[from].includes(to)) throw new InvalidTransitionError(from, to);
  return { reason: bounded(reason, 'reason', 3, 1000), to };
}

export function isPdcaClosed(stage: PdcaStage): boolean {
  return stage === 'COMPLETED' || stage === 'CANCELLED';
}
