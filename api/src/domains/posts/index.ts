/**
 * Posts Domain
 *
 * Re-exports all public interfaces from the posts domain.
 */

export { createPostRoutes, enrichPost, enrichPostsBatch } from "./routes.ts";
export type {
  CreatePostInput,
  AttachmentInput,
  EnrichedPost,
  PostsListResponse,
} from "./types.ts";
