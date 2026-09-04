/**
 * Table ronde (Acte III) : rappel de la version, réaction de chaque personne, compteur de
 * signatures et cohérence. Le joueur peut retravailler la version ou sceller le rapport
 * (confirmation en deux temps). Aucune information sur la fin atteignable n'est affichée.
 */
import { useId, useRef, useState, type JSX } from 'react';

import { Dialog, StatusBadge } from '@/components/ui';
import type { PlayerView } from '@/domain/selectors/playerView';
import { useGameStore, usePlayerView } from '@/state';

import { SignatureRow } from './SignatureRow';
import './conclusion.css';

const COHERENCE_LABELS: Record<string, string> = {
  incomplete: 'Version incomplète',
  impossible: 'Version impossible : au moins une hypothèse est physiquement exclue',
  contradicted: 'Version contredite par des pièces ou des déclarations',
  unsupported: 'Version possible, mais non étayée par les pièces',
  coherent: 'Version cohérente',
};

function plural(n: number, singular: string, pluralForm: string): string {
  return n > 1 ? pluralForm : singular;
}

/** Applique le focus à l'élément dès son montage (remplace autoFocus, proscrit par l'a11y). */
function focusOnMount(el: HTMLElement | null): void {
  el?.focus();
}

export function RoundTableDialog(): JSX.Element | null {
  const view = usePlayerView();
  const dialog = useGameStore((s) => s.dialog);
  const closeDialog = useGameStore((s) => s.closeDialog);
  const open = dialog === 'round-table' && view?.phase === 'round-table';
  if (!open || !view) return null;
  return (
    <Dialog open title="Table ronde" onClose={closeDialog} width={720}>
      <RoundTableBody view={view} />
    </Dialog>
  );
}

/** Corps du dialogue : monté uniquement quand la table ronde est ouverte (état local remis à zéro à la fermeture). */
function RoundTableBody({ view }: { view: PlayerView }): JSX.Element {
  const dispatch = useGameStore((s) => s.dispatch);
  const closeDialog = useGameStore((s) => s.closeDialog);
  const announce = useGameStore((s) => s.announce);
  const select = useGameStore((s) => s.select);
  const setActiveSpace = useGameStore((s) => s.setActiveSpace);
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
    const result = dispatch({ type: 'leave-round-table' });
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    announce('Retour au dossier : la version peut encore être retravaillée.');
    closeDialog();
  };

  const onSeal = (): void => {
    const result = dispatch({ type: 'seal-report' });
    if (!result.ok) {
      setError(result.error.message);
      setConfirming(false);
      return;
    }
    announce(
      `Rapport scellé avec ${count} ${plural(count, 'signature', 'signatures')} sur ${total}. L’épilogue s’ouvre.`,
    );
    closeDialog();
  };

  const onShowSlot = (slotId: string): void => {
    const claim = view.version.claims[slotId];
    closeDialog();
    if (claim) select('hypothesis', claim.hypothesisId, { space: 'inspector' });
    else setActiveSpace('inspector');
    announce(`Emplacement « ${slotLabel(slotId)} » affiché dans l’inspecteur.`);
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
        <ol className="rt-version list-plain">
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
        <ul className="sig-list list-plain">
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
        <div id={confirmId} className="rt-confirm" role="group" aria-labelledby={`${confirmId}-text`}>
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
  );
}
