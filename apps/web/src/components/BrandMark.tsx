import { useState, type CSSProperties, type ImgHTMLAttributes } from 'react';
import logoWebp from '../assets/brand/adarsha-logo.webp';
import logoSvg from '../assets/brand/adarsha-stamp-logo.svg?url';

/**
 * Bundled logo URLs (hashed into /assets/* on build) — always ship with the SPA,
 * even when the host is missing /uploads or /brand static files.
 */
const LOGO_CANDIDATES = [
  logoWebp,
  logoSvg,
  '/brand/adarsha-logo.webp',
  '/brand/adarsha-stamp-logo.svg',
  // Shared media host (same file for every branch / domain)
  'https://order.adarsha.jp/uploads/adarsha-log.webp',
  'https://order.adarsha.jp/uploads/site-logo-01.webp',
  '/uploads/adarsha-log.webp',
  '/uploads/site-logo-01.webp',
] as const;

type BrandMarkProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'> & {
  alt?: string;
  size?: number;
  rounded?: boolean;
};

/** Always-visible SVG seal when every image candidate fails (offline / broken CDN). */
function BrandSealSvg({ size, className, style }: { size: number; className?: string; style?: CSSProperties }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={className}
      style={style}
      role="img"
      aria-label="Adarsha"
    >
      <circle cx="100" cy="100" r="98" fill="#6b3f2a" />
      <circle cx="100" cy="100" r="92" fill="none" stroke="#fff" strokeWidth="2.2" />
      <circle cx="100" cy="100" r="88" fill="#6b3f2a" />
      <text
        x="100"
        y="78"
        textAnchor="middle"
        fill="#fff"
        fontSize="13"
        fontWeight="700"
        letterSpacing="3.5"
        fontFamily="Helvetica Neue, Helvetica, Arial, sans-serif"
      >
        ADARSHA
      </text>
      <line x1="30" y1="100" x2="48" y2="100" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      <line x1="152" y1="100" x2="170" y2="100" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      <text
        x="100"
        y="122"
        textAnchor="middle"
        fill="#fff"
        fontSize="26"
        fontWeight="900"
        fontFamily="'Hiragino Sans', 'Noto Sans JP', 'Yu Gothic', sans-serif"
      >
        アダルサ
      </text>
    </svg>
  );
}

/**
 * Adarsha logo for Navbar / Footer / QR UI.
 * Prefers Vite-bundled assets so mobile production never shows a broken-image icon.
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
  const exhausted = idx >= LOGO_CANDIDATES.length;
  const src = exhausted ? '' : LOGO_CANDIDATES[idx];

  const merged: CSSProperties = {
    width: size,
    height: size,
    objectFit: 'cover',
    borderRadius: rounded ? '50%' : 10,
    background: '#fff',
    display: 'block',
    flexShrink: 0,
    ...style,
  };

  if (exhausted) {
    return <BrandSealSvg size={size} className={className} style={merged} />;
  }

  return (
    <img
      {...rest}
      src={src}
      alt={alt}
      className={className}
      style={merged}
      width={size}
      height={size}
      decoding="async"
      fetchPriority="high"
      onError={() => setIdx(prev => prev + 1)}
    />
  );
}

/** Public path helpers for non-React contexts (index.html still needs a static href). */
export const BRAND_LOGO_PUBLIC = '/brand/adarsha-logo.webp';
export const BRAND_LOGO_SVG_PUBLIC = '/brand/adarsha-stamp-logo.svg';
