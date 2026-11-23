/**
 * Move food images from legacy folders into the single monorepo-root `uploads/` store.
 * Run: node --import tsx scripts/consolidate-uploads.ts
 */
import { resolveUploadDir, ensureUploadDir, legacyUploadDirs } from '../src/lib/uploads.js';

const canonical = resolveUploadDir(process.env.UPLOAD_DIR);
console.log('Canonical uploads dir:', canonical);
console.log('Legacy dirs found:', legacyUploadDirs(canonical));
ensureUploadDir(canonical);
console.log('Done.');
