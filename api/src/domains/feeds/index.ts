/**
 * Feeds Domain
 *
 * Exports for user-moderated curated feeds.
 */

export { createFeedRoutes } from "./routes.ts";
export * from "./service.ts";
export type { Feed, FeedBookmark } from "./repository.ts";
