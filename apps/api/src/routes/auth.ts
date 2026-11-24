import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { AppError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { clearSession, issueSession, requireKitchen } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = Router();

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;

const loginSchema = z.object({
  email: z.string().trim().max(254),
  password: z.string().min(1).max(200),
  rememberMe: z.boolean().optional(),
});

// Compared against when the email is unknown, so response time doesn't reveal which emails exist.
let dummyHash: string | undefined;
const getDummyHash = async () => (dummyHash ??= await bcrypt.hash('not-a-real-password', 12));

const loginLimiter = rateLimit({
  windowMs: LOGIN_WINDOW_MS,
  max: LOGIN_MAX_ATTEMPTS,
  // Lock out after repeated wrong passwords (PRD FR-A1), not after normal successful logins.
  failuresOnly: true,
  key: (req) => `${req.ip}|${String(req.body?.email ?? '').trim().toLowerCase()}`,
});

async function findStaffByEmail(emailRaw: string) {
  const email = emailRaw.trim().toLowerCase();
  if (!email) return null;
  // Prefer exact lowercase match, then case-insensitive fallback for older rows.
  const exact = await prisma.user.findUnique({ where: { email } });
  if (exact) return exact;
  const rows = await prisma.$queryRawUnsafe<Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    passwordHash: string;
    isActive: boolean | number;
  }>>(
    'SELECT id, name, email, role, passwordHash, isActive FROM `User` WHERE LOWER(email) = ? LIMIT 1',
    email,
  );
  return rows[0] ? {
    id: rows[0].id,
    name: rows[0].name,
    email: rows[0].email,
    role: rows[0].role as 'ADMIN' | 'STAFF' | 'KITCHEN',
    passwordHash: rows[0].passwordHash,
    isActive: Boolean(rows[0].isActive),
  } : null;
}

router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const user = await findStaffByEmail(email);
  const passwordMatches = await bcrypt.compare(password, user?.passwordHash ?? (await getDummyHash()));

  if (!user || !passwordMatches || !user.isActive) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  const sessionUser = { id: user.id, name: user.name, email: user.email, role: user.role };
  issueSession(res, sessionUser);
  res.json({ user: sessionUser });
});

router.post('/logout', (_req, res) => {
  clearSession(res);
  res.status(204).end();
});

router.get('/me', requireKitchen, (req, res) => {
  res.json({ user: req.user });
});

export default router;
