import { describe, expect, it } from 'vitest';

import {
  calculateDuplicateConfidence,
  type DuplicateCandidateFacts,
} from '../src/domain/duplicates/duplicate-confidence.js';

const request: DuplicateCandidateFacts = {
  addressLine: 'Amir Temur ko‘chasi 10-uy',
  categoryId: 'plumbing',
  description: 'Yerto‘lada suv quvuri yorilgan',
  id: 'one',
  latitude: 41.311,
  longitude: 69.279,
  serviceAreaId: 'demo',
};

describe('duplicate confidence', () => {
  it('suggests a close, textually matching request with explainable evidence', () => {
    const result = calculateDuplicateConfidence(request, {
      ...request,
      id: 'two',
      latitude: 41.3111,
      longitude: 69.2791,
    });
    expect(result.suggested).toBe(true);
    expect(result.score).toBe(100);
    expect(result.reasons).toHaveLength(3);
  });

  it('does not compare self, another category, or another area', () => {
    expect(calculateDuplicateConfidence(request, request).score).toBe(0);
    expect(
      calculateDuplicateConfidence(request, { ...request, categoryId: 'electric', id: 'two' })
        .suggested,
    ).toBe(false);
    expect(
      calculateDuplicateConfidence(request, { ...request, id: 'two', serviceAreaId: 'other' })
        .suggested,
    ).toBe(false);
  });

  it('handles missing coordinates and dissimilar text without auto-merging', () => {
    const result = calculateDuplicateConfidence(request, {
      ...request,
      addressLine: 'Mustaqillik 99',
      description: 'Daraxtlarni kesish kerak',
      id: 'two',
      latitude: null,
      longitude: null,
    });
    expect(result.suggested).toBe(false);
    expect(result.reasons).toContain('coordinate_distance=unknown');
  });

  it('reduces coordinate evidence outside 100 and 300 metres', () => {
    const nearby = calculateDuplicateConfidence(request, {
      ...request,
      id: 'two',
      latitude: 41.3125,
    });
    const far = calculateDuplicateConfidence(request, {
      ...request,
      id: 'three',
      latitude: 41.32,
    });
    expect(nearby.score).toBeGreaterThan(far.score);
  });
});
