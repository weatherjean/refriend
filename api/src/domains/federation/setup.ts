/// <reference lib="deno.unstable" />
import {
  Accept,
  Activity,
  Announce,
  Create,
  Delete,
  Document,
  Group,
  Image,
  createFederation,
  createExponentialBackoffPolicy,
  Endpoints,
  Follow,
  Like,
  Note,
  ParallelMessageQueue,
  Person,
  Reject,
  Undo,
  exportJwk,
  generateCryptoKeyPair,
  importJwk,
  PUBLIC_COLLECTION,
} from "@fedify/fedify";
import { DenoKvStore, DenoKvMessageQueue } from "@fedify/denokv";
import type { DB } from "../../db.ts";
import { processActivity } from "./processor.ts";

// Domain will be set at runtime
let DOMAIN = "localhost:8000";
let db: DB;

// Helper to parse PostgreSQL timestamps to Temporal.Instant
function parseTimestamp(ts: string | Date): Temporal.Instant {
  // If it's already a Date object (from postgres driver), use it directly
  if (ts instanceof Date) {
    return Temporal.Instant.from(ts.toISOString());
  }
  // PostgreSQL format: "2026-01-19 17:17:16.222461+00"
  // Convert to ISO: "2026-01-19T17:17:16.222461+00:00"
  const isoString = ts.replace(" ", "T").replace(/\+(\d{2})$/, "+$1:00");
  return Temporal.Instant.from(isoString);
}

export function setDomain(domain: string) {
  DOMAIN = domain;
}

export function setDB(database: DB) {
  db = database;
}

export function getDB(): DB {
  return db;
}

export function getDomain(): string {
  return DOMAIN;
}

// Create the federation instance with persistent storage
const kvPath = Deno.env.get("DENO_KV_PATH") || undefined;
const kv = await Deno.openKv(kvPath);

// Parallel message queue for better throughput
const baseQueue = new DenoKvMessageQueue(kv);
const parallelWorkers = parseInt(Deno.env.get("QUEUE_WORKERS") || "4");
const queue = new ParallelMessageQueue(baseQueue, parallelWorkers);

// Check if we should manually start the queue (for web/worker separation)
// Only enable manual control when NODE_TYPE is explicitly set
const nodeType = Deno.env.get("NODE_TYPE");
const manuallyStartQueue = nodeType === "web" || nodeType === "worker";

export const federation = createFederation<void>({
  kv: new DenoKvStore(kv),
  queue,
  manuallyStartQueue,
  // Use draft-cavage-http-signatures-12 for better compatibility with older servers
  firstKnock: "draft-cavage-http-signatures-12",
  onOutboxError: (error, activity) => {
    const activityId = activity?.id?.href ?? "unknown";
    console.error(`[Outbox Error] Activity ${activityId}:`, error);
  },
  // Custom retry policies with exponential backoff
  // Inbox: 5 attempts, starting at 1s, max 1 minute
  inboxRetryPolicy: createExponentialBackoffPolicy({
    maxAttempts: 5,
    initialDelay: Temporal.Duration.from({ seconds: 1 }),
    maxDelay: Temporal.Duration.from({ minutes: 1 }),
  }),
  // Outbox: 10 attempts, starting at 1s, max 5 minutes
  outboxRetryPolicy: createExponentialBackoffPolicy({
    maxAttempts: 10,
    initialDelay: Temporal.Duration.from({ seconds: 1 }),
    maxDelay: Temporal.Duration.from({ minutes: 5 }),
  }),
});

// ============ NodeInfo ============

federation.setNodeInfoDispatcher("/nodeinfo/2.1", async () => {
  return {
    software: {
      name: "riff",
      version: { major: 0, minor: 1, patch: 0 },
      homepage: new URL("https://github.com/anthropics/riff"),
    },
    protocols: ["activitypub"],
    usage: {
      users: {
        total: await db.getLocalUserCount(),
        activeMonth: await db.getActiveUsersLastMonth(),
        activeHalfYear: await db.getActiveUsersLastSixMonths(),
      },
      localPosts: await db.getLocalPostCount(),
      localComments: 0, // We don't differentiate posts from comments
    },
  };
});

// ============ Actor Dispatcher ============

federation
  .setActorDispatcher("/users/{identifier}", async (ctx, identifier) => {
    const actor = await db.getActorByUsername(identifier);
    if (!actor) return null;

    // Must be either a local user (Person) or a community (Group)
    const isLocalUser = actor.user_id !== null;
    const isCommunity = actor.actor_type === "Group";
    if (!isLocalUser && !isCommunity) return null;

    const keys = await ctx.getActorKeyPairs(identifier);

    // Helper for icon - handle both absolute and relative URLs
    const avatarUrl = actor.avatar_url
      ? (actor.avatar_url.startsWith('/') ? `https://${DOMAIN}${actor.avatar_url}` : actor.avatar_url)
      : null;
    const icon = avatarUrl ? new Image({
      url: new URL(avatarUrl),
      mediaType: avatarUrl.includes('.webp') ? "image/webp" :
                 avatarUrl.includes('.svg') || avatarUrl.includes('dicebear') ? "image/svg+xml" :
                 avatarUrl.includes('.png') ? "image/png" : "image/jpeg"
    }) : undefined;

    // Return Group for communities, Person for users
    if (isCommunity) {
      return new Group({
        id: ctx.getActorUri(identifier),
        preferredUsername: identifier,
        name: actor.name ?? identifier,
        summary: actor.bio ?? undefined,
        icon,
        published: parseTimestamp(actor.created_at),
        url: new URL(`https://${DOMAIN}/c/${identifier}`),
        inbox: ctx.getInboxUri(identifier),
        endpoints: new Endpoints({
          sharedInbox: ctx.getInboxUri(),
        }),
        followers: ctx.getFollowersUri(identifier),
        outbox: ctx.getOutboxUri(identifier),
        publicKey: keys[0]?.cryptographicKey,
        assertionMethods: keys.map((k) => k.multikey),
      });
    }

    return new Person({
      id: ctx.getActorUri(identifier),
      preferredUsername: identifier,
      name: actor.name ?? undefined,
      summary: actor.bio ?? undefined,
      icon,
      published: parseTimestamp(actor.created_at),
      url: new URL(`https://${DOMAIN}/@${identifier}`),
      inbox: ctx.getInboxUri(identifier),
      endpoints: new Endpoints({
        sharedInbox: ctx.getInboxUri(),
      }),
      followers: ctx.getFollowersUri(identifier),
      following: ctx.getFollowingUri(identifier),
      outbox: ctx.getOutboxUri(identifier),
      liked: ctx.getLikedUri(identifier),
      featured: ctx.getFeaturedUri(identifier),
      publicKey: keys[0]?.cryptographicKey,
      assertionMethods: keys.map((k) => k.multikey),
    });
  })
  .setKeyPairsDispatcher(async (_ctx, identifier) => {
    const actor = await db.getActorByUsername(identifier);
    if (!actor) return [];

    // Must be a local user or community
    if (!actor.user_id && actor.actor_type !== "Group") return [];

    const keyPairs: CryptoKeyPair[] = [];

    // Unified: always use actor_id based keys
    let rsaKey = await db.getKeyPairByActorId(actor.id, "RSASSA-PKCS1-v1_5");
    if (!rsaKey) {
      const generated = await generateCryptoKeyPair("RSASSA-PKCS1-v1_5");
      const privateJwk = await exportJwk(generated.privateKey);
      const publicJwk = await exportJwk(generated.publicKey);
      rsaKey = await db.saveKeyPairByActorId(actor.id, "RSASSA-PKCS1-v1_5", JSON.stringify(privateJwk), JSON.stringify(publicJwk));
    }
    keyPairs.push({
      privateKey: await importJwk(JSON.parse(rsaKey.private_key), "private"),
      publicKey: await importJwk(JSON.parse(rsaKey.public_key), "public"),
    });

    let edKey = await db.getKeyPairByActorId(actor.id, "Ed25519");
    if (!edKey) {
      const generated = await generateCryptoKeyPair("Ed25519");
      const privateJwk = await exportJwk(generated.privateKey);
      const publicJwk = await exportJwk(generated.publicKey);
      edKey = await db.saveKeyPairByActorId(actor.id, "Ed25519", JSON.stringify(privateJwk), JSON.stringify(publicJwk));
    }
    keyPairs.push({
      privateKey: await importJwk(JSON.parse(edKey.private_key), "private"),
      publicKey: await importJwk(JSON.parse(edKey.public_key), "public"),
    });

    return keyPairs;
  })
  .mapHandle(async (_ctx, handle) => {
    // Map handle (username/community name) to identifier
    // Handle comes in as just the name part (e.g., "bob" from "@bob@domain")
    const actor = await db.getActorByUsername(handle);
    if (actor && (actor.user_id || actor.actor_type === "Group")) {
      return handle;
    }
    return null;
  });

// ============ Followers Collection ============

const COLLECTION_PAGE_SIZE = 50;

federation
  .setFollowersDispatcher("/users/{identifier}/followers", async (_ctx, identifier, cursor) => {
    const actor = await db.getActorByUsername(identifier);
    if (!actor) return null;

    // When cursor is null, return FULL collection for sendActivity({ recipients: "followers" })
    // Use batched iteration to avoid huge single-query result sets
    if (cursor === null) {
      const items: { id: URL; inboxId: URL; endpoints?: { sharedInbox: URL } }[] = [];
      for await (const batch of db.getFollowersBatched(actor.id)) {
        for (const f of batch) {
          items.push({
            id: new URL(f.uri),
            inboxId: new URL(f.inbox_url),
            endpoints: f.shared_inbox_url ? { sharedInbox: new URL(f.shared_inbox_url) } : undefined,
          });
        }
      }
      return { items };
    }

    // Parse cursor as offset for paginated browsing
    const offset = parseInt(cursor, 10);
    if (isNaN(offset)) return null;

    const followers = await db.getFollowersPaginated(actor.id, COLLECTION_PAGE_SIZE, offset);
    // Followers collection requires Recipient objects (id + inboxId + optional endpoints)
    const items = followers.map((f) => ({
      id: new URL(f.uri),
      inboxId: new URL(f.inbox_url),
      endpoints: f.shared_inbox_url ? { sharedInbox: new URL(f.shared_inbox_url) } : undefined,
    }));

    // Calculate next cursor if there are more items
    const nextCursor = followers.length === COLLECTION_PAGE_SIZE
      ? String(offset + COLLECTION_PAGE_SIZE)
      : null;

    return { items, nextCursor };
  })
  .setFirstCursor(async (_ctx, _identifier) => "0")
  .setLastCursor(async (_ctx, identifier) => {
    const actor = await db.getActorByUsername(identifier);
    if (!actor) return null;
    const count = await db.getFollowersCount(actor.id);
    if (count === 0) return null;
    // Last cursor is the offset of the last page
    const lastOffset = Math.max(0, Math.floor((count - 1) / COLLECTION_PAGE_SIZE) * COLLECTION_PAGE_SIZE);
    return String(lastOffset);
  })
  .setCounter(async (_ctx, identifier) => {
    const actor = await db.getActorByUsername(identifier);
    if (!actor) return null;
    return await db.getFollowersCount(actor.id);
  });

// ============ Following Collection ============

federation
  .setFollowingDispatcher("/users/{identifier}/following", async (_ctx, identifier, cursor) => {
    const actor = await db.getActorByUsername(identifier);
    if (!actor) return null;

    // Parse cursor as offset (default to 0)
    const offset = cursor ? parseInt(cursor, 10) : 0;
    if (isNaN(offset)) return null;

    const following = await db.getFollowingPaginated(actor.id, COLLECTION_PAGE_SIZE, offset);
    // Following collection accepts Actor or URL objects
    const items = following.map((f) => new URL(f.uri));

    // Calculate next cursor if there are more items
    const nextCursor = following.length === COLLECTION_PAGE_SIZE
      ? String(offset + COLLECTION_PAGE_SIZE)
      : null;

    return { items, nextCursor };
  })
  .setFirstCursor(async (_ctx, _identifier) => "0")
  .setLastCursor(async (_ctx, identifier) => {
    const actor = await db.getActorByUsername(identifier);
    if (!actor) return null;
    const count = await db.getFollowingCount(actor.id);
    if (count === 0) return null;
    const lastOffset = Math.max(0, Math.floor((count - 1) / COLLECTION_PAGE_SIZE) * COLLECTION_PAGE_SIZE);
    return String(lastOffset);
  })
  .setCounter(async (_ctx, identifier) => {
    const actor = await db.getActorByUsername(identifier);
    if (!actor) return null;
    return await db.getFollowingCount(actor.id);
  });

// ============ Liked Collection ============

federation
  .setLikedDispatcher("/users/{identifier}/liked", async (_ctx, identifier, cursor) => {
    const actor = await db.getActorByUsername(identifier);
    if (!actor) return null;

    // Parse cursor as offset (default to 0)
    const offset = cursor ? parseInt(cursor, 10) : 0;
    if (isNaN(offset)) return null;

    const likedPosts = await db.getLikedPostsPaginated(actor.id, COLLECTION_PAGE_SIZE, offset);
    // Return URIs of liked posts
    const items = likedPosts.map((p) => new URL(p.uri));

    // Calculate next cursor if there are more items
    const nextCursor = likedPosts.length === COLLECTION_PAGE_SIZE
      ? String(offset + COLLECTION_PAGE_SIZE)
      : null;

    return { items, nextCursor };
  })
  .setFirstCursor(async (_ctx, _identifier) => "0")
  .setLastCursor(async (_ctx, identifier) => {
    const actor = await db.getActorByUsername(identifier);
    if (!actor) return null;
    const count = await db.getLikedPostsCount(actor.id);
    if (count === 0) return null;
    const lastOffset = Math.max(0, Math.floor((count - 1) / COLLECTION_PAGE_SIZE) * COLLECTION_PAGE_SIZE);
    return String(lastOffset);
  })
  .setCounter(async (_ctx, identifier) => {
    const actor = await db.getActorByUsername(identifier);
    if (!actor) return null;
    return await db.getLikedPostsCount(actor.id);
  });

// ============ Featured Collection (Pinned Posts) ============

federation
  .setFeaturedDispatcher("/users/{identifier}/featured", async (ctx, identifier) => {
    const actor = await db.getActorByUsername(identifier);
    if (!actor) return null;

    const pinnedPosts = await db.getPinnedPosts(actor.id);
    // Batch fetch all media for pinned posts (1 query instead of N)
    const postIds = pinnedPosts.map(p => p.id);
    const mediaMap = await db.getMediaForPosts(postIds);

    // Return Note objects for pinned posts with attachments
    const items = pinnedPosts.map((p) => {
      const mediaList = mediaMap.get(p.id) || [];
      const attachments = mediaList.map(m => new Document({
        url: m.url.startsWith('http') ? new URL(m.url) : new URL(`https://${DOMAIN}${m.url}`),
        mediaType: m.media_type,
        name: m.alt_text ?? undefined,
        width: m.width ?? undefined,
        height: m.height ?? undefined,
      }));

      return new Note({
        id: new URL(p.uri),
        attribution: ctx.getActorUri(identifier),
        content: p.content,
        url: p.url ? new URL(p.url) : undefined,
        published: parseTimestamp(p.created_at),
        sensitive: p.sensitive,
        attachments: attachments.length > 0 ? attachments : undefined,
      });
    });

    return { items };
  });

// ============ Outbox Collection ============

federation
  .setOutboxDispatcher("/users/{identifier}/outbox", async (ctx, identifier, cursor) => {
    const actor = await db.getActorByUsername(identifier);
    if (!actor) return null;

    // Parse cursor as offset (default to 0)
    const offset = cursor ? parseInt(cursor, 10) : 0;
    if (isNaN(offset)) return null;

    // Get stored activities from the activities table
    const activities = await db.getOutboxActivitiesPaginated(actor.id, COLLECTION_PAGE_SIZE, offset);

    // Parse JSON-LD back into Activity objects (parallel for better performance)
    const items = (await Promise.all(
      activities.map(async (a) => {
        try {
          const jsonLd = JSON.parse(a.raw_json);
          return await Activity.fromJsonLd(jsonLd, {
            documentLoader: ctx.documentLoader,
            contextLoader: ctx.contextLoader,
          });
        } catch (e) {
          console.error(`[Outbox] Failed to parse activity ${a.uri}:`, e);
          return null;
        }
      })
    )).filter((a): a is Activity => a !== null);

    // Get total count of Create activities (posts) for the profile
    const postCount = await db.getPostCountByActor(actor.id);

    // Calculate next cursor if there are more items
    const nextCursor = activities.length === COLLECTION_PAGE_SIZE
      ? String(offset + COLLECTION_PAGE_SIZE)
      : null;

    return { items, nextCursor, totalItems: postCount };
  })
  .setFirstCursor(async (_ctx, _identifier) => "0");

// ============ Object Dispatcher (Notes/Posts) ============

federation.setObjectDispatcher(Note, "/users/{identifier}/posts/{id}", async (ctx, { identifier, id }) => {
  const actor = await db.getActorByUsername(identifier);
  if (!actor) return null;

  const post = await db.getPostById(parseInt(id));
  if (!post || post.actor_id !== actor.id) return null;

  // Get attachments
  const mediaList = await db.getMediaByPostId(post.id);
  const attachments = mediaList.map(m => new Document({
    url: m.url.startsWith('http') ? new URL(m.url) : new URL(`https://${DOMAIN}${m.url}`),
    mediaType: m.media_type,
    name: m.alt_text ?? undefined,
    width: m.width ?? undefined,
    height: m.height ?? undefined,
  }));

  return new Note({
    id: ctx.getObjectUri(Note, { identifier, id }),
    attribution: ctx.getActorUri(identifier),
    to: PUBLIC_COLLECTION,
    cc: ctx.getFollowersUri(identifier),
    content: post.content,
    url: post.url ? new URL(post.url) : undefined,
    published: parseTimestamp(post.created_at),
    sensitive: post.sensitive,
    attachments: attachments.length > 0 ? attachments : undefined,
  });
});

// ============ Inbox Handlers ============
// All incoming activities are processed through the unified pipeline

federation
  .setInboxListeners("/users/{identifier}/inbox", "/inbox")

  // Enable per-inbox idempotency to prevent duplicate processing
  // This ensures activities are deduplicated per inbox, not globally
  .withIdempotency("per-inbox")

  // Handle Create (posts)
  .on(Create, async (ctx, create) => {
    await processActivity(ctx, db, DOMAIN, create, "inbound");
  })

  // Handle Follow
  .on(Follow, async (ctx, follow) => {
    await processActivity(ctx, db, DOMAIN, follow, "inbound");
  })

  // Handle Accept (follow was accepted)
  .on(Accept, async (ctx, accept) => {
    await processActivity(ctx, db, DOMAIN, accept, "inbound");
  })

  // Handle Reject (follow was rejected)
  .on(Reject, async (ctx, reject) => {
    await processActivity(ctx, db, DOMAIN, reject, "inbound");
  })

  // Handle Undo (unfollow, unlike)
  .on(Undo, async (ctx, undo) => {
    await processActivity(ctx, db, DOMAIN, undo, "inbound");
  })

  // Handle Delete
  .on(Delete, async (ctx, deleteActivity) => {
    await processActivity(ctx, db, DOMAIN, deleteActivity, "inbound");
  })

  // Handle Like
  .on(Like, async (ctx, like) => {
    await processActivity(ctx, db, DOMAIN, like, "inbound");
  })

  // Handle Announce (boost)
  .on(Announce, async (ctx, announce) => {
    await processActivity(ctx, db, DOMAIN, announce, "inbound");
  });
