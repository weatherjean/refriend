/**
 * Shared utility functions
 */

/**
 * Safely parse an integer, returning null if the value is invalid or NaN.
 */
export function parseIntSafe(
  value: string | undefined | null,
  radix = 10
): number | null {
  if (!value) return null;
  const parsed = parseInt(value, radix);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Parse pagination query parameters with validation and defaults.
 */
export function parsePagination(
  query: { limit?: string; before?: string },
  maxLimit = 50,
  defaultLimit = 20
): { limit: number; before: number | undefined } {
  const limit = Math.min(parseIntSafe(query.limit) ?? defaultLimit, maxLimit);
  const before = parseIntSafe(query.before) ?? undefined;
  return { limit, before };
}
