/**
 * Federation Actors
 *
 * Handles remote actor persistence and lookup.
 */

// Re-export from the new modular actor-persistence module
export { persistActor, setCommunityDb, getCommunityDb } from "./actor-persistence.ts";
