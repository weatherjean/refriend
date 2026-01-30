/**
 * Federation V2 Module
 *
 * Simplified federation implementation with inline inbox handlers.
 * This module exports everything needed for ActivityPub federation.
 */

// Federation instance and configuration
export {
  federation,
  setDomain,
  setDB,
  getDB,
  getDomain,
} from "./setup.ts";

// Actor persistence
export {
  persistActor,
} from "./utils/actor.ts";

// Send utilities
export { safeSendActivity, sendToCommunity } from "./utils/send.ts";

// Content utilities
export {
  sanitizeHtml,
  validateAndSanitizeContent,
  extractHashtags,
  MAX_CONTENT_SIZE,
} from "./utils/content.ts";

// Notes utilities
export { fetchAndStoreNote } from "./utils/notes.ts";
