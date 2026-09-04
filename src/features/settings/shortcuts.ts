/** Raccourcis clavier globaux (voir src/accessibility/useKeyboardShortcuts.ts). */
export interface Shortcut {
  keys: readonly string[];
  label: string;
}

export const SHORTCUTS: readonly Shortcut[] = [
  { keys: ['1'], label: 'Espace Plan' },
  { keys: ['2'], label: 'Espace Temps' },
  { keys: ['3'], label: 'Espace Dossier' },
  { keys: ['4'], label: 'Espace Version' },
  { keys: ['Espace'], label: 'Lecture / pause de la relecture' },
  { keys: ['←', '→'], label: 'Curseur temporel ± 1 seconde' },
  { keys: ['Maj + ←', 'Maj + →'], label: 'Curseur temporel ± 10 secondes' },
  { keys: ['Début', 'Fin'], label: 'Début / fin de la soirée' },
  { keys: ['?'], label: 'Ouvrir l’aide' },
  { keys: ['Échap'], label: 'Fermer un dialogue, quitter le mode focus' },
  { keys: ['Tab', 'Maj + Tab'], label: 'Naviguer entre les commandes' },
];
