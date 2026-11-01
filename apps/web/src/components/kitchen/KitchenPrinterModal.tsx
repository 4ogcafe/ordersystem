import { useState, useEffect, type CSSProperties } from 'react';
import { toast } from 'react-hot-toast';
import { X, Printer, Store, Wifi, CheckCircle2, Sliders } from 'lucide-react';
import type { StoreLocation } from '../../lib/stores';
import { getStorePrinterConfig, saveStorePrinterConfig, type PrinterConfig } from '../admin/PrinterSettings';
import { printKitchenTicket, type ReceiptOrder } from '../../lib/receipt';
import { apiFetch } from '../../lib/api';

interface KitchenPrinterModalProps {
  isOpen: boolean;
  onClose: () => void;
  stores: StoreLocation[];
  currentStoreId: string;
  onSelectStore: (storeId: string) => void;
  autoPrint: boolean;
  onToggleAutoPrint: (enabled: boolean) => void;
  sound: boolean;
  onToggleSound: (enabled: boolean) => void;
}

export default function KitchenPrinterModal({
  isOpen,
  onClose,
  stores,
  currentStoreId,
  onSelectStore,
  autoPrint,
  onToggleAutoPrint,
  sound,
  onToggleSound,
}: KitchenPrinterModalProps) {
  const [selectedStoreId, setSelectedStoreId] = useState<string>(currentStoreId || 'ALL');
  const [config, setConfig] = useState<PrinterConfig>(() => ({
    ...getStorePrinterConfig(currentStoreId || 'ALL'),
    autoPrintKitchen: autoPrint,
  }));
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    setSelectedStoreId(currentStoreId || 'ALL');
    const storeCfg = getStorePrinterConfig(currentStoreId || 'ALL');
    setConfig({ ...storeCfg, autoPrintKitchen: autoPrint });
  }, [currentStoreId, autoPrint, isOpen]);

  if (!isOpen) return null;

  const currentStore = stores.find(s => s.id === selectedStoreId);

  const handleStoreChange = (storeId: string) => {
    setSelectedStoreId(storeId);
    const storeCfg = getStorePrinterConfig(storeId);
    const st = stores.find(s => s.id === storeId);
    setConfig({
      ...storeCfg,
      storeNameJa: st ? `本格インド料理 アダルサ ${st.name}` : storeCfg.storeNameJa,
      storeNameEn: st ? `Adarsha ${st.name} (No.${st.number})` : storeCfg.storeNameEn,
      addressJa: st?.address || storeCfg.addressJa,
      phone: st?.phone || storeCfg.phone,
    });
  };

  const handleSave = () => {
    saveStorePrinterConfig(config, selectedStoreId);
    onSelectStore(selectedStoreId);
    onToggleAutoPrint(config.autoPrintKitchen);
    apiFetch('/api/v1/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ printerConfigs: { [selectedStoreId]: config } }),
    }).catch(() => undefined);
    toast.success(
      selectedStoreId === 'ALL'
        ? '全店舗共通のプリンター設定を保存しました'
        : `【${currentStore?.name || '店舗'}】のプリンター設定を保存しました`
    );
    onClose();
  };

  const handleTestPrint = () => {
    setTesting(true);
    try {
      const sampleOrder: ReceiptOrder = {
        number: 1,
        status: 'CONFIRMED',
        customerName: 'テスト印刷 (Kitchen Test)',
        phone: currentStore?.phone || '03-6903-7598',
        pickupAt: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
        fulfillment: 'PICKUP',
        note: 'プリンター接続テストです。正常に印字されました。',
        store: currentStore ? { id: currentStore.id, name: currentStore.name, number: currentStore.number, address: currentStore.address, phone: currentStore.phone } : null,
        items: [
          { nameJa: 'チキンカレー (中辛)', nameEn: 'Chicken Curry', quantity: 1, options: [{ groupNameJa: '辛さ', nameJa: 'Medium' }] },
          { nameJa: 'プレーンナン', nameEn: 'Plain Naan', quantity: 1 },
          { nameJa: 'マンゴーラッシー', nameEn: 'Mango Lassi', quantity: 1 },
        ],
        total: 1800,
      };

      const ok = printKitchenTicket(sampleOrder, null, config);
      if (ok) {
        toast.success('テスト調理伝票を送信しました！');
      } else {
        toast.error('印刷ダイアログを開けませんでした。ポップアップ許可をご確認ください。');
      }
    } catch {
      toast.error('印刷エラーが発生しました');
    } finally {
      setTimeout(() => setTesting(false), 800);
    }
  };

  return (
    <div style={overlayStyle} onClick={onClose} role="dialog" aria-modal="true">
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={iconBadgeStyle}>
              <Printer size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: '#111827' }}>
                厨房プリンター設定（店舗別）
              </h2>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#6b7280' }}>
                この端末の所属店舗とプリンター（MUNBYN / Epson TM-m30 互換）を設定します
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} style={closeButtonStyle} aria-label="閉じる">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '1.25rem', overflowY: 'auto', maxHeight: '75vh' }}>
          {/* Store Selector */}
          <div style={sectionBoxStyle}>
            <label style={labelStyle}>
              <Store size={16} color="#ea580c" />
              <span>この画面を表示する店舗（店舗ロケーション）</span>
            </label>
            <select
              value={selectedStoreId}
              onChange={e => handleStoreChange(e.target.value)}
              style={selectStyle}
            >
              <option value="ALL">🌐 全店舗共通（全店舗の注文を受信・管理）</option>
              {stores.map(st => (
                <option key={st.id} value={st.id}>
                  No.{st.number} {st.name} {st.phone ? `(${st.phone})` : ''}
                </option>
              ))}
            </select>
            {currentStore && (
              <div style={{ marginTop: '8px', fontSize: '0.8rem', color: '#4b5563', backgroundColor: '#fff', padding: '8px 12px', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
                <strong>住所:</strong> {currentStore.address} &nbsp;|&nbsp; <strong>TEL:</strong> {currentStore.phone}
              </div>
            )}
          </div>

          {/* Quick Automation Toggles */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', margin: '14px 0' }}>
            <label style={{ ...toggleCardStyle, borderColor: config.autoPrintKitchen ? '#10b981' : '#e5e7eb', backgroundColor: config.autoPrintKitchen ? '#ecfdf5' : '#f9fafb' }}>
              <input
                type="checkbox"
                checked={config.autoPrintKitchen}
                onChange={e => setConfig(prev => ({ ...prev, autoPrintKitchen: e.target.checked }))}
                style={{ width: '18px', height: '18px', accentColor: '#10b981' }}
              />
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#111827' }}>新着注文の自動印刷</div>
                <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>注文が入ると即座に調理伝票を印字</div>
              </div>
            </label>

            <label style={{ ...toggleCardStyle, borderColor: sound ? '#3b82f6' : '#e5e7eb', backgroundColor: sound ? '#eff6ff' : '#f9fafb' }}>
              <input
                type="checkbox"
                checked={sound}
                onChange={e => onToggleSound(e.target.checked)}
                style={{ width: '18px', height: '18px', accentColor: '#3b82f6' }}
              />
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#111827' }}>
                  {sound ? '呼び出し音: オン' : '呼び出し音: オフ'}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>未調理注文がある間チャイム音で通知</div>
              </div>
            </label>
          </div>

          {/* Hardware & Paper Settings */}
          <div style={settingsCardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px', fontWeight: 700, fontSize: '0.92rem', color: '#1f2937' }}>
              <Sliders size={16} color="#4b5563" />
              <span>ロール紙＆ネットワーク接続</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={labelStyle}>用紙幅 (ロール紙)</label>
                <select
                  value={config.paperWidth}
                  onChange={e => setConfig(prev => ({ ...prev, paperWidth: e.target.value as any }))}
                  style={inputStyle}
                >
                  <option value="80mm">80mm幅 (店舗標準・推奨)</option>
                  <option value="58mm">58mm幅 (小型ロール)</option>
                </select>
              </div>

              <div>
                <label style={labelStyle}>
                  <Wifi size={14} /> プリンターIPアドレス
                </label>
                <input
                  type="text"
                  value={config.lanIp || ''}
                  onChange={e => setConfig(prev => ({ ...prev, lanIp: e.target.value }))}
                  placeholder="例: 192.168.1.200 (USBは空欄)"
                  style={inputStyle}
                />
              </div>
            </div>
            <p style={{ margin: '8px 0 0', fontSize: '0.76rem', color: '#6b7280' }}>
              ※ USB接続やiPadのAirPrintをご利用の場合は、IPアドレスを空欄のままご利用いただけます。
            </p>
          </div>

          {/* Test Print Section */}
          <div style={{ marginTop: '14px', padding: '12px', backgroundColor: '#f3f4f6', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ fontSize: '0.84rem', color: '#374151' }}>
              <strong>動作テスト:</strong> 実際のプリンターで伝票の印字テストを行います
            </div>
            <button
              type="button"
              onClick={handleTestPrint}
              disabled={testing}
              style={testBtnStyle}
            >
              <Printer size={16} />
              {testing ? '印刷送信中…' : '調理伝票をテスト印刷'}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div style={footerStyle}>
          <button type="button" onClick={onClose} style={cancelBtnStyle}>
            キャンセル
          </button>
          <button type="button" onClick={handleSave} style={saveBtnStyle}>
            <CheckCircle2 size={16} />
            設定を保存して適用
          </button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle: CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.65)',
  backdropFilter: 'blur(3px)',
  display: 'grid',
  placeItems: 'center',
  zIndex: 9999,
  padding: '16px',
};

const modalStyle: CSSProperties = {
  backgroundColor: '#fff',
  borderRadius: '14px',
  width: '100%',
  maxWidth: '560px',
  boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const headerStyle: CSSProperties = {
  padding: '16px 20px',
  borderBottom: '1px solid #e5e7eb',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  backgroundColor: '#f9fafb',
};

const iconBadgeStyle: CSSProperties = {
  width: '36px',
  height: '36px',
  borderRadius: '8px',
  backgroundColor: '#eff6ff',
  color: '#2563eb',
  display: 'grid',
  placeItems: 'center',
};

const closeButtonStyle: CSSProperties = {
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  color: '#6b7280',
  padding: '4px',
  borderRadius: '6px',
};

const sectionBoxStyle: CSSProperties = {
  backgroundColor: '#fff7ed',
  border: '1px solid #fed7aa',
  borderRadius: '10px',
  padding: '14px',
};

const labelStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  fontSize: '0.85rem',
  fontWeight: 700,
  color: '#374151',
  marginBottom: '6px',
};

const selectStyle: CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '8px',
  border: '1px solid #ea580c',
  backgroundColor: '#fff',
  fontSize: '0.92rem',
  fontWeight: 700,
  color: '#1f2937',
  outline: 'none',
};

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: '8px',
  border: '1px solid #d1d5db',
  backgroundColor: '#fff',
  fontSize: '0.88rem',
  outline: 'none',
  boxSizing: 'border-box',
};

const toggleCardStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '10px',
  padding: '12px',
  borderRadius: '10px',
  border: '1.5px solid',
  cursor: 'pointer',
};

const settingsCardStyle: CSSProperties = {
  backgroundColor: '#f9fafb',
  border: '1px solid #e5e7eb',
  borderRadius: '10px',
  padding: '14px',
};

const testBtnStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '8px 14px',
  backgroundColor: '#3b82f6',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  fontWeight: 700,
  fontSize: '0.84rem',
  cursor: 'pointer',
};

const footerStyle: CSSProperties = {
  padding: '14px 20px',
  borderTop: '1px solid #e5e7eb',
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '10px',
  backgroundColor: '#f9fafb',
};

const cancelBtnStyle: CSSProperties = {
  padding: '9px 16px',
  backgroundColor: '#fff',
  border: '1px solid #d1d5db',
  borderRadius: '8px',
  fontWeight: 600,
  fontSize: '0.88rem',
  color: '#4b5563',
  cursor: 'pointer',
};

const saveBtnStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '9px 18px',
  backgroundColor: '#ea580c',
  border: 'none',
  borderRadius: '8px',
  fontWeight: 700,
  fontSize: '0.88rem',
  color: '#fff',
  cursor: 'pointer',
  boxShadow: '0 2px 6px rgba(234, 88, 12, 0.3)',
};
