# Security Review — v0.2.0 Production

Reviewed: 2026-01-31

## Infrastructure

### TLS / HTTPS
- Caddy handles automatic Let's Encrypt certificates for `riff-social.com` and `plog.riff-social.com`
- TLS 1.3 (cipher suite 4865 = TLS_AES_128_GCM_SHA256) confirmed in logs
- HSTS enabled: `max-age=31536000; includeSubDomains`
- HTTP/2 enabled for browser clients, HTTP/1.1 for federation peers

### Headers (set by API middleware)
- `Content-Security-Policy`: Restrictive — `default-src 'self'`, `frame-ancestors 'none'`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: geolocation=(), microphone=(), camera=()`
- Cookies are redacted in Caddy logs (confirmed)

### Network
- Only ports 80 and 443 exposed via Caddy
- Database is on private network (172.16.16.2:5432), not exposed publicly
- Dozzle has read-only Docker socket access (`/var/run/docker.sock:ro`)
- `TRUST_PROXY: "true"` is correct since Caddy is the sole entry point

### Docker
- All services have JSON file log limits (max-size 10m, max-file 3)
- API runs as `deno` user (non-root) inside container
- Health checks configured with reasonable intervals

## Application

### Authentication
- Bcrypt password hashing
- Session tokens with 30-day expiry
- CSRF token protection on state-changing requests
- Password minimum 8 characters

### Rate Limiting (via Deno KV)
- Login: 20 attempts / 15 min
- Registration: 5 / hour per IP
- Password reset: 5 / hour
- Post creation: 10 / minute
- General API: 300 / minute
- Rate limit identifier: authenticated user ID or IP (via trusted proxy headers)

### Input Validation
- Username: `^[a-z0-9_]+$`, max 50 chars (DB constraint), max 26 chars (API)
- Email: format validation
- Post content: sanitized
- SQL: parameterized queries throughout, `escapeLikePattern()` for LIKE clauses

### Federation
- HTTP Signature verification on incoming activities (via Fedify)
- Outbox errors logged with truncation (500 char limit on error strings)
- Remote actor fetching uses standard AP verification

## Recommendations

### Do now
1. **Firewall**: Run `ufw allow 80,443/tcp && ufw allow <ssh-port>/tcp && ufw enable` to block all other ports
2. **Caddy log level**: Set to WARN to reduce log volume (included in this update)

### Do soon
3. **Dozzle credentials**: Consider a stronger password (current is 9 chars alphanumeric)
4. **Session cleanup**: Add a periodic job to purge expired sessions from the `sessions` table
5. **Account deletion**: Verify the DELETE cascade properly removes all user data (sessions, keys, posts, likes, follows, notifications)

### Consider later
6. **Rate limit on federation inbox**: The `/inbox` endpoint receives high volume from Lemmy instances (visible in logs). Consider rate limiting by remote server IP if abuse occurs
7. **CSP refinement**: `img-src` allows `http:` which could leak referrer info on mixed content — tighten to `https:` only if all federation media is HTTPS
8. **Monitoring**: Set up uptime monitoring on `/health` endpoint
9. **Backup**: Ensure PostgreSQL backups are automated (pg_dump or WAL archiving)
10. **Log review**: Periodically check Dozzle for unusual patterns — failed auth spikes, unexpected 5xx errors, federation signature failures
