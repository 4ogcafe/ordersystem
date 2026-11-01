import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { loadReviews, type ReviewsData } from '../lib/reviews';

// The restaurant's Google rating and latest reviews, refreshed on the server about once a month
// (Admin → Page Settings → Google reviews). Falls back to the score typed in the admin.

export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <span className="gr-stars" role="img" aria-label={`5つ星のうち${value.toFixed(1)}`}>
      {Array.from({ length: 5 }, (_, i) => {
        const fill = Math.max(0, Math.min(1, value - i));
        return (
          <span key={i} className="gr-star" style={{ width: size, height: size }}>
            <Star size={size} className="gr-star-bg" aria-hidden="true" />
            <span className="gr-star-fill" style={{ width: `${fill * 100}%` }}>
              <Star size={size} aria-hidden="true" />
            </span>
          </span>
        );
      })}
    </span>
  );
}

function ReviewCard({
  review,
  cardRef,
}: {
  review: ReviewsData['reviews'][number];
  cardRef?: React.Ref<HTMLElement>;
}) {
  const [expanded, setExpanded] = useState(false);
  const long = review.text.length > 140;
  const name = review.authorUrl ? (
    <a href={review.authorUrl} target="_blank" rel="noopener noreferrer">
      {review.authorName}
    </a>
  ) : (
    review.authorName
  );
  return (
    <article ref={cardRef} className="gr-card">
      <header>
        {review.authorPhoto ? (
          <img src={review.authorPhoto} alt="" width={40} height={40} referrerPolicy="no-referrer" loading="lazy" />
        ) : (
          <span className="gr-avatar" aria-hidden="true">
            {review.authorName.charAt(0)}
          </span>
        )}
        <div>
          <strong>{name}</strong>
          <span className="gr-meta">
            <Stars value={review.rating} size={13} /> {review.relativeTime}
          </span>
        </div>
      </header>
      <p className={expanded || !long ? undefined : 'is-clamped'}>{review.text}</p>
      {long && (
        <button type="button" className="gr-more" onClick={() => setExpanded(v => !v)} aria-expanded={expanded}>
          {expanded ? '閉じる' : 'もっと読む'}
        </button>
      )}
    </article>
  );
}

export default function GoogleReviews({ fallbackLink: _fallbackLink }: { fallbackLink?: string } = {}) {
  const [data, setData] = useState<ReviewsData | null | undefined>(undefined);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [cardStep, setCardStep] = useState(336);

  const cardRef = useRef<HTMLElement>(null);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    loadReviews().then(res => {
      setData(res);
      if (res?.reviews?.length) {
        setCurrentIndex(res.reviews.length);
      }
    });
  }, []);

  const reviews = useMemo(() => data?.reviews ?? [], [data?.reviews]);
  const total = reviews.length;

  // Measure card width + gap for responsive sliding on any device screen
  useEffect(() => {
    const measure = () => {
      if (cardRef.current) {
        setCardStep(cardRef.current.offsetWidth + 16);
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [reviews]);

  // Triple the reviews array for seamless infinite looping in both forward & backward directions
  const displayReviews = useMemo(() => {
    if (total <= 1) return reviews;
    return [...reviews, ...reviews, ...reviews];
  }, [reviews, total]);

  const next = useCallback(() => {
    if (total <= 1) return;
    setIsTransitioning(true);
    setCurrentIndex(prev => prev + 1);
  }, [total]);

  const prev = useCallback(() => {
    if (total <= 1) return;
    setIsTransitioning(true);
    setCurrentIndex(prev => prev - 1);
  }, [total]);

  const goTo = (targetIndex: number) => {
    if (total <= 1) return;
    const currentActive = ((currentIndex % total) + total) % total;
    const diff = targetIndex - currentActive;
    setIsTransitioning(true);
    setCurrentIndex(prev => prev + diff);
  };

  // Seamless jump when reaching clone boundaries
  const handleTransitionEnd = () => {
    if (total <= 1) return;
    if (currentIndex >= 2 * total) {
      setIsTransitioning(false);
      setCurrentIndex(total + (currentIndex % total));
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsTransitioning(true);
        });
      });
    } else if (currentIndex < total) {
      setIsTransitioning(false);
      setCurrentIndex(total + (((currentIndex % total) + total) % total));
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsTransitioning(true);
        });
      });
    }
  };

  // Auto-slide interval: 4 seconds per review
  useEffect(() => {
    if (total <= 1 || isPaused) return;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
      return;
    }

    const timer = setInterval(() => {
      next();
    }, 4000);

    return () => clearInterval(timer);
  }, [total, isPaused, next]);

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsPaused(true);
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    setIsPaused(false);
    if (touchStartX.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    if (deltaX < -40) {
      next();
    } else if (deltaX > 40) {
      prev();
    }
    touchStartX.current = null;
  };

  const activeIndex = total > 0 ? ((currentIndex % total) + total) % total : 0;

  return (
    <div className="section gr" style={{ backgroundColor: 'white' }}>
      <div className="centered" style={{ marginBottom: '2rem' }}>
        <div className="section-label">お客様の声</div>
        <h2 className="section-title">Google <em>Reviews</em></h2>
        <div className="divider"></div>
        {data?.rating ? (
          <div className="gr-summary">
            <span className="gr-score">{data.rating.toFixed(1)}</span>
            <span>
              <Stars value={data.rating} size={22} />
              {data.userRatingCount ? <span className="gr-count">{data.userRatingCount.toLocaleString('ja-JP')}件のレビュー</span> : null}
            </span>
          </div>
        ) : (
          <p className="section-sub">お客様の声はGoogleマップでご覧いただけます。</p>
        )}
      </div>

      {reviews.length > 0 && (
        <div
          className="gr-carousel"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onFocus={() => setIsPaused(true)}
          onBlur={() => setIsPaused(false)}
        >
          {total > 1 && (
            <button type="button" className="gr-nav is-prev" onClick={prev} aria-label="前のレビュー">
              <ChevronLeft size={22} />
            </button>
          )}

          <div style={{ overflow: 'hidden', padding: '10px 0 16px', margin: '0 auto', width: '100%' }}>
            <div
              style={{
                display: 'flex',
                gap: '16px',
                transform: `translateX(-${currentIndex * cardStep}px)`,
                transition: isTransitioning ? 'transform 0.6s cubic-bezier(0.25, 1, 0.5, 1)' : 'none',
                willChange: 'transform',
              }}
              onTransitionEnd={handleTransitionEnd}
            >
              {displayReviews.map((review, i) => (
                <ReviewCard
                  key={`${review.authorName}-${i}`}
                  review={review}
                  cardRef={i === 0 ? cardRef : undefined}
                />
              ))}
            </div>
          </div>

          {total > 1 && (
            <button type="button" className="gr-nav is-next" onClick={next} aria-label="次のレビュー">
              <ChevronRight size={22} />
            </button>
          )}

          {/* Dots Indicator: Shows current review out of all reviews */}
          {total > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '12px' }}>
              {reviews.map((_, i) => {
                const active = activeIndex === i;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => goTo(i)}
                    aria-label={`レビュー ${i + 1} / ${total}`}
                    style={{
                      width: active ? '24px' : '8px',
                      height: '8px',
                      borderRadius: '4px',
                      background: active ? 'var(--spice)' : '#e5dbcd',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      transition: 'all 0.3s ease',
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

