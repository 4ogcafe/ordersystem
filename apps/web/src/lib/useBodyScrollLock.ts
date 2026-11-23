import { useEffect } from 'react';

/**
 * Prevents the page behind a popup/modal from scrolling (including iOS Safari).
 * Nested locks are ref-counted so closing one modal does not unlock another.
 */
let lockCount = 0;
let savedScrollY = 0;
let savedBodyStyles: Partial<CSSStyleDeclaration> | null = null;
let savedHtmlOverflow = '';

function applyLock() {
  const { body, documentElement: html } = document;
  savedScrollY = window.scrollY || window.pageYOffset || 0;
  savedBodyStyles = {
    position: body.style.position,
    top: body.style.top,
    left: body.style.left,
    right: body.style.right,
    width: body.style.width,
    overflow: body.style.overflow,
  };
  savedHtmlOverflow = html.style.overflow;

  body.style.position = 'fixed';
  body.style.top = `-${savedScrollY}px`;
  body.style.left = '0';
  body.style.right = '0';
  body.style.width = '100%';
  body.style.overflow = 'hidden';
  html.style.overflow = 'hidden';
  body.classList.add('scroll-locked');
  html.classList.add('scroll-locked');
}

function releaseLock() {
  const { body, documentElement: html } = document;
  if (savedBodyStyles) {
    body.style.position = savedBodyStyles.position ?? '';
    body.style.top = savedBodyStyles.top ?? '';
    body.style.left = savedBodyStyles.left ?? '';
    body.style.right = savedBodyStyles.right ?? '';
    body.style.width = savedBodyStyles.width ?? '';
    body.style.overflow = savedBodyStyles.overflow ?? '';
  }
  html.style.overflow = savedHtmlOverflow;
  body.classList.remove('scroll-locked');
  html.classList.remove('scroll-locked');
  window.scrollTo(0, savedScrollY);
  savedBodyStyles = null;
}

export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;

    if (lockCount === 0) applyLock();
    lockCount += 1;

    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount === 0) releaseLock();
    };
  }, [locked]);
}
