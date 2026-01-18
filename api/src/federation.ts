/// <reference lib="deno.unstable" />
import {
  Accept,
  Activity,
  Announce,
  Create,
  Delete,
  createFederation,
  Endpoints,
  Follow,
  Like,
  Note,
  Person,
  Undo,
  exportJwk,
  generateCryptoKeyPair,
  importJwk,
  PUBLIC_COLLECTION,
} from "@fedify/fedify";
import { DenoKvStore, DenoKvMessageQueue } from "@fedify/denokv";
import type { DB } from "./db.ts";
import { processActivity } from "./activities.ts";

// Domain will be set at runtime
let DOMAIN = "localhost:8000";
let db: DB;

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
const kv = await Deno.openKv();
export const federation = createFederation<void>({
  kv: new DenoKvStore(kv),
  queue: new DenoKvMessageQueue(kv),
});

// ============ NodeInfo ============

federation.setNodeInfoDispatcher("/nodeinfo/2.1", async () => {
  return {
    software: {
      name: "refriend",
      version: { major: 0, minor: 1, patch: 0 },
      homepage: new URL("https://github.com/anthropics/refriend"),
    },
    protocols: ["activitypub"],
    usage: {
      users: {
        total: db.getLocalUserCount(),
        activeMonth: db.getLocalUserCount(), // Simplified: all users considered active
      },
      localPosts: db.getLocalPostCount(),
      localComments: 0, // We don't differentiate posts from comments
    },
  };
});

// ============ Actor Dispatcher ============

federation
  .setActorDispatcher("/users/{identifier}", async (ctx, identifier) => {
    const actor = db.getActorByUsername(identifier);
    if (!actor || !actor.user_id) return null;

    const keys = await ctx.getActorKeyPairs(identifier);

    return new Person({
      id: ctx.getActorUri(identifier),
      preferredUsername: identifier,
      name: actor.name ?? undefined,
      summary: actor.bio ?? undefined,
      icon: actor.avatar_url ? new URL(actor.avatar_url) : undefined,
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
    const actor = db.getActorByUsername(identifier);
    if (!actor || !actor.user_id) return [];

    const userId = actor.user_id;
    const keyPairs: CryptoKeyPair[] = [];

    let rsaKey = db.getKeyPair(userId, "RSASSA-PKCS1-v1_5");
    if (!rsaKey) {
      const generated = await generateCryptoKeyPair("RSASSA-PKCS1-v1_5");
      const privateJwk = await exportJwk(generated.privateKey);
      const publicJwk = await exportJwk(generated.publicKey);
      rsaKey = db.saveKeyPair(userId, "RSASSA-PKCS1-v1_5", JSON.stringify(privateJwk), JSON.stringify(publicJwk));
    }
    keyPairs.push({
      privateKey: await importJwk(JSON.parse(rsaKey.private_key), "private"),
      publicKey: await importJwk(JSON.parse(rsaKey.public_key), "public"),
    });

    let edKey = db.getKeyPair(userId, "Ed25519");
    if (!edKey) {
      const generated = await generateCryptoKeyPair("Ed25519");
      const privateJwk = await exportJwk(generated.privateKey);
      const publicJwk = await exportJwk(generated.publicKey);
      edKey = db.saveKeyPair(userId, "Ed25519", JSON.stringify(privateJwk), JSON.stringify(publicJwk));
    }
    keyPairs.push({
      privateKey: await importJwk(JSON.parse(edKey.private_key), "private"),
      publicKey: await importJwk(JSON.parse(edKey.public_key), "public"),
    });

    return keyPairs;
  })
  .mapHandle((_ctx, handle) => {
    // Map handle (username) to identifier
    // Handle comes in as just the username part (e.g., "bob" from "@bob@domain")
    const actor = db.getActorByUsername(handle);
    if (actor && actor.user_id) {
      return handle;
    }
    return null;
  });

// ============ Followers Collection ============

federation
  .setFollowersDispatcher("/users/{identifier}/followers", async (_ctx, identifier) => {
    const actor = db.getActorByUsername(identifier);
    if (!actor) return null;

    const followers = db.getFollowers(actor.id);
    // Followers collection requires Recipient objects (id + inboxId)
    const items = followers.map((f) => ({
      id: new URL(f.uri),
      inboxId: new URL(f.inbox_url),
    }));

    return { items };
  })
  .setCounter(async (_ctx, identifier) => {
    const actor = db.getActorByUsername(identifier);
    if (!actor) return null;
    return db.getFollowersCount(actor.id);
  });

// ============ Following Collection ============

federation
  .setFollowingDispatcher("/users/{identifier}/following", async (_ctx, identifier) => {
    const actor = db.getActorByUsername(identifier);
    if (!actor) return null;

    const following = db.getFollowing(actor.id);
    // Following collection accepts Actor or URL objects
    const items = following.map((f) => new URL(f.uri));

    return { items };
  })
  .setCounter(async (_ctx, identifier) => {
    const actor = db.getActorByUsername(identifier);
    if (!actor) return null;
    return db.getFollowingCount(actor.id);
  });

// ============ Liked Collection ============

federation
  .setLikedDispatcher("/users/{identifier}/liked", async (ctx, identifier) => {
    const actor = db.getActorByUsername(identifier);
    if (!actor) return null;

    const likedPosts = db.getLikedPosts(actor.id, 50);
    // Return URIs of liked posts
    const items = likedPosts.map((p) => new URL(p.uri));

    return { items };
  })
  .setCounter(async (_ctx, identifier) => {
    const actor = db.getActorByUsername(identifier);
    if (!actor) return null;
    return db.getLikedPostsCount(actor.id);
  });

// ============ Featured Collection (Pinned Posts) ============

federation
  .setFeaturedDispatcher("/users/{identifier}/featured", async (ctx, identifier) => {
    const actor = db.getActorByUsername(identifier);
    if (!actor) return null;

    const pinnedPosts = db.getPinnedPosts(actor.id);
    // Return Note objects for pinned posts
    const items = pinnedPosts.map((p) => new Note({
      id: new URL(p.uri),
      attribution: ctx.getActorUri(identifier),
      content: p.content,
      url: p.url ? new URL(p.url) : undefined,
      published: Temporal.Instant.from(p.created_at.replace(" ", "T") + "Z"),
    }));

    return { items };
  });

// ============ Outbox Collection ============

federation
  .setOutboxDispatcher("/users/{identifier}/outbox", async (ctx, identifier) => {
    const actor = db.getActorByUsername(identifier);
    if (!actor) return null;

    // Get stored activities from the activities table
    const activities = db.getOutboxActivities(actor.id, 50);

    // Parse JSON-LD back into Activity objects
    const items: Activity[] = [];
    for (const a of activities) {
      try {
        const jsonLd = JSON.parse(a.raw_json);
        const activity = await Activity.fromJsonLd(jsonLd, {
          documentLoader: ctx.documentLoader,
          contextLoader: ctx.contextLoader,
        });
        if (activity) {
          items.push(activity);
        }
      } catch (e) {
        console.error(`[Outbox] Failed to parse activity ${a.uri}:`, e);
      }
    }

    return { items };
  });

// ============ Object Dispatcher (Notes/Posts) ============

federation.setObjectDispatcher(Note, "/users/{identifier}/posts/{id}", async (ctx, { identifier, id }) => {
  const actor = db.getActorByUsername(identifier);
  if (!actor) return null;

  const post = db.getPostById(parseInt(id));
  if (!post || post.actor_id !== actor.id) return null;

  return new Note({
    id: ctx.getObjectUri(Note, { identifier, id }),
    attribution: ctx.getActorUri(identifier),
    to: PUBLIC_COLLECTION,
    cc: ctx.getFollowersUri(identifier),
    content: post.content,
    url: post.url ? new URL(post.url) : undefined,
    published: Temporal.Instant.from(post.created_at.replace(" ", "T") + "Z"),
  });
});

// ============ Inbox Handlers ============
// All incoming activities are processed through the unified pipeline

federation
  .setInboxListeners("/users/{identifier}/inbox", "/inbox")

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
