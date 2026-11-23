import crypto from 'node:crypto';
import { config } from '../config.js';
import { prisma } from '../lib/prisma.js';

const SECRET_KEY = 'LINE_BOT_CONFIG';
const LINE_REPLY_URL = 'https://api.line.me/v2/bot/message/reply';
const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push';

export interface LineQuickReply {
  label: string;
  text: string;
}

export interface LineKeywordReply {
  id: string;
  keywords: string[];
  /** Built-in intent, or free text via replyJa */
  intent: 'text' | 'stores' | 'hours' | 'menu' | 'order' | 'reserve' | 'contact';
  replyJa: string;
}

export interface LineBotConfig {
  enabled: boolean;
  channelId: string;
  channelSecret: string;
  channelAccessToken: string;
  basicId: string;
  addFriendUrl: string;
  showFloatButton: boolean;
  floatButtonLabelJa: string;
  welcomeMessageJa: string;
  fallbackMessageJa: string;
  quickReplies: LineQuickReply[];
  keywordReplies: LineKeywordReply[];
  siteUrl: string;
}

export const DEFAULT_LINE_BOT_CONFIG: LineBotConfig = {
  enabled: false,
  channelId: '',
  channelSecret: '',
  channelAccessToken: '',
  basicId: '',
  addFriendUrl: '',
  showFloatButton: true,
  floatButtonLabelJa: 'LINEで相談',
  welcomeMessageJa:
    'アダルサ公式LINEへようこそ！\nメニュー・店舗・ご予約・オンライン注文についてお答えします。下のボタンからお選びください。',
  fallbackMessageJa:
    '申し訳ありません。うまく理解できませんでした。\n「メニュー」「店舗」「営業時間」「注文」「予約」と送っていただくか、下のボタンをお試しください。',
  quickReplies: [
    { label: 'メニュー', text: 'メニュー' },
    { label: '店舗一覧', text: '店舗' },
    { label: '営業時間', text: '営業時間' },
    { label: '注文する', text: '注文' },
    { label: '予約する', text: '予約' },
  ],
  keywordReplies: [
    { id: 'menu', keywords: ['メニュー', 'menu', '料理'], intent: 'menu', replyJa: '' },
    { id: 'stores', keywords: ['店舗', '支店', '住所', 'store'], intent: 'stores', replyJa: '' },
    { id: 'hours', keywords: ['営業時間', '時間', 'hours', '何時'], intent: 'hours', replyJa: '' },
    { id: 'order', keywords: ['注文', 'オーダー', 'テイクアウト', 'デリバリー', 'order'], intent: 'order', replyJa: '' },
    { id: 'reserve', keywords: ['予約', '席', 'reserve', 'reservation'], intent: 'reserve', replyJa: '' },
    { id: 'contact', keywords: ['電話', 'お問い合わせ', 'contact', '連絡'], intent: 'contact', replyJa: '' },
  ],
  siteUrl: 'https://adarsha.jp',
};

export type PublicLineBotConfig = Pick<
  LineBotConfig,
  'enabled' | 'addFriendUrl' | 'basicId' | 'showFloatButton' | 'floatButtonLabelJa'
>;

export function toPublicLineConfig(config: LineBotConfig): PublicLineBotConfig {
  return {
    enabled: Boolean(config.enabled && config.addFriendUrl),
    addFriendUrl: config.addFriendUrl || '',
    basicId: config.basicId || '',
    showFloatButton: config.showFloatButton !== false,
    floatButtonLabelJa: config.floatButtonLabelJa || DEFAULT_LINE_BOT_CONFIG.floatButtonLabelJa,
  };
}

/** Admin response: never echo full secrets back unless they were just saved; mask by default. */
export function toAdminLineConfig(config: LineBotConfig) {
  return {
    ...config,
    channelSecret: maskSecret(config.channelSecret),
    channelAccessToken: maskSecret(config.channelAccessToken),
    hasChannelSecret: Boolean(config.channelSecret),
    hasChannelAccessToken: Boolean(config.channelAccessToken),
    webhookPath: '/api/v1/line/webhook',
  };
}

function maskSecret(value: string): string {
  if (!value) return '';
  if (value.length <= 8) return '••••••••';
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export async function getLineBotConfig(): Promise<LineBotConfig> {
  let stored: Partial<LineBotConfig> = {};
  try {
    const record = await prisma.appSecret.findUnique({ where: { id: SECRET_KEY } });
    if (record?.publicKey) {
      stored = JSON.parse(record.publicKey) as Partial<LineBotConfig>;
    }
  } catch (err) {
    console.error('Failed to load LINE bot config', err);
  }

  // Env credentials fill gaps (and work before Admin saves). Admin DB values win when set.
  const envToken = config.line.channelAccessToken;
  const envSecret = config.line.channelSecret;
  const channelAccessToken = String(stored.channelAccessToken || '').trim() || envToken;
  const channelSecret = String(stored.channelSecret || '').trim() || envSecret;
  const hasCreds = Boolean(channelAccessToken && channelSecret);

  return normalizeConfig({
    ...DEFAULT_LINE_BOT_CONFIG,
    ...stored,
    channelAccessToken,
    channelSecret,
    // Auto-enable when credentials exist and admin has not explicitly disabled.
    enabled: stored.enabled === false ? false : Boolean(stored.enabled) || hasCreds,
  });
}

export async function saveLineBotConfig(input: Partial<LineBotConfig>): Promise<LineBotConfig> {
  const current = await getLineBotConfig();
  const next = normalizeConfig({
    ...current,
    ...input,
    // Keep previous secrets when admin sends masked/empty placeholders
    channelSecret: keepSecret(input.channelSecret, current.channelSecret),
    channelAccessToken: keepSecret(input.channelAccessToken, current.channelAccessToken),
  });
  const json = JSON.stringify(next);
  await prisma.appSecret.upsert({
    where: { id: SECRET_KEY },
    create: { id: SECRET_KEY, publicKey: json, privateKey: '' },
    update: { publicKey: json },
  });
  return next;
}

function keepSecret(incoming: string | undefined, previous: string): string {
  if (incoming === undefined) return previous;
  const trimmed = String(incoming).trim();
  if (!trimmed || trimmed.includes('…') || trimmed.includes('•')) return previous;
  return trimmed;
}

function normalizeConfig(raw: Partial<LineBotConfig>): LineBotConfig {
  const base = { ...DEFAULT_LINE_BOT_CONFIG, ...raw };
  return {
    ...base,
    enabled: Boolean(base.enabled),
    channelId: String(base.channelId || '').trim(),
    channelSecret: String(base.channelSecret || '').trim(),
    channelAccessToken: String(base.channelAccessToken || '').trim(),
    basicId: String(base.basicId || '').trim(),
    addFriendUrl: String(base.addFriendUrl || '').trim(),
    showFloatButton: base.showFloatButton !== false,
    floatButtonLabelJa: String(base.floatButtonLabelJa || DEFAULT_LINE_BOT_CONFIG.floatButtonLabelJa).slice(0, 40),
    welcomeMessageJa: String(base.welcomeMessageJa || DEFAULT_LINE_BOT_CONFIG.welcomeMessageJa).slice(0, 1000),
    fallbackMessageJa: String(base.fallbackMessageJa || DEFAULT_LINE_BOT_CONFIG.fallbackMessageJa).slice(0, 1000),
    siteUrl: String(base.siteUrl || DEFAULT_LINE_BOT_CONFIG.siteUrl).replace(/\/$/, ''),
    quickReplies: Array.isArray(base.quickReplies)
      ? base.quickReplies
          .slice(0, 13)
          .map((q) => ({
            label: String(q.label || '').trim().slice(0, 20),
            text: String(q.text || '').trim().slice(0, 300),
          }))
          .filter((q) => q.label && q.text)
      : DEFAULT_LINE_BOT_CONFIG.quickReplies,
    keywordReplies: Array.isArray(base.keywordReplies)
      ? base.keywordReplies.slice(0, 40).map((k, i) => ({
          id: String(k.id || `kw-${i}`).slice(0, 40),
          keywords: (Array.isArray(k.keywords) ? k.keywords : [])
            .map((w) => String(w || '').trim().toLowerCase())
            .filter(Boolean)
            .slice(0, 20),
          intent: (['text', 'stores', 'hours', 'menu', 'order', 'reserve', 'contact'] as const).includes(k.intent as never)
            ? (k.intent as LineKeywordReply['intent'])
            : 'text',
          replyJa: String(k.replyJa || '').slice(0, 1000),
        }))
      : DEFAULT_LINE_BOT_CONFIG.keywordReplies,
  };
}

export function verifyLineSignature(rawBody: Buffer | string, signature: string | undefined, channelSecret: string): boolean {
  if (!signature || !channelSecret) return false;
  const digest = crypto.createHmac('sha256', channelSecret).update(rawBody).digest('base64');
  try {
    const a = Buffer.from(digest);
    const b = Buffer.from(signature);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

type LineMessage =
  | { type: 'text'; text: string; quickReply?: { items: unknown[] } }
  | { type: 'template'; altText: string; template: unknown; quickReply?: { items: unknown[] } };

function withQuickReplies(message: LineMessage, config: LineBotConfig): LineMessage {
  if (!config.quickReplies.length) return message;
  return {
    ...message,
    quickReply: {
      items: config.quickReplies.map((q) => ({
        type: 'action',
        action: { type: 'message', label: q.label.slice(0, 20), text: q.text },
      })),
    },
  };
}

export async function buildBotReply(userText: string, config: LineBotConfig): Promise<LineMessage[]> {
  const text = userText.trim();
  const lower = text.toLowerCase();

  for (const rule of config.keywordReplies) {
    const hit = rule.keywords.some((kw) => kw && (lower.includes(kw) || text.includes(kw)));
    if (!hit) continue;
    const body = await resolveIntent(rule.intent, rule.replyJa, config);
    return [withQuickReplies({ type: 'text', text: body }, config)];
  }

  return [withQuickReplies({ type: 'text', text: config.fallbackMessageJa }, config)];
}

export async function buildWelcomeMessages(config: LineBotConfig): Promise<LineMessage[]> {
  return [withQuickReplies({ type: 'text', text: config.welcomeMessageJa }, config)];
}

async function resolveIntent(
  intent: LineKeywordReply['intent'],
  customText: string,
  config: LineBotConfig,
): Promise<string> {
  const site = config.siteUrl || 'https://adarsha.jp';
  if (intent === 'text' && customText.trim()) return customText.trim();

  if (intent === 'menu') {
    return customText.trim() || `メニューはこちらからご覧ください。\nランチ: ${site}/menu/lunch\nテイクアウト: ${site}/menu/takeout\nグランド: ${site}/menu/grand`;
  }
  if (intent === 'order') {
    return customText.trim() || `オンライン注文はこちらです。\n${site}/order\nご希望の店舗を選んでご注文ください。`;
  }
  if (intent === 'reserve') {
    return customText.trim() || `ご予約は公式サイトの「席を予約する」から、または各店舗へお電話ください。\n${site}/`;
  }
  if (intent === 'contact') {
    const settings = await prisma.settings.findFirst({ select: { phone: true, email: true } });
    const phone = settings?.phone || '';
    const email = settings?.email || '';
    return (
      customText.trim() ||
      `お問い合わせ\n${phone ? `代表電話: ${phone}\n` : ''}${email ? `メール: ${email}\n` : ''}フォーム: ${site}/contact\n店舗ごとの電話番号は「店舗」と送ってください。`
    );
  }
  if (intent === 'hours') {
    if (customText.trim()) return customText.trim();
    const settings = await prisma.settings.findFirst({ select: { weeklyHours: true, holidays: true } });
    const hours = settings?.weeklyHours as Record<string, string> | null;
    const holidays = settings?.holidays as Record<string, string> | null;
    const lines: string[] = ['【営業時間】'];
    if (hours && typeof hours === 'object') {
      for (const [day, value] of Object.entries(hours)) {
        if (value) lines.push(`${day}: ${value}`);
      }
    }
    if (lines.length === 1) {
      lines.push('ランチ 11:00–16:30 / ディナー 16:30–23:00（店舗により異なる場合あり）');
    }
    if (holidays?.regular) lines.push(`定休日: ${holidays.regular}`);
    lines.push(`詳細・店舗別: ${site}/`);
    return lines.join('\n');
  }
  if (intent === 'stores') {
    if (customText.trim()) return customText.trim();
    return await formatStoreList(site);
  }

  return customText.trim() || config.fallbackMessageJa;
}

async function formatStoreList(site: string): Promise<string> {
  const ext = await prisma.appSecret.findUnique({ where: { id: 'PAGE_SETTINGS_EXT' } }).catch(() => null);
  const parsed = ext?.publicKey ? JSON.parse(ext.publicKey) : {};
  const stores = Array.isArray(parsed.storeLocations) ? parsed.storeLocations : [];
  if (!stores.length) {
    return `店舗一覧は公式サイトをご覧ください。\n${site}/`;
  }
  const lines = ['【アダルサ 店舗一覧】'];
  for (const store of stores.slice(0, 20)) {
    const name = store.name || store.id || '店舗';
    const phone = store.phone ? `  ☎ ${store.phone}` : '';
    const area = store.area ? `（${store.area}）` : '';
    lines.push(`・${name}${area}${phone}`);
  }
  lines.push(`地図・詳細: ${site}/`);
  return lines.join('\n');
}

export async function replyLineMessages(
  replyToken: string,
  messages: LineMessage[],
  accessToken: string,
): Promise<void> {
  if (!replyToken || !accessToken || messages.length === 0) return;
  const res = await fetch(LINE_REPLY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ replyToken, messages: messages.slice(0, 5) }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error('LINE reply failed', res.status, detail);
  }
}

export async function pushLineMessages(
  userId: string,
  messages: LineMessage[],
  accessToken: string,
): Promise<{ ok: boolean; status: number; detail: string }> {
  if (!userId || !accessToken || messages.length === 0) {
    return { ok: false, status: 400, detail: 'Missing userId, token, or messages' };
  }
  const res = await fetch(LINE_PUSH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ to: userId, messages: messages.slice(0, 5) }),
  });
  const detail = await res.text().catch(() => '');
  return { ok: res.ok, status: res.status, detail };
}
