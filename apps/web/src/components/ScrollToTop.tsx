import { useEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * Starts every new page at the top. Without this the browser keeps the old scroll position, so a
 * link in the footer opens the next page already scrolled to its footer and seems to do nothing.
 * Back/forward (POP) keeps the browser's own position; links to an #anchor are left alone.
 */
export default function ScrollToTop() {
  const { key, hash } = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    if (navigationType === 'POP' || hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [key, hash, navigationType]);

  return null;
}
