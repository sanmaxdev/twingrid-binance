import { useEffect } from 'react';

/**
 * Locks body scroll when `locked` is true.
 * Uses overflow: hidden on html element — simple and reliable.
 * Does NOT use position: fixed (which can break child fixed positioning).
 */
export function useScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;

    const html = document.documentElement;
    const originalOverflow = html.style.overflow;

    html.style.overflow = 'hidden';

    return () => {
      html.style.overflow = originalOverflow;
    };
  }, [locked]);
}
