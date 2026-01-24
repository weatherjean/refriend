/**
 * Shared Formatting Utilities
 */

/**
 * Format a date for API response.
 * Handles Date objects, date strings, and unknown types.
 */
export function formatDate(date: string | Date | unknown): string {
  if (date instanceof Date) {
    return date.toISOString();
  }
  if (date && typeof date === "object" && "toISOString" in date) {
    return (date as Date).toISOString();
  }
  if (date) {
    const parsed = new Date(String(date));
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return String(date);
}
