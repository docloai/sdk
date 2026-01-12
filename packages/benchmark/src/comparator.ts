import levenshtein from 'fast-levenshtein';
import type { TruthData, AccuracyMetrics, FieldResult, JsonValue, JsonObject } from './types.js';

/**
 * Calculate fuzzy string similarity (0-100)
 */
function fuzzyStringMatch(expected: string, actual: string): number {
  if (expected === actual) return 100;

  const distance = levenshtein.get(expected.toLowerCase(), actual.toLowerCase());
  const maxLength = Math.max(expected.length, actual.length);

  if (maxLength === 0) return 100;

  const similarity = ((maxLength - distance) / maxLength) * 100;
  return Math.max(0, Math.min(100, similarity));
}

/**
 * Normalize value - treat empty strings, null, and undefined as equivalent
 */
function normalizeValue(value: JsonValue | undefined): JsonValue | null {
  if (value === null || value === undefined || value === '' || value === 0) {
    return null;
  }
  return value;
}

/**
 * Compare a single field value
 */
export function compareField(
  expected: JsonValue | undefined,
  actual: JsonValue | undefined,
  fieldPath: string,
  config?: TruthData['config']
): FieldResult {
  // Normalize values - treat empty strings, null, undefined, and 0 as equivalent "absent" values
  const normalizedExpected = normalizeValue(expected);
  const normalizedActual = normalizeValue(actual);

  const expectedIsAbsent = normalizedExpected === null;
  const actualIsAbsent = normalizedActual === null;

  if (expectedIsAbsent && actualIsAbsent) {
    // Both are absent (null, undefined, "", or 0) - this is a match
    return { expected, actual, match: true, score: 100 };
  }

  if (expectedIsAbsent && !actualIsAbsent) {
    // Expected absent, got a value
    return {
      expected,
      actual,
      match: false,
      score: 0,
      reason: 'Expected null/undefined but got value'
    };
  }

  if (!expectedIsAbsent && actualIsAbsent) {
    // Expected a value, got absent
    return {
      expected,
      actual,
      match: false,
      score: 0,
      reason: 'Expected value but got null/undefined'
    };
  }

  // Use normalized values for further comparisons
  const expectedVal = normalizedExpected;
  const actualVal = normalizedActual;

  // Fuzzy string matching
  if (config?.fuzzyFields?.includes(fieldPath) && typeof expectedVal === 'string' && typeof actualVal === 'string') {
    const score = fuzzyStringMatch(expectedVal, actualVal);
    const threshold = config?.fuzzyThreshold ?? 80;
    const match = score >= threshold;

    return {
      expected,
      actual,
      match,
      score,
      reason: match ? undefined : `Fuzzy match ${score.toFixed(1)}% < ${threshold}% threshold`
    };
  }

  // Numeric tolerance
  if (typeof expectedVal === 'number' && typeof actualVal === 'number') {
    const tolerance = config?.numericTolerance?.[fieldPath] ?? config?.defaultTolerance ?? 0.001;
    const diff = Math.abs(expectedVal - actualVal);
    const match = diff <= tolerance;

    const score = match ? 100 : Math.max(0, 100 - (diff / Math.abs(expectedVal)) * 100);

    return {
      expected,
      actual,
      match,
      score,
      reason: match ? undefined : `Difference ${diff.toFixed(6)} > tolerance ${tolerance}`
    };
  }

  // Exact match for other types (using normalized values)
  const match = JSON.stringify(expectedVal) === JSON.stringify(actualVal);

  return {
    expected,
    actual,
    match,
    score: match ? 100 : 0,
    reason: match ? undefined : 'Values do not match exactly'
  };
}

/**
 * Get value from nested object using dot notation path
 */
function getNestedValue(obj: JsonObject, path: string): JsonValue | undefined {
  const parts = path.split('.');
  let current: JsonValue = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object' || Array.isArray(current)) return undefined;
    current = current[part];
  }

  return current;
}

/**
 * Set value in nested object using dot notation path
 */
function setNestedValue(obj: JsonObject, path: string, value: JsonValue): void {
  const parts = path.split('.');
  let current: JsonObject = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current)) {
      current[part] = {};
    }
    const nextVal = current[part];
    if (typeof nextVal !== 'object' || nextVal === null || Array.isArray(nextVal)) {
      current[part] = {};
    }
    current = current[part] as JsonObject;
  }

  current[parts[parts.length - 1]] = value;
}

/**
 * Recursively collect all field paths from an object
 */
function collectFieldPaths(obj: JsonValue | undefined, prefix = ''): string[] {
  const paths: string[] = [];

  if (obj === null || obj === undefined) return paths;
  if (typeof obj !== 'object') return paths;
  if (Array.isArray(obj)) return paths;

  for (const key in obj) {
    const path = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Recurse into nested objects
      paths.push(...collectFieldPaths(value, path));
    } else {
      // Leaf value
      paths.push(path);
    }
  }

  return paths;
}

/**
 * Compare expected vs actual results and calculate accuracy
 */
export function compareResults(
  expected: JsonObject,
  actual: JsonObject,
  config?: TruthData['config']
): AccuracyMetrics {
  // Collect all field paths from expected output
  const expectedPaths = collectFieldPaths(expected);
  const actualPaths = collectFieldPaths(actual);

  const allPaths = Array.from(new Set([...expectedPaths, ...actualPaths]));

  const fieldLevel: { [fieldPath: string]: FieldResult } = {};
  let totalScore = 0;
  let totalFields = 0;

  // Compare each field
  for (const path of allPaths) {
    const expectedValue = getNestedValue(expected, path);
    const actualValue = getNestedValue(actual, path);

    const result = compareField(expectedValue, actualValue, path, config);
    fieldLevel[path] = result;

    totalScore += result.score;
    totalFields++;
  }

  // Calculate overall accuracy
  const overall = totalFields > 0 ? totalScore / totalFields : 0;

  // Calculate required fields presence (use normalized values)
  const requiredFields = config?.requiredFields ?? [];
  const requiredPresent = requiredFields.filter(path => {
    const value = getNestedValue(actual, path);
    const normalized = normalizeValue(value);
    return normalized !== null;
  }).length;

  // Calculate optional fields presence (use normalized values)
  const optionalFields = config?.optionalFields ?? [];
  const optionalPresent = optionalFields.filter(path => {
    const value = getNestedValue(actual, path);
    const normalized = normalizeValue(value);
    return normalized !== null;
  }).length;

  return {
    overall,
    fieldLevel,
    required: {
      present: requiredPresent,
      total: requiredFields.length,
      percentage: requiredFields.length > 0 ? (requiredPresent / requiredFields.length) * 100 : 100
    },
    optional: {
      present: optionalPresent,
      total: optionalFields.length,
      percentage: optionalFields.length > 0 ? (optionalPresent / optionalFields.length) * 100 : 100
    }
  };
}
