# Scaling Plan: PostgreSQL + Workers

## Phase 1: PostgreSQL Migration

**Changes:**
- Replace SQLite with PostgreSQL (Docker container)
- Update db.ts: connection pool, `$1` params, `SERIAL` keys
- Update schema.sql: Postgres syntax (`NOW()`, `TIMESTAMPTZ`, etc.)

**Schema additions:**
```sql
CREATE TABLE jobs (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT DEFAULT 'pending',
  attempts INT DEFAULT 0,
  run_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_jobs_pending ON jobs(run_at) WHERE status = 'pending';
```

## Phase 2: Background Worker

**New file:** `src/worker.ts`
- Poll jobs table with `FOR UPDATE SKIP LOCKED`
- Process federation delivery, notifications
- Retry with exponential backoff
- ~100-150 lines

**Job types:**
- `deliver` - Send activity to remote inbox
- `notify` - Push notifications (future)

## Phase 3: Docker Setup

```yaml
services:
  api:
    build: ./api
    command: deno run --allow-all src/main.ts
  worker:
    build: ./api
    command: deno run --allow-all src/worker.ts
    deploy:
      replicas: 2
  db:
    image: postgres:16-alpine
    volumes:
      - pgdata:/var/lib/postgresql/data
```

## Expected Capacity

| Box (€/mo) | DAU | Registered |
|------------|-----|------------|
| €20 | 10-20k | 100-200k |
| €70 | 30-50k | 300-500k |
| €100 | 50-80k | 500k-1M |

## Future (if needed)
- PgBouncer for connection pooling
- Read replicas
- Redis + BullMQ (only if PG queue bottlenecks)
