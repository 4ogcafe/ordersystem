import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, Check, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { apiFetch } from '../../lib/api';

export interface FloorAlert {
  id: string;
  storeId?: string;
  tableNumber: string;
  kind: 'CALL' | 'BILL' | string;
  reason?: string;
  message: string;
  createdAt: string;
}

interface Props {
  /** Poll interval ms */
  intervalMs?: number;
  /** Optional store filter (ALL or store id) */
  storeFilter?: string;
  /** Play a short chime when a new alert arrives */
  sound?: boolean;
  compact?: boolean;
}

function reasonLabel(reason?: string): string {
  switch ((reason || '').toUpperCase()) {
    case 'WATER':
      return 'お冷';
    case 'EXTRA':
      return '取り皿・おしぼり';
    case 'BILL':
      return 'お会計';
    case 'CALL':
      return '呼出';
    case 'ONLINE':
      return 'カード決済希望';
    case 'REGISTER':
      return 'レジ会計希望';
    default:
      return reason || '呼出';
  }
}

/**
 * Live floor alerts from table QR (call staff / request bill).
 * Used on Kitchen and Cash Counter so staff see table requests immediately.
 */
export default function TableFloorAlerts({
  intervalMs = 8000,
  storeFilter = 'ALL',
  sound = true,
  compact = false,
}: Props) {
  const [alerts, setAlerts] = useState<FloorAlert[]>([]);
  const known = useRef<Set<string> | null>(null);
  const audioRef = useRef<AudioContext | null>(null);

  const chime = useCallback(() => {
    if (!sound) return;
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      if (!audioRef.current) audioRef.current = new Ctx();
      const ctx = audioRef.current;
      const start = ctx.currentTime;
      const tone = ctx.createOscillator();
      const gain = ctx.createGain();
      tone.frequency.value = 920;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.35, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
      tone.connect(gain).connect(ctx.destination);
      tone.start(start);
      tone.stop(start + 0.4);
    } catch {
      // ignore audio failures
    }
  }, [sound]);

  const load = useCallback(async () => {
    try {
      const q = storeFilter && storeFilter !== 'ALL' ? `?storeId=${encodeURIComponent(storeFilter)}` : '';
      const res = await apiFetch(`/api/v1/tables/alerts${q}`);
      if (!res.ok) return;
      const data = await res.json();
      const list: FloorAlert[] = Array.isArray(data?.alerts) ? data.alerts : [];
      setAlerts(list);

      const ids = new Set(list.map(a => a.id));
      if (known.current) {
        const arrived = list.filter(a => !known.current!.has(a.id));
        if (arrived.length > 0) {
          chime();
          for (const a of arrived.slice(0, 3)) {
            toast(
              `🔔 卓${a.tableNumber} · ${a.kind === 'BILL' ? 'お会計' : reasonLabel(a.reason)}`,
              { id: `floor-${a.id}`, duration: 8000 },
            );
          }
        }
      }
      known.current = ids;
    } catch {
      // offline / not authorized — stay quiet
    }
  }, [chime, storeFilter]);

  useEffect(() => {
    load();
    const id = setInterval(load, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load, intervalMs]);

  const ack = async (alertId: string) => {
    try {
      await apiFetch('/api/v1/tables/alerts/ack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: alertId }),
      });
      setAlerts(prev => prev.filter(a => a.id !== alertId));
    } catch {
      toast.error('確認できませんでした');
    }
  };

  const ackAll = async () => {
    try {
      await apiFetch('/api/v1/tables/alerts/ack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
      setAlerts([]);
    } catch {
      toast.error('確認できませんでした');
    }
  };

  if (alerts.length === 0) return null;

  return (
    <div
      style={{
        position: compact ? 'relative' : 'sticky',
        top: compact ? undefined : 0,
        zIndex: 40,
        background: 'linear-gradient(135deg, #7c2d12 0%, #c2410c 100%)',
        color: '#fff',
        padding: compact ? '8px 10px' : '10px 14px',
        borderRadius: compact ? 12 : 0,
        boxShadow: '0 4px 20px rgba(124,45,18,0.35)',
        marginBottom: compact ? 10 : 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: '0.92rem' }}>
          <Bell size={16} />
          <span>お席からの呼出 · {alerts.length}件</span>
        </div>
        <button
          type="button"
          onClick={ackAll}
          style={{
            background: 'rgba(255,255,255,0.18)',
            border: '1px solid rgba(255,255,255,0.35)',
            color: '#fff',
            borderRadius: 999,
            padding: '4px 10px',
            fontSize: '0.75rem',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          すべて確認
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: compact ? 160 : 220, overflowY: 'auto' }}>
        {alerts.map(a => (
          <div
            key={a.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              background: 'rgba(0,0,0,0.22)',
              borderRadius: 10,
              padding: '8px 10px',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>
                テーブル {a.tableNumber}
                <span style={{ marginLeft: 8, fontWeight: 600, opacity: 0.9 }}>
                  {a.kind === 'BILL' ? '🧾 お会計' : `🔔 ${reasonLabel(a.reason)}`}
                </span>
              </div>
              <div style={{ fontSize: '0.75rem', opacity: 0.85, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {a.message}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => ack(a.id)}
                title="対応済み"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  border: 'none',
                  background: '#22c55e',
                  color: '#fff',
                  cursor: 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <Check size={16} />
              </button>
              <button
                type="button"
                onClick={() => ack(a.id)}
                title="閉じる"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  border: 'none',
                  background: 'rgba(255,255,255,0.2)',
                  color: '#fff',
                  cursor: 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <X size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
