import { DomainRuleError } from '../shared/domain-errors.js';

export const checklistResults = ['PASS', 'FAIL', 'NOT_APPLICABLE'] as const;
export type ChecklistResult = (typeof checklistResults)[number];

export interface QualityChecklistItem {
  readonly code: string;
  readonly isRequired: boolean;
}

export interface InspectionItemInput {
  readonly code: string;
  readonly result: ChecklistResult;
}

export interface ValidatedInspection {
  readonly outcome: 'PASS' | 'FAIL';
  readonly results: readonly InspectionItemInput[];
  readonly summary: string;
}

function boundedText(value: string, field: string, minimum: number, maximum: number): string {
  const normalized = value.trim();
  if (normalized.length < minimum || normalized.length > maximum) {
    throw new DomainRuleError(
      'QUALITY_TEXT_INVALID',
      `${field} must contain between ${minimum} and ${maximum} characters`,
    );
  }
  return normalized;
}

export function validateInspection(
  checklist: readonly QualityChecklistItem[],
  inputs: readonly InspectionItemInput[],
  summary: string,
): ValidatedInspection {
  if (checklist.length === 0) {
    throw new DomainRuleError('CHECKLIST_EMPTY', 'The active quality checklist is empty');
  }
  const configured = new Map(checklist.map((item) => [item.code.toUpperCase(), item]));
  const results = new Map<string, ChecklistResult>();
  for (const input of inputs) {
    const code = input.code.trim().toUpperCase();
    if (!configured.has(code)) {
      throw new DomainRuleError('CHECKLIST_ITEM_UNKNOWN', `Unknown checklist item: ${code}`);
    }
    if (results.has(code)) {
      throw new DomainRuleError('CHECKLIST_ITEM_DUPLICATE', `Duplicate checklist item: ${code}`);
    }
    if (!checklistResults.includes(input.result)) {
      throw new DomainRuleError('CHECKLIST_RESULT_INVALID', `Invalid result for ${code}`);
    }
    results.set(code, input.result);
  }
  for (const [code, item] of configured) {
    const result = results.get(code);
    if (!result) {
      throw new DomainRuleError('CHECKLIST_ITEM_MISSING', `Checklist item is missing: ${code}`);
    }
    if (item.isRequired && result === 'NOT_APPLICABLE') {
      throw new DomainRuleError(
        'CHECKLIST_REQUIRED_NOT_APPLICABLE',
        `Required checklist item cannot be not applicable: ${code}`,
      );
    }
  }
  const normalizedResults = [...results].map(([code, result]) => ({ code, result }));
  return {
    outcome: normalizedResults.some(({ result }) => result === 'FAIL') ? 'FAIL' : 'PASS',
    results: normalizedResults,
    summary: boundedText(summary, 'Inspection summary', 3, 1000),
  };
}

export function validateFeedback(
  rating: number,
  comment?: string,
): {
  readonly comment: string | null;
  readonly rating: number;
} {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new DomainRuleError('RATING_INVALID', 'Rating must be an integer from 1 to 5');
  }
  return {
    comment: comment?.trim() ? boundedText(comment, 'Feedback comment', 3, 1000) : null,
    rating,
  };
}

export function validateComplaint(reason: string): string {
  return boundedText(reason, 'Complaint reason', 5, 2000);
}

export function validateReworkReason(reason: string): string {
  return boundedText(reason, 'Rework reason', 3, 1000);
}
