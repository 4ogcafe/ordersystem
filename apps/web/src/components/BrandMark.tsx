import { useState, type CSSProperties, type ImgHTMLAttributes } from 'react';

/** Bundled first so QR / dine-in UI still shows the mark when /uploads is missing on the host. */
const LOGO_CANDIDATES = [
  '/brand/adarsha-logo.webp',
  '/uploads/adarsha-log.webp',
  '/brand/site-logo.webp',
  '/uploads/site-logo-01.webp',
  '/brand/adarsha-stamp-logo.svg',
] as const;

type BrandMarkProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'> & {
  alt?: string;
  size?: number;
  rounded?: boolean;
};

/**
 * Adarsha logo with resilient fallbacks (public/brand → uploads → stamp SVG).
 * Safe for QR dine-in where the marketing navbar is hidden.
 */
export default function BrandMark({
  alt = 'Adarsha',
  size = 44,
  rounded = true,
  style,
  className,
  ...rest
}: BrandMarkProps) {
  const [idx, setIdx] = useState(0);
  const src = LOGO_CANDIDATES[Math.min(idx, LOGO_CANDIDATES.length - 1)];

  const merged: CSSProperties = {
    width: size,
    height: size,
    objectFit: 'cover',
    borderRadius: rounded ? '50%' : 10,
    background: '#fff',
    display: 'block',
    ...style,
  };

  return (
    <img
      {...rest}
      src={src}
      alt={alt}
      className={className}
      style={merged}
      decoding="async"
      onError={() => {
        setIdx(prev => (prev + 1 < LOGO_CANDIDATES.length ? prev + 1 : prev));
      }}
    />
  );
}
