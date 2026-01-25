/**
 * Federation Actor Persistence
 *
 * Functions for persisting remote actors from ActivityPub.
 */

import { Group, type Actor as APActor } from "@fedify/fedify";
import type { DB, Actor } from "../../db.ts";
import { CommunityDB } from "../communities/repository.ts";

// Community DB instance (set during initialization)
let communityDb: CommunityDB | null = null;

/**
 * Set the community DB for actor persistence
 */
export function setCommunityDb(db: CommunityDB) {
  communityDb = db;
}

/**
 * Get the community DB
 */
export function getCommunityDb(): CommunityDB | null {
  return communityDb;
}

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
      // For groups, check by community name
      if (isGroup && communityDb) {
        const existing = await communityDb.getCommunityByName(username);
        if (existing) return existing;
      } else {
        const existing = await db.getActorByUsername(username);
        if (existing) return existing;
      }
    }
  }

  const prefUsername = actor.preferredUsername?.toString();
  // Use @ prefix for all actors (persons and groups/communities)
  const handle = prefUsername
    ? `@${prefUsername}@${actor.id.host}`
    : `@unknown@${actor.id.host}`;

  const inboxUrl = actor.inboxId?.href;
  if (!inboxUrl) return null;

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
    avatarUrl = icon.url instanceof URL ? icon.url.href : String(icon.url);
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

  return await db.upsertActor({
    uri: actor.id.href,
    handle,
    name,
    bio,
    avatar_url: avatarUrl,
    inbox_url: inboxUrl,
    shared_inbox_url: actor.endpoints?.sharedInbox?.href ?? null,
    url: urlString,
    actor_type: isGroup ? "Group" : "Person",
  });
}
