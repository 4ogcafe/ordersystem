import { z } from 'zod';
import { AppError } from './errors.js';

// HTML forms send numbers as strings and empty inputs as ''; treat '' and null as "not provided".
const blankToUndefined = (value: unknown) => (value === '' || value === null ? undefined : value);

export const optionalNumber = (schema: z.ZodNumber) => z.preprocess(blankToUndefined, z.coerce.number().pipe(schema).optional());

export const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

// IDs are UUIDs after the MySQL migration; accept any non-empty string.
export const objectIdString = z.string().min(1).max(128);

// Images live in the single /uploads/ store (or absolute https). Legacy root brand paths
// like /site-logo-01.webp are accepted and normalised to /uploads/...
const LEGACY_UPLOAD_PREFIX = /^https?:\/\/localhost:\d+(?=\/uploads\/)/;
const UNSAFE_URL_CHARS = /[\s"'<>()\\]/;
const ROOT_BRAND_IMAGE = /^\/(adarsha-log|logo-white|new-logo|site-logo|web-logo)[^/]*\.(?:webp|png|jpe?g|gif)$/i;
const SITE_IMAGE = /^\/(?!\/)(?:[\w.-]+\/)*[\w.-]+\.(?:webp|png|jpe?g|gif)$/;

function isSafeUrl(value: string): boolean {
  return value === '' || (!UNSAFE_URL_CHARS.test(value) && !value.includes('..'));
}

function normalizeImagePath(value: string): string {
  const stripped = value.replace(LEGACY_UPLOAD_PREFIX, '');
  if (ROOT_BRAND_IMAGE.test(stripped)) return `/uploads/${stripped.replace(/^\//, '')}`;
  return stripped;
}

export const imageUrl = z
  .string()
  .trim()
  .max(2048)
  .transform(normalizeImagePath)
  .refine(
    (value) => isSafeUrl(value) && (value === '' || /^\/uploads\/[\w.-]+$/.test(value) || SITE_IMAGE.test(value) || /^https:\/\//.test(value)),
    'Must be an uploaded image under /uploads/, or an https URL',
  );

export const httpsUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => isSafeUrl(value) && (value === '' || /^https:\/\//.test(value)), 'Must be an https URL');

/** Per-branch Hot Pepper restaurant page (https://…hotpepper.jp/… only). */
export const hotpepperSiteUrl = z
  .string()
  .trim()
  .max(2048)
  .refine(
    (value) =>
      value === '' ||
      (isSafeUrl(value) && /^https:\/\/([a-z0-9-]+\.)*hotpepper\.jp([/?#]|$)/i.test(value)),
    'Use an https://www.hotpepper.jp/... link',
  );

/** Per-branch Tabelog restaurant page (https://…tabelog.com/… only). */
export const tabelogSiteUrl = z
  .string()
  .trim()
  .max(2048)
  .refine(
    (value) =>
      value === '' ||
      (isSafeUrl(value) && /^https:\/\/([a-z0-9-]+\.)*tabelog\.com([/?#]|$)/i.test(value)),
    'Use an https://tabelog.com/... link',
  );

/** @deprecated Prefer hotpepperSiteUrl / tabelogSiteUrl */
export const reviewSiteUrl = z
  .string()
  .trim()
  .max(2048)
  .refine(
    (value) =>
      value === '' ||
      (isSafeUrl(value) &&
        /^https:\/\/([a-z0-9-]+\.)*(hotpepper\.jp|tabelog\.com)([/?#]|$)/i.test(value)),
    'Use an https://www.hotpepper.jp/... or https://tabelog.com/... link',
  );

/** Google Maps embed used in an iframe. Anything else (javascript:, data:, other sites) is rejected. */
export const googleMapEmbedUrl = z
  .string()
  .trim()
  .max(2000)
  .refine(
    (value) =>
      value === '' ||
      (isSafeUrl(value) &&
        (/^https:\/\/([a-z0-9-]+\.)*google\.(com|co\.jp|co\.uk)\/maps([/?#]|$)/i.test(value) ||
          /^https:\/\/maps\.google\.(com|co\.jp|co\.uk)\/maps([/?#]|$)/i.test(value))),
    'Use a Google Maps embed link (https://maps.google.com/...)',
  );

export function idParam(params: { id?: string }): string {
  const id = params.id ?? '';
  if (!id) throw new AppError(400, 'INVALID_ID', 'Invalid id');
  return id;
}

/** Keeps only keys whose value was provided, so PUT handlers update just what the client sent. */
export function definedOnly<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Partial<T>;
}
