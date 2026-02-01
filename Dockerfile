# API only - no frontend
FROM denoland/deno:latest
WORKDIR /app

# Create data directory for KV persistence
RUN mkdir -p /data && chown deno:deno /data

# Copy and cache dependencies
COPY --chown=deno:deno api/deno.json api/deno.lock* ./
RUN deno install

# Copy API source and migrations
COPY --chown=deno:deno api/src/ ./src/
COPY --chown=deno:deno api/migrations/ ./migrations/

USER deno
EXPOSE 8000

CMD ["deno", "run", \
  "--allow-net", \
  "--allow-env", \
  "--allow-sys", \
  "--allow-read=/app,/data", \
  "--allow-write=/data", \
  "--unstable-kv", \
  "--unstable-temporal", \
  "src/main.ts"]
