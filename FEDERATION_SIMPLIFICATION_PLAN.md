# Federation Simplification Plan

## Overview

This document compares your current federation implementation against the standard Fedify tutorial patterns and identifies custom layers that should be removed or simplified.

## Current Architecture vs Standard Fedify

### Your Current Structure (Complex)
```
Inbox Handler
    └── processActivity(ctx, db, domain, activity, "inbound")
            └── processCreate/processFollow/processLike/etc.
                    ├── Handle business logic
                    ├── Persist data
                    └── Send response activities

Route Handler (outbound)
    └── processActivity(ctx, db, domain, activity, "outbound", username)
            └── Serialize activity to JSON
            └── Store in activities table
            └── processCreate/processFollow/etc.
                    └── safeSendActivity()
```

### Standard Fedify Pattern (Simple)
```
Inbox Handler (.on(Follow, ...))
    ├── Validate activity
    ├── Persist to database
    └── ctx.sendActivity() for responses (e.g., Accept)

Route Handler (outbound)
    ├── Create activity
    └── ctx.sendActivity() directly

Outbox Dispatcher
    └── Query posts from DB, wrap in Create on-the-fly
```

---

## Issues to Address

### 1. The `processActivity` Orchestrator Layer (REMOVE)

**File:** `api/src/domains/federation/processor.ts`

**Problem:** Every inbox handler calls:
```typescript
.on(Create, async (ctx, create) => {
  await processActivity(ctx, db, DOMAIN, create, "inbound");
})
```

This adds a layer that:
- Checks for duplicates (Fedify already does this with `withIdempotency`)
- Routes to the actual handler
- Stores activity JSON (not needed for inbound)

**Standard pattern:** Handle directly in the `.on()` callback.

**Fix:** Inline the handler logic directly in each `.on()` callback.

---

### 2. Direction Parameter (`"inbound" | "outbound"`) (REMOVE)

**Problem:** Each handler has branches:
```typescript
if (direction === "outbound" && localUsername) {
  // outbound logic
}
if (direction === "inbound") {
  // inbound logic
}
```

**Standard pattern:**
- Inbox handlers ONLY handle inbound
- Route handlers create activities and call `ctx.sendActivity()` directly

**Fix:** Split inbound and outbound logic completely.

---

### 3. Storing Activities in `activities` Table (REMOVE)

**File:** `processor.ts:159-191`

**Problem:** You serialize and store outbound activities:
```typescript
const storedActivity = await db.storeActivity({
  uri: activityUri,
  type: getActivityType(activity),
  raw_json: rawJson,
  ...
});
```

Then your outbox dispatcher parses them back:
```typescript
const jsonLd = JSON.parse(a.raw_json);
return await Activity.fromJsonLd(jsonLd, {...});
```

**Standard pattern:** Outbox dispatcher generates activities on-the-fly from posts:
```typescript
const posts = await db.getPostsPaginated(actor.id, limit, offset);
const items = posts.map(p => new Create({
  actor: ctx.getActorUri(identifier),
  object: new Note({ id: new URL(p.uri), content: p.content, ... })
}));
```

**Fix:** Remove activities table storage. Generate activities from posts table in outbox dispatcher.

---

### 4. `safeSendActivity` Wrapper (SIMPLIFY)

**File:** `utils/send.ts`

**Problem:** Wraps every send with try/catch for localhost:
```typescript
try {
  await ctx.sendActivity(sender, recipients, activity, options);
} catch (e) {
  if (errMsg.includes("localhost")) { ... }
}
```

**Standard pattern:** Let errors propagate. Use Fedify's retry policies.

**Fix:** Remove wrapper or use only in development mode.

---

### 5. `fetchAndStoreNote` for Parent Posts (REVIEW)

**File:** `utils/notes.ts`

**Current behavior:** When receiving a reply, if the parent post isn't found, fetch it from remote.

**This is a feature choice**, not strictly wrong. But it adds 270 lines of complexity. Consider:
- Storing just the URI reference (simpler, like Mastodon)
- Fetching on-demand when a user views the thread (lazy loading)

---

### 6. Community Moderation in Create Handler (MOVE)

**File:** `handlers/create.ts:369-436`

**Problem:** 100+ lines of community moderation logic embedded in federation handler.

**Fix:** Move to a separate service/hook that runs after post creation.

---

## Simplified Implementation Plan

### Phase 1: Remove processActivity Orchestrator

**Before (current):**
```typescript
// setup.ts
.on(Follow, async (ctx, follow) => {
  await processActivity(ctx, db, DOMAIN, follow, "inbound");
})

// processor.ts - dispatches to handler
// handlers/follow.ts - actual logic
```

**After (standard Fedify):**
```typescript
// setup.ts - all logic here
.on(Follow, async (ctx, follow) => {
  const follower = await follow.getActor();
  if (!follower || !isActor(follower)) return;

  const followerActor = await persistActor(db, domain, follower);
  if (!followerActor) return;

  const targetUri = follow.objectId?.href;
  if (!targetUri) return;

  const targetActor = await db.getActorByUri(targetUri);
  if (!targetActor) return;

  // Store follow
  await db.addFollow(followerActor.id, targetActor.id, 'accepted');

  // Send Accept
  if (targetActor.user_id || targetActor.actor_type === 'Group') {
    const username = extractUsername(targetActor.handle);
    await ctx.sendActivity(
      { identifier: username },
      follower,
      new Accept({
        id: new URL(`https://${domain}/#accepts/${crypto.randomUUID()}`),
        actor: ctx.getActorUri(username),
        object: follow,
      })
    );
  }
})
```

### Phase 2: Remove Activities Storage

**Before (current outbox dispatcher):**
```typescript
const activities = await db.getOutboxActivitiesPaginated(actor.id, limit, offset);
const items = await Promise.all(
  activities.map(async (a) => {
    const jsonLd = JSON.parse(a.raw_json);
    return await Activity.fromJsonLd(jsonLd, {...});
  })
);
```

**After (standard Fedify):**
```typescript
const posts = await db.getPostsPaginated(actor.id, limit, offset);
const items = posts.map(p => new Create({
  id: new URL(`${p.uri}#activity`),
  actor: ctx.getActorUri(identifier),
  published: parseTimestamp(p.created_at),
  object: new Note({
    id: new URL(p.uri),
    attributedTo: ctx.getActorUri(identifier),
    content: p.content,
    published: parseTimestamp(p.created_at),
  })
}));
```

### Phase 3: Simplify Outbound Sending

**Before (route handler with processActivity):**
```typescript
// Route handler
const followActivity = new Follow({...});
await processActivity(ctx, db, domain, followActivity, "outbound", user.username);
// processActivity -> processFollow -> safeSendActivity
```

**After (direct send):**
```typescript
// Route handler
const followActivity = new Follow({...});
await db.addFollow(followerActor.id, targetActor.id, 'pending');
await ctx.sendActivity(
  { identifier: user.username },
  { id: new URL(targetActor.uri), inboxId: new URL(targetActor.inbox_url) },
  followActivity
);
```

---

## Files to Modify/Remove

### Remove Entirely:
- `domains/federation/processor.ts` - orchestrator layer
- `domains/federation/inbox.ts` - just re-exports
- `domains/federation/outbox.ts` - just re-exports
- `domains/federation/handlers/` - all files, inline into setup.ts

### Simplify Significantly:
- `domains/federation/setup.ts` - inline inbox handlers here
- `api/src/activities.ts` - no longer needed for processActivity

### Keep (with minor changes):
- `domains/federation/actor-persistence.ts` - still useful
- `domains/federation/utils/content.ts` - sanitization still needed
- `domains/federation/utils/send.ts` - may simplify or remove

---

## Migration Steps

1. **Start with Follow handler** - simplest activity, good test case
2. **Test with remote Mastodon** - verify follows work both directions
3. **Move to Create handler** - more complex but same pattern
4. **Update outbox dispatcher** - generate activities from posts
5. **Remove activities table storage** - clean up database
6. **Remove orchestrator files** - clean up codebase

---

## Expected Outcome

**Before:** ~1500 lines across 15+ files for federation
**After:** ~400-500 lines in 3-4 files:
- `setup.ts` - all dispatchers and inbox handlers
- `actor-persistence.ts` - remote actor storage
- `utils/content.ts` - content sanitization

**Benefits:**
- Matches Fedify documentation exactly
- Easier to debug (less indirection)
- Easier to update when Fedify updates
- Less code to maintain
