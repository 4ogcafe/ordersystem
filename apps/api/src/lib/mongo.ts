/**
 * mongo.ts — compatibility shim after the MongoDB → MySQL migration.
 *
 * All callers have been updated to use Prisma directly.  This file only
 * re-exports the helpers that are still referenced during the transition,
 * and provides a no-op `closeMongo` so server.ts doesn't need to change its
 * shutdown sequence.
 */

import { AppError } from './errors.js';
import { prisma } from './prisma.js';

/** Graceful-shutdown stub — Prisma manages its own connection pool. */
export const closeMongo = () => prisma.$disconnect();

/** Re-export prisma so callers that import `db` can be migrated incrementally. */
export const db = () => prisma;

/**
 * Validate a non-empty string ID (UUID or any other format) and return it.
 * Replaces the old `toObjectId` which validated a 24-char MongoDB ObjectId.
 */
export function toObjectId(id: string, field = 'id'): string {
  if (!id || typeof id !== 'string') throw new AppError(400, 'INVALID_ID', `Invalid ${field}`);
  return id;
}
