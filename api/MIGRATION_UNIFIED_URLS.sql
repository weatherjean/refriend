-- Migration: Unify URL structure from /users/ to /@
-- Only updates LOCAL actors and their posts. Remote actor URIs are NOT changed.

-- Update local post URIs from /users/ to /@
UPDATE posts SET uri = REPLACE(uri, '/users/', '/@')
WHERE uri LIKE '%/users/%/posts/%'
  AND actor_id IN (SELECT id FROM actors WHERE user_id IS NOT NULL);

-- Update local post URLs to match URIs
UPDATE posts SET url = uri
WHERE actor_id IN (SELECT id FROM actors WHERE user_id IS NOT NULL);

-- Update local actor URIs
UPDATE actors SET uri = REPLACE(uri, '/users/', '/@')
WHERE user_id IS NOT NULL AND uri LIKE '%/users/%';

-- Update local actor inbox URLs
UPDATE actors SET inbox_url = REPLACE(inbox_url, '/users/', '/@')
WHERE user_id IS NOT NULL AND inbox_url LIKE '%/users/%';

-- Update local actor URLs to match URIs
UPDATE actors SET url = uri
WHERE user_id IS NOT NULL;
