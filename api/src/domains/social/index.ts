/**
 * Social Domain
 *
 * Re-exports all public interfaces from the social domain.
 */

export { createSocialRoutes } from "./routes.ts";
export {
  getFollowers,
  getFollowing,
  isFollowing,
  getLikesCount,
  hasLiked,
  getBoostsCount,
  hasBoosted,
  addBlock,
  removeBlock,
  isBlocked,
  addMute,
  removeMute,
  isMuted,
} from "./service.ts";
