# Refriend v3 Development Guide

A federated social network built with ActivityPub using Fedify and Hono.

## Prerequisites

- [Deno](https://deno.land/) (latest)
- [Node.js](https://nodejs.org/) (for frontend build)
- [Fedify CLI](https://fedify.dev/cli) (`deno install -A jsr:@fedify/cli`)

## Project Structure

```
refriend-v3/
├── api/              # Backend (Deno + Hono + Fedify)
│   ├── src/
│   │   ├── main.ts       # Entry point
│   │   ├── api.ts        # REST API routes
│   │   ├── federation.ts # ActivityPub federation
│   │   ├── activities.ts # Unified activity processing
│   │   └── db.ts         # SQLite database
│   └── schema.sql        # Database schema
├── web/              # Frontend (React + Vite)
│   ├── src/
│   └── dist/         # Built frontend (served by API)
└── dev.md            # This file
```

## Quick Start

### 1. Build the Frontend

```bash
cd web
npm install
npm run build
cd ..
```

### 2. Start the API Server

```bash
cd api
deno run --allow-all src/main.ts
```

Server runs at http://localhost:8000

### 3. Expose via Tunnel (for federation testing)

In a new terminal:

```bash
fedify tunnel 8000
```

This gives you a public URL like `https://abc123.lhr.life` that other fediverse servers can reach.

## Development Modes

### Local Only (no federation)

Good for UI development. Frontend hot-reloads, API proxies through Vite.

**Terminal 1 - API:**
```bash
cd api
deno run --allow-all src/main.ts
```

**Terminal 2 - Frontend dev server:**
```bash
cd web
npm run dev
```

Open http://localhost:5173

### With Federation (tunnel)

For testing ActivityPub federation with real fediverse servers.

**Terminal 1 - API:**
```bash
cd api
deno run --allow-all src/main.ts
```

**Terminal 2 - Tunnel:**
```bash
fedify tunnel 8000
```

Open the tunnel URL (shown in terminal output). The domain changes each time you restart the tunnel.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8000` | API server port |
| `DB_PATH` | `./data.db` | SQLite database path |
| `STATIC_DIR` | `../web/dist` | Built frontend directory |

## Database

SQLite database is created automatically at `api/data.db`.

To reset:
```bash
rm api/data.db
```

To inspect:
```bash
sqlite3 api/data.db ".tables"
sqlite3 api/data.db "SELECT * FROM users;"
```

## ActivityPub Endpoints

| Endpoint | Description |
|----------|-------------|
| `/.well-known/webfinger` | WebFinger discovery |
| `/users/{username}` | Actor profile (JSON-LD) |
| `/users/{username}/inbox` | Inbox (POST) |
| `/users/{username}/outbox` | Outbox (GET) |
| `/users/{username}/followers` | Followers collection |
| `/users/{username}/following` | Following collection |
| `/inbox` | Shared inbox |

## API Endpoints

All prefixed with `/api`:

### Auth
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Current user

### Posts
- `GET /api/posts` - Timeline (`?timeline=public|home`)
- `POST /api/posts` - Create post
- `GET /api/posts/:id` - Get post
- `DELETE /api/posts/:id` - Delete post
- `POST /api/posts/:id/like` - Like post
- `DELETE /api/posts/:id/like` - Unlike post

### Users
- `GET /api/users/:username` - User profile
- `GET /api/users/:username/followers` - Followers
- `GET /api/users/:username/following` - Following

### Social
- `POST /api/follow` - Follow user (`{ handle: "@user@domain" }`)
- `POST /api/unfollow` - Unfollow (`{ actor_id: 123 }`)
- `GET /api/search` - Search (`?q=@user@domain`)

### Tags
- `GET /api/tags/:tag` - Posts with hashtag

## Testing Federation

1. Start the server with a tunnel
2. From another fediverse server (e.g., Mastodon):
   - Search for `@username@your-tunnel-domain`
   - Follow the account
   - Posts should federate

## Architecture

All actions go through a unified ActivityPub pipeline:

```
Local API action ─┐
                  ├──► processActivity() ──► DB mutations
Remote inbox ─────┘           │
                              ├──► Store in activities table
                              └──► Deliver to remote (if outbound)
```

This matches how proper fediverse servers work - every action creates an Activity that gets stored and (for outbound) delivered.
