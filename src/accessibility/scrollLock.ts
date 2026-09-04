/**
 * Verrou du défilement d'arrière-plan pendant qu'une modale ou une feuille est ouverte.
 * Compteur de références : plusieurs couches peuvent verrouiller, le déverrouillage
 * n'intervient qu'à la fermeture de la dernière. Compense la barre de défilement pour éviter un saut.
 */
let locks = 0;
let previousOverflow = '';
let previousPaddingRight = '';

export function lockScroll(): () => void {
  if (typeof document === 'undefined') return () => undefined;
  const body = document.body;
  if (locks === 0) {
    previousOverflow = body.style.overflow;
    previousPaddingRight = body.style.paddingRight;
    const gap = window.innerWidth - document.documentElement.clientWidth;
    if (gap > 0) body.style.paddingRight = `${gap}px`;
    body.style.overflow = 'hidden';
    body.dataset.scrollLocked = 'true';
  }
  locks += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks = Math.max(0, locks - 1);
    if (locks === 0) {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPaddingRight;
      delete body.dataset.scrollLocked;
    }
  };
}

export const isScrollLocked = (): boolean => locks > 0;
