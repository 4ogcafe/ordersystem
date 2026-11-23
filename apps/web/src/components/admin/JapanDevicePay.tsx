import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { toast } from 'react-hot-toast';
import { CheckCircle2, CreditCard, Loader2, QrCode, Smartphone, Hand } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { yen } from '../../lib/format';
import {
  cashierMethodLabel,
  paymentDeviceProviderLabel,
  type CashierPaymentMethod,
} from '../../lib/payment-methods';
import type { PaymentReceivingDevice } from './PaymentDevicesTab';
import SquareTerminalPay from './SquareTerminalPay';

type Props = {
  method: CashierPaymentMethod;
  amount: number;
  storeId?: string | null;
  orderIds?: string[];
  label?: string;
  disabled?: boolean;
  onPaid: (meta: {
    paymentMethod: CashierPaymentMethod;
    squarePaymentId?: string | null;
    deviceId?: string;
    deviceName?: string;
    provider?: string;
    authCode?: string;
    noteExtra?: string;
  }) => void | Promise<void>;
};

/**
 * Cash-counter panel: routes the selected Japan tender to the right receiving device
 * (Square Terminal auto-checkout, or CAT / QR / manual confirm).
 */
export default function JapanDevicePay({
  method,
  amount,
  storeId,
  orderIds,
  label,
  disabled,
  onPaid,
}: Props) {
  const [devices, setDevices] = useState<PaymentReceivingDevice[]>([]);
  const [deviceKey, setDeviceKey] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setConfirmed(false);
    setAuthCode('');
    const qs = new URLSearchParams({ active: '1', method });
    if (storeId) qs.set('storeId', storeId);
    apiFetch(`/api/v1/square/devices?${qs.toString()}`)
      .then(async res => {
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const list = (Array.isArray(data.devices) ? data.devices : []).filter(
          (d: PaymentReceivingDevice) => d.isActive !== false,
        ) as PaymentReceivingDevice[];
        setDevices(list);
        const preferred = list.find(d => d.isDefault) ?? list[0];
        setDeviceKey(preferred ? preferred.id : '');
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [method, storeId]);

  const selected = useMemo(
    () => devices.find(d => d.id === deviceKey) || null,
    [devices, deviceKey],
  );

  const squareDevices = useMemo(
    () =>
      devices.filter(
        d => d.provider === 'SQUARE_TERMINAL' && d.squareDeviceId,
      ),
    [devices],
  );

  const useSquareFlow =
    method === 'CARD' || method === 'IC' || method === 'ID_QUICPAY'
      ? squareDevices.length > 0 && (!selected || selected.provider === 'SQUARE_TERMINAL')
      : false;

  // When Square is preferred for card/IC, show SquareTerminalPay.
  if (useSquareFlow && (method === 'CARD' || (selected?.provider === 'SQUARE_TERMINAL' && selected.squareDeviceId))) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {devices.some(d => d.provider !== 'SQUARE_TERMINAL') && (
          <label style={labelStyle}>
            決済デバイス
            <select
              value={deviceKey}
              onChange={e => setDeviceKey(e.target.value)}
              style={select}
              disabled={disabled || busy}
            >
              {devices.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {d.isDefault ? ' (default)' : ''} · {paymentDeviceProviderLabel(d.provider)}
                </option>
              ))}
            </select>
          </label>
        )}
        {(!selected || selected.provider === 'SQUARE_TERMINAL') ? (
          <SquareTerminalPay
            amount={amount}
            storeId={storeId}
            orderIds={orderIds}
            label={label}
            disabled={disabled}
            onPaid={async meta => {
              await onPaid({
                paymentMethod: method,
                squarePaymentId: meta.squarePaymentId,
                deviceId: meta.deviceId,
                deviceName: selected?.name,
                provider: 'SQUARE_TERMINAL',
                noteExtra: meta.deviceId ? `Square:${meta.deviceId}` : 'Square Terminal',
              });
            }}
          />
        ) : (
          <ManualConfirm
            method={method}
            amount={amount}
            device={selected}
            authCode={authCode}
            setAuthCode={setAuthCode}
            busy={busy}
            setBusy={setBusy}
            confirmed={confirmed}
            setConfirmed={setConfirmed}
            disabled={disabled}
            onPaid={onPaid}
          />
        )}
      </div>
    );
  }

  return (
    <ManualConfirm
      method={method}
      amount={amount}
      devices={devices}
      device={selected}
      deviceKey={deviceKey}
      setDeviceKey={setDeviceKey}
      authCode={authCode}
      setAuthCode={setAuthCode}
      busy={busy}
      setBusy={setBusy}
      confirmed={confirmed}
      setConfirmed={setConfirmed}
      disabled={disabled}
      onPaid={onPaid}
      showDevicePicker
    />
  );
}

function ManualConfirm({
  method,
  amount,
  device,
  devices,
  deviceKey,
  setDeviceKey,
  authCode,
  setAuthCode,
  busy,
  setBusy,
  confirmed,
  setConfirmed,
  disabled,
  onPaid,
  showDevicePicker,
}: {
  method: CashierPaymentMethod;
  amount: number;
  device: PaymentReceivingDevice | null;
  devices?: PaymentReceivingDevice[];
  deviceKey?: string;
  setDeviceKey?: (v: string) => void;
  authCode: string;
  setAuthCode: (v: string) => void;
  busy: boolean;
  setBusy: (v: boolean) => void;
  confirmed: boolean;
  setConfirmed: (v: boolean) => void;
  disabled?: boolean;
  showDevicePicker?: boolean;
  onPaid: Props['onPaid'];
}) {
  const Icon =
    method === 'PAYPAY' || method === 'RAKUTEN_PAY' || method === 'D_PAY' || method === 'AU_PAY' || method === 'MERPAY' || method === 'WECHAT_PAY'
      ? QrCode
      : method === 'IC' || method === 'ID_QUICPAY'
        ? Smartphone
        : method === 'INVOICE' || method === 'BANK_TRANSFER'
          ? Hand
          : CreditCard;

  const confirm = async () => {
    if (amount <= 0) {
      toast.error('金額が不正です');
      return;
    }
    setBusy(true);
    try {
      await onPaid({
        paymentMethod: method,
        deviceId: device?.id || device?.squareDeviceId || undefined,
        deviceName: device?.name,
        provider: device?.provider || 'MANUAL',
        authCode: authCode.trim() || undefined,
        noteExtra: [
          device ? `${paymentDeviceProviderLabel(device.provider)}:${device.name}` : '手動確認',
          authCode.trim() ? `承認番号:${authCode.trim()}` : null,
        ]
          .filter(Boolean)
          .join(' / '),
      });
      setConfirmed(true);
      toast.success(`${cashierMethodLabel(method)} の受領を確認しました`);
    } catch {
      toast.error('精算に失敗しました');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={box}>
      <div style={head}>
        <Icon size={16} />
        {cashierMethodLabel(method)} · デバイス確認
        <span style={{ marginLeft: 'auto', fontWeight: 800, color: '#1f1612' }}>{yen(amount)}</span>
      </div>

      {showDevicePicker && (
        <label style={labelStyle}>
          決済受信デバイス
          <select
            value={deviceKey || ''}
            onChange={e => setDeviceKey?.(e.target.value)}
            style={select}
            disabled={disabled || busy || confirmed}
          >
            {(devices || []).length === 0 && <option value="">登録なし（手動確認）</option>}
            {(devices || []).map(d => (
              <option key={d.id} value={d.id}>
                {d.name}
                {d.isDefault ? ' (default)' : ''} · {paymentDeviceProviderLabel(d.provider)}
              </option>
            ))}
          </select>
        </label>
      )}

      {device?.provider === 'QR_DISPLAY' && device.qrPayload && (
        <div style={qrHint}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#9a3412' }}>店舗QRを提示</div>
          <div style={{ fontSize: '0.8rem', wordBreak: 'break-all', color: '#7c2d12' }}>{device.qrPayload}</div>
        </div>
      )}

      {device?.provider === 'CAT_TERMINAL' && (
        <p style={hint}>
          CAT 端末で {cashierMethodLabel(method)} を {yen(amount)} 受け取り、完了後に下のボタンで確定してください。
          {device.terminalSerial ? `（端末: ${device.terminalSerial}）` : ''}
        </p>
      )}

      {!device && (
        <p style={hint}>
          該当デバイス未登録のため、スタッフが受領を目視確認して確定します。Admin → Payment Devices で端末を追加できます。
        </p>
      )}

      <label style={labelStyle}>
        承認番号 / 伝票番号（任意）
        <input
          style={select}
          value={authCode}
          onChange={e => setAuthCode(e.target.value)}
          placeholder="例: 承認番号・取引ID"
          disabled={disabled || busy || confirmed}
        />
      </label>

      {confirmed ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#047857', fontWeight: 700, fontSize: '0.85rem' }}>
          <CheckCircle2 size={16} /> 受領確認済み — 精算を完了しています
        </div>
      ) : (
        <button type="button" style={primaryBtn} disabled={disabled || busy || amount <= 0} onClick={confirm}>
          {busy ? <Loader2 size={15} /> : <CheckCircle2 size={15} />}
          {cashierMethodLabel(method)} 受領を確認して精算
        </button>
      )}
    </div>
  );
}

const box: CSSProperties = {
  border: '1.5px solid #e8e4df',
  borderRadius: 12,
  background: '#faf9f7',
  padding: '12px 14px',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};
const head: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.88rem', fontWeight: 800, color: '#1f1612' };
const hint: CSSProperties = { margin: 0, fontSize: '0.8rem', color: '#6b635c', lineHeight: 1.45 };
const labelStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.8rem', fontWeight: 700 };
const select: CSSProperties = { padding: '8px 10px', borderRadius: 8, border: '1.5px solid #e5e7eb', background: '#fff', fontSize: '0.85rem' };
const primaryBtn: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
  padding: '10px 12px',
  borderRadius: 9,
  border: 'none',
  background: '#1f1612',
  color: '#fff',
  fontSize: '0.86rem',
  fontWeight: 700,
  cursor: 'pointer',
};
const qrHint: CSSProperties = {
  background: '#fff7ed',
  border: '1px solid #fed7aa',
  borderRadius: 10,
  padding: '10px 12px',
};
