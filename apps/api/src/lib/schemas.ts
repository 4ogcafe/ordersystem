import { z } from 'zod';
import { AppError } from './errors.js';

// HTML forms send numbers as strings and empty inputs as ''; treat '' and null as "not provided".
const blankToUndefined = (value: unknown) => (value === '' || value === null ? undefined : value);

export const optionalNumber = (schema: z.ZodNumber) => z.preprocess(blankToUndefined, z.coerce.number().pipe(schema).optional());

export const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

// IDs are UUIDs after the MySQL migration; accept any non-empty string.
export const objectIdString = z.string().min(1).max(128);

// Images are either files we serve from /uploads or absolute https URLs.
// Legacy rows store http://localhost:4000/uploads/... so that prefix is accepted and normalised.
const LEGACY_UPLOAD_PREFIX = /^https?:\/\/localhost:\d+(?=\/uploads\/)/;
export const imageUrl = z
  .string()
  .trim()
  .max(2048)
  .transform((value) => value.replace(LEGACY_UPLOAD_PREFIX, ''))
  .refine((value) => value === '' || /^\/uploads\/[\w.-]+$/.test(value) || /^https:\/\//.test(value), 'Must be an uploaded image or an https URL');

export const httpsUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => value === '' || /^https:\/\//.test(value), 'Must be an https URL');

export function idParam(params: { id?: string }): string {
  const id = params.id ?? '';
  if (!id) throw new AppError(400, 'INVALID_ID', 'Invalid id');
  return id;
}

/** Keeps only keys whose value was provided, so PUT handlers update just what the client sent. */
export function definedOnly<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Partial<T>;
}
