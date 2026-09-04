/**
 * Aide progressive (GDD §15) : après `hintAfterImpasses` actions refusées, une « Piste » désigne la
 * première contradiction bloquante et les pièces qu'elle suggère — jamais la solution.
 * Désactivable dans Options ; « Masquer » remet le compteur d'impasses à zéro.
 */
import { useId } from 'react';
import type { PlayerView } from '@/domain/selectors/playerView';
import { useGameStore } from '@/state';
import './onboarding.css';

export function HintCallout({ view }: { view: PlayerView }): React.JSX.Element | null {
  const hintsEnabled = useGameStore((s) => s.prefs.hintsEnabled);
  const impasseCount = useGameStore((s) => s.impasseCount);
  const threshold = useGameStore((s) => s.scenario?.data.extension.hintAfterImpasses ?? 3);
  const titleId = useId();

  if (!hintsEnabled || impasseCount < threshold) return null;

  const blockingIds = new Set(view.version.blockingIds);
  const contradiction = view.contradictions.find((c) => blockingIds.has(c.id)) ?? view.contradictions.find((c) => c.involvesVersion) ?? null;
  const evidenceLabels = contradiction
    ? contradiction.suggestedEvidenceIds
        .map((id) => view.evidence.find((e) => e.id === id)?.label)
        .filter((label): label is string => typeof label === 'string')
    : [];

  return (
    <aside className="callout callout-hint anim-slide-up" aria-labelledby={titleId}>
      <p id={titleId} className="callout-kicker">
        Piste <span className="callout-target">· après {impasseCount} impasses</span>
      </p>
      {contradiction ? (
        <>
          <p className="callout-text">La version bute sur « {contradiction.title} ».</p>
          {evidenceLabels.length > 0 ? <p className="callout-text">Pièces à réexaminer : {evidenceLabels.join(', ')}.</p> : null}
        </>
      ) : (
        <p className="callout-text">Confrontez une déclaration avec la pièce qui la contredit.</p>
      )}
      <div className="callout-actions">
        {contradiction ? (
          <button
            type="button"
            className="btn"
            onClick={() => {
              const store = useGameStore.getState();
              store.select('contradiction', contradiction.id, { space: 'inspector' });
              store.announce(`Contradiction ouverte : ${contradiction.title}.`);
            }}
          >
            Voir la contradiction
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            const store = useGameStore.getState();
            store.resetImpasses();
            store.announce('Piste masquée.');
          }}
        >
          Masquer
        </button>
      </div>
      <p className="callout-foot muted">Désactivable dans Options, « Aide progressive ».</p>
    </aside>
  );
}
