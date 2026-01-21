-- Migration: Add communities support
-- Run this against an existing database

-- 1. Add actor_type column to actors (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'actors' AND column_name = 'actor_type') THEN
    ALTER TABLE actors ADD COLUMN actor_type TEXT NOT NULL DEFAULT 'Person';
    ALTER TABLE actors ADD CONSTRAINT actors_actor_type_check CHECK (actor_type IN ('Person', 'Group'));
  END IF;
END $$;

-- 2. Modify keys table to support actor_id
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'keys' AND column_name = 'actor_id') THEN
    -- Add actor_id column
    ALTER TABLE keys ADD COLUMN actor_id INTEGER REFERENCES actors(id) ON DELETE CASCADE;

    -- Make user_id nullable (it was NOT NULL before)
    ALTER TABLE keys ALTER COLUMN user_id DROP NOT NULL;

    -- Add unique constraint for actor_id + type
    ALTER TABLE keys ADD CONSTRAINT keys_actor_id_type_key UNIQUE (actor_id, type);

    -- Add check constraint
    ALTER TABLE keys ADD CONSTRAINT keys_user_or_actor_check CHECK (user_id IS NOT NULL OR actor_id IS NOT NULL);
  END IF;
END $$;

-- 3. Create community_settings table
CREATE TABLE IF NOT EXISTS community_settings (
  actor_id INTEGER PRIMARY KEY REFERENCES actors(id) ON DELETE CASCADE,
  require_approval BOOLEAN NOT NULL DEFAULT false,
  created_by INTEGER REFERENCES actors(id) ON DELETE SET NULL
);

-- 4. Create community_admins table
CREATE TABLE IF NOT EXISTS community_admins (
  id SERIAL PRIMARY KEY,
  community_id INTEGER NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  actor_id INTEGER NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (community_id, actor_id)
);

-- 5. Create community_bans table
CREATE TABLE IF NOT EXISTS community_bans (
  id SERIAL PRIMARY KEY,
  community_id INTEGER NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  actor_id INTEGER NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  reason TEXT,
  banned_by INTEGER REFERENCES actors(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (community_id, actor_id)
);

-- 6. Create community_posts table
CREATE TABLE IF NOT EXISTS community_posts (
  id SERIAL PRIMARY KEY,
  community_id INTEGER NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by INTEGER REFERENCES actors(id) ON DELETE SET NULL,
  UNIQUE (community_id, post_id)
);

-- 7. Create indexes
CREATE INDEX IF NOT EXISTS idx_actors_type ON actors(actor_type);
CREATE INDEX IF NOT EXISTS idx_community_admins_community ON community_admins(community_id);
CREATE INDEX IF NOT EXISTS idx_community_admins_actor ON community_admins(actor_id);
CREATE INDEX IF NOT EXISTS idx_community_bans_community ON community_bans(community_id);
CREATE INDEX IF NOT EXISTS idx_community_bans_actor ON community_bans(actor_id);
CREATE INDEX IF NOT EXISTS idx_community_posts_community ON community_posts(community_id);
CREATE INDEX IF NOT EXISTS idx_community_posts_status ON community_posts(community_id, status);
