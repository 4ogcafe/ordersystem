import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { toast } from 'react-hot-toast';
import {
  CreditCard,
  Plus,
  RefreshCw,
  Trash2,
  Link2,
  Store,
  CheckCircle2,
  Wifi,
  WifiOff,
  Copy,
  Smartphone,
  QrCode,
  Banknote,
  Hand,
} from 'lucide-react';
import { apiFetch, errorMessage } from '../../lib/api';
import { DEFAULT_STORE_LOCATIONS, type StoreLocation } from '../../lib/stores';
import {
  ALL_CASHIER_PAYMENT_METHODS,
  PAYMENT_DEVICE_PROVIDERS,
  paymentDeviceProviderLabel,
  type CashierPaymentMethod,
  type PaymentDeviceProvider,
} from '../../lib/payment-methods';
import PaymentGatewaysConnect, { type PaymentGateway } from './PaymentGatewaysConnect';

export interface PaymentReceivingDevice {
  id: string;
  name: string;
  provider: PaymentDeviceProvider;
  squareDeviceId: string;
  model: string | null;
  storeId: string | null;
  isDefault: boolean;
  isActive: boolean;
  status: string;
  pairingCode: string | null;
  pairingExpiresAt: string | null;
  squareDeviceCodeId: string | null;
  pairedAt: string | null;
  lastSyncedAt: string | null;
  capabilities: CashierPaymentMethod[];
  terminalSerial: string | null;
  merchantId: string | null;
  qrPayload: string | null;
  notes: string | null;
  gatewayId: string | null;
  createdAt: string;
  updatedAt: string;
}

type DevicesResponse = {
  configured: boolean;
  environment?: string;
  locationId?: string | null;
  devices: PaymentReceivingDevice[];
};

const PROVIDER_ICON: Record<PaymentDeviceProvider, typeof CreditCard> = {
  SQUARE_TERMINAL: CreditCard,
  CAT_TERMINAL: Smartphone,
  QR_DISPLAY: QrCode,
  CASH_DRAWER: Banknote,
  MANUAL: Hand,
};

function normalizeDevice(raw: Partial<PaymentReceivingDevice> & { id: string; name: string }): PaymentReceivingDevice {
  const provider = (raw.provider || 'SQUARE_TERMINAL') as PaymentDeviceProvider;
  const defaults = PAYMENT_DEVICE_PROVIDERS.find(p => p.id === provider)?.defaultCapabilities || ['CARD'];
  return {
    id: raw.id,
    name: raw.name,
    provider,
    squareDeviceId: raw.squareDeviceId || '',
    model: raw.model ?? null,
    storeId: raw.storeId ?? null,
    isDefault: Boolean(raw.isDefault),
    isActive: raw.isActive !== false,
    status: raw.status || (provider === 'SQUARE_TERMINAL' ? 'UNPAIRED' : 'READY'),
    pairingCode: raw.pairingCode ?? null,
    pairingExpiresAt: raw.pairingExpiresAt ?? null,
    squareDeviceCodeId: raw.squareDeviceCodeId ?? null,
    pairedAt: raw.pairedAt ?? null,
    lastSyncedAt: raw.lastSyncedAt ?? null,
    capabilities: Array.isArray(raw.capabilities) && raw.capabilities.length ? raw.capabilities : defaults,
    terminalSerial: raw.terminalSerial ?? null,
    merchantId: raw.merchantId ?? null,
    qrPayload: raw.qrPayload ?? null,
    notes: raw.notes ?? null,
    gatewayId: raw.gatewayId ?? null,
    createdAt: raw.createdAt || '',
    updatedAt: raw.updatedAt || '',
  };
}

/**
 * Admin: register Japan payment receiving devices (Square, CAT, QR, drawer, manual),
 * assign stores/capabilities, pair Square terminals, set defaults for the cash counter.
 */
export default function PaymentDevicesTab() {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [devices, setDevices] = useState<PaymentReceivingDevice[]>([]);
  const [configured, setConfigured] = useState(false);
  const [environment, setEnvironment] = useState<string>('');
  const [stores, setStores] = useState<StoreLocation[]>(DEFAULT_STORE_LOCATIONS);
  const [creating, setCreating] = useState(false);
  const [filterProvider, setFilterProvider] = useState<string>('');
  const [newName, setNewName] = useState('カウンター端末');
  const [newProvider, setNewProvider] = useState<PaymentDeviceProvider>('SQUARE_TERMINAL');
  const [newStoreId, setNewStoreId] = useState<string>('');
  const [newCaps, setNewCaps] = useState<CashierPaymentMethod[]>(['CARD', 'IC', 'ID_QUICPAY']);
  const [newSerial, setNewSerial] = useState('');
  const [newMerchantId, setNewMerchantId] = useState('');
  const [newQr, setNewQr] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newGatewayId, setNewGatewayId] = useState('');
  const [gateways, setGateways] = useState<PaymentGateway[]>([]);
  const [pairingId, setPairingId] = useState<string | null>(null);

  const providerMeta = useMemo(
    () => PAYMENT_DEVICE_PROVIDERS.find(p => p.id === newProvider)!,
    [newProvider],
  );

  useEffect(() => {
    setNewCaps([...providerMeta.defaultCapabilities]);
    if (newProvider === 'SQUARE_TERMINAL') setNewName('Square Terminal');
    else if (newProvider === 'CAT_TERMINAL') setNewName('CAT端末');
    else if (newProvider === 'QR_DISPLAY') setNewName('店舗QR提示');
    else if (newProvider === 'CASH_DRAWER') setNewName('キャッシュドロワー');
    else setNewName('手動確認');
  }, [newProvider, providerMeta.defaultCapabilities]);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const [devRes, storeRes, gwRes] = await Promise.all([
        apiFetch('/api/v1/square/devices'),
        apiFetch('/api/v1/stores'),
        apiFetch('/api/v1/square/gateways?connected=1'),
      ]);
      if (devRes.ok) {
        const data = (await devRes.json()) as DevicesResponse;
        setConfigured(Boolean(data.configured));
        setEnvironment(data.environment || '');
        setDevices((Array.isArray(data.devices) ? data.devices : []).map(d => normalizeDevice(d)));
      } else {
        toast.error(await errorMessage(devRes, '決済端末一覧を読み込めませんでした'));
      }
      if (storeRes.ok) {
        const list = await storeRes.json();
        if (Array.isArray(list) && list.length) setStores(list);
      }
      if (gwRes.ok) {
        const data = await gwRes.json();
        setGateways(Array.isArray(data.gateways) ? data.gateways : []);
      }
    } catch {
      toast.error('通信エラーが発生しました');
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const storeName = (id: string | null) => {
    if (!id) return '全店舗共通';
    return stores.find(s => s.id === id)?.name || id;
  };

  const filtered = filterProvider
    ? devices.filter(d => d.provider === filterProvider)
    : devices;

  const handleCreate = async () => {
    if (!newName.trim()) {
      toast.error('端末名を入力してください');
      return;
    }
    setCreating(true);
    try {
      const res = await apiFetch('/api/v1/square/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          provider: newProvider,
          storeId: newStoreId || null,
          isDefault: devices.filter(d => d.provider === newProvider).length === 0,
          capabilities: newCaps,
          terminalSerial: newSerial.trim() || null,
          merchantId: newMerchantId.trim() || null,
          qrPayload: newQr.trim() || null,
          notes: newNotes.trim() || null,
          gatewayId: newGatewayId || null,
        }),
      });
      if (!res.ok) {
        toast.error(await errorMessage(res, '端末の追加に失敗しました'));
        return;
      }
      toast.success(
        newProvider === 'SQUARE_TERMINAL'
          ? '端末を追加しました。続けてペアリングしてください。'
          : '決済デバイスを登録しました',
      );
      setNewSerial('');
      setNewMerchantId('');
      setNewQr('');
      setNewNotes('');
      setNewGatewayId('');
      await load();
    } catch {
      toast.error('通信エラーが発生しました');
    } finally {
      setCreating(false);
    }
  };

  const handlePair = async (device: PaymentReceivingDevice) => {
    setPairingId(device.id);
    try {
      const res = await apiFetch(`/api/v1/square/devices/${device.id}/pair`, { method: 'POST' });
      if (!res.ok) {
        toast.error(await errorMessage(res, 'ペアリングコードを発行できませんでした'));
        return;
      }
      const data = await res.json();
      toast.success(data.pairingCode ? `ペアリングコード: ${data.pairingCode}` : 'ペアリングを開始しました');
      await load();
    } catch {
      toast.error('通信エラーが発生しました');
    } finally {
      setPairingId(null);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await apiFetch('/api/v1/square/devices/sync', { method: 'POST' });
      if (!res.ok) {
        toast.error(await errorMessage(res, 'Square との同期に失敗しました'));
        return;
      }
      const data = (await res.json()) as DevicesResponse;
      setDevices((Array.isArray(data.devices) ? data.devices : []).map(d => normalizeDevice(d)));
      setConfigured(Boolean(data.configured));
      toast.success('Square 端末情報を同期しました');
    } catch {
      toast.error('通信エラーが発生しました');
    } finally {
      setSyncing(false);
    }
  };

  const patchDevice = async (id: string, patch: Record<string, unknown>, okMsg: string) => {
    try {
      const res = await apiFetch(`/api/v1/square/devices/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        toast.error(await errorMessage(res, '更新に失敗しました'));
        return;
      }
      toast.success(okMsg);
      await load();
    } catch {
      toast.error('通信エラーが発生しました');
    }
  };

  const toggleCap = (device: PaymentReceivingDevice, method: CashierPaymentMethod) => {
    const has = device.capabilities.includes(method);
    const next = has
      ? device.capabilities.filter(c => c !== method)
      : [...device.capabilities, method];
    if (next.length === 0) {
      toast.error('少なくとも1つの決済方法を選択してください');
      return;
    }
    void patchDevice(device.id, { capabilities: next }, '対応決済を更新しました');
  };

  const handleDelete = async (device: PaymentReceivingDevice) => {
    if (!window.confirm(`「${device.name}」を削除しますか？`)) return;
    try {
      const res = await apiFetch(`/api/v1/square/devices/${device.id}`, { method: 'DELETE' });
      if (!res.ok) {
        toast.error(await errorMessage(res, '削除に失敗しました'));
        return;
      }
      toast.success('端末を削除しました');
      await load();
    } catch {
      toast.error('通信エラーが発生しました');
    }
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success('コードをコピーしました');
    } catch {
      toast.error('コピーできませんでした');
    }
  };

  if (loading) {
    return <div style={{ padding: 24, color: '#6b7280' }}>決済端末を読み込み中…</div>;
  }

  const gatewayLabel = (id: string | null) => {
    if (!id) return null;
    return gateways.find(g => g.id === id)?.label || id;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <PaymentGatewaysConnect onChanged={() => { void load({ silent: true }); }} />

      <div style={heroCard}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span style={iconBadge}>
              <CreditCard size={20} />
            </span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>決済受信デバイス（Payment devices）</h3>
              <p style={{ margin: '4px 0 0', color: '#6b635c', fontSize: '0.85rem', lineHeight: 1.5 }}>
                Square・CAT・店舗QR・ドロワーなど、日本の決済端末を店舗に紐づけてレジから使い分けます。
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={configured ? onPill : offPill}>
              {configured ? `Square ${environment || 'ready'}` : 'Square 未設定'}
            </span>
            <button type="button" onClick={handleSync} disabled={!configured || syncing} style={outlineBtn}>
              <RefreshCw size={15} /> {syncing ? '同期中…' : 'Square と同期'}
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
          <button type="button" style={!filterProvider ? chipOn : chipOff} onClick={() => setFilterProvider('')}>
            すべて ({devices.length})
          </button>
          {PAYMENT_DEVICE_PROVIDERS.map(p => {
            const count = devices.filter(d => d.provider === p.id).length;
            return (
              <button
                key={p.id}
                type="button"
                style={filterProvider === p.id ? chipOn : chipOff}
                onClick={() => setFilterProvider(p.id)}
              >
                {p.labelJa} ({count})
              </button>
            );
          })}
        </div>
      </div>

      <div style={panel}>
        <h4 style={sectionTitle}><Plus size={16} /> デバイスを追加</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 12 }}>
          {PAYMENT_DEVICE_PROVIDERS.map(p => {
            const Icon = PROVIDER_ICON[p.id];
            const sel = newProvider === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setNewProvider(p.id)}
                style={{
                  textAlign: 'left',
                  padding: '12px 14px',
                  borderRadius: 12,
                  border: `2px solid ${sel ? '#1f1612' : '#e8e4df'}`,
                  background: sel ? '#faf8f5' : '#fff',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: '0.88rem' }}>
                  <Icon size={16} /> {p.labelJa}
                </div>
                <div style={{ marginTop: 6, fontSize: '0.72rem', color: '#6b635c', lineHeight: 1.4 }}>{p.description}</div>
              </button>
            );
          })}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, alignItems: 'end' }}>
          <label style={fieldLabel}>
            端末名
            <input style={fieldInput} value={newName} onChange={e => setNewName(e.target.value)} placeholder="例: 武蔵境 カウンター" />
          </label>
          <label style={fieldLabel}>
            担当店舗
            <select style={fieldInput} value={newStoreId} onChange={e => setNewStoreId(e.target.value)}>
              <option value="">全店舗共通</option>
              {stores.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
          {(newProvider === 'CAT_TERMINAL' || newProvider === 'QR_DISPLAY') && (
            <>
              <label style={fieldLabel}>
                端末シリアル / TID
                <input style={fieldInput} value={newSerial} onChange={e => setNewSerial(e.target.value)} placeholder="任意" />
              </label>
              <label style={fieldLabel}>
                加盟店 ID
                <input style={fieldInput} value={newMerchantId} onChange={e => setNewMerchantId(e.target.value)} placeholder="任意" />
              </label>
            </>
          )}
          {newProvider === 'QR_DISPLAY' && (
            <label style={{ ...fieldLabel, gridColumn: '1 / -1' }}>
              店舗 QR ペイロード / URL
              <input style={fieldInput} value={newQr} onChange={e => setNewQr(e.target.value)} placeholder="https://… または静的QR文字列" />
            </label>
          )}
          <label style={fieldLabel}>
            接続済みゲートウェイ
            <select style={fieldInput} value={newGatewayId} onChange={e => setNewGatewayId(e.target.value)}>
              <option value="">なし（デバイスのみ）</option>
              {gateways.map(g => (
                <option key={g.id} value={g.id}>{g.label} · {g.kind}</option>
              ))}
            </select>
          </label>
          <label style={{ ...fieldLabel, gridColumn: '1 / -1' }}>
            メモ
            <input style={fieldInput} value={newNotes} onChange={e => setNewNotes(e.target.value)} placeholder="設置場所など（任意）" />
          </label>
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: 8 }}>対応する決済方法</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {ALL_CASHIER_PAYMENT_METHODS.map(m => {
              const on = newCaps.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() =>
                    setNewCaps(prev => (on ? prev.filter(x => x !== m.id) : [...prev, m.id]))
                  }
                  style={{
                    padding: '6px 10px',
                    borderRadius: 999,
                    border: `1.5px solid ${on ? m.color : '#e5e7eb'}`,
                    background: on ? m.bg : '#fff',
                    color: on ? m.color : '#6b7280',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {m.labelJa}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <button type="button" onClick={handleCreate} disabled={creating || newCaps.length === 0} style={primaryBtn}>
            {creating ? '追加中…' : 'デバイスを登録'}
          </button>
        </div>
      </div>

      <div style={panel}>
        <h4 style={sectionTitle}>登録済みデバイス（{filtered.length}）</h4>
        {filtered.length === 0 ? (
          <p style={{ margin: 0, color: '#6b7280', fontSize: '0.9rem' }}>
            まだデバイスがありません。上から種類を選んで登録してください。
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(device => {
              const Icon = PROVIDER_ICON[device.provider] || CreditCard;
              const online =
                device.provider !== 'SQUARE_TERMINAL'
                  ? device.isActive
                  : /ONLINE|AVAILABLE|PAIRED|READY/i.test(device.status) && !!device.squareDeviceId;
              return (
                <div key={device.id} style={deviceCard}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 0, flex: '1 1 260px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <Icon size={16} />
                        <strong style={{ fontSize: '1rem' }}>{device.name}</strong>
                        <span style={providerPill}>{paymentDeviceProviderLabel(device.provider)}</span>
                        {device.isDefault && <span style={defaultPill}>DEFAULT</span>}
                        {!device.isActive && <span style={offPill}>OFF</span>}
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: online ? '#047857' : '#6b7280' }}>
                          {online ? <Wifi size={13} /> : <WifiOff size={13} />}
                          {device.status || 'UNKNOWN'}
                        </span>
                      </div>
                      <div style={{ marginTop: 6, fontSize: '0.8rem', color: '#6b635c', display: 'flex', flexWrap: 'wrap', gap: '8px 14px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Store size={13} /> {storeName(device.storeId)}</span>
                        {device.model && <span>機種: {device.model}</span>}
                        {device.terminalSerial && <span>Serial: {device.terminalSerial}</span>}
                        {device.merchantId && <span>加盟店: {device.merchantId}</span>}
                        {device.gatewayId && <span>GW: {gatewayLabel(device.gatewayId)}</span>}
                        {device.provider === 'SQUARE_TERMINAL' && (
                          device.squareDeviceId ? (
                            <span style={{ fontFamily: 'ui-monospace, monospace' }}>ID: {device.squareDeviceId}</span>
                          ) : (
                            <span>未ペアリング</span>
                          )
                        )}
                      </div>
                      {device.qrPayload && (
                        <div style={{ marginTop: 6, fontSize: '0.75rem', color: '#6b635c', wordBreak: 'break-all' }}>
                          QR: {device.qrPayload}
                        </div>
                      )}
                      {device.notes && (
                        <div style={{ marginTop: 4, fontSize: '0.75rem', color: '#9ca3af' }}>{device.notes}</div>
                      )}
                      <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {ALL_CASHIER_PAYMENT_METHODS.map(m => {
                          const on = device.capabilities.includes(m.id);
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => toggleCap(device, m.id)}
                              style={{
                                padding: '3px 8px',
                                borderRadius: 999,
                                border: `1px solid ${on ? m.color : '#e5e7eb'}`,
                                background: on ? m.bg : '#fff',
                                color: on ? m.color : '#9ca3af',
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              {m.labelJa}
                            </button>
                          );
                        })}
                      </div>
                      {device.pairingCode && (
                        <div style={pairBox}>
                          <div>
                            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#5b21b6' }}>端末に入力するコード</div>
                            <div style={{ fontSize: '1.6rem', fontWeight: 900, letterSpacing: '0.12em', color: '#3d1e8f' }}>{device.pairingCode}</div>
                            {device.pairingExpiresAt && (
                              <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>
                                有効期限: {new Date(device.pairingExpiresAt).toLocaleString('ja-JP')}
                              </div>
                            )}
                          </div>
                          <button type="button" style={outlineBtn} onClick={() => copyCode(device.pairingCode!)}>
                            <Copy size={14} /> コピー
                          </button>
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'stretch' }}>
                      {device.provider === 'SQUARE_TERMINAL' && (
                        <button
                          type="button"
                          style={outlineBtn}
                          disabled={!configured || pairingId === device.id}
                          onClick={() => handlePair(device)}
                        >
                          <Link2 size={14} /> {pairingId === device.id ? '発行中…' : 'ペアリングコード'}
                        </button>
                      )}
                      {!device.isDefault && (
                        <button type="button" style={outlineBtn} onClick={() => patchDevice(device.id, { isDefault: true }, 'デフォルト端末に設定しました')}>
                          <CheckCircle2 size={14} /> デフォルトにする
                        </button>
                      )}
                      <label style={{ ...fieldLabel, flexDirection: 'row', alignItems: 'center', gap: 6, fontSize: '0.78rem' }}>
                        店舗
                        <select
                          style={{ ...fieldInput, marginBottom: 0, padding: '6px 8px' }}
                          value={device.storeId || ''}
                          onChange={e => patchDevice(device.id, { storeId: e.target.value || null }, '店舗を更新しました')}
                        >
                          <option value="">全店舗共通</option>
                          {stores.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </label>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', fontWeight: 600 }}>
                        <input
                          type="checkbox"
                          checked={device.isActive}
                          onChange={e => patchDevice(device.id, { isActive: e.target.checked }, e.target.checked ? '有効にしました' : '無効にしました')}
                        />
                        有効
                      </label>
                      <button type="button" style={{ ...outlineBtn, color: '#b91c1c', borderColor: '#fecaca' }} onClick={() => handleDelete(device)}>
                        <Trash2 size={14} /> 削除
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const heroCard: CSSProperties = {
  background: '#fff',
  borderRadius: 16,
  border: '1px solid #e8e4df',
  padding: '1.25rem 1.4rem',
  boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
};
const panel: CSSProperties = { ...heroCard };
const iconBadge: CSSProperties = {
  width: 42,
  height: 42,
  borderRadius: 12,
  background: '#1f1612',
  color: '#fff',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};
const sectionTitle: CSSProperties = { margin: '0 0 12px', fontSize: '0.95rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 };
const fieldLabel: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.82rem', fontWeight: 700, color: '#374151' };
const fieldInput: CSSProperties = { padding: '0.6rem 0.75rem', border: '1px solid #d1d5db', borderRadius: 8, background: '#f9fafb', fontSize: '0.9rem', width: '100%', boxSizing: 'border-box' };
const primaryBtn: CSSProperties = { padding: '0.65rem 1.1rem', background: '#1f1612', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 };
const outlineBtn: CSSProperties = { padding: '0.5rem 0.85rem', background: '#fff', border: '1px solid #d1d5db', borderRadius: 8, fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 };
const onPill: CSSProperties = { fontSize: '0.7rem', fontWeight: 800, padding: '4px 10px', borderRadius: 999, background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0' };
const offPill: CSSProperties = { fontSize: '0.7rem', fontWeight: 800, padding: '4px 10px', borderRadius: 999, background: '#f3f4f6', color: '#6b7280', border: '1px solid #e5e7eb' };
const defaultPill: CSSProperties = { fontSize: '0.65rem', fontWeight: 800, padding: '2px 7px', borderRadius: 999, background: '#ede9fe', color: '#5b21b6' };
const providerPill: CSSProperties = { fontSize: '0.65rem', fontWeight: 800, padding: '2px 7px', borderRadius: 999, background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb' };
const deviceCard: CSSProperties = { border: '1px solid #e8e4df', borderRadius: 12, padding: '14px 16px', background: '#faf9f7' };
const pairBox: CSSProperties = { marginTop: 10, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 12, padding: '12px 14px' };
const chipOn: CSSProperties = { padding: '5px 10px', borderRadius: 999, border: '1.5px solid #1f1612', background: '#1f1612', color: '#fff', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' };
const chipOff: CSSProperties = { padding: '5px 10px', borderRadius: 999, border: '1px solid #e5e7eb', background: '#fff', color: '#6b7280', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' };
