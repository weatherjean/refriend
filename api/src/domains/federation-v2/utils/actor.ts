/**
 * Federation Actor Persistence
 *
 * Functions for persisting remote actors from ActivityPub.
 */

import { Group, type Actor as APActor } from "@fedify/fedify";
import type { DB, Actor } from "../../../db.ts";
import { isPrivateUrl } from "../../posts/service.ts";

/**
 * Persist a remote actor to the database
 */
export async function persistActor(db: DB, domain: string, actor: APActor): Promise<Actor | null> {
  if (!actor.id) return null;

  // Determine if this is a Group (community) or Person
  const isGroup = actor instanceof Group;

  // Check if this is a local actor
  if (actor.id.host === domain.replace(/:\d+$/, "") || actor.id.host === domain) {
    const username = actor.preferredUsername?.toString();
    if (username) {
      const existing = await db.getActorByUsername(username);
      if (existing) return existing;
    }
  }

  const prefUsername = actor.preferredUsername?.toString();
  // Use @ prefix for all actors (persons and groups/communities)
  const handle = prefUsername
    ? `@${prefUsername}@${actor.id.host}`
    : `@unknown@${actor.id.host}`;

  const inboxUrl = actor.inboxId?.href;
  if (!inboxUrl) return null;

  // Block actors with private/internal inbox URLs (SSRF prevention)
  try {
    if (isPrivateUrl(new URL(inboxUrl))) {
      console.warn(`[federation] Rejecting actor with private inbox URL: ${inboxUrl}`);
      return null;
    }
  } catch {
    return null;
  }

  // Extract and truncate name (max 200 chars)
  let name = typeof actor.name === "string"
    ? actor.name
    : actor.name?.toString() ?? null;
  if (name && name.length > 200) {
    name = name.slice(0, 200);
  }

  // Extract and truncate bio (max 5000 chars for remote actors)
  let bio = typeof actor.summary === "string"
    ? actor.summary
    : actor.summary?.toString() ?? null;
  if (bio && bio.length > 5000) {
    bio = bio.slice(0, 5000);
  }

  let avatarUrl: string | null = null;
  const icon = await actor.getIcon();
  if (icon && "url" in icon && icon.url) {
    const rawUrl = icon.url instanceof URL ? icon.url.href : String(icon.url);
    try {
      if (!isPrivateUrl(new URL(rawUrl))) {
        avatarUrl = rawUrl;
      } else {
        console.warn(`[federation] Rejecting private avatar URL: ${rawUrl}`);
      }
    } catch {
      // Invalid URL, skip avatar
    }
  }

  const actorUrl = actor.url;
  let urlString: string | null = null;
  if (actorUrl) {
    if (actorUrl instanceof URL) {
      urlString = actorUrl.href;
    } else if (typeof actorUrl === 'string') {
      urlString = actorUrl;
    } else if (actorUrl && 'href' in actorUrl) {
      urlString = String(actorUrl.href);
    }
  }

  // Check if we already have recent counts (< 6 hours old) to avoid redundant remote fetches
  const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
  const existing = await db.getActorByUri(actor.id.href);
  const countsAreStale = !existing?.counts_fetched_at ||
    (Date.now() - new Date(existing.counts_fetched_at).getTime()) > SIX_HOURS_MS;

  let followerCount = existing?.follower_count ?? 0;
  let followingCount = existing?.following_count ?? 0;

  if (countsAreStale) {
    // Extract follower/following counts from the AP actor's collections
    try {
      const followersCollection = await actor.getFollowers();
      if (followersCollection && typeof followersCollection.totalItems === "number") {
        followerCount = followersCollection.totalItems;
      }
    } catch { /* ignore */ }
    try {
      const followingCollection = await actor.getFollowing();
      if (followingCollection && typeof followingCollection.totalItems === "number") {
        followingCount = followingCollection.totalItems;
      }
    } catch { /* ignore */ }
  }

  return await db.upsertActor({
    uri: actor.id.href,
    handle,
    name,
    bio,
    avatar_url: avatarUrl,
    inbox_url: inboxUrl,
    shared_inbox_url: (() => {
      const href = actor.endpoints?.sharedInbox?.href;
      if (!href) return null;
      try { return isPrivateUrl(new URL(href)) ? null : href; } catch { return null; }
    })(),
    url: urlString,
    actor_type: isGroup ? "Group" : "Person",
    follower_count: followerCount,
    following_count: followingCount,
    counts_fetched_at: countsAreStale,
  });
}
