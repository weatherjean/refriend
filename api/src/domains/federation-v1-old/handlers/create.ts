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
  Hashtag,
  isActor,
  PUBLIC_COLLECTION,
  type Context,
} from "@fedify/fedify";
import type { DB, Actor } from "../../../db.ts";
import { persistActor } from "../actor-persistence.ts";
import { validateAndSanitizeContent, MAX_CONTENT_SIZE } from "../utils/content.ts";
import { safeSendActivity } from "../utils/send.ts";
import { fetchAndStoreNote } from "../utils/notes.ts";
import { invalidateProfileCache } from "../../../cache.ts";
import { updateParentPostScore } from "../../../scoring.ts";
import { createNotification } from "../../notifications/routes.ts";
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

  // Extract audience URIs (Lemmy community) for inbound posts
  const addressedTo: string[] = [];
  if (direction === "inbound") {
    try {
      // Try singular audience first (Lemmy uses this)
      const audienceId = object.audienceId;
      if (audienceId) {
        addressedTo.push(audienceId.href);
      }
      // Also check plural audiences
      const audienceIds = object.audienceIds;
      for (const uri of audienceIds) {
        if (uri instanceof URL && !addressedTo.includes(uri.href)) {
          addressedTo.push(uri.href);
        }
      }
      if (addressedTo.length > 0) {
        console.log(`[Create] Post has audience: ${addressedTo.join(", ")}`);
      }
    } catch {
      // Audience may not be present
    }
  }

  // Create the post
  const post = await db.createPost({
    uri: noteUri,
    actor_id: authorActor.id,
    content,
    url: postUrlString,
    in_reply_to_id: inReplyToId,
    sensitive,
    addressed_to: addressedTo.length > 0 ? addressedTo : undefined,
  });

  // Extract hashtags from structured tag data (not regex on content)
  try {
    const tags = await object.getTags();
    for await (const tag of tags) {
      if (tag instanceof Hashtag && tag.name) {
        // Tag name comes as "#hashtag", strip the # prefix
        const tagName = tag.name.toString().replace(/^#/, '').toLowerCase();
        if (tagName) {
          const hashtag = await db.getOrCreateHashtag(tagName);
          await db.addPostHashtag(post.id, hashtag.id);
        }
      }
    }
  } catch {
    // Tags may not be present
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
          // Remote author - send them the reply via shared inbox if available
          await safeSendActivity(ctx,
            { identifier: localUsername },
            {
              id: new URL(parentAuthor.uri),
              inboxId: new URL(parentAuthor.shared_inbox_url || parentAuthor.inbox_url),
            },
            create,
            { preferSharedInbox: true }
          );
          console.log(`[Create] Sent reply to ${parentAuthor.handle}`);
        }
      }
    }

    // If the Note has an audience (Lemmy community), send to the community inbox
    try {
      const audienceId = object.audienceId;
      if (audienceId) {
        // Fetch the community actor to get its inbox
        const communityActor = await db.getActorByUri(audienceId.href);
        if (communityActor && communityActor.inbox_url) {
          // Use shared inbox for Lemmy communities
          await safeSendActivity(ctx,
            { identifier: localUsername },
            {
              id: new URL(communityActor.uri),
              inboxId: new URL(communityActor.shared_inbox_url || communityActor.inbox_url),
            },
            create,
            { preferSharedInbox: true }
          );
          console.log(`[Create] Sent to community: ${communityActor.handle}`);
        } else {
          console.log(`[Create] Community actor not found for audience: ${audienceId.href}`);
        }
      }
    } catch (e) {
      console.log(`[Create] Failed to send to audience:`, e);
    }
  }

  // Invalidate the author's profile cache
  await invalidateProfileCache(authorActor.id);
}

