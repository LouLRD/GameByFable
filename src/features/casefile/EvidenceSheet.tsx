/**
 * Fiche d'une pièce : texte joueur sur ticket thermique, marqueur (lieu / heure), ce qu'elle
 * établit ou exclut, état « jointe au rapport », appui pour une confrontation.
 * Mode compact : les actions (repérer, confronter, joindre, épingler) forment la barre au pouce.
 */
import { useId, useState } from 'react';
import { DegreeBadge } from '@/components/ui';
import type { EvidenceView, PlayerView } from '@/domain/selectors/playerView';
import { useGameStore } from '@/state';
import { isCompactViewport } from './casefileItems';
import { ActionNotice, PinButton, SheetActions, SheetHeader, SheetSection } from './SheetParts';

export interface EvidenceSheetProps {
  evidence: EvidenceView;
  view: PlayerView;
  zoneLabels: ReadonlyMap<string, string>;
  titleId: string;
  compact?: boolean;
}

export function EvidenceSheet({
  evidence,
  view,
  zoneLabels,
  titleId,
  compact = false,
}: EvidenceSheetProps): React.JSX.Element {
  const [notice, setNotice] = useState<string | null>(null);
  const hintId = useId();

  const marker = evidence.marker;
  const markerTime: number | null = marker ? (marker.at ?? marker.interval?.start ?? null) : null;
  const markerPlace = marker?.zoneId ? (zoneLabels.get(marker.zoneId) ?? marker.zoneId) : null;
  const markerWhen = marker
    ? marker.at !== undefined
      ? view.clock(marker.at)
      : marker.interval
        ? `${view.clock(marker.interval.start)} – ${view.clock(marker.interval.end)}`
        : null
    : null;
  const canLocate = markerTime !== null || markerPlace !== null;
  const locateHint = 'Aucun lieu ni instant connu pour cette pièce.';

  const attachHint = evidence.mandatory
    ? 'Pièce initiale du dossier : elle fait partie du rapport et ne peut pas en être retirée.'
    : view.isSealed
      ? 'Le rapport est scellé : les pièces jointes ne peuvent plus changer.'
      : 'Une pièce retirée du rapport n’est plus partagée à la table ronde ni comptée dans le dévoilement.';
  const attachDisabled = evidence.mandatory || view.isSealed;
  const sealedHint = 'Le rapport est scellé : plus aucune confrontation.';

  // Les actions du store sont stables : on les lit sans abonnement au moment de l'interaction.
  const onToggleAttached = (attached: boolean): void => {
    const store = useGameStore.getState();
    const result = store.dispatch({
      type: 'set-evidence-attached',
      evidenceId: evidence.id,
      attached,
    });
    if (!result.ok) {
      setNotice(result.error.message);
      return;
    }
    setNotice(null);
    store.announce(
      attached
        ? `« ${evidence.label} » jointe au rapport.`
        : `« ${evidence.label} » retirée du rapport.`,
    );
  };

  const onLocate = (): void => {
    const store = useGameStore.getState();
    if (markerTime !== null) store.setCursor(markerTime);
    store.select('evidence', evidence.id, isCompactViewport() ? { space: 'map' } : {});
    if (marker?.zoneId) store.highlight([marker.zoneId]);
    const parts = [
      markerPlace ? `plan : ${markerPlace}` : null,
      markerTime !== null ? `frise : ${view.clock(markerTime)}` : null,
    ].filter((p): p is string => p !== null);
    store.announce(`« ${evidence.label} » repérée (${parts.join(', ')}).`);
  };

  const onUseAsSupport = (): void => {
    const store = useGameStore.getState();
    store.setConfrontationDraft({ supportId: evidence.id });
    store.openDialog('confrontation');
  };

  const locateButton = (
    <button
      type="button"
      className="btn"
      disabled={!canLocate}
      title={canLocate ? undefined : locateHint}
      onClick={onLocate}
    >
      Voir sur le plan / la frise
    </button>
  );

  const supportButton = (
    <button
      type="button"
      className="btn btn-primary"
      disabled={view.isSealed}
      title={view.isSealed ? sealedHint : undefined}
      onClick={onUseAsSupport}
    >
      Utiliser dans une confrontation
    </button>
  );

  return (
    <article className="casefile-sheet-content" aria-labelledby={titleId}>
      <SheetHeader kind="evidence" title={evidence.label} titleId={titleId}>
        <div className="casefile-badges">
          <DegreeBadge degree={evidence.degree} />
          {evidence.mandatory && <span className="tag">pièce initiale</span>}
          <span className="tag">{evidence.attached ? 'jointe au rapport' : 'hors rapport'}</span>
        </div>
      </SheetHeader>

      <div className="ticket casefile-ticket">
        <div className="ticket-header">{evidence.label}</div>
        <p className="casefile-ticket-text">{evidence.playerText}</p>
        {marker && (
          <>
            <hr className="ticket-sep" />
            <div className="ticket-row">
              <span>{marker.label}</span>
              <span>{markerWhen ?? '—'}</span>
            </div>
          </>
        )}
      </div>

      <SheetSection title="Marqueur">
        {marker ? (
          <dl className="casefile-dl">
            <dt>Lieu</dt>
            <dd>{markerPlace ?? 'non localisé'}</dd>
            <dt>Heure</dt>
            <dd className="mono">{markerWhen ?? 'non datée'}</dd>
          </dl>
        ) : (
          <p className="muted">Cette pièce n’est rattachée à aucun lieu ni instant précis.</p>
        )}
        {!compact && <div className="casefile-actions">{locateButton}</div>}
        {!canLocate && <p className="field-hint">{locateHint}</p>}
      </SheetSection>

      <SheetSection title="Ce que la pièce établit">
        {evidence.supportsLabels.length > 0 ? (
          <ul className="casefile-bullets">
            {evidence.supportsLabels.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">Aucune proposition étayée directement.</p>
        )}
      </SheetSection>

      <SheetSection title="Ce que la pièce exclut">
        {evidence.excludesLabels.length > 0 ? (
          <ul className="casefile-bullets">
            {evidence.excludesLabels.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">Aucune proposition exclue directement.</p>
        )}
      </SheetSection>

      <SheetSection title="Rapport">
        {compact ? (
          <p id={hintId} className="field-hint">
            {evidence.attached ? 'Jointe au rapport. ' : 'Hors rapport. '}
            {attachHint}
          </p>
        ) : (
          <div className="field">
            <label className="casefile-check">
              <input
                type="checkbox"
                checked={evidence.attached}
                disabled={attachDisabled}
                aria-describedby={hintId}
                title={attachDisabled ? attachHint : undefined}
                onChange={(e) => onToggleAttached(e.target.checked)}
              />
              <span>Jointe au rapport</span>
            </label>
            <p id={hintId} className="field-hint">
              {attachHint}
            </p>
          </div>
        )}
        <ActionNotice message={notice} />
      </SheetSection>

      {view.isSealed && <p className="field-hint">{sealedHint}</p>}

      {compact ? (
        <SheetActions compact>
          {locateButton}
          {supportButton}
          <button
            type="button"
            className="btn"
            aria-pressed={evidence.attached}
            disabled={attachDisabled}
            aria-describedby={hintId}
            title={attachDisabled ? attachHint : undefined}
            onClick={() => onToggleAttached(!evidence.attached)}
          >
            <span aria-hidden="true">{evidence.attached ? '☑ ' : '☐ '}</span>Jointe au rapport
          </button>
          <PinButton id={evidence.id} label={evidence.label} />
        </SheetActions>
      ) : (
        <SheetActions compact={false}>{supportButton}</SheetActions>
      )}
    </article>
  );
}
