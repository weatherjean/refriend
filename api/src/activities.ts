/**
 * Activities - Federation Activity Processing
 *
 * This module re-exports from the modular federation domain.
 * The actual implementation has been split into:
 * - domains/federation/processor.ts - Main processActivity orchestrator
 * - domains/federation/actor-persistence.ts - persistActor, setCommunityDb
 * - domains/federation/handlers/*.ts - Individual activity handlers
 * - domains/federation/utils/*.ts - Shared utilities
 */

export {
  processActivity,
  type ProcessResult,
} from "./domains/federation/processor.ts";

export {
  persistActor,
  setCommunityDb,
} from "./domains/federation/actor-persistence.ts";
