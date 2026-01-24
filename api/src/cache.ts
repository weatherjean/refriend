/// <reference lib="deno.unstable" />
// Deno KV-based cache for profile posts and hashtag pages

const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

let kv: Deno.Kv | null = null;

export async function initCache(): Promise<void> {
  kv = await Deno.openKv();
}

// ============ Profile Posts Cache ============

export async function getCachedProfilePosts(actorId: number, limit: number, before?: number): Promise<unknown | null> {
  if (!kv) return null;
  const key = ["profile", `${actorId}`, `${limit}`, before?.toString() ?? "none"];
  const entry = await kv.get(key);
  return entry.value;
}

export async function setCachedProfilePosts(actorId: number, limit: number, before: number | undefined, value: unknown): Promise<void> {
  if (!kv) return;
  const key = ["profile", `${actorId}`, `${limit}`, before?.toString() ?? "none"];
  await kv.set(key, value, { expireIn: CACHE_TTL_MS });
}

export async function invalidateProfileCache(actorId: number): Promise<void> {
  if (!kv) return;

  // Delete all cache entries for this actor's profile
  const entries = kv.list({ prefix: ["profile", `${actorId}`] });
  for await (const entry of entries) {
    await kv.delete(entry.key);
  }
}

// ============ Hashtag Cache ============

export async function getCachedHashtagPosts(tag: string, limit: number, before?: number): Promise<unknown | null> {
  if (!kv) return null;
  const key = ["hashtag", tag.toLowerCase(), `${limit}`, before?.toString() ?? "none"];
  const entry = await kv.get(key);
  return entry.value;
}

export async function setCachedHashtagPosts(tag: string, limit: number, before: number | undefined, value: unknown): Promise<void> {
  if (!kv) return;
  const key = ["hashtag", tag.toLowerCase(), `${limit}`, before?.toString() ?? "none"];
  await kv.set(key, value, { expireIn: CACHE_TTL_MS });
}

// ============ Trending Users Cache ============

const TRENDING_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function getCachedTrendingUsers(): Promise<unknown | null> {
  if (!kv) return null;
  const entry = await kv.get(["trending", "users"]);
  return entry.value;
}

export async function setCachedTrendingUsers(value: unknown): Promise<void> {
  if (!kv) return;
  await kv.set(["trending", "users"], value, { expireIn: TRENDING_TTL_MS });
}

// ============ Trending Communities Cache ============

const TRENDING_COMMUNITIES_TTL_MS = 15 * 60 * 1000; // 15 minutes

export async function getCachedTrendingCommunities(): Promise<unknown | null> {
  if (!kv) return null;
  const entry = await kv.get(["trending", "communities"]);
  return entry.value;
}

export async function setCachedTrendingCommunities(value: unknown): Promise<void> {
  if (!kv) return;
  await kv.set(["trending", "communities"], value, { expireIn: TRENDING_COMMUNITIES_TTL_MS });
}
