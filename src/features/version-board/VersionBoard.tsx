/**
 * Canevas de version (GDD §6.2, §10, §12.3) : en-tête avec statut global, cinq emplacements
 * reliés par un fil causal (fissuré là où une contradiction bloque), trois axes d'évaluation,
 * pièces jointes au rapport et demande de table ronde.
 * Toutes les données viennent de la vue joueur ; toute action passe par le store.
 */
import { useId, useState, type JSX } from 'react';
import { DegreeBadge } from '@/components/ui';
import type { PlayerAction } from '@/domain/model/actions';
import type { EvidenceView, PlayerView } from '@/domain/selectors/playerView';
import { selectPlayerView } from '@/domain/selectors/playerView';
import { useGameStore, usePlayerView, useReducedMotion } from '@/state';
import { AxesPanel } from './AxesPanel';
import { SlotCard } from './SlotCard';
import { api, coherenceDisplay, describeVersion, plural, scrollTo, slotCardDomId } from './labels';
import './version-board.css';

export function VersionBoard(): JSX.Element {
  const view = usePlayerView();
  const scenario = useGameStore((s) => s.scenario);
  const actionNonce = useGameStore((s) => s.actionNonce);
  const reducedMotion = useReducedMotion();
  const [error, setError] = useState<string | null>(null);
  const baseId = useId();

  if (!view || !scenario) {
    return (
      <div className="vb">
        <p className="muted">Aucune partie en cours.</p>
      </div>
    );
  }

  const zones = scenario.data.zones;
  const { version } = view;
  const blockingIds = new Set(version.blockingIds);
  const coherence = coherenceDisplay(version.coherenceStatus);
  const filled = view.slots.filter((s) => version.claims[s.id] !== undefined).length;
  const sealed = view.isSealed;
  const atRoundTable = view.phase === 'round-table';
  const mandatoryNoteId = `${baseId}-mandatory`;
  const sealedNoteId = `${baseId}-sealed`;
  const roundTableMsgId = `${baseId}-rt-msg`;

  /** Dispatch + annonce concise ; l'erreur du moteur est affichée comme remarque de l'outil. */
  const run = (action: PlayerAction, describe: (next: PlayerView) => string): boolean => {
    const result = api().dispatch(action);
    if (!result.ok) {
      setError(result.error.message);
      return false;
    }
    setError(null);
    api().announce(describe(selectPlayerView(scenario, result.state)));
    return true;
  };

  const slotLabel = (slotId: string): string =>
    view.slots.find((s) => s.id === slotId)?.label ?? slotId;

  const onClear = (slotId: (typeof view.slots)[number]['id']): void => {
    run(
      { type: 'clear-claim', slotId },
      (next) => `Emplacement « ${slotLabel(slotId)} » vidé. ${describeVersion(next.version)}`,
    );
  };

  const onToggleEvidence = (e: EvidenceView, attached: boolean): void => {
    run(
      { type: 'set-evidence-attached', evidenceId: e.id, attached },
      (next) =>
        `« ${e.label} » ${attached ? 'jointe au rapport' : 'retirée du rapport (omission)'}. ${describeVersion(next.version)}`,
    );
  };

  const onRoundTable = (): void => {
    const ok = run(
      { type: 'request-round-table' },
      () => 'Table ronde ouverte : chacun réagit à la version proposée.',
    );
    if (ok) api().openDialog('round-table');
  };

  const onResumeRoundTable = (): void => {
    api().openDialog('round-table');
  };

  const onSelectContradiction = (id: string): void => {
    const store = api();
    store.select('contradiction', id);
    store.setInspectorTab('contradictions');
  };

  const onGoToSlot = (slotId: string): void => {
    const el = document.getElementById(slotCardDomId(slotId));
    if (el) {
      scrollTo(el, reducedMotion);
      el.focus();
    }
    api().announce(`Emplacement « ${slotLabel(slotId)} » mis en avant.`);
  };

  const onSelectEvidence = (id: string): void => {
    api().select('evidence', id);
  };

  const slotHasBlocking = (slotId: string): boolean =>
    view.contradictions.some((c) => blockingIds.has(c.id) && c.slotIds.includes(slotId));

  const roundTableDisabledReason = sealed
    ? 'Le rapport est scellé.'
    : !version.roundTableAvailable
      ? (version.roundTableMessage ?? 'La table ronde n’est pas encore possible.')
      : null;

  return (
    <div className="vb" role="region" aria-labelledby={`${baseId}-title`}>
      <header className="vb-header">
        <h2 id={`${baseId}-title`} className="vb-title">
          Version proposée
        </h2>
        <p className="vb-status" data-status={version.coherenceStatus}>
          <span className="vb-glyph" aria-hidden="true">
            {coherence.glyph}
          </span>
          <span>Version {coherence.label}</span>
        </p>
        <p className="vb-note vb-completeness">
          {filled}/{view.slots.length} emplacements remplis
        </p>
      </header>

      {error ? (
        <p className="vb-alert" role="alert">
          <span className="tag">action refusée</span> {error}
        </p>
      ) : null}

      <ol className="vb-list vb-slots" aria-label="Emplacements du canevas">
        {view.slots.map((slot, index) => {
          const claim = version.claims[slot.id];
          const evaluation = version.slots.find((s) => s.slotId === slot.id) ?? {
            slotId: slot.id,
            status: 'empty' as const,
            supportingEvidenceIds: [],
            contradictionIds: [],
          };
          const related = view.contradictions.filter((c) => c.slotIds.includes(slot.id));
          const previous = view.slots[index - 1];
          const cracked =
            index > 0 &&
            (slotHasBlocking(slot.id) || (previous ? slotHasBlocking(previous.id) : false));
          return (
            <li key={slot.id} className="vb-slot-item">
              {index > 0 ? (
                <div className="vb-thread" data-cracked={cracked} aria-hidden={!cracked}>
                  {cracked ? (
                    <>
                      <span className="vb-thread-glyph" aria-hidden="true">
                        ✕
                      </span>
                      <span className="vb-thread-text">fil causal fissuré</span>
                    </>
                  ) : null}
                </div>
              ) : null}
              <SlotCard
                slot={slot}
                index={index}
                claim={claim}
                hypothesis={
                  claim ? view.hypotheses.find((h) => h.id === claim.hypothesisId) : undefined
                }
                evaluation={evaluation}
                contradictions={related}
                blockingIds={blockingIds}
                characters={view.characters}
                zones={zones}
                clock={view.clock}
                sealed={sealed}
                actionNonce={actionNonce}
                reducedMotion={reducedMotion}
                onChoose={() => {
                  api().openClaimForm(slot.id);
                }}
                onEdit={() => {
                  api().openClaimForm(slot.id, claim?.hypothesisId ?? null);
                }}
                onClear={() => {
                  onClear(slot.id);
                }}
                onSelectContradiction={onSelectContradiction}
              />
            </li>
          );
        })}
      </ol>

      <section className="vb-section" aria-labelledby={`${baseId}-axes`}>
        <h3 id={`${baseId}-axes`} className="vb-section-title">
          Évaluation
        </h3>
        <AxesPanel
          version={version}
          characters={view.characters}
          evidence={view.evidence}
          slots={view.slots}
          onSelectEvidence={onSelectEvidence}
          onGoToSlot={onGoToSlot}
        />
      </section>

      <section className="vb-section" aria-labelledby={`${baseId}-evidence`}>
        <h3 id={`${baseId}-evidence`} className="vb-section-title">
          Pièces jointes au rapport
        </h3>
        <p className="vb-note">
          {plural(view.evidence.filter((e) => e.attached).length, 'pièce jointe', 'pièces jointes')}{' '}
          sur {view.evidence.length}. Une pièce retirée devient une omission du rapport.
        </p>
        <ul className="vb-list vb-evidence-list">
          {view.evidence.map((e) => {
            const inputId = `${baseId}-ev-${e.id}`;
            const locked = e.mandatory || sealed;
            return (
              <li key={e.id} className="vb-evidence-row" data-attached={e.attached}>
                <input
                  id={inputId}
                  type="checkbox"
                  checked={e.attached}
                  disabled={locked}
                  aria-describedby={
                    e.mandatory ? mandatoryNoteId : sealed ? sealedNoteId : undefined
                  }
                  title={
                    e.mandatory
                      ? 'Pièce du dossier initial : toujours jointe au rapport.'
                      : sealed
                        ? 'Le rapport est scellé.'
                        : undefined
                  }
                  onChange={() => {
                    onToggleEvidence(e, !e.attached);
                  }}
                />
                <label htmlFor={inputId}>
                  <span className="vb-evidence-label">{e.label}</span>
                  <DegreeBadge degree={e.degree} />
                </label>
                {e.mandatory ? <span className="tag">dossier initial</span> : null}
                {!e.attached ? <span className="tag vb-omission">omission</span> : null}
              </li>
            );
          })}
        </ul>
        {view.evidence.some((e) => e.mandatory) ? (
          <p id={mandatoryNoteId} className="vb-note">
            Les pièces du dossier initial font toujours partie du rapport : leur case est
            verrouillée.
          </p>
        ) : null}
        {sealed ? (
          <p id={sealedNoteId} className="vb-note">
            Le rapport est scellé : les pièces jointes ne peuvent plus changer.
          </p>
        ) : null}
      </section>

      <section className="vb-round-table" aria-labelledby={`${baseId}-rt`}>
        <h3 id={`${baseId}-rt`} className="vb-section-title">
          Table ronde
        </h3>
        <p className="vb-note vb-counter">
          <span className="tag">
            révélations {version.revelations}/{version.revelationsRequired}
          </span>{' '}
          <span className="tag">
            emplacements {filled}/{view.slots.length}
          </span>
        </p>
        <div className="vb-round-table-actions">
          {atRoundTable ? (
            <button type="button" className="btn btn-primary" onClick={onResumeRoundTable}>
              Reprendre la table ronde
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={onRoundTable}
              disabled={roundTableDisabledReason !== null}
              title={roundTableDisabledReason ?? undefined}
              aria-describedby={roundTableDisabledReason ? roundTableMsgId : undefined}
            >
              Demander la table ronde
            </button>
          )}
        </div>
        {roundTableDisabledReason && !atRoundTable ? (
          <p id={roundTableMsgId} className="vb-note">
            {roundTableDisabledReason}
          </p>
        ) : null}
      </section>
    </div>
  );
}
