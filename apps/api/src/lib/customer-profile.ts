import { z } from 'zod';

// Member profile: what customers may tell us about themselves, and how it is shown back.
// Everything except name and email is optional.

export const PREFECTURES = [
  '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県', '茨城県', '栃木県', '群馬県',
  '埼玉県', '千葉県', '東京都', '神奈川県', '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県',
  '岐阜県', '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県',
  '鳥取県', '島根県', '岡山県', '広島県', '山口県', '徳島県', '香川県', '愛媛県', '高知県', '福岡県',
  '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県',
] as const;

/** The allergens Japanese food labelling requires (特定原材料), plus a few common in Indian food. */
export const ALLERGENS = ['えび', 'かに', 'くるみ', '小麦', 'そば', '卵', '乳', '落花生', 'カシューナッツ', 'アーモンド', 'ごま', '大豆'] as const;
export const DIETS = ['VEGETARIAN', 'VEGAN', 'HALAL', 'GLUTEN_FREE'] as const;
export const MAX_SPICE = 5;

const MAX_AGE_YEARS = 120;
const empty = (value: unknown) => (value === '' || value === null ? undefined : value);
const text = (max: number) => z.preprocess(empty, z.string().trim().max(max).optional());

const birthDate = z.preprocess(
  empty,
  z.iso
    .date('生年月日の形式が正しくありません')
    .refine((value) => {
      const date = new Date(`${value}T00:00:00Z`);
      const oldest = new Date();
      oldest.setUTCFullYear(oldest.getUTCFullYear() - MAX_AGE_YEARS);
      return date < new Date() && date > oldest;
    }, '生年月日をご確認ください')
    .optional(),
);

export const addressSchema = z.object({
  // 1234567 or 123-4567 (full-width digits are converted by the website before sending).
  postalCode: z.preprocess(empty, z.string().trim().regex(/^\d{3}-?\d{4}$/, '郵便番号は7桁で入力してください').optional()),
  prefecture: z.preprocess(empty, z.enum(PREFECTURES).optional()),
  city: text(100),
  line1: text(200),
  building: text(200),
});

export const preferencesSchema = z.object({
  allergens: z.array(z.enum(ALLERGENS)).max(ALLERGENS.length).optional(),
  otherAllergies: text(200),
  diets: z.array(z.enum(DIETS)).max(DIETS.length).optional(),
  spiceLevel: z.number().int().min(0).max(MAX_SPICE).nullable().optional(),
  note: text(500),
});

const phone = z.union([z.literal(''), z.string().trim().regex(/^[\d\s()+-]{8,20}$/, '電話番号の形式が正しくありません')]).nullable().optional();

export const profileSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  nameKana: z.preprocess(empty, z.string().trim().max(100).regex(/^[\p{Script=Katakana}ー\s・]+$/u, 'フリガナはカタカナで入力してください').optional()),
  phone,
  birthDate,
  address: addressSchema.optional(),
  preferences: preferencesSchema.optional(),
  newsletterOptIn: z.boolean().optional(),
});

export type ProfileInput = z.infer<typeof profileSchema>;

/** Only the fields that were sent are changed; a field sent empty is cleared. */
export function profileUpdate(input: ProfileInput): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  if (input.name !== undefined) update.name = input.name;
  if ('nameKana' in input) update.nameKana = input.nameKana ?? null;
  if (input.phone !== undefined) update.phone = input.phone || null;
  if ('birthDate' in input) update.birthDate = input.birthDate ?? null;
  if (input.address) update.address = compact(input.address);
  if (input.preferences) {
    const { allergens = [], diets = [], ...rest } = input.preferences;
    update.preferences = { ...compact(rest), allergens, diets, spiceLevel: input.preferences.spiceLevel ?? null };
  }
  if (input.newsletterOptIn !== undefined) {
    update.newsletterOptIn = input.newsletterOptIn;
    update.newsletterOptInAt = input.newsletterOptIn ? new Date() : null;
  }
  return update;
}

function compact(values: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value ?? null]));
}

interface StoredPreferences {
  allergens?: string[];
  otherAllergies?: string | null;
  diets?: string[];
  spiceLevel?: number | null;
  note?: string | null;
}

/** The profile as the member (and staff) see it. Never includes the password hash. */
export function publicProfile(customer: Record<string, unknown>) {
  const address = (customer.address ?? {}) as Record<string, string | null>;
  const preferences = (customer.preferences ?? {}) as StoredPreferences;
  return {
    id: String(customer.id ?? customer._id),
    name: customer.name,
    nameKana: customer.nameKana ?? '',
    email: customer.email,
    phone: customer.phone ?? '',
    birthDate: customer.birthDate ?? '',
    address: {
      postalCode: address.postalCode ?? '',
      prefecture: address.prefecture ?? '',
      city: address.city ?? '',
      line1: address.line1 ?? '',
      building: address.building ?? '',
    },
    preferences: {
      allergens: preferences.allergens ?? [],
      otherAllergies: preferences.otherAllergies ?? '',
      diets: preferences.diets ?? [],
      spiceLevel: preferences.spiceLevel ?? null,
      note: preferences.note ?? '',
    },
    newsletterOptIn: Boolean(customer.newsletterOptIn),
    points: Number(customer.points) || 0,
    createdAt: customer.createdAt,
  };
}

/** What the kitchen needs to see on an order: allergies and dietary needs, or null if none were given. */
export function dietaryAlert(customer: Record<string, unknown> | null | undefined) {
  if (!customer) return null;
  const preferences = (customer.preferences ?? {}) as StoredPreferences;
  const allergens = preferences.allergens ?? [];
  const diets = preferences.diets ?? [];
  const other = preferences.otherAllergies ?? '';
  if (allergens.length === 0 && diets.length === 0 && !other) return null;
  return { allergens, otherAllergies: other, diets };
}
