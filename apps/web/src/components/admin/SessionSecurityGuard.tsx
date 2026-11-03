import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { clearStaffSession, clearCustomerSession, onAuthEvent } from '../../lib/auth-storage';
import { apiFetch } from '../../lib/api';
import { ShieldAlert, LogOut, RefreshCw } from 'lucide-react';

interface SessionSecurityGuardProps {
  type?: 'STAFF' | 'CUSTOMER';
  /** Total idle timeout in minutes before auto logout (default 30 min) */
  timeoutMinutes?: number;
  /** Warning countdown window before logout in minutes (default 2 min) */
  warningMinutes?: number;
}

export default function SessionSecurityGuard({
  type = 'STAFF',
  timeoutMinutes = 30,
  warningMinutes = 2,
}: SessionSecurityGuardProps) {
  const navigate = useNavigate();
  const [warningVisible, setWarningVisible] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(warningMinutes * 60);

  const timeoutMs = timeoutMinutes * 60 * 1000;
  const warningMs = (timeoutMinutes - warningMinutes) * 60 * 1000;

  const lastActivityRef = useRef<number>(Date.now());
  const warningVisibleRef = useRef<boolean>(false);
  warningVisibleRef.current = warningVisible;

  const performLogout = useCallback(async (reason: 'idle_timeout' | 'manual' = 'idle_timeout') => {
    if (type === 'STAFF') {
      clearStaffSession();
      await apiFetch('/api/v1/auth/logout', { method: 'POST' }).catch(() => undefined);
      navigate(`/login?reason=${reason}`, { replace: true });
    } else {
      clearCustomerSession();
      await apiFetch('/api/v1/customers/logout', { method: 'POST' }).catch(() => undefined);
      navigate(`/account/login?reason=${reason}`, { replace: true });
    }
  }, [type, navigate]);

  // Reset activity timestamp on user interaction
  const recordActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (warningVisibleRef.current) {
      setWarningVisible(false);
      setSecondsRemaining(warningMinutes * 60);
    }
  }, [warningMinutes]);

  // Listen to cross-tab logout events
  useEffect(() => {
    const unsub = onAuthEvent((eventType) => {
      if (type === 'STAFF' && eventType === 'LOGOUT_STAFF') {
        navigate('/login?reason=session_expired', { replace: true });
      } else if (type === 'CUSTOMER' && eventType === 'LOGOUT_CUSTOMER') {
        navigate('/account/login?reason=session_expired', { replace: true });
      }
    });
    return unsub;
  }, [type, navigate]);

  // Attach event listeners for user activity
  useEffect(() => {
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart', 'mousemove'];
    let lastThrottled = 0;

    const handleEvent = () => {
      const now = Date.now();
      // Throttle event handling to at most once every 3 seconds
      if (now - lastThrottled > 3000) {
        lastThrottled = now;
        recordActivity();
      }
    };

    events.forEach((evt) => window.addEventListener(evt, handleEvent, { passive: true }));
    return () => {
      events.forEach((evt) => window.removeEventListener(evt, handleEvent));
    };
  }, [recordActivity]);

  // Periodic interval + system sleep / lid close detection
  useEffect(() => {
    const checkActivity = () => {
      const now = Date.now();
      const elapsed = now - lastActivityRef.current;

      if (elapsed >= timeoutMs) {
        // Exceeded timeout limit -> auto logout
        performLogout('idle_timeout');
        return;
      }

      if (elapsed >= warningMs) {
        // Inside warning window -> show modal countdown
        setWarningVisible(true);
        const rem = Math.max(0, Math.ceil((timeoutMs - elapsed) / 1000));
        setSecondsRemaining(rem);
      } else {
        if (warningVisibleRef.current) {
          setWarningVisible(false);
        }
      }
    };

    // Check every second
    const interval = setInterval(checkActivity, 1000);

    // Sleep / system reset detection: when tab becomes visible or gains focus, check immediately
    const handleVisibilityOrFocus = () => {
      checkActivity();
    };

    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
    };
  }, [timeoutMs, warningMs, performLogout]);

  if (!warningVisible) return null;

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const timeFormatted = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="security-timeout-title"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        padding: '16px',
        animation: 'fadeIn 0.2s ease-out',
      }}
    >
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          maxWidth: '440px',
          width: '100%',
          padding: '24px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          textAlign: 'center',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            backgroundColor: '#fef2f2',
            color: '#dc2626',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
          }}
        >
          <ShieldAlert size={32} />
        </div>

        <h3
          id="security-timeout-title"
          style={{
            fontSize: '1.25rem',
            fontWeight: '700',
            color: '#111827',
            margin: '0 0 8px',
          }}
        >
          自動ログアウトの予告
        </h3>

        <p style={{ fontSize: '0.925rem', color: '#4b5563', margin: '0 0 16px', lineHeight: 1.5 }}>
          セキュリティ保護のため、一定時間操作がない場合は自動的にログアウトされます。
        </p>

        <div
          style={{
            backgroundColor: '#f3f4f6',
            borderRadius: '12px',
            padding: '12px',
            marginBottom: '20px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>残り時間:</span>
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: '1.4rem',
              fontWeight: '700',
              color: secondsRemaining <= 30 ? '#dc2626' : '#b5451b',
            }}
          >
            {timeFormatted}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={recordActivity}
            style={{
              flex: 1,
              padding: '12px 16px',
              backgroundColor: '#111827',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: '600',
              fontSize: '0.95rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <RefreshCw size={16} />
            操作を継続する
          </button>
          <button
            type="button"
            onClick={() => performLogout('manual')}
            style={{
              padding: '12px 16px',
              backgroundColor: '#f3f4f6',
              color: '#4b5563',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              fontWeight: '600',
              fontSize: '0.95rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <LogOut size={16} />
            ログアウト
          </button>
        </div>
      </div>
    </div>
  );
}
