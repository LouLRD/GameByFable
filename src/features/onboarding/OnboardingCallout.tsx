/**
 * Repère d'onboarding (GDD §11, Acte I) : bulle non bloquante ancrée près de l'espace visé par
 * `view.onboarding.focus`. « Compris » ferme l'étape (action journalisée), « Tout passer » ferme
 * toutes les étapes restantes, « Aller à l'espace » (petit écran) active l'espace concerné.
 */
import { useEffect, useId, useState } from 'react';
import type { OnboardingId } from '@/domain/model/ids';
import type { OnboardingStep } from '@/domain/model/scenario';
import { SPACE_LABELS } from '@/accessibility/useKeyboardShortcuts';
import { useGameStore } from '@/state';
import { focusToSpace } from './focusTarget';
import './onboarding.css';

/** Délai avant l'annonce aria-live, pour ne pas écraser l'annonce de l'action qui l'a déclenchée. */
export const ONBOARDING_ANNOUNCE_DELAY_MS = 1200;

export interface OnboardingCalloutProps {
  step: OnboardingStep;
  isDesktop: boolean;
}

export function OnboardingCallout({ step, isDesktop }: OnboardingCalloutProps): React.JSX.Element {
  const activeSpace = useGameStore((s) => s.activeSpace);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const textId = useId();
  const space = focusToSpace(step.focus);
  const spaceLabel = SPACE_LABELS[space];

  useEffect(() => {
    const id = window.setTimeout(() => useGameStore.getState().announce(`Repère : ${step.text}`), ONBOARDING_ANNOUNCE_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [step.id, step.text]);

  const dismiss = (ids: readonly OnboardingId[]): boolean => {
    const store = useGameStore.getState();
    for (const onboardingId of ids) {
      const result = store.dispatch({ type: 'dismiss-onboarding', onboardingId });
      if (!result.ok) {
        setError(result.error.message);
        return false;
      }
    }
    setError(null);
    return true;
  };

  const skipAll = () => {
    const store = useGameStore.getState();
    const dismissed = new Set<string>(store.game?.dismissedOnboardingIds ?? []);
    const remaining = (store.scenario?.data.onboarding ?? []).map((o) => o.id).filter((id) => !dismissed.has(id));
    if (dismiss(remaining)) useGameStore.getState().announce('Repères désactivés pour cette partie.');
  };

  const goToSpace = () => {
    const store = useGameStore.getState();
    store.setActiveSpace(space);
    if (step.focus === 'contradiction-inspector') store.setInspectorTab('contradictions');
    if (step.focus === 'version-board') store.setInspectorTab('version');
    store.announce(`Espace ${spaceLabel}.`);
  };

  return (
    <aside className="callout callout-onboarding anim-slide-up" data-focus-target={step.focus} aria-labelledby={titleId} aria-describedby={textId}>
      <p id={titleId} className="callout-kicker">
        Repère <span className="callout-target">· {spaceLabel}</span>
      </p>
      <p id={textId} className="callout-text">
        {step.text}
      </p>
      {error ? (
        <p role="alert" className="field-error">
          {error}
        </p>
      ) : null}
      <div className="callout-actions">
        <button type="button" className="btn btn-primary" onClick={() => dismiss([step.id])}>
          Compris
        </button>
        {!isDesktop && activeSpace !== space ? (
          <button type="button" className="btn" onClick={goToSpace}>
            Aller à l’espace {spaceLabel}
          </button>
        ) : null}
        <button type="button" className="btn btn-ghost" onClick={skipAll} title="Fermer tous les repères de cette partie">
          Tout passer
        </button>
      </div>
    </aside>
  );
}
