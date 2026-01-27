/**
 * Federation Content Utilities
 *
 * Text processing utilities for ActivityPub content.
 */

// Maximum content size for federated posts (50KB)
export const MAX_CONTENT_SIZE = 50 * 1024;

// Allowed HTML tags for federated content (ActivityPub common set)
const ALLOWED_TAGS = new Set([
  "p", "br", "a", "span", "strong", "b", "em", "i", "u", "s", "del",
  "blockquote", "pre", "code", "ul", "ol", "li",
]);

// Allowed attributes per tag
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "rel", "class"]),
  span: new Set(["class"]),
  code: new Set(["class"]),
  pre: new Set(["class"]),
};

/**
 * Sanitize HTML content from federated posts.
 * Removes dangerous tags and attributes while preserving safe formatting.
 */
export function sanitizeHtml(html: string): string {
  if (!html) return "";

  // Remove script tags and their contents entirely
  let result = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");

  // Remove style tags and their contents
  result = result.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");

  // Remove event handlers (onclick, onerror, etc.)
  result = result.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, "");
  result = result.replace(/\s*on\w+\s*=\s*[^\s>]+/gi, "");

  // Remove javascript: and data: URLs
  result = result.replace(/href\s*=\s*["']?\s*javascript:[^"'>\s]*/gi, 'href="#"');
  result = result.replace(/href\s*=\s*["']?\s*data:[^"'>\s]*/gi, 'href="#"');
  result = result.replace(/src\s*=\s*["']?\s*javascript:[^"'>\s]*/gi, 'src=""');
  result = result.replace(/src\s*=\s*["']?\s*data:[^"'>\s]*/gi, 'src=""');

  // Process tags - keep allowed, strip others but keep content
  result = result.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/gi, (match, tag, attrs) => {
    const tagLower = tag.toLowerCase();

    // Remove disallowed tags entirely (keep inner content)
    if (!ALLOWED_TAGS.has(tagLower)) {
      return "";
    }

    // For allowed tags, filter attributes
    const allowedAttrsForTag = ALLOWED_ATTRS[tagLower];
    if (!allowedAttrsForTag || !attrs.trim()) {
      // No attributes allowed or no attributes present
      return match.startsWith("</") ? `</${tagLower}>` : `<${tagLower}>`;
    }

    // Filter attributes
    const filteredAttrs: string[] = [];
    const attrRegex = /([a-zA-Z][a-zA-Z0-9-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
    let attrMatch;
    while ((attrMatch = attrRegex.exec(attrs)) !== null) {
      const attrName = attrMatch[1].toLowerCase();
      const attrValue = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? "";

      if (allowedAttrsForTag.has(attrName)) {
        // For href, ensure it's not javascript: or data:
        if (attrName === "href") {
          const trimmedValue = attrValue.trim().toLowerCase();
          if (trimmedValue.startsWith("javascript:") || trimmedValue.startsWith("data:")) {
            filteredAttrs.push('href="#"');
            continue;
          }
        }
        filteredAttrs.push(`${attrName}="${escapeAttr(attrValue)}"`);
      }
    }

    const attrsStr = filteredAttrs.length > 0 ? " " + filteredAttrs.join(" ") : "";
    return `<${tagLower}${attrsStr}>`;
  });

  return result;
}

/**
 * Escape HTML attribute value
 */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Validate and sanitize federated content.
 * Returns null if content exceeds size limit.
 */
export function validateAndSanitizeContent(content: string): string | null {
  // Check size limit
  if (content.length > MAX_CONTENT_SIZE) {
    return null;
  }

  // Sanitize HTML
  return sanitizeHtml(content);
}

/**
 * Extract hashtags from text content
 */
export function extractHashtags(text: string): string[] {
  const plainText = text.replace(/<[^>]*>/g, "");
  const matches = plainText.match(/#[\w]+/g) || [];
  return [...new Set(
    matches
      .map((m) => m.slice(1).toLowerCase())
      // Filter out HTML entity artifacts like #39, #039, #x27 (from &#39; &#039; &#x27;)
      .filter((tag) => !/^\d+$/.test(tag) && !/^x[0-9a-f]+$/i.test(tag))
  )];
}
