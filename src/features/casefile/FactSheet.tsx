/**
 * Fiche d'un fait connu (établi ou rapporté) : lieu, intervalle, participants, relecture.
 */
import { DegreeBadge } from '@/components/ui';
import type { FactView, PlayerView } from '@/domain/selectors/playerView';
import { useGameStore } from '@/state';
import { isCompactViewport } from './casefileItems';
import { SheetHeader, SheetSection } from './SheetParts';

export interface FactSheetProps {
  fact: FactView;
  view: PlayerView;
  zoneLabels: ReadonlyMap<string, string>;
  titleId: string;
  onNavigate: (kind: 'character', id: string) => void;
}

export function FactSheet({ fact, view, zoneLabels, titleId, onNavigate }: FactSheetProps): React.JSX.Element {
  const setCursor = useGameStore((s) => s.setCursor);
  const select = useGameStore((s) => s.select);
  const highlight = useGameStore((s) => s.highlight);
  const announce = useGameStore((s) => s.announce);
  const place = fact.zoneId ? (zoneLabels.get(fact.zoneId) ?? fact.zoneId) : null;
  const participants = fact.participantIds.map((id) => ({
    id,
    name: view.characters.find((c) => c.id === id)?.name ?? id,
  }));

  const onReplay = (): void => {
    setCursor(fact.interval.start);
    select('fact', fact.id, isCompactViewport() ? { space: 'map' } : {});
    highlight([...(fact.zoneId ? [fact.zoneId] : []), ...fact.participantIds]);
    announce(`Relecture à ${view.clock(fact.interval.start)} : ${fact.label}.`);
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
          <ul role="list" className="casefile-inline-list">
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

      <div className="casefile-actions">
        <button type="button" className="btn btn-primary" onClick={onReplay}>
          Rejouer ce moment
        </button>
      </div>
    </article>
  );
}
