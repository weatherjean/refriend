/**
 * Federation Notes Utilities
 *
 * Functions for fetching and storing remote notes.
 */

import {
  Document,
  Image,
  Link,
  Note,
  Article,
  Page,
  isActor,
  type Context,
} from "@fedify/fedify";
import type { DB } from "../../../db.ts";
import { persistActor } from "../actor-persistence.ts";
import { extractHashtags, validateAndSanitizeContent } from "./content.ts";

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
    const docType = (document as any)?.type || (document as any)?.['@type'];
    const typeStr = Array.isArray(docType) ? docType[0] : docType;

    let note: Note | Article | Page | null = null;
    let titlePrefix: string | null = null;

    if (typeStr === 'Article') {
      note = await Article.fromJsonLd(document, { documentLoader: docLoader, contextLoader: ctx.contextLoader });
    } else if (typeStr === 'Page') {
      note = await Page.fromJsonLd(document, { documentLoader: docLoader, contextLoader: ctx.contextLoader });
    } else if (typeStr === 'Note') {
      note = await Note.fromJsonLd(document, { documentLoader: docLoader, contextLoader: ctx.contextLoader });
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
        // Handle Link attachments (Lemmy/kbin external URLs) - only for Page/Article, not Note
        if (att instanceof Link && (note instanceof Page || note instanceof Article)) {
          const linkHref = att.href;
          if (linkHref) {
            // Use the Link href as the post's external URL (overrides object.url for link posts)
            const externalUrl = linkHref instanceof URL ? linkHref.href : String(linkHref);
            await db.updatePostUrl(post.id, externalUrl);
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
