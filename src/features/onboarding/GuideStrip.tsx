/**
 * Guide mobile : bande ancrée au-dessus de la navigation (jamais superposée à sa cible).
 * Une seule étape à la fois ; « OK » la ferme (action journalisée), « Passer » ferme toutes les
 * étapes restantes ; « Y aller » active l'espace visé. Les étapes suivent les déclencheurs de
 * données du scénario (view.onboarding) : l'apprentissage arrive quand la fonction devient utile.
 */
import { useId } from 'react';
import type { OnboardingStep } from '@/domain/model/scenario';
import { SPACE_LABELS } from '@/accessibility/useKeyboardShortcuts';
import { useGameStore } from '@/state';
import { focusToSpace } from './focusTarget';
import './onboarding.css';

export function GuideStrip({ step }: { step: OnboardingStep }): React.JSX.Element {
  const activeSpace = useGameStore((s) => s.activeSpace);
  const titleId = useId();
  const space = focusToSpace(step.focus);
  const spaceLabel = SPACE_LABELS[space];
  const dismiss = (ids: readonly string[]) => {
    const store = useGameStore.getState();
    for (const id of ids) store.dispatch({ type: 'dismiss-onboarding', onboardingId: id as never });
  };
  const remaining = () =>
    (useGameStore.getState().scenario?.data.onboarding ?? [])
      .map((o) => o.id as string)
      .filter(
        (id) => !(useGameStore.getState().game?.dismissedOnboardingIds ?? []).includes(id as never),
      );
  return (
    <aside className="guide-strip" aria-labelledby={titleId} data-testid="guide-strip">
      <p id={titleId} className="guide-strip-kicker">
        <span aria-hidden="true">◆ </span>Repère · {spaceLabel}
      </p>
      <p className="guide-strip-text">{step.text}</p>
      <div className="guide-strip-actions">
        {activeSpace !== space ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              const store = useGameStore.getState();
              store.setActiveSpace(space);
              store.announce(`Espace ${spaceLabel}.`);
            }}
          >
            Y aller
          </button>
        ) : null}
        <button type="button" className="btn" onClick={() => dismiss([step.id])}>
          Compris
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          title="Fermer tous les repères de cette partie"
          onClick={() => dismiss(remaining())}
        >
          Tout passer
        </button>
      </div>
    </aside>
  );
}
