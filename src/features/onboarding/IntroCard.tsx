/**
 * Panneau de bienvenue affiché en tête du dossier à la première partie (`prefs.seenIntro`).
 * Non bloquant : une carte, pas un dialogue.
 */
import { useId } from 'react';
import type { PlayerView } from '@/domain/selectors/playerView';
import { useGameStore } from '@/state';
import './onboarding.css';

export function IntroCard({ view }: { view: PlayerView }): React.JSX.Element | null {
  const seenIntro = useGameStore((s) => s.prefs.seenIntro);
  const titleId = useId();
  if (seenIntro) return null;
  return (
    <section className="card intro-card anim-fade-in" aria-labelledby={titleId}>
      <p className="intro-kicker">
        {view.title} — {view.subtitle}
      </p>
      <h2 id={titleId}>Bienvenue dans le dossier</h2>
      <p className="intro-premise">{view.premise}</p>
      <ul className="intro-loop">
        <li>Observez les pièces et les déclarations : distinguez l’établi du rapporté.</li>
        <li>Formulez une version dans le canevas, puis rejouez la soirée sur le plan et la frise.</li>
        <li>Confrontez, révisez, et ne scellez le rapport que lorsque la version tient.</li>
      </ul>
      <p className="muted intro-note">Aucune limite de temps. Tout se joue au clavier comme à la souris ; la touche ? ouvre l’aide.</p>
      <div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            const store = useGameStore.getState();
            store.setPref('seenIntro', true);
            store.announce('Dossier ouvert. Les repères vous guident pour les premiers pas.');
          }}
        >
          Ouvrir le dossier
        </button>
      </div>
    </section>
  );
}
