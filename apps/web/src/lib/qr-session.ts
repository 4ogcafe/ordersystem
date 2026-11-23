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
      body: JSON.stringify({
        qrCode: params.qrCode || params.qr,
        storeId: params.storeId || params.store,
        tableNumber: params.tableNumber || params.table,
      }),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.valid || !data.sessionToken || !data.tableNumber) {
      clearQrSession();
      return null;
    }

    const session: QrSession = {
      valid: true,
      sessionToken: data.sessionToken,
      storeId: data.storeId || params.storeId || params.store || 'musashisakai',
      tableNumber: String(data.tableNumber),
      qrCode: data.qrCode || params.qrCode || params.qr || '',
      restaurantName: data.restaurantName || 'Adarsha (アダルサ)',
      expiresAt: data.expiresAt,
      store: data.store,
    };
    saveQrSession(session);
    return session;
  } catch {
    return null;
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
    // Soft failure (network / gateway): keep the local session until it expires.
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
      };
      saveQrSession(session);
      return session;
    }
    // Explicit invalid from server — only clear when we got a clear "valid: false".
    if (data && data.valid === false) {
      clearQrSession();
      return null;
    }
    return current;
  } catch {
    return current; // if offline, use stored if valid
  }
}
