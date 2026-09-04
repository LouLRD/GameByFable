/**
 * Détection du grand écran (≥ 1024 px, seuil de src/styles/layout.css) par `matchMedia`,
 * rafraîchie sur `change` et sur `resize` via `useSyncExternalStore`. Sans `matchMedia`
 * (environnement de test), on retombe sur `window.innerWidth`.
 */
import { useSyncExternalStore } from 'react';

export const DESKTOP_MIN_WIDTH = 1024;
export const DESKTOP_QUERY = `(min-width: ${DESKTOP_MIN_WIDTH}px)`;

export function isDesktopViewport(): boolean {
  if (typeof window === 'undefined') return true;
  if (typeof window.matchMedia === 'function') return window.matchMedia(DESKTOP_QUERY).matches;
  return window.innerWidth >= DESKTOP_MIN_WIDTH;
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const mql = typeof window.matchMedia === 'function' ? window.matchMedia(DESKTOP_QUERY) : null;
  const canListen = mql !== null && typeof mql.addEventListener === 'function';
  if (mql && canListen) mql.addEventListener('change', onChange);
  window.addEventListener('resize', onChange);
  return () => {
    if (mql && canListen) mql.removeEventListener('change', onChange);
    window.removeEventListener('resize', onChange);
  };
}

const serverSnapshot = (): boolean => true;

export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, isDesktopViewport, serverSnapshot);
}
