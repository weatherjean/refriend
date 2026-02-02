# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

### Quick Start
```bash
cd web && npm install && npm run build && cd ..
docker compose up --build
```

### Backend (Deno + Hono + Fedify)
```bash
# Via Docker (recommended)
docker compose up              # Start Postgres + API with hot reload
docker compose up --build      # Rebuild after dependency changes
docker compose down -v         # Reset database

# Direct Deno (in api/)
deno task dev                  # Run with hot reload
deno task start                # Run production
deno task seed                 # Seed database
deno task test                 # Run integration tests (requires running Postgres)
```

### Frontend (React + Vite)
```bash
cd web
npm install
npm run dev                    # Dev server with hot reload
npm run build                  # Production build to dist/
```

### Database
```bash
psql postgres://riff:riff@localhost:5432/riff
docker compose exec db psql -U riff
```

### Federation Testing
```bash
# Point ngrok to Vite dev server (includes UI)
ngrok http 5173
# Search from Mastodon: @username@your-ngrok-url.ngrok-free.app
```

## Architecture Overview

**Riff** is an ActivityPub/Fediverse social application. Users can create posts, follow others (locally and across the fediverse), and interact via the ActivityPub protocol.

### Tech Stack
- **Backend:** Deno, Hono framework, Fedify (ActivityPub), PostgreSQL
- **Frontend:** React, TypeScript, Vite

### Directory Structure
```
api/
  src/
    main.ts                           # Entry point, server setup
    api-routes.ts                     # REST API route aggregator (Hono)
    db.ts                             # Database queries and models
    storage.ts                        # File upload handling (S3/MinIO)
    cache.ts                          # Caching utilities (Deno KV)
    logger.ts                         # Logging
    seeder.ts                         # Database seeder
    domains/
      index.ts                        # Central export for all domains
      federation-v2/
        setup.ts                      # Fedify federation setup (dispatchers + inbox handlers)
        utils/actor.ts                # Remote actor persistence
      federation-v1-old/              # Legacy federation code (being phased out)
      users/                          # User auth, profiles, registration
      posts/                          # Post CRUD, feeds, enrichment
      social/                         # Follows, blocks, social graph
      notifications/                  # Notification CRUD
      search/                         # Search across actors and posts
      tags/                           # Hashtag routes
      push/                           # Web push notifications
    shared/types.ts                   # Shared TypeScript types
    migrate.ts                        # Sequential migration runner
  migrations/
    001_initial_schema.sql            # Base PostgreSQL schema
web/
  src/                                # React frontend (Vite + TypeScript)
  dist/                               # Built static files (served by Caddy in prod)
Caddyfile                             # Production Caddy config (content negotiation + SPA)
Caddyfile.dev                         # Dev Caddy config (proxies to Vite + API)
docker-compose.yml                    # Dev stack: Postgres, MinIO, API, Vite, Caddy
```

### Backend Patterns

- **Domain modules:** Code organized into `api/src/domains/` by feature area, each with routes, services, and repository files
- **Fedify integration:** ActivityPub federation via `@fedify/fedify` — inbox handlers and dispatchers in `federation-v2/setup.ts`
- **URL scheme:** Unified `/@username` and `/@username/posts/<uuid>` URLs with content negotiation (Caddy routes AP requests to backend, HTML requests to SPA)
- **Static serving:** In production, Caddy serves `web/dist/` and proxies API + AP routes. In development, Caddy proxies to Vite dev server and API container

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | - | PostgreSQL connection string |
| `PORT` | `8000` | API server port |
| `STATIC_DIR` | - | Optional: serve static files from this directory (not used when Caddy/Vite handles static) |
| `DENO_KV_PATH` | - | Path for persistent Deno KV storage (e.g., `/data/kv.sqlite`) |

### Browsing JSR (Deno) Package Source

JSR package landing pages (e.g. `https://jsr.io/@fedify/testing`) return 404. To read source for a JSR dependency:

1. Find the exact version in `api/deno.lock` or run `deno info jsr:@scope/pkg@version`
2. Source files are at `https://jsr.io/@scope/pkg/VERSION/src/FILE.ts` — e.g. `https://jsr.io/@fedify/testing/1.10.2/src/mod.ts`
3. Or read directly from the Deno cache: `deno info jsr:@scope/pkg@version` prints the local cache path, then read that file
