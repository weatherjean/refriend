/**
 * Federation Notes Utilities
 *
 * Functions for fetching and storing remote notes.
 */

import {
  Create,
  Update,
  Document,
  Image,
  Link,
  Note,
  Article,
  Page,
  Hashtag,
  isActor,
  type Context,
} from "@fedify/fedify";
import type { DB } from "../../../db.ts";
import { persistActor } from "../actor-persistence.ts";
import { validateAndSanitizeContent } from "./content.ts";
import { fetchOpenGraph } from "../../posts/service.ts";

/**
 * Fetch and store a remote Note (for fetching parent posts of replies)
 */
export async function fetchAndStoreNote(
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
    // Fetch the document from remote
    const docLoader = ctx.documentLoader;
    const { document } = await docLoader(noteUri);

    // Check the object type and parse accordingly
    // deno-lint-ignore no-explicit-any
    let docType = (document as any)?.type || (document as any)?.['@type'];
    let typeStr = Array.isArray(docType) ? docType[0] : docType;
    // deno-lint-ignore no-explicit-any
    let objectDoc: any = document;

    // Handle Create/Update activities by unwrapping to get the actual object
    // Lemmy sends URLs like /activities/create/... that return Create activities
    if (typeStr === 'Create' || typeStr === 'Update') {
      try {
        // Use the correct class based on activity type
        const activity = typeStr === 'Create'
          ? await Create.fromJsonLd(document, { documentLoader: docLoader, contextLoader: ctx.contextLoader })
          : await Update.fromJsonLd(document, { documentLoader: docLoader, contextLoader: ctx.contextLoader });
        const innerObject = await activity.getObject();
        if (innerObject && 'id' in innerObject && innerObject.id) {
          // Re-fetch the actual object URL
          const { document: innerDoc } = await docLoader(innerObject.id.href);
          objectDoc = innerDoc;
          docType = (innerDoc as any)?.type || (innerDoc as any)?.['@type'];
          const originalType = typeStr;
          typeStr = Array.isArray(docType) ? docType[0] : docType;
          console.log(`[Reply] Unwrapped ${originalType} activity to ${typeStr}: ${innerObject.id.href}`);
        } else {
          console.log(`[Reply] Create/Update activity has no valid object: ${noteUri}`);
          return null;
        }
      } catch (e) {
        console.log(`[Reply] Failed to unwrap Create/Update activity: ${noteUri}`, e);
        return null;
      }
    }

    let note: Note | Article | Page | null = null;
    let titlePrefix: string | null = null;

    if (typeStr === 'Article') {
      note = await Article.fromJsonLd(objectDoc, { documentLoader: docLoader, contextLoader: ctx.contextLoader });
    } else if (typeStr === 'Page') {
      note = await Page.fromJsonLd(objectDoc, { documentLoader: docLoader, contextLoader: ctx.contextLoader });
    } else if (typeStr === 'Note') {
      note = await Note.fromJsonLd(objectDoc, { documentLoader: docLoader, contextLoader: ctx.contextLoader });
    } else {
      console.log(`[Reply] Skipping unsupported object type (${typeStr}): ${noteUri}`);
      return null;
    }

    // Extract title for Article/Page
    if (note && (note instanceof Article || note instanceof Page)) {
      const title = typeof note.name === 'string' ? note.name : note.name?.toString();
      if (title) titlePrefix = title;
    }

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
    let content = typeof note.content === "string"
      ? note.content
      : note.content?.toString() ?? "";

    // For Article/Page, prepend title
    if (titlePrefix) {
      const escapedTitle = titlePrefix
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      const titleHtml = `<p><strong>${escapedTitle}</strong></p>`;
      content = content ? `${titleHtml}\n${content}` : titleHtml;
    }

    // Sanitize remote content
    const sanitized = validateAndSanitizeContent(content);
    if (sanitized === null) {
      console.log(`[Reply] Parent post content too large: ${noteUri}`);
      return null;
    }
    content = sanitized;

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

    // Extract hashtags from structured tag data
    try {
      const tags = await note.getTags();
      for await (const tag of tags) {
        if (tag instanceof Hashtag && tag.name) {
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

    // Extract attachments
    try {
      const attachments = await note.getAttachments();
      for await (const att of attachments) {
        // Handle Link attachments (Lemmy/kbin external URLs) - only for Page/Article, not Note
        if (att instanceof Link && (note instanceof Page || note instanceof Article)) {
          const linkHref = att.href;
          if (linkHref) {
            const externalUrl = linkHref instanceof URL ? linkHref.href : String(linkHref);

            // 1. Update post URL
            await db.updatePostUrl(post.id, externalUrl);

            // 2. Fetch OpenGraph preview (non-blocking, don't fail on error)
            try {
              const linkPreview = await fetchOpenGraph(externalUrl);
              if (linkPreview) {
                await db.updatePostLinkPreview(post.id, linkPreview);
              }
            } catch {
              // Ignore fetch errors
            }

            // 3. Append link to content (like local posts do)
            const escapedUrl = externalUrl
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;');
            const linkHtml = `<p><a href="${escapedUrl}">${escapedUrl}</a></p>`;
            await db.updatePostContent(post.id, content + linkHtml);
          }
          continue;
        }

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
