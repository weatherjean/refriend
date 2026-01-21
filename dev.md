# Riff Development Guide

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) + Docker Compose
- [Node.js](https://nodejs.org/) (for frontend build)
- [ngrok](https://ngrok.com/) (for federation testing)

## Quick Start

### 1. Build frontend
```bash
cd web && npm install && npm run build && cd ..
```

### 2. Start everything
```bash
docker compose up --build
```

This starts:
- PostgreSQL database (port 5432)
- API server with hot reload (port 8000)

### 3. Expose for federation
```bash
ngrok http 8000
```

Use the ngrok URL for federation testing.

## Development Workflow

```bash
# Terminal 1: Start services
docker compose up

# Terminal 2: Tunnel for federation
ngrok http 8000

# Terminal 3: Frontend dev (optional, for hot reload)
cd web && npm run dev
```

**API changes**: Auto-reload via `--watch` flag
**Frontend changes**: Run `npm run build` in web/, or use `npm run dev` for hot reload

## Rebuild

```bash
# After changing dependencies or Dockerfile
docker compose up --build

# Reset database
docker compose down -v
docker compose up
```

## Database

Connect directly:
```bash
psql postgres://riff:riff@localhost:5432/riff
```

Or via Docker:
```bash
docker compose exec db psql -U riff
```

## Project Structure

```
riff/
├── api/                 # Backend (Deno + Hono + Fedify)
│   ├── src/
│   │   ├── main.ts      # Entry point
│   │   ├── api.ts       # REST API routes
│   │   ├── federation.ts # ActivityPub
│   │   └── db.ts        # PostgreSQL database
│   └── schema.pg.sql    # Database schema
├── web/                 # Frontend (React + Vite)
│   └── dist/            # Built frontend
├── docker-compose.yml   # Development environment
└── dev.md               # This file
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | - | PostgreSQL connection string |
| `PORT` | `8000` | API server port |
| `STATIC_DIR` | `../web/dist` | Frontend static files |

## Testing Federation

1. Start services: `docker compose up`
2. Start tunnel: `ngrok http 8000`
3. From Mastodon, search for `@username@your-ngrok-url.ngrok-free.app`
