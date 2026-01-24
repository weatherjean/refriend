/**
 * Users Repository
 *
 * Database operations for users, actors, and authentication.
 * This is a facade over db.ts that provides a cleaner domain-focused interface.
 */

import type { DB } from "../../db.ts";
import type { User, Actor } from "../../shared/types.ts";

// ============ User Operations ============

export async function createUser(
  db: DB,
  username: string,
  passwordHash: string,
  email: string
): Promise<User> {
  return db.createUser(username, passwordHash, email);
}

export async function getUserById(db: DB, id: number): Promise<User | null> {
  return db.getUserById(id);
}

export async function getUserByUsername(db: DB, username: string): Promise<User | null> {
  return db.getUserByUsername(username);
}

export async function getUserByEmail(db: DB, email: string): Promise<User | null> {
  return db.getUserByEmail(email);
}

export async function updateUserPassword(db: DB, userId: number, passwordHash: string): Promise<void> {
  return db.updateUserPassword(userId, passwordHash);
}

// ============ Session Operations ============

export async function createSession(db: DB, userId: number): Promise<string> {
  return db.createSession(userId);
}

export async function deleteSession(db: DB, token: string): Promise<void> {
  return db.deleteSession(token);
}

export async function getSession(db: DB, token: string): Promise<{ user_id: number } | null> {
  return db.getSession(token);
}

// ============ Password Reset Operations ============

export async function createPasswordResetToken(db: DB, userId: number): Promise<string> {
  return db.createPasswordResetToken(userId);
}

export async function getPasswordResetToken(db: DB, token: string) {
  return db.getPasswordResetToken(token);
}

export async function markTokenUsed(db: DB, token: string): Promise<void> {
  return db.markTokenUsed(token);
}

export async function getLastResetRequestTime(db: DB, userId: number): Promise<Date | null> {
  return db.getLastResetRequestTime(userId);
}

// ============ Actor Operations ============

export interface CreateActorInput {
  uri: string;
  handle: string;
  name: string | null;
  bio: string | null;
  avatar_url: string | null;
  inbox_url: string;
  shared_inbox_url: string | null;
  url: string | null;
  user_id: number | null;
  actor_type: "Person" | "Group";
}

export async function createActor(db: DB, input: CreateActorInput): Promise<Actor> {
  return db.createActor(input);
}

export async function getActorById(db: DB, id: number): Promise<Actor | null> {
  return db.getActorById(id);
}

export async function getActorByPublicId(db: DB, publicId: string): Promise<Actor | null> {
  return db.getActorByPublicId(publicId);
}

export async function getActorByUri(db: DB, uri: string): Promise<Actor | null> {
  return db.getActorByUri(uri);
}

export async function getActorByUserId(db: DB, userId: number): Promise<Actor | null> {
  return db.getActorByUserId(userId);
}

export async function getActorByUsername(db: DB, username: string): Promise<Actor | null> {
  return db.getActorByUsername(username);
}

export async function getActorByHandle(db: DB, handle: string): Promise<Actor | null> {
  return db.getActorByHandle(handle);
}

export async function getActorsByIds(db: DB, ids: number[]): Promise<Map<number, Actor>> {
  return db.getActorsByIds(ids);
}

export interface UpdateActorProfileInput {
  name?: string;
  bio?: string;
  avatar_url?: string;
}

export async function updateActorProfile(
  db: DB,
  actorId: number,
  updates: UpdateActorProfileInput
): Promise<Actor | null> {
  return db.updateActorProfile(actorId, updates);
}

export async function searchActors(db: DB, query: string, limit: number): Promise<Actor[]> {
  return db.searchActors(query, limit);
}

export async function getTrendingUsers(db: DB, limit: number) {
  return db.getTrendingUsers(limit);
}

// ============ Upsert for Federation ============

export interface UpsertActorInput {
  uri: string;
  handle: string;
  name: string | null;
  bio: string | null;
  avatar_url: string | null;
  inbox_url: string;
  shared_inbox_url: string | null;
  url: string | null;
  actor_type: "Person" | "Group";
}

export async function upsertActor(db: DB, input: UpsertActorInput): Promise<Actor> {
  return db.upsertActor(input);
}
