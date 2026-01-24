/**
 * Posts Domain Types
 *
 * DTOs and interfaces specific to the posts domain.
 */

import type { LinkPreview, VideoEmbed, Actor, Post } from "../../shared/types.ts";

// Re-export shared formatting utilities
export { formatDate } from "../../shared/formatting.ts";

// ============ Input DTOs ============

export interface AttachmentInput {
  url: string;
  alt_text?: string;
  width: number;
  height: number;
}

export interface CreatePostInput {
  content: string;
  in_reply_to?: string;  // UUID/public_id
  attachments?: AttachmentInput[];
  sensitive?: boolean;
  link_url?: string;
  video_url?: string;
}

// ============ Output DTOs ============

export interface EnrichedPost {
  id: string;
  uri: string;
  content: string;
  url: string | null;
  created_at: string;
  author: {
    id: string;
    uri: string;
    handle: string;
    name: string | null;
    bio: string | null;
    avatar_url: string | null;
    url: string | null;
    is_local: boolean;
    actor_type: string;
    created_at: string;
  } | null;
  hashtags: string[];
  likes_count: number;
  boosts_count: number;
  liked: boolean;
  boosted: boolean;
  pinned: boolean;
  replies_count: number;
  in_reply_to: {
    id: string;
    uri: string;
    content: string;
    url: string | null;
    created_at: string;
    author: {
      id: string;
      uri: string;
      handle: string;
      name: string | null;
      bio: string | null;
      avatar_url: string | null;
      url: string | null;
      is_local: boolean;
      actor_type: string;
      created_at: string;
    } | null;
  } | null;
  sensitive: boolean;
  attachments: {
    id: number;
    url: string;
    media_type: string;
    alt_text: string | null;
    width: number | null;
    height: number | null;
  }[];
  link_preview: LinkPreview | null;
  video_embed: VideoEmbed | null;
  community: {
    id: string;
    name: string | null;
    handle: string;
    avatar_url: string | null;
  } | null;
}

export interface PostsListResponse {
  posts: EnrichedPost[];
  next_cursor: number | null;
}

