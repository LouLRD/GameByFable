/**
 * Tableau accessible « Version signée / Faits » : une ligne par emplacement, glyphe + libellé
 * pour l'accord, « resté dans l'ombre » quand le fait canonique n'a jamais été approché.
 */
import type { JSX } from 'react';

import type { EpilogueSlotView } from '@/domain/selectors/epilogue';

export interface TruthComparisonProps {
  slots: readonly EpilogueSlotView[];
}

export function TruthComparison({ slots }: TruthComparisonProps): JSX.Element {
  const matches = slots.filter((s) => s.matches).length;
  const total = slots.length;
  const sentence = `${matches} ${matches > 1 ? 'emplacements' : 'emplacement'} sur ${total} ${
    matches > 1 ? 'correspondent' : 'correspond'
  } aux faits.`;
  return (
    <div className="truth">
      <div className="truth-scroll">
        <table className="truth-table">
          <caption className="visually-hidden">
            Comparaison entre la version signée et les faits, emplacement par emplacement
          </caption>
          <thead>
            <tr>
              <th scope="col">Emplacement</th>
              <th scope="col">Version signée</th>
              <th scope="col">Faits</th>
              <th scope="col">Accord</th>
            </tr>
          </thead>
          <tbody>
            {slots.map((slot) => (
              <tr key={slot.slotId} data-matches={slot.matches ? 'true' : 'false'}>
                <th scope="row">{slot.slotLabel}</th>
                <td>
                  {slot.chosenLabel ?? <span className="muted">emplacement laissé vide</span>}
                </td>
                <td>
                  {slot.canonicalLabel ?? (
                    <span className="truth-shadow">
                      <span aria-hidden="true">◌ </span>resté dans l’ombre
                    </span>
                  )}
                </td>
                <td>
                  <span className="truth-mark" data-matches={slot.matches ? 'true' : 'false'}>
                    <span aria-hidden="true">{slot.matches ? '✓' : '✗'}</span>
                    <span>{slot.matches ? 'correspond' : 'diffère'}</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="truth-total">{sentence}</p>
    </div>
  );
}
