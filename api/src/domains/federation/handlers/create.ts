/**
 * Create Activity Handler
 *
 * Handles ActivityPub Create activities (posts, replies).
 */

import {
  Create,
  Document,
  Image,
  Link,
  Note,
  Article,
  Page,
  isActor,
  PUBLIC_COLLECTION,
  type Context,
} from "@fedify/fedify";
import type { DB, Actor } from "../../../db.ts";
import { persistActor, getCommunityDb } from "../actor-persistence.ts";
import { extractHashtags, validateAndSanitizeContent, MAX_CONTENT_SIZE } from "../utils/content.ts";
import { safeSendActivity } from "../utils/send.ts";
import { fetchAndStoreNote } from "../utils/notes.ts";
import { invalidateProfileCache } from "../../../cache.ts";
import { updateParentPostScore } from "../../../scoring.ts";
import { createNotification } from "../../notifications/routes.ts";
import { CommunityModeration } from "../../communities/moderation.ts";
import { fetchOpenGraph } from "../../posts/service.ts";

/**
 * Process a Create activity
 */
export async function processCreate(
  ctx: Context<void>,
  db: DB,
  domain: string,
  create: Create,
  direction: "inbound" | "outbound",
  localUsername?: string
): Promise<void> {
  let object: Note | Article | Page | null = null;
  let titlePrefix: string | null = null;  // For Article/Page titles
  let authorActor: Actor | null = null;

  // Try to get the object (Note, Article, or Page)
  try {
    const obj = await create.getObject();
    if (obj instanceof Note) {
      object = obj;
    } else if (obj instanceof Article || obj instanceof Page) {
      object = obj;
      // Extract title for later - Lemmy uses 'name' for post titles
      const title = typeof obj.name === 'string' ? obj.name : obj.name?.toString();
      if (title) {
        titlePrefix = title;
      }
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
  let rawContent = typeof object.content === "string"
    ? object.content
    : object.content?.toString() ?? "";

  // For Article/Page (Lemmy/kbin), prepend the title to content
  if (titlePrefix) {
    const escapedTitle = titlePrefix
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const titleHtml = `<p><strong>${escapedTitle}</strong></p>`;
    rawContent = rawContent ? `${titleHtml}\n${rawContent}` : titleHtml;
  }

  // For inbound content, validate size and sanitize HTML
  let content = rawContent;
  if (direction === "inbound") {
    const sanitized = validateAndSanitizeContent(rawContent);
    if (sanitized === null) {
      console.log(`[Create] Rejected post from ${authorActor.handle}: content exceeds ${MAX_CONTENT_SIZE} bytes`);
      return;
    }
    content = sanitized;
  }

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

    // Discard replies if we can't resolve the parent post
    if (!inReplyToId) {
      console.log(`[Create] Discarding reply - parent post not found: ${inReplyToUri}`);
      return;
    }
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
      // Handle Link attachments (Lemmy/kbin external URLs) - only for Page/Article, not Note
      if (att instanceof Link && (object instanceof Page || object instanceof Article)) {
        const linkHref = att.href;
        if (linkHref) {
          const externalUrl = linkHref instanceof URL ? linkHref.href : String(linkHref);

          // 1. Update post URL
          await db.updatePostUrl(post.id, externalUrl);
          console.log(`[Create] Added external link from attachment: ${externalUrl}`);

          // 2. Fetch OpenGraph preview (non-blocking, don't fail on error)
          try {
            const linkPreview = await fetchOpenGraph(externalUrl);
            if (linkPreview) {
              await db.updatePostLinkPreview(post.id, linkPreview);
              console.log(`[Create] Added link preview for: ${externalUrl}`);
            }
          } catch (e) {
            console.log(`[Create] Failed to fetch link preview: ${e}`);
          }

          // 3. Append link to content (like local posts do)
          const escapedUrl = externalUrl
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
          const linkHtml = `<p><a href="${escapedUrl}">${escapedUrl}</a></p>`;
          const updatedContent = content + linkHtml;
          await db.updatePostContent(post.id, updatedContent);
        }
        continue;
      }

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
  const communityDb = getCommunityDb();
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
    // Send to followers (use shared inbox for efficiency)
    await safeSendActivity(ctx,
      { identifier: localUsername },
      "followers",
      create,
      { preferSharedInbox: true }
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

/**
 * Check if a post is addressed to a community and submit it
 */
async function checkAndSubmitToCommunity(
  db: DB,
  note: Note | Article | Page,
  postId: number,
  authorActorId: number,
  inReplyToId: number | null
): Promise<void> {
  const communityDb = getCommunityDb();
  if (!communityDb) return;

  const communityModeration = new CommunityModeration(communityDb);

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

  // Note: Replies to community posts are NOT added to community_posts table.
  // They are just regular replies that show up under their parent post.
  // Only top-level posts addressed directly to a community go into community_posts.
}
