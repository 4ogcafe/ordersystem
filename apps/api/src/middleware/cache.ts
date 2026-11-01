import type { RequestHandler } from 'express';

// Public content may be up to 60 s stale (PRD FR-A12). Browsers keep a copy but check it on every load;
// Express's ETag turns that check into a tiny "304 Not Modified" when nothing changed, so admin edits
// (menu, settings, footer) show straight away. The admin UI itself fetches with cache: 'no-store'.
export const publicCache: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'public, no-cache');
  next();
};
