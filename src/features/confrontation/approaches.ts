/** Les trois approches d'une confrontation (GDD §8) : libellés, intentions et rappels. */
import type { Approach } from '@/domain/model/scenario';

export interface ApproachOption {
  id: Approach;
  label: string;
  glyph: string;
  intent: string;
  reminder: string;
}

export const APPROACHES: readonly ApproachOption[] = [
  {
    id: 'neutral',
    label: 'Neutre',
    glyph: '—',
    intent: 'Vous posez la pièce sur la table et laissez la personne réagir.',
    reminder: 'Neutre : effet mesuré sur la confiance, réponse factuelle.',
  },
  {
    id: 'empathetic',
    label: 'Empathique',
    glyph: '◠',
    intent:
      'Vous reconnaissez d’abord ce que sa position a de difficile, puis vous posez la question.',
    reminder: 'Empathique : peut ouvrir la personne et obtenir une précision.',
  },
  {
    id: 'direct',
    label: 'Directe',
    glyph: '!',
    intent: 'Vous nommez la contradiction sans détour et attendez une réponse.',
    reminder: 'Directe : peut fermer la personne ; la réponse reste parfois gardée.',
  },
];

export const APPROACH_LABELS: Record<Approach, string> = {
  neutral: 'neutre',
  empathetic: 'empathique',
  direct: 'directe',
};
