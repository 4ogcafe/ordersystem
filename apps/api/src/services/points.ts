import { prisma } from '../lib/prisma.js';

export type PointType = 'EARN' | 'REDEEM' | 'REFUND' | 'BONUS' | 'ADJUST';

interface PointMeta {
  orderId?: string;
  orderNumber?: number;
  note?: string;
  userId?: string;
}

/**
 * Changes a customer's balance and records why.
 * The balance check and the change are one atomic MySQL UPDATE, so two checkouts
 * at once can't spend the same points.  Returns false if the balance is too low.
 */
export async function changePoints(customerId: string, delta: number, type: PointType, meta: PointMeta = {}): Promise<boolean> {
  if (delta === 0) return true;

  // Atomic conditional update: only proceed when the customer has enough points.
  const result = await prisma.customer.updateMany({
    where: delta < 0
      ? { id: customerId, points: { gte: -delta } }
      : { id: customerId },
    data: { points: { increment: delta }, updatedAt: new Date() },
  });

  if (result.count === 0) return false;

  // Read the new balance for the transaction record.
  const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { points: true } });

  await prisma.pointTransaction.create({
    data: {
      customerId,
      type: type as 'EARN' | 'REDEEM' | 'REFUND' | 'BONUS' | 'ADJUST',
      points: delta,
      balanceAfter: customer?.points ?? 0,
      orderId: meta.orderId ?? null,
      orderNumber: meta.orderNumber ?? null,
      note: meta.note ?? null,
      userId: meta.userId ?? null,
    },
  });

  return true;
}
