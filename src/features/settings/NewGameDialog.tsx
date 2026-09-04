/**
 * Nouvelle partie (dialogue 'new-game') : confirmation seulement si une progression non exportée
 * existe (`unsavedSinceExport` et au moins une action) ; sinon la partie démarre directement.
 */
import { useEffect, useId } from 'react';
import { Dialog } from '@/components/ui';
import { useGameStore } from '@/state';
import './settings.css';

const closeDialog = (): void => useGameStore.getState().closeDialog();

export function NewGameDialog(): React.JSX.Element | null {
  const open = useGameStore((s) => s.dialog === 'new-game');
  const unsavedSinceExport = useGameStore((s) => s.unsavedSinceExport);
  const actionCount = useGameStore((s) => s.actions.length);
  const descriptionId = useId();
  const needsConfirmation = unsavedSinceExport && actionCount > 0;

  useEffect(() => {
    if (open && !needsConfirmation) useGameStore.getState().newGame();
  }, [open, needsConfirmation]);

  if (!open || !needsConfirmation) return null;
  return (
    <Dialog
      open
      title="Nouvelle partie"
      onClose={closeDialog}
      width={520}
      describedBy={descriptionId}
    >
      <div className="new-game">
        <p id={descriptionId}>
          Une progression non exportée existe : {actionCount}{' '}
          {actionCount > 1 ? 'actions' : 'action'} dans le dossier de La Veilleuse. Commencer une
          nouvelle partie la remplacera (la sauvegarde automatique sera écrasée ; les emplacements
          manuels sont conservés).
        </p>
        <div className="new-game-actions">
          <button
            type="button"
            className="btn"
            onClick={() => {
              const store = useGameStore.getState();
              const r = store.exportSave();
              store.pushToast(r.message, r.ok ? 'success' : 'error');
            }}
          >
            Exporter d’abord
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => useGameStore.getState().newGame()}
          >
            Commencer une nouvelle partie
          </button>
          <button type="button" className="btn btn-ghost" onClick={closeDialog} data-autofocus>
            Annuler
          </button>
        </div>
      </div>
    </Dialog>
  );
}
