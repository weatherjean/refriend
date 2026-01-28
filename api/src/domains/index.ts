/**
 * Domains Index
 *
 * Central export point for all domain modules.
 * This provides a clean interface for importing domain functionality.
 */

// Notifications Domain
export {
  createNotificationRoutes,
  createNotification,
  removeNotification,
} from "./notifications/index.ts";

// Users Domain
export {
  createUserRoutes,
  sanitizeUser,
  sanitizeActor,
} from "./users/index.ts";
export type {
  RegisterInput,
  LoginInput,
  SanitizedUser,
  SanitizedActor,
  AuthResponse,
  ProfileResponse,
} from "./users/index.ts";

// Social Domain
export {
  createSocialRoutes,
} from "./social/index.ts";

// Posts Domain
export {
  createPostRoutes,
  enrichPost,
  enrichPostsBatch,
} from "./posts/index.ts";
export type {
  EnrichedPost,
  PostsListResponse,
} from "./posts/index.ts";

// Federation Domain
export {
  federation,
  setDomain,
  setDB,
  getDB,
  getDomain,
  persistActor,
} from "./federation-v2/index.ts";

// Communities Domain
export {
  createCommunityRoutes,
  CommunityDB,
  CommunityModeration,
} from "./communities/index.ts";
