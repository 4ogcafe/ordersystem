import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { logger } from './lib/logger.js';

const isProduction = process.env.NODE_ENV === 'production';
const MIN_SECRET_LENGTH = 32;

function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= MIN_SECRET_LENGTH) return secret;
  if (isProduction) {
    throw new Error(`JWT_SECRET must be set to at least ${MIN_SECRET_LENGTH} characters in production`);
  }
  logger.warn('JWT_SECRET is missing or too short; using a random secret for this process (sessions reset on restart)');
  return crypto.randomBytes(48).toString('hex');
}

function parseTrustProxy(value: string | undefined): boolean | number | string {
  if (value === undefined || value === '' || value === 'false') return false;
  if (value === 'true') return true;
  const hops = Number(value);
  return Number.isInteger(hops) ? hops : value;
}

export const config = {
  isProduction,
  port: Number(process.env.PORT) || 4000,
  databaseUrl: process.env.DATABASE_URL || 'mysql://root:password@localhost:3306/adarsharestro',
  jwtSecret: resolveJwtSecret(),
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  // New member accounts allowed per IP per hour (spam protection).
  registerMaxPerHour: Number(process.env.REGISTER_MAX_PER_HOUR) || 10,
  // Orders allowed per IP per hour (spam protection).
  orderMaxPerHour: Number(process.env.ORDER_MAX_PER_HOUR) || 10,
  // Google Places API key (server only) for showing the restaurant's Google rating and reviews.
  googlePlacesApiKey: process.env.GOOGLE_PLACES_API_KEY?.trim() || '',
  uploadDir: process.env.UPLOAD_DIR
    ? path.resolve(process.env.UPLOAD_DIR)
    : [
        path.resolve(process.cwd(), 'uploads'),
        path.resolve(process.cwd(), '../../uploads'),
        path.resolve(__dirname, '../../../uploads'),
        path.resolve(process.cwd(), 'public_html', 'uploads'),
      ].find((d) => fs.existsSync(d)) || path.resolve(process.cwd(), 'uploads'),
  // Built web app (`pnpm --filter web build`). When present, the API serves the site too.
  webDistDir: path.resolve(
    process.env.WEB_DIST_DIR ||
      [
        path.join(process.cwd(), '..', 'web', 'dist'),
        path.join(process.cwd(), 'apps', 'web', 'dist'),
        path.join(process.cwd(), 'public_html'),
      ].find((d) => fs.existsSync(d)) ||
      path.join(process.cwd(), '..', 'web', 'dist'),
  ),
  square: {
    accessToken: process.env.SQUARE_ACCESS_TOKEN?.trim() || '',
    applicationId: process.env.SQUARE_APPLICATION_ID?.trim() || '',
    locationId: process.env.SQUARE_LOCATION_ID?.trim() || '',
    environment: (process.env.SQUARE_ENVIRONMENT?.trim() || 'sandbox') as 'sandbox' | 'production',
    webhookSignatureKey: process.env.SQUARE_WEBHOOK_SIGNATURE_KEY?.trim() || '',
    webhookUrl: process.env.SQUARE_WEBHOOK_URL?.trim() || '',
  },
};
