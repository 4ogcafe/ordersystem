/**
 * Hardware Barcode / QR Scanner Manager
 * Tailored for embedded/recessed counter scanners such as:
 * "NETUM NT-EM61 1D/2D Recessed Scanner Module USB/TTL Development Kit"
 *
 * Supports:
 * 1. USB HID Keyboard Wedge (automatic global keystroke interception)
 * 2. Web Serial API (USB Virtual COM / TTL UART direct streaming)
 */

export interface ScannerConfig {
  enabled: boolean;
  model: 'NETUM_NT_EM61' | 'GENERIC_USB_HID';
  interfaceType: 'USB_HID' | 'WEB_SERIAL';
  globalListening: boolean;
  stripPrefix: string;
  terminator: 'ENTER' | 'TAB' | 'NONE';
  baudRate: number;
  speedThresholdMs: number;
  autoOpenStampCounter: boolean;
  autoStampOnScan: boolean;
  autoStampGapHours: number;
  beepOnScan: boolean;
}

export interface ScanEventDetail {
  raw: string;
  memberCode: string;
  timestamp: number;
}

export const SCANNER_STORAGE_KEY = 'adarsha_scanner_config';

export const DEFAULT_SCANNER_CONFIG: ScannerConfig = {
  enabled: true,
  model: 'NETUM_NT_EM61',
  interfaceType: 'USB_HID',
  globalListening: true,
  stripPrefix: 'ADARSHA:',
  terminator: 'ENTER',
  baudRate: 9600,
  speedThresholdMs: 50,
  autoOpenStampCounter: true,
  autoStampOnScan: true,
  autoStampGapHours: 6,
  beepOnScan: true,
};

export function getScannerConfig(): ScannerConfig {
  try {
    const raw = localStorage.getItem(SCANNER_STORAGE_KEY) ?? localStorage.getItem('kalpana_scanner_config');
    return raw ? { ...DEFAULT_SCANNER_CONFIG, ...JSON.parse(raw) } : DEFAULT_SCANNER_CONFIG;
  } catch {
    return DEFAULT_SCANNER_CONFIG;
  }
}

export function saveScannerConfig(config: ScannerConfig): void {
  try {
    localStorage.setItem(SCANNER_STORAGE_KEY, JSON.stringify(config));
    window.dispatchEvent(new CustomEvent('adarsha:scanner-config-changed', { detail: config }));
    window.dispatchEvent(new CustomEvent('kalpana:scanner-config-changed', { detail: config }));
  } catch (err) {
    console.error('Failed to save scanner config to localStorage', err);
  }
}

// 8-character Base32 member code (excludes 0, 1, I, O, L)
const MEMBER_CODE_REGEX = /^[2-9A-HJKMNP-Z]{8}$/;

/**
 * Normalizes scanned input:
 * Removes "ADARSHA:", "KALPNA:" or "KALPANA:" prefix, URL wrappers, whitespace, hyphens, and uppercase.
 */
export function normalizeScannedMemberCode(raw: string, stripPrefix = 'ADARSHA:'): string {
  let val = raw.trim();
  val = val.replace(/^(ADARSHA|KALPNA|KALPANA):/i, '');
  if (stripPrefix && val.toUpperCase().startsWith(stripPrefix.toUpperCase())) {
    val = val.slice(stripPrefix.length);
  }
  // If QR was a URL like https://adarsha.example/account?code=K7MP2QXA or adarsha://member/K7MP2QXA
  const match = val.match(/(?:code=|member\/)([2-9A-HJKMNP-Z]{4}-?[2-9A-HJKMNP-Z]{4})/i);
  if (match) {
    val = match[1];
  }
  return val.toUpperCase().replace(/[\s-]/g, '');
}

/** Check if normalized code is a valid 8-char member code */
export function isValidMemberCode(code: string): boolean {
  return MEMBER_CODE_REGEX.test(code);
}

/** Crisp POS-style chime on scan */
export function playScanBeep(tone: 'success' | 'error' = 'success') {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (tone === 'success') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1760, ctx.currentTime); // A6
      osc.frequency.exponentialRampToValueAtTime(2637, ctx.currentTime + 0.08); // E7
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
      setTimeout(() => ctx.close(), 200);
    } else {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(280, ctx.currentTime);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
      setTimeout(() => ctx.close(), 300);
    }
  } catch {
    // Audio unavailable or blocked by browser policy
  }
}

/** Dispatches global member-scanned event to notify StampCounter and AdminDashboard */
export function dispatchMemberScanned(raw: string, memberCode: string) {
  const config = getScannerConfig();
  if (config.beepOnScan) {
    playScanBeep('success');
  }
  window.dispatchEvent(
    new CustomEvent('adarsha:member-scanned', {
      detail: { raw, memberCode, timestamp: Date.now() },
    })
  );
  window.dispatchEvent(
    new CustomEvent('kalpana:member-scanned', {
      detail: { raw, memberCode, timestamp: Date.now() },
    })
  );
}

// -----------------------------------------------------------------------------
// Global USB HID Keyboard Wedge Listener (Singleton)
// -----------------------------------------------------------------------------
let isListenerActive = false;
let keyBuffer = '';
let lastKeyTime = 0;

export function initScannerListener(): () => void {
  if (typeof window === 'undefined' || isListenerActive) {
    return () => {};
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    const config = getScannerConfig();
    if (!config.enabled) return;
    if (config.interfaceType !== 'USB_HID') return;

    const now = Date.now();
    const interval = now - lastKeyTime;
    lastKeyTime = now;

    // Reset buffer if delay between keystrokes is too long for a hardware scanner
    // Scanners send keys in rapid bursts (< 50ms)
    const isBurst = interval <= config.speedThresholdMs;

    if (e.key === 'Enter') {
      if (keyBuffer.length >= 4) {
        const raw = keyBuffer;
        const normalized = normalizeScannedMemberCode(raw, config.stripPrefix);
        if (isValidMemberCode(normalized) || raw.toUpperCase().startsWith('ADARSHA:') || raw.toUpperCase().startsWith('KALPANA:')) {
          // Scanner detected!
          if (config.globalListening) {
            e.preventDefault();
            e.stopPropagation();
          }
          dispatchMemberScanned(raw, normalized);
          keyBuffer = '';
          return;
        }
      }
      keyBuffer = '';
      return;
    }

    // Only collect single printable characters
    if (e.key.length === 1) {
      if (!isBurst && keyBuffer.length > 0 && !keyBuffer.toUpperCase().startsWith('ADARSHA') && !keyBuffer.toUpperCase().startsWith('KALPANA')) {
        keyBuffer = '';
      }
      keyBuffer += e.key;

      // Protection: if buffer grows unusually large, truncate
      if (keyBuffer.length > 100) {
        keyBuffer = keyBuffer.slice(-50);
      }
    }
  };

  window.addEventListener('keydown', handleKeyDown, true);
  isListenerActive = true;

  return () => {
    window.removeEventListener('keydown', handleKeyDown, true);
    isListenerActive = false;
  };
}

// -----------------------------------------------------------------------------
// Web Serial API (USB Virtual COM / TTL UART)
// -----------------------------------------------------------------------------
let activeSerialPort: unknown = null;
let serialReader: unknown = null;
let serialKeepReading = false;

export function isWebSerialSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serial' in navigator;
}

export async function connectWebSerial(baudRate = 9600): Promise<{ success: boolean; error?: string }> {
  if (!isWebSerialSupported()) {
    return { success: false, error: 'Web Serial API is not supported in this browser. Please use Chrome or Edge.' };
  }

  try {
    // Request a port from the user
    const serialObj = (navigator as unknown as { serial: { requestPort: () => Promise<any> } }).serial;
    const port = await serialObj.requestPort();
    await port.open({ baudRate });
    activeSerialPort = port;
    serialKeepReading = true;

    // Start background reading loop
    readSerialStream(port);
    return { success: true };
  } catch (err) {
    console.error('Failed to open serial port', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to connect.' };
  }
}

export async function disconnectWebSerial(): Promise<void> {
  serialKeepReading = false;
  try {
    if (serialReader) {
      await (serialReader as { cancel: () => Promise<void> }).cancel();
      serialReader = null;
    }
    if (activeSerialPort) {
      await (activeSerialPort as { close: () => Promise<void> }).close();
      activeSerialPort = null;
    }
  } catch (err) {
    console.error('Error closing serial port', err);
  }
}

async function readSerialStream(port: any) {
  let buffer = '';
  const textDecoder = new TextDecoderStream();
  const readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
  const reader = textDecoder.readable.getReader();
  serialReader = reader;

  try {
    while (serialKeepReading) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        buffer += value;
        if (buffer.includes('\r') || buffer.includes('\n')) {
          const lines = buffer.split(/[\r\n]+/);
          buffer = lines.pop() || '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed) {
              const config = getScannerConfig();
              const normalized = normalizeScannedMemberCode(trimmed, config.stripPrefix);
              dispatchMemberScanned(trimmed, normalized);
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('Serial read error', err);
  } finally {
    reader.releaseLock();
    await readableStreamClosed.catch(() => {});
  }
}
