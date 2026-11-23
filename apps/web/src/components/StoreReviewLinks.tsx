import { isStoreReviewUrl, type StoreLocation } from '../lib/stores';

type Props = {
  store: Pick<StoreLocation, 'name' | 'hotpepperUrl' | 'tabelogUrl'>;
  /** compact = pill row under store details; stack = full-width buttons */
  layout?: 'compact' | 'stack';
};

/** Hot Pepper Gourmet mark (brand-colored icon for outbound links). */
function HotPepperIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="7" fill="#FF6B00" />
      <path
        fill="#fff"
        d="M17.2 6.2c-.4 1.6-1.6 2.7-3.1 3.1.9-.9 1.5-2.1 1.6-3.4.1-.4.6-.5.9-.2.4.2.6.7.6 1.1v-.6z"
      />
      <path
        fill="#fff"
        d="M22.1 14.6c-.7-3.4-3.5-5.6-6.5-5.6-2.1 0-4 .9-5.2 2.5-1.3 1.7-1.6 3.9-1 6 .8 2.8 2.4 5.3 3.9 7.1.4.5 1.1.6 1.6.3.4-.2.6-.6.6-1.1 0-.7-.1-1.6-.1-2.3 0-.4.1-.8.3-1.1.3-.5.9-.7 1.4-.5 2.1.7 4.2-.1 5.1-2 .7-1.4.6-3.1-.1-4.3z"
      />
    </svg>
  );
}

/** Tabelog mark (brand-colored icon for outbound links). */
function TabelogIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="7" fill="#E83428" />
      <path
        fill="#fff"
        d="M9.2 8.2h3.1c.4 0 .7.3.7.7v14.2c0 .4-.3.7-.7.7H9.2c-.4 0-.7-.3-.7-.7V8.9c0-.4.3-.7.7-.7zm10.4 0c2.9 0 5 1.9 5 5.1v.2c0 3.2-2.1 5.1-5 5.1h-1.8v4.5c0 .4-.3.7-.7.7h-2.4c-.4 0-.7-.3-.7-.7V8.9c0-.4.3-.7.7-.7h5zm-.2 3.1h-1.6v4.2h1.6c1.3 0 2.1-.8 2.1-2.1v-.1c0-1.2-.8-2-2.1-2z"
      />
    </svg>
  );
}

/**
 * Per-branch Hot Pepper / Tabelog links from Admin → Store Locations.
 * Renders nothing when neither URL is set.
 */
export default function StoreReviewLinks({ store, layout = 'compact' }: Props) {
  const hotpepper = isStoreReviewUrl(store.hotpepperUrl, 'hotpepper') ? store.hotpepperUrl!.trim() : '';
  const tabelog = isStoreReviewUrl(store.tabelogUrl, 'tabelog') ? store.tabelogUrl!.trim() : '';
  if (!hotpepper && !tabelog) return null;

  const isStack = layout === 'stack';
  const iconSize = isStack ? 22 : 18;

  return (
    <div
      className={isStack ? 'flex flex-col gap-2' : 'flex flex-wrap items-center gap-2'}
      aria-label={`${store.name}の口コミサイト`}
    >
      {hotpepper && (
        <a
          href={hotpepper}
          target="_blank"
          rel="noopener noreferrer"
          title="ホットペッパーグルメで見る"
          className={
            isStack
              ? 'inline-flex items-center justify-center gap-2.5 rounded-md border border-[#ff6b00]/25 bg-[#fff7f0] px-4 py-3 text-[0.9rem] font-bold text-[#c2410c] no-underline transition-colors hover:bg-[#ffedd5]'
              : 'inline-flex items-center gap-2 rounded-full border border-[#ff6b00]/30 bg-[#fff7f0] py-1.5 pr-3.5 pl-1.5 text-[0.78rem] font-bold text-[#c2410c] no-underline transition-colors hover:bg-[#ffedd5]'
          }
        >
          <HotPepperIcon size={iconSize} />
          <span>ホットペッパー</span>
        </a>
      )}
      {tabelog && (
        <a
          href={tabelog}
          target="_blank"
          rel="noopener noreferrer"
          title="食べログで見る"
          className={
            isStack
              ? 'inline-flex items-center justify-center gap-2.5 rounded-md border border-[#e83428]/25 bg-[#fff5f5] px-4 py-3 text-[0.9rem] font-bold text-[#b91c1c] no-underline transition-colors hover:bg-[#fee2e2]'
              : 'inline-flex items-center gap-2 rounded-full border border-[#e83428]/30 bg-[#fff5f5] py-1.5 pr-3.5 pl-1.5 text-[0.78rem] font-bold text-[#b91c1c] no-underline transition-colors hover:bg-[#fee2e2]'
          }
        >
          <TabelogIcon size={iconSize} />
          <span>食べログ</span>
        </a>
      )}
    </div>
  );
}
