import type { SpaceId } from '@/state/types';

/** Espace du bureau visé par une étape d'onboarding ('confrontation' part des fiches du dossier). */
export function focusToSpace(focus: string): SpaceId {
  switch (focus) {
    case 'map':
      return 'map';
    case 'timeline':
      return 'timeline';
    case 'version-board':
    case 'contradiction-inspector':
      return 'inspector';
    default:
      return 'casefile';
  }
}
