import { prisma } from './prisma.js';

export type PaymentChannel = 'online' | 'terminal' | 'qr';
export type PaymentStatus =
  | 'pending'
  | 'completed'
  | 'failed'
  | 'canceled'
  | 'refunded'
  | 'partially_refunded';

export interface SquarePaymentDoc {
  id: string;
  sessionId: string;
  tableNumber: string;
  channel: PaymentChannel;
  amount: number;
  currency: 'JPY';
  status: PaymentStatus;
  idempotencyKey: string;
  squarePaymentId: string | null;
  squareCheckoutId: string | null;
  squareLinkId: string | null;
  squareOrderId: string | null;
  deviceId: string | null;
  failureCode: string | null;
  refundedAmount: number;
  closedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SquareWebhookEventDoc {
  id: string;
  squareEventId: string;
  eventType: string;
  receivedAt: Date;
  processedAt: Date | null;
  processingStatus: 'pending' | 'processed' | 'failed' | 'skipped';
  payload: Record<string, unknown>;
  retryCount: number;
}

export const squarePayments = () => prisma.squarePayment;
export const squareWebhookEvents = () => prisma.squareWebhookEvent;

/** Indexes are handled by Prisma migrations; this is a no-op stub. */
export async function ensureSquareIndexes() {
  // No-op: MySQL indexes are defined in the Prisma schema and applied via migrations.
}

export function serializePayment(doc: SquarePaymentDoc) {
  return {
    id: doc.id,
    sessionId: doc.sessionId,
    tableNumber: doc.tableNumber,
    channel: doc.channel,
    amount: doc.amount,
    currency: doc.currency,
    status: doc.status,
    squarePaymentId: doc.squarePaymentId,
    squareCheckoutId: doc.squareCheckoutId,
    squareLinkId: doc.squareLinkId,
    squareOrderId: doc.squareOrderId,
    refundedAmount: doc.refundedAmount,
    failureCode: doc.failureCode,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
