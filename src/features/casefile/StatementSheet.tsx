/**
 * Fiche d'une déclaration : locuteur, texte cité, lecture structurée, état (debout / rétractée /
 * remplacée par une précision), actions de confrontation.
 */
import { Portrait } from '@/components/portrait';
import { DegreeBadge } from '@/components/ui';
import type { PlayerView, StatementView } from '@/domain/selectors/playerView';
import { useGameStore } from '@/state';
import { TRUST_GLYPHS, TRUST_PORTRAIT_STATE } from './casefileItems';
import { SheetHeader, SheetSection } from './SheetParts';

export interface StatementSheetProps {
  statement: StatementView;
  view: PlayerView;
  titleId: string;
  onNavigate: (kind: 'statement' | 'character', id: string) => void;
}

export function StatementSheet({
  statement,
  view,
  titleId,
  onNavigate,
}: StatementSheetProps): React.JSX.Element {
  const setConfrontationDraft = useGameStore((s) => s.setConfrontationDraft);
  const openDialog = useGameStore((s) => s.openDialog);
  const speaker = view.characters.find((c) => c.id === statement.speakerId);
  const successor = statement.supersededById
    ? view.statements.find((s) => s.id === statement.supersededById)
    : undefined;
  const sealedHint = 'Le rapport est scellé : plus aucune confrontation.';

  const onConfront = (): void => {
    setConfrontationDraft({ characterId: statement.speakerId, targetId: statement.id });
    openDialog('confrontation');
  };
  const onUseAsSupport = (): void => {
    setConfrontationDraft({ supportId: statement.id });
    openDialog('confrontation');
  };

  return (
    <article className="casefile-sheet-content" aria-labelledby={titleId}>
      <SheetHeader
        kind="statement"
        title={`Déclaration de ${statement.speakerName}`}
        titleId={titleId}
        leading={
          speaker ? (
            <Portrait
              seed={speaker.portraitSeed}
              accentColor={speaker.accentColor}
              name={speaker.name}
              size={44}
              state={TRUST_PORTRAIT_STATE[speaker.trustState]}
            />
          ) : undefined
        }
      >
        <div className="casefile-badges">
          <DegreeBadge degree={statement.degree} />
          {speaker && (
            <>
              <span className="tag">{speaker.role}</span>
              <span className="tag" data-trust={speaker.trustState}>
                <span aria-hidden="true">{TRUST_GLYPHS[speaker.trustState]} </span>
                confiance : {speaker.trustState}
              </span>
            </>
          )}
        </div>
        {speaker && (
          <button
            type="button"
            className="casefile-link"
            onClick={() => onNavigate('character', speaker.id)}
          >
            Voir la fiche de {speaker.name}
          </button>
        )}
      </SheetHeader>

      <blockquote className="casefile-quote">
        <p>« {statement.text} »</p>
      </blockquote>

      <SheetSection title="Lecture structurée">
        <p className="casefile-proposition">{statement.propositionLabel}</p>
      </SheetSection>

      <SheetSection title="État">
        {statement.standing ? (
          <p>
            <span className="badge">debout</span> Cette déclaration est maintenue par{' '}
            {statement.speakerName}.
          </p>
        ) : (
          <p>
            <span className="badge badge-warning">rétractée</span>{' '}
            {successor
              ? 'Remplacée par une précision.'
              : `${statement.speakerName} ne maintient plus cette déclaration.`}
          </p>
        )}
        {successor && (
          <button
            type="button"
            className="casefile-link"
            onClick={() => onNavigate('statement', successor.id)}
          >
            Lire la précision : « {successor.propositionLabel} »
          </button>
        )}
      </SheetSection>

      <div className="casefile-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={view.isSealed}
          title={view.isSealed ? sealedHint : undefined}
          onClick={onConfront}
        >
          Confronter à ce sujet
        </button>
        <button
          type="button"
          className="btn"
          disabled={view.isSealed}
          title={view.isSealed ? sealedHint : undefined}
          onClick={onUseAsSupport}
        >
          Utiliser comme appui
        </button>
      </div>
      {view.isSealed && <p className="field-hint">{sealedHint}</p>}
    </article>
  );
}
