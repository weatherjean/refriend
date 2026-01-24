/**
 * Communities Domain
 *
 * Re-exports all public interfaces from the communities domain.
 */

export { createCommunityRoutes, CommunityDB, CommunityModeration } from "./routes.ts";
export { CommunityDB as CommunityRepository } from "./repository.ts";
export type { Community, CommunitySettings, CommunityAdmin } from "./repository.ts";
export { CommunityModeration as Moderation } from "./moderation.ts";
export { announcePost, getCommunityActorUri, setCommunityDB } from "./federation.ts";
