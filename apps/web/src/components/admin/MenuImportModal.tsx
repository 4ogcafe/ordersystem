import { useMemo, useRef, useState, type CSSProperties, type DragEvent } from 'react';
import { toast } from 'react-hot-toast';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload, X } from 'lucide-react';
import { apiFetch, errorMessage } from '../../lib/api';

// ─── Column mapping ──────────────────────────────────────────────────────────
// Headers are matched case/space-insensitively, in English or Japanese.
type Field =
  | 'category' | 'subcategory' | 'nameJa' | 'nameEn' | 'price' | 'descriptionJa' | 'descriptionEn'
  | 'menuTypes' | 'spiceLevel' | 'allergens' | 'imageUrl' | 'sortOrder' | 'rating'
  | 'isVegetarian' | 'isVegan' | 'isHalal' | 'isGlutenFree' | 'isRecommended' | 'isSoldOut' | 'isOrderable' | 'isActive';

const HEADER_ALIASES: Record<Field, string[]> = {
  category: ['category', 'カテゴリ', 'カテゴリー', '分類'],
  subcategory: ['subcategory', 'サブカテゴリ', 'サブカテゴリー', '小分類'],
  nameJa: ['nameja', 'japanesename', '商品名', 'メニュー名', '料理名', '名前', '品名'],
  nameEn: ['nameen', 'name', 'englishname', '英語名', '商品名(英語)', '商品名（英語）'],
  price: ['price', '価格', '値段', '金額', '税込価格', '価格(税込)', '価格（税込）', '税抜価格', '価格(税抜)', '価格（税抜）'],
  descriptionJa: ['descriptionja', '説明', '説明文', '商品説明'],
  descriptionEn: ['descriptionen', 'description', '英語説明', '説明(英語)', '説明（英語）'],
  menuTypes: ['menutypes', 'menutype', 'メニュー種別', '種別', 'メニュータイプ'],
  spiceLevel: ['spicelevel', 'spice', '辛さ', '辛さレベル'],
  allergens: ['allergens', 'allergen', 'アレルゲン', 'アレルギー'],
  imageUrl: ['imageurl', 'image', '画像', '画像url'],
  sortOrder: ['sortorder', 'order', '並び順', '表示順'],
  rating: ['rating', '評価'],
  isVegetarian: ['vegetarian', 'isvegetarian', 'ベジタリアン'],
  isVegan: ['vegan', 'isvegan', 'ヴィーガン', 'ビーガン'],
  isHalal: ['halal', 'ishalal', 'ハラール'],
  isGlutenFree: ['glutenfree', 'isglutenfree', 'グルテンフリー'],
  isRecommended: ['recommended', 'isrecommended', 'おすすめ', 'オススメ'],
  isSoldOut: ['soldout', 'issoldout', '売り切れ', '品切れ'],
  isOrderable: ['orderable', 'isorderable', '注文可', '注文可能'],
  isActive: ['active', 'isactive', '表示', '公開'],
};

const BOOLEAN_FIELDS: Field[] = ['isVegetarian', 'isVegan', 'isHalal', 'isGlutenFree', 'isRecommended', 'isSoldOut', 'isOrderable', 'isActive'];
const TRUE_WORDS = ['true', 'yes', 'y', '1', '○', '◯', '〇', '✓', '✔', 'はい', 'あり', 'on'];
const FALSE_WORDS = ['false', 'no', 'n', '0', '×', '✕', 'いいえ', 'なし', 'off', '-'];

const normalizeHeader = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[\s_\-・]/g, '');
const ALIAS_LOOKUP = new Map<string, Field>();
for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [Field, string[]][]) {
  for (const alias of aliases) ALIAS_LOOKUP.set(normalizeHeader(alias), field);
}

const TEMPLATE_HEADERS = [
  '商品名',
  '英語名',
  '価格',
  '説明',
  '英語説明',
  'メニュー種別',
  '辛さ',
  'アレルゲン',
  'ベジタリアン',
  'ヴィーガン',
  'ハラール',
  'おすすめ',
  '売り切れ',
];

const TEMPLATE_ROWS = [
  ['バターチキンカレーセット', 'Butter Chicken Curry Set', '1100', 'ナン・ライス・サラダ・ドリンク付き', 'Served with naan, rice, salad and soft drink', 'LUNCH', '1', '乳|小麦', '', '', '', '○', ''],
  ['マトンカレーセット', 'Mutton Curry Set', '1250', 'じっくり煮込んだ羊肉の深いコク', 'Tender mutton cooked with authentic spices', 'LUNCH', '2', '乳', '', '', '○', '', ''],
  ['タンドリーチキン (2P)', 'Tandoori Chicken (2pcs)', '880', '特製スパイスと炭火でジューシーに', 'Charcoal-grilled chicken marinated with spices', 'GRAND|TAKEOUT', '2', '乳', '', '', '○', '○', ''],
  ['サグパニール', 'Saag Paneer', '1050', '自家製チーズとほうれん草の濃厚カレー', 'Spinach curry with homemade cottage cheese', 'GRAND|TAKEOUT', '1', '乳', '○', '', '', '', ''],
  ['チーズナン', 'Cheese Naan', '550', 'とろけるチーズがたっぷり', 'Stuffed with melted cheese', 'GRAND|TAKEOUT', '0', '乳|小麦', '○', '', '', '○', ''],
  ['マンゴーラッシー', 'Mango Lassi', '400', '濃厚なマンゴーピューレ入り自家製ラッシー', 'Homemade yogurt drink with rich mango puree', 'LUNCH|GRAND|TAKEOUT', '0', '乳', '○', '', '', '', ''],
];

const GUIDE_HEADERS = ['列名 (ヘッダー)', '必須 / 任意', '設定値・記入例', '備考'];
const GUIDE_ROWS = [
  ['商品名', '必須', 'バターチキンカレーセット', '日本語または店舗での表記名'],
  ['英語名', '任意 (推奨)', 'Butter Chicken Curry Set', '空欄の場合は商品名が自動入力されます'],
  ['価格', '必須', '1100 または ¥1,100', '半角数字（記号「¥」「,」「円」付きでも可）'],
  ['説明', '任意', 'ナン・ライス付き', 'メニューの説明文（日本語）'],
  ['英語説明', '任意', 'With naan and rice', 'メニューの説明文（英語）'],
  ['メニュー種別', '任意', 'LUNCH / TAKEOUT / GRAND', '複数指定は縦棒「|」やカンマで区切り可能（例: GRAND|TAKEOUT）'],
  ['辛さ', '任意', '0 〜 5 の数字', '0=なし / 1=甘口 / 2=普通 / 3=中辛 / 4=辛口 / 5=激辛'],
  ['アレルゲン', '任意', '乳|小麦 または 乳, 小麦', '特定原材料や品目を縦棒やカンマ区切りで入力'],
  ['ベジタリアン', '任意', '○ / 1 / true / はい', '該当する場合に記入（空欄は「いいえ」）'],
  ['ヴィーガン', '任意', '○ / 1 / true / はい', '該当する場合に記入'],
  ['ハラール', '任意', '○ / 1 / true / はい', '該当する場合に記入'],
  ['おすすめ', '任意', '○ / 1 / true / はい', 'おすすめバッジを表示する場合に記入'],
  ['売り切れ', '任意', '○ / 1 / true / はい', '売り切れ状態で登録する場合に記入'],
];

// ─── Types ───────────────────────────────────────────────────────────────────
interface ParsedRow {
  rowNumber: number;
  categoryPath: string[];
  payload: Record<string, unknown>;
  errors: string[];
}
interface ImportResult { created: number; updated: number; failed: number; errors: { row: number; message: string }[] }

// ─── Value parsing ───────────────────────────────────────────────────────────
const clean = (value: unknown) => String(value ?? '').normalize('NFKC').trim();

function parseBool(value: string): boolean | undefined | 'invalid' {
  const v = value.toLowerCase();
  if (!v) return undefined;
  if (TRUE_WORDS.includes(v)) return true;
  if (FALSE_WORDS.includes(v)) return false;
  return 'invalid';
}

function parseMenuTypes(value: string): string[] | 'invalid' {
  const out = new Set<string>();
  for (const part of value.split(/[,|、/\s]+/).map(p => p.trim().toLowerCase()).filter(Boolean)) {
    if (['lunch', 'ランチ'].includes(part)) out.add('LUNCH');
    else if (['takeout', 'take-out', 'テイクアウト', '持ち帰り', 'お持ち帰り'].includes(part)) out.add('TAKEOUT');
    else if (['grand', 'dinner', 'グランド', 'ディナー', 'グランドメニュー'].includes(part)) out.add('GRAND');
    else return 'invalid';
  }
  return [...out];
}

interface CategoryItem {
  id: string;
  nameEn: string;
  nameJa: string | null;
  parentId: string | null;
}

function toRows(
  matrix: string[][],
  selectedCategoryName: string
): { rows: ParsedRow[]; columns: Field[]; error?: string } {
  // Header = first row (within the first 10) where at least two columns are recognised.
  let headerIndex = -1;
  let columns: (Field | null)[] = [];
  for (let i = 0; i < Math.min(matrix.length, 10); i++) {
    const mapped = matrix[i].map(cell => ALIAS_LOOKUP.get(normalizeHeader(clean(cell))) ?? null);
    if (mapped.filter(Boolean).length >= 2) { headerIndex = i; columns = mapped; break; }
  }
  if (headerIndex === -1) return { rows: [], columns: [], error: 'ヘッダー行が見つかりません。テンプレートの列名（商品名・価格など）を使用してください。' };
  if (!columns.includes('nameJa') && !columns.includes('nameEn')) return { rows: [], columns: [], error: '「商品名」または「英語名」の列が必要です。' };
  if (!columns.includes('price')) return { rows: [], columns: [], error: '「価格」の列が必要です。' };

  const rows: ParsedRow[] = [];
  for (let i = headerIndex + 1; i < matrix.length; i++) {
    const cells: Partial<Record<Field, string>> = {};
    columns.forEach((field, c) => { if (field) cells[field] = clean(matrix[i][c]); });
    if (Object.values(cells).every(v => !v)) continue; // blank line

    const errors: string[] = [];
    const payload: Record<string, unknown> = {};

    const nameJa = cells.nameJa ?? '';
    const nameEn = cells.nameEn || nameJa;
    if (!nameEn) errors.push('商品名がありません');
    payload.nameEn = nameEn;
    if (nameJa) payload.nameJa = nameJa;

    const priceText = (cells.price ?? '').replace(/[¥￥,円\s]/g, '');
    const price = Number(priceText);
    if (!priceText || !Number.isFinite(price) || price < 0) errors.push('価格が不正です');
    else payload.price = Math.round(price);

    if (cells.descriptionJa) payload.descriptionJa = cells.descriptionJa;
    if (cells.descriptionEn) payload.descriptionEn = cells.descriptionEn;
    if (cells.imageUrl) payload.imageUrl = cells.imageUrl;

    if (cells.spiceLevel) {
      const level = Number(cells.spiceLevel);
      if (!Number.isInteger(level) || level < 0 || level > 5) errors.push('辛さは0〜5');
      else payload.spiceLevel = level;
    }
    if (cells.sortOrder) {
      const order = Number(cells.sortOrder);
      if (Number.isInteger(order) && order >= 0) payload.sortOrder = order;
    }
    if (cells.rating) {
      const rating = Number(cells.rating);
      if (Number.isFinite(rating) && rating >= 0 && rating <= 5) payload.rating = rating;
    }
    if (cells.menuTypes) {
      const types = parseMenuTypes(cells.menuTypes);
      if (types === 'invalid') errors.push('メニュー種別は LUNCH / TAKEOUT / GRAND');
      else payload.menuTypes = types;
    }
    if (cells.allergens) payload.allergens = cells.allergens.split(/[,|、/]+/).map(a => a.trim()).filter(Boolean);

    for (const field of BOOLEAN_FIELDS) {
      const raw = cells[field];
      if (raw === undefined) continue;
      const value = parseBool(raw);
      if (value === 'invalid') errors.push(`${field}: 「${raw}」を判別できません`);
      else if (value !== undefined) payload[field] = value;
    }

    // Always target the chosen category to ensure no new/extra categories get created
    const categoryPath = [selectedCategoryName];

    rows.push({ rowNumber: i + 1, categoryPath, payload, errors });
  }
  return { rows, columns: columns.filter((c): c is Field => Boolean(c)) };
}

/** CSV files from Japanese Excel are often Shift_JIS; fall back to it when UTF-8 fails. */
function decodeText(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^\uFEFF/, '');
  } catch {
    return new TextDecoder('shift_jis').decode(buffer);
  }
}

async function readMatrix(file: File): Promise<string[][]> {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const isText = /\.(csv|tsv|txt)$/i.test(file.name);
  const workbook = isText
    ? XLSX.read(decodeText(buffer), { type: 'string', raw: true })
    : XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '', raw: false, blankrows: false });
}

export async function downloadMenuTemplate(kind: 'xlsx' | 'csv', categoryName?: string) {
  const catLabel = categoryName ? categoryName.replace(/[\\/:*?"<>|]/g, '').trim() : '';
  const fileBaseName = catLabel ? `adarsha-menu-template-${catLabel.toLowerCase().replace(/\s+/g, '-')}` : 'adarsha-menu-sample-template';

  if (kind === 'csv') {
    const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const csv = [TEMPLATE_HEADERS, ...TEMPLATE_ROWS].map(r => r.map(escape).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `${fileBaseName}.csv` });
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
  const XLSX = await import('xlsx');
  const menuSheet = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, ...TEMPLATE_ROWS]);
  menuSheet['!cols'] = TEMPLATE_HEADERS.map((_, i) => ({ wch: [24, 26, 12, 32, 36, 18, 8, 14, 12, 10, 10, 10, 10][i] || 15 }));

  const guideRowsWithCat = [
    ...(categoryName ? [['取込先カテゴリ', '設定済', categoryName, 'この雛形から登録すると自動的にこのカテゴリに登録されます']] : []),
    ...GUIDE_ROWS,
  ];
  const guideSheet = XLSX.utils.aoa_to_sheet([GUIDE_HEADERS, ...guideRowsWithCat]);
  guideSheet['!cols'] = [{ wch: 18 }, { wch: 12 }, { wch: 38 }, { wch: 60 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, menuSheet, 'メニュー登録シート');
  XLSX.utils.book_append_sheet(workbook, guideSheet, '記入方法・項目説明');
  XLSX.writeFile(workbook, `${fileBaseName}.xlsx`);
}

// ─── Component ───────────────────────────────────────────────────────────────
const BATCH_SIZE = 50; // keeps each request well under the API's JSON body limit

export default function MenuImportModal({
  targetCategoryId,
  categories,
  onClose,
  onImported,
}: {
  targetCategoryId?: string | null;
  categories: CategoryItem[];
  onClose: () => void;
  onImported: () => void;
}) {
  const [selectedCatId, setSelectedCatId] = useState<string>(
    targetCategoryId || categories[0]?.id || ''
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileObject, setFileObject] = useState<File | null>(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [parseError, setParseError] = useState('');
  const [mode, setMode] = useState<'upsert' | 'create'>('upsert');
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const selectedCategory = useMemo(
    () => categories.find(c => c.id === selectedCatId) || categories[0],
    [categories, selectedCatId]
  );

  const categoryLabel = (cat: CategoryItem): string => {
    const parent = cat.parentId ? categories.find(p => p.id === cat.parentId) : null;
    return parent ? `${parent.nameEn} › ${cat.nameEn}` : cat.nameEn;
  };

  const selectedCategoryDisplayName = useMemo(
    () => (selectedCategory ? categoryLabel(selectedCategory) : '未選択'),
    [selectedCategory, categories]
  );

  const validRows = useMemo(() => rows.filter(r => r.errors.length === 0), [rows]);
  const invalidCount = rows.length - validRows.length;

  const handleFileWithCategory = async (file: File, catName: string) => {
    setResult(null);
    setParseError('');
    setRows([]);
    setFileName(file.name);
    setFileObject(file);
    if (!/\.(csv|tsv|txt|xlsx|xls|xlsm|ods)$/i.test(file.name)) {
      setParseError('CSV または Excel (.xlsx / .xls) ファイルを選択してください。');
      return;
    }
    try {
      const matrix = await readMatrix(file);
      const parsed = toRows(matrix, catName);
      if (parsed.error) setParseError(parsed.error);
      else if (parsed.rows.length === 0) setParseError('データ行がありません。');
      else setRows(parsed.rows);
    } catch (err) {
      setParseError(err instanceof Error ? `ファイルを読み込めませんでした: ${err.message}` : 'ファイルを読み込めませんでした。');
    }
  };

  const handleFile = (file: File) => {
    handleFileWithCategory(file, selectedCategory?.nameEn || selectedCategoryDisplayName);
  };

  const handleCategoryChange = (newCatId: string) => {
    setSelectedCatId(newCatId);
    const cat = categories.find(c => c.id === newCatId);
    const catName = cat ? cat.nameEn : '';
    if (fileObject) {
      handleFileWithCategory(fileObject, catName);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const runImport = async () => {
    if (validRows.length === 0 || !selectedCatId) return;
    const total: ImportResult = { created: 0, updated: 0, failed: 0, errors: [] };
    setProgress({ done: 0, total: validRows.length });
    try {
      for (let start = 0; start < validRows.length; start += BATCH_SIZE) {
        const batch = validRows.slice(start, start + BATCH_SIZE);
        const res = await apiFetch('/api/v1/menu/items/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode,
            targetCategoryId: selectedCatId,
            rows: batch.map(r => ({ ...r.payload, categoryPath: [selectedCategory?.nameEn || 'Default'] })),
            rowNumbers: batch.map(r => r.rowNumber),
          }),
        });
        if (!res.ok) throw new Error(await errorMessage(res, 'インポートに失敗しました。'));
        const data: ImportResult = await res.json();
        total.created += data.created;
        total.updated += data.updated;
        total.failed += data.failed;
        total.errors.push(...data.errors);
        setProgress({ done: Math.min(start + BATCH_SIZE, validRows.length), total: validRows.length });
      }
      setResult(total);
      toast.success(`インポート完了: 新規 ${total.created} 件 / 更新 ${total.updated} 件`);
      onImported();
    } catch (err) {
      setResult(total);
      toast.error(err instanceof Error ? err.message : 'インポートに失敗しました。');
      if (total.created || total.updated) onImported();
    } finally {
      setProgress(null);
    }
  };

  const busy = progress !== null;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="menu-import-title" style={overlay} onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div style={modal}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', padding: '1.25rem 1.5rem', borderBottom: '1px solid #e5e7eb' }}>
          <div>
            <h2 id="menu-import-title" style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileSpreadsheet size={20} color="#15803d" /> メニュー一括インポート
            </h2>
            <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: '0.85rem' }}>選択したカテゴリにメニューを一括登録・更新します。他の新規カテゴリは自動作成されません。</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" style={{ ...btn, padding: '0.4rem' }}><X size={18} /></button>
        </div>

        <div style={{ padding: '1.25rem 1.5rem', overflowY: 'auto', flex: 1 }}>
          {/* Target category selection */}
          <div style={{ background: '#fefce8', border: '1px solid #fef08a', borderRadius: '12px', padding: '12px 16px', marginBottom: '1.25rem' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.85rem', fontWeight: 600, color: '#854d0e' }}>
              <span>取込先カテゴリ (すべての商品は指定したこのカテゴリにインポートされます):</span>
              <select
                value={selectedCatId}
                onChange={e => handleCategoryChange(e.target.value)}
                style={{ padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #ca8a04', background: '#fff', fontSize: '0.9rem', color: '#1f2937', fontWeight: 600 }}
              >
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>
                    {categoryLabel(cat)}
                  </option>
                ))}
              </select>
            </label>
            <p style={{ margin: '6px 0 0', fontSize: '0.78rem', color: '#a16207' }}>
              ※ 意図しないカテゴリの自動作成を防ぐため、Excel/CSVの「カテゴリ」列に関わらず、選択された上記のカテゴリへ安全に取り込まれます。
            </p>
          </div>

          {/* Templates & Format Sample Download */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px 16px', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '10px' }}>
              <div>
                <strong style={{ fontSize: '0.92rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Download size={16} color="#15803d" /> インポート用サンプル雛形のダウンロード
                </strong>
                <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                  すぐに入力できるサンプルデータ入りの雛形ファイルです（現在選択中: <strong>{selectedCategoryDisplayName}</strong> 向け）。記入後にそのままアップロードできます。
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  id="menu-import-template-xlsx"
                  onClick={() => downloadMenuTemplate('xlsx', selectedCategoryDisplayName)}
                  style={{ ...btn, background: '#15803d', color: '#fff', border: 'none', padding: '0.55rem 1rem', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}
                >
                  <Download size={15} /> Excel雛形 (.xlsx)
                </button>
                <button
                  type="button"
                  id="menu-import-template-csv"
                  onClick={() => downloadMenuTemplate('csv', selectedCategoryDisplayName)}
                  style={{ ...btn, background: '#fff', color: '#0f172a', borderColor: '#cbd5e1', padding: '0.55rem 1rem' }}
                >
                  <Download size={15} /> CSV雛形 (.csv)
                </button>
              </div>
            </div>

            {/* Quick format guide summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '8px', paddingTop: '10px', borderTop: '1px dashed #cbd5e1', fontSize: '0.78rem', color: '#475569' }}>
              <div>
                <strong style={{ color: '#0f172a' }}>必須列:</strong> 「商品名」「価格」<br />
                <span style={{ color: '#64748b' }}>※ 英語名は空欄なら商品名が自動適用</span>
              </div>
              <div>
                <strong style={{ color: '#0f172a' }}>カテゴリ:</strong> 上記で選択したカテゴリ<br />
                <span style={{ color: '#64748b' }}>自動的に選択中カテゴリに統一登録</span>
              </div>
              <div>
                <strong style={{ color: '#0f172a' }}>種別 / フラグ:</strong> LUNCH / TAKEOUT / GRAND<br />
                <span style={{ color: '#64748b' }}>○ / 1 / true でおすすめ・売切等を指定可</span>
              </div>
            </div>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click(); }}
            style={{ border: `2px dashed ${dragging ? '#15803d' : '#d1d5db'}`, background: dragging ? '#f0fdf4' : '#f9fafb', borderRadius: '12px', padding: '1.75rem', textAlign: 'center', cursor: 'pointer', transition: 'all 0.15s' }}
          >
            <Upload size={28} color={dragging ? '#15803d' : '#9ca3af'} style={{ marginBottom: '6px' }} />
            <div style={{ fontWeight: 600, color: '#111827' }}>{fileName || 'ファイルをドラッグ＆ドロップ、またはクリックして選択'}</div>
            <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '4px' }}>.csv / .xlsx / .xls （UTF-8・Shift_JIS 対応、1行目はヘッダー）</div>
            <input ref={fileRef} id="menu-import-file" type="file" accept=".csv,.tsv,.txt,.xlsx,.xls,.xlsm,.ods" hidden onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
          </div>

          {parseError && (
            <div style={{ ...alertBox, background: '#fef2f2', borderColor: '#fecaca', color: '#991b1b' }}>
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} /> {parseError}
            </div>
          )}

          {/* Preview */}
          {rows.length > 0 && !result && (
            <>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', margin: '1rem 0 0.6rem' }}>
                <span style={pill('#ecfdf5', '#065f46')}>✓ {validRows.length} 件 取込可能</span>
                {invalidCount > 0 && <span style={pill('#fef2f2', '#991b1b')}>✕ {invalidCount} 件 エラー（スキップ）</span>}
                <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>取込先: <strong>{selectedCategoryDisplayName}</strong></span>
              </div>
              <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'auto', maxHeight: '320px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <thead style={{ position: 'sticky', top: 0, background: '#f9fafb' }}>
                    <tr>{['行', 'カテゴリ', '商品名', '英語名', '価格', '種別', '状態'].map(h => <th key={h} style={th}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.rowNumber} style={{ background: r.errors.length ? '#fef2f2' : undefined }}>
                        <td style={{ ...td, color: '#9ca3af' }}>{r.rowNumber}</td>
                        <td style={td}>{r.categoryPath.join(' › ')}</td>
                        <td style={{ ...td, fontWeight: 600 }}>{String(r.payload.nameJa ?? '')}</td>
                        <td style={td}>{String(r.payload.nameEn ?? '')}</td>
                        <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>{typeof r.payload.price === 'number' ? `¥${r.payload.price.toLocaleString()}` : '—'}</td>
                        <td style={td}>{Array.isArray(r.payload.menuTypes) ? (r.payload.menuTypes as string[]).join(', ') : ''}</td>
                        <td style={{ ...td, color: r.errors.length ? '#b91c1c' : '#15803d' }}>{r.errors.length ? r.errors.join(' / ') : 'OK'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <fieldset style={{ border: 'none', padding: 0, margin: '1rem 0 0', display: 'flex', gap: '1.25rem', flexWrap: 'wrap', fontSize: '0.85rem' }}>
                <legend style={{ fontWeight: 600, marginBottom: '6px', fontSize: '0.85rem' }}>同じ名前の商品が既にある場合</legend>
                <label style={radio}><input type="radio" name="import-mode" checked={mode === 'upsert'} onChange={() => setMode('upsert')} /> 上書き更新する（推奨）</label>
                <label style={radio}><input type="radio" name="import-mode" checked={mode === 'create'} onChange={() => setMode('create')} /> 常に新規追加する</label>
              </fieldset>
            </>
          )}

          {/* Result */}
          {result && (
            <div style={{ ...alertBox, background: result.failed ? '#fffbeb' : '#f0fdf4', borderColor: result.failed ? '#fde68a' : '#bbf7d0', color: '#111827', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}>
                <CheckCircle2 size={18} color="#15803d" /> 新規 {result.created} 件 ・ 更新 {result.updated} 件{result.failed ? ` ・ 失敗 ${result.failed} 件` : ''}
              </div>
              {result.errors.length > 0 && (
                <ul style={{ margin: '8px 0 0', paddingLeft: '1.2rem', fontSize: '0.8rem', color: '#92400e' }}>
                  {result.errors.slice(0, 20).map(e => <li key={`${e.row}-${e.message}`}>行 {e.row}: {e.message}</li>)}
                  {result.errors.length > 20 && <li>…他 {result.errors.length - 20} 件</li>}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px', padding: '1rem 1.5rem', borderTop: '1px solid #e5e7eb', background: '#fafafa', borderRadius: '0 0 14px 14px' }}>
          {progress && <span style={{ marginRight: 'auto', fontSize: '0.85rem', color: '#4b5563' }}>インポート中… {progress.done} / {progress.total}</span>}
          <button type="button" onClick={onClose} disabled={busy} style={btn}>{result ? '閉じる' : 'キャンセル'}</button>
          {!result && (
            <button type="button" id="menu-import-submit" onClick={runImport} disabled={busy || validRows.length === 0} style={{ ...btn, background: '#111827', color: '#fff', border: 'none', opacity: busy || validRows.length === 0 ? 0.5 : 1 }}>
              <Upload size={15} /> {validRows.length} 件をインポート
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const overlay: CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.45)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' };
const modal: CSSProperties = { background: '#fff', borderRadius: '14px', width: 'min(920px, 100%)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' };
const btn: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '0.5rem 0.9rem', border: '1px solid #d1d5db', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', color: '#111827' };
const alertBox: CSSProperties = { display: 'flex', gap: '8px', alignItems: 'flex-start', border: '1px solid', borderRadius: '10px', padding: '12px 14px', marginTop: '1rem', fontSize: '0.85rem' };
const th: CSSProperties = { textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #e5e7eb', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' };
const td: CSSProperties = { padding: '6px 10px', borderBottom: '1px solid #f3f4f6', verticalAlign: 'top' };
const radio: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' };
const pill = (bg: string, color: string): CSSProperties => ({ padding: '3px 10px', borderRadius: '9999px', fontSize: '0.78rem', fontWeight: 700, background: bg, color });
