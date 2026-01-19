FROM denoland/deno:latest

WORKDIR /app

# Copy dependency files first for caching
COPY deno.json deno.lock* ./

# Cache dependencies
RUN deno install

# Copy source and schema
COPY src/ ./src/
COPY schema.pg.sql ./

EXPOSE 8000

CMD ["deno", "run", "--allow-all", "--unstable-kv", "--unstable-temporal", "src/main.ts"]
