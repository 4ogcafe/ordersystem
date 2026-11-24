import { apiFetch } from './api';

export interface QrSession {
  valid: boolean;
  sessionToken: string;
  storeId: string;
  tableNumber: string;
  qrCode: string;
  restaurantName?: string;
  expiresAt?: number;
  store?: any;
  canOrder?: boolean;
  tableLocked?: boolean;
  lockStatus?: string;
}

export type QrValidateFailure = {
  code: string;
  message: string;
  tableLocked?: boolean;
  lockStatus?: string;
  storeId?: string;
  tableNumber?: string;
  store?: any;
};

const QR_STORAGE_KEY = 'adarsha_qr_session';

/** Reads verified QR session from volatile sessionStorage */
export function getStoredQrSession(): QrSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(QR_STORAGE_KEY);
    if (!raw) return null;
    const session: QrSession = JSON.parse(raw);
    if (session && session.valid && session.sessionToken && session.tableNumber) {
      if (session.expiresAt && session.expiresAt * 1000 < Date.now()) {
        sessionStorage.removeItem(QR_STORAGE_KEY);
        return null;
      }
      return session;
    }
  } catch {
    sessionStorage.removeItem(QR_STORAGE_KEY);
  }
  return null;
}

/** Saves verified QR session */
export function saveQrSession(session: QrSession): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(QR_STORAGE_KEY, JSON.stringify(session));
  } catch {}
}

/** Clears QR session from sessionStorage and server cookie */
export function clearQrSession(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(QR_STORAGE_KEY);
    sessionStorage.removeItem('adarsha_table_session');
    sessionStorage.removeItem('adarsha_qr_choice');
  } catch {}
  apiFetch('/api/v1/qr/clear', { method: 'POST' }).catch(() => undefined);
}

export type ValidateQrResult =
  | { ok: true; session: QrSession }
  | { ok: false; failure: QrValidateFailure };

/** Validates QR code or table/store through backend API */
export async function validateQrCodeApi(params: {
  qrCode?: string;
  qr?: string;
  storeId?: string;
  store?: string;
  tableNumber?: string;
  table?: string;
}): Promise<QrSession | null> {
  const result = await validateQrCodeDetailed(params);
  return result.ok ? result.session : null;
}

/** Same as validateQrCodeApi but returns lock / error details for UI. */
export async function validateQrCodeDetailed(params: {
  qrCode?: string;
  qr?: string;
  storeId?: string;
  store?: string;
  tableNumber?: string;
  table?: string;
}): Promise<ValidateQrResult> {
  try {
    const existing = getStoredQrSession();
    const res = await apiFetch('/api/v1/qr/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        qrCode: params.qrCode || params.qr,
        storeId: params.storeId || params.store,
        tableNumber: params.tableNumber || params.table,
        sessionToken: existing?.sessionToken || undefined,
      }),
    });

    const data = await res.json().catch(() => null);

    if (data?.tableLocked || data?.error?.code === 'TABLE_LOCKED') {
      clearQrSession();
      return {
        ok: false,
        failure: {
          code: 'TABLE_LOCKED',
          message:
            data?.error?.message ||
            'このお席では現在、未会計の注文が進行中です。店員にお声がけください。',
          tableLocked: true,
          lockStatus: data?.lockStatus,
          storeId: data?.storeId,
          tableNumber: data?.tableNumber ? String(data.tableNumber) : undefined,
          store: data?.store,
        },
      };
    }

    if (!res.ok || !data?.valid || !data.sessionToken || !data.tableNumber) {
      clearQrSession();
      return {
        ok: false,
        failure: {
          code: data?.error?.code || 'INVALID_QR',
          message:
            data?.error?.message ||
            '無効または期限切れのお席QRコードです。店員にお声がけください。',
          storeId: data?.storeId || params.storeId || params.store,
          tableNumber: data?.tableNumber
            ? String(data.tableNumber)
            : params.tableNumber || params.table,
          store: data?.store,
        },
      };
    }

    const session: QrSession = {
      valid: true,
      sessionToken: data.sessionToken,
      storeId: data.storeId || params.storeId || params.store || '',
      tableNumber: String(data.tableNumber),
      qrCode: data.qrCode || params.qrCode || params.qr || '',
      restaurantName: data.restaurantName || 'Adarsha (アダルサ)',
      expiresAt: data.expiresAt,
      store: data.store,
      canOrder: data.canOrder !== false,
      tableLocked: false,
      lockStatus: data.lockStatus || 'AVAILABLE',
    };
    saveQrSession(session);
    return { ok: true, session };
  } catch {
    return {
      ok: false,
      failure: {
        code: 'NETWORK',
        message: '通信エラーです。もう一度QRコードをスキャンしてください。',
      },
    };
  }
}

/** Verifies existing session with backend */
export async function checkServerQrSession(): Promise<QrSession | null> {
  const current = getStoredQrSession();
  if (!current?.sessionToken) return null;
  try {
    const res = await apiFetch('/api/v1/qr/session', {
      headers: { 'X-QR-Session': current.sessionToken },
    });
    if (!res.ok) {
      return current;
    }
    const data = await res.json().catch(() => null);
    if (data?.valid && data.sessionToken && data.tableNumber) {
      const session: QrSession = {
        valid: true,
        sessionToken: data.sessionToken,
        storeId: data.storeId || current.storeId,
        tableNumber: String(data.tableNumber),
        qrCode: data.qrCode || current.qrCode,
        expiresAt: data.expiresAt || current.expiresAt,
        restaurantName: current.restaurantName,
        store: current.store,
        canOrder: data.canOrder !== false,
        lockStatus: data.lockStatus || current.lockStatus,
      };
      saveQrSession(session);
      return session;
    }
    if (data && data.valid === false) {
      clearQrSession();
      return null;
    }
    return current;
  } catch {
    return current;
  }
}
