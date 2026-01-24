/**
 * Search Service
 *
 * Business logic for searching users, communities, and posts.
 * Includes remote actor lookup via ActivityPub.
 */

import type { Context } from "@fedify/fedify";
import { isActor, lookupObject } from "@fedify/fedify";
import type { DB } from "../../db.ts";
import type { Actor } from "../../shared/types.ts";
import { persistActor } from "../federation/actors.ts";
import { sanitizeActor, type SanitizedActor } from "../users/types.ts";
import { enrichPostsBatch } from "../posts/service.ts";
import type { EnrichedPost } from "../posts/types.ts";
import type { CommunityDB } from "../communities/repository.ts";

export interface SearchResult {
  users: SanitizedActor[];
  posts: EnrichedPost[];
  postsLowConfidence: boolean;
}

/**
 * Perform a full search across users, communities, and posts.
 * Handles remote actor lookup via ActivityPub for handle-format queries.
 */
export async function search(
  ctx: Context<void>,
  db: DB,
  domain: string,
  query: string,
  options: {
    type?: "all" | "users" | "posts";
    handleOnly?: boolean;
    limit?: number;
    currentActorId?: number;
    currentUsername?: string;
    communityDb?: CommunityDB;
  } = {}
): Promise<SearchResult> {
  const { type = "all", handleOnly = false, limit = 20, currentActorId, currentUsername, communityDb } = options;

  let users: SanitizedActor[] = [];
  let posts: EnrichedPost[] = [];
  let postsLowConfidence = false;

  // If it looks like a handle, try to look it up via ActivityPub
  if (query.match(/^@?[\w.-]+@[\w.-]+$/)) {
    try {
      // Normalize handle format - ensure it starts with @
      const normalizedHandle = query.startsWith("@") ? query : `@${query}`;

      // Try direct URL lookup - do manual WebFinger
      const handleParts = normalizedHandle.match(/^@([^@]+)@(.+)$/);
      if (handleParts) {
        const [, username, handleDomain] = handleParts;

        try {
          const webfingerUrl = `https://${handleDomain}/.well-known/webfinger?resource=acct:${username}@${handleDomain}`;
          const wfResponse = await fetch(webfingerUrl, {
            headers: { "Accept": "application/jrd+json, application/json" },
          });

          if (wfResponse.ok) {
            const wfData = await wfResponse.json();
            const selfLink = wfData.links?.find((l: { rel: string; type?: string }) =>
              l.rel === "self" && l.type?.includes("activity")
            );

            if (selfLink?.href) {
              let documentLoader = ctx.documentLoader;

              // Use current user's identity to sign requests (for secure mode instances)
              if (currentUsername) {
                documentLoader = await ctx.getDocumentLoader({ identifier: currentUsername });
              } else {
                // Fallback: get any local user to sign requests
                const localUser = await db.getAnyLocalUser();
                if (localUser) {
                  documentLoader = await ctx.getDocumentLoader({ identifier: localUser.username });
                }
              }

              // Use lookupObject with the signed document loader
              const actor = await lookupObject(selfLink.href, {
                documentLoader,
                contextLoader: ctx.contextLoader,
              });

              if (actor && isActor(actor)) {
                const persisted = await persistActor(db, domain, actor);
                if (persisted) {
                  return {
                    users: [sanitizeActor(persisted, domain)],
                    posts: [],
                    postsLowConfidence: false,
                  };
                }
              }
            }
          }
        } catch (wfErr) {
          console.error("[search] WebFinger lookup failed:", wfErr);
        }
      }
    } catch (err) {
      console.error("[search] Remote actor lookup failed:", err);
    }
  }

  // Search local users/communities
  if (type === "all" || type === "users") {
    const actors = await db.searchActors(query, limit, handleOnly);
    users = actors.map((a) => sanitizeActor(a, domain));
  }

  // Search posts (fuzzy search with pg_trgm)
  if ((type === "all" || type === "posts") && query.length >= 3) {
    const result = await db.searchPosts(query, limit);
    posts = await enrichPostsBatch(db, result.posts, currentActorId, domain, communityDb);
    postsLowConfidence = result.lowConfidence;
  }

  return { users, posts, postsLowConfidence };
}
