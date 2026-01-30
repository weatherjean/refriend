-- Migration: Remove internal communities
-- IMPORTANT: Run inside a transaction. Review the DELETE count before committing.
-- This ONLY deletes locally-created community actors (created_by IS NOT NULL).
-- Remote Group actors (Lemmy communities etc.) are preserved.

BEGIN;

-- 1. Drop community-specific tables
DROP TABLE IF EXISTS community_mod_logs CASCADE;
DROP TABLE IF EXISTS community_pinned_posts CASCADE;
DROP TABLE IF EXISTS community_posts CASCADE;
DROP TABLE IF EXISTS community_bans CASCADE;
DROP TABLE IF EXISTS community_admins CASCADE;

-- 2. Drop community_id from posts
ALTER TABLE posts DROP COLUMN IF EXISTS community_id;

-- 3. Drop require_approval from actors
ALTER TABLE actors DROP COLUMN IF EXISTS require_approval;

-- 4. Delete local communities BEFORE dropping created_by (the WHERE clause needs it)
-- Verify count first — this should only match locally-created groups, NOT remote Lemmy groups
DO $$
DECLARE
  _count INTEGER;
BEGIN
  SELECT COUNT(*) INTO _count FROM actors WHERE actor_type = 'Group' AND created_by IS NOT NULL;
  RAISE NOTICE 'Will delete % local community actor(s)', _count;
END $$;

DELETE FROM actors WHERE actor_type = 'Group' AND created_by IS NOT NULL;

-- 5. NOW safe to drop created_by column
ALTER TABLE actors DROP COLUMN IF EXISTS created_by;

-- 6. Drop community indexes
DROP INDEX IF EXISTS idx_posts_community;
DROP INDEX IF EXISTS idx_community_admins_community;
DROP INDEX IF EXISTS idx_community_admins_actor;
DROP INDEX IF EXISTS idx_community_bans_community;
DROP INDEX IF EXISTS idx_community_bans_actor;
DROP INDEX IF EXISTS idx_community_posts_community;
DROP INDEX IF EXISTS idx_community_posts_status;
DROP INDEX IF EXISTS idx_community_mod_logs_community;

-- Review output above, then:
COMMIT;
-- If anything looks wrong, run ROLLBACK instead of COMMIT.
