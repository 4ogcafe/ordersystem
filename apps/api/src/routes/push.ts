import express from 'express';
import { z } from 'zod';
import { AppError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { optionalCustomer } from '../middleware/customerAuth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { isPushEndpoint, removeSubscription, saveSubscription, vapidKeys } from '../services/push.js';

const router = express.Router();

const subscriptionSchema = z.object({
  endpoint: z.string().max(1000).refine(isPushEndpoint, 'Not a browser push address'),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
});
const subscribeSchema = z.object({
  subscription: subscriptionSchema,
  orderToken: z.string().regex(/^[A-Za-z0-9_-]{22}$/).optional(),
});

const limiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 60, key: (req) => `push|${req.ip}` });

router.get('/key', async (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.json({ publicKey: (await vapidKeys()).publicKey });
});

router.post('/subscribe', limiter, optionalCustomer, async (req, res) => {
  const { subscription, orderToken } = subscribeSchema.parse(req.body);
  let orderId: string | undefined;

  if (orderToken) {
    const order = await prisma.pickupOrder.findFirst({ where: { token: orderToken }, select: { id: true } });
    if (!order) throw new AppError(404, 'NOT_FOUND', 'Order not found');
    orderId = order.id;
  }

  if (!orderId && !req.customer) {
    throw new AppError(400, 'NOTHING_TO_FOLLOW', 'Sign in or open an order to turn on notifications');
  }

  await saveSubscription(subscription, { orderId, customerId: req.customer?.id });
  res.status(201).json({ success: true });
});

router.post('/unsubscribe', limiter, async (req, res) => {
  const { endpoint } = z.object({ endpoint: z.string().max(1000) }).parse(req.body);
  await removeSubscription(endpoint);
  res.json({ success: true });
});

export default router;
