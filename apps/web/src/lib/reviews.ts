// The restaurant's Google rating and reviews (GET /api/v1/reviews), shared across the page.

export interface ReviewsData {
  source: 'google' | 'manual' | 'none';
  rating: number | null;
  userRatingCount: number | null;
  mapsUrl: string | null;
  writeReviewUrl: string | null;
  reviews: { authorName: string; authorUrl: string | null; authorPhoto: string | null; rating: number; text: string; relativeTime: string; reviewUrl: string | null }[];
  fetchedAt: string | null;
}

let shared: Promise<ReviewsData | null> | null = null;
/** Fetched once per page view and shared by every component that shows the rating. */
export function loadReviews(): Promise<ReviewsData | null> {
  shared ??= fetch('/api/v1/reviews')
    .then(res => (res.ok ? res.json() : null))
    .catch(() => null);
  return shared;
}

