import { useState, useEffect, type CSSProperties } from 'react';
import { toast } from 'react-hot-toast';
import { Printer, CheckCircle2, AlertTriangle, Wifi, Usb, Zap, BookOpen, ReceiptText, Sliders, Store, Save } from 'lucide-react';
import { printCustomerReceipt, printKitchenTicket, DEFAULT_STORE_SETTINGS, type ReceiptOrder, type ReceiptSettings } from '../../lib/receipt';
import { DEFAULT_STORE_LOCATIONS, type StoreLocation } from '../../lib/stores';
import { apiFetch } from '../../lib/api';

const PRINTER_STORAGE_KEY = 'adarsha_munbyn_printer_config';

export interface PrinterConfig extends ReceiptSettings {
  autoPrintKitchen: boolean;
  lanIp: string;
}

export const DEFAULT_CONFIG: PrinterConfig = {
  ...DEFAULT_STORE_SETTINGS,
  autoPrintKitchen: true,
  lanIp: '',
};

export function getStorePrinterConfig(storeId?: string): PrinterConfig {
  try {
    const key = storeId && storeId !== 'ALL' ? `${PRINTER_STORAGE_KEY}_${storeId}` : PRINTER_STORAGE_KEY;
    const saved = localStorage.getItem(key) ?? localStorage.getItem(PRINTER_STORAGE_KEY);
    return saved ? { ...DEFAULT_CONFIG, ...JSON.parse(saved) } : DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveStorePrinterConfig(config: PrinterConfig, storeId?: string): void {
  try {
    const key = storeId && storeId !== 'ALL' ? `${PRINTER_STORAGE_KEY}_${storeId}` : PRINTER_STORAGE_KEY;
    localStorage.setItem(key, JSON.stringify(config));
    if (!storeId || storeId === 'ALL') {
      localStorage.setItem(PRINTER_STORAGE_KEY, JSON.stringify(config));
    }
  } catch {}
}

export interface PrinterSettingsProps {
  storeName?: string;
  phone?: string;
  addressJa?: string;
}

export default function PrinterSettings({ storeName, phone, addressJa }: PrinterSettingsProps = {}) {
  const [stores, setStores] = useState<StoreLocation[]>(DEFAULT_STORE_LOCATIONS);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('ALL');
  const [activeTab, setActiveTab] = useState<'lan' | 'usb' | 'kiosk' | 'square'>('lan');
  const [config, setConfig] = useState<PrinterConfig>(() => getStorePrinterConfig('ALL'));
  const [serverConfigs, setServerConfigs] = useState<Record<string, PrinterConfig>>({});
  const [savingServer, setSavingServer] = useState(false);

  useEffect(() => {
    Promise.all([
      apiFetch('/api/v1/stores').then(res => res.ok ? res.json() : null),
      apiFetch('/api/v1/settings').then(res => res.ok ? res.json() : null),
    ]).then(([storeData, settingsData]) => {
      if (Array.isArray(storeData) && storeData.length > 0) setStores(storeData);
      if (settingsData?.printerConfigs && typeof settingsData.printerConfigs === 'object') {
        setServerConfigs(settingsData.printerConfigs);
        for (const [sId, sCfg] of Object.entries(settingsData.printerConfigs)) {
          saveStorePrinterConfig(sCfg as PrinterConfig, sId);
        }
        const activeCfg = settingsData.printerConfigs[selectedStoreId] || getStorePrinterConfig(selectedStoreId);
        if (activeCfg) setConfig(activeCfg);
      }
    }).catch(() => undefined);
  }, []);

  const handleSaveToServer = async () => {
    setSavingServer(true);
    try {
      saveStorePrinterConfig(config, selectedStoreId);
      const updated = {
        ...serverConfigs,
        [selectedStoreId]: config,
      };
      const res = await apiFetch('/api/v1/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ printerConfigs: updated }),
      });
      if (res.ok) {
        setServerConfigs(updated);
        toast.success(
          selectedStoreId === 'ALL'
            ? '全店舗共通のプリンター設定をサーバーに保存しました！'
            : `「${stores.find(s => s.id === selectedStoreId)?.name || '店舗'}」のプリンター設定をサーバーに保存しました！`
        );
      } else {
        toast.error('サーバーへの保存に失敗しました');
      }
    } catch {
      toast.error('通信エラーが発生しました');
    } finally {
      setSavingServer(false);
    }
  };

  // When selected store changes, load that store's printer config
  const handleStoreChange = (storeId: string) => {
    setSelectedStoreId(storeId);
    if (storeId === 'ALL') {
      const globalCfg = getStorePrinterConfig('ALL');
      setConfig(globalCfg);
    } else {
      const st = stores.find(s => s.id === storeId);
      const storeCfg = getStorePrinterConfig(storeId);
      setConfig({
        ...storeCfg,
        storeNameJa: st ? `本格インド料理 アダルサ ${st.name}` : storeCfg.storeNameJa,
        storeNameEn: st ? `Adarsha ${st.name} (No.${st.number})` : storeCfg.storeNameEn,
        addressJa: st?.address || storeCfg.addressJa,
        phone: st?.phone || storeCfg.phone,
      });
    }
  };

  useEffect(() => {
    saveStorePrinterConfig(config, selectedStoreId);
  }, [config, selectedStoreId]);

  useEffect(() => {
    if (selectedStoreId === 'ALL') {
      setConfig(prev => {
        let changed = false;
        const next = { ...prev };
        if (storeName && (!prev.storeNameJa || prev.storeNameJa === DEFAULT_STORE_SETTINGS.storeNameJa)) {
          next.storeNameJa = storeName;
          changed = true;
        }
        if (phone && (!prev.phone || prev.phone === DEFAULT_STORE_SETTINGS.phone)) {
          next.phone = phone;
          changed = true;
        }
        if (addressJa && (!prev.addressJa || prev.addressJa === DEFAULT_STORE_SETTINGS.addressJa)) {
          next.addressJa = addressJa;
          changed = true;
        }
        return changed ? next : prev;
      });
    }
  }, [storeName, phone, addressJa, selectedStoreId]);

  const [testPrintingReceipt, setTestPrintingReceipt] = useState(false);
  const [testPrintingKitchen, setTestPrintingKitchen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const sampleOrder: ReceiptOrder = {
    number: 1,
    status: 'CONFIRMED',
    customerName: '熊谷 太郎 (Test Customer)',
    phone: '090-1234-5678',
    pickupAt: new Date(Date.now() + 35 * 60 * 1000).toISOString(),
    fulfillment: 'PICKUP',
    note: '辛さは控えめでお願いします。スプーン2つ希望。',
    items: [
      {
        itemId: 'item-1',
        nameJa: 'バターチキンカレー',
        nameEn: 'Butter Chicken Curry',
        quantity: 2,
        unitPrice: 1200,
        lineTotal: 2400,
        options: [{ groupNameJa: '辛さ', nameJa: '中辛 (Medium)' }],
      },
      {
        itemId: 'item-2',
        nameJa: 'チーズナン',
        nameEn: 'Cheese Naan',
        quantity: 1,
        unitPrice: 550,
        lineTotal: 550,
        options: [{ groupNameJa: '焼き加減', nameJa: 'よく焼き' }],
      },
      {
        itemId: 'item-3',
        nameJa: 'タンドリーチキン (2P)',
        nameEn: 'Tandoori Chicken (2P)',
        quantity: 1,
        unitPrice: 650,
        lineTotal: 650,
      },
      {
        itemId: 'item-4',
        nameJa: 'マンゴーラッシー',
        nameEn: 'Mango Lassi',
        quantity: 2,
        unitPrice: 350,
        lineTotal: 700,
      },
    ],
    subtotal: 4300,
    offerTitle: 'ランチタイム特別クーポン',
    offerDiscount: 300,
    rewardTitle: 'スタンプカード5個達成割引',
    rewardDiscount: 200,
    pointsUsed: 100,
    pointsDiscount: 100,
    deliveryFee: 0,
    grandTotal: 3700,
  };

  const handleTestReceiptPrint = () => {
    setTestPrintingReceipt(true);
    try {
      const ok = printCustomerReceipt(sampleOrder, config);
      if (ok) {
        toast.success('【領収書（ロゴ・QR・インボイス付き）】のテスト印刷を送信しました！');
      } else {
        toast.error('印刷ダイアログを開けませんでした。ポップアップ許可をご確認ください。');
      }
    } catch {
      toast.error('印刷エラーが発生しました。');
    } finally {
      setTimeout(() => setTestPrintingReceipt(false), 800);
    }
  };

  const handleTestKitchenPrint = () => {
    setTestPrintingKitchen(true);
    try {
      const ok = printKitchenTicket(sampleOrder, null, config);
      if (ok) {
        toast.success('【調理伝票（厨房用）】のテスト印刷を送信しました！');
      } else {
        toast.error('印刷ダイアログを開けませんでした。ポップアップ許可をご確認ください。');
      }
    } catch {
      toast.error('印刷エラーが発生しました。');
    } finally {
      setTimeout(() => setTestPrintingKitchen(false), 800);
    }
  };

  return (
    <div style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', borderBottom: '1px solid #e5e7eb', paddingBottom: '1.25rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: '#eff6ff', color: '#1d4ed8', display: 'grid', placeItems: 'center' }}>
              <Printer size={20} />
            </div>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 700, margin: 0, color: '#111827' }}>
              レシート・伝票プリンター設定（MUNBYN / Epson TM-m30 互換）
            </h2>
          </div>
          <p style={{ margin: 0, color: '#6b7280', fontSize: '0.88rem', lineHeight: 1.5 }}>
            公式ロゴ、適格請求書登録番号（インボイス対応）、軽減税率8%/10%内訳、QRコードを美しく印字します。
          </p>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleTestReceiptPrint}
            disabled={testPrintingReceipt}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 18px',
              backgroundColor: '#10b981',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '0.92rem',
              cursor: testPrintingReceipt ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)',
              transition: 'all 0.2s',
            }}
          >
            <ReceiptText size={18} />
            {testPrintingReceipt ? '領収書送信中…' : '領収書をテスト印刷（ロゴ＆QR付）'}
          </button>

          <button
            type="button"
            onClick={handleTestKitchenPrint}
            disabled={testPrintingKitchen}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 18px',
              backgroundColor: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '0.92rem',
              cursor: testPrintingKitchen ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 12px rgba(59, 130, 246, 0.25)',
              transition: 'all 0.2s',
            }}
          >
            <Printer size={18} />
            {testPrintingKitchen ? '伝票送信中…' : '調理伝票をテスト印刷'}
          </button>

          <button
            type="button"
            onClick={handleSaveToServer}
            disabled={savingServer}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 18px',
              backgroundColor: '#ea580c',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '0.92rem',
              cursor: savingServer ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 12px rgba(234, 88, 12, 0.25)',
              transition: 'all 0.2s',
            }}
          >
            <Save size={18} />
            {savingServer ? '保存中…' : '設定をサーバーに保存'}
          </button>
        </div>
      </div>

      {/* Feature Badges */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '1rem' }}>
        <span style={badgeStyle}><CheckCircle2 size={14} color="#059669" /> アダルサ公式ブランドロゴ 高精細印字</span>
        <span style={badgeStyle}><CheckCircle2 size={14} color="#059669" /> インボイス制度対応（適格請求書 登録番号印字）</span>
        <span style={badgeStyle}><CheckCircle2 size={14} color="#059669" /> 軽減税率8%・標準税率10% 消費税自動計算</span>
        <span style={badgeStyle}><CheckCircle2 size={14} color="#059669" /> 高速ベクターSVG QRコード</span>
        <span style={badgeStyle}><CheckCircle2 size={14} color="#059669" /> 80mm感熱ロール紙・Epson TM-m30モード対応</span>
      </div>

      {/* Store Location Selector for Multi-Store Support */}
      <div style={{ backgroundColor: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '10px', padding: '16px', marginTop: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: selectedStoreId !== 'ALL' ? '12px' : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: '#ea580c', color: '#fff', display: 'grid', placeItems: 'center' }}>
              <Store size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: '#9a3412' }}>
                対象店舗のプリンター選択（マルチ店舗対応）
              </h3>
              <p style={{ margin: 0, fontSize: '0.82rem', color: '#c2410c' }}>
                店舗ごとに異なるプリンター（IPアドレス・用紙サイズ・自動印刷）を割り当てて個別に設定・保存できます。
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.86rem', fontWeight: 600, color: '#9a3412' }}>設定対象店舗:</span>
            <select
              value={selectedStoreId}
              onChange={e => handleStoreChange(e.target.value)}
              style={{
                ...inputStyle,
                width: 'auto',
                minWidth: '240px',
                borderColor: '#ea580c',
                backgroundColor: '#fff',
                fontWeight: 700,
                color: '#1f2937',
              }}
            >
              <option value="ALL">🌐 全店舗共通 (Default / All Stores)</option>
              {stores.map(st => (
                <option key={st.id} value={st.id}>
                  No.{st.number} {st.name} {st.phone ? `(${st.phone})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {selectedStoreId !== 'ALL' && (
          <div style={{ backgroundColor: '#fff', border: '1px solid #ffedd5', borderRadius: '8px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            {(() => {
              const currentStore = stores.find(s => s.id === selectedStoreId);
              return (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, fontSize: '0.96rem', color: '#9a3412' }}>
                    <span style={{ padding: '2px 8px', borderRadius: '6px', backgroundColor: '#ea580c', color: '#fff', fontSize: '0.78rem' }}>
                      No.{currentStore?.number}
                    </span>
                    {currentStore?.name}
                    {currentStore?.badge && (
                      <span style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: 500 }}>({currentStore.badge})</span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#4b5563', marginTop: '4px' }}>
                    📍 {currentStore?.address || '住所未設定'} &nbsp;|&nbsp; 📞 {currentStore?.phone || '電話未設定'}
                  </div>
                </div>
              );
            })()}

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', color: '#059669', fontWeight: 700, backgroundColor: '#ecfdf5', padding: '6px 12px', borderRadius: '6px' }}>
              <CheckCircle2 size={16} /> この店舗専用のプリンター設定として自動保存されます
            </div>
          </div>
        )}
      </div>

      {/* Preferences card */}
      <div style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '16px', marginTop: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ fontSize: '0.98rem', fontWeight: 700, margin: 0, color: '#1f2937' }}>
            プリンター動作＆レシート記載オプション {selectedStoreId !== 'ALL' ? `【${stores.find(s => s.id === selectedStoreId)?.name || ''}】` : '【全店舗共通】'}
          </h3>
          <button
            type="button"
            onClick={() => setShowAdvanced(v => !v)}
            style={{
              background: 'none',
              border: 'none',
              color: '#2563eb',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.86rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Sliders size={15} />
            {showAdvanced ? '詳細設定を閉じる' : '店舗情報・インボイス番号の編集'}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
          <div>
            <label style={labelStyle}>用紙サイズ</label>
            <select
              value={config.paperWidth}
              onChange={e => setConfig(prev => ({ ...prev, paperWidth: e.target.value as any }))}
              style={inputStyle}
            >
              <option value="80mm">80mm（標準・店舗推奨）</option>
              <option value="58mm">58mm（小型ロール紙）</option>
            </select>
            <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: '#6b7280' }}>MUNBYNの80mm幅ロール紙に最適な余白で印字されます。</p>
          </div>

          <div>
            <label style={labelStyle}>キッチン画面での自動印刷</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minHeight: '42px' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}>
                <input
                  type="checkbox"
                  checked={config.autoPrintKitchen}
                  onChange={e => setConfig(prev => ({ ...prev, autoPrintKitchen: e.target.checked }))}
                  style={{ width: '18px', height: '18px', accentColor: '#10b981' }}
                />
                新規注文が入ったら自動印刷
              </label>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: '#6b7280' }}>/kitchen 画面を開いているとき、注文を受信したら即座に印字します。</p>
          </div>

          <div>
            <label style={labelStyle}>プリンターIPアドレス（有線LAN / Wi-Fi）</label>
            <input
              type="text"
              value={config.lanIp || ''}
              onChange={e => setConfig(prev => ({ ...prev, lanIp: e.target.value }))}
              style={inputStyle}
              placeholder="例: 192.168.1.200 (USB/ブラウザ印刷は空欄)"
            />
            <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: '#6b7280' }}>店舗ローカルネットワークのプリンターIPを指定できます。</p>
          </div>
        </div>

        {/* Advanced Store Info on Receipt */}
        {showAdvanced && (
          <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e5e7eb', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
            <div>
              <label style={labelStyle}>レシート印字店舗名</label>
              <input
                type="text"
                value={config.storeNameJa || ''}
                onChange={e => setConfig(prev => ({ ...prev, storeNameJa: e.target.value }))}
                style={inputStyle}
                placeholder="本格インド料理 アダルサ"
              />
            </div>

            <div>
              <label style={labelStyle}>適格請求書 登録番号 (インボイス番号)</label>
              <input
                type="text"
                value={config.registrationNumber || ''}
                onChange={e => setConfig(prev => ({ ...prev, registrationNumber: e.target.value }))}
                style={inputStyle}
                placeholder="T5030001123456"
              />
            </div>

            <div>
              <label style={labelStyle}>お電話番号</label>
              <input
                type="text"
                value={config.phone || ''}
                onChange={e => setConfig(prev => ({ ...prev, phone: e.target.value }))}
                style={inputStyle}
                placeholder="048-577-7497"
              />
            </div>

            <div>
              <label style={labelStyle}>ご住所</label>
              <input
                type="text"
                value={config.addressJa || ''}
                onChange={e => setConfig(prev => ({ ...prev, addressJa: e.target.value }))}
                style={inputStyle}
                placeholder="〒360-0023 埼玉県熊谷市佐谷田2081"
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>レシート下部メッセージ（感謝文）</label>
              <input
                type="text"
                value={config.customFooter || ''}
                onChange={e => setConfig(prev => ({ ...prev, customFooter: e.target.value }))}
                style={inputStyle}
                placeholder="毎度本格インド料理アダルサをご利用いただき、誠にありがとうございます。"
              />
            </div>
          </div>
        )}
      </div>

      {/* Connection Guide Tabs */}
      <div style={{ marginTop: '1.75rem' }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0 0 10px 0', color: '#111827' }}>
          接続・セットアップ手順ガイド
        </h3>

        <div style={{ display: 'flex', gap: '6px', borderBottom: '2px solid #e5e7eb', overflowX: 'auto', paddingBottom: '1px' }}>
          {[
            { id: 'lan', label: '有線LAN接続（ルーター経由・店舗推奨）', icon: <Wifi size={16} /> },
            { id: 'usb', label: 'USB接続（PC / Mac）', icon: <Usb size={16} /> },
            { id: 'kiosk', label: '完全自動印刷（Chromeキオスク）', icon: <Zap size={16} /> },
            { id: 'square', label: 'Square POSレジ併用手順', icon: <BookOpen size={16} /> },
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 16px',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                fontWeight: activeTab === tab.id ? 700 : 500,
                color: activeTab === tab.id ? '#1d4ed8' : '#4b5563',
                borderBottom: activeTab === tab.id ? '2px solid #1d4ed8' : '2px solid transparent',
                marginBottom: '-2px',
                whiteSpace: 'nowrap',
                fontSize: '0.88rem',
              }}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab 1: LAN */}
        {activeTab === 'lan' && (
          <div style={guideContentStyle}>
            <div style={{ padding: '12px 16px', backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', color: '#065f46', fontSize: '0.88rem', marginBottom: '14px' }}>
              <strong>安定した店舗運用には有線LAN接続が一番推奨されます。</strong> ルーターにLANケーブルを挿すだけで、店舗内のPCやiPadから同じプリンターを共有できます。
            </div>

            <ol style={stepListStyle}>
              <li>
                <strong>配線準備:</strong> プリンターの電源を切った状態で、LANポートとWi-Fiルーター（またはハブ）をLANケーブルで接続します。
              </li>
              <li>
                <strong>起動:</strong> プリンターの電源を入れます。プリンターが自動的にIPアドレスを取得するまで、約7〜10秒ほど待ちます。
              </li>
              <li>
                <strong>IPアドレスの確認方法（セルフテスト印字）:</strong><br />
                プリンターの電源を切った状態から、<strong>「FEED（紙送り）」ボタンを押しながら電源ボタンをON</strong>にし、印字が始まったら指を離します。<br />
                出てきた用紙に <code>IP Address: 192.168.x.x</code> と印字されていればネットワーク接続完了です。
              </li>
              <li>
                <strong>PC・Macからの印刷:</strong> PCのプリンター設定から「ネットワークプリンターの追加」を行うか、USB接続PCと共有することで、WEB画面上の印刷ボタンを押すだけでMUNBYNから綺麗にレシートが出力されます。
              </li>
            </ol>
          </div>
        )}

        {/* Tab 2: USB */}
        {activeTab === 'usb' && (
          <div style={guideContentStyle}>
            <ol style={stepListStyle}>
              <li>
                <strong>プリンターモードの切り替え（重要）:</strong><br />
                PCでMUNBYN設定ツール「Printer Test V5.1C」を開き、<strong>「Advance（アドバンス）」</strong>をクリックします。<br />
                <strong>「EPSON Mode」を「ON」に切り替え、「Setting（設定）」</strong>をクリックします。<br />
                プリンターから「ピッ」と音が鳴れば、Epson TM-m30互換モード切替完了です。
              </li>
              <li>
                <strong>USBケーブルの接続:</strong> 店舗のPC / Macとプリンターを付属のUSBケーブルで接続します。
              </li>
              <li>
                <strong>PCドライバのインストール:</strong> MUNBYN公式サイトよりプリンタードライバをインストールし、OSのプリンター一覧で「MUNBYN / POS-80」を既定のプリンターに設定します。
              </li>
              <li>
                <strong>印刷テスト:</strong> 右上の「領収書をテスト印刷」をクリックして、正常に80mm幅でレシートが印字されることを確認してください。
              </li>
            </ol>
          </div>
        )}

        {/* Tab 3: Kiosk Mode */}
        {activeTab === 'kiosk' && (
          <div style={guideContentStyle}>
            <div style={{ padding: '12px 16px', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', color: '#1e40af', fontSize: '0.88rem', marginBottom: '14px' }}>
              <strong>完全自動運用（確認ダイアログなしで即座に印字）</strong><br />
              Google Chromeの「キオスク印刷モード」を使用すると、WEB注文が入った瞬間にMUNBYNプリンターからレシートが自動で印刷されます。
            </div>

            <ol style={stepListStyle}>
              <li>
                MUNBYNプリンターをPCの「通常使うプリンター（既定）」に設定します。
              </li>
              <li>
                Windowsの場合：Chromeのショートカットアイコンを右クリック → 「プロパティ」を開きます。<br />
                「リンク先」の末尾に半角スペースを空けて <code>--kiosk-printing</code> を追加して「OK」をクリックします。<br />
                <code style={{ display: 'block', backgroundColor: '#1f2937', color: '#f9fafb', padding: '8px 12px', borderRadius: '6px', margin: '6px 0', fontSize: '0.82rem' }}>
                  chrome.exe --kiosk-printing http://localhost:5173/kitchen
                </code>
              </li>
              <li>
                このショートカットからChromeを起動すると、印刷ボタンを押したときや注文受信時にダイアログが出ず、<strong>直接プリンターから瞬時に自動印字</strong>されます！
              </li>
            </ol>
          </div>
        )}

        {/* Tab 4: Square */}
        {activeTab === 'square' && (
          <div style={guideContentStyle}>
            <div style={{ padding: '12px 16px', backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', color: '#92400e', fontSize: '0.88rem', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, marginBottom: '2px' }}>
                <AlertTriangle size={16} /> 注意事項
              </div>
              本プリンターはスマレジ・エアレジ・Rocket Nowには非対応ですが、<strong>Square（スクエア）にはUSBまたはLANポート接続で対応</strong>しています。
            </div>

            <ol style={stepListStyle}>
              <li>
                Square POSレジアプリを開き、<strong>「設定」→「ハードウェア」→「プリンター」</strong>を選択します。
              </li>
              <li>
                <strong>「プリンターステーションを作成」</strong>をタップします。
              </li>
              <li>
                検出されたリストから <strong>「Epson TM-m30」</strong> を選択してください。（※名称は「レシート用」等に変更可能）
              </li>
              <li>
                <strong>「テスト印刷」</strong>をタップし、正常に印字されるか確認して<strong>「保存」</strong>をクリックします。
              </li>
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}

const panelStyle: CSSProperties = {
  backgroundColor: '#fff',
  borderRadius: '12px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  border: '1px solid #e5e7eb',
  padding: '1.5rem',
  marginTop: '1.5rem',
};

const badgeStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  fontSize: '0.8rem',
  fontWeight: 600,
  color: '#374151',
  backgroundColor: '#f3f4f6',
  padding: '4px 10px',
  borderRadius: '9999px',
};

const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: '0.85rem',
  fontWeight: 600,
  color: '#374151',
  marginBottom: '6px',
};

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '0.65rem 0.85rem',
  borderRadius: '8px',
  border: '1px solid #d1d5db',
  backgroundColor: '#fff',
  fontSize: '0.9rem',
  outline: 'none',
};

const guideContentStyle: CSSProperties = {
  backgroundColor: '#fafafa',
  border: '1px solid #e5e7eb',
  borderRadius: '0 0 10px 10px',
  padding: '18px 20px',
};

const stepListStyle: CSSProperties = {
  margin: 0,
  paddingLeft: '22px',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  fontSize: '0.88rem',
  lineHeight: 1.6,
  color: '#374151',
};
