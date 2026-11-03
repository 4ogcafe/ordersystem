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
}

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

/** Validates QR code or table/store through backend API */
export async function validateQrCodeApi(params: {
  qrCode?: string;
  qr?: string;
  storeId?: string;
  store?: string;
  tableNumber?: string;
  table?: string;
}): Promise<QrSession | null> {
  try {
    const res = await apiFetch('/api/v1/qr/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      clearQrSession();
      return null;
    }

    const data = await res.json();
    if (data?.valid && data.sessionToken && data.tableNumber) {
      const session: QrSession = {
        valid: true,
        sessionToken: data.sessionToken,
        storeId: data.storeId || params.storeId || params.store || 'musashisakai',
        tableNumber: data.tableNumber,
        qrCode: data.qrCode || params.qrCode || params.qr || '',
        restaurantName: data.restaurantName || 'Adarsha (アダルサ)',
        expiresAt: data.expiresAt,
        store: data.store,
      };
      saveQrSession(session);
      return session;
    }
    clearQrSession();
    return null;
  } catch {
    return null;
  }
}

/** Verifies existing session with backend */
export async function checkServerQrSession(): Promise<QrSession | null> {
  const current = getStoredQrSession();
  try {
    const headers: Record<string, string> = {};
    if (current?.sessionToken) {
      headers['X-QR-Session'] = current.sessionToken;
    }

    const res = await apiFetch('/api/v1/qr/session', {
      headers,
    });
    if (!res.ok) {
      clearQrSession();
      return null;
    }
    const data = await res.json();
    if (data?.valid && data.sessionToken && data.tableNumber) {
      const session: QrSession = {
        valid: true,
        sessionToken: data.sessionToken,
        storeId: data.storeId,
        tableNumber: data.tableNumber,
        qrCode: data.qrCode,
        expiresAt: data.expiresAt,
      };
      saveQrSession(session);
      return session;
    }
    clearQrSession();
    return null;
  } catch {
    return current; // if offline, use stored if valid
  }
}
