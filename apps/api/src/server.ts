import 'dotenv/config';
import { createApp } from './app.js';
import { config } from './config.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { ensureSquareIndexes } from './lib/square-payments.js';
import { scheduleReviewRefresh } from './services/google-reviews.js';

const server = createApp().listen(config.port, () => {
  logger.info(`API server running on http://localhost:${config.port}`);
  void ensureSquareIndexes().catch(err => logger.warn({ err }, 'Square index setup failed'));
});

// Google reviews: refreshed automatically about once a month.
scheduleReviewRefresh();

function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down');
  server.close(() => {
    void prisma.$disconnect().then(() => process.exit(0));
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
