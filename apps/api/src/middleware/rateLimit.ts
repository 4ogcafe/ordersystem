import type { Request, RequestHandler } from 'express';
import { AppError } from '../lib/errors.js';

interface Window {
  count: number;
  resetAt: number;
}

const PRUNE_THRESHOLD = 10_000;

interface RateLimitOptions {
  windowMs: number;
  max: number;
  key: (req: Request) => string;
  /** Count only requests that fail (4xx/5xx) and clear the count on success, e.g. for login lockout. */
  failuresOnly?: boolean;
}

/** Fixed-window, in-memory limiter. Fine for a single API instance; use a shared store if scaled out. */
export function rateLimit(options: RateLimitOptions): RequestHandler {
  const windows = new Map<string, Window>();

  return (req, res, next) => {
    const now = Date.now();
    if (windows.size > PRUNE_THRESHOLD) {
      for (const [key, window] of windows) if (window.resetAt <= now) windows.delete(key);
    }

    const key = options.key(req);
    let window = windows.get(key);
    if (!window || window.resetAt <= now) {
      window = { count: 0, resetAt: now + options.windowMs };
      windows.set(key, window);
    }
    if (window.count >= options.max) {
      res.setHeader('Retry-After', Math.ceil((window.resetAt - now) / 1000));
      throw new AppError(429, 'RATE_LIMITED', 'Too many requests. Please try again later.');
    }

    if (!options.failuresOnly) {
      window.count += 1;
    } else {
      const counted = window;
      res.on('finish', () => {
        if (res.statusCode < 400) windows.delete(key);
        else counted.count += 1;
      });
    }
    next();
  };
}
