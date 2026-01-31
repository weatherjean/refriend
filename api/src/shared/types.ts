/**
 * Shared TypeScript interfaces and types
 *
 * These types are used across multiple domains and represent
 * the core data models of the application.
 */

// ============ Core Entity Types ============

export interface User {
  id: number;
  username: string;
  email: string | null;
  password_hash: string;
  suspended: boolean;
  created_at: string;
}

export interface PasswordResetToken {
  id: number;
  token: string;
  user_id: number;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export interface Actor {
  id: number;
  public_id: string;
  uri: string;
  handle: string;
  name: string | null;
  bio: string | null;
  avatar_url: string | null;
  inbox_url: string;
  shared_inbox_url: string | null;
  url: string | null;
  user_id: number | null;
  actor_type: "Person" | "Group";
  follower_count: number;
  following_count: number;
  featured_fetched_at: string | null;
  created_at: string;
}

export interface KeyPair {
  id: number;
  user_id: number;
  type: "RSASSA-PKCS1-v1_5" | "Ed25519";
  private_key: string;
  public_key: string;
  created_at: string;
}

export interface Follow {
  follower_id: number;
  following_id: number;
  created_at: string;
}

export interface LinkPreview {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  site_name: string | null;
}

export interface VideoEmbed {
  platform: 'youtube' | 'tiktok' | 'peertube';
  videoId: string;
  embedUrl: string;
  thumbnailUrl: string | null;
  originalUrl: string;
}

export interface Post {
  id: number;
  public_id: string;
  uri: string;
  actor_id: number;
  type: 'Note' | 'Page' | 'Article';
  title: string | null;
  content: string;
  url: string | null;
  in_reply_to_id: number | null;
  addressed_to: string[];  // ActivityPub to/cc recipients (actor URIs)
  likes_count: number;
  boosts_count: number;
  replies_count: number;
  sensitive: boolean;
  link_preview: LinkPreview | null;
  video_embed: VideoEmbed | null;
  created_at: string;
}

export interface Media {
  id: number;
  post_id: number;
  url: string;
  media_type: string;
  alt_text: string | null;
  width: number | null;
  height: number | null;
  created_at: string;
}

export interface PostWithActor extends Post {
  author: Actor;
}

export interface Hashtag {
  id: number;
  name: string;
}

export interface Session {
  token: string;
  user_id: number;
  created_at: string;
  expires_at: string;
}

export interface Like {
  id: number;
  actor_id: number;
  post_id: number;
  created_at: string;
}

// ============ Notification Types ============

export type NotificationType = 'like' | 'boost' | 'follow' | 'reply' | 'mention';

export interface Notification {
  id: number;
  type: NotificationType;
  actor_id: number;
  target_actor_id: number;
  post_id: number | null;
  read: boolean;
  created_at: Date;
}

export interface NotificationWithActor extends Notification {
  actor: {
    id: number;
    public_id: string;
    handle: string;
    name: string | null;
    avatar_url: string | null;
  };
  post?: {
    id: number;
    public_id: string;
    content: string;
    author_handle: string;
    author_is_local: boolean;
  };
}

// ============ API Response Types ============

export interface SanitizedUser {
  id: number;
  username: string;
  created_at: string;
}

export interface SanitizedActor {
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
}

export interface EnrichedPost {
  id: string;
  uri: string;
  type: 'Note' | 'Page' | 'Article';
  title: string | null;
  content: string;
  url: string | null;
  created_at: string;
  author: SanitizedActor | null;
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
    author: SanitizedActor | null;
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
}

// ============ Hono Context Types ============

export interface AppEnv {
  Variables: {
    db: import("../db.ts").DB;
    domain: string;
    user: User | null;
    actor: Actor | null;
  };
}
