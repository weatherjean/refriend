/**
 * Social Repository
 *
 * Database operations for follows, likes, boosts, blocks, and mutes.
 */

import type { DB } from "../../db.ts";
import type { Actor } from "../../shared/types.ts";

// ============ Follows ============

export async function addFollow(db: DB, followerId: number, followingId: number): Promise<void> {
  await db.addFollow(followerId, followingId);
}

export async function removeFollow(db: DB, followerId: number, followingId: number): Promise<void> {
  await db.removeFollow(followerId, followingId);
}

export async function isFollowing(db: DB, followerId: number, followingId: number): Promise<boolean> {
  return db.isFollowing(followerId, followingId);
}

export async function getFollowers(db: DB, actorId: number): Promise<Actor[]> {
  return db.getFollowers(actorId);
}

export async function getFollowing(db: DB, actorId: number): Promise<Actor[]> {
  return db.getFollowing(actorId);
}

export async function getFollowersCount(db: DB, actorId: number): Promise<number> {
  return db.getFollowersCount(actorId);
}

export async function getFollowingCount(db: DB, actorId: number): Promise<number> {
  return db.getFollowingCount(actorId);
}

export async function getFollowingByType(db: DB, actorId: number, actorType: 'Person' | 'Group', limit: number, offset: number): Promise<Actor[]> {
  return db.getFollowingByType(actorId, actorType, limit, offset);
}

export async function getFollowingCountByType(db: DB, actorId: number, actorType: 'Person' | 'Group'): Promise<number> {
  return db.getFollowingCountByType(actorId, actorType);
}

// ============ Likes ============

export async function addLike(db: DB, actorId: number, postId: number): Promise<void> {
  return db.addLike(actorId, postId);
}

export async function removeLike(db: DB, actorId: number, postId: number): Promise<void> {
  return db.removeLike(actorId, postId);
}

export async function hasLiked(db: DB, actorId: number, postId: number): Promise<boolean> {
  return db.hasLiked(actorId, postId);
}

export async function getLikesCount(db: DB, postId: number): Promise<number> {
  return db.getLikesCount(postId);
}

// ============ Boosts ============

export async function addBoost(db: DB, actorId: number, postId: number): Promise<void> {
  return db.addBoost(actorId, postId);
}

export async function removeBoost(db: DB, actorId: number, postId: number): Promise<void> {
  return db.removeBoost(actorId, postId);
}

export async function hasBoosted(db: DB, actorId: number, postId: number): Promise<boolean> {
  return db.hasBoosted(actorId, postId);
}

export async function getBoostsCount(db: DB, postId: number): Promise<number> {
  return db.getBoostsCount(postId);
}

// ============ Blocks ============
// TODO: Block functionality not yet implemented in DB

export async function addBlock(_db: DB, _blockerId: number, _blockedId: number): Promise<void> {
  throw new Error("Block functionality not implemented");
}

export async function removeBlock(_db: DB, _blockerId: number, _blockedId: number): Promise<void> {
  throw new Error("Block functionality not implemented");
}

export async function isBlocked(_db: DB, _blockerId: number, _blockedId: number): Promise<boolean> {
  return false;
}

// ============ Mutes ============
// TODO: Mute functionality not yet implemented in DB

export async function addMute(_db: DB, _muterId: number, _mutedId: number): Promise<void> {
  throw new Error("Mute functionality not implemented");
}

export async function removeMute(_db: DB, _muterId: number, _mutedId: number): Promise<void> {
  throw new Error("Mute functionality not implemented");
}

export async function isMuted(_db: DB, _muterId: number, _mutedId: number): Promise<boolean> {
  return false;
}

// ============ Batch Operations ============

export async function getLikedPostIds(db: DB, actorId: number, postIds: number[]): Promise<Set<number>> {
  return db.getLikedPostIds(actorId, postIds);
}

export async function getBoostedPostIds(db: DB, actorId: number, postIds: number[]): Promise<Set<number>> {
  return db.getBoostedPostIds(actorId, postIds);
}

export async function getPinnedPostIds(db: DB, actorId: number, postIds: number[]): Promise<Set<number>> {
  return db.getPinnedPostIds(actorId, postIds);
}

// ============ Boosted Posts ============

export async function getBoostedPostsWithActor(
  db: DB,
  actorId: number,
  limit: number,
  before?: number
) {
  return db.getBoostedPostsWithActor(actorId, limit, before);
}
