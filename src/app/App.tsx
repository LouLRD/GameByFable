/**
 * Coquille applicative : amorçage du store, écrans de chargement et d'erreur de scénario,
 * garde-fou React, préférences d'affichage sur <html>, ambiance sonore, raccourcis globaux,
 * dialogues et régions d'annonce. L'épilogue remplace tout le bureau quand le rapport est scellé.
 */
import { useEffect } from 'react';
import { applyDocumentPrefs } from '@/accessibility/applyDocumentPrefs';
import { useKeyboardShortcuts } from '@/accessibility/useKeyboardShortcuts';
import { EpilogueScreen } from '@/features/conclusion/EpilogueScreen';
import { RoundTableDialog } from '@/features/conclusion/RoundTableDialog';
import { ConfrontationDialog } from '@/features/confrontation/ConfrontationDialog';
import { HelpDialog } from '@/features/settings/HelpDialog';
import { NewGameDialog } from '@/features/settings/NewGameDialog';
import { SavesDialog } from '@/features/settings/SavesDialog';
import { SettingsDialog } from '@/features/settings/SettingsDialog';
import { ClaimFormDialog } from '@/features/version-board/ClaimFormDialog';
import { useGameStore, usePlayerView } from '@/state';
import { AmbienceProvider, Subtitles } from './AmbienceProvider';
import { useAmbienceCues } from './ambienceContext';
import { ErrorBoundary } from './ErrorBoundary';
import { LiveRegion } from './LiveRegion';
import { ScenarioErrorScreen } from './ScenarioErrorScreen';
import { Toasts } from './Toasts';
import { Workbench } from './Workbench';
import './app.css';

export function App(): React.JSX.Element {
  const scenario = useGameStore((s) => s.scenario);
  const game = useGameStore((s) => s.game);
  const loadIssues = useGameStore((s) => s.loadIssues);
  const textSize = useGameStore((s) => s.prefs.textSize);
  const reducedMotion = useGameStore((s) => s.prefs.reducedMotion);

  useEffect(() => {
    const s = useGameStore.getState();
    if (!s.scenario && !s.loadIssues) s.bootstrap();
  }, []);

  useEffect(() => {
    applyDocumentPrefs(document.documentElement, { textSize, reducedMotion });
  }, [textSize, reducedMotion]);

  if (loadIssues) return <ScenarioErrorScreen issues={loadIssues} />;
  if (!scenario || !game) return <LoadingScreen />;

  return (
    <AmbienceProvider>
      <ErrorBoundary>
        <Desk />
        <SettingsDialog />
        <SavesDialog />
        <HelpDialog />
        <NewGameDialog />
        <ConfrontationDialog />
        <ClaimFormDialog />
        <RoundTableDialog />
      </ErrorBoundary>
      <LiveRegion />
      <Toasts />
      <Subtitles />
    </AmbienceProvider>
  );
}

/** Calcule la vue joueur une fois pour tout le bureau et reste monté pendant l'épilogue (cues). */
function Desk(): React.JSX.Element {
  const view = usePlayerView();
  useAmbienceCues(view);
  useKeyboardShortcuts({ enabled: view !== null && !view.isSealed });
  if (!view) return <LoadingScreen />;
  if (view.isSealed) return <EpilogueScreen />;
  return <Workbench view={view} />;
}

function LoadingScreen(): React.JSX.Element {
  return (
    <div className="screen" role="status" aria-live="polite">
      <p className="screen-kicker">La Version Acceptable</p>
      <p>Ouverture du dossier…</p>
    </div>
  );
}
