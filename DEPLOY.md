# Riff Deployment Guide

Complete guide to deploying Riff on Scaleway (~€25/month).

## Architecture

```
                    Internet
                       │
                       ▼
              ┌────────────────┐
              │     Caddy      │  ← Automatic HTTPS via Let's Encrypt
              │   :80 / :443   │
              └───────┬────────┘
                      │
              ┌───────▼────────┐
              │    Riff API    │  ← Deno + Hono + Fedify
              │     :8000      │
              └───────┬────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
┌──────────────┐ ┌─────────┐ ┌─────────────┐
│ Managed      │ │ Object  │ │ Transact.   │
│ PostgreSQL   │ │ Storage │ │ Email       │
│ (DB-DEV-S)   │ │ (S3)    │ │             │
└──────────────┘ └─────────┘ └─────────────┘
```

## Cost Breakdown (~€25/month)

| Service | Spec | Monthly Cost |
|---------|------|--------------|
| Managed PostgreSQL | DB-DEV-S (2 vCPU, 2GB, 10GB storage) | ~€12 |
| App Server | PLAY2-PICO (1 vCPU, 2GB RAM) | ~€10 |
| Object Storage | 50GB One-Zone | ~€0.50 |
| Transactional Email | 10k emails/month | ~€2.50 |

**Realistic Capacity:**
- Users with app open: 500-2,000
- Registered users: 5,000-10,000
- Requests/sec: 50-100 sustained
- Database is typically the bottleneck, not the API

**Capacity:** 50-100 concurrent users, 1,000-5,000 registered users

---

## Step 1: Create Scaleway Resources

### 1.1 Managed PostgreSQL

1. Go to **Scaleway Console** → **Managed Databases** → **Create Instance**
2. Select:
   - Engine: **PostgreSQL 16**
   - Node type: **DB-DEV-S** (2 vCPU, 2GB RAM)
   - Storage: **10GB Block Storage** (expandable later)
   - Region: **Paris** (fr-par) or your preferred region
3. Set database name: `riff`
4. Save the connection string - you'll need it:
   ```
   postgres://username:password@host:port/riff?sslmode=require
   ```

### 1.2 Compute Instance

1. Go to **Instances** → **Create Instance**
2. Select:
   - Image: **Docker** (under InstantApps)
   - Type: **PLAY2-PICO** (1 vCPU, 2GB RAM)
   - Storage: **20GB Block Storage** (default is fine)
   - Region: Same as database
3. Add your SSH key
4. Note the public IP address

### 1.3 Object Storage

1. Go to **Object Storage** → **Create Bucket**
2. Settings:
   - Name: `riff-uploads` (or your choice)
   - Region: Same as other resources
   - Visibility: **Private** (we'll use signed URLs)
3. Create **API Key** for S3 access:
   - Go to **IAM** → **API Keys** → **Generate API Key**
   - Save the Access Key and Secret Key

### 1.4 Transactional Email

1. Go to **Transactional Email** → **Get Started**
2. Add and verify your domain (requires DNS TXT records)
3. Create an API key for sending (or use your existing one)
4. Note the sender email: `noreply@yourdomain.com`

### 1.5 DNS Configuration

Point your domain to the instance IP:

```
A    @              → <instance-ip>
A    www            → <instance-ip>   (optional)
```

Wait for DNS propagation (can take up to 48 hours, usually faster).

---

## Step 2: Server Setup

SSH into your server:

```bash
ssh root@<instance-ip>
```

### 2.1 Clone Repository

```bash
cd /opt
git clone https://github.com/YOUR_USERNAME/riff.git
cd riff
```

### 2.2 Install Node.js (for frontend build)

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
```

### 2.3 Create Environment File

```bash
cp .env.example .env
nano .env
```

Fill in all values:

```bash
# Your domain (no protocol, no trailing slash)
DOMAIN=yourdomain.com

# PostgreSQL connection string from Step 1.1
DATABASE_URL=postgres://user:pass@host:port/riff?sslmode=require

# S3 Storage from Step 1.3
S3_BUCKET=riff-uploads
S3_REGION=fr-par
S3_ENDPOINT=https://s3.fr-par.scw.cloud
S3_PUBLIC_URL=https://riff-uploads.s3.fr-par.scw.cloud
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key

# Email from Step 1.4
SCW_SECRET_KEY=your-scw-secret-key
SCW_PROJECT_ID=your-project-id
SCW_REGION=fr-par
EMAIL_FROM=noreply@yourdomain.com
```

### 2.4 Update Caddyfile

Edit the Caddyfile to use your domain:

```bash
nano Caddyfile
```

Replace `{$DOMAIN:localhost}` with your actual domain:

```
yourdomain.com {
    reverse_proxy api:8000
    encode gzip zstd
    log {
        output stdout
        format console
    }
}
```

### 2.5 Build Frontend & Deploy

```bash
chmod +x deploy.sh
./deploy.sh
```

This will:
1. Build the React frontend
2. Build the Docker images
3. Start Caddy + API containers
4. Caddy automatically obtains SSL certificate

### 2.6 Initialize Database

The schema is applied automatically on first API startup. Check it worked:

```bash
docker compose -f docker-compose.prod.yml logs api
```

Look for: `Riff running on http://localhost:8000`

---

## Step 3: Verify Deployment

### Check Services

```bash
# All containers should be "Up" and "healthy"
docker compose -f docker-compose.prod.yml ps

# Check logs
docker compose -f docker-compose.prod.yml logs -f
```

### Test Endpoints

```bash
# Health check
curl https://yourdomain.com/health

# WebFinger (ActivityPub discovery)
curl https://yourdomain.com/.well-known/webfinger?resource=acct:admin@yourdomain.com
```

### Test from Mastodon

Search for `@youruser@yourdomain.com` from any Mastodon instance.

---

## Ongoing Operations

### Deploy Updates

From your local machine:

```bash
ssh root@<instance-ip> "cd /opt/riff && ./deploy.sh"
```

Or from the server:

```bash
cd /opt/riff
./deploy.sh
```

**Downtime:** ~5-10 seconds during container restart.

### View Logs

```bash
# All services
docker compose -f docker-compose.prod.yml logs -f

# Just API
docker compose -f docker-compose.prod.yml logs -f api

# Just Caddy
docker compose -f docker-compose.prod.yml logs -f caddy
```

### Restart Services

```bash
docker compose -f docker-compose.prod.yml restart
```

### Database Access

```bash
# Via psql (install: apt install postgresql-client)
psql "postgres://user:pass@host:port/riff?sslmode=require"
```

### Backup

Scaleway Managed PostgreSQL has automatic daily backups. For manual backup:

```bash
pg_dump "postgres://user:pass@host:port/riff?sslmode=require" > backup.sql
```

---

## Troubleshooting

### Caddy won't start / SSL issues

```bash
# Check Caddy logs
docker compose -f docker-compose.prod.yml logs caddy

# Common issues:
# - DNS not pointing to server yet
# - Port 80/443 blocked by firewall
# - Domain typo in Caddyfile
```

### API unhealthy

```bash
# Check API logs
docker compose -f docker-compose.prod.yml logs api

# Common issues:
# - DATABASE_URL incorrect or database unreachable
# - Missing environment variables
```

### Can't connect to database

- Verify the connection string in `.env`
- Check Scaleway security groups allow connection from instance IP
- Managed DB might need IP allowlist configuration

### Federation not working

```bash
# Test WebFinger
curl -v "https://yourdomain.com/.well-known/webfinger?resource=acct:testuser@yourdomain.com"

# Should return JSON with links
# If 404: user doesn't exist
# If connection refused: Caddy/API issue
```

---

## Security Checklist

- [ ] SSH key authentication only (disable password auth)
- [ ] Firewall: only ports 22, 80, 443 open
- [ ] Strong database password
- [ ] `.env` file has restrictive permissions: `chmod 600 .env`
- [ ] Regular OS updates: `apt update && apt upgrade`
- [ ] Scaleway automatic backups enabled

---

## Performance Tuning

The production config includes these optimizations:

### Database

**Pool size by tier** - always leave 10-20 connections for admin/backups:

| Scaleway DB Tier | Max Connections | `DB_POOL_SIZE` |
|------------------|-----------------|----------------|
| DB-DEV-S (~€12) | ~50 | 40 |
| DB-DEV-M (~€24) | ~100 | 80 |
| DB-GP-XS (~€48) | ~200 | 150 |

To change pool size, update `DB_POOL_SIZE` in docker-compose.prod.yml and restart.

**Connection string params** - Add to DATABASE_URL for better performance:
```
?sslmode=require&connect_timeout=10&application_name=riff
```

### Caching
- **Profile/hashtag cache: 5 min** - Reduces DB queries for popular pages
- **Trending cache: 15 min** - Heavy query, cached aggressively

### When to Add PgBouncer
If you see "too many connections" errors or want to scale horizontally, add PgBouncer:
```yaml
# Add to docker-compose.prod.yml
pgbouncer:
  image: edoburu/pgbouncer:1.22.1-p2
  environment:
    DATABASE_URL: ${DATABASE_URL}
    POOL_MODE: transaction
    MAX_CLIENT_CONN: 200
    DEFAULT_POOL_SIZE: 25
```
Then point the API's DATABASE_URL to pgbouncer instead.

---

## Scaling Later

When you need more capacity, the architecture supports:

1. **Vertical scaling:** Upgrade PLAY2-PICO → PLAY2-NANO → DEV1-S
2. **Database scaling:** DB-DEV-S → DB-DEV-M → DB-GP-XS
3. **Horizontal scaling:** Add `NODE_TYPE=web` and `NODE_TYPE=worker` for separate containers

See `scaling-plan.md` for the full scaling architecture.
