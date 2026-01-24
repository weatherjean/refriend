/**
 * Social Service
 *
 * Business logic for follows, likes, boosts, blocks, and mutes.
 * Federation activities are handled through the activities module.
 */

import type { DB } from "../../db.ts";
import type { Actor } from "../../shared/types.ts";
import * as repository from "./repository.ts";
import { sanitizeActor } from "../users/types.ts";

// ============ Follows ============

export async function getFollowers(
  db: DB,
  actorId: number,
  domain?: string
): Promise<{ followers: ReturnType<typeof sanitizeActor>[] }> {
  const followers = await repository.getFollowers(db, actorId);
  return {
    followers: followers.map((a) => sanitizeActor(a, domain)),
  };
}

export async function getFollowing(
  db: DB,
  actorId: number,
  domain?: string
): Promise<{ following: ReturnType<typeof sanitizeActor>[] }> {
  const following = await repository.getFollowing(db, actorId);
  return {
    following: following.map((a) => sanitizeActor(a, domain)),
  };
}

export async function isFollowing(
  db: DB,
  followerId: number,
  followingId: number
): Promise<boolean> {
  return repository.isFollowing(db, followerId, followingId);
}

// ============ Likes ============

export interface LikeResult {
  success: boolean;
  error?: string;
  likes_count?: number;
  liked?: boolean;
}

export async function getLikesCount(db: DB, postId: number): Promise<number> {
  return repository.getLikesCount(db, postId);
}

export async function hasLiked(db: DB, actorId: number, postId: number): Promise<boolean> {
  return repository.hasLiked(db, actorId, postId);
}

// ============ Boosts ============

export interface BoostResult {
  success: boolean;
  error?: string;
  boosts_count?: number;
  boosted?: boolean;
}

export async function getBoostsCount(db: DB, postId: number): Promise<number> {
  return repository.getBoostsCount(db, postId);
}

export async function hasBoosted(db: DB, actorId: number, postId: number): Promise<boolean> {
  return repository.hasBoosted(db, actorId, postId);
}

// ============ Blocks ============

export async function addBlock(db: DB, blockerId: number, blockedId: number): Promise<void> {
  return repository.addBlock(db, blockerId, blockedId);
}

export async function removeBlock(db: DB, blockerId: number, blockedId: number): Promise<void> {
  return repository.removeBlock(db, blockerId, blockedId);
}

export async function isBlocked(db: DB, blockerId: number, blockedId: number): Promise<boolean> {
  return repository.isBlocked(db, blockerId, blockedId);
}

// ============ Mutes ============

export async function addMute(db: DB, muterId: number, mutedId: number): Promise<void> {
  return repository.addMute(db, muterId, mutedId);
}

export async function removeMute(db: DB, muterId: number, mutedId: number): Promise<void> {
  return repository.removeMute(db, muterId, mutedId);
}

export async function isMuted(db: DB, muterId: number, mutedId: number): Promise<boolean> {
  return repository.isMuted(db, muterId, mutedId);
}
