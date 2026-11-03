/**
 * Secure Authentication & Session Storage Manager
 *
 * Security features:
 * 1. Auto-logout on browser close / system reset:
 *    - Defaults to sessionStorage (in-memory volatile storage).
 *    - SessionStorage is purged automatically by the browser when the browser window/process
 *      is closed, or when the operating system shuts down or restarts.
 * 2. Dynamic "Remember Me" support:
 *    - Only if the user explicitly checks "Remember Me" is the session persisted to localStorage.
 * 3. Cross-Tab Session Synchronization:
 *    - Uses BroadcastChannel ('adarsha_auth') to notify other tabs on logout or session refresh.
 * 4. Legacy Token Migration / Cleanup:
 *    - On initial load, clears un-remembered legacy tokens from localStorage to prevent lingering sessions.
 */

const STAFF_TOKEN_KEY = 'kalpana_session_token';
const STAFF_USER_KEY = 'kalpana_session_user';
const STAFF_REMEMBER_KEY = 'kalpana_session_remember';

const CUSTOMER_TOKEN_KEY = 'kalpana_customer_token';
const CUSTOMER_REMEMBER_KEY = 'kalpana_customer_remember';

// Cross-tab broadcast channel
let authChannel: BroadcastChannel | null = null;
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    authChannel = new BroadcastChannel('adarsha_auth_sync');
  }
} catch {
  authChannel = null;
}

/** Broadcast an auth event to other tabs */
export function broadcastAuthEvent(event: 'LOGOUT_STAFF' | 'LOGOUT_CUSTOMER' | 'LOGIN_STAFF' | 'LOGIN_CUSTOMER') {
  try {
    authChannel?.postMessage({ type: event, timestamp: Date.now() });
  } catch {
    // Ignore broadcast errors
  }
}

/** Subscribe to cross-tab auth events */
export function onAuthEvent(callback: (type: string) => void): () => void {
  if (!authChannel && typeof window === 'undefined') return () => {};

  const handleMessage = (e: MessageEvent) => {
    if (e.data?.type) {
      callback(e.data.type);
    }
  };

  const handleStorage = (e: StorageEvent) => {
    if (e.key === 'kalpana_auth_event' && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue);
        if (parsed?.type) callback(parsed.type);
      } catch {
        // ignore
      }
    }
  };

  authChannel?.addEventListener('message', handleMessage);
  window.addEventListener('storage', handleStorage);

  return () => {
    authChannel?.removeEventListener('message', handleMessage);
    window.removeEventListener('storage', handleStorage);
  };
}

/** Trigger cross-tab sync via storage event fallback */
function triggerStorageSync(type: string) {
  try {
    localStorage.setItem('kalpana_auth_event', JSON.stringify({ type, t: Date.now() }));
  } catch {
    // ignore
  }
}

// -------------------------------------------------------------
// Initialization: Cleanup legacy unremembered localStorage items
// -------------------------------------------------------------
if (typeof window !== 'undefined') {
  try {
    // If staff was NOT remembered, remove any lingering localStorage staff token
    if (localStorage.getItem(STAFF_REMEMBER_KEY) !== 'true') {
      localStorage.removeItem(STAFF_TOKEN_KEY);
      localStorage.removeItem(STAFF_USER_KEY);
    }
    // If customer was NOT remembered, remove any lingering localStorage customer token
    if (localStorage.getItem(CUSTOMER_REMEMBER_KEY) !== 'true') {
      localStorage.removeItem(CUSTOMER_TOKEN_KEY);
    }
  } catch {
    // ignore storage access errors
  }
}

// -------------------------------------------------------------
// Staff / Admin Authentication Storage
// -------------------------------------------------------------

export function getStaffToken(): string | null {
  if (typeof window === 'undefined') return null;
  // 1. Check sessionStorage first (session-bound)
  const sessionToken = sessionStorage.getItem(STAFF_TOKEN_KEY);
  if (sessionToken) return sessionToken;

  // 2. If remembered on this device, check localStorage
  if (localStorage.getItem(STAFF_REMEMBER_KEY) === 'true') {
    return localStorage.getItem(STAFF_TOKEN_KEY);
  }

  return null;
}

export function getStaffUser(): any | null {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem(STAFF_USER_KEY) ??
    (localStorage.getItem(STAFF_REMEMBER_KEY) === 'true' ? localStorage.getItem(STAFF_USER_KEY) : null);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setStaffSession(token: string, user?: any, rememberMe = false): void {
  if (typeof window === 'undefined') return;

  // Always store in sessionStorage for current session performance
  sessionStorage.setItem(STAFF_TOKEN_KEY, token);
  if (user) {
    sessionStorage.setItem(STAFF_USER_KEY, JSON.stringify(user));
  }

  if (rememberMe) {
    localStorage.setItem(STAFF_REMEMBER_KEY, 'true');
    localStorage.setItem(STAFF_TOKEN_KEY, token);
    if (user) {
      localStorage.setItem(STAFF_USER_KEY, JSON.stringify(user));
    }
  } else {
    // Auto-logout on browser close: do NOT store in localStorage!
    localStorage.removeItem(STAFF_REMEMBER_KEY);
    localStorage.removeItem(STAFF_TOKEN_KEY);
    localStorage.removeItem(STAFF_USER_KEY);
  }

  broadcastAuthEvent('LOGIN_STAFF');
  triggerStorageSync('LOGIN_STAFF');
}

export function clearStaffSession(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(STAFF_TOKEN_KEY);
  sessionStorage.removeItem(STAFF_USER_KEY);
  localStorage.removeItem(STAFF_TOKEN_KEY);
  localStorage.removeItem(STAFF_USER_KEY);
  localStorage.removeItem(STAFF_REMEMBER_KEY);

  broadcastAuthEvent('LOGOUT_STAFF');
  triggerStorageSync('LOGOUT_STAFF');
}

// -------------------------------------------------------------
// Customer Authentication Storage
// -------------------------------------------------------------

export function getCustomerToken(): string | null {
  if (typeof window === 'undefined') return null;
  // 1. Check sessionStorage first
  const sessionToken = sessionStorage.getItem(CUSTOMER_TOKEN_KEY);
  if (sessionToken) return sessionToken;

  // 2. Check localStorage if remembered
  if (localStorage.getItem(CUSTOMER_REMEMBER_KEY) === 'true') {
    return localStorage.getItem(CUSTOMER_TOKEN_KEY);
  }

  return null;
}

export function setCustomerSession(token: string, rememberMe = false): void {
  if (typeof window === 'undefined') return;

  sessionStorage.setItem(CUSTOMER_TOKEN_KEY, token);

  if (rememberMe) {
    localStorage.setItem(CUSTOMER_REMEMBER_KEY, 'true');
    localStorage.setItem(CUSTOMER_TOKEN_KEY, token);
  } else {
    // Auto-logout on browser close: do NOT store in localStorage!
    localStorage.removeItem(CUSTOMER_REMEMBER_KEY);
    localStorage.removeItem(CUSTOMER_TOKEN_KEY);
  }

  broadcastAuthEvent('LOGIN_CUSTOMER');
  triggerStorageSync('LOGIN_CUSTOMER');
}

export function clearCustomerSession(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(CUSTOMER_TOKEN_KEY);
  localStorage.removeItem(CUSTOMER_TOKEN_KEY);
  localStorage.removeItem(CUSTOMER_REMEMBER_KEY);

  broadcastAuthEvent('LOGOUT_CUSTOMER');
  triggerStorageSync('LOGOUT_CUSTOMER');
}
