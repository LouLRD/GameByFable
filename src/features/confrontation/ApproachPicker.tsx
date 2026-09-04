/**
 * Choix de l'approche d'une confrontation (GDD §8) : trois cartes radio natives.
 * Clavier : Tab entre dans le groupe, flèches changent la carte, Espace la sélectionne.
 */
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
    intent: 'Vous reconnaissez d’abord ce que sa position a de difficile, puis vous posez la question.',
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

export interface ApproachPickerProps {
  value: Approach;
  onChange: (approach: Approach) => void;
  /** Nom du groupe radio (unique dans la page). */
  name: string;
  /** Numéro d'étape affiché devant la légende. */
  step?: number;
  disabled?: boolean;
}

export function ApproachPicker({
  value,
  onChange,
  name,
  step,
  disabled = false,
}: ApproachPickerProps): React.JSX.Element {
  return (
    <fieldset className="confrontation-step approach-picker" disabled={disabled}>
      <legend>
        {step !== undefined ? (
          <span className="confrontation-step-index" aria-hidden="true">
            {step}
          </span>
        ) : null}
        Approche
      </legend>
      <p className="field-hint approach-hint">
        L’approche choisie influence surtout la confiance et la précision de la réponse.
      </p>
      <div className="approach-grid">
        {APPROACHES.map((option) => (
          <label key={option.id} className="approach-card" data-approach={option.id}>
            <input
              type="radio"
              name={name}
              value={option.id}
              checked={value === option.id}
              onChange={() => onChange(option.id)}
              disabled={disabled}
            />
            <span className="approach-card-title">
              <span className="approach-glyph" aria-hidden="true">
                {option.glyph}
              </span>
              {option.label}
            </span>
            <span className="approach-card-intent">{option.intent}</span>
            <span className="approach-card-reminder">{option.reminder}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
