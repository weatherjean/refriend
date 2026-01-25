# Infrastructure Plan: Scaleway

## Base Setup (~€25/month)

| Service | Spec | Cost |
|---------|------|------|
| **Managed PostgreSQL** | DB-DEV-S (2 vCPU, 2GB) + 10GB storage | ~€12 |
| **App Server** | PLAY2-PICO (1 vCPU, 2GB) + Docker InstantApp | ~€10 |
| **Object Storage** | 50GB One-Zone (S3-compatible) | ~€0.50 |
| **Transactional Email** | 10k emails/month | ~€2.50 |

## Architecture

```
        ┌─────────────────────────────────────┐
        │           PLAY2-PICO                │
        │  ┌───────┬─────────┬──────────┐     │
        │  │ Caddy │ Web API │ Worker   │     │
        │  │ :443  │  :8000  │          │     │
        │  └───┬───┴────┬────┴────┬─────┘     │
        └──────┼────────┼─────────┼───────────┘
   HTTPS       │        │         │
   ◄───────────┘        └────┬────┘
                             ▼
                      ┌──────────────┐
                      │  Managed DB  │
                      │   DB-DEV-S   │
                      └──────────────┘
```

- **Caddy** handles HTTPS with automatic Let's Encrypt certificates
- **Web API** and **Worker** run as separate containers on same server
- Worker handles outbound ActivityPub delivery (inbox scales with web server)
- Media uploads go to Object Storage (S3-compatible)
- Password reset emails via Scaleway Transactional Email

## Deployment

### Initial Setup (Scaleway Console)

1. Create **Managed PostgreSQL** (DB-DEV-S)
2. Create **Instance** (PLAY2-PICO, select Docker InstantApp)
3. Create **Object Storage** bucket
4. Enable **Transactional Email**
5. Point DNS A record to instance IP

### First Deploy

```bash
ssh root@your-server
git clone https://github.com/you/riff.git
cd riff
cp .env.example .env
# Edit .env with DB connection string, S3 creds, etc.
docker compose -f docker-compose.prod.yml up -d
```

### Updates

```bash
# From your local machine
ssh root@your-server "cd riff && ./deploy.sh"
```

Or automate with GitHub Actions on push to main.

### deploy.sh (on server)

```bash
#!/bin/bash
set -e
git pull
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
docker image prune -f
echo "Deployed at $(date)"
```

~5-10 seconds downtime during deploy. Fine for now.

### Production Docker Compose

```yaml
# docker-compose.prod.yml
services:
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
    depends_on:
      - api

  api:
    build: ./api
    restart: unless-stopped
    env_file: .env
    command: deno run --allow-all src/main.ts

  worker:
    build: ./api
    restart: unless-stopped
    env_file: .env
    command: deno run --allow-all src/worker.ts

volumes:
  caddy_data:
```

### Caddyfile

```
yourdomain.com {
    reverse_proxy api:8000
}
```

That's it. Caddy handles SSL automatically.

## Capacity

- **Users with app open:** 500-2,000 (not all actively requesting)
- **Active requests/sec:** 50-100 sustained, 200+ bursts
- **Registered users:** 5,000-10,000
- **Posts/day:** 1,000-2,000

Note: "100 concurrent users" = 100 users making requests *at the same instant*, not 100 users with the app open. Normal browsing generates ~1 request every few seconds per user.

## Database Scaling

When upgrading the database tier, update `DB_POOL_SIZE` in docker-compose.prod.yml:

| DB Tier | Cost | Max Connections | `DB_POOL_SIZE` |
|---------|------|-----------------|----------------|
| DB-DEV-S | ~€12 | ~50 | 40 |
| DB-DEV-M | ~€24 | ~100 | 80 |
| DB-GP-XS | ~€48 | ~200 | 150 |

Then restart: `docker compose -f docker-compose.prod.yml up -d`

## Why Scaleway

- EU-based (French company, GDPR compliant)
- No egress fees for first 75GB/month
- Native transactional email service
- Managed PostgreSQL with automated backups
- Docker InstantApp for zero-setup deployment
