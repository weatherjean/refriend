# Task: Unify URL Structure with Content Negotiation

## Problem

We currently have separate URL patterns for the same resources:

- **ActivityPub URI** (machine): `https://domain/users/wj/posts/<uuid>`
- **Web URL** (human): `https://domain/@wj/posts/<uuid>`
- **Frontend route**: `/posts/<uuid>`

This causes several issues:
1. "View original" on local posts links to `/@wj/posts/<uuid>` which the SPA doesn't route correctly (the frontend uses `/posts/<uuid>`)
2. Three different URLs for the same post is confusing and unnecessary
3. Other fediverse software (Mastodon, Lemmy, etc.) uses a single canonical URL per resource that serves HTML to browsers and JSON-LD to ActivityPub clients via content negotiation

## How Other Fediverse Software Does It

Mastodon, Pleroma, etc. use **content negotiation** on a single URL:
- Browser requests `Accept: text/html` → gets the web page
- AP client requests `Accept: application/activity+json` → gets the JSON-LD object

This means one URL serves both purposes. Caddy can handle the routing based on the `Accept` header.

## Proposed URL Scheme

| Resource | URL |
|----------|-----|
| Actor | `/@username` |
| Post | `/@username/posts/<uuid>` |
| ActivityPub actor | same, with `Accept: application/activity+json` |
| ActivityPub note | same, with `Accept: application/activity+json` |

## Implementation

### 1. Caddy — Content negotiation routing

Update `Caddyfile` to route based on `Accept` header:

```caddyfile
# ActivityPub requests (JSON-LD) → backend API
@activitypub {
    header Accept *application/activity+json*
    path /@*
}
handle @activitypub {
    reverse_proxy api:8000
}

# Also route /@username to backend for webfinger/AP discovery
@apactor {
    header Accept *application/ld+json*
    path /@*
}
handle @apactor {
    reverse_proxy api:8000
}

# HTML requests to /@* → SPA (frontend handles rendering)
# (falls through to existing SPA handler)
```

### 2. Backend — Serve AP objects at new URLs

- Add route handlers for `/@:username` and `/@:username/posts/:id` that return AP JSON-LD
- These replace (or alias) the current `/users/:username` AP endpoints
- Keep `/users/*` as aliases for backwards compatibility with existing federated followers

### 3. Backend — Update URI/URL generation

In `api/src/domains/posts/routes.ts` (line ~448-450):
```typescript
// Before:
const noteUri = `https://${domain}/users/${user.username}/posts/${noteId}`;
const noteUrl = `https://${domain}/@${user.username}/posts/${noteId}`;

// After (single URL):
const noteUri = `https://${domain}/@${user.username}/posts/${noteId}`;
const noteUrl = noteUri; // Same URL, content-negotiated
```

Similarly for actor URIs in federation setup.

### 4. Frontend — Update routes

In `App.tsx`, ensure `/@:username/posts/:id` works as a route (currently uses `/posts/:id`). Options:
- Add `/@:username/posts/:id` route that extracts the post UUID
- Or redirect `/@username/posts/<id>` to `/posts/<id>` in the SPA router

### 5. Migration concerns

- Existing federated followers know actors by `/users/username` URIs
- Must keep `/users/*` endpoints working (redirect or alias to `/@*`)
- Existing posts in remote instances' databases have the old URIs — these can't be changed
- New posts get the new URI format; old posts keep working via the alias

## Order of Operations

1. Add content-negotiation routes in Caddy
2. Add `/@username` and `/@username/posts/:id` AP handlers in backend (alongside existing `/users/*`)
3. Update URI/URL generation for new posts to use `/@` format
4. Update frontend routes to handle `/@username/posts/:id`
5. Keep `/users/*` endpoints indefinitely for backwards compat

## Notes

- Fedify's `getActorUri()` generates `/users/:username` by convention — we may need to customize this or add a redirect layer
- WebFinger (`/.well-known/webfinger`) already works and doesn't need changes
- The `@` prefix convention is widely understood in the fediverse
