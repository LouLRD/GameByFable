/**
 * Choix de l'approche d'une confrontation (GDD §8) : trois cartes radio natives.
 * Clavier : Tab entre dans le groupe, flèches changent la carte, Espace la sélectionne.
 */
import type { Approach } from '@/domain/model/scenario';
import { APPROACHES } from './approaches';

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
