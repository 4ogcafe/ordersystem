import qrcode from 'qrcode-generator';
import { ADARSHA_BANNER_LOGO, ADARSHA_ICON_LOGO } from './receipt-logo';
import { resolveOrderStore, type OrderStoreSnapshot } from './stores';

export interface ReceiptLineOption {
  groupNameJa?: string;
  nameJa?: string;
  priceAdjust?: number;
}

export interface ReceiptOrderLine {
  itemId?: string;
  nameEn: string;
  nameJa?: string | null;
  quantity: number;
  unitPrice?: number;
  lineTotal?: number;
  options?: ReceiptLineOption[];
  doneAt?: string | null;
  store?: OrderStoreSnapshot | null;
}

export interface ReceiptAddress {
  postalCode?: string;
  prefecture?: string;
  city?: string;
  line1?: string;
  building?: string;
}

export interface ReceiptOrder {
  id?: string;
  number: number;
  token?: string;
  status?: string;
  customerName: string;
  phone?: string;
  note?: string | null;
  pickupAt: string | Date;
  createdAt?: string | Date;
  fulfillment?: 'PICKUP' | 'DELIVERY' | 'DINE_IN';
  deliveryAddress?: ReceiptAddress | null;
  store?: OrderStoreSnapshot | null;
  storeId?: string | null;
  storeName?: string | null;
  storeAddress?: string | null;
  storePhone?: string | null;
  items: ReceiptOrderLine[];
  subtotal?: number;
  offerTitle?: string | null;
  offerDiscount?: number;
  rewardTitle?: string | null;
  rewardDiscount?: number;
  rewardKind?: 'AMOUNT_OFF' | 'PERK' | null;
  reward?: { titleJa: string; kind: 'AMOUNT_OFF' | 'PERK' } | null;
  pointsUsed?: number;
  pointsDiscount?: number;
  taxRate?: number | null;
  tax?: number;
  deliveryFee?: number;
  total?: number;
  grandTotal?: number;
  isMember?: boolean;
  dietaryAlert?: string | null;
}

export interface ReceiptSettings {
  storeNameJa?: string;
  storeNameEn?: string;
  phone?: string;
  addressJa?: string;
  registrationNumber?: string;
  timezone?: string;
  googleMapsLink?: string;
  storeReviewLink?: string;
  customFooter?: string;
  paperWidth?: '80mm' | '58mm';
  autoCut?: boolean;
  documentTitle?: string;
  documentSubtitle?: string;
  isBillInvoice?: boolean;
}

export const DEFAULT_STORE_SETTINGS: Required<ReceiptSettings> = {
  storeNameJa: '本格インド料理 アダルサ',
  storeNameEn: 'Adarsha Indian & Asian Dining',
  phone: '03-6903-7598',
  addressJa: '〒114-0015 東京都北区中里１丁目７-6 1F',
  registrationNumber: 'T5030001123456',
  timezone: 'Asia/Tokyo',
  googleMapsLink: 'https://www.google.com/maps/search/?api=1&query=Adarsha',
  storeReviewLink: 'https://www.google.com/maps/search/?api=1&query=Adarsha',
  customFooter: '毎度本格インド料理アダルサをご利用いただき、誠にありがとうございます。またのご来店・ご注文を心よりお待ちしております。',
  paperWidth: '80mm',
  autoCut: true,
  documentTitle: '領 収 書',
  documentSubtitle: '兼 ご注文明細控え (RECEIPT)',
  isBillInvoice: false,
};

const escapeHtml = (value: string | null | undefined): string =>
  (value ?? '').replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);

/**
 * Generates an ultra-crisp vector SVG QR code string.
 * Uses 0 external requests so it works offline and renders instantly on thermal printers.
 */
export function generateQrSvg(text: string, sizePx = 80): string {
  try {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const count = qr.getModuleCount();
    const quiet = 2;
    let d = '';
    for (let r = 0; r < count; r += 1) {
      for (let c = 0; c < count; c += 1) {
        if (qr.isDark(r, c)) {
          d += `M${c + quiet},${r + quiet}h1v1h-1z `;
        }
      }
    }
    const total = count + quiet * 2;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${sizePx}" height="${sizePx}" fill="#000" style="display:block;margin:0 auto;"><path d="${d}"/></svg>`;
  } catch (err) {
    console.warn('QR Code generation failed:', err);
    return '';
  }
}

/**
 * Resolves customer order tracking / review URL for QR code
 */
function resolveQrTargetUrl(order: ReceiptOrder, settings?: ReceiptSettings): string {
  if (order.token && typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/order/${order.token}`;
  }
  return settings?.storeReviewLink || settings?.googleMapsLink || DEFAULT_STORE_SETTINGS.storeReviewLink;
}

/**
 * Generates professional Japanese customer receipt / qualified invoice (適格請求書・領収書)
 * Optimized for 80mm / 58mm thermal printers (Epson TM-m30 / MUNBYN / Star / Brother).
 */
export function generateCustomerReceiptHtml(order: ReceiptOrder, customSettings?: ReceiptSettings): string {
  const resolvedBranch = resolveOrderStore(order);
  const cleanBranchName = resolvedBranch
    ? resolvedBranch.name.replace(/^(アダルサ|本格インド料理\s*アダルサ)\s*/, '')
    : '';
  const s = {
    ...DEFAULT_STORE_SETTINGS,
    ...customSettings,
    ...(resolvedBranch
      ? {
          storeNameJa: resolvedBranch.name.startsWith('本格インド料理')
            ? resolvedBranch.name
            : `本格インド料理 アダルサ ${cleanBranchName}`,
          storeNameEn: `Adarsha ${cleanBranchName} (No.${resolvedBranch.number})`,
          addressJa: resolvedBranch.address || customSettings?.addressJa || DEFAULT_STORE_SETTINGS.addressJa,
          phone: resolvedBranch.phone || customSettings?.phone || DEFAULT_STORE_SETTINGS.phone,
        }
      : {}),
  };
  const isBill = Boolean(customSettings?.isBillInvoice);
  const docTitle = customSettings?.documentTitle || (isBill ? 'お 会 計 伝 票' : '領 収 書');
  const docSubtitle = customSettings?.documentSubtitle || (isBill ? '兼 ご請求明細（Guest Check / Invoice）' : '兼 ご注文明細控え (RECEIPT)');
  const timeZone = s.timezone || 'Asia/Tokyo';

  const orderNumStr = String(order.number).padStart(3, '0');
  const now = new Date();
  const printedAt = now.toLocaleString('ja-JP', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  const dueTime = new Date(order.pickupAt).toLocaleString('ja-JP', {
    timeZone,
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  const isDelivery = order.fulfillment === 'DELIVERY';
  const fulfillmentTitle = isDelivery ? 'デリバリー（配達）' : 'テイクアウト（店頭受取）';
  const paymentMethod = isDelivery ? 'お届け時 現金決済' : '店頭受取時 現金決済';

  const address = order.deliveryAddress
    ? [
        order.deliveryAddress.postalCode && `〒${order.deliveryAddress.postalCode}`,
        order.deliveryAddress.prefecture,
        order.deliveryAddress.city,
        order.deliveryAddress.line1,
        order.deliveryAddress.building,
      ]
        .filter(Boolean)
        .join(' ')
    : '';

  // Items table
  const linesHtml = order.items
    .map((line) => {
      const unit = line.unitPrice ?? (line.lineTotal ? Math.round(line.lineTotal / line.quantity) : 0);
      const total = line.lineTotal ?? (unit * line.quantity);
      const opts = line.options && line.options.length > 0
        ? `<div class="item-opts">${line.options.map((o) => `· ${escapeHtml(o.groupNameJa || '')}: ${escapeHtml(o.nameJa || '')}`).join('<br>')}</div>`
        : '';

      return `
        <tr class="item-row">
          <td class="col-desc">
            <div class="item-name-ja">※ ${escapeHtml(line.nameJa || line.nameEn)}</div>
            ${line.nameJa && line.nameEn ? `<div class="item-name-en">${escapeHtml(line.nameEn)}</div>` : ''}
            ${opts}
          </td>
          <td class="col-qty">×${line.quantity}</td>
          <td class="col-price">¥${total.toLocaleString()}</td>
        </tr>
      `;
    })
    .join('');

  // Financials & Japanese Tax calculation (軽減税率 8% / 標準税率 10%)
  const itemsSubtotal = order.subtotal ?? order.items.reduce((sum, item) => sum + (item.lineTotal ?? 0), 0);
  const offerDiscount = order.offerDiscount ?? 0;
  const rewardDiscount = order.rewardDiscount ?? 0;
  const pointsDiscount = order.pointsDiscount ?? 0;
  const deliveryFee = order.deliveryFee ?? 0;

  // Food is subject to 8% reduced tax rate (軽減税率)
  const taxableFoodNet = Math.max(0, itemsSubtotal - offerDiscount - rewardDiscount - pointsDiscount);
  const foodTax = Math.round((taxableFoodNet * 8) / 108);

  // Delivery fee is subject to 10% standard tax rate
  const deliveryTax = deliveryFee > 0 ? Math.round((deliveryFee * 10) / 110) : 0;

  const grandTotal = order.grandTotal ?? (taxableFoodNet + deliveryFee);

  // QR Code
  const qrUrl = resolveQrTargetUrl(order, s);
  const qrSvg = generateQrSvg(qrUrl, 76);

  const paperWidthCss = s.paperWidth === '58mm' ? '50mm' : '72mm';
  const pageSizeCss = s.paperWidth === '58mm' ? '58mm auto' : '80mm auto';

  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <title>領収書・ご注文控え No.${orderNumStr}</title>
  <style>
    @page {
      size: ${pageSizeCss};
      margin: 3mm 4mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif;
      width: ${paperWidthCss};
      margin: 0 auto;
      padding: 0;
      color: #000;
      background: #fff;
      font-size: 12px;
      line-height: 1.4;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .bold { font-weight: 700; }
    .heavy { font-weight: 900; }

    /* Header Logo */
    .brand-header {
      text-align: center;
      margin-bottom: 6px;
    }
    .brand-logo {
      max-width: 155px;
      height: auto;
      max-height: 52px;
      margin: 0 auto 4px;
      display: block;
      object-fit: contain;
      filter: contrast(125%);
    }
    .store-name-ja {
      font-size: 15px;
      font-weight: 800;
      letter-spacing: 0.5px;
      margin: 2px 0 1px;
    }
    .store-name-en {
      font-size: 11px;
      font-weight: 600;
      color: #222;
      margin-bottom: 3px;
    }
    .store-meta {
      font-size: 11px;
      line-height: 1.35;
      color: #111;
    }
    .invoice-reg {
      display: inline-block;
      font-size: 11px;
      font-weight: 700;
      margin-top: 2px;
      letter-spacing: 0.5px;
    }

    /* Dividers */
    .divider-double {
      border-top: 2px solid #000;
      border-bottom: 1px solid #000;
      height: 3px;
      margin: 6px 0;
    }
    .divider-solid {
      border-top: 1px solid #000;
      margin: 6px 0;
    }
    .divider-dashed {
      border-top: 1px dashed #000;
      margin: 5px 0;
    }

    /* Receipt Badge & Order Number */
    .receipt-title-box {
      text-align: center;
      margin: 4px 0 2px;
    }
    .receipt-title {
      display: inline-block;
      font-size: 14px;
      font-weight: 900;
      letter-spacing: 2px;
      border: 1.5px solid #000;
      padding: 1px 12px;
    }
    .receipt-subtitle {
      font-size: 10px;
      color: #333;
      margin-top: 2px;
    }
    .order-number-box {
      text-align: center;
      border: 2px solid #000;
      padding: 4px 6px;
      margin: 6px 0;
      background: #fafafa;
    }
    .order-num-label {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 1px;
    }
    .order-number {
      font-size: 26px;
      font-weight: 900;
      line-height: 1.1;
      letter-spacing: -0.5px;
    }

    /* Order details card */
    .info-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11.5px;
      margin: 4px 0;
    }
    .info-table td {
      padding: 2px 0;
      vertical-align: top;
    }
    .info-label {
      width: 72px;
      font-weight: 700;
      white-space: nowrap;
    }

    /* Items table */
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin: 6px 0;
      font-size: 12px;
    }
    .items-table th {
      border-bottom: 1px solid #000;
      padding: 3px 0;
      font-size: 11px;
      font-weight: 700;
    }
    .item-row td {
      padding: 4px 0;
      border-bottom: 1px dashed #bbb;
      vertical-align: top;
    }
    .col-desc { text-align: left; }
    .col-qty { text-align: center; width: 34px; font-weight: 700; font-size: 13px; }
    .col-price { text-align: right; width: 62px; font-weight: 700; font-size: 12px; }
    .item-name-ja { font-weight: 700; font-size: 12.5px; line-height: 1.3; }
    .item-name-en { font-size: 10.5px; color: #444; }
    .item-opts { font-size: 11px; color: #333; margin-top: 1px; padding-left: 6px; }

    /* Summary calculations */
    .calc-row {
      display: flex;
      justify-content: space-between;
      font-size: 11.5px;
      padding: 1.5px 0;
    }

    /* Tax classification box */
    .tax-box {
      border: 1px solid #000;
      padding: 4px 6px;
      margin: 6px 0;
      font-size: 10.5px;
      line-height: 1.4;
      background: #fafafa;
    }

    /* Grand Total */
    .total-box {
      border-top: 2px solid #000;
      border-bottom: 2px solid #000;
      padding: 6px 0;
      margin: 6px 0 4px;
      display: flex;
      justify-content: space-between;
      align-items: baseline;
    }
    .total-label {
      font-size: 16px;
      font-weight: 900;
    }
    .total-amount {
      font-size: 22px;
      font-weight: 900;
      letter-spacing: -0.5px;
    }
    .payment-badge {
      font-size: 11px;
      text-align: right;
      font-weight: 700;
      margin-bottom: 6px;
    }

    /* QR Code and Footer */
    .qr-section {
      text-align: center;
      margin: 8px 0 4px;
      padding: 4px 0;
    }
    .qr-caption {
      font-size: 10px;
      font-weight: 700;
      margin-top: 3px;
      line-height: 1.3;
    }
    .footer-note {
      text-align: center;
      font-size: 10.5px;
      line-height: 1.45;
      margin: 6px 0 4px;
      color: #222;
    }
    .cut-line {
      text-align: center;
      font-size: 10px;
      color: #666;
      margin-top: 10px;
      letter-spacing: 2px;
    }
  </style>
</head>
<body>

  <!-- Brand Header with Logo -->
  <div class="brand-header">
    <img src="${ADARSHA_BANNER_LOGO}" alt="${escapeHtml(s.storeNameJa)}" class="brand-logo" />
    <div class="store-name-ja">${escapeHtml(s.storeNameJa)}</div>
    <div class="store-name-en">${escapeHtml(s.storeNameEn)}</div>
    <div class="store-meta">
      <div>${escapeHtml(s.addressJa)}</div>
      <div>TEL: ${escapeHtml(s.phone)}</div>
      <div class="invoice-reg">登録番号: ${escapeHtml(s.registrationNumber)}</div>
    </div>
  </div>

  <div class="divider-double"></div>

  <!-- Receipt Title Badge -->
  <div class="receipt-title-box">
    <div class="receipt-title">${escapeHtml(docTitle)}</div>
    <div class="receipt-subtitle">${escapeHtml(docSubtitle)}</div>
  </div>

  <!-- Order Reception Box -->
  <div class="order-number-box">
    <div class="order-num-label">受付番号</div>
    <div class="order-number">No. ${orderNumStr}</div>
  </div>

  <!-- Reception & Due Details -->
  <table class="info-table">
    <tr>
      <td class="info-label">発行日時:</td>
      <td>${escapeHtml(printedAt)}</td>
    </tr>
    <tr>
      <td class="info-label">お渡し予定:</td>
      <td><b style="font-size: 13px;">${escapeHtml(dueTime)}</b></td>
    </tr>
    <tr>
      <td class="info-label">受取方法:</td>
      <td><b>${escapeHtml(fulfillmentTitle)}</b></td>
    </tr>
    ${resolvedBranch ? `<tr><td class="info-label">ご利用店舗:</td><td><b>Adarsha ${escapeHtml(resolvedBranch.name)}</b></td></tr>` : ''}
    <tr>
      <td class="info-label">お客様名:</td>
      <td><b>${escapeHtml(order.customerName)} 様</b></td>
    </tr>
    ${order.phone ? `<tr><td class="info-label">お電話番号:</td><td>${escapeHtml(order.phone)}</td></tr>` : ''}
    ${address ? `<tr><td class="info-label">お届け先:</td><td>${escapeHtml(address)}</td></tr>` : ''}
    ${order.note ? `<tr><td class="info-label">お客様ご要望:</td><td><b>${escapeHtml(order.note)}</b></td></tr>` : ''}
  </table>

  <div class="divider-solid"></div>

  <!-- Items Table -->
  <table class="items-table">
    <thead>
      <tr>
        <th class="col-desc">商品名 / オプション</th>
        <th class="col-qty">数量</th>
        <th class="col-price">金額(税込)</th>
      </tr>
    </thead>
    <tbody>
      ${linesHtml}
    </tbody>
  </table>

  <div class="divider-solid"></div>

  <!-- Price Breakdown -->
  <div class="calc-row">
    <span>商品小計:</span>
    <span class="bold">¥${itemsSubtotal.toLocaleString()}</span>
  </div>

  ${offerDiscount > 0 ? `
    <div class="calc-row">
      <span>特典割引 (${escapeHtml(order.offerTitle || 'クーポン')}):</span>
      <span class="bold">-¥${offerDiscount.toLocaleString()}</span>
    </div>
  ` : ''}

  ${rewardDiscount > 0 ? `
    <div class="calc-row">
      <span>スタンプ特典 (${escapeHtml(order.rewardTitle || '来店特典')}):</span>
      <span class="bold">-¥${rewardDiscount.toLocaleString()}</span>
    </div>
  ` : ''}

  ${pointsDiscount > 0 ? `
    <div class="calc-row">
      <span>ポイント利用 (${order.pointsUsed ?? 0} pt):</span>
      <span class="bold">-¥${pointsDiscount.toLocaleString()}</span>
    </div>
  ` : ''}

  ${deliveryFee > 0 ? `
    <div class="calc-row">
      <span>配送料 (標準税率10%):</span>
      <span class="bold">¥${deliveryFee.toLocaleString()}</span>
    </div>
  ` : ''}

  <!-- Japanese Invoice Tax Classification -->
  <div class="tax-box">
    <div style="font-weight: 700; margin-bottom: 2px;">【 消費税等 内訳 】</div>
    <div class="calc-row">
      <span>※ 8% 軽減税率対象:</span>
      <span>¥${taxableFoodNet.toLocaleString()} (内税 ¥${foodTax.toLocaleString()})</span>
    </div>
    ${deliveryFee > 0 ? `
      <div class="calc-row">
        <span>　10% 標準税率対象:</span>
        <span>¥${deliveryFee.toLocaleString()} (内税 ¥${deliveryTax.toLocaleString()})</span>
      </div>
    ` : ''}
    <div style="font-size: 9.5px; color: #444; margin-top: 2px;">※ 印は軽減税率 (8%) 適用品目です</div>
  </div>

  <!-- Grand Total -->
  <div class="total-box">
    <span class="total-label">お支払い合計:</span>
    <span class="total-amount">¥${grandTotal.toLocaleString()}</span>
  </div>
  <div class="payment-badge">
    (税込・お支払い: ${escapeHtml(paymentMethod)})
  </div>

  <div class="divider-dashed"></div>

  <!-- QR Code Section -->
  <div class="qr-section">
    ${qrSvg}
    <div class="qr-caption">
      ▼ スマホで注文状況確認・レビュー投稿 ▼<br>
      <span style="font-size: 9px; font-weight: normal; word-break: break-all;">${escapeHtml(qrUrl)}</span>
    </div>
  </div>

  <!-- Hospitality Footer -->
  <div class="footer-note">
    ${escapeHtml(s.customFooter)}
  </div>

  <div class="cut-line">
    ✂ - - - - - - - - - - - - - - - - - - - - - - - - - - -
  </div>

</body>
</html>`;
}

/**
 * Generates a high-contrast Kitchen ticket (調理用キッチンスリップ伝票)
 * Optimized for chef readability from 1-2 meters.
 */
export function generateKitchenTicketHtml(order: ReceiptOrder, allergyLine?: string | null, customSettings?: ReceiptSettings): string {
  const resolvedBranch = resolveOrderStore(order);
  const s = { ...DEFAULT_STORE_SETTINGS, ...customSettings };
  const timeZone = s.timezone || 'Asia/Tokyo';
  const orderNumStr = String(order.number).padStart(3, '0');

  const dueTime = new Date(order.pickupAt).toLocaleString('ja-JP', {
    timeZone,
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  const isDelivery = order.fulfillment === 'DELIVERY';
  const fulfillmentBadge = isDelivery ? 'デリバリー 🛵 配達' : 'テイクアウト 🛍 お持ち帰り';

  const address = order.deliveryAddress
    ? [
        order.deliveryAddress.postalCode && `〒${order.deliveryAddress.postalCode}`,
        order.deliveryAddress.prefecture,
        order.deliveryAddress.city,
        order.deliveryAddress.line1,
        order.deliveryAddress.building,
      ]
        .filter(Boolean)
        .join(' ')
    : '';

  const linesHtml = order.items
    .map((line) => {
      const opts = line.options && line.options.length > 0
        ? `<div class="k-item-opts">${line.options.map((o) => `▶ ${escapeHtml(o.groupNameJa || '')}: <b>${escapeHtml(o.nameJa || '')}</b>`).join('<br>')}</div>`
        : '';

      return `
        <tr class="k-row">
          <td class="k-qty">${line.quantity}×</td>
          <td class="k-name">
            <div class="k-ja">${escapeHtml(line.nameJa || line.nameEn)}</div>
            ${line.nameJa && line.nameEn ? `<div class="k-en">${escapeHtml(line.nameEn)}</div>` : ''}
            ${opts}
          </td>
        </tr>
      `;
    })
    .join('');

  const totalAmount = order.grandTotal ?? order.total ?? null;
  const paperWidthCss = s.paperWidth === '58mm' ? '50mm' : '72mm';
  const pageSizeCss = s.paperWidth === '58mm' ? '58mm auto' : '80mm auto';

  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <title>KITCHEN SLIP #${orderNumStr}</title>
  <style>
    @page {
      size: ${pageSizeCss};
      margin: 3mm 4mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif;
      width: ${paperWidthCss};
      margin: 0 auto;
      color: #000;
      background: #fff;
      font-size: 13px;
      line-height: 1.35;
    }
    .k-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #000;
      padding-bottom: 4px;
      margin-bottom: 6px;
    }
    .k-logo {
      height: 32px;
      width: auto;
      filter: contrast(130%);
    }
    .k-title {
      font-size: 13px;
      font-weight: 900;
      letter-spacing: 1px;
    }
    .k-num-box {
      border: 3px solid #000;
      padding: 4px;
      text-align: center;
      margin: 6px 0;
    }
    .k-num {
      font-size: 34px;
      font-weight: 900;
      letter-spacing: -1px;
      line-height: 1;
    }
    .k-type {
      display: inline-block;
      font-size: 15px;
      font-weight: 900;
      background: #000;
      color: #fff;
      padding: 3px 10px;
      margin: 4px 0;
    }
    .k-due {
      font-size: 16px;
      font-weight: 900;
      margin: 4px 0;
    }
    .k-cust {
      font-size: 13px;
      margin: 2px 0;
    }
    .k-box {
      border: 2px solid #000;
      padding: 4px 6px;
      margin: 6px 0;
      font-weight: 700;
      font-size: 13px;
    }
    .k-box-alert {
      border: 3px solid #000;
      background: #eee;
      padding: 6px;
      margin: 6px 0;
      font-weight: 900;
      font-size: 14px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 8px 0;
    }
    .k-row td {
      padding: 6px 0;
      border-bottom: 1.5px dashed #000;
      vertical-align: top;
    }
    .k-qty {
      width: 44px;
      font-size: 22px;
      font-weight: 900;
      text-align: center;
      padding-right: 4px;
    }
    .k-ja {
      font-size: 15px;
      font-weight: 800;
      line-height: 1.25;
    }
    .k-en {
      font-size: 12px;
      color: #333;
    }
    .k-item-opts {
      font-size: 13px;
      margin-top: 3px;
      padding-left: 4px;
    }
    .k-footer {
      border-top: 2px solid #000;
      padding-top: 6px;
      margin-top: 8px;
      font-size: 11px;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="k-header">
    <img src="${ADARSHA_ICON_LOGO}" alt="Adarsha" class="k-logo" />
    <span class="k-title">【 調 理 伝 票 】</span>
    <span style="font-size: 11px; font-weight: 700;">KITCHEN</span>
  </div>

  <div class="k-num-box">
    <div style="font-size: 11px; font-weight: 700;">受付番号</div>
    <div class="k-num">#${orderNumStr}</div>
  </div>

  <div style="text-align: center;">
    <div class="k-type">${escapeHtml(fulfillmentBadge)}</div>
    ${resolvedBranch ? `<div style="font-size: 14px; font-weight: 900; margin-top: 2px;">【 店舗: Adarsha ${escapeHtml(resolvedBranch.name)} 】</div>` : ''}
  </div>

  <div class="k-due">⏰ お渡し予定: ${escapeHtml(dueTime)}</div>
  <div class="k-cust">👤 ${escapeHtml(order.customerName)} 様 · 📞 ${escapeHtml(order.phone || '')}</div>
  ${address ? `<div style="font-size: 12px; margin: 2px 0;">📍 ${escapeHtml(address)}</div>` : ''}

  ${allergyLine ? `<div class="k-box-alert">⚠️ アレルギー特記:<br>${escapeHtml(allergyLine)}</div>` : ''}
  ${order.dietaryAlert ? `<div class="k-box-alert">⚠️ アレルギー注意: ${escapeHtml(order.dietaryAlert)}</div>` : ''}
  ${(order.reward?.kind === 'PERK' || order.rewardKind === 'PERK') ? `<div class="k-box">🎁 特典サービス: ${escapeHtml(order.reward?.titleJa || order.rewardTitle || '')}</div>` : ''}
  ${order.note ? `<div class="k-box">📝 お客様ご要望:<br>${escapeHtml(order.note)}</div>` : ''}

  <table>
    <tbody>
      ${linesHtml}
    </tbody>
  </table>

  ${totalAmount !== null ? `<div style="font-size: 15px; font-weight: 900; text-align: right; border-top: 1px solid #000; padding-top: 4px;">お会計合計: ¥${totalAmount.toLocaleString()}</div>` : ''}

  <div class="k-footer">
    印字日時: ${new Date().toLocaleString('ja-JP', { timeZone })} · 本格インド料理 アダルサ
  </div>
</body>
</html>`;
}

/**
 * Universal printing helper.
 * First tries hidden iframe print (seamless, no new tabs, no popup blockers).
 * Falls back to popup window if iframe print is blocked by browser permissions.
 */
export function printHtml(html: string): boolean {
  try {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    iframe.style.opacity = '0';
    iframe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();

      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();

      setTimeout(() => {
        try {
          if (iframe.parentNode) document.body.removeChild(iframe);
        } catch {}
      }, 4000);
      return true;
    }
  } catch (err) {
    console.warn('Iframe print failed, falling back to window.open:', err);
  }

  try {
    const win = window.open('', '_blank', 'width=440,height=680');
    if (!win) return false;
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
    win.close();
    return true;
  } catch (err) {
    console.error('Print popup blocked or failed:', err);
    return false;
  }
}

/**
 * Convenience method: Prints customer receipt / qualified invoice
 */
export function printCustomerReceipt(order: ReceiptOrder, settings?: ReceiptSettings): boolean {
  const html = generateCustomerReceiptHtml(order, settings);
  return printHtml(html);
}

/**
 * Convenience method: Prints pre-checkout bill invoice / guest check (お会計伝票・請求書)
 */
export function printBillInvoice(order: ReceiptOrder, settings?: ReceiptSettings): boolean {
  const html = generateCustomerReceiptHtml(order, {
    ...settings,
    isBillInvoice: true,
    documentTitle: 'お 会 計 伝 票',
    documentSubtitle: '兼 ご請求明細（Guest Check / Invoice）',
  });
  return printHtml(html);
}

/**
 * Convenience method: Prints kitchen slip
 */
export function printKitchenTicket(order: ReceiptOrder, allergyLine?: string | null, settings?: ReceiptSettings): boolean {
  const html = generateKitchenTicketHtml(order, allergyLine, settings);
  return printHtml(html);
}

/**
 * Convenience method: Prints realistic test receipt formatted for MUNBYN / Epson TM-m30
 */
export function printTestTicket(settings?: ReceiptSettings): boolean {
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

  return printCustomerReceipt(sampleOrder, settings);
}
