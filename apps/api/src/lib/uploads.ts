import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from './logger.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

/** Monorepo root (`/…/adarsha`), parent of `apps/`. This file is at `apps/api/src/lib/`. */
export function monorepoRoot(): string {
  return path.resolve(moduleDir, '../../../..');
}

/**
 * Single canonical folder for ALL site images (food, heroes, logos, carousels).
 * Never write under apps/web/public/ or repo-root loose files.
 */
export function resolveUploadDir(envValue?: string): string {
  if (envValue?.trim()) return path.resolve(envValue.trim());
  return path.join(monorepoRoot(), 'uploads');
}

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|svg|ico)$/i;

/** Brand / site images that used to live in `public/` or the repo root. */
export const BRAND_IMAGE_FILES = [
  'adarsha-log.webp',
  'site-logo-01.webp',
  'logo-white-01.png.webp',
  'new-logo.webp',
  'web-logo-01-01.png.webp',
] as const;

export function isBrandImageFile(name: string): boolean {
  const base = path.basename(name).toLowerCase();
  return BRAND_IMAGE_FILES.some((f) => f.toLowerCase() === base);
}

/** Legacy folders that used to hold food images. */
export function legacyUploadDirs(canonical: string): string[] {
  const root = monorepoRoot();
  const candidates = [
    path.join(root, 'kalpana-uploads'),
    path.join(root, 'public', 'uploads'),
    path.join(root, 'apps', 'web', 'public', 'uploads'),
    path.join(root, 'apps', 'api', 'uploads'),
    path.join(root, 'apps', 'api', 'public', 'uploads'),
    path.join(root, 'api', 'uploads'),
    path.resolve(process.cwd(), 'uploads'),
    path.resolve(process.cwd(), 'public', 'uploads'),
  ];

  const canonicalReal = (() => {
    try {
      fs.mkdirSync(canonical, { recursive: true });
      return fs.realpathSync(canonical);
    } catch {
      return path.resolve(canonical);
    }
  })();

  const seen = new Set<string>();
  const out: string[] = [];
  for (const dir of candidates) {
    let real: string;
    try {
      if (!fs.existsSync(dir)) continue;
      real = fs.realpathSync(dir);
    } catch {
      continue;
    }
    if (real === canonicalReal || seen.has(real)) continue;
    seen.add(real);
    out.push(real);
  }
  return out;
}

function moveImageFile(src: string, dst: string): boolean {
  try {
    const st = fs.statSync(src);
    if (!st.isFile()) return false;
    if (!fs.existsSync(dst)) {
      fs.copyFileSync(src, dst);
    }
    fs.unlinkSync(src);
    return true;
  } catch (err) {
    logger.warn({ err, src }, 'Could not migrate image file');
    return false;
  }
}

/** Copy any missing image files into the canonical folder, then remove the legacy copy. */
export function consolidateLegacyUploads(canonical: string): { moved: number; removedDirs: string[]; brandMoved: number } {
  fs.mkdirSync(canonical, { recursive: true });
  let moved = 0;
  let brandMoved = 0;
  const removedDirs: string[] = [];

  for (const srcDir of legacyUploadDirs(canonical)) {
    let files: string[];
    try {
      files = fs.readdirSync(srcDir);
    } catch {
      continue;
    }

    for (const name of files) {
      if (name.startsWith('.')) continue;
      if (!IMAGE_EXT.test(name)) continue;
      const src = path.join(srcDir, name);
      const dst = path.join(canonical, name);
      if (moveImageFile(src, dst)) moved += 1;
    }

    try {
      const leftover = fs.readdirSync(srcDir).filter((n) => n !== '.DS_Store' && n !== '.htaccess');
      if (leftover.length === 0) {
        for (const n of fs.readdirSync(srcDir)) {
          try {
            fs.unlinkSync(path.join(srcDir, n));
          } catch {
            /* ignore */
          }
        }
        fs.rmdirSync(srcDir);
        removedDirs.push(srcDir);
      }
    } catch {
      /* ignore */
    }
  }

  // Brand logos: repo root + apps/web/public → uploads/
  const root = monorepoRoot();
  const brandSources = [
    root,
    path.join(root, 'apps', 'web', 'public'),
    path.join(root, 'apps', 'web', 'dist'),
    path.join(root, 'public_html'),
  ];
  for (const dir of brandSources) {
    for (const name of BRAND_IMAGE_FILES) {
      const src = path.join(dir, name);
      if (!fs.existsSync(src)) continue;
      const dst = path.join(canonical, name);
      // Never delete from uploads itself
      try {
        if (fs.realpathSync(path.dirname(src)) === fs.realpathSync(canonical)) continue;
      } catch {
        /* compare by path */
        if (path.resolve(dir) === path.resolve(canonical)) continue;
      }
      const existed = fs.existsSync(dst);
      if (moveImageFile(src, dst)) {
        brandMoved += 1;
        if (!existed) moved += 1;
      }
    }
  }

  return { moved, removedDirs, brandMoved };
}

export function ensureUploadDir(canonical: string): void {
  fs.mkdirSync(canonical, { recursive: true });
  const { moved, removedDirs, brandMoved } = consolidateLegacyUploads(canonical);
  if (moved > 0 || removedDirs.length > 0 || brandMoved > 0) {
    logger.info(
      { uploadDir: canonical, moved, brandMoved, removedDirs },
      'Consolidated all images into single uploads/ folder',
    );
  } else {
    logger.info({ uploadDir: canonical }, 'Image store ready');
  }
}
