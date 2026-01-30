/**
 * Federation Domain
 *
 * Re-exports all public interfaces from the federation domain.
 * The core Fedify setup remains in api/src/federation.ts.
 */

export {
  federation,
  setDomain,
  setDB,
  getDB,
  getDomain,
} from "./setup.ts";

export {
  persistActor,
} from "./actor-persistence.ts";

export {
  processActivity,
  type ProcessResult,
} from "./processor.ts";

export * from "./handlers/index.ts";
export * from "./utils/index.ts";
