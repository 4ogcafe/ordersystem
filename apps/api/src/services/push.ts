import webpush from 'web-push';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { loadSettings } from './settings-store.js';

// Web push: "your food is ready" notifications. The VAPID key pair is read from the environment
// or created once and stored in the database so it survives restarts.

interface Keys {
  publicKey: string;
  privateKey: string;
}

let keysReady: Promise<Keys> | undefined;
export function vapidKeys(): Promise<Keys> {
  keysReady ??= (async () => {
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
    }
    const saved = await prisma.appSecret.findUnique({ where: { id: 'vapid' } });
    if (saved) return { publicKey: saved.publicKey, privateKey: saved.privateKey };
    const generated = webpush.generateVAPIDKeys();
    // Upsert so two concurrent server starts always end up with the same pair.
    await prisma.appSecret.upsert({
      where: { id: 'vapid' },
      create: { id: 'vapid', publicKey: generated.publicKey, privateKey: generated.privateKey },
      update: {},
    });
    const stored = await prisma.appSecret.findUnique({ where: { id: 'vapid' } });
    return { publicKey: stored!.publicKey, privateKey: stored!.privateKey };
  })();
  return keysReady;
}

/** Only the browsers' own push services: the server never posts to any other address. */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/];
export function isPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && PUSH_HOSTS.some((host) => host.test(url.hostname));
  } catch {
    return false;
  }
}

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Links this browser subscription to an order or customer. */
export async function saveSubscription(
  subscription: PushSubscriptionInput,
  link: { orderId?: string; customerId?: string },
) {
  const now = new Date();
  const existing = await prisma.pushSubscription.findUnique({ where: { endpoint: subscription.endpoint } });

  if (existing) {
    const orderIds = Array.isArray(existing.orderIds) ? (existing.orderIds as string[]) : [];

    if (link.orderId && !orderIds.includes(link.orderId)) orderIds.push(link.orderId);

    await prisma.pushSubscription.update({
      where: { endpoint: subscription.endpoint },
      data: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        updatedAt: now,
        ...(link.customerId ? { customerId: link.customerId } : {}),
        orderIds,
      },
    });
  } else {
    await prisma.pushSubscription.create({
      data: {
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        customerId: link.customerId ?? null,
        orderIds: link.orderId ? [link.orderId] : [],
      },
    });
  }
}

export async function removeSubscription(endpoint: string) {
  await prisma.pushSubscription.deleteMany({ where: { endpoint } });
}

/** The words for each kind of order when it becomes ready. */
export function readyMessage(
  order: { number?: unknown; fulfillment?: unknown; token?: unknown },
  shopName: string,
) {
  const number = `#${String(order.number ?? '').padStart(3, '0')}`;
  if (order.fulfillment === 'DELIVERY') {
    return { title: `${shopName}：配達に出発しました 🛵`, body: `ご注文 ${number} をお届けに向かっています。まもなく到着します。` };
  }
  return { title: `${shopName}：ご注文の準備ができました 🎉`, body: `受付番号 ${number}。店頭でお受け取りください。` };
}

/** Sends "your food is ready" to every browser linked to the order or its member. Never throws. */
export async function notifyOrderReady(order: Record<string, unknown>): Promise<number> {
  try {
    const orderId = String(order.id ?? '');
    const customerId = typeof order.customerId === 'string' ? order.customerId : null;

    // Find subscriptions by customerId, or by orderId in the JSON array.
    const allSubs = await prisma.pushSubscription.findMany({
      where: customerId ? { customerId } : undefined,
    });

    const byOrder = orderId
      ? await prisma.$queryRaw<{ id: string; endpoint: string; p256dh: string; auth: string }[]>`
          SELECT id, endpoint, p256dh, auth FROM PushSubscription
          WHERE JSON_CONTAINS(orderIds, ${JSON.stringify(orderId)}, '$')
        `
      : [];

    const seen = new Set(allSubs.map((s) => s.id));
    const targets = [
      ...allSubs,
      ...byOrder.filter((s) => !seen.has(s.id)),
    ];

    if (targets.length === 0) return 0;

    const [keys, settings] = await Promise.all([vapidKeys(), loadSettings() as Promise<{ name?: string; email?: string | null }>]);
    const subject = process.env.VAPID_SUBJECT || (settings.email ? `mailto:${settings.email}` : 'mailto:noreply@adarsha.invalid');
    const shopName = (settings.name as string | undefined)?.trim() || 'アダルサ';
    const url = `/order/${String(order.token)}`;
    const payload = JSON.stringify({ ...readyMessage(order, shopName), url, tag: `order-${orderId}` });

    let sent = 0;
    await Promise.all(
      targets.map(async (target) => {
        try {
          await webpush.sendNotification(
            { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
            payload,
            { vapidDetails: { subject, publicKey: keys.publicKey, privateKey: keys.privateKey }, TTL: 60 * 60, urgency: 'high' },
          );
          sent += 1;
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) await removeSubscription(target.endpoint);
          else logger.warn({ status, err: (err as Error).message }, 'Push notification failed');
        }
      }),
    );
    return sent;
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'Ready notification skipped');
    return 0;
  }
}
