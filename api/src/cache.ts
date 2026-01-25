/// <reference lib="deno.unstable" />
// Deno KV-based cache for profile posts and hashtag pages

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes (increased for production load)

let kv: Deno.Kv | null = null;

export async function initCache(): Promise<void> {
  const kvPath = Deno.env.get("DENO_KV_PATH") || undefined;
  kv = await Deno.openKv(kvPath);
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

export async function clearCachedTrendingCommunities(): Promise<void> {
  if (!kv) return;
  await kv.delete(["trending", "communities"]);
}

// ============ Rate Limiting ============

/**
 * Rate limit configuration per action type.
 * Limits are generous to accommodate power users while preventing abuse.
 */
export interface RateLimitConfig {
  windowMs: number;  // Time window in milliseconds
  maxRequests: number;  // Max requests per window
}

export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  // Auth endpoints - stricter to prevent brute force
  "auth:login": { windowMs: 15 * 60 * 1000, maxRequests: 20 },  // 20 attempts per 15 min
  "auth:register": { windowMs: 60 * 60 * 1000, maxRequests: 5 },  // 5 registrations per hour per IP
  "auth:password-reset": { windowMs: 60 * 60 * 1000, maxRequests: 5 },  // 5 reset requests per hour
  "auth:delete": { windowMs: 60 * 60 * 1000, maxRequests: 5 },  // 5 delete attempts per hour

  // Content creation - generous for active users
  "post:create": { windowMs: 60 * 1000, maxRequests: 10 },  // 10 posts per minute
  "post:like": { windowMs: 60 * 1000, maxRequests: 60 },  // 60 likes per minute (rapid scrolling)
  "post:boost": { windowMs: 60 * 1000, maxRequests: 30 },  // 30 boosts per minute
  "media:upload": { windowMs: 60 * 1000, maxRequests: 20 },  // 20 uploads per minute

  // Social actions
  "follow": { windowMs: 60 * 1000, maxRequests: 30 },  // 30 follows per minute
  "report": { windowMs: 60 * 60 * 1000, maxRequests: 20 },  // 20 reports per hour

  // Search/read endpoints - very generous
  "search": { windowMs: 60 * 1000, maxRequests: 60 },  // 60 searches per minute
  "api:general": { windowMs: 60 * 1000, maxRequests: 300 },  // 300 requests per minute general
};

/**
 * Check if a request should be rate limited.
 * Returns { limited: true, retryAfter: seconds } if limited.
 */
export async function checkRateLimit(
  identifier: string,  // IP address or user ID
  action: string
): Promise<{ limited: boolean; retryAfter?: number; remaining?: number }> {
  if (!kv) return { limited: false };

  const config = RATE_LIMITS[action] || RATE_LIMITS["api:general"];
  const windowStart = Math.floor(Date.now() / config.windowMs);
  const key = ["ratelimit", action, identifier, windowStart.toString()];

  const entry = await kv.get<number>(key);
  const currentCount = entry.value || 0;

  if (currentCount >= config.maxRequests) {
    // Calculate when the window resets
    const windowEnd = (windowStart + 1) * config.windowMs;
    const retryAfter = Math.ceil((windowEnd - Date.now()) / 1000);
    return { limited: true, retryAfter, remaining: 0 };
  }

  // Increment counter
  await kv.set(key, currentCount + 1, { expireIn: config.windowMs });

  return { limited: false, remaining: config.maxRequests - currentCount - 1 };
}

/**
 * Get the client identifier for rate limiting.
 * Uses IP address, preferring X-Forwarded-For for proxied requests.
 *
 * SECURITY NOTE: X-Forwarded-For should only be trusted when running behind
 * a trusted reverse proxy that overwrites the header. In production, configure
 * TRUST_PROXY=true only if behind nginx/cloudflare/etc that sets the header.
 */
export function getRateLimitIdentifier(req: Request, userId?: number): string {
  // If user is authenticated, use their ID for more accurate limiting
  if (userId) {
    return `user:${userId}`;
  }

  // Only trust X-Forwarded-For if explicitly configured (behind trusted proxy)
  const trustProxy = Deno.env.get("TRUST_PROXY") === "true";
  if (trustProxy) {
    const forwarded = req.headers.get("x-forwarded-for");
    if (forwarded) {
      // X-Forwarded-For can contain multiple IPs, use the first (original client)
      // Note: A trusted proxy should strip any client-provided X-Forwarded-For
      const clientIp = forwarded.split(",")[0].trim();
      // Validate it looks like an IP address (basic check)
      if (clientIp && /^[\d.:a-fA-F]+$/.test(clientIp)) {
        return `ip:${clientIp}`;
      }
    }
  }

  // Try to get IP from X-Real-IP (set by nginx)
  const realIp = req.headers.get("x-real-ip");
  if (trustProxy && realIp && /^[\d.:a-fA-F]+$/.test(realIp)) {
    return `ip:${realIp}`;
  }

  // Fallback for development or direct connections
  // In production behind a proxy, this will be the proxy's IP
  return `ip:unknown`;
}

