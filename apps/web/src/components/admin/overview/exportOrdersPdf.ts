import { apiFetch, errorMessage } from '../../../lib/api';
import { formatOrderNumber, yen } from '../../../lib/format';
import { ADARSHA_STAMP_LOGO } from '../../../lib/adarsha-stamp-logo';
import { DEFAULT_STORE_SETTINGS, printHtml } from '../../../lib/receipt';

type TaxBucket = { count: number; exclusive: number; tax: number; inclusive: number };

export type OrdersExportPayload = {
  restaurantName: string;
  addressJa?: string;
  phone?: string;
  email?: string;
  timezone?: string;
  period: { range: string; days: string[]; start?: string; end?: string };
  summary: {
    totalOrders: number;
    completed: number;
    cancelled: number;
    sales: number;
    tax?: number;
    exclusive?: number;
    averageOrder: number;
    byType?: { pickup: number; delivery: number; dineIn: number };
    taxBuckets?: { rate8: TaxBucket; rate10: TaxBucket };
  };
  orders: Array<{
    number: number;
    status: string;
    fulfillment: string;
    createdAt: string;
    pickupAt: string;
    customerName: string;
    member: boolean;
    phone?: string | null;
    tableNumber?: string | null;
    items: string;
    itemCount?: number;
    subtotal?: number;
    offerDiscount?: number;
    rewardDiscount?: number;
    pointsDiscount?: number;
    tax?: number;
    taxRate?: number | null;
    deliveryFee?: number;
    paid: number;
  }>;
  generatedAt: string;
};

const STATUS_JA: Record<string, string> = {
  NEW: '受付',
  CONFIRMED: '調理中',
  READY: '準備完了',
  COMPLETED: '完了',
  CANCELLED: '取消',
};

const TYPE_JA: Record<string, string> = {
  PICKUP: '持帰',
  DELIVERY: '配達',
  DINE_IN: '店内',
  Pickup: '持帰',
  Delivery: '配達',
  'Dine-in': '店内',
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function periodLabel(days: string[]): string {
  if (!days.length) return '—';
  if (days.length === 1) return days[0].replace(/-/g, '/');
  return `${days[0].replace(/-/g, '/')}〜${days[days.length - 1].replace(/-/g, '/')}`;
}

function fmtDate(iso: string, tz: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function fmtTime(iso: string, tz: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

function resolveTaxRate(order: OrdersExportPayload['orders'][number]): 8 | 10 {
  if (order.taxRate === 8 || order.taxRate === 10) return order.taxRate;
  if (order.fulfillment === 'DINE_IN' || (order.deliveryFee ?? 0) > 0) return 10;
  return 8;
}

function taxParts(order: OrdersExportPayload['orders'][number]): { rate: 8 | 10; exclusive: number; tax: number; inclusive: number } {
  const rate = resolveTaxRate(order);
  const inclusive = order.paid;
  const tax =
    order.tax && order.tax > 0
      ? order.tax
      : Math.floor((inclusive * rate) / (100 + rate));
  return { rate, exclusive: Math.max(0, inclusive - tax), tax, inclusive };
}

function shortenItems(items: string, max = 28): string {
  const compact = (items || '').replace(/\s+/g, '');
  if (!compact) return '飲食代金';
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 1)}…`;
}

async function loadIssuer() {
  const settings = await apiFetch('/api/v1/settings')
    .then(r => (r.ok ? r.json() : null))
    .catch(() => null);
  return {
    name: String(settings?.name || DEFAULT_STORE_SETTINGS.storeNameJa),
    addressJa: String(settings?.addressJa || DEFAULT_STORE_SETTINGS.addressJa),
    phone: String(settings?.phone || DEFAULT_STORE_SETTINGS.phone),
    registrationNumber: String(
      settings?.registrationNumber
      || settings?.printerConfigs?.default?.registrationNumber
      || DEFAULT_STORE_SETTINGS.registrationNumber,
    ),
    /** Circular stamp logo (印鑑風) for formal Japanese documents. */
    logoUrl: ADARSHA_STAMP_LOGO,
  };
}

function buildOrdersPdfHtml(
  data: OrdersExportPayload,
  rangeLabel: string,
  issuer: {
    name: string;
    addressJa: string;
    phone: string;
    registrationNumber: string;
    logoUrl: string;
  },
): string {
  const tz = data.timezone || 'Asia/Tokyo';
  const period = periodLabel(data.period.days);
  const issuedAt = new Date(data.generatedAt || Date.now()).toLocaleString('ja-JP', {
    timeZone: tz,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const fileHint = data.period.days.length
    ? `uriage-meisai-${data.period.days[0]}_${data.period.days[data.period.days.length - 1]}`
    : 'uriage-meisai';

  const buckets = data.summary.taxBuckets ?? {
    rate8: { count: 0, exclusive: 0, tax: 0, inclusive: 0 },
    rate10: { count: 0, exclusive: 0, tax: 0, inclusive: 0 },
  };

  // Prefer completed-only rows for bookkeeping; still list cancelled with zero amounts marked.
  const rows = data.orders.length
    ? data.orders
        .map((order) => {
          const parts = taxParts(order);
          const cancelled = order.status === 'CANCELLED';
          const date = fmtDate(order.createdAt, tz);
          const time = fmtTime(order.createdAt, tz);
          const type = TYPE_JA[order.fulfillment] || order.fulfillment;
          const tableBit = order.tableNumber ? `卓${order.tableNumber}` : '';
          const desc = [type, tableBit, shortenItems(order.items)].filter(Boolean).join(' ');
          const party = `${order.customerName || '客'}${order.member ? '（会員）' : ''}`;
          return `<tr class="${cancelled ? 'cancel' : ''}">
            <td class="n">${escapeHtml(date)}<div class="t">${escapeHtml(time)}</div></td>
            <td class="c n">#${formatOrderNumber(order.number)}</td>
            <td>${escapeHtml(desc)}</td>
            <td>${escapeHtml(party)}</td>
            <td class="c">${parts.rate}%</td>
            <td class="n r">${cancelled ? '—' : escapeHtml(yen(parts.exclusive))}</td>
            <td class="n r">${cancelled ? '—' : escapeHtml(yen(parts.tax))}</td>
            <td class="n r paid">${cancelled ? '—' : escapeHtml(yen(parts.inclusive))}</td>
            <td class="c st">${escapeHtml(STATUS_JA[order.status] || order.status)}</td>
          </tr>`;
        })
        .join('')
    : `<tr><td colspan="9" class="empty">対象期間の取引はありません</td></tr>`;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<title>${fileHint}</title>
<style>
  @page { size: A4 portrait; margin: 12mm 10mm 14mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    color: #111;
    background: #fff;
    font: 9px/1.35 "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .letterhead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    margin: 0 0 6px;
    padding-bottom: 8px;
    border-bottom: 2.5px solid #1f1612;
  }
  .letterhead-left {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }
  .stamp-logo {
    flex: 0 0 auto;
    width: 72px;
    height: 72px;
    object-fit: contain;
    display: block;
    border-radius: 50%;
  }
  .letterhead-text { min-width: 0; }
  .letterhead-text .shop {
    margin: 0;
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 0.02em;
    color: #1f1612;
    line-height: 1.2;
  }
  .letterhead-text .meta {
    margin: 2px 0 0;
    font-size: 8px;
    color: #5c564f;
    line-height: 1.35;
  }
  .letterhead-text .reg {
    margin-top: 3px;
    font-size: 9px;
    font-weight: 800;
    color: #1f1612;
    letter-spacing: 0.04em;
  }
  .letterhead-right {
    text-align: right;
    flex: 0 0 auto;
  }
  .doc-title {
    margin: 0;
    font-size: 18px;
    font-weight: 900;
    letter-spacing: 0.28em;
    color: #1f1612;
    line-height: 1.1;
  }
  .doc-sub {
    margin: 3px 0 0;
    font-size: 8px;
    color: #6b635c;
  }
  .period-line {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    margin: 0 0 8px;
    padding: 5px 0 7px;
    border-bottom: 1px solid #d6d0c8;
    font-size: 8.5px;
    color: #333;
  }
  .period-line b { color: #111; }
  .tax-summary {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 8px;
  }
  .tax-summary th, .tax-summary td {
    border: 1px solid #222;
    padding: 4px 6px;
    font-size: 8.5px;
  }
  .tax-summary th {
    background: #f3f3f3;
    font-weight: 700;
    text-align: center;
  }
  .tax-summary td.n { text-align: right; font-variant-numeric: tabular-nums; font-weight: 700; }
  .tax-summary td.c { text-align: center; }
  .tax-summary .total { background: #fafafa; }
  table.detail {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  thead { display: table-header-group; }
  .detail th {
    border: 1px solid #222;
    background: #222;
    color: #fff;
    font-size: 8px;
    font-weight: 700;
    padding: 4px 4px;
    text-align: center;
  }
  .detail td {
    border: 1px solid #ccc;
    padding: 3px 4px;
    vertical-align: middle;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 8.5px;
  }
  .detail .n { font-variant-numeric: tabular-nums; }
  .detail .c { text-align: center; }
  .detail .r { text-align: right; }
  .detail .paid { font-weight: 800; }
  .detail .t { color: #666; font-size: 7.5px; }
  .detail tr.cancel td { color: #777; background: #fafafa; }
  .detail .st { font-weight: 700; }
  .empty { text-align: center; padding: 16px !important; white-space: normal !important; color: #666; }
  .notes {
    margin-top: 8px;
    font-size: 7.5px;
    color: #444;
    line-height: 1.5;
  }
  .notes strong { color: #111; }
  .foot {
    margin-top: 6px;
    padding-top: 4px;
    border-top: 1px solid #bbb;
    display: flex;
    justify-content: space-between;
    font-size: 7.5px;
    color: #666;
  }
</style>
</head>
<body>
  <header class="letterhead">
    <div class="letterhead-left">
      <img class="stamp-logo" src="${issuer.logoUrl}" alt="${escapeHtml(issuer.name)}" />
      <div class="letterhead-text">
        <p class="shop">${escapeHtml(issuer.name)}</p>
        <p class="meta">${escapeHtml(issuer.addressJa || data.addressJa || '')}<br />TEL ${escapeHtml(issuer.phone || data.phone || '')}</p>
        <div class="reg">登録番号 ${escapeHtml(issuer.registrationNumber)}</div>
      </div>
    </div>
    <div class="letterhead-right">
      <h1 class="doc-title">売上明細表</h1>
      <p class="doc-sub">適格請求書等保存方式・消費税区分集計</p>
    </div>
  </header>

  <div class="period-line">
    <span>対象期間：<b>${escapeHtml(period)}</b>（${escapeHtml(rangeLabel)}）</span>
    <span>作成：<b>${escapeHtml(issuedAt)}</b>　完了 ${data.summary.completed} / 取消 ${data.summary.cancelled} / 計 ${data.summary.totalOrders}件</span>
  </div>

  <table class="tax-summary">
    <thead>
      <tr>
        <th style="width:22%">税率区分</th>
        <th style="width:12%">件数</th>
        <th style="width:22%">税抜対価の額</th>
        <th style="width:22%">消費税額等</th>
        <th style="width:22%">税込金額</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="c">軽減税率 8% 対象</td>
        <td class="c">${buckets.rate8.count}</td>
        <td class="n">${escapeHtml(yen(buckets.rate8.exclusive))}</td>
        <td class="n">${escapeHtml(yen(buckets.rate8.tax))}</td>
        <td class="n">${escapeHtml(yen(buckets.rate8.inclusive))}</td>
      </tr>
      <tr>
        <td class="c">標準税率 10% 対象</td>
        <td class="c">${buckets.rate10.count}</td>
        <td class="n">${escapeHtml(yen(buckets.rate10.exclusive))}</td>
        <td class="n">${escapeHtml(yen(buckets.rate10.tax))}</td>
        <td class="n">${escapeHtml(yen(buckets.rate10.inclusive))}</td>
      </tr>
      <tr class="total">
        <td class="c"><strong>合計（完了取引）</strong></td>
        <td class="c"><strong>${buckets.rate8.count + buckets.rate10.count}</strong></td>
        <td class="n"><strong>${escapeHtml(yen(buckets.rate8.exclusive + buckets.rate10.exclusive))}</strong></td>
        <td class="n"><strong>${escapeHtml(yen(buckets.rate8.tax + buckets.rate10.tax))}</strong></td>
        <td class="n"><strong>${escapeHtml(yen(buckets.rate8.inclusive + buckets.rate10.inclusive))}</strong></td>
      </tr>
    </tbody>
  </table>

  <table class="detail">
    <thead>
      <tr>
        <th style="width:12%">取引年月日</th>
        <th style="width:7%">伝票No.</th>
        <th style="width:24%">取引内容</th>
        <th style="width:13%">相手方</th>
        <th style="width:6%">税率</th>
        <th style="width:10%">税抜</th>
        <th style="width:9%">税額</th>
        <th style="width:10%">税込</th>
        <th style="width:6%">状態</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="notes">
    <strong>【記載について】</strong>
    本表は国税庁「適格請求書等保存方式」および消費税の帳簿記載事項（課税資産の譲渡等の年月日・内容・相手方・対価の額・税率）に準拠した売上明細です。
    飲食料品の持帰り等は軽減税率8%、店内飲食・配達料等は標準税率10%として区分しています。取消取引は件数確認用に掲載し、集計金額には含めていません。
    登録番号は適格請求書発行事業者の登録番号です。税額は円未満切捨て。
  </div>
  <div class="foot">
    <span>${escapeHtml(issuer.name)}</span>
    <span>消費税申告・電子帳簿保存の補助資料としてご利用ください</span>
  </div>
</body>
</html>`;
}

function printReportHtml(html: string): boolean {
  try {
    const iframe = document.createElement('iframe');
    iframe.style.cssText =
      'position:fixed;right:0;bottom:0;width:794px;height:1123px;border:0;opacity:0;pointer-events:none;z-index:-1';
    iframe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(iframe);

    const frameWindow = iframe.contentWindow;
    const doc = frameWindow?.document;
    if (!doc || !frameWindow) {
      iframe.remove();
      return false;
    }

    doc.open();
    doc.write(html);
    doc.close();

    setTimeout(() => {
      try {
        frameWindow.focus();
        frameWindow.print();
      } finally {
        setTimeout(() => {
          try {
            iframe.remove();
          } catch {
            // ignore
          }
        }, 60_000);
      }
    }, 300);
    return true;
  } catch {
    return false;
  }
}

/** Japanese government-style sales ledger PDF (売上明細表 / tax-classified). */
export async function exportOrdersPdf(query: string, rangeLabel: string): Promise<void> {
  const [res, issuer] = await Promise.all([
    apiFetch(`/api/v1/dashboard/analytics/orders?${query}`),
    loadIssuer(),
  ]);
  if (!res.ok) throw new Error(await errorMessage(res, '注文データを取得できませんでした'));
  const data = (await res.json()) as OrdersExportPayload;
  if (data.restaurantName) issuer.name = data.restaurantName || issuer.name;
  if (data.addressJa) issuer.addressJa = data.addressJa || issuer.addressJa;
  if (data.phone) issuer.phone = data.phone || issuer.phone;

  const html = buildOrdersPdfHtml(data, rangeLabel, issuer);
  if (printReportHtml(html)) return;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (!win) {
    URL.revokeObjectURL(url);
    if (!printHtml(html)) {
      throw new Error('ポップアップがブロックされました。許可して再度お試しください。');
    }
    return;
  }
  setTimeout(() => {
    try {
      win.focus();
      win.print();
    } catch {
      // keep open
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }, 400);
}
