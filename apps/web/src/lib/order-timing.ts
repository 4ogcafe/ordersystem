import { isStoreHolidayOnDate, type StoreLocation } from './stores';

export interface TimeWindow {
  open: number; // minutes from 00:00 (e.g. 11:00 = 660)
  close: number; // minutes from 00:00 (e.g. 15:00 = 900)
  label: string; // "11:00〜15:00"
}

export interface OrderTimingConfig {
  lunchOrderEnabled: boolean;
  lunchOrderHours: string; // e.g. "11:00-15:00"
  dinnerOrderEnabled: boolean;
  dinnerOrderHours: string; // e.g. "17:00-22:00"
  takeoutOrderHours: string; // e.g. "11:00-15:00, 17:00-22:00"
  enforceOrderTimeWindow: boolean;
  timezone: string;
}

export type ActiveMealPeriod = 'LUNCH' | 'DINNER' | 'BREAK' | 'CLOSED' | 'HOLIDAY';

export interface OrderTimingStatus {
  nowHhmm: string;
  todayDateStr: string;
  isHolidayToday: boolean;
  period: ActiveMealPeriod;
  periodBadgeLabel: string;
  lunchOrderEnabled: boolean;
  dinnerOrderEnabled: boolean;
  enforceOrderTimeWindow: boolean;
  isLunchOpenNow: boolean;
  isDinnerOpenNow: boolean;
  isTakeoutOpenNow: boolean;
  lunchHoursLabel: string;
  dinnerHoursLabel: string;
  takeoutHoursLabel: string;
  lunchWindows: TimeWindow[];
  dinnerWindows: TimeWindow[];
  takeoutWindows: TimeWindow[];
  notificationTitle: string;
  notificationMessage: string;
  nextOpenLabel: string | null;
}

export const DEFAULT_LUNCH_ORDER_HOURS = '11:00-15:00';
export const DEFAULT_DINNER_ORDER_HOURS = '17:00-22:00';
export const DEFAULT_TAKEOUT_ORDER_HOURS = '11:00-15:00, 17:00-22:00';

const pad2 = (n: number) => String(n).padStart(2, '0');

export function formatMinutesToHhmm(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

/**
 * Extracts all HH:MM-HH:MM windows from a string like
 * "11:00-15:00, 17:00-22:00" or "ランチ 11:00–15:00（L.O. 14:30）／ ディナー 17:00–22:00"
 */
export function parseTimeWindows(raw: string | null | undefined): TimeWindow[] {
  if (!raw || typeof raw !== 'string') return [];
  // Remove parenthetical notes like （L.O. 22:00） or （土日祝 11:00–23:00） so main ranges are parsed cleanly
  const cleaned = raw.replace(/[（(][^）)]*[）)]/g, ' ');
  const regex = /(\d{1,2}):(\d{2})\s*[-–~〜]\s*(\d{1,2}):(\d{2})/g;
  const windows: TimeWindow[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(cleaned)) !== null) {
    const sh = Number(match[1]);
    const sm = Number(match[2]);
    const eh = Number(match[3]);
    const em = Number(match[4]);
    const open = sh * 60 + sm;
    const close = eh * 60 + em;
    if (open >= 0 && open < close && close <= 24 * 60) {
      windows.push({
        open,
        close,
        label: `${pad2(sh)}:${pad2(sm)}〜${pad2(eh)}:${pad2(em)}`,
      });
    }
  }
  return windows;
}

/**
 * Splits a branch's hours string or settings into Lunch and Dinner time windows.
 */
export function extractBranchLunchDinnerWindows(
  store?: StoreLocation | null,
  settings?: Record<string, any> | null,
): {
  lunchWindows: TimeWindow[];
  dinnerWindows: TimeWindow[];
  takeoutWindows: TimeWindow[];
} {
  const customLunchStr = settings?.lunchOrderHours?.trim();
  const customDinnerStr = settings?.dinnerOrderHours?.trim();
  const customTakeoutStr = settings?.takeoutOrderHours?.trim() || settings?.pickupHours?.trim();

  // Check if the store has explicit hours string with ranges
  const storeWindows = parseTimeWindows(store?.hours);

  let lunchWindows: TimeWindow[] = [];
  let dinnerWindows: TimeWindow[] = [];

  if (customLunchStr) {
    lunchWindows = parseTimeWindows(customLunchStr);
  }
  if (customDinnerStr) {
    dinnerWindows = parseTimeWindows(customDinnerStr);
  }

  // If store has 2+ ranges (e.g. 11:00-15:00 / 17:00-23:00) and custom settings aren't overriding, or to refine branch hours:
  if (storeWindows.length >= 2) {
    if (lunchWindows.length === 0) {
      lunchWindows = [storeWindows[0]];
    }
    if (dinnerWindows.length === 0) {
      dinnerWindows = storeWindows.slice(1);
    }
  } else if (storeWindows.length === 1) {
    // Continuous all-day branch (e.g. 11:00-23:00):
    // Lunch is open until 16:30 (or configured lunch close), Dinner is 16:30 until close (or configured dinner)
    const full = storeWindows[0];
    if (lunchWindows.length === 0) {
      const lunchClose = Math.min(full.close, 16 * 60 + 30);
      if (full.open < lunchClose) {
        lunchWindows = [{ open: full.open, close: lunchClose, label: `${formatMinutesToHhmm(full.open)}〜${formatMinutesToHhmm(lunchClose)}` }];
      }
    }
    if (dinnerWindows.length === 0) {
      const dinnerOpen = Math.max(full.open, 16 * 60 + 30);
      if (dinnerOpen < full.close) {
        dinnerWindows = [{ open: dinnerOpen, close: full.close, label: `${formatMinutesToHhmm(dinnerOpen)}〜${formatMinutesToHhmm(full.close)}` }];
      }
    }
  }

  if (lunchWindows.length === 0) {
    lunchWindows = parseTimeWindows(DEFAULT_LUNCH_ORDER_HOURS);
  }
  if (dinnerWindows.length === 0) {
    dinnerWindows = parseTimeWindows(DEFAULT_DINNER_ORDER_HOURS);
  }

  const lunchEnabled = settings?.lunchOrderEnabled !== false;
  const dinnerEnabled = settings?.dinnerOrderEnabled !== false;

  const activeLunch = lunchEnabled ? lunchWindows : [];
  const activeDinner = dinnerEnabled ? dinnerWindows : [];

  let takeoutWindows: TimeWindow[] = [];
  if (customTakeoutStr && !customLunchStr && !customDinnerStr && storeWindows.length === 0) {
    takeoutWindows = parseTimeWindows(customTakeoutStr);
  } else {
    takeoutWindows = [...activeLunch, ...activeDinner];
  }

  if (takeoutWindows.length === 0 && (lunchEnabled || dinnerEnabled)) {
    takeoutWindows = parseTimeWindows(DEFAULT_TAKEOUT_ORDER_HOURS);
  }

  return {
    lunchWindows: activeLunch,
    dinnerWindows: activeDinner,
    takeoutWindows,
  };
}

export function getJstNowParts(now: Date = new Date(), timeZone = 'Asia/Tokyo'): {
  dateStr: string;
  hhmm: string;
  minutes: number;
} {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
    const get = (t: string) => parts.find(p => p.type === t)?.value || '00';
    const year = get('year');
    const month = get('month');
    const day = get('day');
    const hour = Number(get('hour'));
    const minute = Number(get('minute'));
    return {
      dateStr: `${year}-${month}-${day}`,
      hhmm: `${pad2(hour)}:${pad2(minute)}`,
      minutes: hour * 60 + minute,
    };
  } catch {
    const h = now.getHours();
    const m = now.getMinutes();
    return {
      dateStr: now.toISOString().slice(0, 10),
      hhmm: `${pad2(h)}:${pad2(m)}`,
      minutes: h * 60 + m,
    };
  }
}

export function isMinutesInWindows(minutes: number, windows: TimeWindow[]): boolean {
  return windows.some(w => minutes >= w.open && minutes <= w.close);
}

/**
 * Computes the complete real-time Lunch / Dinner / Takeout order timing status and notification messages.
 */
export function evaluateOrderTiming(
  store?: StoreLocation | null,
  settings?: Record<string, any> | null,
  now: Date = new Date(),
): OrderTimingStatus {
  const timeZone = settings?.timezone || 'Asia/Tokyo';
  const { dateStr, hhmm, minutes } = getJstNowParts(now, timeZone);
  const { lunchWindows, dinnerWindows, takeoutWindows } = extractBranchLunchDinnerWindows(store, settings);

  const lunchHoursLabel = lunchWindows.map(w => w.label).join(' / ') || '受付休止';
  const dinnerHoursLabel = dinnerWindows.map(w => w.label).join(' / ') || '受付休止';
  const takeoutHoursLabel = takeoutWindows.map(w => w.label).join(' ／ ') || '受付休止';

  const lunchOrderEnabled = settings?.lunchOrderEnabled !== false;
  const dinnerOrderEnabled = settings?.dinnerOrderEnabled !== false;
  const enforceOrderTimeWindow = settings?.enforceOrderTimeWindow !== false;

  const isHolidayToday = isStoreHolidayOnDate(store, dateStr);
  const inLunch = !isHolidayToday && isMinutesInWindows(minutes, lunchWindows);
  const inDinner = !isHolidayToday && isMinutesInWindows(minutes, dinnerWindows);
  const inTakeout = !isHolidayToday && (inLunch || inDinner || isMinutesInWindows(minutes, takeoutWindows));

  const allWindows = [...takeoutWindows].sort((a, b) => a.open - b.open);
  const nextWindowToday = !isHolidayToday ? allWindows.find(w => w.open > minutes) : undefined;
  const firstWindow = allWindows[0];

  const nextOpenLabel = nextWindowToday
    ? `本日 ${formatMinutesToHhmm(nextWindowToday.open)} より受付開始`
    : firstWindow
      ? `次回 ${formatMinutesToHhmm(firstWindow.open)} より受付開始`
      : null;

  const storePrefix = store?.name ? `Adarsha ${store.name}` : '当店';
  const commonFlags = { lunchOrderEnabled, dinnerOrderEnabled, enforceOrderTimeWindow };

  if (isHolidayToday) {
    return {
      ...commonFlags,
      nowHhmm: hhmm,
      todayDateStr: dateStr,
      isHolidayToday: true,
      period: 'HOLIDAY',
      periodBadgeLabel: `🔴 本日定休日（${store?.holiday || '定休日'}）`,
      isLunchOpenNow: false,
      isDinnerOpenNow: false,
      isTakeoutOpenNow: false,
      lunchHoursLabel,
      dinnerHoursLabel,
      takeoutHoursLabel,
      lunchWindows,
      dinnerWindows,
      takeoutWindows,
      notificationTitle: `${storePrefix}は本日定休日（${store?.holiday}）のためご注文を受け付けておりません`,
      notificationMessage: `別の日時をご指定いただくか、年中無休の他店舗（駒込店・日暮里店・西葛西店・巣鴨店・下北沢店・横須賀店・千葉中央店など）へ切り替えてご注文ください。`,
      nextOpenLabel,
    };
  }

  if (inLunch) {
    return {
      ...commonFlags,
      nowHhmm: hhmm,
      todayDateStr: dateStr,
      isHolidayToday: false,
      period: 'LUNCH',
      periodBadgeLabel: '🟢 ランチ・テイクアウト注文受付中',
      isLunchOpenNow: true,
      isDinnerOpenNow: false,
      isTakeoutOpenNow: inTakeout,
      lunchHoursLabel,
      dinnerHoursLabel,
      takeoutHoursLabel,
      lunchWindows,
      dinnerWindows,
      takeoutWindows,
      notificationTitle: `ただいまランチ＆テイクアウト注文受付中です（現在時刻 ${hhmm}）`,
      notificationMessage: `ランチ注文時間: ${lunchHoursLabel} ／ ディナー注文時間: ${dinnerHoursLabel}`,
      nextOpenLabel: null,
    };
  }

  if (inDinner) {
    return {
      ...commonFlags,
      nowHhmm: hhmm,
      todayDateStr: dateStr,
      isHolidayToday: false,
      period: 'DINNER',
      periodBadgeLabel: '🟢 ディナー・テイクアウト注文受付中',
      isLunchOpenNow: false,
      isDinnerOpenNow: true,
      isTakeoutOpenNow: inTakeout,
      lunchHoursLabel,
      dinnerHoursLabel,
      takeoutHoursLabel,
      lunchWindows,
      dinnerWindows,
      takeoutWindows,
      notificationTitle: `ただいまディナー＆テイクアウト注文受付中です（現在時刻 ${hhmm}）`,
      notificationMessage: `ディナー注文時間: ${dinnerHoursLabel}（ランチ注文 ${lunchHoursLabel} は終了しました）`,
      nextOpenLabel: null,
    };
  }

  // Check if between lunch and dinner (BREAK)
  const lastLunchClose = lunchWindows.length > 0 ? Math.max(...lunchWindows.map(w => w.close)) : 0;
  const firstDinnerOpen = dinnerWindows.length > 0 ? Math.min(...dinnerWindows.map(w => w.open)) : 24 * 60;
  const isBreak = minutes > lastLunchClose && minutes < firstDinnerOpen;

  if (isBreak) {
    return {
      ...commonFlags,
      nowHhmm: hhmm,
      todayDateStr: dateStr,
      isHolidayToday: false,
      period: 'BREAK',
      periodBadgeLabel: '🟠 準備中（ランチ終了・ディナー受付前）',
      isLunchOpenNow: false,
      isDinnerOpenNow: false,
      isTakeoutOpenNow: inTakeout,
      lunchHoursLabel,
      dinnerHoursLabel,
      takeoutHoursLabel,
      lunchWindows,
      dinnerWindows,
      takeoutWindows,
      notificationTitle: `ただいまの時間（${hhmm}）はランチ終了・ディナー準備中のため注文受付時間外です`,
      notificationMessage: `【受付時間】ランチ: ${lunchHoursLabel} ／ ディナー: ${dinnerHoursLabel}。ディナーの事前予約注文（受け取り時間指定）は可能です。`,
      nextOpenLabel,
    };
  }

  return {
    ...commonFlags,
    nowHhmm: hhmm,
    todayDateStr: dateStr,
    isHolidayToday: false,
    period: 'CLOSED',
    periodBadgeLabel: '🔴 注文受付時間外（営業時間外）',
    isLunchOpenNow: false,
    isDinnerOpenNow: false,
    isTakeoutOpenNow: inTakeout,
    lunchHoursLabel,
    dinnerHoursLabel,
    takeoutHoursLabel,
    lunchWindows,
    dinnerWindows,
    takeoutWindows,
    notificationTitle: `ただいまの時間（${hhmm}）はテイクアウト・オンライン注文の受付時間外です`,
    notificationMessage: `【${storePrefix} ご注文受付時間】☀️ ランチ: ${lunchHoursLabel} ／ 🌙 ディナー: ${dinnerHoursLabel}。受付時間内のご注文、または翌日以降の受取時間指定をお願いいたします。`,
    nextOpenLabel,
  };
}

/**
 * Checks if a specific menu page ('lunch' | 'grand' | 'takeout') can be ordered right now,
 * and returns a clear Japanese notification message if outside the allowed order window.
 */
export function checkMenuTypeOrderAllowed(
  menuType: string,
  timing: OrderTimingStatus,
  enforceWindow = true,
): {
  allowed: boolean;
  badgeText: string;
  reason: string;
} {
  if (!enforceWindow) {
    return { allowed: true, badgeText: timing.periodBadgeLabel, reason: '' };
  }

  const normalized = menuType.toLowerCase();

  if (timing.isHolidayToday) {
    return {
      allowed: false,
      badgeText: timing.periodBadgeLabel,
      reason: `${timing.notificationTitle}。${timing.notificationMessage}`,
    };
  }

  if (normalized === 'lunch') {
    if (timing.isLunchOpenNow) {
      return {
        allowed: true,
        badgeText: `🟢 ランチ注文受付中（${timing.lunchHoursLabel}）`,
        reason: '',
      };
    }
    return {
      allowed: false,
      badgeText: `⏰ ランチ注文時間外（受付: ${timing.lunchHoursLabel}）`,
      reason: `ランチメニューのご注文受付時間は【${timing.lunchHoursLabel}】です（現在時刻: ${timing.nowHhmm}）。${
        timing.isDinnerOpenNow
          ? '現在はディナー・テイクアウトメニューよりご注文いただけます。'
          : `受付時間内にご注文ください。`
      }`,
    };
  }

  if (normalized === 'grand' || normalized === 'dinner') {
    if (timing.isDinnerOpenNow) {
      return {
        allowed: true,
        badgeText: `🟢 ディナー注文受付中（${timing.dinnerHoursLabel}）`,
        reason: '',
      };
    }
    return {
      allowed: false,
      badgeText: `⏰ ディナー注文時間外（受付: ${timing.dinnerHoursLabel}）`,
      reason: `ディナー（グランドメニュー）のご注文受付時間は【${timing.dinnerHoursLabel}】です（現在時刻: ${timing.nowHhmm}）。${
        timing.isLunchOpenNow
          ? '現在はランチ・テイクアウトメニューよりご注文いただけます。'
          : `受付時間内にご注文ください。`
      }`,
    };
  }

  // Default: 'takeout' or general order
  if (timing.isTakeoutOpenNow) {
    return {
      allowed: true,
      badgeText: timing.periodBadgeLabel,
      reason: '',
    };
  }

  return {
    allowed: false,
    badgeText: `⏰ テイクアウト注文時間外（ランチ ${timing.lunchHoursLabel} ／ ディナー ${timing.dinnerHoursLabel}）`,
    reason: `ただいまの時間（${timing.nowHhmm}）はテイクアウト注文の受付時間外です。【受付時間】ランチ: ${timing.lunchHoursLabel} ／ ディナー: ${timing.dinnerHoursLabel}。`,
  };
}

/**
 * Classifies a slot HH:MM string (e.g. "12:15" or "18:30") into 'LUNCH' or 'DINNER'.
 */
export function classifySlotMealPeriod(
  hhmm: string,
  lunchWindows: TimeWindow[],
  dinnerWindows: TimeWindow[],
): 'LUNCH' | 'DINNER' {
  const [h, m] = hhmm.split(':').map(Number);
  const mins = (h || 0) * 60 + (m || 0);
  if (isMinutesInWindows(mins, lunchWindows)) return 'LUNCH';
  if (isMinutesInWindows(mins, dinnerWindows)) return 'DINNER';
  return mins < 16 * 60 + 30 ? 'LUNCH' : 'DINNER';
}
