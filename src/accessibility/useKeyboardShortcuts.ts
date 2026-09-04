/**
 * Raccourcis clavier globaux (GDD §15). Ignorés dans un champ de saisie et quand un dialogue
 * est ouvert (le composant Dialog gère lui-même Échap). Les flèches, Espace, Début et Fin ne
 * sont pas interceptés quand le focus est sur un composant interactif (bouton, curseur de
 * frise, poignée de redimensionnement…) afin de ne pas voler ses propres commandes.
 */
import { useEffect } from 'react';
import { useGameStore, type GameStoreApi } from '@/state/store';
import type { SpaceId } from '@/state/types';

export const SPACE_BY_DIGIT: Readonly<Record<string, SpaceId>> = {
  '1': 'map',
  '2': 'timeline',
  '3': 'casefile',
  '4': 'inspector',
};

export const SPACE_LABELS: Readonly<Record<SpaceId, string>> = {
  map: 'Plan',
  timeline: 'Temps',
  casefile: 'Dossier',
  inspector: 'Version',
};

const EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';
const INTERACTIVE_SELECTOR = [
  'button',
  'a[href]',
  'summary',
  '[role="button"]',
  '[role="slider"]',
  '[role="separator"]',
  '[role="tab"]',
  '[role="option"]',
  '[role="menuitem"]',
  '[role="radio"]',
  '[role="checkbox"]',
  '[role="switch"]',
  '[role="listbox"]',
  '[role="tree"]',
  '[role="grid"]',
  '[role="spinbutton"]',
].join(', ');

export function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(EDITABLE_SELECTOR) !== null;
}

export function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(INTERACTIVE_SELECTOR) !== null;
}

/** Applique un raccourci ; renvoie `true` si la touche a été consommée. */
export function handleShortcut(e: KeyboardEvent, store: GameStoreApi): boolean {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return false;
  if (isEditableTarget(e.target)) return false;
  const s = store.getState();

  if (e.key === 'Escape') {
    if (s.dialog) return false;
    if (s.focusPanel) {
      s.setFocusPanel(null);
      s.announce('Mode focus quitté : les quatre espaces sont visibles.');
      return true;
    }
    return false;
  }
  if (s.dialog) return false;

  if (e.key === '?') {
    s.openDialog('help');
    return true;
  }

  const space = SPACE_BY_DIGIT[e.key];
  if (space) {
    s.setActiveSpace(space);
    s.announce(`Espace ${SPACE_LABELS[space]}.`);
    if (typeof document !== 'undefined') {
      document.querySelector<HTMLElement>(`.space[data-space="${space}"]`)?.focus();
    }
    return true;
  }

  if (isInteractiveTarget(e.target)) return false;
  const duration = s.scenario?.data.scenario.timeline.durationSeconds ?? 0;
  switch (e.key) {
    case ' ':
    case 'Spacebar': {
      const next = !s.playing;
      s.setPlaying(next);
      s.announce(next ? 'Lecture de la relecture.' : 'Relecture en pause.');
      return true;
    }
    case 'ArrowLeft':
      s.nudgeCursor(e.shiftKey ? -10 : -1);
      return true;
    case 'ArrowRight':
      s.nudgeCursor(e.shiftKey ? 10 : 1);
      return true;
    case 'Home':
      s.setCursor(0);
      return true;
    case 'End':
      s.setCursor(duration);
      return true;
    default:
      return false;
  }
}

export interface KeyboardShortcutsOptions {
  /** Désactive l'écoute (ex. épilogue). */
  enabled?: boolean;
}

export function useKeyboardShortcuts({ enabled = true }: KeyboardShortcutsOptions = {}): void {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (handleShortcut(e, useGameStore)) e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [enabled]);
}
