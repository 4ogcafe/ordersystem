import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config.js';
import { errorHandler, notFoundHandler } from './lib/errors.js';
import authRoutes from './routes/auth.js';
import menuRoutes from './routes/menu.js';
import settingsRoutes from './routes/settings.js';
import carouselsRoutes from './routes/carousels.js';
import contactRoutes from './routes/contact.js';
import usersRoutes from './routes/users.js';
import uploadRoutes from './routes/upload.js';
import dashboardRoutes from './routes/dashboard.js';
import orderRoutes from './routes/orders.js';
import customerRoutes from './routes/customers.js';
import offerRoutes from './routes/offers.js';
import stampRoutes from './routes/stamps.js';

import reviewRoutes from './routes/reviews.js';
import pushRoutes from './routes/push.js';
import squareRoutes from './routes/square.js';
import gameRoutes from './routes/game.js';
import jobsRoutes from './routes/jobs.js';
import blogRoutes from './routes/blogs.js';
import storeRoutes from './routes/stores.js';
import cashRegisterRoutes from './routes/cash-register.js';

const JSON_BODY_LIMIT = '100kb';
const UPLOAD_MAX_AGE = '30d';

export function createApp() {
  const app = express();

  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');

  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  // Images are loaded by the web app, which may run on another origin. The CSP also covers the
  // web app when it is served from here: Google Fonts, the Google Maps embed, the inline font
  // `onload` swap in index.html, and menu/carousel images hosted elsewhere.
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: {
        directives: {
          'script-src-attr': ["'unsafe-inline'"],
          'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],
          'img-src': ["'self'", 'data:', 'blob:', 'https:'],
          'frame-src': ['https://www.google.com', 'https://maps.google.com', 'https://pci.squarecdn.com'],
          'connect-src': ["'self'", 'https://pci.squareup.com', 'https://js.squareup.com', ...config.corsOrigins],
          'script-src': ["'self'", 'https://sandbox.web.squarecdn.com', 'https://web.squarecdn.com'],
        },
      },
    }),
  );
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  // Upload names are unique, so files can be cached for a long time. The sandbox CSP stops any
  // file that slipped through from running scripts on this origin.
  app.use(
    '/uploads',
    express.static(config.uploadDir, {
      maxAge: UPLOAD_MAX_AGE,
      immutable: true,
      setHeaders: (res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      },
    }),
  );

  app.get('/api/v1/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/menu', menuRoutes);
  app.use('/api/v1/settings', settingsRoutes);
  app.use('/api/v1/carousels', carouselsRoutes);
  app.use('/api/v1/contact', contactRoutes);
  app.use('/api/v1/users', usersRoutes);
  app.use('/api/v1/upload', uploadRoutes);
  app.use('/api/v1/dashboard', dashboardRoutes);
  app.use('/api/v1/orders', orderRoutes);
  app.use('/api/v1/customers', customerRoutes);
  app.use('/api/v1/offers', offerRoutes);
  app.use('/api/v1/stamps', stampRoutes);

  app.use('/api/v1/reviews', reviewRoutes);
  app.use('/api/v1/push', pushRoutes);
  app.use('/api/v1/square', squareRoutes);
  app.use('/api/v1/game', gameRoutes);
  app.use('/api/v1/jobs', jobsRoutes);
  app.use('/api/v1/blogs', blogRoutes);
  app.use('/api/v1/stores', storeRoutes);
  app.use('/api/v1/cash-register', cashRegisterRoutes);

  if (fs.existsSync(path.join(config.webDistDir, 'index.html'))) {
    // Serve the built site; any other GET outside /api and /uploads is a client-side route.
    app.use(express.static(config.webDistDir, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api\/|uploads\/).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(config.webDistDir, 'index.html'));
    });
  } else {
    // No build here (e.g. development): send visitors to the web app instead of a JSON 404.
    app.get('/', (_req, res) => res.redirect(config.corsOrigins[0] ?? '/api/v1/health'));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
