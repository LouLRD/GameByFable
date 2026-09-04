/**
 * Carte d'une contradiction dans le dossier : résumé et bascule vers l'inspecteur, qui porte
 * l'explication complète. Mode compact : ouverture et épingle dans la barre au pouce.
 */
import { KindBadge, SeverityBadge } from '@/components/ui';
import type { ContradictionView, PlayerView } from '@/domain/selectors/playerView';
import { PinButton, SheetActions, SheetHeader, SheetSection } from './SheetParts';

export interface ContradictionCardProps {
  contradiction: ContradictionView;
  view: PlayerView;
  titleId: string;
  onOpenInspector: (id: string) => void;
  compact?: boolean;
}

export function ContradictionCard({
  contradiction,
  view,
  titleId,
  onOpenInspector,
  compact = false,
}: ContradictionCardProps): React.JSX.Element {
  const slots = contradiction.slotIds
    .map((id) => view.slots.find((s) => s.id === id)?.label ?? id)
    .filter((label, i, arr) => arr.indexOf(label) === i);
  return (
    <article className="casefile-sheet-content" aria-labelledby={titleId}>
      <SheetHeader kind="contradiction" title={contradiction.title} titleId={titleId}>
        <div className="casefile-badges">
          <SeverityBadge severity={contradiction.severity} />
          <KindBadge kind={contradiction.kind} />
          <span className="tag">
            {contradiction.involvesVersion ? 'implique la version' : 'entre déclarations'}
          </span>
        </div>
      </SheetHeader>

      <SheetSection title="Emplacements concernés">
        {slots.length === 0 ? (
          <p className="muted">
            Aucun emplacement du canevas : la contradiction oppose des éléments du dossier.
          </p>
        ) : (
          <ul className="casefile-bullets">
            {slots.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        )}
      </SheetSection>

      <p className="muted">
        L’explication pas à pas et les moyens de l’examiner se trouvent dans l’inspecteur.
      </p>
      <SheetActions compact={compact}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => onOpenInspector(contradiction.id)}
        >
          Ouvrir dans l’inspecteur
        </button>
        {compact && <PinButton id={contradiction.id} label={contradiction.title} />}
      </SheetActions>
    </article>
  );
}
