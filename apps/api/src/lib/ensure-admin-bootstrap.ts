import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { logger } from './logger.js';
import { prisma } from './prisma.js';

/**
 * Ensures a working staff ADMIN exists.
 *
 * - Development: always keeps admin@example.com / admin121 (or DEV_ADMIN_* overrides)
 * - Production: only when ADMIN_BOOTSTRAP_PASSWORD is set (opt-in recovery after
 *   default-password lockout). Remove the env var after you can sign in.
 */
export async function ensureAdminBootstrap(): Promise<void> {
  const bootstrapPassword = (process.env.ADMIN_BOOTSTRAP_PASSWORD || '').trim();
  const isDev = !config.isProduction;

  if (!isDev && !bootstrapPassword) return;
  if (bootstrapPassword && bootstrapPassword.length < 8) {
    logger.warn('ADMIN_BOOTSTRAP_PASSWORD ignored (must be at least 8 characters)');
    if (!isDev) return;
  }

  const email = (
    process.env.ADMIN_BOOTSTRAP_EMAIL ||
    process.env.DEV_ADMIN_EMAIL ||
    (isDev ? 'admin@example.com' : 'admin@adarsha.jp')
  )
    .trim()
    .toLowerCase();

  const password =
    bootstrapPassword ||
    process.env.DEV_ADMIN_PASSWORD ||
    (isDev ? 'admin121' : '');

  if (!email || !password) return;

  try {
    const existing = await prisma.user.findFirst({
      where: { email },
      select: { id: true, passwordHash: true, isActive: true, role: true },
    });
    const passwordHash = await bcrypt.hash(password, 10);

    if (!existing) {
      await prisma.user.create({
        data: {
          email,
          name: 'Adarsha Admin',
          role: 'ADMIN',
          isActive: true,
          passwordHash,
        },
      });
      logger.info({ email }, isDev ? 'Created local admin account' : 'Bootstrapped production admin account');
      return;
    }

    const passwordOk = await bcrypt.compare(password, existing.passwordHash);
    const needsRepair = !passwordOk || !existing.isActive || existing.role !== 'ADMIN';
    if (!needsRepair) return;

    await prisma.user.update({
      where: { id: existing.id },
      data: {
        passwordHash,
        isActive: true,
        role: 'ADMIN',
      },
    });
    logger.info(
      { email },
      isDev ? 'Reset local admin password for development' : 'Reactivated production admin via ADMIN_BOOTSTRAP_PASSWORD',
    );
  } catch (err) {
    logger.warn({ err }, 'Could not ensure admin bootstrap account');
  }
}
