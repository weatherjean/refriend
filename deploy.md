# Deploy Log

Changes required when deploying the `dev-simpler` branch to production.

## Database Migrations

Migrations run automatically on app startup. The migration runner (`api/src/migrate.ts`) applies `.sql` files from `api/migrations/` in order, tracked by a `schema_migrations` table.

- **Existing databases** are auto-detected and migration 001 is marked as already applied.
- **New databases** get all migrations applied from scratch.
- To add a new migration, create `api/migrations/NNN_description.sql` and restart the app.

Previous ad-hoc migrations (Remove Communities, Post Types, Unified URLs) have already been applied to production and are no longer needed as separate files.

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
