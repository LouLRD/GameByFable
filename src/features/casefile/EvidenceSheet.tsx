/**
 * Fiche d'une pièce : texte joueur sur ticket thermique, marqueur (lieu / heure), ce qu'elle
 * établit ou exclut, état « jointe au rapport », appui pour une confrontation.
 */
import { useId, useState } from 'react';
import { DegreeBadge } from '@/components/ui';
import type { EvidenceView, PlayerView } from '@/domain/selectors/playerView';
import { useGameStore } from '@/state';
import { isCompactViewport } from './casefileItems';
import { ActionNotice, SheetHeader, SheetSection } from './SheetParts';

export interface EvidenceSheetProps {
  evidence: EvidenceView;
  view: PlayerView;
  zoneLabels: ReadonlyMap<string, string>;
  titleId: string;
}

export function EvidenceSheet({
  evidence,
  view,
  zoneLabels,
  titleId,
}: EvidenceSheetProps): React.JSX.Element {
  const dispatch = useGameStore((s) => s.dispatch);
  const select = useGameStore((s) => s.select);
  const setCursor = useGameStore((s) => s.setCursor);
  const highlight = useGameStore((s) => s.highlight);
  const setConfrontationDraft = useGameStore((s) => s.setConfrontationDraft);
  const openDialog = useGameStore((s) => s.openDialog);
  const announce = useGameStore((s) => s.announce);
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

  const attachHint = evidence.mandatory
    ? 'Pièce initiale du dossier : elle fait partie du rapport et ne peut pas en être retirée.'
    : view.isSealed
      ? 'Le rapport est scellé : les pièces jointes ne peuvent plus changer.'
      : 'Une pièce retirée du rapport n’est plus partagée à la table ronde ni comptée dans le dévoilement.';
  const attachDisabled = evidence.mandatory || view.isSealed;

  const onToggleAttached = (attached: boolean): void => {
    const result = dispatch({ type: 'set-evidence-attached', evidenceId: evidence.id, attached });
    if (!result.ok) {
      setNotice(result.error.message);
      return;
    }
    setNotice(null);
    announce(attached ? `« ${evidence.label} » jointe au rapport.` : `« ${evidence.label} » retirée du rapport.`);
  };

  const onLocate = (): void => {
    if (markerTime !== null) setCursor(markerTime);
    select('evidence', evidence.id, isCompactViewport() ? { space: 'map' } : {});
    if (marker?.zoneId) highlight([marker.zoneId]);
    const parts = [markerPlace ? `plan : ${markerPlace}` : null, markerTime !== null ? `frise : ${view.clock(markerTime)}` : null].filter(
      (p): p is string => p !== null,
    );
    announce(`« ${evidence.label} » repérée (${parts.join(', ')}).`);
  };

  const onUseAsSupport = (): void => {
    setConfrontationDraft({ supportId: evidence.id });
    openDialog('confrontation');
  };

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
        <div className="casefile-actions">
          <button
            type="button"
            className="btn"
            disabled={!canLocate}
            title={canLocate ? undefined : 'Aucun lieu ni instant connu pour cette pièce.'}
            onClick={onLocate}
          >
            Voir sur le plan / la frise
          </button>
        </div>
        {!canLocate && <p className="field-hint">Aucun lieu ni instant connu pour cette pièce.</p>}
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
        <ActionNotice message={notice} />
      </SheetSection>

      <div className="casefile-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={view.isSealed}
          title={view.isSealed ? 'Le rapport est scellé : plus aucune confrontation.' : undefined}
          onClick={onUseAsSupport}
        >
          Utiliser dans une confrontation
        </button>
      </div>
      {view.isSealed && <p className="field-hint">Le rapport est scellé : plus aucune confrontation.</p>}
    </article>
  );
}
