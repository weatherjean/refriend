/**
 * Federation Content Utilities
 *
 * Text processing utilities for ActivityPub content.
 */

/**
 * Extract hashtags from text content
 */
export function extractHashtags(text: string): string[] {
  const plainText = text.replace(/<[^>]*>/g, "");
  const matches = plainText.match(/#[\w]+/g) || [];
  return [...new Set(matches.map((m) => m.slice(1).toLowerCase()))];
}
