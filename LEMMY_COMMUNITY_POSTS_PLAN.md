# Plan: Submit Posts to Lemmy Communities (Page Type Support)

## Problem
Currently, all outgoing posts are sent as ActivityPub `Note` objects. Lemmy communities expect top-level posts as `Page` objects with a required `name` (title) field. The app can already **receive** Page/Article objects from Lemmy (inbox handler at `setup.ts:562-573`), and already has `sendToCommunity()` for manual signing, but it cannot **create** Page-type posts to submit to communities.

## What Lemmy Expects

A `Create(Page)` activity sent to a community inbox:
- **`Page.name`** (required) — the post title
- **`Page.content`** — rendered HTML body (optional for link-only posts)
- **`Page.source`** — `{ content: "markdown text", mediaType: "text/markdown" }` (preserves original)
- **`Page.audience`** — the community Group URI
- **`Page.sensitive`** — boolean
- **`Page.url`** — external link (for link posts)
- **`Page.attachment`** — media/images
- **`to`/`cc`** — must include community URI and `as:Public` (full URI, not compact)
- No follow required to post — just send to community inbox with valid HTTP signature

## Changes Required

### 1. Database: Add `title` and `type` columns to `posts` table

**File:** `api/migrations/001_initial_schema.sql` + new migration SQL file

```sql
ALTER TABLE posts ADD COLUMN title TEXT;
ALTER TABLE posts ADD COLUMN type TEXT NOT NULL DEFAULT 'note' CHECK (type IN ('note', 'page'));
```

- `title`: nullable, used for Page-type posts (Lemmy post titles)
- `type`: `'note'` (default, Mastodon-style) or `'page'` (Lemmy-style)

### 2. TypeScript Types: Update Post interface

**File:** `api/src/shared/types.ts`

Add `title?: string | null` and `type: 'note' | 'page'` to the `Post` interface.

### 3. Database Queries: Update createPost and retrieval queries

**File:** `api/src/db.ts`

- `createPost()` — accept `title` and `type` fields, include in INSERT
- All SELECT queries for posts — include `title` and `type` in returned columns (they already use `SELECT *` so this may be automatic, but verify)

### 4. Post Creation API: Accept `title`, `community` fields + synchronous community delivery

**File:** `api/src/domains/posts/routes.ts`

- Add `title?: string` and `community?: string` (community URI or handle) to the POST `/posts` request body
- When `community` is provided:
  - Set `type: 'page'`
  - Require `title` (return 400 if missing)
  - Look up the community actor (resolve via WebFinger/ActivityPub if not already stored)
  - Set `addressed_to` to the community URI
  - Set `audienceUri` to the community URI
- Build a Fedify `Page` object instead of `Note` when type is `'page'`:
  ```typescript
  import { Page } from "@fedify/fedify";
  const page = new Page({
    id: new URL(noteUri),
    attribution: ctx.getActorUri(user.username),
    name: title,
    content: safeContent,
    source: { content: rawContent, mediaType: "text/markdown" },
    to: PUBLIC_COLLECTION,
    ccs: ccRecipients,
    url: linkUrl ? new URL(linkUrl) : new URL(noteUrl),
    published: Temporal.Now.instant(),
    sensitive: sensitive ?? false,
    audience: audienceUri,
    attachments: noteAttachments.length > 0 ? noteAttachments : undefined,
    tags: noteTags.length > 0 ? noteTags : undefined,
  });
  ```
- Wrap in `Create` activity and send to community via `sendToCommunity()`
- **Synchronous community delivery:** Community submission is done synchronously (user waits for the result). If the community inbox returns a non-2xx status, delete the local post and return an error to the frontend (e.g. "Community rejected the post", "Community not found"). This keeps things transparent — no orphan posts that silently failed to federate.
- Follower delivery still happens async in the background as usual — only the community submission blocks the response.
- Also send to followers as usual on success

### 5. Federation: Update outbox and object dispatchers

**File:** `api/src/domains/federation-v2/setup.ts`

- **Object dispatcher** (line ~513): Check `post.type` — return `Page` with `name` field when type is `'page'`, else `Note` as before
- **Outbox dispatcher** (line ~456): Same — generate `Create(Page)` or `Create(Note)` based on `post.type`
- **Create inbox handler** (line ~559): Already handles incoming Page — but update to store `title` and `type: 'page'` in DB instead of prepending title to content as HTML

### 6. Post Service: Update enrichment

**File:** `api/src/domains/posts/service.ts`

- Include `title` and `type` in enriched post output (should flow through automatically if Post type is updated)

### 7. Frontend: Community post creation UI

**File:** `web/src/` (post creation component)

- Add a "Post to Community" mode/option in the compose UI
- When selected:
  - Show a community search/input field
  - Show a required "Title" field
  - Body content becomes optional (link posts can be title-only)
- Submit with `{ title, content, community, ... }` to POST `/posts`
- Display titles on Page-type posts in feeds

### 8. Community Search/Discovery

**File:** `api/src/domains/search/` or new route

- Add ability to search for/resolve remote Lemmy communities (Group actors)
- The existing search may already handle this via WebFinger lookup — verify and extend if needed
- Need to resolve `!community@instance` format (Lemmy community handle syntax)

## `sendToCommunity()` Updates

**File:** `api/src/domains/federation-v2/utils/send.ts`

Current `sendToCommunity()` returns `void` and logs errors. Update to:
- Return a result object: `{ ok: boolean; status?: number; error?: string }`
- Caller (post creation route) uses this to decide whether to keep or delete the local post
- On success: post stays, follower delivery proceeds
- On failure: delete the local post, return error to user

## Implementation Order

1. Database migration (add columns)
2. Update TypeScript types
3. Update db.ts queries
4. Update `sendToCommunity()` to return success/failure
5. Update post creation route (backend) with sync community delivery
6. Update federation dispatchers (outbox + object)
7. Update inbox handler to store title/type properly
8. Frontend compose UI changes
9. Community search/resolution
10. End-to-end testing with a real Lemmy instance via ngrok

## Verification

1. Create a Page post via API with title + community URI
2. Verify the `Create(Page)` activity is properly formed (correct JSON-LD with `name`, `audience`, full public URI)
3. Send to a test Lemmy community via ngrok and confirm it appears
4. Test failure case: send to invalid community, verify post is deleted and error returned
5. Verify incoming Lemmy posts now store title/type correctly instead of HTML-prepending
6. Verify existing Note posts are unaffected
7. Frontend: compose a community post, verify title field appears, post submits correctly
