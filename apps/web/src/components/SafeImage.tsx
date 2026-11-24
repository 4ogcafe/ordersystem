import { useState, type ImgHTMLAttributes, type ReactNode } from 'react';
import { assetUrl } from '../lib/api';

type SafeImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  /** Shown when `src` is missing (keeps layout without an empty src request). */
  fallback?: ReactNode;
};

/**
 * Never passes `src=""` — empty strings make the browser re-fetch the current page.
 * If a same-origin /uploads path 404s, retry once against the shared media host.
 */
export default function SafeImage({ src, fallback = null, alt = '', onError, ...rest }: SafeImageProps) {
  const initial = typeof src === 'string' ? src.trim() : '';
  const [url, setUrl] = useState(initial);
  const [failed, setFailed] = useState(false);

  if (!initial || failed) return <>{fallback}</>;

  return (
    <img
      src={url}
      alt={alt}
      {...rest}
      onError={(e) => {
        // Retry shared media host when local /uploads is missing (adarsha.jp → order.adarsha.jp).
        if (url.startsWith('/uploads/') || /^https?:\/\/(www\.)?adarsha\.jp\/uploads\//i.test(url)) {
          const shared = assetUrl(url);
          if (shared && shared !== url) {
            setUrl(shared);
            return;
          }
        }
        setFailed(true);
        onError?.(e);
      }}
    />
  );
}
