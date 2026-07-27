import { DomainRuleError } from '../shared/domain-errors.js';

export const priorityCriterionCodes = [
  'SAFETY_RISK',
  'URGENCY',
  'RESIDENTS_AFFECTED',
  'SOCIAL_IMPACT',
  'SOURCE_CONFIDENCE',
] as const;
export type PriorityCriterionCode = (typeof priorityCriterionCodes)[number];

export const priorityBands = ['URGENT', 'IMPORTANT', 'PLANNED', 'MONITOR'] as const;
export type PriorityBand = (typeof priorityBands)[number];

export interface PriorityCriterionDefinition {
  readonly code: PriorityCriterionCode;
  readonly maximumValue: number;
  readonly weight: number;
}

export type PriorityInputs = Readonly<Record<PriorityCriterionCode, number>>;

export interface PriorityFactorResult {
  readonly code: PriorityCriterionCode;
  readonly contribution: number;
  readonly input: number;
  readonly weight: number;
}

export interface PriorityResult {
  readonly band: PriorityBand;
  readonly explanation: string;
  readonly factors: readonly PriorityFactorResult[];
  readonly score: number;
}

function bandFor(score: number): PriorityBand {
  if (score >= 80) return 'URGENT';
  if (score >= 55) return 'IMPORTANT';
  if (score >= 30) return 'PLANNED';
  return 'MONITOR';
}

export function calculatePriority(
  criteria: readonly PriorityCriterionDefinition[],
  inputs: PriorityInputs,
): PriorityResult {
  if (criteria.length === 0) {
    throw new DomainRuleError('PRIORITY_MODEL_EMPTY', 'Priority model has no criteria');
  }
  const codes = new Set(criteria.map(({ code }) => code));
  if (codes.size !== criteria.length || priorityCriterionCodes.some((code) => !codes.has(code))) {
    throw new DomainRuleError(
      'PRIORITY_MODEL_INVALID',
      'Priority model must define each supported criterion exactly once',
    );
  }

  let available = 0;
  let earned = 0;
  const factors = criteria.map((criterion) => {
    const input = inputs[criterion.code];
    if (!Number.isInteger(input) || input < 0 || input > criterion.maximumValue) {
      throw new DomainRuleError(
        'PRIORITY_INPUT_INVALID',
        `${criterion.code} must be an integer from 0 to ${criterion.maximumValue}`,
      );
    }
    if (
      !Number.isInteger(criterion.weight) ||
      criterion.weight <= 0 ||
      criterion.maximumValue <= 0
    ) {
      throw new DomainRuleError(
        'PRIORITY_MODEL_INVALID',
        'Criterion weights and maxima must be positive',
      );
    }
    const maximumContribution = criterion.maximumValue * criterion.weight;
    const contribution = input * criterion.weight;
    available += maximumContribution;
    earned += contribution;
    return { code: criterion.code, contribution, input, weight: criterion.weight };
  });

  const score = Math.round((earned / available) * 10_000) / 100;
  const band = bandFor(score);
  const explanation = factors
    .map(({ code, input, weight }) => `${code}=${input}×${weight}`)
    .join('; ');
  return { band, explanation: `${explanation}; normalized=${score}; band=${band}`, factors, score };
}

export function validatePriorityOverride(score: number, band: PriorityBand, reason: string): void {
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    throw new DomainRuleError('PRIORITY_OVERRIDE_INVALID', 'Override score must be from 0 to 100');
  }
  if (!priorityBands.includes(band)) {
    throw new DomainRuleError('PRIORITY_OVERRIDE_INVALID', 'Override band is invalid');
  }
  if (reason.trim().length < 10 || reason.trim().length > 1_000) {
    throw new DomainRuleError(
      'PRIORITY_OVERRIDE_REASON_REQUIRED',
      'Override reason must contain 10 to 1000 characters',
    );
  }
}
