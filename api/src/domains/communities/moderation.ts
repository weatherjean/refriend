import type { CommunityDB, Community } from "./repository.ts";
import type { Actor } from "../../db.ts";

export interface PostPermissionResult {
  allowed: boolean;
  reason?: string;
  requiresApproval: boolean;
  community?: Community;
}

export class CommunityModeration {
  constructor(private communityDb: CommunityDB) {}

  /**
   * Check if an actor can post to a community
   */
  async canPost(communityId: number, actorId: number): Promise<PostPermissionResult> {
    // Check if banned
    const banned = await this.communityDb.isBanned(communityId, actorId);
    if (banned) {
      return { allowed: false, reason: "You are banned from this community", requiresApproval: false };
    }

    // Check if member (following)
    const isMember = await this.communityDb.isMember(communityId, actorId);
    if (!isMember) {
      return { allowed: false, reason: "You must join this community to post", requiresApproval: false };
    }

    // Get community settings
    const community = await this.communityDb.getCommunityByActorId(communityId);
    if (!community) {
      return { allowed: false, reason: "Community not found", requiresApproval: false };
    }

    const requiresApproval = community.require_approval ?? false;

    // Admins bypass approval
    const isAdmin = await this.communityDb.isAdmin(communityId, actorId);
    if (isAdmin) {
      return { allowed: true, requiresApproval: false, community };
    }

    return { allowed: true, requiresApproval, community };
  }

  /**
   * Check if an actor can reply to a community post
   * Replies inherit community context from parent
   */
  async canReplyToCommunityPost(postId: number, actorId: number): Promise<PostPermissionResult> {
    const community = await this.communityDb.getCommunityForPost(postId);
    if (!community) {
      // Not a community post, allow normal reply
      return { allowed: true, requiresApproval: false };
    }

    return this.canPost(community.id, actorId);
  }

  /**
   * Check if an actor can moderate a community (approve/reject posts, ban users)
   */
  async canModerate(communityId: number, actorId: number): Promise<boolean> {
    return this.communityDb.isAdmin(communityId, actorId);
  }

  /**
   * Check if an actor can manage community settings and admins
   */
  async canManage(communityId: number, actorId: number): Promise<boolean> {
    return this.communityDb.isOwner(communityId, actorId);
  }

  /**
   * Get community context for a post (direct or via parent chain)
   */
  async getCommunityContext(postId: number): Promise<Community | null> {
    return this.communityDb.getCommunityForPost(postId);
  }

  /**
   * Check if an actor can delete a post in a community
   * Post must be addressed to the community (directly or via parent chain)
   * and actor must be admin/owner of the community
   */
  async canDeletePost(
    communityId: number,
    postId: number,
    actorId: number
  ): Promise<{ allowed: boolean; reason?: string }> {
    // Check if post is in this community (directly or via parent chain)
    const community = await this.communityDb.getCommunityForPost(postId);
    if (!community || community.id !== communityId) {
      return {
        allowed: false,
        reason: "Post is not addressed to this community",
      };
    }

    // Check if actor is admin/owner
    const isAdmin = await this.communityDb.isAdmin(communityId, actorId);
    if (!isAdmin) {
      return { allowed: false, reason: "Admin access required" };
    }

    return { allowed: true };
  }

  /**
   * Check if a post should be auto-approved
   * Auto-approve if: community doesn't require approval, or poster is admin
   */
  async shouldAutoApprove(communityId: number, actorId: number): Promise<boolean> {
    const community = await this.communityDb.getCommunityByActorId(communityId);
    if (!community) return false;

    // If community doesn't require approval, auto-approve
    if (!community.require_approval) {
      return true;
    }

    // If poster is admin, auto-approve
    const isAdmin = await this.communityDb.isAdmin(communityId, actorId);
    return isAdmin;
  }

  /**
   * Get moderation info for display
   */
  async getModerationInfo(communityId: number, actorId: number): Promise<{
    isMember: boolean;
    membershipStatus: 'accepted' | 'pending' | null;
    isAdmin: boolean;
    isOwner: boolean;
    isBanned: boolean;
    pendingPostsCount: number;
  }> {
    const [membershipStatus, isAdminResult, isOwner, isBanned] = await Promise.all([
      this.communityDb.getMembershipStatus(communityId, actorId),
      this.communityDb.isAdmin(communityId, actorId),
      this.communityDb.isOwner(communityId, actorId),
      this.communityDb.isBanned(communityId, actorId),
    ]);

    // isMember is true only if membership is accepted
    const isMember = membershipStatus === 'accepted';

    // Get pending count only if admin
    const pendingPostsCount = isAdminResult ? await this.communityDb.getPendingPostsCount(communityId) : 0;

    return { isMember, membershipStatus, isAdmin: isAdminResult, isOwner, isBanned, pendingPostsCount };
  }
}
