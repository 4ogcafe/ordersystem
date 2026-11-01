import { useEffect, useState, type CSSProperties } from 'react';
import { toast } from 'react-hot-toast';
import { UtensilsCrossed, QrCode, Printer, CheckCircle2, Sliders, ExternalLink, Info, Store } from 'lucide-react';
import { apiFetch, errorMessage } from '../../lib/api';
import { DEFAULT_STORE_LOCATIONS, type StoreLocation } from '../../lib/stores';
import { generateQrSvg, printHtml } from '../../lib/receipt';

interface TableOrderingForm {
  dineInHours: string;
  dineInLeadMinutes: number;
  dineInTaxRatePercent: number;
  dineInTableCount: number;
  dineInTablePrefix: string;
  dineInTableNames: string;
  dineInRequireTableNumber: boolean;
  dineInAllowPayAtRegister: boolean;
  dineInAllowOnlinePay: boolean;
  dineInNoteJa: string;
}

const DEFAULT_TABLE_NAMES = '1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, カウンター1, カウンター2, カウンター3';

export default function TableOrderingSettings({ onSaved }: { onSaved?: () => void }) {
  const [form, setForm] = useState<TableOrderingForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [stores, setStores] = useState<StoreLocation[]>(DEFAULT_STORE_LOCATIONS);
  const [previewStoreId, setPreviewStoreId] = useState<string>('musashisakai');
  const [previewTable, setPreviewTable] = useState<string>('1');

  useEffect(() => {
    Promise.all([
      apiFetch('/api/v1/settings').then(r => r.json()).catch(() => ({})),
      apiFetch('/api/v1/stores').then(r => r.json()).catch(() => DEFAULT_STORE_LOCATIONS),
    ]).then(([settings, storeList]) => {
      if (Array.isArray(storeList) && storeList.length > 0) {
        setStores(storeList);
        setPreviewStoreId(storeList[0].id);
      }
      setForm({
        dineInHours: settings.dineInHours || settings.pickupHours || '11:00-15:00, 17:00-22:30',
        dineInLeadMinutes: settings.dineInLeadMinutes ?? 0,
        dineInTaxRatePercent: settings.dineInTaxRatePercent ?? 10,
        dineInTableCount: settings.dineInTableCount ?? 15,
        dineInTablePrefix: settings.dineInTablePrefix ?? 'テーブル ',
        dineInTableNames: settings.dineInTableNames || DEFAULT_TABLE_NAMES,
        dineInRequireTableNumber: settings.dineInRequireTableNumber !== false,
        dineInAllowPayAtRegister: settings.dineInAllowPayAtRegister !== false,
        dineInAllowOnlinePay: settings.dineInAllowOnlinePay !== false,
        dineInNoteJa: settings.dineInNoteJa || 'お席のQRコードまたはスマートフォンからそのままご注文いただけます。お会計は食後にレジにてお願いいたします。',
      });
    });
  }, []);

  if (!form) return null;

  const update = (patch: Partial<TableOrderingForm>) => setForm(prev => prev ? { ...prev, ...patch } : null);

  const parsedTables = form.dineInTableNames
    .split(/[,、\n]+/)
    .map(t => t.trim())
    .filter(Boolean);

  const selectedStore = stores.find(s => s.id === previewStoreId) || stores[0];

  const getTableOrderUrl = (tableNum: string, storeId = previewStoreId) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://pnglike.com';
    return `${origin}/order?fulfillment=DINE_IN&store=${encodeURIComponent(storeId)}&table=${encodeURIComponent(tableNum)}`;
  };

  const currentPreviewUrl = getTableOrderUrl(previewTable);
  const currentQrSvg = generateQrSvg(currentPreviewUrl, 160);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSaving(true);
    try {
      const res = await apiFetch('/api/v1/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        toast.success('店内・テーブル注文設定を保存しました！');
        onSaved?.();
      } else {
        toast.error(await errorMessage(res, '設定の保存に失敗しました'));
      }
    } catch {
      toast.error('通信エラーが発生しました');
    } finally {
      setSaving(false);
    }
  };

  const handlePrintSingleTableQr = (tableNum: string) => {
    const url = getTableOrderUrl(tableNum, selectedStore.id);
    const qrSvg = generateQrSvg(url, 200);
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>テーブル ${tableNum} - QRコードスタンド</title>
  <style>
    @page { size: A5 portrait; margin: 10mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; text-align: center; color: #111; padding: 20px; }
    .card { border: 3px solid #ea580c; border-radius: 16px; padding: 24px; max-width: 420px; margin: 0 auto; box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
    .store-name { font-size: 18px; font-weight: 800; color: #ea580c; margin-bottom: 4px; }
    .title { font-size: 24px; font-weight: 900; margin: 8px 0; }
    .table-badge { display: inline-block; background: #000; color: #fff; font-size: 26px; font-weight: 900; padding: 6px 20px; border-radius: 999px; margin: 12px 0; }
    .qr-box { margin: 16px auto; width: 200px; height: 200px; }
    .instructions { font-size: 14px; font-weight: 700; line-height: 1.6; margin: 12px 0; }
    .step { font-size: 13px; color: #4b5563; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="store-name">本格インド料理 アダルサ ${selectedStore.name}</div>
    <div class="title">お席からスマホでご注文</div>
    <div class="table-badge">${form.dineInTablePrefix}${tableNum} 番席</div>
    <div class="qr-box">${qrSvg}</div>
    <div class="instructions">カメラアプリでQRコードを読み取ってください。<br />メニューの閲覧とお席からのご注文が可能です。</div>
    <div class="step">※ お会計は食後にレジカウンターにてお申し付けください</div>
  </div>
</body>
</html>`;
    printHtml(html);
  };

  const handleBatchPrintAllTables = () => {
    const cardsHtml = parsedTables.map(tNum => {
      const url = getTableOrderUrl(tNum, selectedStore.id);
      const qrSvg = generateQrSvg(url, 180);
      return `
      <div class="card" style="page-break-after: always; margin-bottom: 30px;">
        <div class="store-name">本格インド料理 アダルサ ${selectedStore.name}</div>
        <div class="title">お席からスマホでラクラク注文</div>
        <div class="table-badge">${form.dineInTablePrefix}${tNum} 番席</div>
        <div class="qr-box">${qrSvg}</div>
        <div class="instructions">カメラでQRコードを読み取って注文画面へ</div>
        <div class="step">テーブル番号: <strong>${tNum}</strong>（食後にレジにてお会計）</div>
      </div>
      `;
    }).join('\n');

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>全テーブルQRコード一括印刷 - ${selectedStore.name}</title>
  <style>
    @page { size: A5 portrait; margin: 10mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; text-align: center; color: #111; margin: 0; padding: 10px; }
    .card { border: 3px solid #ea580c; border-radius: 16px; padding: 24px; max-width: 420px; margin: 0 auto 30px auto; }
    .store-name { font-size: 16px; font-weight: 800; color: #ea580c; margin-bottom: 4px; }
    .title { font-size: 22px; font-weight: 900; margin: 8px 0; }
    .table-badge { display: inline-block; background: #000; color: #fff; font-size: 24px; font-weight: 900; padding: 6px 20px; border-radius: 999px; margin: 12px 0; }
    .qr-box { margin: 16px auto; width: 180px; height: 180px; }
    .instructions { font-size: 14px; font-weight: 700; line-height: 1.5; margin: 8px 0; }
    .step { font-size: 12px; color: #4b5563; margin-top: 6px; }
  </style>
</head>
<body>
  ${cardsHtml}
</body>
</html>`;
    printHtml(html);
  };

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '14px', borderBottom: '1px solid #e5e7eb', paddingBottom: '1rem', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '38px', height: '38px', borderRadius: '10px', backgroundColor: '#fff7ed', color: '#ea580c', display: 'grid', placeItems: 'center' }}>
            <UtensilsCrossed size={22} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.18rem', fontWeight: 800, margin: 0, color: '#111827' }}>
              Table Ordering & Dine-in System（店内・テーブル注文システム設定）
            </h3>
            <p style={{ margin: 0, fontSize: '0.84rem', color: '#6b7280' }}>
              お客様がテーブルのQRコードをスキャンして店内から直接スマートフォンで注文できるシステムです。
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          style={saveButtonStyle}
        >
          <CheckCircle2 size={16} />
          {saving ? '保存中…' : 'テーブル注文設定を保存'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        {/* Left Column: Form Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Operating Hours & Tax Rate */}
          <div style={cardStyle}>
            <h4 style={cardHeadingStyle}>
              <Sliders size={16} color="#ea580c" /> 営業時間・消費税率
            </h4>

            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>店内テーブル注文 受付時間帯</label>
              <input
                type="text"
                value={form.dineInHours}
                onChange={e => update({ dineInHours: e.target.value })}
                placeholder="11:00-15:00, 17:00-22:30"
                style={inputStyle}
              />
              <p style={helpTextStyle}>「開始-終了」をカンマで区切って入力（例: 11:00-15:00, 17:00-22:30）</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={labelStyle}>店内飲食 消費税率 (%)</label>
                <input
                  type="number"
                  min="0"
                  max="25"
                  value={form.dineInTaxRatePercent}
                  onChange={e => update({ dineInTaxRatePercent: Number(e.target.value) || 10 })}
                  style={inputStyle}
                />
                <p style={helpTextStyle}>店内飲食は標準税率10%（テイクアウトは8%軽減税率）</p>
              </div>

              <div>
                <label style={labelStyle}>テーブル番号プレフィックス</label>
                <input
                  type="text"
                  value={form.dineInTablePrefix}
                  onChange={e => update({ dineInTablePrefix: e.target.value })}
                  placeholder="テーブル "
                  style={inputStyle}
                />
                <p style={helpTextStyle}>例: 「テーブル 」「T-」など</p>
              </div>
            </div>
          </div>

          {/* Tables Management */}
          <div style={cardStyle}>
            <h4 style={cardHeadingStyle}>
              <Store size={16} color="#ea580c" /> 席数・テーブル番号リスト
            </h4>

            <div style={{ marginBottom: '12px' }}>
              <label style={labelStyle}>登録テーブル・座席名（カンマまたは改行区切り）</label>
              <textarea
                rows={3}
                value={form.dineInTableNames}
                onChange={e => update({ dineInTableNames: e.target.value })}
                placeholder="1, 2, 3, 4, 5, 6, 7, 8, 9, 10, カウンター1, カウンター2"
                style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }}
              />
              <p style={helpTextStyle}>
                現在登録席数: <strong>{parsedTables.length} 席</strong>（カンマで区切ると個別QRコードが生成されます）
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '4px' }}>
              <label style={checkboxLabelStyle}>
                <input
                  type="checkbox"
                  checked={form.dineInRequireTableNumber}
                  onChange={e => update({ dineInRequireTableNumber: e.target.checked })}
                  style={checkboxStyle}
                />
                <span>注文時にテーブル番号の選択・指定を必須にする</span>
              </label>

              <label style={checkboxLabelStyle}>
                <input
                  type="checkbox"
                  checked={form.dineInAllowPayAtRegister}
                  onChange={e => update({ dineInAllowPayAtRegister: e.target.checked })}
                  style={checkboxStyle}
                />
                <span>食後にレジカウンターでのお会計を許可する（現金・電子マネー対応）</span>
              </label>

              <label style={checkboxLabelStyle}>
                <input
                  type="checkbox"
                  checked={form.dineInAllowOnlinePay}
                  onChange={e => update({ dineInAllowOnlinePay: e.target.checked })}
                  style={checkboxStyle}
                />
                <span>スマートフォンからのオンライン事前決済（クレジット等）を許可する</span>
              </label>
            </div>
          </div>

          {/* Customer Note */}
          <div style={cardStyle}>
            <h4 style={cardHeadingStyle}>
              <Info size={16} color="#ea580c" /> お客様への案内メッセージ
            </h4>
            <textarea
              rows={2}
              value={form.dineInNoteJa}
              onChange={e => update({ dineInNoteJa: e.target.value })}
              style={{ ...inputStyle, resize: 'vertical' }}
              placeholder="テーブルのお席からご注文いただけます。お会計は食後にレジにてお願いいたします。"
            />
          </div>
        </div>

        {/* Right Column: Instant QR Generator & Stand Printing */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h4 style={{ ...cardHeadingStyle, margin: 0 }}>
              <QrCode size={18} color="#ea580c" /> テーブル用QRコード生成＆印刷
            </h4>
            <span style={{ fontSize: '0.78rem', color: '#ea580c', fontWeight: 800, backgroundColor: '#fff7ed', padding: '3px 8px', borderRadius: '6px' }}>
              各席設置用スタンド
            </span>
          </div>

          <p style={{ margin: '0 0 12px', fontSize: '0.82rem', color: '#6b7280', lineHeight: 1.5 }}>
            テーブルごとに専用QRコードを自動発行します。お客様がスキャンすると、該当店舗とテーブル番号が自動セットされた注文画面が開きます。
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
            <div>
              <label style={labelStyle}>対象店舗</label>
              <select
                value={previewStoreId}
                onChange={e => setPreviewStoreId(e.target.value)}
                style={inputStyle}
              >
                {stores.map(st => (
                  <option key={st.id} value={st.id}>
                    No.{st.number} {st.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>プレビュー座席</label>
              <select
                value={previewTable}
                onChange={e => setPreviewTable(e.target.value)}
                style={inputStyle}
              >
                {parsedTables.map(tNum => (
                  <option key={tNum} value={tNum}>
                    {form.dineInTablePrefix}{tNum} 番席
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* QR Code Stand Preview Card */}
          <div style={{ border: '2px dashed #ea580c', borderRadius: '14px', padding: '20px', textAlign: 'center', backgroundColor: '#fffdfb', marginBottom: '16px' }}>
            <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#ea580c' }}>
              本格インド料理 アダルサ {selectedStore.name}
            </div>
            <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#111827', margin: '4px 0' }}>
              お席からスマホでご注文
            </div>
            <div style={{ display: 'inline-block', backgroundColor: '#111827', color: '#fff', fontWeight: 900, fontSize: '1.05rem', padding: '4px 16px', borderRadius: '999px', margin: '8px 0' }}>
              {form.dineInTablePrefix}{previewTable} 番席
            </div>

            <div style={{ margin: '14px auto', width: '160px', height: '160px' }} dangerouslySetInnerHTML={{ __html: currentQrSvg }} />

            <div style={{ fontSize: '0.78rem', color: '#4b5563', lineHeight: 1.4, wordBreak: 'break-all' }}>
              <code>{currentPreviewUrl}</code>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button
              type="button"
              onClick={() => handlePrintSingleTableQr(previewTable)}
              style={printSingleButtonStyle}
            >
              <Printer size={16} />
              <span>「{form.dineInTablePrefix}{previewTable} 番席」のQRコードを印刷</span>
            </button>

            <button
              type="button"
              onClick={handleBatchPrintAllTables}
              style={printBatchButtonStyle}
            >
              <QrCode size={16} />
              <span>全テーブル（{parsedTables.length}席）のQRコードを一括印刷</span>
            </button>

            <a
              href={currentPreviewUrl}
              target="_blank"
              rel="noreferrer"
              style={previewLinkStyle}
            >
              <ExternalLink size={14} />
              <span>お客様のスマホ注文画面を別タブでテスト表示</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

const panelStyle: CSSProperties = {
  backgroundColor: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: '12px',
  padding: '20px',
  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
};

const cardStyle: CSSProperties = {
  backgroundColor: '#f9fafb',
  border: '1px solid #e5e7eb',
  borderRadius: '10px',
  padding: '16px',
};

const cardHeadingStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: '0.94rem',
  fontWeight: 700,
  margin: '0 0 12px',
  color: '#1f2937',
};

const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: '0.84rem',
  fontWeight: 700,
  color: '#374151',
  marginBottom: '5px',
};

const helpTextStyle: CSSProperties = {
  margin: '4px 0 0',
  fontSize: '0.76rem',
  color: '#6b7280',
};

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: '8px',
  border: '1px solid #d1d5db',
  backgroundColor: '#fff',
  fontSize: '0.88rem',
  fontWeight: 600,
  color: '#1f2937',
  boxSizing: 'border-box',
};

const checkboxLabelStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: '0.84rem',
  fontWeight: 600,
  color: '#374151',
  cursor: 'pointer',
};

const checkboxStyle: CSSProperties = {
  width: '16px',
  height: '16px',
  accentColor: '#ea580c',
  cursor: 'pointer',
};

const saveButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '9px 18px',
  backgroundColor: '#ea580c',
  color: '#fff',
  border: 'none',
  borderRadius: '8px',
  fontWeight: 700,
  fontSize: '0.88rem',
  cursor: 'pointer',
  boxShadow: '0 2px 6px rgba(234, 88, 12, 0.25)',
};

const printSingleButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  padding: '10px 14px',
  backgroundColor: '#fff',
  color: '#1f2937',
  border: '1.5px solid #d1d5db',
  borderRadius: '8px',
  fontWeight: 700,
  fontSize: '0.86rem',
  cursor: 'pointer',
};

const printBatchButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  padding: '10px 14px',
  backgroundColor: '#ea580c',
  color: '#fff',
  border: 'none',
  borderRadius: '8px',
  fontWeight: 700,
  fontSize: '0.86rem',
  cursor: 'pointer',
  boxShadow: '0 2px 6px rgba(234, 88, 12, 0.2)',
};

const previewLinkStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  padding: '8px 12px',
  color: '#2563eb',
  fontSize: '0.82rem',
  fontWeight: 700,
  textDecoration: 'none',
};
