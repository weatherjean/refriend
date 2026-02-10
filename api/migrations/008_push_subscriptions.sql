-- Push notification subscriptions (Web Push API)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id SERIAL PRIMARY KEY,
  actor_id INTEGER NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (actor_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_actor_id ON push_subscriptions(actor_id);
