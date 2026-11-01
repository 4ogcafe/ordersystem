import bcrypt from 'bcryptjs';
import express from 'express';
import { z } from 'zod';
import { AppError, notFound } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { definedOnly, idParam } from '../lib/schemas.js';
import { requireAdmin } from '../middleware/auth.js';

const router = express.Router();

const ROLES = ['ADMIN', 'STAFF', 'KITCHEN'] as const;
const BCRYPT_COST = 12;
const password = z.string().min(8, 'Password must be at least 8 characters').max(200);

const userUpdateSchema = z.object({
  role: z.enum(ROLES).optional(),
  isActive: z.boolean().optional(),
  password: password.optional(),
});

const userCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.email().max(254).transform((value) => value.trim().toLowerCase()),
  role: z.enum(ROLES),
  password,
});

router.use(requireAdmin);

router.get('/', async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
  });
  res.setHeader('Cache-Control', 'no-store');
  res.json(users);
});

router.post('/', async (req, res) => {
  const input = userCreateSchema.parse(req.body);
  const exists = await prisma.user.findUnique({ where: { email: input.email } });
  if (exists) throw new AppError(409, 'EMAIL_TAKEN', 'A user with this email already exists');

  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      role: input.role as 'ADMIN' | 'STAFF' | 'KITCHEN',
      isActive: true,
      passwordHash: await bcrypt.hash(input.password, BCRYPT_COST),
    },
    select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
  });
  res.status(201).json(user);
});

router.put('/:id', async (req, res) => {
  const id = idParam(req.params);
  const { password: newPassword, ...fields } = definedOnly(userUpdateSchema.parse(req.body));

  if (id === req.user?.id && ((fields.role && fields.role !== 'ADMIN') || fields.isActive === false)) {
    throw new AppError(400, 'SELF_LOCKOUT', 'You cannot remove your own admin access');
  }

  const data: Record<string, unknown> = { ...fields };
  if (newPassword) data.passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);

  try {
    await prisma.user.update({ where: { id }, data });
  } catch {
    throw notFound('User');
  }
  res.json({ success: true });
});

export default router;
