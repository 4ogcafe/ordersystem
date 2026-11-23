import express from 'express';
import { z } from 'zod';
import { AppError } from '../lib/errors.js';
import { requireAdmin } from '../middleware/auth.js';
import {
  buildBotReply,
  buildWelcomeMessages,
  getLineBotConfig,
  replyLineMessages,
  saveLineBotConfig,
  toAdminLineConfig,
  toPublicLineConfig,
  verifyLineSignature,
  type LineBotConfig,
} from '../services/line-bot.js';

const router = express.Router();

const quickReplySchema = z.object({
  label: z.string().trim().min(1).max(20),
  text: z.string().trim().min(1).max(300),
});

const keywordSchema = z.object({
  id: z.string().trim().min(1).max(40),
  keywords: z.array(z.string().trim().min(1).max(40)).min(1).max(20),
  intent: z.enum(['text', 'stores', 'hours', 'menu', 'order', 'reserve', 'contact']),
  replyJa: z.string().max(1000).optional().default(''),
});

const configSchema = z.object({
  enabled: z.boolean().optional(),
  channelId: z.string().trim().max(80).optional(),
  channelSecret: z.string().trim().max(200).optional(),
  channelAccessToken: z.string().trim().max(500).optional(),
  basicId: z.string().trim().max(80).optional(),
  addFriendUrl: z
    .string()
    .trim()
    .max(300)
    .refine(
      (v) => v === '' || /^https:\/\/(line\.me|lin\.ee)\//i.test(v),
      'Use a LINE add-friend URL (https://line.me/... or https://lin.ee/...)',
    )
    .optional(),
  showFloatButton: z.boolean().optional(),
  floatButtonLabelJa: z.string().trim().max(40).optional(),
  welcomeMessageJa: z.string().trim().max(1000).optional(),
  fallbackMessageJa: z.string().trim().max(1000).optional(),
  quickReplies: z.array(quickReplySchema).max(13).optional(),
  keywordReplies: z.array(keywordSchema).max(40).optional(),
  siteUrl: z
    .string()
    .trim()
    .max(200)
    .refine((v) => v === '' || /^https?:\/\//i.test(v), 'Use an https:// site URL')
    .optional(),
});

/** Public widget settings — no secrets. */
router.get('/public', async (_req, res) => {
  const config = await getLineBotConfig();
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.json(toPublicLineConfig(config));
});

/** Admin: full config (secrets masked). */
router.get('/config', requireAdmin, async (_req, res) => {
  const config = await getLineBotConfig();
  res.setHeader('Cache-Control', 'private, no-store');
  res.json(toAdminLineConfig(config));
});

router.put('/config', requireAdmin, async (req, res) => {
  const parsed = configSchema.parse(req.body);
  const saved = await saveLineBotConfig(parsed as Partial<LineBotConfig>);
  res.json(toAdminLineConfig(saved));
});

/** Admin smoke-test: preview reply text for a sample message (does not call LINE). */
router.post('/preview', requireAdmin, async (req, res) => {
  const text = z.object({ text: z.string().trim().min(1).max(500) }).parse(req.body).text;
  const config = await getLineBotConfig();
  const messages = await buildBotReply(text, config);
  res.json({ messages });
});

/**
 * LINE Messaging API webhook.
 * Mounted with express.raw so we can verify x-line-signature against the exact body bytes.
 */
export async function handleLineWebhook(req: express.Request, res: express.Response) {
  const config = await getLineBotConfig();
  if (!config.enabled) {
    res.status(200).json({ ok: true, ignored: 'disabled' });
    return;
  }
  if (!config.channelSecret || !config.channelAccessToken) {
    res.status(200).json({ ok: true, ignored: 'not_configured' });
    return;
  }

  const rawBody = Buffer.isBuffer(req.body)
    ? req.body
    : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {}));
  const signature = req.header('x-line-signature') || undefined;
  if (!verifyLineSignature(rawBody, signature, config.channelSecret)) {
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid LINE signature');
  }

  let payload: { events?: Array<Record<string, unknown>> };
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid JSON');
  }

  // Acknowledge quickly; process replies asynchronously after response when possible.
  res.status(200).json({ ok: true });

  const events = Array.isArray(payload.events) ? payload.events : [];
  for (const event of events) {
    try {
      await handleEvent(event, config);
    } catch (err) {
      console.error('LINE event error', err);
    }
  }
}

async function handleEvent(event: Record<string, unknown>, config: LineBotConfig) {
  const type = String(event.type || '');
  const replyToken = typeof event.replyToken === 'string' ? event.replyToken : '';

  if (type === 'follow' || type === 'join') {
    const messages = await buildWelcomeMessages(config);
    if (replyToken) await replyLineMessages(replyToken, messages, config.channelAccessToken);
    return;
  }

  if (type !== 'message') return;
  const message = event.message as { type?: string; text?: string } | undefined;
  if (!message || message.type !== 'text' || !message.text) return;

  const replies = await buildBotReply(message.text, config);
  if (replyToken) await replyLineMessages(replyToken, replies, config.channelAccessToken);
}

// Webhook is registered in app.ts with express.raw (signature needs raw bytes).

export default router;
