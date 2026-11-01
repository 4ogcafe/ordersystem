/**
 * StoreLocator: "Use my location" button + postcode/address search + status message.
 *
 * Purely presentational: pass in the values returned by useNearestStore(). The message area is an
 * aria-live region so screen-reader users hear "最寄りの店舗を選択しました…" etc.
 */
import { useState, type CSSProperties, type FormEvent } from 'react';
import { Loader2, LocateFixed, Search } from 'lucide-react';
import type { NearestTone } from '../../lib/useNearestStore';

interface Props {
  busy: boolean;
  message: string;
  tone: NearestTone;
  onLocate: () => void;
  onSearch: (query: string) => void;
  /** Smaller layout for the cart drawer. */
  compact?: boolean;
  idPrefix?: string;
}

const TONE_STYLES: Record<NearestTone, CSSProperties> = {
  info: { backgroundColor: '#f3f4f6', borderColor: '#e5e7eb', color: '#374151' },
  success: { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0', color: '#065f46' },
  warning: { backgroundColor: '#fffbeb', borderColor: '#fde68a', color: '#92400e' },
  error: { backgroundColor: '#fef2f2', borderColor: '#fecaca', color: '#991b1b' },
};

export default function StoreLocator({ busy, message, tone, onLocate, onSearch, compact = false, idPrefix = 'store-locator' }: Props) {
  const [query, setQuery] = useState('');
  const fontSize = compact ? '0.78rem' : '0.84rem';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSearch(query);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? '6px' : '8px' }}>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'stretch' }}>
        <button
          type="button"
          onClick={onLocate}
          disabled={busy}
          aria-busy={busy}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: compact ? '6px 12px' : '8px 14px',
            borderRadius: '999px',
            border: '1.5px solid var(--spice)',
            backgroundColor: 'var(--spice)',
            color: '#fff',
            fontWeight: 700,
            fontSize,
            cursor: busy ? 'progress' : 'pointer',
            opacity: busy ? 0.75 : 1,
            whiteSpace: 'nowrap',
          }}
        >
          {busy ? <Loader2 size={15} aria-hidden="true" /> : <LocateFixed size={15} aria-hidden="true" />}
          {busy ? '確認中…' : '現在地から最寄り店舗を選ぶ'}
        </button>

        <form onSubmit={submit} role="search" aria-label="郵便番号・住所から店舗を探す" style={{ display: 'flex', gap: '6px', flex: '1 1 220px', minWidth: 0 }}>
          <label htmlFor={`${idPrefix}-query`} style={srOnly}>
            郵便番号または住所
          </label>
          <input
            id={`${idPrefix}-query`}
            type="text"
            inputMode="text"
            autoComplete="postal-code"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="郵便番号・住所（例：180-0022）"
            maxLength={200}
            style={{
              flex: 1,
              minWidth: 0,
              padding: compact ? '6px 10px' : '7px 12px',
              borderRadius: '999px',
              border: '1px solid #e5dbcd',
              fontSize,
            }}
          />
          <button
            type="submit"
            disabled={busy}
            aria-label="住所で最寄り店舗を検索"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: compact ? '6px 10px' : '7px 12px',
              borderRadius: '999px',
              border: '1.5px solid rgba(200,80,26,0.35)',
              backgroundColor: '#fff',
              color: 'var(--spice)',
              fontWeight: 700,
              fontSize,
              cursor: busy ? 'progress' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <Search size={14} aria-hidden="true" /> 検索
          </button>
        </form>
      </div>

      {/* Always rendered so the live region exists before the first message is announced. */}
      <p
        role="status"
        aria-live="polite"
        style={
          message
            ? { margin: 0, padding: compact ? '6px 10px' : '8px 12px', borderRadius: '10px', border: '1px solid', fontSize, lineHeight: 1.5, ...TONE_STYLES[tone] }
            : { margin: 0 }
        }
      >
        {message}
      </p>
    </div>
  );
}

const srOnly: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
};
