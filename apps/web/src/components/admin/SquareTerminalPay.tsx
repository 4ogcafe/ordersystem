import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { toast } from 'react-hot-toast';
import { CreditCard, Loader2, XCircle, CheckCircle2, RefreshCw } from 'lucide-react';
import { apiFetch, errorMessage } from '../../lib/api';
import type { PaymentReceivingDevice } from './PaymentDevicesTab';
import { yen } from '../../lib/format';

type Props = {
  amount: number;
  storeId?: string | null;
  orderIds?: string[];
  label?: string;
  disabled?: boolean;
  onPaid: (meta: { squarePaymentId: string | null; paymentRecordId?: string; checkoutId?: string; deviceId?: string }) => void | Promise<void>;
};

/**
 * Sends an amount to a Square Terminal payment receiving device and polls until paid/cancelled.
 */
export default function SquareTerminalPay({ amount, storeId, orderIds, label, disabled, onPaid }: Props) {
  const [devices, setDevices] = useState<PaymentReceivingDevice[]>([]);
  const [configured, setConfigured] = useState(false);
  const [deviceId, setDeviceId] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<'idle' | 'waiting' | 'paid' | 'cancelled' | 'error'>('idle');
  const [checkoutId, setCheckoutId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const pollRef = useRef<number | null>(null);
  const onPaidRef = useRef(onPaid);
  onPaidRef.current = onPaid;

  useEffect(() => {
    let cancelled = false;
    apiFetch(`/api/v1/square/devices?active=1${storeId ? `&storeId=${encodeURIComponent(storeId)}` : ''}`)
      .then(async res => {
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setConfigured(Boolean(data.configured));
        const list = (Array.isArray(data.devices) ? data.devices : []).filter(
          (d: PaymentReceivingDevice) =>
            d.isActive !== false &&
            d.squareDeviceId &&
            (!d.provider || d.provider === 'SQUARE_TERMINAL'),
        );
        setDevices(list);
        const preferred = list.find((d: PaymentReceivingDevice) => d.isDefault) ?? list[0];
        if (preferred) setDeviceId(preferred.squareDeviceId);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  useEffect(() => {
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

  const stopPoll = () => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const startCheckout = async () => {
    if (amount <= 0) {
      toast.error('金額が不正です');
      return;
    }
    if (!deviceId) {
      toast.error('決済端末を選択してください');
      return;
    }
    setBusy(true);
    setStatus('waiting');
    setMessage('端末に決済を送信しました。お客様のカード操作をお待ちください…');
    try {
      const sessionId = crypto.randomUUID();
      const res = await apiFetch('/api/v1/square/terminal/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          amount,
          deviceId,
          storeId: storeId || undefined,
          orderIds: orderIds?.length ? orderIds : undefined,
          label: label || 'Adarsha レジ会計',
        }),
      });
      if (!res.ok) {
        const err = await errorMessage(res, '端末へ送信できませんでした');
        setStatus('error');
        setMessage(err);
        toast.error(err);
        return;
      }
      const data = await res.json();
      const id = data.checkoutId as string;
      setCheckoutId(id);
      stopPoll();
      pollRef.current = window.setInterval(async () => {
        try {
          const st = await apiFetch(`/api/v1/square/terminal/checkout/${encodeURIComponent(id)}/status`);
          if (!st.ok) return;
          const body = await st.json();
          if (body.paid) {
            stopPoll();
            setStatus('paid');
            setMessage('決済が完了しました');
            toast.success('Square 端末での決済が完了しました');
            await onPaidRef.current({
              squarePaymentId: body.squarePaymentId ?? null,
              paymentRecordId: data.paymentRecordId,
              checkoutId: id,
              deviceId,
            });
          } else if (body.cancelled) {
            stopPoll();
            setStatus('cancelled');
            setMessage('決済がキャンセルされました');
          }
        } catch {
          // keep polling
        }
      }, 2500);
    } catch {
      setStatus('error');
      setMessage('通信エラーが発生しました');
      toast.error('通信エラーが発生しました');
    } finally {
      setBusy(false);
    }
  };

  const cancelCheckout = async () => {
    if (!checkoutId) return;
    setBusy(true);
    try {
      await apiFetch(`/api/v1/square/terminal/checkout/${encodeURIComponent(checkoutId)}/cancel`, { method: 'POST' });
      stopPoll();
      setStatus('cancelled');
      setMessage('端末の決済をキャンセルしました');
    } catch {
      toast.error('キャンセルに失敗しました');
    } finally {
      setBusy(false);
    }
  };

  if (!configured) {
    return (
      <div style={box}>
        <div style={head}><CreditCard size={16} /> Square 端末決済</div>
        <p style={hint}>Square が未設定のため、端末への送信はできません。手動でカード受領を確認して精算してください。</p>
      </div>
    );
  }

  if (devices.length === 0) {
    return (
      <div style={box}>
        <div style={head}><CreditCard size={16} /> Square 端末決済</div>
        <p style={hint}>ペアリング済みの決済端末がありません。Admin → Payment Devices で端末を登録してください。</p>
      </div>
    );
  }

  return (
    <div style={box}>
      <div style={head}>
        <CreditCard size={16} /> Square 端末へ送信
        <span style={{ marginLeft: 'auto', fontWeight: 800, color: '#1f1612' }}>{yen(amount)}</span>
      </div>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.8rem', fontWeight: 700 }}>
        決済受信端末
        <select
          value={deviceId}
          disabled={busy || status === 'waiting'}
          onChange={e => setDeviceId(e.target.value)}
          style={select}
        >
          {devices.map(d => (
            <option key={d.id} value={d.squareDeviceId}>
              {d.name}{d.isDefault ? ' (default)' : ''} · {d.status}
            </option>
          ))}
        </select>
      </label>

      {status === 'waiting' ? (
        <div style={waitBox}>
          <Loader2 size={22} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
          <div style={{ fontSize: '0.85rem', fontWeight: 700, textAlign: 'center' }}>{message}</div>
          <button type="button" style={ghostBtn} disabled={busy} onClick={cancelCheckout}>
            <XCircle size={14} /> キャンセル
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" style={primaryBtn} disabled={disabled || busy || amount <= 0} onClick={startCheckout}>
            {busy ? <Loader2 size={15} /> : <CreditCard size={15} />}
            端末でカード決済を開始
          </button>
          {(status === 'cancelled' || status === 'error') && (
            <button type="button" style={ghostBtn} onClick={() => { setStatus('idle'); setMessage(''); }}>
              <RefreshCw size={14} /> リセット
            </button>
          )}
        </div>
      )}

      {status === 'paid' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#047857', fontWeight: 700, fontSize: '0.85rem' }}>
          <CheckCircle2 size={16} /> {message}
        </div>
      )}
      {(status === 'error' || status === 'cancelled') && message && (
        <div style={{ color: status === 'error' ? '#b91c1c' : '#6b7280', fontSize: '0.82rem' }}>{message}</div>
      )}
    </div>
  );
}

const box: CSSProperties = {
  border: '1.5px solid #e2d9f3',
  borderRadius: 12,
  background: '#faf8ff',
  padding: '12px 14px',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};
const head: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.88rem', fontWeight: 800, color: '#3d1e8f' };
const hint: CSSProperties = { margin: 0, fontSize: '0.8rem', color: '#6b635c', lineHeight: 1.45 };
const select: CSSProperties = { padding: '8px 10px', borderRadius: 8, border: '1.5px solid #e2d9f3', background: '#fff', fontSize: '0.85rem' };
const primaryBtn: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
  padding: '10px 12px',
  borderRadius: 9,
  border: 'none',
  background: '#3d1e8f',
  color: '#fff',
  fontSize: '0.86rem',
  fontWeight: 700,
  cursor: 'pointer',
};
const ghostBtn: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid #d1d5db',
  background: '#fff',
  fontSize: '0.8rem',
  fontWeight: 600,
  cursor: 'pointer',
};
const waitBox: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 10,
  padding: 12,
  borderRadius: 10,
  background: '#fff',
  border: '1px dashed #c4b5fd',
};
