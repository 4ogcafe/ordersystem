import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { toast } from 'react-hot-toast';
import {
  Link2,
  Unlink,
  CheckCircle2,
  Plus,
  Building2,
  Wallet,
} from 'lucide-react';
import { apiFetch, errorMessage } from '../../lib/api';
import { DEFAULT_STORE_LOCATIONS, type StoreLocation } from '../../lib/stores';

export type GatewayKind =
  | 'SQUARE'
  | 'PAYPAY'
  | 'RAKUTEN_PAY'
  | 'D_PAY'
  | 'AU_PAY'
  | 'MERPAY'
  | 'WECHAT_PAY'
  | 'GMO_PG'
  | 'CAT_MULT'
  | 'DIGITAL_WAGE'
  | 'MANUAL';

export type GatewayFieldKey =
  | 'merchantId'
  | 'shopId'
  | 'locationId'
  | 'terminalId'
  | 'wageAccountId'
  | 'wageProvider'
  | 'apiKey'
  | 'apiSecret'
  | 'accessToken'
  | 'notes'
  | 'environment';

export type GatewayCatalogItem = {
  kind: GatewayKind;
  labelJa: string;
  description: string;
  deviceProvider: string;
  defaultCapabilities: string[];
  fields: Array<{
    key: GatewayFieldKey;
    labelJa: string;
    secret?: boolean;
    placeholder?: string;
    required?: boolean;
  }>;
};

export type PaymentGateway = {
  id: string;
  kind: GatewayKind;
  label: string;
  storeId: string | null;
  status: 'CONNECTED' | 'DISCONNECTED' | 'PENDING';
  merchantId: string;
  shopId: string;
  locationId: string;
  terminalId: string;
  wageAccountId: string;
  wageProvider: string;
  environment: 'sandbox' | 'production';
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  notes: string;
  hasApiKey?: boolean;
  hasApiSecret?: boolean;
  hasAccessToken?: boolean;
  connectedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type Props = {
  onChanged?: () => void;
};

/** Fallback catalog so Connect still works if /gateways API is unavailable. */
export const FALLBACK_GATEWAY_CATALOG: GatewayCatalogItem[] = [
  {
    kind: 'SQUARE',
    labelJa: 'Square',
    description: 'Square 加盟店アカウント（Access Token / Location ID）を手動接続',
    deviceProvider: 'SQUARE_TERMINAL',
    defaultCapabilities: ['CARD', 'IC', 'ID_QUICPAY'],
    fields: [
      { key: 'accessToken', labelJa: 'Access Token', secret: true, required: true, placeholder: 'EAAAxxxx…' },
      { key: 'locationId', labelJa: 'Location ID', required: true, placeholder: 'LXXXX…' },
      { key: 'merchantId', labelJa: 'Merchant ID（任意）', placeholder: 'MLXXXX…' },
      { key: 'environment', labelJa: '環境 (sandbox / production)', placeholder: 'production' },
      { key: 'notes', labelJa: 'メモ' },
    ],
  },
  {
    kind: 'PAYPAY',
    labelJa: 'PayPay for Business',
    description: 'PayPay 加盟店（店舗QR / 決済）を手動接続',
    deviceProvider: 'QR_DISPLAY',
    defaultCapabilities: ['PAYPAY'],
    fields: [
      { key: 'merchantId', labelJa: '加盟店 ID / 店舗 ID', required: true },
      { key: 'apiKey', labelJa: 'API Key（任意）', secret: true },
      { key: 'apiSecret', labelJa: 'API Secret（任意）', secret: true },
      { key: 'shopId', labelJa: 'Shop ID（任意）' },
      { key: 'notes', labelJa: 'メモ / 静的QRメモ' },
    ],
  },
  {
    kind: 'RAKUTEN_PAY',
    labelJa: '楽天ペイ',
    description: '楽天ペイ加盟店を手動接続',
    deviceProvider: 'QR_DISPLAY',
    defaultCapabilities: ['RAKUTEN_PAY'],
    fields: [
      { key: 'merchantId', labelJa: '加盟店番号', required: true },
      { key: 'shopId', labelJa: '店舗番号' },
      { key: 'apiKey', labelJa: 'API Key（任意）', secret: true },
      { key: 'notes', labelJa: 'メモ' },
    ],
  },
  {
    kind: 'D_PAY',
    labelJa: 'd払い',
    description: 'd払い加盟店を手動接続',
    deviceProvider: 'QR_DISPLAY',
    defaultCapabilities: ['D_PAY'],
    fields: [
      { key: 'merchantId', labelJa: '加盟店 ID', required: true },
      { key: 'shopId', labelJa: '店舗コード' },
      { key: 'apiKey', labelJa: 'API Key（任意）', secret: true },
      { key: 'notes', labelJa: 'メモ' },
    ],
  },
  {
    kind: 'AU_PAY',
    labelJa: 'au PAY',
    description: 'au PAY 加盟店を手動接続',
    deviceProvider: 'QR_DISPLAY',
    defaultCapabilities: ['AU_PAY'],
    fields: [
      { key: 'merchantId', labelJa: '加盟店 ID', required: true },
      { key: 'shopId', labelJa: '店舗 ID' },
      { key: 'apiKey', labelJa: 'API Key（任意）', secret: true },
      { key: 'notes', labelJa: 'メモ' },
    ],
  },
  {
    kind: 'MERPAY',
    labelJa: 'メルペイ',
    description: 'メルペイ加盟店を手動接続',
    deviceProvider: 'QR_DISPLAY',
    defaultCapabilities: ['MERPAY'],
    fields: [
      { key: 'merchantId', labelJa: '加盟店 ID', required: true },
      { key: 'apiKey', labelJa: 'API Key（任意）', secret: true },
      { key: 'notes', labelJa: 'メモ' },
    ],
  },
  {
    kind: 'WECHAT_PAY',
    labelJa: 'WeChat Pay',
    description: 'WeChat Pay 加盟店を手動接続',
    deviceProvider: 'QR_DISPLAY',
    defaultCapabilities: ['WECHAT_PAY'],
    fields: [
      { key: 'merchantId', labelJa: 'Merchant ID (mch_id)', required: true },
      { key: 'apiKey', labelJa: 'API Key', secret: true },
      { key: 'shopId', labelJa: 'App ID（任意）' },
      { key: 'notes', labelJa: 'メモ' },
    ],
  },
  {
    kind: 'GMO_PG',
    labelJa: 'GMOペイメントゲートウェイ',
    description: 'GMO-PG ショップ ID / パスワードを手動接続',
    deviceProvider: 'CAT_TERMINAL',
    defaultCapabilities: ['CARD', 'IC', 'ID_QUICPAY', 'PAYPAY', 'RAKUTEN_PAY', 'AU_PAY', 'D_PAY'],
    fields: [
      { key: 'shopId', labelJa: 'Shop ID', required: true },
      { key: 'apiKey', labelJa: 'Shop Pass / API パスワード', secret: true, required: true },
      { key: 'merchantId', labelJa: 'Site ID（任意）' },
      { key: 'apiSecret', labelJa: 'Site Pass（任意）', secret: true },
      { key: 'notes', labelJa: 'メモ' },
    ],
  },
  {
    kind: 'CAT_MULT',
    labelJa: 'CAT / マルチ決済端末ゲートウェイ',
    description: 'ステラ端末・VEGA・その他 CAT の加盟店情報を手動接続',
    deviceProvider: 'CAT_TERMINAL',
    defaultCapabilities: ['CARD', 'IC', 'ID_QUICPAY', 'PAYPAY', 'RAKUTEN_PAY', 'AU_PAY', 'D_PAY', 'WECHAT_PAY'],
    fields: [
      { key: 'merchantId', labelJa: '加盟店番号', required: true },
      { key: 'terminalId', labelJa: '端末 TID / シリアル' },
      { key: 'shopId', labelJa: '店舗コード' },
      { key: 'apiKey', labelJa: '接続キー（任意）', secret: true },
      { key: 'notes', labelJa: 'メモ' },
    ],
  },
  {
    kind: 'DIGITAL_WAGE',
    labelJa: '賃金のデジタル払い（Digital Wage）',
    description: 'PayPay給与受取・楽天ペイ給与・au PAY給与など指定資金移動業者への手動接続',
    deviceProvider: 'MANUAL',
    defaultCapabilities: ['BANK_TRANSFER'],
    fields: [
      {
        key: 'wageProvider',
        labelJa: '指定資金移動業者',
        required: true,
        placeholder: 'PayPay給与受取 / 楽天ペイ給与受取 / au PAY給与受取 / COIN+',
      },
      { key: 'wageAccountId', labelJa: '入金用口座番号 / アカウント ID', required: true },
      { key: 'merchantId', labelJa: '事業所・会社コード（任意）' },
      { key: 'notes', labelJa: '労使協定・運用メモ' },
    ],
  },
  {
    kind: 'MANUAL',
    labelJa: 'その他 / 手動ゲートウェイ',
    description: '上記以外の決済事業者をメモ付きで手動登録',
    deviceProvider: 'MANUAL',
    defaultCapabilities: ['INVOICE', 'BANK_TRANSFER'],
    fields: [
      { key: 'merchantId', labelJa: '加盟店 ID / アカウント', required: true },
      { key: 'apiKey', labelJa: 'API Key（任意）', secret: true },
      { key: 'notes', labelJa: '接続内容メモ', required: true },
    ],
  },
];

const emptyForm = (): Record<GatewayFieldKey, string> => ({
  merchantId: '',
  shopId: '',
  locationId: '',
  terminalId: '',
  wageAccountId: '',
  wageProvider: '',
  apiKey: '',
  apiSecret: '',
  accessToken: '',
  notes: '',
  environment: 'production',
});

const FIELD_KEYS = new Set<string>([
  'merchantId',
  'shopId',
  'locationId',
  'terminalId',
  'wageAccountId',
  'wageProvider',
  'apiKey',
  'apiSecret',
  'accessToken',
  'notes',
  'environment',
]);

/**
 * Manual Connect panel for Japan payment gateways (merchant credentials + Digital Wage),
 * same interaction pattern as Google Place / LINE credential connect.
 */
export default function PaymentGatewaysConnect({ onChanged }: Props) {
  const [loading, setLoading] = useState(true);
  const [catalog, setCatalog] = useState<GatewayCatalogItem[]>(FALLBACK_GATEWAY_CATALOG);
  const [gateways, setGateways] = useState<PaymentGateway[]>([]);
  const [stores, setStores] = useState<StoreLocation[]>(DEFAULT_STORE_LOCATIONS);
  const [connectKind, setConnectKind] = useState<GatewayKind | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [storeId, setStoreId] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [createDevice, setCreateDevice] = useState(true);
  const [deviceName, setDeviceName] = useState('');
  const [busy, setBusy] = useState(false);

  const selectedMeta = useMemo(() => {
    if (!connectKind) return null;
    return catalog.find(c => c.kind === connectKind)
      || FALLBACK_GATEWAY_CATALOG.find(c => c.kind === connectKind)
      || null;
  }, [catalog, connectKind]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [gwRes, storeRes] = await Promise.all([
        apiFetch('/api/v1/square/gateways'),
        apiFetch('/api/v1/stores'),
      ]);
      if (gwRes.ok) {
        const data = await gwRes.json();
        const nextCatalog = Array.isArray(data.catalog) && data.catalog.length
          ? (data.catalog as GatewayCatalogItem[])
          : FALLBACK_GATEWAY_CATALOG;
        setCatalog(nextCatalog);
        setGateways(Array.isArray(data.gateways) ? data.gateways : []);
      } else {
        setCatalog(FALLBACK_GATEWAY_CATALOG);
        toast.error(await errorMessage(gwRes, 'ゲートウェイ一覧を読み込めませんでした（ローカル一覧を表示）'));
      }
      if (storeRes.ok) {
        const list = await storeRes.json();
        if (Array.isArray(list) && list.length) setStores(list);
      }
    } catch {
      setCatalog(FALLBACK_GATEWAY_CATALOG);
      toast.error('通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const startConnect = (kind: GatewayKind) => {
    const meta =
      catalog.find(c => c.kind === kind)
      || FALLBACK_GATEWAY_CATALOG.find(c => c.kind === kind);
    const nextForm = emptyForm();
    if (kind === 'DIGITAL_WAGE') nextForm.wageProvider = 'PayPay給与受取';
    setConnectKind(kind);
    setDisplayName(meta?.labelJa || kind);
    setDeviceName(meta ? `${meta.labelJa} 端末` : '決済端末');
    setForm(nextForm);
    setCreateDevice(true);
    setStoreId('');
  };

  const handleConnect = async (e: FormEvent) => {
    e.preventDefault();
    if (!connectKind || !displayName.trim()) {
      toast.error('表示名を入力してください');
      return;
    }
    if (selectedMeta) {
      for (const field of selectedMeta.fields || []) {
        if (!field.required) continue;
        const val = form[field.key];
        if (!val || !String(val).trim()) {
          toast.error(`${field.labelJa} は必須です`);
          return;
        }
      }
    }
    setBusy(true);
    try {
      const res = await apiFetch('/api/v1/square/gateways/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: connectKind,
          label: displayName.trim(),
          storeId: storeId || null,
          createDevice,
          deviceName: deviceName.trim() || undefined,
          ...form,
        }),
      });
      if (!res.ok) {
        toast.error(await errorMessage(res, '接続に失敗しました'));
        return;
      }
      toast.success(
        createDevice
          ? 'ゲートウェイを接続し、デバイスも追加しました'
          : 'ゲートウェイを接続しました',
      );
      setConnectKind(null);
      setForm(emptyForm());
      await load();
      onChanged?.();
    } catch {
      toast.error('通信エラーが発生しました');
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async (gw: PaymentGateway) => {
    if (!window.confirm(`「${gw.label}」の接続を解除しますか？`)) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/v1/square/gateways/${gw.id}`, { method: 'DELETE' });
      if (!res.ok) {
        toast.error(await errorMessage(res, '切断に失敗しました'));
        return;
      }
      toast.success('接続を解除しました');
      await load();
      onChanged?.();
    } catch {
      toast.error('通信エラーが発生しました');
    } finally {
      setBusy(false);
    }
  };

  const storeName = (id: string | null) => {
    if (!id) return '全店舗共通';
    return stores.find(s => s.id === id)?.name || id;
  };

  const fields = (selectedMeta?.fields || []).filter(f => FIELD_KEYS.has(f.key));

  if (loading) {
    return <div style={{ padding: 16, color: '#6b7280' }}>決済ゲートウェイを読み込み中…</div>;
  }

  return (
    <div style={panel}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <h4 style={{ ...sectionTitle, marginBottom: 4 }}>
            <Wallet size={16} /> 決済ゲートウェイ接続（手動 Connect）
          </h4>
          <p style={{ margin: 0, fontSize: '0.82rem', color: '#6b635c', lineHeight: 1.45 }}>
            Square・PayPay・楽天ペイ・GMO・CAT・賃金のデジタル払いなど、加盟店情報を手入力して接続します（Google / LINE 連携と同じ操作）。
          </p>
        </div>
        <span style={countPill}>接続済み {gateways.filter(g => g.status === 'CONNECTED').length}</span>
      </div>

      {gateways.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          {gateways.map(gw => {
            const meta = catalog.find(c => c.kind === gw.kind) || FALLBACK_GATEWAY_CATALOG.find(c => c.kind === gw.kind);
            return (
              <div key={gw.id} style={connectedCard}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <strong>{gw.label}</strong>
                    <span style={onPill}>● Connected</span>
                    <span style={kindPill}>{meta?.labelJa || gw.kind}</span>
                  </div>
                  <div style={{ marginTop: 4, fontSize: '0.78rem', color: '#6b635c', display: 'flex', flexWrap: 'wrap', gap: '6px 12px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Building2 size={12} /> {storeName(gw.storeId)}</span>
                    {gw.merchantId && <span>加盟店: {gw.merchantId}</span>}
                    {gw.shopId && <span>Shop: {gw.shopId}</span>}
                    {gw.locationId && <span>Location: {gw.locationId}</span>}
                    {gw.wageProvider && <span>{gw.wageProvider}</span>}
                    {gw.wageAccountId && <span>口座: {gw.wageAccountId}</span>}
                    {gw.hasAccessToken && <span>Token 設定済</span>}
                    {gw.hasApiKey && <span>API Key 設定済</span>}
                  </div>
                  {gw.notes && (
                    <div style={{ marginTop: 4, fontSize: '0.72rem', color: '#9ca3af' }}>{gw.notes}</div>
                  )}
                </div>
                <button type="button" style={ghostBtn} disabled={busy} onClick={() => handleDisconnect(gw)}>
                  <Unlink size={14} /> Disconnect
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: 8 }}>Connect するゲートウェイを選択</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8, marginBottom: 12 }}>
        {(catalog.length ? catalog : FALLBACK_GATEWAY_CATALOG).map(item => {
          const connectedCount = gateways.filter(g => g.kind === item.kind && g.status === 'CONNECTED').length;
          const sel = connectKind === item.kind;
          return (
            <button
              key={item.kind}
              type="button"
              onClick={() => startConnect(item.kind)}
              style={{
                textAlign: 'left',
                padding: '10px 12px',
                borderRadius: 10,
                border: `2px solid ${sel ? '#1f1612' : '#e8e4df'}`,
                background: sel ? '#faf8f5' : '#fff',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: 800, fontSize: '0.84rem' }}>{item.labelJa}</div>
              <div style={{ marginTop: 4, fontSize: '0.7rem', color: '#6b635c', lineHeight: 1.35 }}>{item.description}</div>
              {connectedCount > 0 && (
                <div style={{ marginTop: 6, fontSize: '0.68rem', fontWeight: 700, color: '#047857' }}>
                  <CheckCircle2 size={11} style={{ verticalAlign: -2 }} /> {connectedCount} 接続済
                </div>
              )}
            </button>
          );
        })}
      </div>

      {selectedMeta && connectKind && (
        <form onSubmit={handleConnect} style={connectBox}>
          <div style={{ fontWeight: 800, fontSize: '0.9rem', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Link2 size={15} /> Connect {selectedMeta.labelJa}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
            <label style={fieldLabel}>
              表示名
              <input
                style={fieldInput}
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                required
                placeholder={selectedMeta.labelJa}
              />
            </label>
            <label style={fieldLabel}>
              担当店舗
              <select style={fieldInput} value={storeId} onChange={e => setStoreId(e.target.value)}>
                <option value="">全店舗共通</option>
                {stores.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
            {fields.map(field => (
              <label key={field.key} style={fieldLabel}>
                {field.labelJa}{field.required ? ' *' : ''}
                {field.key === 'environment' ? (
                  <select
                    style={fieldInput}
                    value={form.environment || 'production'}
                    onChange={e => setForm(prev => ({ ...prev, environment: e.target.value }))}
                  >
                    <option value="production">production</option>
                    <option value="sandbox">sandbox</option>
                  </select>
                ) : field.key === 'wageProvider' ? (
                  <select
                    style={fieldInput}
                    value={form.wageProvider}
                    onChange={e => setForm(prev => ({ ...prev, wageProvider: e.target.value }))}
                    required={Boolean(field.required)}
                  >
                    <option value="PayPay給与受取">PayPay給与受取</option>
                    <option value="楽天ペイ給与受取">楽天ペイ給与受取</option>
                    <option value="au PAY給与受取">au PAY給与受取</option>
                    <option value="COIN+">COIN+</option>
                    <option value="その他">その他</option>
                  </select>
                ) : (
                  <input
                    style={fieldInput}
                    type={field.secret ? 'password' : 'text'}
                    value={form[field.key] ?? ''}
                    onChange={e => setForm(prev => ({ ...prev, [field.key]: e.target.value }))}
                    placeholder={field.placeholder || (field.secret ? '••••••••' : '')}
                    required={Boolean(field.required)}
                    autoComplete="off"
                  />
                )}
              </label>
            ))}
          </div>

          <label style={{ ...fieldLabel, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
            <input type="checkbox" checked={createDevice} onChange={e => setCreateDevice(e.target.checked)} />
            接続と同時に決済デバイスも追加する
          </label>
          {createDevice && (
            <label style={{ ...fieldLabel, marginTop: 8, maxWidth: 360 }}>
              デバイス名
              <input style={fieldInput} value={deviceName} onChange={e => setDeviceName(e.target.value)} placeholder="例: カウンター PayPay QR" />
            </label>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <button type="submit" disabled={busy} style={primaryBtn}>
              <Link2 size={15} /> {busy ? '接続中…' : 'Connect'}
            </button>
            <button type="button" style={ghostBtn} disabled={busy} onClick={() => setConnectKind(null)}>
              キャンセル
            </button>
          </div>
        </form>
      )}

      {!connectKind && (
        <p style={{ margin: '8px 0 0', fontSize: '0.78rem', color: '#9ca3af' }}>
          <Plus size={12} style={{ verticalAlign: -2 }} /> 上のカードを選ぶと、加盟店 ID / API キー / 給与受取口座などを入力して Connect できます。
        </p>
      )}
    </div>
  );
}

const panel: CSSProperties = {
  background: '#fff',
  borderRadius: 16,
  border: '1px solid #e8e4df',
  padding: '1.25rem 1.4rem',
  boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
};
const sectionTitle: CSSProperties = { margin: 0, fontSize: '0.95rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 };
const fieldLabel: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.82rem', fontWeight: 700, color: '#374151' };
const fieldInput: CSSProperties = { padding: '0.6rem 0.75rem', border: '1px solid #d1d5db', borderRadius: 8, background: '#f9fafb', fontSize: '0.9rem', width: '100%', boxSizing: 'border-box' };
const primaryBtn: CSSProperties = { padding: '0.65rem 1.1rem', background: '#1f1612', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 };
const ghostBtn: CSSProperties = { padding: '0.5rem 0.85rem', background: '#fff', border: '1px solid #d1d5db', borderRadius: 8, fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 };
const onPill: CSSProperties = { fontSize: '0.68rem', fontWeight: 800, padding: '3px 8px', borderRadius: 999, background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0' };
const kindPill: CSSProperties = { fontSize: '0.65rem', fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: '#f3f4f6', color: '#374151' };
const countPill: CSSProperties = { fontSize: '0.72rem', fontWeight: 800, padding: '4px 10px', borderRadius: 999, background: '#faf8f5', border: '1px solid #e8e4df', color: '#1f1612', alignSelf: 'flex-start' };
const connectedCard: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', border: '1px solid #bbf7d0', background: '#f0fdf4', borderRadius: 12, padding: '12px 14px' };
const connectBox: CSSProperties = { marginTop: 4, border: '1px solid #e5e7eb', borderRadius: 12, background: '#f9fafb', padding: '14px 16px' };
