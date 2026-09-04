/**
 * Fiche d'une hypothèse formulable : résumé, emplacement du canevas, valeurs par défaut,
 * ajout à la version via le formulaire de claim.
 */
import { DegreeBadge } from '@/components/ui';
import type { HypothesisView, PlayerView } from '@/domain/selectors/playerView';
import { useGameStore } from '@/state';
import { SheetHeader, SheetSection } from './SheetParts';

export interface HypothesisSheetProps {
  hypothesis: HypothesisView;
  view: PlayerView;
  zoneLabels: ReadonlyMap<string, string>;
  titleId: string;
  onNavigate: (kind: 'character', id: string) => void;
}

export function HypothesisSheet({
  hypothesis,
  view,
  zoneLabels,
  titleId,
  onNavigate,
}: HypothesisSheetProps): React.JSX.Element {
  const slot = view.slots.find((s) => s.id === hypothesis.slotId);
  const current = view.version.claims[hypothesis.slotId];
  const placed = current?.hypothesisId === hypothesis.id;
  const actor = hypothesis.defaultActorId
    ? view.characters.find((c) => c.id === hypothesis.defaultActorId)
    : undefined;
  const zone = hypothesis.defaultZoneId
    ? (zoneLabels.get(hypothesis.defaultZoneId) ?? hypothesis.defaultZoneId)
    : null;
  const sealedHint = 'Le rapport est scellé : la version ne peut plus changer.';

  return (
    <article className="casefile-sheet-content" aria-labelledby={titleId}>
      <SheetHeader kind="hypothesis" title={hypothesis.label} titleId={titleId}>
        <div className="casefile-badges">
          <DegreeBadge degree="proposed" />
          {placed && <span className="badge badge-accent">dans la version</span>}
          {hypothesis.accusatory && <span className="tag">désigne une personne</span>}
          {hypothesis.requiresActor && <span className="tag">acteur à préciser</span>}
        </div>
      </SheetHeader>

      <p className="casefile-summary">{hypothesis.summary}</p>

      <SheetSection title="Emplacement">
        <p>
          <strong>{slot?.label ?? hypothesis.slotId}</strong>
        </p>
        {slot?.prompt && <p className="muted">{slot.prompt}</p>}
        {current && !placed && (
          <p className="field-hint">
            Cet emplacement contient déjà «{' '}
            {view.hypotheses.find((h) => h.id === current.hypothesisId)?.label ?? current.hypothesisId}{' '}
            » ; l’ajouter remplacera cette hypothèse.
          </p>
        )}
      </SheetSection>

      <SheetSection title="Valeurs par défaut">
        <dl className="casefile-dl">
          <dt>Acteur</dt>
          <dd>
            {actor ? (
              <button
                type="button"
                className="casefile-link"
                onClick={() => onNavigate('character', actor.id)}
              >
                {actor.name}
              </button>
            ) : hypothesis.requiresActor ? (
              'à préciser'
            ) : (
              'sans acteur'
            )}
          </dd>
          <dt>Lieu</dt>
          <dd>{zone ?? 'sans lieu'}</dd>
          <dt>Intervalle</dt>
          <dd className="mono">
            {hypothesis.defaultInterval
              ? `${view.clock(hypothesis.defaultInterval.start)} – ${view.clock(hypothesis.defaultInterval.end)}`
              : 'sans horaire'}
          </dd>
        </dl>
      </SheetSection>

      <div className="casefile-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={view.isSealed}
          title={view.isSealed ? sealedHint : undefined}
          onClick={() => useGameStore.getState().openClaimForm(hypothesis.slotId, hypothesis.id)}
        >
          {placed ? 'Modifier dans la version' : 'Ajouter à la version'}
        </button>
      </div>
      {view.isSealed && <p className="field-hint">{sealedHint}</p>}
    </article>
  );
}
