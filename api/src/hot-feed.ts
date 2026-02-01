/**
 * Hot Feed Background Refresh
 *
 * Periodically recalculates hot_score for top posts so time decay
 * is reflected even without new engagement events. Caches the
 * result in memory so the /posts/hot endpoint avoids redundant work.
 */

import type { DB, PostWithActor } from "./db.ts";

const REFRESH_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes
const CACHE_SIZE = 200;
const STALE_AGE_HOURS = 3; // recalculate posts older than this
const MAX_ITERATIONS = 5; // cap stabilization loops

let cache: PostWithActor[] | null = null;

/**
 * Returns the cached hot feed posts, or null if not yet populated.
 */
export function getHotFeedCache(): PostWithActor[] | null {
  return cache;
}

/**
 * Single refresh cycle:
 *  1. Fetch top 200 by hot_score
 *  2. Recalculate scores for any post older than STALE_AGE_HOURS
 *  3. Re-fetch and repeat until the top 200 is stable
 *  4. Store result in memory
 */
async function refresh(db: DB): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_AGE_HOURS * 60 * 60 * 1000);

  let previousIds: string = "";

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const posts = await db.getHotPosts(CACHE_SIZE, 0);

    // Find stale posts (created before cutoff)
    const staleIds = posts
      .filter((p) => new Date(p.created_at) < cutoff)
      .map((p) => p.id);

    if (staleIds.length > 0) {
      await db.recalculateHotScores(staleIds);
      console.log(`[HotFeed] Recalculated ${staleIds.length} stale scores (iteration ${i + 1})`);
    }

    // Re-fetch after recalculation
    const updated = staleIds.length > 0
      ? await db.getHotPosts(CACHE_SIZE, 0)
      : posts;

    const currentIds = updated.map((p) => p.id).join(",");

    if (currentIds === previousIds) {
      // Stable — no displacement
      cache = updated;
      console.log(`[HotFeed] Cache stable after ${i + 1} iteration(s), ${updated.length} posts cached`);
      return;
    }

    previousIds = currentIds;
    cache = updated;

    // If nothing was stale, no point iterating further
    if (staleIds.length === 0) {
      console.log(`[HotFeed] No stale posts, ${updated.length} posts cached`);
      return;
    }
  }

  console.log(`[HotFeed] Reached max iterations (${MAX_ITERATIONS}), ${cache?.length ?? 0} posts cached`);
}

/**
 * Clear stale throttle entries after each refresh cycle.
 */
function clearExpiredThrottleEntries(): void {
  const now = Date.now();
  for (const [key, timestamp] of recalcThrottle) {
    if (now - timestamp >= RECALC_COOLDOWN_MS) {
      recalcThrottle.delete(key);
    }
  }
}

// ============ Throttled on-demand recalculation for tags/profiles ============

const recalcThrottle = new Map<string, number>();
const RECALC_COOLDOWN_MS = 3 * 60 * 1000; // 3 minutes

/**
 * Recalculate hot scores for an actor's posts if not done recently.
 * Call before fetching hot-sorted profile posts.
 */
export async function maybeRecalculateActorScores(db: DB, actorId: number): Promise<void> {
  const key = `actor:${actorId}`;
  const last = recalcThrottle.get(key) ?? 0;
  if (Date.now() - last < RECALC_COOLDOWN_MS) return;
  recalcThrottle.set(key, Date.now());
  await db.recalculateActorHotScores(actorId);
}

/**
 * Recalculate hot scores for a hashtag's posts if not done recently.
 * Call before fetching hot-sorted tag posts.
 */
export async function maybeRecalculateHashtagScores(db: DB, tag: string): Promise<void> {
  const key = `tag:${tag}`;
  const last = recalcThrottle.get(key) ?? 0;
  if (Date.now() - last < RECALC_COOLDOWN_MS) return;
  recalcThrottle.set(key, Date.now());
  await db.recalculateHashtagHotScores(tag);
}

// ============ Background loop ============

/**
 * Start the background hot-feed refresh loop.
 * Call once at startup after DB init.
 */
export function startHotFeedLoop(db: DB): void {
  // Initial refresh (don't block startup)
  refresh(db).catch((err) =>
    console.error("[HotFeed] Initial refresh failed:", err)
  );

  setInterval(() => {
    refresh(db).catch((err) =>
      console.error("[HotFeed] Refresh failed:", err)
    );
    clearExpiredThrottleEntries();
  }, REFRESH_INTERVAL_MS);

  console.log(`[HotFeed] Background loop started (every ${REFRESH_INTERVAL_MS / 1000}s)`);
}
