# Deploy Log

Changes required when deploying the `dev-simpler` branch to production.

## Database Migrations

Run these in order against the production database.

### 1. Remove Communities

Drops all community-related tables, columns, and local community actors. Remote Group actors (e.g. Lemmy communities) are preserved.

```bash
psql $DATABASE_URL -f api/MIGRATION_REMOVE_COMMUNITIES.sql
```

**What it does:**
- Drops tables: `community_mod_logs`, `community_pinned_posts`, `community_posts`, `community_bans`, `community_admins`
- Drops columns: `posts.community_id`, `actors.require_approval`, `actors.created_by`
- Deletes local community actors (`actor_type = 'Group' AND created_by IS NOT NULL`)
- Drops related indexes

**Review:** The migration runs in a transaction and prints the count of actors to be deleted. Review before committing.

### 2. Unify URL Structure (`/users/` -> `/@`)

Updates local actor and post URIs/URLs from `/users/username` to `/@username` format.

```bash
psql $DATABASE_URL -f api/MIGRATION_UNIFIED_URLS.sql
```

**What it does:**
- Updates local post URIs: `/users/wj/posts/...` -> `/@wj/posts/...`
- Updates local post URLs to match URIs
- Updates local actor URIs and inbox URLs
- Only affects local actors (`user_id IS NOT NULL`), remote actors are untouched

## Caddy Configuration

The production `Caddyfile` has been updated with content negotiation for ActivityPub:

- `/@*` paths with `Accept: application/activity+json` or `application/ld+json` -> proxied to API backend
- All other `/@*` paths -> served as SPA (index.html fallback)
- `/api/*`, `/.well-known/*`, `/nodeinfo/*`, `/inbox`, `/health` -> API backend (unchanged)

**Action:** Replace the production Caddyfile with the updated version and reload Caddy.

## Docker Compose

The dev `docker-compose.yml` now includes:

- **MinIO** service for S3-compatible local storage (ports 9000/9001)
- **minio-init** service to create the `riff-uploads` bucket on startup
- **web** service running Vite dev server (port 5173)
- **caddy** service using `Caddyfile.dev` for dev content negotiation (port 9999)

These are dev-only changes. Production docker/compose should already have S3 configured via env vars.

## Frontend Build

Rebuild the frontend before deploying:

```bash
cd web && npm install && npm run build
```

Key frontend changes:
- Community pages and components removed entirely
- New `/@username` and `/@username/posts/:id` routes
- Following page added
- API client simplified (community endpoints removed)

## Code Changes Summary

- **Communities removed:** All community/group management code deleted (~4800 lines removed)
- **URL unification:** Single `/@username` URL scheme with content negotiation instead of separate `/users/` and `/@` paths
- **Federation:** Inbox handlers and dispatchers consolidated in `federation-v2/setup.ts`
- **Frontend:** Community UI removed, routes updated, Following page added
