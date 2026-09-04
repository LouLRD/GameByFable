/**
 * Table ronde (Acte III) : rappel de la version, réaction de chaque personne, compteur de
 * signatures et cohérence. Le joueur peut retravailler la version ou sceller le rapport
 * (confirmation en deux temps). Aucune information sur la fin atteignable n'est affichée.
 *
 * Les actions du store sont appelées via `useGameStore.getState()` (fonctions stables) ;
 * seules les données sont lues par sélecteur.
 */
import { useCallback, useId, useRef, useState, type JSX } from 'react';

import { Dialog, StatusBadge } from '@/components/ui';
import type { PlayerView } from '@/domain/selectors/playerView';
import { useGameStore, usePlayerView } from '@/state';

import { COHERENCE_LABELS, plural } from './labels';
import { SignatureRow } from './SignatureRow';
import './conclusion.css';

/** Applique le focus à l'élément dès son montage (remplace autoFocus, proscrit par l'a11y). */
function focusOnMount(el: HTMLElement | null): void {
  el?.focus();
}

export function RoundTableDialog(): JSX.Element | null {
  const view = usePlayerView();
  const dialog = useGameStore((s) => s.dialog);
  const onClose = useCallback(() => {
    useGameStore.getState().closeDialog();
  }, []);
  const open = dialog === 'round-table' && view?.phase === 'round-table';
  if (!open || !view) return null;
  return (
    <Dialog open title="Table ronde" onClose={onClose} width={720}>
      <RoundTableBody view={view} />
    </Dialog>
  );
}

/** Corps du dialogue : monté uniquement quand la table ronde est ouverte (état local remis à zéro à la fermeture). */
function RoundTableBody({ view }: { view: PlayerView }): JSX.Element {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sealToggleRef = useRef<HTMLButtonElement>(null);
  const versionId = useId();
  const signaturesId = useId();
  const confirmId = useId();

  const total = view.version.adhesion.length;
  const count = view.version.signatureCount;
  const blocking = view.version.blockingIds.length;
  const coherence = COHERENCE_LABELS[view.version.coherenceStatus] ?? view.version.coherenceStatus;
  const slotLabel = (slotId: string): string =>
    view.slots.find((s) => s.id === slotId)?.label ?? slotId;

  const onRework = (): void => {
    const store = useGameStore.getState();
    const result = store.dispatch({ type: 'leave-round-table' });
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    store.announce('Retour au dossier : la version peut encore être retravaillée.');
    store.closeDialog();
  };

  const onSeal = (): void => {
    const store = useGameStore.getState();
    const result = store.dispatch({ type: 'seal-report' });
    if (!result.ok) {
      setError(result.error.message);
      setConfirming(false);
      return;
    }
    store.announce(
      `Rapport scellé avec ${count} ${plural(count, 'signature', 'signatures')} sur ${total}. L’épilogue s’ouvre.`,
    );
    store.closeDialog();
  };

  const onShowSlot = (slotId: string): void => {
    const store = useGameStore.getState();
    const claim = view.version.claims[slotId];
    store.closeDialog();
    if (claim) store.select('hypothesis', claim.hypothesisId, { space: 'inspector' });
    else store.setActiveSpace('inspector');
    store.announce(`Emplacement « ${slotLabel(slotId)} » affiché dans l’inspecteur.`);
  };

  return (
    <div className="rt-body">
      <p className="rt-intro">
        Chacun a lu la version proposée. Voici les réactions autour de la table. Vous pouvez
        repartir travailler tant que le rapport n’est pas scellé.
      </p>

      <section className="rt-section" aria-labelledby={versionId}>
        <h3 id={versionId} className="rt-heading">
          Version proposée
        </h3>
        <ol className="rt-version list-plain" aria-labelledby={versionId}>
          {view.slots.map((slot) => {
            const claim = view.version.claims[slot.id];
            const hypothesis = claim
              ? view.hypotheses.find((h) => h.id === claim.hypothesisId)
              : undefined;
            const evaluation = view.version.slots.find((s) => s.slotId === slot.id);
            return (
              <li key={slot.id} className="rt-version-line">
                <span className="rt-slot">{slot.label}</span>
                <span className="rt-arrow" aria-hidden="true">
                  →
                </span>
                <span className="rt-hyp">
                  {hypothesis?.label ?? claim?.hypothesisId ?? 'emplacement vide'}
                </span>
                {evaluation ? <StatusBadge status={evaluation.status} /> : null}
              </li>
            );
          })}
        </ol>
      </section>

      <section className="rt-section" aria-labelledby={signaturesId}>
        <h3 id={signaturesId} className="rt-heading">
          Réactions
        </h3>
        <ul className="sig-list list-plain" aria-labelledby={signaturesId}>
          {view.version.adhesion.map((adhesion) => {
            const character = view.characters.find((c) => c.id === adhesion.characterId);
            if (!character) return null;
            return (
              <SignatureRow
                key={adhesion.characterId}
                name={character.name}
                role={character.role}
                portraitSeed={character.portraitSeed}
                accentColor={character.accentColor}
                trustState={character.trustState}
                verdict={adhesion.verdict}
                reasons={adhesion.publicReasons}
                requestedSlot={
                  adhesion.requestedSlotId
                    ? { id: adhesion.requestedSlotId, label: slotLabel(adhesion.requestedSlotId) }
                    : null
                }
                onShowSlot={onShowSlot}
              />
            );
          })}
        </ul>
      </section>

      <div className="rt-footer">
        <p className="rt-summary">
          <span className="rt-count">
            {count} {plural(count, 'signature', 'signatures')} sur {total}
          </span>
          <span className="rt-coherence">
            {coherence}
            {blocking > 0
              ? ` (${blocking} ${plural(blocking, 'contradiction bloquante', 'contradictions bloquantes')})`
              : ''}
          </span>
        </p>

        {error ? (
          <p className="rt-error" role="alert">
            <span className="rt-error-kicker">Action non appliquée</span>
            {error}
          </p>
        ) : null}

        <div className="rt-actions">
          <button type="button" className="btn" onClick={onRework}>
            Retravailler la version
          </button>
          <button
            ref={sealToggleRef}
            type="button"
            className="btn btn-primary"
            onClick={() => setConfirming((c) => !c)}
            aria-expanded={confirming}
            aria-controls={confirmId}
          >
            Sceller le rapport
          </button>
        </div>

        {confirming ? (
          <div
            id={confirmId}
            className="rt-confirm"
            role="group"
            aria-labelledby={`${confirmId}-text`}
          >
            <p id={`${confirmId}-text`}>
              <strong>Le rapport ne pourra plus être modifié.</strong> La table ronde se termine sur
              cette version, avec {count} {plural(count, 'signature', 'signatures')} sur {total}.
            </p>
            <div className="rt-actions">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setConfirming(false);
                  sealToggleRef.current?.focus();
                }}
              >
                Annuler
              </button>
              <button ref={focusOnMount} type="button" className="btn btn-danger" onClick={onSeal}>
                Sceller définitivement
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
