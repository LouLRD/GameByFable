/**
 * Fiche d'un fait connu (établi ou rapporté) : lieu, intervalle, participants, relecture.
 * Mode compact : « Rejouer ce moment » et l'épingle dans la barre au pouce.
 */
import { DegreeBadge } from '@/components/ui';
import type { FactView, PlayerView } from '@/domain/selectors/playerView';
import { useGameStore } from '@/state';
import { isCompactViewport } from './casefileItems';
import { PinButton, SheetActions, SheetHeader, SheetSection } from './SheetParts';

export interface FactSheetProps {
  fact: FactView;
  view: PlayerView;
  zoneLabels: ReadonlyMap<string, string>;
  titleId: string;
  onNavigate: (kind: 'character', id: string) => void;
  compact?: boolean;
}

export function FactSheet({
  fact,
  view,
  zoneLabels,
  titleId,
  onNavigate,
  compact = false,
}: FactSheetProps): React.JSX.Element {
  const place = fact.zoneId ? (zoneLabels.get(fact.zoneId) ?? fact.zoneId) : null;
  const participants = fact.participantIds.map((id) => ({
    id,
    name: view.characters.find((c) => c.id === id)?.name ?? id,
  }));

  // Les actions du store sont stables : on les lit sans abonnement au moment du clic.
  const onReplay = (): void => {
    const store = useGameStore.getState();
    store.setCursor(fact.interval.start);
    store.select('fact', fact.id, isCompactViewport() ? { space: 'map' } : {});
    store.highlight([...(fact.zoneId ? [fact.zoneId] : []), ...fact.participantIds]);
    store.announce(`Relecture à ${view.clock(fact.interval.start)} : ${fact.label}.`);
  };

  return (
    <article className="casefile-sheet-content" aria-labelledby={titleId}>
      <SheetHeader kind="fact" title={fact.label} titleId={titleId}>
        <div className="casefile-badges">
          <DegreeBadge degree={fact.degree} />
        </div>
      </SheetHeader>

      <SheetSection title="Où et quand">
        <dl className="casefile-dl">
          <dt>Lieu</dt>
          <dd>{place ?? 'sans lieu précis'}</dd>
          <dt>Intervalle</dt>
          <dd className="mono">
            {view.clock(fact.interval.start)} – {view.clock(fact.interval.end)}
          </dd>
        </dl>
      </SheetSection>

      <SheetSection title="Participants">
        {participants.length === 0 ? (
          <p className="muted">Aucun participant identifié.</p>
        ) : (
          <ul className="casefile-inline-list">
            {participants.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="casefile-link"
                  onClick={() => onNavigate('character', p.id)}
                >
                  {p.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </SheetSection>

      <SheetSection title="Provenance">
        <p className="muted">
          {fact.degree === 'established'
            ? 'Établi par une pièce ou une confrontation : le fait tient sans témoignage.'
            : 'Rapporté par une déclaration : le fait tient tant que la parole tient.'}
        </p>
      </SheetSection>

      <SheetActions compact={compact}>
        <button type="button" className="btn btn-primary" onClick={onReplay}>
          Rejouer ce moment
        </button>
        {compact && <PinButton id={fact.id} label={fact.label} />}
      </SheetActions>
    </article>
  );
}
