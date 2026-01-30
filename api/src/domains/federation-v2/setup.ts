/// <reference lib="deno.unstable" />
/**
 * Federation V2 Setup
 *
 * Simplified federation implementation with inline inbox handlers.
 * Reduces ~1500 lines to ~500 by eliminating the processActivity orchestrator
 * and separate handler files.
 */

import {
  Accept,
  Activity,
  Announce,
  Create,
  Delete,
  Document,
  Group,
  Image,
  Link,
  createFederation,
  createExponentialBackoffPolicy,
  Endpoints,
  Follow,
  Like,
  Note,
  Article,
  Page,
  Hashtag,
  ParallelMessageQueue,
  Person,
  Reject,
  Tombstone,
  Undo,
  Update,
  exportJwk,
  generateCryptoKeyPair,
  importJwk,
  isActor,
  PUBLIC_COLLECTION,
} from "@fedify/fedify";
import type { Federation } from "@fedify/fedify";
import { DenoKvStore, DenoKvMessageQueue } from "@fedify/denokv";
import type { DB, Actor } from "../../db.ts";
import { persistActor, getCommunityDb } from "./utils/actor.ts";
import { validateAndSanitizeContent, MAX_CONTENT_SIZE } from "./utils/content.ts";
import { fetchAndStoreNote } from "./utils/notes.ts";
import { safeSendActivity } from "./utils/send.ts";
import { invalidateProfileCache } from "../../cache.ts";
import { updatePostScore, updateParentPostScore } from "../../scoring.ts";
import { createNotification, removeNotification } from "../notifications/routes.ts";
import { CommunityModeration } from "../communities/moderation.ts";
import { fetchOpenGraph } from "../posts/service.ts";
import { parseIntSafe } from "../../shared/utils.ts";

// Domain will be set at runtime
let DOMAIN = "localhost:8000";
let db: DB;

// Helper to parse PostgreSQL timestamps to Temporal.Instant
function parseTimestamp(ts: string | Date | null | undefined): Temporal.Instant {
  try {
    if (!ts) {
      return Temporal.Now.instant();
    }
    if (ts instanceof Date) {
      return Temporal.Instant.from(ts.toISOString());
    }
    // Try parsing as JS Date string first (e.g., "Mon Jan 26 2026 20:47:59 GMT+0000")
    const jsDate = new Date(ts);
    if (!isNaN(jsDate.getTime())) {
      return Temporal.Instant.from(jsDate.toISOString());
    }
    // Handle various PostgreSQL timestamp formats
    const isoString = ts.replace(" ", "T").replace(/\+(\d{2})$/, "+$1:00");
    return Temporal.Instant.from(isoString);
  } catch {
    // Fallback to now if parsing fails
    console.warn(`[parseTimestamp] Failed to parse: ${ts}`);
    return Temporal.Now.instant();
  }
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
const parallelWorkers = parseInt(Deno.env.get("QUEUE_WORKERS") || "16");

// Wrap queue to disable native retry and handle oversized payloads
class ControlledRetryQueue {
  #inner: DenoKvMessageQueue;

  constructor(inner: DenoKvMessageQueue) {
    this.#inner = inner;
  }

  get nativeRetrial(): boolean {
    return false;
  }

  async enqueue(
    message: unknown,
    options?: { delay?: Temporal.Duration }
  ): Promise<void> {
    try {
      await this.#inner.enqueue(message, options);
    } catch (e) {
      // Deno KV has a 64KB limit - drop oversized activities with warning
      if (e instanceof TypeError && String(e).includes("payload too large")) {
        console.warn(`[Queue] Activity too large to queue (>64KB), skipping`);
        return;
      }
      throw e;
    }
  }

  listen(
    handler: (message: unknown) => Promise<void> | void,
    options?: { signal?: AbortSignal }
  ): Promise<void> {
    return this.#inner.listen(handler, options);
  }
}

const baseQueue = new DenoKvMessageQueue(kv);
const queue = new ParallelMessageQueue(
  new ControlledRetryQueue(baseQueue) as unknown as DenoKvMessageQueue,
  parallelWorkers
);

const nodeType = Deno.env.get("NODE_TYPE");
const manuallyStartQueue = nodeType === "web" || nodeType === "worker";

export const federation = createFederation<void>({
  kv: new DenoKvStore(kv),
  queue,
  manuallyStartQueue,
  // Use default firstKnock (rfc9421) - Fedify will fall back to draft-cavage if needed
  onOutboxError: (error, activity) => {
    const activityId = activity?.id?.href ?? "unknown";
    const errorStr = String(error);
    const isPermanent = /\b(4\d{2})\b/.test(errorStr) || errorStr.includes("Gone");
    if (isPermanent) {
      console.warn(`[Outbox] Permanent failure for ${activityId}: ${errorStr.slice(0, 500)}`);
    } else {
      console.error(`[Outbox Error] Activity ${activityId}:`, error);
    }
  },
  inboxRetryPolicy: createExponentialBackoffPolicy({
    maxAttempts: 5,
    initialDelay: Temporal.Duration.from({ seconds: 1 }),
    maxDelay: Temporal.Duration.from({ minutes: 1 }),
  }),
  outboxRetryPolicy: createExponentialBackoffPolicy({
    maxAttempts: 3,
    initialDelay: Temporal.Duration.from({ seconds: 5 }),
    maxDelay: Temporal.Duration.from({ seconds: 30 }),
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
      localComments: 0,
    },
  };
});

// ============ Actor Dispatcher ============

federation
  .setActorDispatcher("/users/{identifier}", async (ctx, identifier) => {
    const actor = await db.getActorByUsername(identifier);
    if (!actor) return null;

    const isLocalUser = actor.user_id !== null;
    const isCommunity = actor.actor_type === "Group";
    if (!isLocalUser && !isCommunity) return null;

    const keys = await ctx.getActorKeyPairs(identifier);

    const avatarUrl = actor.avatar_url
      ? (actor.avatar_url.startsWith('/') ? `https://${DOMAIN}${actor.avatar_url}` : actor.avatar_url)
      : null;
    const icon = avatarUrl ? new Image({
      url: new URL(avatarUrl),
      mediaType: avatarUrl.includes('.webp') ? "image/webp" :
                 avatarUrl.includes('.svg') || avatarUrl.includes('dicebear') ? "image/svg+xml" :
                 avatarUrl.includes('.png') ? "image/png" : "image/jpeg"
    }) : undefined;

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
        endpoints: new Endpoints({ sharedInbox: ctx.getInboxUri() }),
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
      endpoints: new Endpoints({ sharedInbox: ctx.getInboxUri() }),
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
    if (!actor.user_id && actor.actor_type !== "Group") return [];

    const keyPairs: CryptoKeyPair[] = [];

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
    const actor = await db.getActorByUsername(handle);
    if (actor && (actor.user_id || actor.actor_type === "Group")) {
      return handle;
    }
    return null;
  });

// ============ Collection Dispatchers ============

const COLLECTION_PAGE_SIZE = 50;

// Followers collection
federation
  .setFollowersDispatcher("/users/{identifier}/followers", async (_ctx, identifier, cursor) => {
    const actor = await db.getActorByUsername(identifier);
    if (!actor) return null;

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

    const offset = parseInt(cursor, 10);
    if (isNaN(offset)) return null;

    const followers = await db.getFollowersPaginated(actor.id, COLLECTION_PAGE_SIZE, offset);
    const items = followers.map((f) => ({
      id: new URL(f.uri),
      inboxId: new URL(f.inbox_url),
      endpoints: f.shared_inbox_url ? { sharedInbox: new URL(f.shared_inbox_url) } : undefined,
    }));

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
    const lastOffset = Math.max(0, Math.floor((count - 1) / COLLECTION_PAGE_SIZE) * COLLECTION_PAGE_SIZE);
    return String(lastOffset);
  })
  .setCounter(async (_ctx, identifier) => {
    const actor = await db.getActorByUsername(identifier);
    if (!actor) return null;
    return await db.getFollowersCount(actor.id);
  });

// Following collection
federation
  .setFollowingDispatcher("/users/{identifier}/following", async (_ctx, identifier, cursor) => {
    const actor = await db.getActorByUsername(identifier);
    if (!actor) return null;

    const offset = cursor ? parseInt(cursor, 10) : 0;
    if (isNaN(offset)) return null;

    const following = await db.getFollowingPaginated(actor.id, COLLECTION_PAGE_SIZE, offset);
    const items = following.map((f) => new URL(f.uri));

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

// Liked collection
federation
  .setLikedDispatcher("/users/{identifier}/liked", async (_ctx, identifier, cursor) => {
    const actor = await db.getActorByUsername(identifier);
    if (!actor) return null;

    const offset = cursor ? parseInt(cursor, 10) : 0;
    if (isNaN(offset)) return null;

    const likedPosts = await db.getLikedPostsPaginated(actor.id, COLLECTION_PAGE_SIZE, offset);
    const items = likedPosts.map((p) => new URL(p.uri));

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

// Featured collection (pinned posts)
federation
  .setFeaturedDispatcher("/users/{identifier}/featured", async (ctx, identifier) => {
    const actor = await db.getActorByUsername(identifier);
    if (!actor) return null;

    const pinnedPosts = await db.getPinnedPosts(actor.id);
    const postIds = pinnedPosts.map(p => p.id);
    const mediaMap = await db.getMediaForPosts(postIds);

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

// ============ Outbox Collection (V2: Generate from posts table) ============

federation
  .setOutboxDispatcher("/users/{identifier}/outbox", async (ctx, identifier, cursor) => {
    const actor = await db.getActorByUsername(identifier);
    if (!actor) return null;

    const offset = cursor ? parseInt(cursor, 10) : 0;
    if (isNaN(offset)) return null;

    // V2: Generate activities from posts table instead of stored activities
    const posts = await db.getPostsByActorWithActor(actor.id, COLLECTION_PAGE_SIZE, offset === 0 ? undefined : offset, 'new');
    const postIds = posts.map(p => p.id);
    const mediaMap = await db.getMediaForPosts(postIds);

    const items: Activity[] = posts.map((p) => {
      const mediaList = mediaMap.get(p.id) || [];
      const attachments = mediaList.map(m => new Document({
        url: m.url.startsWith('http') ? new URL(m.url) : new URL(`https://${DOMAIN}${m.url}`),
        mediaType: m.media_type,
        name: m.alt_text ?? undefined,
        width: m.width ?? undefined,
        height: m.height ?? undefined,
      }));

      const note = new Note({
        id: new URL(p.uri),
        attribution: ctx.getActorUri(identifier),
        to: PUBLIC_COLLECTION,
        cc: ctx.getFollowersUri(identifier),
        content: p.content,
        url: p.url ? new URL(p.url) : undefined,
        published: parseTimestamp(p.created_at),
        sensitive: p.sensitive,
        attachments: attachments.length > 0 ? attachments : undefined,
      });

      return new Create({
        id: new URL(`${p.uri}#activity`),
        actor: ctx.getActorUri(identifier),
        object: note,
        to: PUBLIC_COLLECTION,
        cc: ctx.getFollowersUri(identifier),
        published: parseTimestamp(p.created_at),
      });
    });

    const postCount = await db.getPostCountByActor(actor.id);

    const nextCursor = posts.length === COLLECTION_PAGE_SIZE
      ? String(offset + COLLECTION_PAGE_SIZE)
      : null;

    return { items, nextCursor, totalItems: postCount };
  })
  .setFirstCursor(async (_ctx, _identifier) => "0");

// ============ Object Dispatcher (Notes/Posts) ============

federation.setObjectDispatcher(Note, "/users/{identifier}/posts/{id}", async (ctx, { identifier, id }) => {
  const actor = await db.getActorByUsername(identifier);
  if (!actor) return null;

  const postId = parseIntSafe(id);
  if (!postId) return null;
  const post = await db.getPostById(postId);
  if (!post || post.actor_id !== actor.id) return null;

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

// ============ Inbox Handlers (V2: Inline, no processActivity orchestrator) ============

registerInboxHandlers(federation, () => db, () => DOMAIN);

// ============ Exported inbox handler registration ============

// deno-lint-ignore no-explicit-any
export function registerInboxHandlers(
  fed: Federation<any>,
  getDbFn: () => DB,
  getDomainFn: () => string,
): void {
  fed
    .setInboxListeners("/users/{identifier}/inbox", "/inbox")
    .withIdempotency("per-inbox")

    // ============ Create Handler ============
    .on(Create, async (ctx, create) => {
      const _db = getDbFn();
      const _domain = getDomainFn();
      let object: Note | Article | Page | null = null;
      let titlePrefix: string | null = null;

      try {
        const obj = await create.getObject();
        if (obj instanceof Note) {
          object = obj;
        } else if (obj instanceof Article || obj instanceof Page) {
          object = obj;
          const title = typeof obj.name === 'string' ? obj.name : obj.name?.toString();
          if (title) titlePrefix = title;
        }
      } catch {
        return;
      }
      if (!object) return;

      let authorActor: Actor | null = null;
      try {
        const author = await create.getActor();
        if (author && isActor(author)) {
          authorActor = await persistActor(_db, _domain, author);
        }
      } catch {
        return;
      }
      if (!authorActor) return;

      const noteUri = object.id?.href;
      if (!noteUri) return;

      const existingPost = await _db.getPostByUri(noteUri);
      if (existingPost) return;

      let rawContent = typeof object.content === "string"
        ? object.content
        : object.content?.toString() ?? "";

      if (titlePrefix) {
        const escapedTitle = titlePrefix
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        const titleHtml = `<p><strong>${escapedTitle}</strong></p>`;
        rawContent = rawContent ? `${titleHtml}\n${rawContent}` : titleHtml;
      }

      const content = validateAndSanitizeContent(rawContent);
      if (content === null) {
        console.log(`[Create] Rejected post from ${authorActor.handle}: content exceeds ${MAX_CONTENT_SIZE} bytes`);
        return;
      }

      const objectUrl = object.url;
      let postUrlString: string | null = null;
      if (objectUrl) {
        if (objectUrl instanceof URL) {
          postUrlString = objectUrl.href;
        } else if (typeof objectUrl === 'string') {
          postUrlString = objectUrl;
        } else if (objectUrl && 'href' in objectUrl) {
          postUrlString = String(objectUrl.href);
        }
      }

      let inReplyToId: number | null = null;
      let inReplyToUri = object.replyTargetId?.href;
      if (!inReplyToUri) {
        try {
          const replyTarget = await object.getReplyTarget();
          if (replyTarget && replyTarget.id) {
            inReplyToUri = replyTarget.id.href;
          }
        } catch { /* ignore */ }
      }
      if (inReplyToUri) {
        const parentPost = await _db.getPostByUri(inReplyToUri);
        if (parentPost) {
          inReplyToId = parentPost.id;
        } else {
          console.log(`[Create] Discarding reply - parent post not found locally: ${inReplyToUri}`);
          return;
        }
      }

      const sensitive = object.sensitive ?? false;

      const addressedTo: string[] = [];
      try {
        const audienceId = object.audienceId;
        if (audienceId) addressedTo.push(audienceId.href);
        const audienceIds = object.audienceIds;
        for (const uri of audienceIds) {
          if (uri instanceof URL && !addressedTo.includes(uri.href)) {
            addressedTo.push(uri.href);
          }
        }
      } catch { /* ignore */ }

      // Use the original published timestamp if available, with validation
      let publishedAt: string | undefined;
      if (object.published) {
        // Allow 5 minutes of clock skew for federation
        const maxDate = Temporal.Now.instant().add({ minutes: 5 });
        const minDate = Temporal.Instant.from("2007-01-01T00:00:00Z"); // Before fediverse existed
        // Don't accept future timestamps (beyond skew buffer) or unreasonably old ones
        if (Temporal.Instant.compare(object.published, maxDate) <= 0 &&
            Temporal.Instant.compare(object.published, minDate) >= 0) {
          publishedAt = object.published.toString();
        }
      }

      const post = await _db.createPost({
        uri: noteUri,
        actor_id: authorActor.id,
        content,
        url: postUrlString,
        in_reply_to_id: inReplyToId,
        sensitive,
        addressed_to: addressedTo.length > 0 ? addressedTo : undefined,
        created_at: publishedAt,
      });

      // Extract hashtags
      try {
        const tags = await object.getTags();
        for await (const tag of tags) {
          if (tag instanceof Hashtag && tag.name) {
            const tagName = tag.name.toString().replace(/^#/, '').toLowerCase();
            if (tagName) {
              const hashtag = await _db.getOrCreateHashtag(tagName);
              await _db.addPostHashtag(post.id, hashtag.id);
            }
          }
        }
      } catch { /* ignore */ }

      // Extract attachments
      try {
        const attachments = await object.getAttachments();
        const seenMediaUrls = new Set<string>();
        for await (const att of attachments) {
          if (att instanceof Link && (object instanceof Page || object instanceof Article)) {
            const linkHref = att.href;
            if (linkHref) {
              const externalUrl = linkHref instanceof URL ? linkHref.href : String(linkHref);
              await _db.updatePostUrl(post.id, externalUrl);
              try {
                const linkPreview = await fetchOpenGraph(externalUrl);
                if (linkPreview) await _db.updatePostLinkPreview(post.id, linkPreview);
              } catch { /* ignore */ }
              const escapedUrl = externalUrl.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
              const linkHtml = `<p><a href="${escapedUrl}">${escapedUrl}</a></p>`;
              await _db.updatePostContent(post.id, content + linkHtml);
            }
            continue;
          }

          if (att instanceof Document || att instanceof Image) {
            const attUrl = att.url;
            let urlString: string | null = null;
            if (attUrl instanceof URL) urlString = attUrl.href;
            else if (typeof attUrl === 'string') urlString = attUrl;
            else if (attUrl && 'href' in attUrl) urlString = String(attUrl.href);

            if (urlString && !seenMediaUrls.has(urlString)) {
              seenMediaUrls.add(urlString);
              const mediaType = att.mediaType ?? "image/jpeg";
              const altText = typeof att.name === 'string' ? att.name : att.name?.toString() ?? null;
              await _db.createMedia(post.id, urlString, mediaType, altText, att.width ?? null, att.height ?? null);
            }
          }
        }
      } catch { /* ignore */ }

      console.log(`[Create] Post from ${authorActor.handle}: ${post.id}`);

      // Check for community submission
      const communityDb = getCommunityDb();
      if (communityDb) {
        await checkAndSubmitToCommunity(object, post.id, authorActor.id);
      }

      // Reply notifications and score updates
      if (inReplyToId) {
        await updateParentPostScore(_db, inReplyToId);
        const parentPost = await _db.getPostById(inReplyToId);
        if (parentPost) {
          await createNotification(_db, 'reply', authorActor.id, parentPost.actor_id, post.id);
        }
      }

      await invalidateProfileCache(authorActor.id);
    })

    // ============ Update Handler ============
    .on(Update, async (ctx, update) => {
      const _db = getDbFn();
      const _domain = getDomainFn();
      let object: Note | Article | Page | Person | Group | null = null;

      try {
        const obj = await update.getObject();
        if (obj instanceof Note || obj instanceof Article || obj instanceof Page) {
          object = obj;
        } else if (obj instanceof Person || obj instanceof Group) {
          object = obj;
        }
      } catch {
        return;
      }
      if (!object) return;

      // ---- Actor update (Person/Group) ----
      if (object instanceof Person || object instanceof Group) {
        try {
          await persistActor(_db, _domain, object);
          console.log(`[Update] Actor profile updated: ${object.id?.href}`);
        } catch (e) {
          console.error(`[Update] Failed to update actor:`, e);
        }
        return;
      }

      // ---- Post update (Note/Article/Page) ----
      let authorActor: Actor | null = null;
      try {
        const author = await update.getActor();
        if (author && isActor(author)) {
          authorActor = await persistActor(_db, _domain, author);
        }
      } catch {
        return;
      }
      if (!authorActor) return;

      const noteUri = object.id?.href;
      if (!noteUri) return;

      const existingPost = await _db.getPostByUri(noteUri);
      if (!existingPost) {
        console.log(`[Update] Post not found locally, skipping: ${noteUri}`);
        return;
      }

      // Authorization: only the original author can update
      if (existingPost.actor_id !== authorActor.id) {
        console.log(`[Update] Unauthorized: ${authorActor.handle} cannot update post ${existingPost.id}`);
        return;
      }

      // Extract and sanitize content
      let titlePrefix: string | null = null;
      if (object instanceof Article || object instanceof Page) {
        const title = typeof object.name === 'string' ? object.name : object.name?.toString();
        if (title) titlePrefix = title;
      }

      let rawContent = typeof object.content === "string"
        ? object.content
        : object.content?.toString() ?? "";

      if (titlePrefix) {
        const escapedTitle = titlePrefix
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        const titleHtml = `<p><strong>${escapedTitle}</strong></p>`;
        rawContent = rawContent ? `${titleHtml}\n${rawContent}` : titleHtml;
      }

      const content = validateAndSanitizeContent(rawContent);
      if (content === null) {
        console.log(`[Update] Rejected update from ${authorActor.handle}: content exceeds ${MAX_CONTENT_SIZE} bytes`);
        return;
      }

      // Update content
      await _db.updatePostContent(existingPost.id, content);

      // Update sensitive flag
      const sensitive = object.sensitive ?? false;
      await _db.updatePostSensitive(existingPost.id, sensitive);

      // Update URL if changed
      const objectUrl = object.url;
      let postUrlString: string | null = null;
      if (objectUrl) {
        if (objectUrl instanceof URL) {
          postUrlString = objectUrl.href;
        } else if (typeof objectUrl === 'string') {
          postUrlString = objectUrl;
        } else if (objectUrl && 'href' in objectUrl) {
          postUrlString = String(objectUrl.href);
        }
      }
      if (postUrlString && postUrlString !== existingPost.url) {
        await _db.updatePostUrl(existingPost.id, postUrlString);
      }

      // Clear and re-add hashtags
      await _db.deletePostHashtags(existingPost.id);
      try {
        const tags = await object.getTags();
        for await (const tag of tags) {
          if (tag instanceof Hashtag && tag.name) {
            const tagName = tag.name.toString().replace(/^#/, '').toLowerCase();
            if (tagName) {
              const hashtag = await _db.getOrCreateHashtag(tagName);
              await _db.addPostHashtag(existingPost.id, hashtag.id);
            }
          }
        }
      } catch { /* ignore */ }

      // Clear and re-add media attachments
      await _db.deleteMediaByPostId(existingPost.id);
      try {
        const attachments = await object.getAttachments();
        const seenMediaUrls = new Set<string>();
        for await (const att of attachments) {
          if (att instanceof Link && (object instanceof Page || object instanceof Article)) {
            const linkHref = att.href;
            if (linkHref) {
              const externalUrl = linkHref instanceof URL ? linkHref.href : String(linkHref);
              await _db.updatePostUrl(existingPost.id, externalUrl);
              try {
                const linkPreview = await fetchOpenGraph(externalUrl);
                if (linkPreview) await _db.updatePostLinkPreview(existingPost.id, linkPreview);
              } catch { /* ignore */ }
              const escapedUrl = externalUrl.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
              const linkHtml = `<p><a href="${escapedUrl}">${escapedUrl}</a></p>`;
              await _db.updatePostContent(existingPost.id, content + linkHtml);
            }
            continue;
          }

          if (att instanceof Document || att instanceof Image) {
            const attUrl = att.url;
            let urlString: string | null = null;
            if (attUrl instanceof URL) urlString = attUrl.href;
            else if (typeof attUrl === 'string') urlString = attUrl;
            else if (attUrl && 'href' in attUrl) urlString = String(attUrl.href);

            if (urlString && !seenMediaUrls.has(urlString)) {
              seenMediaUrls.add(urlString);
              const mediaType = att.mediaType ?? "image/jpeg";
              const altText = typeof att.name === 'string' ? att.name : att.name?.toString() ?? null;
              await _db.createMedia(existingPost.id, urlString, mediaType, altText, att.width ?? null, att.height ?? null);
            }
          }
        }
      } catch { /* ignore */ }

      console.log(`[Update] Post ${existingPost.id} updated by ${authorActor.handle}`);
      await invalidateProfileCache(authorActor.id);
    })

    // ============ Follow Handler ============
    .on(Follow, async (ctx, follow) => {
      const _db = getDbFn();
      const _domain = getDomainFn();
      let followerActor: Actor | null = null;
      let followerAP = null;

      try {
        followerAP = await follow.getActor();
        if (followerAP && isActor(followerAP)) {
          followerActor = await persistActor(_db, _domain, followerAP);
        }
      } catch {
        return;
      }
      if (!followerActor) return;

      const targetUri = follow.objectId?.href;
      if (!targetUri) return;

      const targetActor = await _db.getActorByUri(targetUri);
      if (!targetActor) {
        console.log(`[Follow] Target not found: ${targetUri}`);
        return;
      }

      const isLocalTarget = targetActor.user_id || targetActor.actor_type === 'Group';

      // Inbound follows are always accepted
      await _db.addFollow(followerActor.id, targetActor.id, 'accepted');
      await createNotification(_db, 'follow', followerActor.id, targetActor.id);
      console.log(`[Follow] ${followerActor.handle} -> ${targetActor.handle}`);

      // Send Accept back to follower
      if (isLocalTarget && followerActor.inbox_url) {
        const username = targetActor.handle.match(/@([^@]+)@/)?.[1];
        if (username) {
          const accept = new Accept({
            id: new URL(`https://${_domain}/#accepts/${crypto.randomUUID()}`),
            actor: ctx.getActorUri(username),
            object: follow,
          });

          const recipient = followerAP ?? {
            id: new URL(followerActor.uri),
            inboxId: new URL(followerActor.inbox_url),
          };

          await safeSendActivity(ctx, { identifier: username }, recipient, accept);
          console.log(`[Follow] Sent Accept to ${followerActor.handle}`);
        }
      }
    })

    // ============ Accept Handler ============
    .on(Accept, async (_ctx, accept) => {
      const _db = getDbFn();
      const _domain = getDomainFn();
      try {
        let sender;
        try {
          sender = await accept.getActor();
        } catch (err) {
          console.log(`[Accept] Failed to get actor: ${err}`);
          return;
        }
        if (!sender || !isActor(sender)) return;

        const acceptedActor = await persistActor(_db, _domain, sender);
        if (!acceptedActor) return;

        let activity;
        try {
          activity = await accept.getObject();
        } catch (err) {
          console.log(`[Accept] Failed to get object (${err}), using fallback`);
          const count = await _db.acceptPendingFollowsTo(acceptedActor.id);
          if (count > 0) console.log(`[Accept] Accepted ${count} pending follow(s) to ${acceptedActor.handle}`);
          return;
        }

        if (!(activity instanceof Follow)) {
          const count = await _db.acceptPendingFollowsTo(acceptedActor.id);
          if (count > 0) console.log(`[Accept] Accepted ${count} pending follow(s) to ${acceptedActor.handle}`);
          return;
        }

        const followerId = activity.actorId;
        if (!followerId) {
          const count = await _db.acceptPendingFollowsTo(acceptedActor.id);
          if (count > 0) console.log(`[Accept] Accepted ${count} pending follow(s) to ${acceptedActor.handle}`);
          return;
        }

        const followerActor = await _db.getActorByUri(followerId.href);
        if (!followerActor) {
          const count = await _db.acceptPendingFollowsTo(acceptedActor.id);
          if (count > 0) console.log(`[Accept] Accepted ${count} pending follow(s) to ${acceptedActor.handle}`);
          return;
        }

        await _db.addFollow(followerActor.id, acceptedActor.id, 'accepted');
        console.log(`[Accept] ${followerActor.handle} now following ${acceptedActor.handle}`);
      } catch (err) {
        console.error(`[Accept] Error:`, err);
      }
    })

    // ============ Reject Handler ============
    .on(Reject, async (_ctx, reject) => {
      const _db = getDbFn();
      const _domain = getDomainFn();
      const rejectorAP = await reject.getActor();
      if (!rejectorAP || !isActor(rejectorAP)) return;

      const rejector = await persistActor(_db, _domain, rejectorAP);
      if (!rejector) return;

      const object = await reject.getObject();
      if (!(object instanceof Follow)) return;

      const followerAP = await object.getActor();
      if (!followerAP || !isActor(followerAP)) return;

      const follower = await persistActor(_db, _domain, followerAP);
      if (!follower) return;

      await _db.removeFollow(follower.id, rejector.id);
      console.log(`[Reject] Follow rejected: ${follower.handle} -> ${rejector.handle}`);
    })

    // ============ Like Handler ============
    .on(Like, async (_ctx, like) => {
      const _db = getDbFn();
      const _domain = getDomainFn();
      let likerActor: Actor | null = null;

      try {
        const actor = await like.getActor();
        if (actor && isActor(actor)) {
          likerActor = await persistActor(_db, _domain, actor);
        }
      } catch {
        return;
      }
      if (!likerActor) return;

      const objectUri = like.objectId?.href;
      if (!objectUri) return;

      const post = await _db.getPostByUri(objectUri);
      if (!post) return;

      await _db.addLike(likerActor.id, post.id);
      await updatePostScore(_db, post.id);
      await createNotification(_db, 'like', likerActor.id, post.actor_id, post.id);
    })

    // ============ Announce Handler ============
    .on(Announce, async (ctx, announce) => {
      const _db = getDbFn();
      const _domain = getDomainFn();
      let boosterActor: Actor | null = null;

      try {
        const actor = await announce.getActor();
        if (actor && isActor(actor)) {
          boosterActor = await persistActor(_db, _domain, actor);
        }
      } catch {
        return;
      }
      if (!boosterActor) return;

      const objectUri = announce.objectId?.href;
      if (!objectUri) return;

      // Skip Lemmy internal activities (except delete/remove which we need to process)
      if (objectUri.includes('/activities/like') ||
          objectUri.includes('/activities/dislike') ||
          objectUri.includes('/activities/undo')) {
        return;
      }

      // Handle Announce(Delete) - Lemmy communities announce deletes
      if (objectUri.includes('/activities/delete')) {
        try {
          const docLoader = ctx.documentLoader;
          const { document } = await docLoader(objectUri);
          // deno-lint-ignore no-explicit-any
          const docType = (document as any)?.type || (document as any)?.['@type'];
          const typeStr = Array.isArray(docType) ? docType[0] : docType;

          if (typeStr === 'Delete') {
            const deleteActivity = await Delete.fromJsonLd(document, { documentLoader: docLoader, contextLoader: ctx.contextLoader });

            // Get the object being deleted
            let deleteObjectUri: string | undefined;
            try {
              const obj = await deleteActivity.getObject();
              if (obj instanceof Tombstone) {
                deleteObjectUri = obj.id?.href;
              } else if (obj instanceof Note || obj instanceof Article || obj instanceof Page) {
                deleteObjectUri = obj.id?.href;
              }
            } catch { /* ignore */ }

            if (!deleteObjectUri) {
              deleteObjectUri = deleteActivity.objectId?.href;
            }

            if (!deleteObjectUri) {
              console.log(`[Announce Delete] No object URI found`);
              return;
            }

            const post = await _db.getPostByUri(deleteObjectUri);
            if (!post) {
              console.log(`[Announce Delete] Post not found: ${deleteObjectUri}`);
              return;
            }

            // Authorization: community that announced the delete can delete
            // (boosterActor is the community)
            const actorHost = new URL(boosterActor.uri).host;
            let isCommunityAuthorized = false;
            if (post.addressed_to && post.addressed_to.length > 0) {
              for (const communityUri of post.addressed_to) {
                try {
                  const communityHost = new URL(communityUri).host;
                  if (communityHost === actorHost) {
                    isCommunityAuthorized = true;
                    break;
                  }
                } catch { /* ignore */ }
              }
            }

            if (!isCommunityAuthorized) {
              console.log(`[Announce Delete] Unauthorized: ${boosterActor.handle} cannot delete post ${post.id}`);
              return;
            }

            await _db.deletePost(post.id);
            console.log(`[Announce Delete] Post ${post.id} deleted via ${boosterActor.handle}`);
            return;
          }
        } catch (e) {
          console.log(`[Announce Delete] Error processing: ${objectUri}`, e);
          return;
        }
      }

      // Handle Announce(Remove) - Lemmy communities announce mod removals
      if (objectUri.includes('/activities/remove')) {
        try {
          const docLoader = ctx.documentLoader;
          const { document } = await docLoader(objectUri);

          // Get the object URI from the Remove activity
          // deno-lint-ignore no-explicit-any
          const removeObject = (document as any)?.object;
          const removeObjectUri = typeof removeObject === 'string' ? removeObject : removeObject?.id;

          if (!removeObjectUri) {
            console.log(`[Announce Remove] No object URI found`);
            return;
          }

          const post = await _db.getPostByUri(removeObjectUri);
          if (!post) {
            console.log(`[Announce Remove] Post not found: ${removeObjectUri}`);
            return;
          }

          await _db.removeBoost(boosterActor.id, post.id);
          await updatePostScore(_db, post.id);
          await removeNotification(_db, 'boost', boosterActor.id, post.actor_id, post.id);
          console.log(`[Announce Remove] Removed boost on post ${post.id} via ${boosterActor.handle}`);
          return;
        } catch (e) {
          console.log(`[Announce Remove] Error processing: ${objectUri}`, e);
          return;
        }
      }

      let post = await _db.getPostByUri(objectUri);
      if (!post) {
        // Fetch the announced post - this is how Lemmy communities work
        const postId = await fetchAndStoreNote(ctx, _db, _domain, objectUri);
        if (postId) post = await _db.getPostById(postId);
      }

      if (!post) {
        console.log(`[Announce] Post not found: ${objectUri}`);
        return;
      }

      await _db.addBoost(boosterActor.id, post.id);
      await updatePostScore(_db, post.id);
      await createNotification(_db, 'boost', boosterActor.id, post.actor_id, post.id);
      console.log(`[Announce] ${boosterActor.handle} boosted post ${post.id}`);
    })

    // ============ Undo Handler ============
    .on(Undo, async (_ctx, undo) => {
      const _db = getDbFn();
      const _domain = getDomainFn();
      let activity: Like | Follow | Announce | null = null;
      let actorRecord: Actor | null = null;

      try {
        const obj = await undo.getObject();
        if (obj instanceof Like || obj instanceof Follow || obj instanceof Announce) {
          activity = obj;
        }
      } catch { /* ignore */ }

      try {
        const actor = await undo.getActor();
        if (actor && isActor(actor)) {
          actorRecord = await persistActor(_db, _domain, actor);
        }
      } catch {
        return;
      }
      if (!actorRecord) return;

      // Undo Follow
      if (activity instanceof Follow) {
        const targetUri = activity.objectId?.href;
        if (!targetUri) return;

        const targetActor = await _db.getActorByUri(targetUri);
        if (!targetActor) return;

        await _db.removeFollow(actorRecord.id, targetActor.id);
        await removeNotification(_db, 'follow', actorRecord.id, targetActor.id);
        console.log(`[Undo Follow] ${actorRecord.handle} unfollowed ${targetActor.handle}`);
      }

      // Undo Like
      if (activity instanceof Like) {
        const objectUri = activity.objectId?.href;
        if (!objectUri) return;

        const post = await _db.getPostByUri(objectUri);
        if (!post) return;

        await _db.removeLike(actorRecord.id, post.id);
        await updatePostScore(_db, post.id);
        await removeNotification(_db, 'like', actorRecord.id, post.actor_id, post.id);
      }

      // Undo Announce
      if (activity instanceof Announce) {
        const objectUri = activity.objectId?.href;
        if (!objectUri) return;

        const post = await _db.getPostByUri(objectUri);
        if (!post) return;

        await _db.removeBoost(actorRecord.id, post.id);
        await updatePostScore(_db, post.id);
        await removeNotification(_db, 'boost', actorRecord.id, post.actor_id, post.id);
        console.log(`[Undo Announce] ${actorRecord.handle} unboosted post ${post.id}`);
      }
    })

    // ============ Delete Handler ============
    .on(Delete, async (_ctx, deleteActivity) => {
      const _db = getDbFn();
      const _domain = getDomainFn();
      let actorRecord: Actor | null = null;

      try {
        const actor = await deleteActivity.getActor();
        if (actor && isActor(actor)) {
          actorRecord = await persistActor(_db, _domain, actor);
        }
      } catch {
        return;
      }
      if (!actorRecord) return;

      let objectUri: string | undefined;
      try {
        const object = await deleteActivity.getObject();
        if (object instanceof Tombstone) {
          objectUri = object.id?.href;
        } else if (object instanceof Note || object instanceof Article || object instanceof Page) {
          objectUri = object.id?.href;
        }
      } catch { /* ignore */ }

      if (!objectUri) {
        objectUri = deleteActivity.objectId?.href;
      }

      if (!objectUri) {
        console.log(`[Delete] No object URI found`);
        return;
      }

      // Account deletion
      if (objectUri === actorRecord.uri) {
        if (actorRecord.user_id) {
          console.log(`[Delete] Ignoring delete for local actor: ${actorRecord.handle}`);
          return;
        }

        const deletedCount = await _db.deleteActorAndPosts(actorRecord.id);
        console.log(`[Delete] Account ${actorRecord.handle} deleted (${deletedCount} posts removed)`);
        await invalidateProfileCache(actorRecord.id);
        return;
      }

      // Post deletion
      const post = await _db.getPostByUri(objectUri);
      if (!post) {
        console.log(`[Delete] Post not found: ${objectUri}`);
        return;
      }

      // Authorization check - be permissive with remote deletes:
      // 1. Author can always delete their own posts
      // 2. Same instance as post origin can delete (mod/admin)
      // 3. Same instance as the community that announced it can delete (community mod)
      // (Fedify already verified the HTTP signature, so these are legit requests)
      const postHost = new URL(objectUri).host;
      const actorHost = new URL(actorRecord.uri).host;
      const isAuthor = post.actor_id === actorRecord.id;
      const isSameInstanceAsPost = postHost === actorHost;

      // Check if actor is from the community that the post was addressed to
      let isSameInstanceAsCommunity = false;
      if (post.addressed_to && post.addressed_to.length > 0) {
        for (const communityUri of post.addressed_to) {
          try {
            const communityHost = new URL(communityUri).host;
            if (communityHost === actorHost) {
              isSameInstanceAsCommunity = true;
              break;
            }
          } catch { /* ignore invalid URIs */ }
        }
      }

      if (!isAuthor && !isSameInstanceAsPost && !isSameInstanceAsCommunity) {
        console.log(`[Delete] Unauthorized: ${actorRecord.handle} (${actorHost}) cannot delete post from ${postHost}`);
        return;
      }

      await _db.deletePost(post.id);
      const reason = isAuthor ? '' : isSameInstanceAsPost ? ' (origin mod)' : ' (community mod)';
      console.log(`[Delete] Post ${post.id} deleted by ${actorRecord.handle}${reason}`);
      await invalidateProfileCache(actorRecord.id);
    });
}

// ============ Helper: Check community submission ============

async function checkAndSubmitToCommunity(
  note: Note | Article | Page,
  postId: number,
  authorActorId: number
): Promise<void> {
  const communityDb = getCommunityDb();
  if (!communityDb) return;

  const communityModeration = new CommunityModeration(communityDb);
  const recipients: string[] = [];

  try {
    const toRecipients = note.toIds;
    if (toRecipients) {
      for (const uri of toRecipients) {
        if (uri instanceof URL) recipients.push(uri.href);
      }
    }
  } catch { /* ignore */ }

  try {
    const ccRecipients = note.ccIds;
    if (ccRecipients) {
      for (const uri of ccRecipients) {
        if (uri instanceof URL) recipients.push(uri.href);
      }
    }
  } catch { /* ignore */ }

  for (const uri of recipients) {
    if (uri === PUBLIC_COLLECTION.href) continue;

    const community = await communityDb.getCommunityByUri(uri);
    if (community) {
      const permission = await communityModeration.canPost(community.id, authorActorId);
      if (!permission.allowed) {
        console.log(`[Create] Post ${postId} rejected from community ${community.name}: ${permission.reason}`);
        continue;
      }

      const autoApprove = await communityModeration.shouldAutoApprove(community.id, authorActorId);
      await communityDb.submitCommunityPost(community.id, postId, autoApprove);
      console.log(`[Create] Post ${postId} submitted to community ${community.name} (auto-approved: ${autoApprove})`);
      return;
    }
  }
}
