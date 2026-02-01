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
  }, REFRESH_INTERVAL_MS);

  console.log(`[HotFeed] Background loop started (every ${REFRESH_INTERVAL_MS / 1000}s)`);
}
