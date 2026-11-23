import { useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Download, Upload, FileJson, FileText, UtensilsCrossed } from 'lucide-react';
import { apiFetch, errorMessage } from '../../../lib/api';
import { downloadMenuTemplate } from '../MenuImportModal';
import { exportOrdersPdf } from './exportOrdersPdf';

type Props = {
  ordersQuery: string;
  analyticsJson?: unknown;
  rangeLabel: string;
};

type ImportSections = {
  settings: boolean;
  pageExt: boolean;
  categories: boolean;
  menuItems: boolean;
  offers: boolean;
  carousels: boolean;
  secrets: boolean;
};

const DEFAULT_SECTIONS: ImportSections = {
  settings: true,
  pageExt: true,
  categories: false,
  menuItems: false,
  offers: false,
  carousels: false,
  secrets: false,
};

/**
 * Overview admin hub: export orders / analytics / full config, and import backups.
 */
export default function DataBackupPanel({ ordersQuery, analyticsJson, rangeLabel }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [sections, setSections] = useState<ImportSections>(DEFAULT_SECTIONS);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportFullBackup = async () => {
    setExporting(true);
    try {
      const res = await apiFetch('/api/v1/dashboard/export');
      if (!res.ok) {
        toast.error(await errorMessage(res, 'バックアップの出力に失敗しました'));
        return;
      }
      const data = await res.json();
      const day = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
      downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `adarsha-backup-${day}.json`);
      toast.success('設定・メニュー等のバックアップをダウンロードしました');
    } catch {
      toast.error('通信エラーが発生しました');
    } finally {
      setExporting(false);
    }
  };

  const exportAnalyticsJson = () => {
    if (!analyticsJson) {
      toast.error('分析データがまだありません');
      return;
    }
    const day = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
    downloadBlob(
      new Blob([JSON.stringify(analyticsJson, null, 2)], { type: 'application/json' }),
      `adarsha-analytics-${day}.json`,
    );
    toast.success(`${rangeLabel} の分析データをエクスポートしました`);
  };

  const runImport = async (file: File) => {
    setImporting(true);
    try {
      const text = await file.text();
      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch {
        toast.error('JSON ファイルを選択してください');
        return;
      }
      const data = parsed?.data && typeof parsed.data === 'object' ? parsed.data : parsed;
      if (!data || typeof data !== 'object') {
        toast.error('バックアップ形式が正しくありません');
        return;
      }
      if (!window.confirm('選択したセクションを上書きインポートします。よろしいですか？')) return;

      const res = await apiFetch('/api/v1/dashboard/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: parsed.version ?? 1,
          exportedAt: parsed.exportedAt,
          sections,
          data,
        }),
      });
      if (!res.ok) {
        toast.error(await errorMessage(res, 'インポートに失敗しました'));
        return;
      }
      const body = await res.json();
      toast.success(`インポート完了: ${JSON.stringify(body.imported || body)}`);
    } catch {
      toast.error('通信エラーが発生しました');
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <section className="ov-card" aria-labelledby="ov-backup">
      <div className="ov-card-head">
        <div>
          <h3 id="ov-backup"><FileJson size={16} /> Export / Import</h3>
          <div className="ov-muted ov-sub">注文CSV・分析JSON・店舗設定バックアップ。顧客・注文履歴は含めません。</div>
        </div>
      </div>

      <div className="ov-export-grid">
        <button
          type="button"
          className="ov-btn"
          disabled={exportingPdf}
          onClick={async () => {
            setExportingPdf(true);
            try {
              await exportOrdersPdf(ordersQuery, rangeLabel);
              toast.success('印刷ダイアログで「PDFに保存」を選んでください', { duration: 5000 });
            } catch (err: any) {
              toast.error(err?.message || 'PDFの出力に失敗しました');
            } finally {
              setExportingPdf(false);
            }
          }}
        >
          <FileText size={15} /> {exportingPdf ? 'Preparing PDF…' : `Orders PDF (${rangeLabel})`}
        </button>
        <button type="button" className="ov-btn" onClick={exportAnalyticsJson} disabled={!analyticsJson}>
          <Download size={15} /> Analytics JSON
        </button>
        <button type="button" className="ov-btn" onClick={exportFullBackup} disabled={exporting}>
          <Download size={15} /> {exporting ? 'Exporting…' : 'Full config backup'}
        </button>
        <button type="button" className="ov-btn" onClick={() => downloadMenuTemplate('xlsx')}>
          <UtensilsCrossed size={15} /> Menu template (XLSX)
        </button>
        <button type="button" className="ov-btn" onClick={() => downloadMenuTemplate('csv')}>
          <UtensilsCrossed size={15} /> Menu template (CSV)
        </button>
      </div>

      <div className="ov-import-box">
        <div className="ov-card-head" style={{ marginBottom: 8 }}>
          <h3><Upload size={16} /> Import backup</h3>
        </div>
        <div className="ov-import-sections">
          {(Object.keys(DEFAULT_SECTIONS) as (keyof ImportSections)[]).map(key => (
            <label key={key} className="ov-check">
              <input
                type="checkbox"
                checked={sections[key]}
                onChange={e => setSections(s => ({ ...s, [key]: e.target.checked }))}
              />
              {key}
            </label>
          ))}
        </div>
        <p className="ov-muted" style={{ margin: '8px 0' }}>
          初期状態では settings / pageExt のみ。メニュー・オファー等は明示チェック時に上書きされます。
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) void runImport(file);
          }}
        />
        <button
          type="button"
          className="ov-btn"
          disabled={importing}
          onClick={() => fileRef.current?.click()}
        >
          <Upload size={15} /> {importing ? 'Importing…' : 'Choose JSON backup…'}
        </button>
      </div>
    </section>
  );
}
