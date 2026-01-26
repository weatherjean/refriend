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
    main.ts           # Entry point, server setup
    api.ts            # REST API routes (Hono)
    federation.ts     # ActivityPub actors and handlers (Fedify)
    db.ts             # Database queries and models
    activities.ts     # ActivityPub activity processing
    storage.ts        # File upload handling
    cache.ts          # Caching utilities
  schema.pg.sql       # PostgreSQL schema
web/
  src/                # React frontend
  dist/               # Built static files (served by Caddy in prod)
```

### Backend Patterns

- **Single-file modules:** Core logic consolidated in `api.ts`, `federation.ts`, `db.ts`
- **Fedify integration:** ActivityPub federation via `@fedify/fedify` library
- **Static serving:** In production, Caddy serves `web/dist/` and proxies API routes. In development, Vite serves frontend and proxies to API.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | - | PostgreSQL connection string |
| `PORT` | `8000` | API server port |
| `STATIC_DIR` | - | Optional: serve static files from this directory (not used when Caddy/Vite handles static) |
| `DENO_KV_PATH` | - | Path for persistent Deno KV storage (e.g., `/data/kv.sqlite`) |
