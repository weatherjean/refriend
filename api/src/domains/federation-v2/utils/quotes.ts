/**
 * Quote Post Resolution
 *
 * Resolves quote targets (FEP-044f) and links them to the quoting post.
 */

import { Note } from "@fedify/fedify";
import type { Context } from "@fedify/fedify";
import type { DB } from "../../../db.ts";
import { fetchAndStoreNote } from "./notes.ts";

/**
 * Resolve a quote target from an ActivityPub Note and link it to the post.
 * This is a side-effect that runs after post creation — failures are silent
 * since the RE: text in content serves as natural fallback.
 */
export async function resolveAndLinkQuote(
  db: DB,
  ctx: Context<void>,
  domain: string,
  object: unknown,
  postId: number,
): Promise<void> {
  try {
    if (!(object instanceof Note)) return;

    const quoteUri = object.quoteUrl?.href;
    if (!quoteUri) return;

    // Check if we already have the quoted post locally
    let quotedPost = await db.getPostByUri(quoteUri);

    // If not found, try to fetch and store it
    if (!quotedPost) {
      const fetchedId = await fetchAndStoreNote(ctx, db, domain, quoteUri);
      if (fetchedId) {
        quotedPost = await db.getPostById(fetchedId);
      }
    }

    if (quotedPost) {
      await db.updatePostQuoteId(postId, quotedPost.id);
      console.log(`[Quote] Linked post ${postId} -> quoted post ${quotedPost.id} (${quoteUri})`);
    } else {
      console.log(`[Quote] Could not resolve quote target: ${quoteUri}`);
    }
  } catch (e) {
    console.log(`[Quote] Error resolving quote for post ${postId}:`, e);
  }
}
