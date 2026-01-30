import DOMPurify from 'dompurify';

/**
 * Sanitize HTML content to prevent XSS attacks.
 * Only allows safe tags and attributes for user-generated content.
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['a', 'p', 'br', 'span', 'strong', 'em', 'b', 'i'],
    ALLOWED_ATTR: ['href', 'class', 'target', 'rel'],
  });
}

export function formatTimeAgo(dateString: string): string {
  // Handle both ISO format (from API) and old SQLite format
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;

  return date.toLocaleDateString();
}

export function getUsername(handle: string): string {
  // Handle format: @username@domain
  const match = handle.match(/^@([^@]+)@/);
  return match ? match[1] : handle.replace(/^@/, '');
}

export function getDomain(handle: string): string | null {
  // Handle format: @username@domain
  const match = handle.match(/@[^@]+@(.+)$/);
  return match ? match[1] : null;
}

