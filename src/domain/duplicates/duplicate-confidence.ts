export interface DuplicateCandidateFacts {
  readonly addressLine: string;
  readonly categoryId: string;
  readonly description: string;
  readonly id: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly serviceAreaId: string;
}

export interface DuplicateConfidence {
  readonly reasons: readonly string[];
  readonly score: number;
  readonly suggested: boolean;
}

const stopWords = new Set(['and', 'the', 'uchun', 'bilan', 'va', 'ҳамда', 'билан', 'учун']);

function tokens(value: string): Set<string> {
  return new Set(
    value
      .normalize('NFKC')
      .toLocaleLowerCase('uz')
      .split(/[^\p{L}\p{N}]+/u)
      .filter((token) => token.length >= 2 && !stopWords.has(token)),
  );
}

function similarity(first: string, second: string): number {
  const left = tokens(first);
  const right = tokens(second);
  if (left.size === 0 || right.size === 0) return 0;
  const intersection = [...left].filter((token) => right.has(token)).length;
  const union = new Set([...left, ...right]).size;
  return intersection / union;
}

function distanceMeters(
  firstLatitude: number,
  firstLongitude: number,
  secondLatitude: number,
  secondLongitude: number,
): number {
  const radians = (degrees: number): number => (degrees * Math.PI) / 180;
  const deltaLatitude = radians(secondLatitude - firstLatitude);
  const deltaLongitude = radians(secondLongitude - firstLongitude);
  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(radians(firstLatitude)) *
      Math.cos(radians(secondLatitude)) *
      Math.sin(deltaLongitude / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function calculateDuplicateConfidence(
  request: DuplicateCandidateFacts,
  candidate: DuplicateCandidateFacts,
): DuplicateConfidence {
  if (
    request.id === candidate.id ||
    request.categoryId !== candidate.categoryId ||
    request.serviceAreaId !== candidate.serviceAreaId
  ) {
    return {
      reasons: ['Different request, category, or service area is required.'],
      score: 0,
      suggested: false,
    };
  }

  const addressSimilarity = similarity(request.addressLine, candidate.addressLine);
  const descriptionSimilarity = similarity(request.description, candidate.description);
  const coordinateDistance =
    request.latitude !== null &&
    request.longitude !== null &&
    candidate.latitude !== null &&
    candidate.longitude !== null
      ? distanceMeters(request.latitude, request.longitude, candidate.latitude, candidate.longitude)
      : undefined;
  const coordinateScore =
    coordinateDistance === undefined
      ? 0
      : coordinateDistance <= 100
        ? 20
        : coordinateDistance <= 300
          ? 10
          : 0;
  const score =
    Math.round((addressSimilarity * 50 + descriptionSimilarity * 30 + coordinateScore) * 100) / 100;
  const reasons = [
    `address_similarity=${Math.round(addressSimilarity * 100)}`,
    `description_similarity=${Math.round(descriptionSimilarity * 100)}`,
    coordinateDistance === undefined
      ? 'coordinate_distance=unknown'
      : `coordinate_distance_m=${Math.round(coordinateDistance)}`,
  ];
  return { reasons, score, suggested: score >= 60 };
}
