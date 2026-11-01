import { yen } from '../../lib/format';
import type { Quote } from './useOrderQuote';

/** Subtotal, discounts, consumption tax and the tax-included amount paid at pickup. */
export default function PriceSummary({ quote }: { quote: Quote }) {
  return (
    <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: '1fr auto', gap: '6px 12px', fontSize: '0.92rem' }}>
      <dt>小計</dt><dd style={dd}>{yen(quote.subtotal)}</dd>
      {quote.offerDiscount > 0 && (
        <>
          <dt>クーポン割引{quote.offer?.titleJa ? `（${quote.offer.titleJa}）` : ''}</dt>
          <dd style={{ ...dd, color: '#047857', fontWeight: 600 }}>−{yen(quote.offerDiscount)}</dd>
        </>
      )}
      {quote.reward && (
        <><dt>スタンプ特典「{quote.reward.titleJa}」</dt><dd style={{ ...dd, color: '#047857' }}>{quote.rewardDiscount > 0 ? `−${yen(quote.rewardDiscount)}` : 'お渡し時に適用'}</dd></>
      )}
      {quote.pointsDiscount > 0 && <><dt>ポイント利用（{quote.pointsUsed}pt）</dt><dd style={{ ...dd, color: '#047857' }}>−{yen(quote.pointsDiscount)}</dd></>}
      <dt>消費税 ({quote.taxRate}%)</dt><dd style={dd}>{yen(quote.tax)}</dd>
      {quote.deliveryFee > 0 && <><dt>配達料 (税込)</dt><dd style={dd}>{yen(quote.deliveryFee)}</dd></>}
      <dt style={{ fontWeight: 'bold', fontSize: '1.05rem', paddingTop: '6px', borderTop: '1px solid #eee' }}>お支払い金額 (税込)</dt>
      <dd style={{ ...dd, fontWeight: 'bold', fontSize: '1.15rem', color: 'var(--spice)', paddingTop: '6px', borderTop: '1px solid #eee' }}>{yen(quote.grandTotal)}</dd>
      {quote.pointsToEarn > 0 && <><dt>獲得予定ポイント</dt><dd style={{ ...dd, color: '#047857' }}>+{quote.pointsToEarn}pt</dd></>}
    </dl>
  );
}

const dd = { margin: 0, textAlign: 'right' as const };
