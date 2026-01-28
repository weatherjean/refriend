/**
 * Activities - Federation Activity Processing
 *
 * This module re-exports from the federation-v2 domain.
 * Legacy compatibility file - imports should use federation-v2 directly.
 */

export {
  persistActor,
  setCommunityDb,
} from "./domains/federation-v2/utils/actor.ts";

export {
  safeSendActivity,
} from "./domains/federation-v2/utils/send.ts";
