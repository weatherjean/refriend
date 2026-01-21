import {
  Accept,
  Announce,
  Create,
  Delete,
  Document,
  Follow,
  Group,
  Image,
  Like,
  Note,
  Tombstone,
  Undo,
  isActor,
  type Actor as APActor,
  type Context,
  PUBLIC_COLLECTION,
} from "@fedify/fedify";
import type { DB, Actor } from "./db.ts";
import { invalidateProfileCache } from "./cache.ts";
import { updatePostScore, updateParentPostScore } from "./scoring.ts";
import { createNotification, removeNotification } from "./notifications.ts";
import { CommunityDB } from "./communities/db.ts";
import { CommunityModeration } from "./communities/moderation.ts";

// Community DB instance (set during initialization)
let communityDb: CommunityDB | null = null;
let communityModeration: CommunityModeration | null = null;

export function setCommunityDb(db: CommunityDB) {
  communityDb = db;
  communityModeration = new CommunityModeration(db);
}

// Activity processing result
export interface ProcessResult {
  success: boolean;
  activity?: Awaited<ReturnType<DB["storeActivity"]>>;
  error?: string;
}

// Helper to persist remote actors
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

  const name = typeof actor.name === "string"
    ? actor.name
    : actor.name?.toString() ?? null;

  const bio = typeof actor.summary === "string"
    ? actor.summary
    : actor.summary?.toString() ?? null;

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

// Extract hashtags from content
function extractHashtags(text: string): string[] {
  const plainText = text.replace(/<[^>]*>/g, "");
  const matches = plainText.match(/#[\w]+/g) || [];
  return [...new Set(matches.map((m) => m.slice(1).toLowerCase()))];
}

// Helper to fetch and store a remote Note (for fetching parent posts of replies)
async function fetchAndStoreNote(
  ctx: Context<void>,
  db: DB,
  domain: string,
  noteUri: string
): Promise<number | null> {
  // Check if we already have it
  const existing = await db.getPostByUri(noteUri);
  if (existing) return existing.id;

  console.log(`[Reply] Fetching parent post: ${noteUri}`);

  try {
    // Fetch the Note from remote
    const docLoader = ctx.documentLoader;
    const note = await Note.fromJsonLd(await docLoader(noteUri).then(r => r.document), {
      documentLoader: docLoader,
      contextLoader: ctx.contextLoader,
    });

    if (!note || !note.id) {
      console.log(`[Reply] Failed to fetch parent note: ${noteUri}`);
      return null;
    }

    // Get the author
    const author = await note.getAttribution();
    if (!author || !isActor(author)) {
      console.log(`[Reply] Parent note has no author: ${noteUri}`);
      return null;
    }

    // Persist the author
    const authorActor = await persistActor(db, domain, author);
    if (!authorActor) {
      console.log(`[Reply] Failed to persist parent author: ${noteUri}`);
      return null;
    }

    // Get content and URL
    const content = typeof note.content === "string"
      ? note.content
      : note.content?.toString() ?? "";

    const noteUrl = note.url;
    let urlString: string | null = null;
    if (noteUrl) {
      if (noteUrl instanceof URL) {
        urlString = noteUrl.href;
      } else if (typeof noteUrl === 'string') {
        urlString = noteUrl;
      } else if (noteUrl && 'href' in noteUrl) {
        urlString = String(noteUrl.href);
      }
    }

    // Check if this note is itself a reply (recursively fetch parent)
    let inReplyToId: number | null = null;
    const parentReplyUri = note.replyTargetId?.href;
    if (parentReplyUri) {
      // Limit recursion depth to avoid infinite loops
      inReplyToId = await fetchAndStoreNote(ctx, db, domain, parentReplyUri);
    }

    // Get sensitive flag
    const sensitive = note.sensitive ?? false;

    // Create the post
    const post = await db.createPost({
      uri: note.id.href,
      actor_id: authorActor.id,
      content,
      url: urlString,
      in_reply_to_id: inReplyToId,
      sensitive,
    });

    // Extract hashtags
    const hashtags = extractHashtags(content);
    for (const tag of hashtags) {
      const hashtag = await db.getOrCreateHashtag(tag);
      await db.addPostHashtag(post.id, hashtag.id);
    }

    // Extract attachments
    try {
      const attachments = await note.getAttachments();
      for await (const att of attachments) {
        if (att instanceof Document || att instanceof Image) {
          const attUrl = att.url;
          let attUrlString: string | null = null;
          if (attUrl instanceof URL) {
            attUrlString = attUrl.href;
          } else if (typeof attUrl === 'string') {
            attUrlString = attUrl;
          } else if (attUrl && 'href' in attUrl) {
            attUrlString = String(attUrl.href);
          }

          if (attUrlString) {
            const mediaType = att.mediaType ?? "image/jpeg";
            const altText = typeof att.name === 'string' ? att.name : att.name?.toString() ?? null;
            const width = att.width ?? null;
            const height = att.height ?? null;

            await db.createMedia(post.id, attUrlString, mediaType, altText, width, height);
          }
        }
      }
    } catch {
      // Attachments may not be present
    }

    console.log(`[Reply] Fetched and stored parent post: ${post.id}`);
    return post.id;
  } catch (e) {
    console.log(`[Reply] Error fetching parent: ${noteUri}`, e);
    return null;
  }
}

// Serialize an activity to JSON for storage
async function serializeActivity(activity: Create | Like | Follow | Delete | Undo | Accept | Announce): Promise<string> {
  try {
    const json = await activity.toJsonLd();
    return JSON.stringify(json);
  } catch (e) {
    // Fallback for localhost/dev environments where toJsonLd might fail
    return JSON.stringify({
      "@context": "https://www.w3.org/ns/activitystreams",
      type: activity.constructor.name,
      id: activity.id?.href,
      actor: activity.actorId?.href,
    });
  }
}

// Safe send activity - handles localhost/dev environments gracefully
// deno-lint-ignore no-explicit-any
async function safeSendActivity(
  ctx: Context<void>,
  sender: { identifier: string },
  recipients: any,
  activity: any
): Promise<void> {
  try {
    await ctx.sendActivity(sender, recipients, activity);
  } catch (e) {
    // In development (localhost), federation will fail - that's OK
    const errMsg = String(e);
    if (errMsg.includes("Localhost") || errMsg.includes("localhost")) {
      console.log(`[Federation] Skipped (localhost): ${activity.id?.href}`);
    } else {
      console.error(`[Federation] Failed to send activity:`, e);
    }
  }
}

// Get activity type name
function getActivityType(activity: Create | Like | Follow | Delete | Undo | Accept | Announce): string {
  if (activity instanceof Create) return "Create";
  if (activity instanceof Like) return "Like";
  if (activity instanceof Follow) return "Follow";
  if (activity instanceof Delete) return "Delete";
  if (activity instanceof Undo) return "Undo";
  if (activity instanceof Accept) return "Accept";
  if (activity instanceof Announce) return "Announce";
  return "Unknown";
}

// Get object info from activity (safe - handles localhost errors)
async function getObjectInfo(activity: Create | Like | Follow | Delete | Undo | Accept | Announce): Promise<{ uri: string | null; type: string | null }> {
  try {
    if (activity instanceof Create) {
      const obj = await activity.getObject();
      if (obj instanceof Note) {
        return { uri: obj.id?.href ?? null, type: "Note" };
      }
    }
    if (activity instanceof Like) {
      return { uri: activity.objectId?.href ?? null, type: "Note" };
    }
    if (activity instanceof Follow) {
      return { uri: activity.objectId?.href ?? null, type: "Person" };
    }
    if (activity instanceof Announce) {
      return { uri: activity.objectId?.href ?? null, type: "Note" };
    }
    if (activity instanceof Delete) {
      const obj = await activity.getObject();
      if (obj instanceof Tombstone || obj instanceof Note) {
        return { uri: obj.id?.href ?? null, type: "Note" };
      }
    }
    if (activity instanceof Undo) {
      const obj = await activity.getObject();
      if (obj instanceof Like) {
        return { uri: obj.id?.href ?? null, type: "Like" };
      }
      if (obj instanceof Follow) {
        return { uri: obj.id?.href ?? null, type: "Follow" };
      }
      if (obj instanceof Announce) {
        return { uri: obj.id?.href ?? null, type: "Announce" };
      }
    }
    if (activity instanceof Accept) {
      const obj = await activity.getObject();
      if (obj instanceof Follow) {
        return { uri: obj.id?.href ?? null, type: "Follow" };
      }
    }
  } catch {
    // In localhost dev environments, getObject might fail
  }
  return { uri: null, type: null };
}

// ============ Main Processing Function ============

export async function processActivity(
  ctx: Context<void>,
  db: DB,
  domain: string,
  activity: Create | Like | Follow | Delete | Undo | Accept | Announce,
  direction: "inbound" | "outbound",
  localUsername?: string // For outbound activities, the local user's username
): Promise<ProcessResult> {
  const activityUri = activity.id?.href;
  if (!activityUri) {
    return { success: false, error: "Activity has no URI" };
  }

  // Check for duplicate (idempotency)
  const existing = await db.getActivityByUri(activityUri);
  if (existing) {
    console.log(`[${getActivityType(activity)}] Already processed: ${activityUri}`);
    return { success: true, activity: existing };
  }

  try {
    // Process based on activity type
    if (activity instanceof Create) {
      await processCreate(ctx, db, domain, activity, direction, localUsername);
    } else if (activity instanceof Like) {
      await processLike(ctx, db, domain, activity, direction, localUsername);
    } else if (activity instanceof Announce) {
      await processAnnounce(ctx, db, domain, activity, direction, localUsername);
    } else if (activity instanceof Follow) {
      await processFollow(ctx, db, domain, activity, direction, localUsername);
    } else if (activity instanceof Undo) {
      await processUndo(ctx, db, domain, activity, direction, localUsername);
    } else if (activity instanceof Delete) {
      await processDelete(ctx, db, domain, activity, direction, localUsername);
    } else if (activity instanceof Accept) {
      await processAccept(ctx, db, domain, activity, direction);
    }

    // Get actor for storing activity
    let actor: Actor | null = null;

    // For outbound activities, use the local username directly
    if (direction === "outbound" && localUsername) {
      actor = await db.getActorByUsername(localUsername);
    }

    // For inbound or if local lookup failed, try to resolve from activity
    if (!actor) {
      try {
        const actorAP = await activity.getActor();
        if (actorAP && isActor(actorAP)) {
          actor = await persistActor(db, domain, actorAP);
        }
      } catch {
        // In localhost dev, getActor might fail - that's OK for outbound
      }
    }

    if (!actor) {
      return { success: false, error: "Failed to resolve actor" };
    }

    // Store the activity
    const objectInfo = await getObjectInfo(activity);
    const rawJson = await serializeActivity(activity);

    const storedActivity = await db.storeActivity({
      uri: activityUri,
      type: getActivityType(activity),
      actor_id: actor.id,
      object_uri: objectInfo.uri,
      object_type: objectInfo.type,
      raw_json: rawJson,
      direction,
    });

    console.log(`[${getActivityType(activity)}] Processed (${direction}): ${activityUri}`);
    return { success: true, activity: storedActivity };
  } catch (error) {
    console.error(`[${getActivityType(activity)}] Error:`, error);
    return { success: false, error: String(error) };
  }
}

// ============ Individual Activity Handlers ============

async function processCreate(
  ctx: Context<void>,
  db: DB,
  domain: string,
  create: Create,
  direction: "inbound" | "outbound",
  localUsername?: string
): Promise<void> {
  let object: Note | null = null;
  let authorActor: Actor | null = null;

  // Try to get the object (Note)
  try {
    const obj = await create.getObject();
    if (obj instanceof Note) {
      object = obj;
    }
  } catch {
    // In localhost dev, getObject might fail
  }
  if (!object) return;

  // For outbound activities, use the local username to get the actor
  if (direction === "outbound" && localUsername) {
    authorActor = await db.getActorByUsername(localUsername);
  }

  // For inbound or if local lookup failed, try to resolve from activity
  if (!authorActor) {
    try {
      const author = await create.getActor();
      if (author && isActor(author)) {
        authorActor = await persistActor(db, domain, author);
      }
    } catch {
      // In localhost dev, getActor might fail
    }
  }
  if (!authorActor) return;

  const noteUri = object.id?.href;
  if (!noteUri) return;

  // Check if post already exists
  const existingPost = await db.getPostByUri(noteUri);
  if (existingPost) return;

  // Get content
  const content = typeof object.content === "string"
    ? object.content
    : object.content?.toString() ?? "";

  // Get URL
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

  // Check if this is a reply
  let inReplyToId: number | null = null;
  // Use replyTargetId (Fedify's name for inReplyTo)
  let inReplyToUri = object.replyTargetId?.href;
  if (!inReplyToUri) {
    // Try getting it via the async method for fetched objects
    try {
      const replyTarget = await object.getReplyTarget();
      if (replyTarget && replyTarget.id) {
        inReplyToUri = replyTarget.id.href;
      }
    } catch {
      // Ignore errors
    }
  }
  if (inReplyToUri) {
    // First check if we have the parent locally
    const parentPost = await db.getPostByUri(inReplyToUri);
    if (parentPost) {
      inReplyToId = parentPost.id;
    } else {
      // Try to fetch the parent post from remote
      inReplyToId = await fetchAndStoreNote(ctx, db, domain, inReplyToUri);
    }
    console.log(`[Create] Reply to ${inReplyToUri} -> local ID: ${inReplyToId}`);
  }

  // Get sensitive flag
  const sensitive = object.sensitive ?? false;

  // Create the post
  const post = await db.createPost({
    uri: noteUri,
    actor_id: authorActor.id,
    content,
    url: postUrlString,
    in_reply_to_id: inReplyToId,
    sensitive,
  });

  // Extract and add hashtags
  const hashtags = extractHashtags(content);
  for (const tag of hashtags) {
    const hashtag = await db.getOrCreateHashtag(tag);
    await db.addPostHashtag(post.id, hashtag.id);
  }

  // Extract attachments from incoming Note
  try {
    const attachments = await object.getAttachments();
    for await (const att of attachments) {
      if (att instanceof Document || att instanceof Image) {
        const attUrl = att.url;
        let urlString: string | null = null;
        if (attUrl instanceof URL) {
          urlString = attUrl.href;
        } else if (typeof attUrl === 'string') {
          urlString = attUrl;
        } else if (attUrl && 'href' in attUrl) {
          urlString = String(attUrl.href);
        }

        if (urlString) {
          // For outbound (local) posts, convert full URLs to relative paths
          if (direction === "outbound" && urlString.includes(`https://${domain}/uploads/`)) {
            urlString = urlString.replace(`https://${domain}`, "");
          }

          const mediaType = att.mediaType ?? "image/jpeg";
          const altText = typeof att.name === 'string' ? att.name : att.name?.toString() ?? null;
          const width = att.width ?? null;
          const height = att.height ?? null;

          await db.createMedia(post.id, urlString, mediaType, altText, width, height);
          console.log(`[Create] Added attachment: ${urlString}`);
        }
      }
    }
  } catch (e) {
    // Attachments may not be present or may fail to parse
    console.log(`[Create] Failed to extract attachments:`, e);
  }

  console.log(`[Create] Post from ${authorActor.handle}: ${post.id}`);

  // Check if this post is addressed to a community (via to/cc)
  if (communityDb && direction === "inbound") {
    await checkAndSubmitToCommunity(db, object, post.id, authorActor.id, inReplyToId);
  }

  // If this is a reply, update the parent post's hot score and notify
  if (inReplyToId) {
    await updateParentPostScore(db, inReplyToId);
    const parentPost = await db.getPostById(inReplyToId);
    if (parentPost) {
      await createNotification(db, 'reply', authorActor.id, parentPost.actor_id, post.id);
    }
  }

  // For outbound: send to followers and (if reply) to original author
  if (direction === "outbound" && localUsername) {
    // Send to followers
    await safeSendActivity(ctx,
      { identifier: localUsername },
      "followers",
      create
    );
    console.log(`[Create] Sent to followers of ${localUsername}`);

    // If this is a reply to a remote post, also send to the original author
    if (inReplyToId) {
      const parentPost = await db.getPostById(inReplyToId);
      if (parentPost) {
        const parentAuthor = await db.getActorById(parentPost.actor_id);
        if (parentAuthor && !parentAuthor.user_id && parentAuthor.inbox_url) {
          // Remote author - send them the reply
          await safeSendActivity(ctx,
            { identifier: localUsername },
            {
              id: new URL(parentAuthor.uri),
              inboxId: new URL(parentAuthor.inbox_url),
            },
            create
          );
          console.log(`[Create] Sent reply to ${parentAuthor.handle}`);
        }
      }
    }
  }

  // Invalidate the author's profile cache
  await invalidateProfileCache(authorActor.id);
}

async function processLike(
  ctx: Context<void>,
  db: DB,
  domain: string,
  like: Like,
  direction: "inbound" | "outbound",
  localUsername?: string
): Promise<void> {
  let likerActor: Actor | null = null;

  // For outbound activities, use the local username
  if (direction === "outbound" && localUsername) {
    likerActor = await db.getActorByUsername(localUsername);
  }

  // For inbound or if local lookup failed, try to resolve from activity
  if (!likerActor) {
    try {
      const actor = await like.getActor();
      if (actor && isActor(actor)) {
        likerActor = await persistActor(db, domain, actor);
      }
    } catch {
      // In localhost dev, getActor might fail
    }
  }
  if (!likerActor) return;

  const objectUri = like.objectId?.href;
  if (!objectUri) return;

  const post = await db.getPostByUri(objectUri);
  if (!post) {
    console.log(`[Like] Post not found: ${objectUri}`);
    return;
  }

  // Add the like and update hot score
  await db.addLike(likerActor.id, post.id);
  await updatePostScore(db, post.id);
  await createNotification(db, 'like', likerActor.id, post.actor_id, post.id);
  console.log(`[Like] ${likerActor.handle} liked post ${post.id}`);

  // For outbound: send to post author if remote
  if (direction === "outbound" && localUsername) {
    const postAuthor = await db.getActorById(post.actor_id);
    if (postAuthor && !postAuthor.user_id) {
      await safeSendActivity(ctx,
        { identifier: localUsername },
        {
          id: new URL(postAuthor.uri),
          inboxId: new URL(postAuthor.inbox_url),
        },
        like
      );
      console.log(`[Like] Sent to ${postAuthor.handle}`);
    }
  }
}

async function processAnnounce(
  ctx: Context<void>,
  db: DB,
  domain: string,
  announce: Announce,
  direction: "inbound" | "outbound",
  localUsername?: string
): Promise<void> {
  let boosterActor: Actor | null = null;

  // For outbound activities, use the local username
  if (direction === "outbound" && localUsername) {
    boosterActor = await db.getActorByUsername(localUsername);
  }

  // For inbound or if local lookup failed, try to resolve from activity
  if (!boosterActor) {
    try {
      const actor = await announce.getActor();
      if (actor && isActor(actor)) {
        boosterActor = await persistActor(db, domain, actor);
      }
    } catch {
      // In localhost dev, getActor might fail
    }
  }
  if (!boosterActor) return;

  const objectUri = announce.objectId?.href;
  if (!objectUri) return;

  // Try to find the post locally, or fetch it if remote
  let post = await db.getPostByUri(objectUri);
  if (!post) {
    // Try to fetch the remote post
    const postId = await fetchAndStoreNote(ctx, db, domain, objectUri);
    if (postId) {
      post = await db.getPostById(postId);
    }
  }

  if (!post) {
    console.log(`[Announce] Post not found: ${objectUri}`);
    return;
  }

  // Add the boost and update hot score
  await db.addBoost(boosterActor.id, post.id);
  await updatePostScore(db, post.id);
  await createNotification(db, 'boost', boosterActor.id, post.actor_id, post.id);
  console.log(`[Announce] ${boosterActor.handle} boosted post ${post.id}`);

  // For outbound: send to followers and post author
  if (direction === "outbound" && localUsername) {
    // Send to followers
    await safeSendActivity(ctx,
      { identifier: localUsername },
      "followers",
      announce
    );
    console.log(`[Announce] Sent to followers of ${localUsername}`);

    // Also send to post author if remote
    const postAuthor = await db.getActorById(post.actor_id);
    if (postAuthor && !postAuthor.user_id && postAuthor.inbox_url) {
      await safeSendActivity(ctx,
        { identifier: localUsername },
        {
          id: new URL(postAuthor.uri),
          inboxId: new URL(postAuthor.inbox_url),
        },
        announce
      );
      console.log(`[Announce] Sent to ${postAuthor.handle}`);
    }
  }
}

async function processFollow(
  ctx: Context<void>,
  db: DB,
  domain: string,
  follow: Follow,
  direction: "inbound" | "outbound",
  localUsername?: string
): Promise<void> {
  let followerActor: Actor | null = null;

  // For outbound activities, use the local username
  if (direction === "outbound" && localUsername) {
    followerActor = await db.getActorByUsername(localUsername);
  }

  // For inbound or if local lookup failed, try to resolve from activity
  let followerAP: APActor | null = null;
  if (!followerActor) {
    try {
      followerAP = await follow.getActor() as APActor | null;
      if (followerAP && isActor(followerAP)) {
        followerActor = await persistActor(db, domain, followerAP);
      }
    } catch {
      // In localhost dev, getActor might fail
    }
  }
  if (!followerActor) return;

  const targetUri = follow.objectId?.href;
  if (!targetUri) return;

  // Find target actor
  const targetActor = await db.getActorByUri(targetUri);
  if (!targetActor) {
    console.log(`[Follow] Target not found: ${targetUri}`);
    return;
  }

  // Add the follow relationship
  await db.addFollow(followerActor.id, targetActor.id);
  await createNotification(db, 'follow', followerActor.id, targetActor.id);
  console.log(`[Follow] ${followerActor.handle} -> ${targetActor.handle}`);

  // For inbound: if target is local, send Accept
  if (direction === "inbound" && targetActor.user_id && followerActor.inbox_url) {
    const username = targetActor.handle.match(/@([^@]+)@/)?.[1];
    if (username) {
      const accept = new Accept({
        id: new URL(`https://${domain}/#accepts/${crypto.randomUUID()}`),
        actor: ctx.getActorUri(username),
        object: follow,
      });

      // Use followerAP if available, otherwise use the persisted followerActor
      const recipient = followerAP ?? {
        id: new URL(followerActor.uri),
        inboxId: new URL(followerActor.inbox_url),
      };

      await safeSendActivity(ctx,
        { identifier: username },
        recipient,
        accept
      );
      console.log(`[Follow] Sent Accept to ${followerActor.handle}`);
    }
  }

  // For outbound to remote: send Follow activity
  if (direction === "outbound" && localUsername && !targetActor.user_id) {
    await safeSendActivity(ctx,
      { identifier: localUsername },
      {
        id: new URL(targetActor.uri),
        inboxId: new URL(targetActor.inbox_url),
      },
      follow
    );
    console.log(`[Follow] Sent to ${targetActor.handle}`);
  }
}

async function processAccept(
  ctx: Context<void>,
  db: DB,
  domain: string,
  accept: Accept,
  direction: "inbound" | "outbound"
): Promise<void> {
  const activity = await accept.getObject();
  if (!(activity instanceof Follow)) return;

  const sender = await accept.getActor();
  if (!sender || !isActor(sender)) return;

  const followerId = activity.actorId;
  if (!followerId) return;

  const followerActor = await db.getActorByUri(followerId.href);
  if (!followerActor) return;

  // Persist the accepted actor and add follow
  const acceptedActor = await persistActor(db, domain, sender);
  if (!acceptedActor) return;

  await db.addFollow(followerActor.id, acceptedActor.id);
  console.log(`[Accept] ${followerActor.handle} now following ${acceptedActor.handle}`);
}

async function processUndo(
  ctx: Context<void>,
  db: DB,
  domain: string,
  undo: Undo,
  direction: "inbound" | "outbound",
  localUsername?: string
): Promise<void> {
  let activity: Like | Follow | Announce | null = null;
  let actorRecord: Actor | null = null;

  // Try to get the wrapped activity
  try {
    const obj = await undo.getObject();
    if (obj instanceof Like || obj instanceof Follow || obj instanceof Announce) {
      activity = obj;
    }
  } catch {
    // In localhost dev, getObject might fail
  }

  // For outbound activities, use the local username
  if (direction === "outbound" && localUsername) {
    actorRecord = await db.getActorByUsername(localUsername);
  }

  // For inbound or if local lookup failed, try to resolve from activity
  if (!actorRecord) {
    try {
      const actor = await undo.getActor();
      if (actor && isActor(actor)) {
        actorRecord = await persistActor(db, domain, actor);
      }
    } catch {
      // In localhost dev, getActor might fail
    }
  }
  if (!actorRecord) return;

  // Handle Undo(Follow)
  if (activity instanceof Follow) {
    const targetUri = activity.objectId?.href;
    if (!targetUri) return;

    const targetActor = await db.getActorByUri(targetUri);
    if (!targetActor) return;

    await db.removeFollow(actorRecord.id, targetActor.id);
    await removeNotification(db, 'follow', actorRecord.id, targetActor.id);
    console.log(`[Undo Follow] ${actorRecord.handle} unfollowed ${targetActor.handle}`);

    // For outbound to remote: send Undo activity
    if (direction === "outbound" && localUsername && !targetActor.user_id) {
      await safeSendActivity(ctx,
        { identifier: localUsername },
        {
          id: new URL(targetActor.uri),
          inboxId: new URL(targetActor.inbox_url),
        },
        undo
      );
      console.log(`[Undo Follow] Sent to ${targetActor.handle}`);
    }
  }

  // Handle Undo(Like)
  if (activity instanceof Like) {
    const objectUri = activity.objectId?.href;
    if (!objectUri) return;

    const post = await db.getPostByUri(objectUri);
    if (!post) return;

    await db.removeLike(actorRecord.id, post.id);
    await updatePostScore(db, post.id);
    await removeNotification(db, 'like', actorRecord.id, post.actor_id, post.id);
    console.log(`[Undo Like] ${actorRecord.handle} unliked post ${post.id}`);

    // For outbound to remote: send Undo activity
    if (direction === "outbound" && localUsername) {
      const postAuthor = await db.getActorById(post.actor_id);
      if (postAuthor && !postAuthor.user_id) {
        await safeSendActivity(ctx,
          { identifier: localUsername },
          {
            id: new URL(postAuthor.uri),
            inboxId: new URL(postAuthor.inbox_url),
          },
          undo
        );
        console.log(`[Undo Like] Sent to ${postAuthor.handle}`);
      }
    }
  }

  // Handle Undo(Announce)
  if (activity instanceof Announce) {
    const objectUri = activity.objectId?.href;
    if (!objectUri) return;

    const post = await db.getPostByUri(objectUri);
    if (!post) return;

    await db.removeBoost(actorRecord.id, post.id);
    await updatePostScore(db, post.id);
    await removeNotification(db, 'boost', actorRecord.id, post.actor_id, post.id);
    console.log(`[Undo Announce] ${actorRecord.handle} unboosted post ${post.id}`);

    // For outbound: send to followers and post author
    if (direction === "outbound" && localUsername) {
      // Send to followers
      await safeSendActivity(ctx,
        { identifier: localUsername },
        "followers",
        undo
      );
      console.log(`[Undo Announce] Sent to followers of ${localUsername}`);

      // Also notify post author if remote
      const postAuthor = await db.getActorById(post.actor_id);
      if (postAuthor && !postAuthor.user_id && postAuthor.inbox_url) {
        await safeSendActivity(ctx,
          { identifier: localUsername },
          {
            id: new URL(postAuthor.uri),
            inboxId: new URL(postAuthor.inbox_url),
          },
          undo
        );
        console.log(`[Undo Announce] Sent to ${postAuthor.handle}`);
      }
    }
  }
}

// Helper to check if a post is addressed to a community and submit it
async function checkAndSubmitToCommunity(
  db: DB,
  note: Note,
  postId: number,
  authorActorId: number,
  inReplyToId: number | null
): Promise<void> {
  if (!communityDb || !communityModeration) return;

  // Get all recipients from to/cc
  const recipients: string[] = [];

  // Get 'to' recipients
  try {
    const toRecipients = note.toIds;
    if (toRecipients) {
      for (const uri of toRecipients) {
        if (uri instanceof URL) {
          recipients.push(uri.href);
        }
      }
    }
  } catch {
    // Ignore errors
  }

  // Get 'cc' recipients
  try {
    const ccRecipients = note.ccIds;
    if (ccRecipients) {
      for (const uri of ccRecipients) {
        if (uri instanceof URL) {
          recipients.push(uri.href);
        }
      }
    }
  } catch {
    // Ignore errors
  }

  // Check each recipient to see if it's a community
  for (const uri of recipients) {
    if (uri === PUBLIC_COLLECTION.href) continue;

    const community = await communityDb.getCommunityByUri(uri);
    if (community) {
      // Found a community! Check if the author can post
      const permission = await communityModeration.canPost(community.id, authorActorId);
      if (!permission.allowed) {
        console.log(`[Create] Post ${postId} rejected from community ${community.name}: ${permission.reason}`);
        continue;
      }

      // Submit the post to the community
      const autoApprove = await communityModeration.shouldAutoApprove(community.id, authorActorId);
      await communityDb.submitCommunityPost(community.id, postId, autoApprove);
      console.log(`[Create] Post ${postId} submitted to community ${community.name} (auto-approved: ${autoApprove})`);
      return; // Only submit to one community
    }
  }

  // If this is a reply, check if the parent post belongs to a community
  if (inReplyToId) {
    const parentCommunity = await communityDb.getCommunityForPost(inReplyToId);
    if (parentCommunity) {
      // Check if author can post to this community
      const permission = await communityModeration.canPost(parentCommunity.id, authorActorId);
      if (!permission.allowed) {
        console.log(`[Create] Reply ${postId} rejected from community ${parentCommunity.name}: ${permission.reason}`);
        return;
      }

      // Submit the reply to the community (replies inherit community context)
      const autoApprove = await communityModeration.shouldAutoApprove(parentCommunity.id, authorActorId);
      await communityDb.submitCommunityPost(parentCommunity.id, postId, autoApprove);
      console.log(`[Create] Reply ${postId} submitted to community ${parentCommunity.name} (inherited from parent)`);
    }
  }
}

async function processDelete(
  ctx: Context<void>,
  db: DB,
  domain: string,
  deleteActivity: Delete,
  direction: "inbound" | "outbound",
  localUsername?: string
): Promise<void> {
  let actorRecord: Actor | null = null;

  // For outbound activities, use the local username
  if (direction === "outbound" && localUsername) {
    actorRecord = await db.getActorByUsername(localUsername);
  }

  // For inbound or if local lookup failed, try to resolve from activity
  if (!actorRecord) {
    try {
      const actor = await deleteActivity.getActor();
      if (actor && isActor(actor)) {
        actorRecord = await persistActor(db, domain, actor);
      }
    } catch {
      // In localhost dev, getActor might fail
    }
  }
  if (!actorRecord) return;

  // Try to get the object being deleted
  let objectUri: string | undefined;
  try {
    const object = await deleteActivity.getObject();
    if (object instanceof Tombstone) {
      objectUri = object.id?.href;
    } else if (object instanceof Note) {
      objectUri = object.id?.href;
    }
  } catch {
    // In localhost dev, getObject might fail
  }

  if (!objectUri) return;

  // Find and delete the post
  const post = await db.getPostByUri(objectUri);
  if (post && post.actor_id === actorRecord.id) {
    await db.deletePost(post.id);
    console.log(`[Delete] Post ${post.id} by ${actorRecord.handle}`);

    // Invalidate the author's profile cache
    await invalidateProfileCache(actorRecord.id);

    // For outbound: send to followers
    if (direction === "outbound" && localUsername) {
      await safeSendActivity(ctx,
        { identifier: localUsername },
        "followers",
        deleteActivity
      );
      console.log(`[Delete] Sent to followers of ${localUsername}`);
    }
  }
}
