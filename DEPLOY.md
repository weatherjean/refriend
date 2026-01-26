# Deployment Guide

Deploy Riff on Scaleway (~€25/month).

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Scaleway Instance                         │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  frontend (init) → copies built files to volume     │    │
│  └─────────────────────────────────────────────────────┘    │
│                            ↓                                 │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Caddy (stock image)                                │    │
│  │  - Serves static files from volume                  │    │
│  │  - Auto HTTPS via Let's Encrypt                     │    │
│  │  - Proxies /api/*, /@*, /.well-known/* to API       │    │
│  └─────────────────────────────────────────────────────┘    │
│                            ↓                                 │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  API (Deno)                                         │    │
│  │  - REST API + ActivityPub federation                │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                            ↓
        ┌───────────────────┼───────────────────┐
        ↓                   ↓                   ↓
┌──────────────┐    ┌─────────────┐    ┌─────────────┐
│ Managed      │    │ Object      │    │ Transact.   │
│ PostgreSQL   │    │ Storage     │    │ Email       │
└──────────────┘    └─────────────┘    └─────────────┘
```

## Cost (~€25/month)

| Service | Spec | Cost |
|---------|------|------|
| Managed PostgreSQL | DB-DEV-S (2 vCPU, 2GB) | ~€12 |
| Instance | PLAY2-PICO (1 vCPU, 2GB) | ~€10 |
| Object Storage | 50GB | ~€0.50 |
| Container Registry | ~2GB | ~€0.05 |
| Transactional Email | 10k/month | ~€2.50 |

---

## Initial Setup

### 1. Create Scaleway Resources

**PostgreSQL:**
1. Console → Managed Databases → Create
2. PostgreSQL 16, DB-DEV-S, 10GB storage
3. Database name: `riff`
4. Save connection string

**Instance:**
1. Console → Instances → Create
2. Docker InstantApp, PLAY2-PICO
3. Add SSH key
4. Note public IP

**Object Storage:**
1. Console → Object Storage → Create Bucket
2. Name: `riff-uploads`, Private
3. IAM → API Keys → Generate (save Access + Secret keys)

**Transactional Email:**
1. Console → Transactional Email → Get Started
2. Verify domain (add DNS records)
3. Note sender: `noreply@yourdomain.com`

**Container Registry:**
1. Console → Container Registry → Create Namespace
2. Name: `riff-app`

**DNS:**
```
A    @    →  <instance-ip>
```

### 2. Build & Push Images (Local Machine)

```bash
# Login to registry
docker login rg.fr-par.scw.cloud -u nologin -p <SCW_SECRET_KEY>

# Build and push
./scripts/deploy.sh
```

### 3. Server Setup

```bash
ssh root@<instance-ip>

# Create app directory
mkdir -p /opt/riff && cd /opt/riff

# Create files (copy from repo)
nano docker-compose.prod.yml   # paste content
nano Caddyfile                 # paste content
nano .env                      # fill in values
chmod 600 .env

# Login to registry
docker login rg.fr-par.scw.cloud -u nologin -p <SCW_SECRET_KEY>

# Pull and start
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

---

## Environment Variables (.env)

```bash
# Domain
DOMAIN=yourdomain.com

# Database (from Scaleway console)
DATABASE_URL=postgres://user:pass@host:port/riff?sslmode=require
DB_POOL_SIZE=40

# Object Storage
S3_BUCKET=riff-uploads
S3_REGION=fr-par
S3_ENDPOINT=https://s3.fr-par.scw.cloud
S3_PUBLIC_URL=https://riff-uploads.s3.fr-par.scw.cloud
AWS_ACCESS_KEY_ID=<access-key>
AWS_SECRET_ACCESS_KEY=<secret-key>

# Transactional Email
SCW_SECRET_KEY=<scw-secret-key>
SCW_PROJECT_ID=<project-id>
SCW_REGION=fr-par
EMAIL_FROM=noreply@yourdomain.com

# Misc
ENV=production
TRUST_PROXY=true
```

---

## Deployments

### Quick Deploy (After Code Changes)

**1. Build & push images (local machine):**
```bash
# Ensure you're logged in
docker login rg.fr-par.scw.cloud -u nologin -p <SCW_SECRET_KEY>

# Build both images and push to registry
./scripts/deploy.sh

# Or manually:
docker build -t rg.fr-par.scw.cloud/riff-app/api:latest .
docker build -t rg.fr-par.scw.cloud/riff-app/frontend:latest ./web
docker push rg.fr-par.scw.cloud/riff-app/api:latest
docker push rg.fr-par.scw.cloud/riff-app/frontend:latest
```

**2. Pull & restart (on server):**
```bash
cd /opt/riff
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
docker image prune -f
```

### Deploy API Only

When you've only changed backend code:

**Local:**
```bash
docker build -t rg.fr-par.scw.cloud/riff-app/api:latest .
docker push rg.fr-par.scw.cloud/riff-app/api:latest
```

**Server:**
```bash
cd /opt/riff
docker compose -f docker-compose.prod.yml pull api
docker compose -f docker-compose.prod.yml up -d api
```

### Deploy Frontend Only

When you've only changed frontend code:

**Local:**
```bash
docker build -t rg.fr-par.scw.cloud/riff-app/frontend:latest ./web
docker push rg.fr-par.scw.cloud/riff-app/frontend:latest
```

**Server:**
```bash
cd /opt/riff
docker compose -f docker-compose.prod.yml pull frontend
docker compose -f docker-compose.prod.yml up -d --force-recreate frontend
# Restart caddy to pick up new files
docker compose -f docker-compose.prod.yml restart caddy
```

### Logs

```bash
docker compose -f docker-compose.prod.yml logs -f        # all
docker compose -f docker-compose.prod.yml logs -f api    # api only
docker compose -f docker-compose.prod.yml logs -f caddy  # caddy only
```

### Restart

```bash
docker compose -f docker-compose.prod.yml restart
```

---

## Troubleshooting

**Caddy won't start / no HTTPS:**
- DNS not propagated yet (wait or check with `dig yourdomain.com`)
- Port 80/443 blocked (check Scaleway security group)

**API unhealthy:**
- Check logs: `docker compose -f docker-compose.prod.yml logs api`
- Usually DATABASE_URL wrong or DB not reachable

**Federation not working:**
```bash
curl https://yourdomain.com/.well-known/webfinger?resource=acct:user@yourdomain.com
```

---

## Scaling

| Load | Action |
|------|--------|
| More users | Upgrade instance: PLAY2-PICO → DEV1-S |
| DB bottleneck | Upgrade DB: DB-DEV-S → DB-DEV-M (update DB_POOL_SIZE) |
| High traffic | Add PgBouncer, separate web/worker containers |

**DB Pool Sizes:**
| Tier | Max Connections | DB_POOL_SIZE |
|------|-----------------|--------------|
| DB-DEV-S | ~50 | 40 |
| DB-DEV-M | ~100 | 80 |
| DB-GP-XS | ~200 | 150 |

---

## Security Checklist

- [ ] SSH key auth only (disable password)
- [ ] Firewall: only 22, 80, 443 open
- [ ] `.env` permissions: `chmod 600 .env`
- [ ] Strong DB password
- [ ] Regular updates: `apt update && apt upgrade`
