/**
 * Détection du grand écran (≥ 1024 px, seuil de src/styles/layout.css) par `matchMedia`,
 * rafraîchie sur `change` et sur `resize`. Sans `matchMedia` (environnement de test), on
 * retombe sur `window.innerWidth`.
 */
import { useEffect, useState } from 'react';

export const DESKTOP_MIN_WIDTH = 1024;
export const DESKTOP_QUERY = `(min-width: ${DESKTOP_MIN_WIDTH}px)`;

export function isDesktopViewport(): boolean {
  if (typeof window === 'undefined') return true;
  if (typeof window.matchMedia === 'function') return window.matchMedia(DESKTOP_QUERY).matches;
  return window.innerWidth >= DESKTOP_MIN_WIDTH;
}

export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState<boolean>(isDesktopViewport);
  useEffect(() => {
    const update = () => setIsDesktop(isDesktopViewport());
    const mql = typeof window.matchMedia === 'function' ? window.matchMedia(DESKTOP_QUERY) : null;
    const listensToChange = mql !== null && typeof mql.addEventListener === 'function';
    if (mql && listensToChange) mql.addEventListener('change', update);
    window.addEventListener('resize', update);
    update();
    return () => {
      if (mql && listensToChange) mql.removeEventListener('change', update);
      window.removeEventListener('resize', update);
    };
  }, []);
  return isDesktop;
}
