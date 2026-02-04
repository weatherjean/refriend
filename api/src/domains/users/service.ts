/**
 * Users Service
 *
 * Business logic for user authentication, registration, and profile management.
 */

import type { DB } from "../../db.ts";
import type { Federation } from "@fedify/fedify";
import type { User, Actor } from "../../shared/types.ts";
import type {
  RegisterInput,
  LoginInput,
  ChangePasswordInput,
  ResetPasswordInput,
  AuthResponse,
  ProfileResponse,
  TrendingUser,
  SanitizedActor,
} from "./types.ts";
import { sanitizeUser, sanitizeActor } from "./types.ts";
import { sendPasswordResetEmail } from "../../email.ts";
import {
  getCachedTrendingUsers,
  setCachedTrendingUsers,
  getCachedProfilePosts,
  setCachedProfilePosts,
} from "../../cache.ts";
import { enrichPostsBatch } from "../posts/service.ts";
import { maybeRecalculateActorScores } from "../../hot-feed.ts";
import { fetchAndStoreNote } from "../federation-v2/utils/notes.ts";


// ============ Password Hashing ============

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", data, "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: 100000 },
    key,
    256
  );
  const hash = btoa(String.fromCharCode(...new Uint8Array(bits)));
  const saltStr = btoa(String.fromCharCode(...salt));
  return `${saltStr}:${hash}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltStr, storedHash] = stored.split(":");
  const salt = Uint8Array.from(atob(saltStr), (c) => c.charCodeAt(0));
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const key = await crypto.subtle.importKey("raw", data, "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: 100000 },
    key,
    256
  );
  const hash = btoa(String.fromCharCode(...new Uint8Array(bits)));
  return hash === storedHash;
}

// ============ Validation ============

export function validateUsername(username: string): string | null {
  if (!username) {
    return "Username is required";
  }
  if (!/^[a-z0-9_]+$/.test(username) || username.length > 26) {
    return "Invalid username (lowercase, numbers, underscore only, max 26 chars)";
  }
  return null;
}

export function validateEmail(email: string): string | null {
  if (!email) {
    return "Email is required";
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return "Invalid email address";
  }
  return null;
}

export function validatePassword(password: string): string | null {
  if (!password) {
    return "Password is required";
  }
  if (password.length < 8) {
    return "Password must be at least 8 characters";
  }
  return null;
}

// ============ Service Functions ============

export interface RegisterResult {
  success: boolean;
  error?: string;
  user?: User;
  actor?: Actor;
  sessionToken?: string;
  csrfToken?: string;
}

export async function register(
  db: DB,
  domain: string,
  input: RegisterInput
): Promise<RegisterResult> {
  const { username, password, email } = input;

  // Check for missing required fields first (matches original api.ts behavior)
  if (!username || !password || !email) {
    return { success: false, error: "Username, email, and password required" };
  }

  // Validate individual inputs
  const usernameError = validateUsername(username);
  if (usernameError) {
    return { success: false, error: usernameError };
  }

  const emailError = validateEmail(email);
  if (emailError) {
    return { success: false, error: emailError };
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    return { success: false, error: passwordError };
  }

  // Check if username is taken
  if (await db.getUserByUsername(username)) {
    return { success: false, error: "Username taken" };
  }

  // Check if email is already in use
  if (await db.getUserByEmail(email)) {
    return { success: false, error: "Email already in use" };
  }

  // Create user
  const passwordHash = await hashPassword(password);
  const user = await db.createUser(username, passwordHash, email);

  // Create actor for the user
  const actorUri = `https://${domain}/@${username}`;
  const actor = await db.createActor({
    uri: actorUri,
    handle: `@${username}@${domain}`,
    name: null,
    bio: null,
    avatar_url: null,
    inbox_url: `https://${domain}/@${username}/inbox`,
    shared_inbox_url: `https://${domain}/inbox`,
    url: actorUri,
    user_id: user.id,
    actor_type: "Person",
  });

  // Create session
  const { token: sessionToken, csrfToken } = await db.createSession(user.id);

  return { success: true, user, actor, sessionToken, csrfToken };
}

export interface LoginResult {
  success: boolean;
  error?: string;
  user?: User;
  actor?: Actor | null;
  sessionToken?: string;
  csrfToken?: string;
}

export async function login(db: DB, input: LoginInput): Promise<LoginResult> {
  const { email, password } = input;

  const user = await db.getUserByEmail(email);
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return { success: false, error: "Invalid credentials" };
  }

  if (user.suspended) {
    return { success: false, error: "Account suspended" };
  }

  const actor = await db.getActorByUserId(user.id);
  const { token: sessionToken, csrfToken } = await db.createSession(user.id);

  return { success: true, user, actor, sessionToken, csrfToken };
}

export async function logout(db: DB, sessionToken: string | undefined): Promise<void> {
  if (sessionToken) {
    await db.deleteSession(sessionToken);
  }
}

export async function changePassword(
  db: DB,
  userId: number,
  input: ChangePasswordInput,
  currentSessionToken?: string
): Promise<{ success: boolean; error?: string }> {
  const { current_password, new_password } = input;

  if (!current_password || !new_password) {
    return { success: false, error: "Current and new password required" };
  }

  const passwordError = validatePassword(new_password);
  if (passwordError) {
    return { success: false, error: passwordError };
  }

  // Verify current password
  const user = await db.getUserById(userId);
  if (!user || !(await verifyPassword(current_password, user.password_hash))) {
    return { success: false, error: "Current password is incorrect" };
  }

  // Update password
  const newHash = await hashPassword(new_password);
  await db.updateUserPassword(userId, newHash);

  // Invalidate all sessions except the current one for security
  // This logs out the user from all other devices
  await db.deleteUserSessions(userId);

  return { success: true };
}

export async function requestPasswordReset(
  db: DB,
  email: string
): Promise<{ success: boolean; error?: string }> {
  if (!email) {
    return { success: true }; // Don't reveal email existence
  }

  const user = await db.getUserByEmail(email);
  if (!user) {
    return { success: true }; // Don't reveal email existence
  }

  // Rate limiting: check last reset request time (60 second minimum)
  const lastRequest = await db.getLastResetRequestTime(user.id);
  if (lastRequest) {
    const timeSinceLastRequest = Date.now() - new Date(lastRequest).getTime();
    if (timeSinceLastRequest < 60 * 1000) {
      const secondsRemaining = Math.ceil((60 * 1000 - timeSinceLastRequest) / 1000);
      return {
        success: false,
        error: `Please wait ${secondsRemaining} seconds before requesting another reset email`,
      };
    }
  }

  // Create reset token and send email
  const token = await db.createPasswordResetToken(user.id);
  await sendPasswordResetEmail(email, token);

  return { success: true };
}

export async function validateResetToken(
  db: DB,
  token: string
): Promise<{ valid: boolean }> {
  const resetToken = await db.getPasswordResetToken(token);
  return { valid: !!resetToken };
}

export async function resetPassword(
  db: DB,
  input: ResetPasswordInput
): Promise<{ success: boolean; error?: string }> {
  const { token, password } = input;

  if (!token || !password) {
    return { success: false, error: "Token and password required" };
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    return { success: false, error: passwordError };
  }

  const resetToken = await db.getPasswordResetToken(token);
  if (!resetToken) {
    return { success: false, error: "Invalid or expired reset link" };
  }

  // Update password and mark token as used
  const passwordHash = await hashPassword(password);
  await db.updateUserPassword(resetToken.user_id, passwordHash);
  await db.markTokenUsed(token);

  // Invalidate all existing sessions for security
  await db.deleteUserSessions(resetToken.user_id);

  return { success: true };
}

/**
 * Check if request is over HTTPS (including behind proxy)
 */
export function isSecureRequest(req: Request, domain: string): boolean {
  // Local development
  if (domain.startsWith("localhost")) {
    return false;
  }

  // Check X-Forwarded-Proto header (set by reverse proxies)
  const proto = req.headers.get("x-forwarded-proto");
  if (proto === "https") {
    return true;
  }

  // Check actual URL protocol
  try {
    const url = new URL(req.url);
    return url.protocol === "https:";
  } catch {
    return true; // Default to secure if we can't parse
  }
}

// ============ Profile Functions ============

export async function getProfile(
  db: DB,
  username: string,
  currentActorId?: number,
  domain?: string
): Promise<ProfileResponse | null> {
  const actor = await db.getActorByUsername(username);
  if (!actor) {
    return null;
  }

  const followStatus = currentActorId
    ? await db.getFollowStatus(currentActorId, actor.id)
    : null;
  const isOwnProfile = currentActorId === actor.id;

  return {
    actor: sanitizeActor(actor, domain),
    stats: {
      followers: await db.getFollowersCount(actor.id),
      following: await db.getFollowingCount(actor.id),
    },
    is_following: followStatus === 'accepted',
    follow_status: followStatus,
    is_own_profile: isOwnProfile,
  };
}

export async function getTrendingUsers(db: DB): Promise<{ users: TrendingUser[] }> {
  const cached = await getCachedTrendingUsers();
  if (cached) {
    return cached as { users: TrendingUser[] };
  }

  const users = await db.getTrendingUsers(3);
  const result = {
    users: users.map((u) => ({
      id: u.id,
      handle: u.handle,
      name: u.name,
      avatar_url: u.avatar_url,
      new_followers: u.new_followers,
    })),
  };

  await setCachedTrendingUsers(result);
  return result;
}

export function getCurrentUser(
  user: User | null,
  actor: Actor | null,
  domain: string
): AuthResponse | null {
  if (!user || !actor) {
    return null;
  }
  return {
    user: sanitizeUser(user),
    actor: sanitizeActor(actor, domain),
  };
}

// ============ Profile Update Functions ============

export interface UpdateProfileInput {
  name?: string;
  bio?: string;
}

export interface UpdateProfileResult {
  success: boolean;
  error?: string;
  actor?: SanitizedActor;
}

export async function updateProfile(
  db: DB,
  actorId: number,
  input: UpdateProfileInput,
  domain: string
): Promise<UpdateProfileResult> {
  const { name, bio } = input;

  // Validate lengths
  if (name && name.length > 100) {
    return { success: false, error: "Name too long (max 100 characters)" };
  }
  if (bio && bio.length > 200) {
    return { success: false, error: "Bio too long (max 200 characters)" };
  }

  const updated = await db.updateActorProfile(actorId, { name, bio });
  if (!updated) {
    return { success: false, error: "Failed to update profile" };
  }

  return { success: true, actor: sanitizeActor(updated, domain) };
}

export interface UpdateAvatarResult {
  success: boolean;
  error?: string;
  actor?: SanitizedActor;
  avatar_url?: string;
}

export async function updateAvatar(
  db: DB,
  actorId: number,
  imageBase64: string,
  domain: string,
  saveAvatarFn: (filename: string, data: Uint8Array) => Promise<string>
): Promise<UpdateAvatarResult> {
  if (!imageBase64) {
    return { success: false, error: "No image provided" };
  }

  // Extract format from data URL (e.g., "data:image/webp;base64,..." -> "webp")
  const formatMatch = imageBase64.match(/^data:image\/(\w+);base64,/);
  const format = formatMatch?.[1] || "webp";
  const extension = format === "jpeg" ? "jpg" : format;

  // Decode base64 image
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
  const imageData = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

  // Validate image size (max 25MB)
  if (imageData.length > 25 * 1024 * 1024) {
    return { success: false, error: "Image too large (max 25MB)" };
  }

  // Generate filename with correct extension
  const filename = `${actorId}-${Date.now()}.${extension}`;

  // Save to storage
  const avatarUrl = await saveAvatarFn(filename, imageData);

  // Update actor in database
  const updated = await db.updateActorProfile(actorId, { avatar_url: avatarUrl });
  if (!updated) {
    return { success: false, error: "Failed to update avatar" };
  }

  return { success: true, actor: sanitizeActor(updated, domain), avatar_url: avatarUrl };
}

// ============ User Posts Functions ============

export interface UserPostsResult {
  posts: unknown[];
  next_cursor: number | null;
}

export async function getUserPosts(
  db: DB,
  username: string,
  options: {
    filter?: string;
    sort?: "hot" | "new";
    limit?: number;
    before?: number;
    currentActorId?: number;
    domain?: string;
    communityDb?: unknown;
  }
): Promise<UserPostsResult | null> {
  const { filter, sort = "new", limit = 20, before, currentActorId, domain, communityDb } = options;

  const actor = await db.getActorByUsername(username);
  if (!actor) {
    return null;
  }

  // Only cache main posts (not replies) for logged-out users with default sort
  if (!filter && !currentActorId && sort === "new") {
    const cached = await getCachedProfilePosts(actor.id, limit, before);
    if (cached) {
      return cached as UserPostsResult;
    }
  }

  if (sort === "hot" && !filter) {
    await maybeRecalculateActorScores(db, actor.id);
  }

  // Use optimized batch methods with pagination
  const posts = filter === "replies"
    ? await db.getRepliesByActorWithActor(actor.id, limit + 1, before)
    : await db.getPostsByActorWithActor(actor.id, limit + 1, before, sort);

  const hasMore = posts.length > limit;
  const resultPosts = hasMore ? posts.slice(0, limit) : posts;
  const nextCursor = hasMore && resultPosts.length > 0
    ? resultPosts[resultPosts.length - 1].id
    : null;

  const enrichedPosts = await enrichPostsBatch(db, resultPosts, currentActorId, domain);

  const result = {
    posts: enrichedPosts,
    next_cursor: nextCursor,
  };

  // Cache for logged-out users viewing main posts
  if (!filter && !currentActorId) {
    await setCachedProfilePosts(actor.id, limit, before, result);
  }

  return result;
}

export async function getUserPinnedPosts(
  db: DB,
  username: string,
  currentActorId?: number,
  domain?: string,

): Promise<{ posts: unknown[] } | null> {
  const actor = await db.getActorByUsername(username);
  if (!actor) {
    return null;
  }

  const posts = await db.getPinnedPostsWithActor(actor.id);
  return {
    posts: await enrichPostsBatch(db, posts, currentActorId, domain),
  };
}

export async function getUserBoostedPosts(
  db: DB,
  username: string,
  options: {
    limit?: number;
    before?: number;
    currentActorId?: number;
    domain?: string;
    communityDb?: unknown;
    postsOnly?: boolean;
  }
): Promise<{ posts: unknown[]; next_cursor: number | null } | null> {
  const { limit = 20, before, currentActorId, domain, communityDb, postsOnly } = options;

  const actor = await db.getActorByUsername(username);
  if (!actor) {
    return null;
  }

  const posts = await db.getBoostedPostsWithActor(actor.id, limit + 1, before, postsOnly);

  const hasMore = posts.length > limit;
  const resultPosts = hasMore ? posts.slice(0, limit) : posts;
  const nextCursor = hasMore && resultPosts.length > 0
    ? resultPosts[resultPosts.length - 1].id
    : null;

  const enrichedPosts = await enrichPostsBatch(db, resultPosts, currentActorId, domain);

  // Add boosted_by info since these are all posts boosted by this actor
  const postsWithBooster = enrichedPosts.map(post => ({
    ...post,
    boosted_by: {
      id: actor.public_id,
      handle: actor.handle,
      name: actor.name,
      avatar_url: actor.avatar_url,
    },
  }));

  return {
    posts: postsWithBooster,
    next_cursor: nextCursor,
  };
}

// ============ Actor Functions ============

export async function getActorById(
  db: DB,
  publicId: string,
  currentActorId?: number,
  domain?: string
): Promise<{ actor: SanitizedActor; is_following: boolean; follow_status: 'pending' | 'accepted' | null; is_own_profile: boolean; stats: { followers: number; following: number } } | null> {
  const actor = await db.getActorByPublicId(publicId);
  if (!actor) {
    return null;
  }

  const followStatus = currentActorId ? await db.getFollowStatus(currentActorId, actor.id) : null;
  const isOwnProfile = currentActorId === actor.id;

  return {
    actor: sanitizeActor(actor, domain),
    is_following: followStatus === 'accepted',
    follow_status: followStatus,
    is_own_profile: isOwnProfile,
    stats: {
      followers: actor.follower_count,
      following: actor.following_count,
    },
  };
}

export async function getActorPosts(
  db: DB,
  publicId: string,
  options: {
    filter?: string;
    sort?: "hot" | "new";
    limit?: number;
    before?: number;
    currentActorId?: number;
    domain?: string;
    communityDb?: unknown;
  }
): Promise<UserPostsResult | null> {
  const { filter, sort = "new", limit = 20, before, currentActorId, domain, communityDb } = options;

  const actor = await db.getActorByPublicId(publicId);
  if (!actor) {
    return null;
  }

  // Only cache main posts (not replies) for logged-out users with default sort
  if (!filter && !currentActorId && sort === "new") {
    const cached = await getCachedProfilePosts(actor.id, limit, before);
    if (cached) {
      return cached as UserPostsResult;
    }
  }

  if (sort === "hot" && !filter) {
    await maybeRecalculateActorScores(db, actor.id);
  }

  // Use optimized batch methods with pagination
  const posts = filter === "replies"
    ? await db.getRepliesByActorWithActor(actor.id, limit + 1, before)
    : await db.getPostsByActorWithActor(actor.id, limit + 1, before, sort);

  const hasMore = posts.length > limit;
  const resultPosts = hasMore ? posts.slice(0, limit) : posts;
  const nextCursor = hasMore && resultPosts.length > 0
    ? resultPosts[resultPosts.length - 1].id
    : null;

  const enrichedPosts = await enrichPostsBatch(db, resultPosts, currentActorId, domain);

  const result = {
    posts: enrichedPosts,
    next_cursor: nextCursor,
  };

  // Cache for logged-out users viewing main posts
  if (!filter && !currentActorId) {
    await setCachedProfilePosts(actor.id, limit, before, result);
  }

  return result;
}

export async function getActorPinnedPosts(
  db: DB,
  publicId: string,
  currentActorId?: number,
  domain?: string,
  federation?: Federation<void>,
  request?: Request,
): Promise<{ posts: unknown[]; isLocal: boolean } | null> {
  const actor = await db.getActorByPublicId(publicId);
  if (!actor) {
    return null;
  }

  // For local actors, return from our pinned_posts table
  if (actor.user_id !== null) {
    const posts = await db.getPinnedPostsWithActor(actor.id);
    return {
      posts: await enrichPostsBatch(db, posts, currentActorId, domain),
      isLocal: true,
    };
  }

  // For remote actors, fetch featured collection if stale or never fetched
  if (federation && request && domain) {
    const FEATURED_TTL_MS = 60 * 60 * 1000; // 1 hour
    const isStale = !actor.featured_fetched_at ||
      (Date.now() - new Date(actor.featured_fetched_at).getTime()) > FEATURED_TTL_MS;

    if (isStale) {
      try {
        await fetchRemoteFeaturedCollection(db, domain, actor, federation, request);
      } catch (e) {
        console.error(`[Featured] Failed to fetch featured for ${actor.handle}:`, e);
      }
    }
  }

  const posts = await db.getPinnedPostsWithActor(actor.id);
  return {
    posts: await enrichPostsBatch(db, posts, currentActorId, domain),
    isLocal: false,
  };
}

async function fetchRemoteFeaturedCollection(
  db: DB,
  domain: string,
  actor: Actor,
  federation: Federation<void>,
  request: Request,
): Promise<void> {
  const ctx = federation.createContext(request, undefined);
  const docLoader = ctx.documentLoader;

  // Fetch the actor's AP profile to get the featured collection URL
  const { document: actorDoc } = await docLoader(actor.uri);
  // deno-lint-ignore no-explicit-any
  const featuredUrl = (actorDoc as any)?.featured;
  if (!featuredUrl) {
    console.log(`[Featured] No featured collection for ${actor.handle}`);
    await db.updateFeaturedFetchedAt(actor.id);
    return;
  }

  const featuredUri = typeof featuredUrl === 'string' ? featuredUrl :
    (featuredUrl?.id || featuredUrl);
  if (!featuredUri || typeof featuredUri !== 'string') {
    await db.updateFeaturedFetchedAt(actor.id);
    return;
  }

  console.log(`[Featured] Fetching featured collection for ${actor.handle}: ${featuredUri}`);

  // Fetch the featured collection
  const { document: collectionDoc } = await docLoader(featuredUri);
  // deno-lint-ignore no-explicit-any
  const items = (collectionDoc as any)?.orderedItems || (collectionDoc as any)?.items || [];

  // Collect post IDs from fetched items
  const pinnedPostIds: number[] = [];

  for (const item of items) {
    const itemUri = typeof item === 'string' ? item : item?.id;
    if (!itemUri) continue;

    try {
      const postId = await fetchAndStoreNote(ctx, db, domain, itemUri);
      if (postId) {
        pinnedPostIds.push(postId);
      }
    } catch (e) {
      console.error(`[Featured] Failed to fetch item ${itemUri}:`, e);
    }
  }

  // Clear existing pinned posts for this actor, then insert fresh ones
  await db.clearPinnedPosts(actor.id);
  for (const postId of pinnedPostIds) {
    await db.pinPost(actor.id, postId);
  }
  await db.updateFeaturedFetchedAt(actor.id);

  console.log(`[Featured] Stored ${pinnedPostIds.length} pinned posts for ${actor.handle}`);
}

export async function getActorBoostedPosts(
  db: DB,
  publicId: string,
  options: {
    limit?: number;
    before?: number;
    currentActorId?: number;
    domain?: string;
    communityDb?: unknown;
    postsOnly?: boolean;
  }
): Promise<{ posts: unknown[]; next_cursor: number | null } | null> {
  const { limit = 20, before, currentActorId, domain, communityDb, postsOnly } = options;

  const actor = await db.getActorByPublicId(publicId);
  if (!actor) {
    return null;
  }

  // Both local and remote actors can have boost data (from Announce activities)
  const posts = await db.getBoostedPostsWithActor(actor.id, limit + 1, before, postsOnly);

  const hasMore = posts.length > limit;
  const resultPosts = hasMore ? posts.slice(0, limit) : posts;
  const nextCursor = hasMore && resultPosts.length > 0
    ? resultPosts[resultPosts.length - 1].id
    : null;

  const enrichedPosts = await enrichPostsBatch(db, resultPosts, currentActorId, domain);

  // Add boosted_by info since these are all posts boosted by this actor
  const postsWithBooster = enrichedPosts.map(post => ({
    ...post,
    boosted_by: {
      id: actor.public_id,
      handle: actor.handle,
      name: actor.name,
      avatar_url: actor.avatar_url,
    },
  }));

  return {
    posts: postsWithBooster,
    next_cursor: nextCursor,
  };
}

// ============ Account Deletion ============

export async function deleteAccount(
  db: DB,
  userId: number,
  password: string
): Promise<{ success: boolean; error?: string }> {
  const user = await db.getUserById(userId);
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return { success: false, error: "Incorrect password" };
  }
  await db.deleteUser(userId);
  return { success: true };
}
