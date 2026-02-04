# Known Issues to Fix

## Missing Update handler for federated posts

No `.on(Update, ...)` inbox listener exists. When a remote user edits a post (content, sensitive flag, etc.), the change is silently ignored.

**File:** `api/src/domains/federation-v2/setup.ts` - add an Update handler alongside the existing Create handler.

## Hot feed pagination inconsistency

**Fixed:**
- Home hot feed (`/posts/hot`, `/timeline?sort=hot`) - now uses offset-based pagination

**Still broken:**
- User profile posts (`/actors/:id/posts?sort=hot`) - uses cursor `p.id < before`
- Hashtag posts (`/hashtag/:tag?sort=hot`) - uses cursor `p.id < before`
- Community posts (`/communities/:id/posts?sort=hot`) - uses cursor `p.id < before`

**Problem:** Cursor-based pagination (`WHERE id < X ORDER BY hot_score DESC`) doesn't work correctly with score-based sorting. Posts can be skipped or duplicated because the cursor is based on ID, not position in the sorted result.

**Solution:** Use offset-based pagination for hot-sorted feeds (pass `offset` query param, use SQL `OFFSET`).

**Files to update:**
- `api/src/db.ts`: `getPostsByActorWithActor`, `getPostsByHashtagWithActor`
- `api/src/domains/communities/repository.ts`: `getCommunityPosts`
- Corresponding routes and frontend API calls

TODO

do no allow less than 3 letters in handle
update guide for feeds

