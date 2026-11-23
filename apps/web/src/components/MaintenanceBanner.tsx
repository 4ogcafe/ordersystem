import { useEffect, useState } from 'react';
import { Wrench } from 'lucide-react';
import { getPublic } from '../lib/api';

/**
 * Public-site banner when admin enables maintenance mode from Overview.
 */
export default function MaintenanceBanner() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPublic<{
      maintenanceMode?: boolean;
      maintenanceMessageJa?: string | null;
      maintenanceMessageEn?: string | null;
    }>('/api/v1/settings')
      .then(data => {
        if (cancelled || !data?.maintenanceMode) return;
        const ja = (data.maintenanceMessageJa || '').trim();
        const en = (data.maintenanceMessageEn || '').trim();
        setMessage(ja || en || 'ただいまメンテナンス中です。しばらくしてから再度アクセスしてください。');
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!message) return null;

  return (
    <div
      role="status"
      style={{
        background: '#1f1612',
        color: '#fff7ed',
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        fontSize: '0.9rem',
        fontWeight: 600,
        textAlign: 'center',
        lineHeight: 1.45,
      }}
    >
      <Wrench size={16} aria-hidden />
      <span>{message}</span>
    </div>
  );
}
