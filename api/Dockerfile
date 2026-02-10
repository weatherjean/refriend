FROM denoland/deno:latest

WORKDIR /app

# Create non-root user for security
RUN groupadd --gid 1000 deno 2>/dev/null || true && \
    useradd --uid 1000 --gid 1000 --create-home deno 2>/dev/null || true

# Create data directory for KV persistence with correct ownership
RUN mkdir -p /data && chown deno:deno /data

# Copy dependency files first for caching
COPY --chown=deno:deno deno.json deno.lock* ./

# Cache dependencies
RUN deno install

# Copy source and migrations
COPY --chown=deno:deno src/ ./src/
COPY --chown=deno:deno migrations/ ./migrations/

# Switch to non-root user
USER deno

EXPOSE 8000

# Scoped permissions: only allow specific env vars and paths
CMD ["deno", "run", \
  "--allow-net", \
  "--allow-env=DATABASE_URL,PORT,DOMAIN,STATIC_DIR,DENO_KV_PATH,S3_BUCKET,S3_REGION,S3_ENDPOINT,S3_PUBLIC_URL,AWS_ACCESS_KEY_ID,AWS_SECRET_ACCESS_KEY,ALLOWED_ORIGINS,SCW_SECRET_KEY,SCW_PROJECT_ID,SCW_REGION,EMAIL_FROM,APP_URL,NODE_TYPE,QUEUE_WORKERS,ENV,VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY", \
  "--allow-read=/app,/data", \
  "--allow-write=/data", \
  "--unstable-kv", \
  "--unstable-temporal", \
  "src/main.ts"]
