/**
 * Applique les préférences d'affichage au document : `html[data-text-size]` (base.css) et
 * `html[data-reduced-motion]` (motion.css). En mode « système », l'attribut de mouvement est
 * retiré pour laisser la media query `prefers-reduced-motion` décider.
 */
import type { ReducedMotionPref, TextSizePref } from '@/state/types';

export interface DocumentPrefs {
  textSize: TextSizePref;
  reducedMotion: ReducedMotionPref;
}

export function applyDocumentPrefs(root: HTMLElement, prefs: DocumentPrefs): void {
  root.dataset.textSize = prefs.textSize;
  if (prefs.reducedMotion === 'system') {
    delete root.dataset.reducedMotion;
  } else {
    root.dataset.reducedMotion = prefs.reducedMotion === 'on' ? 'true' : 'false';
  }
}
