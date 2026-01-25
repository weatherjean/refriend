/**
 * Users Domain Types
 *
 * DTOs and interfaces specific to the users domain.
 */

import type { Actor, User } from "../../shared/types.ts";
import { formatDate } from "../../shared/formatting.ts";

// Re-export for consumers
export { formatDate };

// ============ Input DTOs ============

export interface RegisterInput {
  username: string;
  password: string;
  email: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface ChangePasswordInput {
  current_password: string;
  new_password: string;
}

export interface ResetPasswordInput {
  token: string;
  password: string;
}

export interface UpdateProfileInput {
  name?: string;
  bio?: string;
  avatar_url?: string;
}

// ============ Output DTOs ============

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

export interface AuthResponse {
  user: SanitizedUser;
  actor: SanitizedActor | null;
}

export interface ProfileResponse {
  actor: SanitizedActor;
  stats: {
    followers: number;
    following: number;
  };
  is_following: boolean;
  follow_status: 'pending' | 'accepted' | null;
  is_own_profile: boolean;
}

export interface TrendingUser {
  id: number;
  handle: string;
  name: string | null;
  avatar_url: string | null;
  new_followers: number;
}

// ============ Helper Functions ============

/**
 * Sanitize user for API response (hide password hash)
 */
export function sanitizeUser(user: User): SanitizedUser {
  return {
    id: user.id,
    username: user.username,
    created_at: formatDate(user.created_at),
  };
}

/**
 * Sanitize actor for API response
 */
export function sanitizeActor(actor: Actor, _domain?: string): SanitizedActor {
  const isLocal = actor.user_id !== null;

  return {
    id: actor.public_id,
    uri: actor.uri,
    handle: actor.handle,
    name: actor.name,
    bio: actor.bio,
    avatar_url: actor.avatar_url,
    url: actor.url,
    is_local: isLocal,
    actor_type: actor.actor_type,
    created_at: formatDate(actor.created_at),
  };
}
