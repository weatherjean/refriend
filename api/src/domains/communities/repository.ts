import { Pool, PoolClient } from "postgres";
import type { Actor, Post, PostWithActor } from "../../db.ts";

/**
 * Escape special characters in LIKE patterns to prevent SQL wildcard injection.
 */
function escapeLikePattern(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

// Community-specific types

export interface CommunityAdmin {
  id: number;
  community_id: number;
  actor_id: number;
  role: "owner" | "admin";
  created_at: string;
}

export interface CommunityBan {
  id: number;
  community_id: number;
  actor_id: number;
  reason: string | null;
  banned_by: number | null;
  created_at: string;
}

export interface CommunityPost {
  id: number;
  community_id: number;
  post_id: number;
  status: "pending" | "approved" | "rejected";
  is_announcement: boolean;  // true = community boosted/announced this post, false = post addressed TO community
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by: number | null;
  suggested_by: number | null;
}

export type ModLogAction =
  | "post_approved"
  | "post_rejected"
  | "post_pinned"
  | "post_unpinned"
  | "post_deleted"
  | "post_unboosted"
  | "community_updated"
  | "admin_added"
  | "admin_removed"
  | "user_banned"
  | "user_unbanned";

export interface ModLogEntry {
  id: number;
  community_id: number;
  actor_id: number | null;
  action: ModLogAction;
  target_type: string | null;
  target_id: string | null;
  details: string | null;
  created_at: string;
}

// Community extends Actor - require_approval and created_by are on Actor now
// member_count uses the follower_count column
export interface Community extends Actor {
  member_count?: number;
}

export interface CommunityAdminWithActor extends CommunityAdmin {
  actor: Actor;
}

export interface CommunityBanWithActor extends CommunityBan {
  actor: Actor;
  banned_by_actor?: Actor;
}

export class CommunityDB {
  constructor(private pool: Pool) {}

  private async query<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      return await fn(client);
    } finally {
      client.release();
    }
  }

  // ============ Community CRUD ============

  async createCommunity(
    name: string,
    domain: string,
    creatorActorId: number,
    options: { bio?: string; requireApproval?: boolean } = {}
  ): Promise<Community> {
    return this.query(async (client) => {
      await client.queryArray`BEGIN`;
      try {
        // Create the actor with type 'Group' - settings are now on the actor
        // Use standard @name@domain format (same as users)
        const handle = `@${name}@${domain}`;
        const uri = `https://${domain}/users/${name}`;
        const inboxUrl = `https://${domain}/users/${name}/inbox`;
        const url = `https://${domain}/c/${name}`;

        const actorResult = await client.queryObject<Actor>`
          INSERT INTO actors (uri, handle, name, bio, avatar_url, inbox_url, shared_inbox_url, url, user_id, actor_type, require_approval, created_by)
          VALUES (${uri}, ${handle}, ${name}, ${options.bio || null}, NULL, ${inboxUrl}, ${inboxUrl}, ${url}, NULL, 'Group', ${options.requireApproval || false}, ${creatorActorId})
          RETURNING *
        `;
        const actor = actorResult.rows[0];

        // Add creator as owner
        await client.queryArray`
          INSERT INTO community_admins (community_id, actor_id, role)
          VALUES (${actor.id}, ${creatorActorId}, 'owner')
        `;

        // Creator automatically follows the community (triggers follower_count update)
        await client.queryArray`
          INSERT INTO follows (follower_id, following_id)
          VALUES (${creatorActorId}, ${actor.id})
          ON CONFLICT DO NOTHING
        `;

        await client.queryArray`COMMIT`;
        return { ...actor, member_count: 1 } as Community;
      } catch (e) {
        await client.queryArray`ROLLBACK`;
        throw e;
      }
    });
  }

  /**
   * Get a community by name - only returns LOCAL communities.
   * For remote communities, use getCommunityByHandle with full @name@domain format.
   */
  async getCommunityByName(name: string): Promise<Community | null> {
    return this.query(async (client) => {
      // Only return local communities (those with created_by set)
      const result = await client.queryObject<Actor>`
        SELECT * FROM actors
        WHERE actor_type = 'Group'
          AND created_by IS NOT NULL
          AND (handle ILIKE ${'@' + name + '@%'} OR name = ${name})
        LIMIT 1
      `;
      if (!result.rows[0]) return null;
      return {
        ...result.rows[0],
        member_count: result.rows[0].follower_count,
      };
    });
  }

  /**
   * Get a community by full handle (@name@domain format).
   * Works for both local and remote communities.
   */
  async getCommunityByHandle(handle: string): Promise<Community | null> {
    return this.query(async (client) => {
      // Normalize handle - ensure it starts with @
      const normalizedHandle = handle.startsWith('@') ? handle : `@${handle}`;
      const result = await client.queryObject<Actor>`
        SELECT * FROM actors
        WHERE actor_type = 'Group'
          AND handle ILIKE ${normalizedHandle}
        LIMIT 1
      `;
      if (!result.rows[0]) return null;
      return {
        ...result.rows[0],
        member_count: result.rows[0].follower_count,
      };
    });
  }

  async getCommunityByActorId(actorId: number): Promise<Community | null> {
    return this.query(async (client) => {
      const result = await client.queryObject<Actor>`
        SELECT * FROM actors
        WHERE id = ${actorId} AND actor_type = 'Group'
      `;
      if (!result.rows[0]) return null;
      return {
        ...result.rows[0],
        member_count: result.rows[0].follower_count,
      };
    });
  }

  async updateCommunity(
    communityId: number,
    updates: { name?: string; bio?: string; avatar_url?: string; require_approval?: boolean },
    updatedBy?: number
  ): Promise<Community | null> {
    return this.query(async (client) => {
      // All settings are now on the actors table directly
      const sets: string[] = [];
      const values: unknown[] = [];
      let paramNum = 1;

      if (updates.name !== undefined) {
        sets.push(`name = $${paramNum++}`);
        values.push(updates.name);
      }
      if (updates.bio !== undefined) {
        sets.push(`bio = $${paramNum++}`);
        values.push(updates.bio);
      }
      if (updates.avatar_url !== undefined) {
        sets.push(`avatar_url = $${paramNum++}`);
        values.push(updates.avatar_url);
      }
      if (updates.require_approval !== undefined) {
        sets.push(`require_approval = $${paramNum++}`);
        values.push(updates.require_approval);
      }

      if (sets.length > 0) {
        values.push(communityId);
        await client.queryObject(
          `UPDATE actors SET ${sets.join(", ")} WHERE id = $${paramNum}`,
          values
        );
      }

      const result = await this.getCommunityByActorId(communityId);

      // Log as side effect
      if (updatedBy) {
        const changedFields = Object.keys(updates).filter(k => updates[k as keyof typeof updates] !== undefined);
        if (changedFields.length > 0) {
          this.logModAction(communityId, updatedBy, "community_updated", "community", result?.public_id, `Updated: ${changedFields.join(", ")}`);
        }
      }

      return result;
    });
  }

  async deleteCommunity(communityId: number): Promise<void> {
    await this.query(async (client) => {
      // Cascading deletes will handle community_settings, community_admins, etc.
      await client.queryArray`DELETE FROM actors WHERE id = ${communityId} AND actor_type = 'Group'`;
    });
  }

  async listCommunities(limit = 20, before?: number): Promise<Community[]> {
    return this.query(async (client) => {
      const query = before
        ? `SELECT * FROM actors
           WHERE actor_type = 'Group' AND id < $1
           ORDER BY id DESC LIMIT $2`
        : `SELECT * FROM actors
           WHERE actor_type = 'Group'
           ORDER BY id DESC LIMIT $1`;
      const params = before ? [before, limit] : [limit];
      const result = await client.queryObject<Actor>(query, params);
      return result.rows.map((actor) => ({
        ...actor,
        member_count: actor.follower_count,
      })) as Community[];
    });
  }

  // ============ Admin Management ============

  async getCommunityAdmins(communityId: number): Promise<CommunityAdminWithActor[]> {
    return this.query(async (client) => {
      const result = await client.queryObject<CommunityAdmin & {
        actor_public_id: string;
        actor_uri: string;
        actor_handle: string;
        actor_name: string | null;
        actor_bio: string | null;
        actor_avatar_url: string | null;
        actor_url: string | null;
        actor_user_id: number | null;
        actor_created_at: string;
      }>`
        SELECT ca.*,
          a.public_id as actor_public_id,
          a.uri as actor_uri,
          a.handle as actor_handle,
          a.name as actor_name,
          a.bio as actor_bio,
          a.avatar_url as actor_avatar_url,
          a.url as actor_url,
          a.user_id as actor_user_id,
          a.created_at as actor_created_at
        FROM community_admins ca
        JOIN actors a ON ca.actor_id = a.id
        WHERE ca.community_id = ${communityId}
        ORDER BY ca.role = 'owner' DESC, ca.created_at ASC
      `;
      return result.rows.map(row => ({
        id: row.id,
        community_id: row.community_id,
        actor_id: row.actor_id,
        role: row.role,
        created_at: row.created_at,
        actor: {
          id: row.actor_id,
          public_id: row.actor_public_id,
          uri: row.actor_uri,
          handle: row.actor_handle,
          name: row.actor_name,
          bio: row.actor_bio,
          avatar_url: row.actor_avatar_url,
          url: row.actor_url,
          user_id: row.actor_user_id,
          created_at: row.actor_created_at,
        } as Actor,
      }));
    });
  }

  async addCommunityAdmin(communityId: number, actorId: number, role: "owner" | "admin", addedBy?: number, actorHandle?: string): Promise<void> {
    await this.query(async (client) => {
      await client.queryArray`
        INSERT INTO community_admins (community_id, actor_id, role)
        VALUES (${communityId}, ${actorId}, ${role})
        ON CONFLICT (community_id, actor_id) DO UPDATE SET role = ${role}
      `;
    });
    // Log as side effect
    if (addedBy) {
      this.logModAction(communityId, addedBy, "admin_added", "actor", undefined, actorHandle ? `Added ${actorHandle} as ${role}` : `Added as ${role}`);
    }
  }

  async removeCommunityAdmin(communityId: number, actorId: number, removedBy?: number, actorHandle?: string): Promise<void> {
    await this.query(async (client) => {
      await client.queryArray`
        DELETE FROM community_admins
        WHERE community_id = ${communityId} AND actor_id = ${actorId} AND role != 'owner'
      `;
    });
    // Log as side effect
    if (removedBy) {
      this.logModAction(communityId, removedBy, "admin_removed", "actor", undefined, actorHandle ? `Removed ${actorHandle} from admins` : undefined);
    }
  }

  async isAdmin(communityId: number, actorId: number): Promise<boolean> {
    return this.query(async (client) => {
      const result = await client.queryArray`
        SELECT 1 FROM community_admins WHERE community_id = ${communityId} AND actor_id = ${actorId}
      `;
      return result.rows.length > 0;
    });
  }

  async isOwner(communityId: number, actorId: number): Promise<boolean> {
    return this.query(async (client) => {
      const result = await client.queryArray`
        SELECT 1 FROM community_admins
        WHERE community_id = ${communityId} AND actor_id = ${actorId} AND role = 'owner'
      `;
      return result.rows.length > 0;
    });
  }

  async getAdminRole(communityId: number, actorId: number): Promise<"owner" | "admin" | null> {
    return this.query(async (client) => {
      const result = await client.queryObject<{ role: "owner" | "admin" }>`
        SELECT role FROM community_admins WHERE community_id = ${communityId} AND actor_id = ${actorId}
      `;
      return result.rows[0]?.role || null;
    });
  }

  async getOwnerCount(communityId: number): Promise<number> {
    return this.query(async (client) => {
      const result = await client.queryObject<{ count: bigint }>`
        SELECT COUNT(*) as count FROM community_admins
        WHERE community_id = ${communityId} AND role = 'owner'
      `;
      return Number(result.rows[0].count);
    });
  }

  // ============ Ban Management ============

  async getCommunityBans(communityId: number, limit = 10, before?: number): Promise<CommunityBanWithActor[]> {
    return this.query(async (client) => {
      const query = before
        ? `SELECT cb.*, a.public_id as actor_public_id, a.uri as actor_uri, a.handle as actor_handle, a.name as actor_name, a.avatar_url as actor_avatar_url
           FROM community_bans cb
           JOIN actors a ON cb.actor_id = a.id
           WHERE cb.community_id = $1 AND cb.id < $2
           ORDER BY cb.id DESC LIMIT $3`
        : `SELECT cb.*, a.public_id as actor_public_id, a.uri as actor_uri, a.handle as actor_handle, a.name as actor_name, a.avatar_url as actor_avatar_url
           FROM community_bans cb
           JOIN actors a ON cb.actor_id = a.id
           WHERE cb.community_id = $1
           ORDER BY cb.id DESC LIMIT $2`;
      const params = before ? [communityId, before, limit] : [communityId, limit];
      const result = await client.queryObject<CommunityBan & { actor_public_id: string; actor_uri: string; actor_handle: string; actor_name: string | null; actor_avatar_url: string | null }>(query, params);
      return result.rows.map(row => ({
        id: row.id,
        community_id: row.community_id,
        actor_id: row.actor_id,
        reason: row.reason,
        banned_by: row.banned_by,
        created_at: row.created_at,
        actor: {
          id: row.actor_id,
          public_id: row.actor_public_id,
          uri: row.actor_uri,
          handle: row.actor_handle,
          name: row.actor_name,
          avatar_url: row.actor_avatar_url,
        } as Actor,
      }));
    });
  }

  async banActor(communityId: number, actorId: number, reason: string | null, bannedBy: number, actorHandle?: string): Promise<void> {
    await this.query(async (client) => {
      await client.queryArray`
        INSERT INTO community_bans (community_id, actor_id, reason, banned_by)
        VALUES (${communityId}, ${actorId}, ${reason}, ${bannedBy})
        ON CONFLICT (community_id, actor_id) DO UPDATE SET reason = ${reason}, banned_by = ${bannedBy}
      `;
      // Also remove them from followers (members)
      await client.queryArray`
        DELETE FROM follows WHERE follower_id = ${actorId} AND following_id = ${communityId}
      `;
    });
    // Log as side effect
    this.logModAction(communityId, bannedBy, "user_banned", "actor", undefined, actorHandle ? `Banned ${actorHandle}${reason ? `: ${reason}` : ""}` : undefined);
  }

  async unbanActor(communityId: number, actorId: number, unbannedBy?: number, actorHandle?: string): Promise<void> {
    await this.query(async (client) => {
      await client.queryArray`
        DELETE FROM community_bans WHERE community_id = ${communityId} AND actor_id = ${actorId}
      `;
    });
    // Log as side effect
    if (unbannedBy) {
      this.logModAction(communityId, unbannedBy, "user_unbanned", "actor", undefined, actorHandle ? `Unbanned ${actorHandle}` : undefined);
    }
  }

  async isBanned(communityId: number, actorId: number): Promise<boolean> {
    return this.query(async (client) => {
      const result = await client.queryArray`
        SELECT 1 FROM community_bans WHERE community_id = ${communityId} AND actor_id = ${actorId}
      `;
      return result.rows.length > 0;
    });
  }

  async getBanCount(communityId: number): Promise<number> {
    return this.query(async (client) => {
      const result = await client.queryObject<{ count: bigint }>`
        SELECT COUNT(*) as count FROM community_bans WHERE community_id = ${communityId}
      `;
      return Number(result.rows[0].count);
    });
  }

  // ============ Membership (via follows) ============

  async isMember(communityId: number, actorId: number): Promise<boolean> {
    return this.query(async (client) => {
      const result = await client.queryArray`
        SELECT 1 FROM follows
        WHERE follower_id = ${actorId} AND following_id = ${communityId} AND status = 'accepted'
      `;
      return result.rows.length > 0;
    });
  }

  async getMembershipStatus(communityId: number, actorId: number): Promise<'accepted' | 'pending' | null> {
    return this.query(async (client) => {
      const result = await client.queryObject<{ status: string }>`
        SELECT status FROM follows
        WHERE follower_id = ${actorId} AND following_id = ${communityId}
      `;
      if (result.rows.length === 0) return null;
      return result.rows[0].status as 'accepted' | 'pending';
    });
  }

  async getJoinedCommunities(actorId: number, limit = 50): Promise<Community[]> {
    return this.query(async (client) => {
      const result = await client.queryObject<Actor>`
        SELECT a.* FROM actors a
        JOIN follows f ON a.id = f.following_id
        WHERE f.follower_id = ${actorId} AND a.actor_type = 'Group' AND f.status = 'accepted'
        ORDER BY a.name ASC
        LIMIT ${limit}
      `;
      return result.rows.map((actor) => ({
        ...actor,
        member_count: actor.follower_count,
      })) as Community[];
    });
  }

  async getMembers(communityId: number, limit = 50, before?: number): Promise<Actor[]> {
    return this.query(async (client) => {
      const query = before
        ? `SELECT a.* FROM actors a
           JOIN follows f ON a.id = f.follower_id
           WHERE f.following_id = $1 AND a.id < $2 AND f.status = 'accepted'
           ORDER BY f.created_at DESC LIMIT $3`
        : `SELECT a.* FROM actors a
           JOIN follows f ON a.id = f.follower_id
           WHERE f.following_id = $1 AND f.status = 'accepted'
           ORDER BY f.created_at DESC LIMIT $2`;
      const params = before ? [communityId, before, limit] : [communityId, limit];
      const result = await client.queryObject<Actor>(query, params);
      return result.rows;
    });
  }

  async getMemberCount(communityId: number): Promise<number> {
    return this.query(async (client) => {
      // Use pre-computed follower_count column for O(1) lookup
      const result = await client.queryObject<{ follower_count: number }>`
        SELECT follower_count FROM actors WHERE id = ${communityId}
      `;
      return result.rows[0]?.follower_count ?? 0;
    });
  }

  // ============ Community Posts ============

  async submitCommunityPost(communityId: number, postId: number, autoApprove: boolean): Promise<CommunityPost> {
    return this.query(async (client) => {
      const status = autoApprove ? "approved" : "pending";
      // is_announcement = false because this is a direct post TO the community
      const result = await client.queryObject<CommunityPost>`
        INSERT INTO community_posts (community_id, post_id, status, is_announcement)
        VALUES (${communityId}, ${postId}, ${status}, false)
        ON CONFLICT (community_id, post_id) DO UPDATE SET status = ${status}
        RETURNING *
      `;

      // Set community_id on the post if approved
      if (status === "approved") {
        await client.queryArray`
          UPDATE posts SET community_id = ${communityId} WHERE id = ${postId}
        `;
      }

      return result.rows[0];
    });
  }

  async suggestCommunityPost(communityId: number, postId: number, suggesterId: number): Promise<CommunityPost> {
    return this.query(async (client) => {
      // Suggestions always go to pending (never auto-approve)
      // is_announcement = true because this is an external post being boosted/announced by the community
      const result = await client.queryObject<CommunityPost>`
        INSERT INTO community_posts (community_id, post_id, status, is_announcement, suggested_by)
        VALUES (${communityId}, ${postId}, 'pending', true, ${suggesterId})
        ON CONFLICT (community_id, post_id) DO NOTHING
        RETURNING *
      `;
      if (!result.rows[0]) {
        throw new Error("Post already submitted to this community");
      }
      return result.rows[0];
    });
  }

  async getCommunityPostStatus(communityId: number, postId: number): Promise<CommunityPost | null> {
    return this.query(async (client) => {
      const result = await client.queryObject<CommunityPost>`
        SELECT * FROM community_posts WHERE community_id = ${communityId} AND post_id = ${postId}
      `;
      return result.rows[0] || null;
    });
  }

  async approvePost(communityId: number, postId: number, reviewerId: number, postPublicId?: string): Promise<void> {
    await this.query(async (client) => {
      await client.queryArray`
        UPDATE community_posts
        SET status = 'approved', reviewed_at = NOW(), reviewed_by = ${reviewerId}
        WHERE community_id = ${communityId} AND post_id = ${postId}
      `;
      // Set community_id on the post for efficient lookup
      await client.queryArray`
        UPDATE posts SET community_id = ${communityId} WHERE id = ${postId}
      `;
    });
    // Log as side effect
    this.logModAction(communityId, reviewerId, "post_approved", "post", postPublicId);
  }

  async rejectPost(communityId: number, postId: number, reviewerId: number, postPublicId?: string): Promise<void> {
    await this.query(async (client) => {
      await client.queryArray`
        UPDATE community_posts
        SET status = 'rejected', reviewed_at = NOW(), reviewed_by = ${reviewerId}
        WHERE community_id = ${communityId} AND post_id = ${postId}
      `;
    });
    // Log as side effect
    this.logModAction(communityId, reviewerId, "post_rejected", "post", postPublicId);
  }

  // Remove a post from community (unboost) without deleting the actual post
  async unboostPost(communityId: number, postId: number, unboostedBy: number, postPublicId?: string): Promise<void> {
    await this.query(async (client) => {
      await client.queryArray`
        DELETE FROM community_posts WHERE community_id = ${communityId} AND post_id = ${postId}
      `;
    });
    // Log as side effect
    this.logModAction(communityId, unboostedBy, "post_unboosted", "post", postPublicId);
  }

  async getCommunityPosts(
    communityId: number,
    status: "pending" | "approved" | "rejected" | "all" = "approved",
    limit = 20,
    before?: number,
    sort: "new" | "hot" = "new"
  ): Promise<(CommunityPost & { post: Post })[]> {
    return this.query(async (client) => {
      let query: string;
      let params: unknown[];

      const selectColumns = `
        cp.id as cp_id, cp.community_id, cp.post_id, cp.status, cp.is_announcement, cp.submitted_at, cp.reviewed_at, cp.reviewed_by, cp.suggested_by,
        p.id as p_id, p.public_id, p.uri, p.actor_id, p.content, p.url, p.in_reply_to_id, p.likes_count, p.sensitive, p.created_at, p.hot_score
      `;
      const orderBy = sort === "hot" ? "p.hot_score DESC, p.id DESC" : "p.id DESC";

      if (status === "all") {
        query = before
          ? `SELECT ${selectColumns} FROM community_posts cp
             JOIN posts p ON cp.post_id = p.id
             WHERE cp.community_id = $1 AND p.id < $2
             ORDER BY ${orderBy} LIMIT $3`
          : `SELECT ${selectColumns} FROM community_posts cp
             JOIN posts p ON cp.post_id = p.id
             WHERE cp.community_id = $1
             ORDER BY ${orderBy} LIMIT $2`;
        params = before ? [communityId, before, limit] : [communityId, limit];
      } else {
        query = before
          ? `SELECT ${selectColumns} FROM community_posts cp
             JOIN posts p ON cp.post_id = p.id
             WHERE cp.community_id = $1 AND cp.status = $2 AND p.id < $3
             ORDER BY ${orderBy} LIMIT $4`
          : `SELECT ${selectColumns} FROM community_posts cp
             JOIN posts p ON cp.post_id = p.id
             WHERE cp.community_id = $1 AND cp.status = $2
             ORDER BY ${orderBy} LIMIT $3`;
        params = before ? [communityId, status, before, limit] : [communityId, status, limit];
      }

      const result = await client.queryObject(query, params);
      return (result.rows as Record<string, unknown>[]).map((row) => ({
        id: row.cp_id as number,
        community_id: row.community_id as number,
        post_id: row.post_id as number,
        status: row.status as "pending" | "approved" | "rejected",
        is_announcement: row.is_announcement as boolean,
        submitted_at: String(row.submitted_at),
        reviewed_at: row.reviewed_at ? String(row.reviewed_at) : null,
        reviewed_by: row.reviewed_by as number | null,
        suggested_by: row.suggested_by as number | null,
        post: {
          id: row.p_id as number,
          public_id: row.public_id as string,
          uri: row.uri as string,
          actor_id: row.actor_id as number,
          content: row.content as string,
          url: row.url as string | null,
          in_reply_to_id: row.in_reply_to_id as number | null,
          likes_count: row.likes_count as number,
          sensitive: row.sensitive as boolean,
          created_at: String(row.created_at),
        } as Post,
      }));
    });
  }

  async getPendingPostsCount(communityId: number): Promise<number> {
    return this.query(async (client) => {
      const result = await client.queryObject<{ count: bigint }>`
        SELECT COUNT(*) as count FROM community_posts
        WHERE community_id = ${communityId} AND status = 'pending'
      `;
      return Number(result.rows[0].count);
    });
  }

  // Get community for a post (uses community_id column, no recursive CTE needed)
  async getCommunityForPost(postId: number): Promise<Community | null> {
    return this.query(async (client) => {
      // Direct lookup - community_id is propagated to replies
      const result = await client.queryObject<{ community_id: number }>`
        SELECT community_id FROM posts WHERE id = ${postId} AND community_id IS NOT NULL
      `;
      if (result.rows[0]) {
        return this.getCommunityByActorId(result.rows[0].community_id);
      }

      // Fallback: check community_posts table (for posts created before migration)
      const cpResult = await client.queryObject<{ community_id: number }>`
        SELECT community_id FROM community_posts WHERE post_id = ${postId} AND status = 'approved'
      `;
      if (cpResult.rows[0]) {
        return this.getCommunityByActorId(cpResult.rows[0].community_id);
      }

      return null;
    });
  }

  // ============ Pinned Posts ============

  async pinPost(communityId: number, postId: number, pinnedBy: number, postPublicId?: string): Promise<void> {
    await this.query(async (client) => {
      await client.queryArray`
        INSERT INTO community_pinned_posts (community_id, post_id, pinned_by)
        VALUES (${communityId}, ${postId}, ${pinnedBy})
        ON CONFLICT (community_id, post_id) DO NOTHING
      `;
    });
    // Log as side effect
    this.logModAction(communityId, pinnedBy, "post_pinned", "post", postPublicId);
  }

  async unpinPost(communityId: number, postId: number, unpinnedBy?: number, postPublicId?: string): Promise<void> {
    await this.query(async (client) => {
      await client.queryArray`
        DELETE FROM community_pinned_posts WHERE community_id = ${communityId} AND post_id = ${postId}
      `;
    });
    // Log as side effect
    if (unpinnedBy) {
      this.logModAction(communityId, unpinnedBy, "post_unpinned", "post", postPublicId);
    }
  }

  async isPinned(communityId: number, postId: number): Promise<boolean> {
    return this.query(async (client) => {
      const result = await client.queryArray`
        SELECT 1 FROM community_pinned_posts WHERE community_id = ${communityId} AND post_id = ${postId}
      `;
      return result.rows.length > 0;
    });
  }

  async getPinnedPostIds(communityId: number): Promise<Set<number>> {
    return this.query(async (client) => {
      const result = await client.queryObject<{ post_id: number }>`
        SELECT post_id FROM community_pinned_posts WHERE community_id = ${communityId}
      `;
      return new Set(result.rows.map(r => r.post_id));
    });
  }

  async getPinnedPosts(communityId: number): Promise<(CommunityPost & { post: Post })[]> {
    return this.query(async (client) => {
      const result = await client.queryObject`
        SELECT
          cp.id as cp_id, cp.community_id, cp.post_id, cp.status, cp.is_announcement, cp.submitted_at, cp.reviewed_at, cp.reviewed_by, cp.suggested_by,
          p.id as p_id, p.public_id, p.uri, p.actor_id, p.content, p.url, p.in_reply_to_id, p.likes_count, p.sensitive, p.created_at, p.hot_score,
          cpp.pinned_at
        FROM community_pinned_posts cpp
        JOIN community_posts cp ON cpp.community_id = cp.community_id AND cpp.post_id = cp.post_id
        JOIN posts p ON cp.post_id = p.id
        WHERE cpp.community_id = ${communityId} AND cp.status = 'approved'
        ORDER BY cpp.pinned_at DESC
      `;
      return (result.rows as Record<string, unknown>[]).map((row) => ({
        id: row.cp_id as number,
        community_id: row.community_id as number,
        post_id: row.post_id as number,
        status: row.status as "pending" | "approved" | "rejected",
        is_announcement: row.is_announcement as boolean,
        submitted_at: String(row.submitted_at),
        reviewed_at: row.reviewed_at ? String(row.reviewed_at) : null,
        reviewed_by: row.reviewed_by as number | null,
        suggested_by: row.suggested_by as number | null,
        post: {
          id: row.p_id as number,
          public_id: row.public_id as string,
          uri: row.uri as string,
          actor_id: row.actor_id as number,
          content: row.content as string,
          url: row.url as string | null,
          in_reply_to_id: row.in_reply_to_id as number | null,
          likes_count: row.likes_count as number,
          sensitive: row.sensitive as boolean,
          created_at: String(row.created_at),
        } as Post,
      }));
    });
  }

  // ============ Moderation Logs ============

  logModAction(
    communityId: number,
    actorId: number,
    action: ModLogAction,
    targetType?: string,
    targetId?: string,
    details?: string
  ): void {
    // Fire and forget - don't await, don't let failures affect the main operation
    this.query(async (client) => {
      await client.queryArray`
        INSERT INTO community_mod_logs (community_id, actor_id, action, target_type, target_id, details)
        VALUES (${communityId}, ${actorId}, ${action}, ${targetType || null}, ${targetId || null}, ${details || null})
      `;
    }).catch((e) => {
      console.error(`[ModLog] Failed to log action ${action}:`, e);
    });
  }

  async getModLogs(communityId: number, limit = 50, before?: number): Promise<ModLogEntry[]> {
    return this.query(async (client) => {
      const query = before
        ? `SELECT * FROM community_mod_logs WHERE community_id = $1 AND id < $2 ORDER BY id DESC LIMIT $3`
        : `SELECT * FROM community_mod_logs WHERE community_id = $1 ORDER BY id DESC LIMIT $2`;
      const params = before ? [communityId, before, limit] : [communityId, limit];
      const result = await client.queryObject<ModLogEntry>(query, params);
      return result.rows;
    });
  }

  // Get community by URI (for federation)
  async getCommunityByUri(uri: string): Promise<Community | null> {
    return this.query(async (client) => {
      const result = await client.queryObject<Actor>`
        SELECT * FROM actors WHERE uri = ${uri} AND actor_type = 'Group'
      `;
      if (!result.rows[0]) return null;
      return this.getCommunityByActorId(result.rows[0].id);
    });
  }

  // Get trending communities (most new members in last 24h) - local only
  async getTrendingCommunities(limit = 3): Promise<(Community & { new_members: number })[]> {
    return this.query(async (client) => {
      const result = await client.queryObject<Actor & { new_members: bigint }>`
        SELECT a.*, COUNT(f.follower_id) as new_members
        FROM actors a
        JOIN follows f ON f.following_id = a.id
        WHERE f.created_at > NOW() - INTERVAL '24 hours'
          AND a.actor_type = 'Group'
          AND a.created_by IS NOT NULL
        GROUP BY a.id
        ORDER BY new_members DESC
        LIMIT ${limit}
      `;
      return result.rows.map(row => ({
        ...row,
        member_count: row.follower_count,
        new_members: Number(row.new_members),
      })) as (Community & { new_members: number })[];
    });
  }

  // Search communities
  async searchCommunities(query: string, limit = 20): Promise<Community[]> {
    return this.query(async (client) => {
      const escaped = escapeLikePattern(query);
      const pattern = `%${escaped}%`;
      const result = await client.queryObject<Actor>`
        SELECT * FROM actors
        WHERE actor_type = 'Group'
          AND (handle ILIKE ${pattern} OR name ILIKE ${pattern} OR bio ILIKE ${pattern})
        ORDER BY follower_count DESC
        LIMIT ${limit}
      `;
      return result.rows.map((actor) => ({
        ...actor,
        member_count: actor.follower_count,
      })) as Community[];
    });
  }

  // Get communities for multiple posts (batch) - returns minimal community info for post banners
  async getCommunitiesForPosts(postIds: number[]): Promise<Map<number, { public_id: string; name: string | null; handle: string; avatar_url: string | null; is_local: boolean }>> {
    if (postIds.length === 0) return new Map();

    return this.query(async (client) => {
      // Get community info for posts that are in communities
      const result = await client.queryObject<{ post_id: number; public_id: string; name: string | null; handle: string; avatar_url: string | null; created_by: number | null }>`
        SELECT cp.post_id, a.public_id, a.name, a.handle, a.avatar_url, a.created_by
        FROM community_posts cp
        JOIN actors a ON cp.community_id = a.id
        WHERE cp.post_id = ANY(${postIds}::int[]) AND cp.status = 'approved'
      `;

      const map = new Map<number, { public_id: string; name: string | null; handle: string; avatar_url: string | null; is_local: boolean }>();
      for (const row of result.rows) {
        map.set(row.post_id, {
          public_id: row.public_id,
          name: row.name,
          handle: row.handle,
          avatar_url: row.avatar_url,
          is_local: row.created_by !== null,
        });
      }
      return map;
    });
  }
}
