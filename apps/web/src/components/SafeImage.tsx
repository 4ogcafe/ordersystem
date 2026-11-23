import type { ImgHTMLAttributes } from 'react';

type SafeImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  /** Shown when `src` is missing (keeps layout without an empty src request). */
  fallback?: React.ReactNode;
};

/**
 * Never passes `src=""` — empty strings make the browser re-fetch the current page.
 * Omit the image (or show `fallback`) when there is no usable URL.
 */
export default function SafeImage({ src, fallback = null, alt = '', ...rest }: SafeImageProps) {
  const url = typeof src === 'string' ? src.trim() : '';
  if (!url) return <>{fallback}</>;
  return <img src={url} alt={alt} {...rest} />;
}
