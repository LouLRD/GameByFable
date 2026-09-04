/**
 * Fiche d'un protagoniste : portrait, confiance, déclarations (debout puis historiques),
 * perceptions révélées, aveux publics, confrontation et sondage par hypothèse.
 * Mode compact : confronter, sonder et épingler dans la barre au pouce ; le formulaire de
 * sondage s'ouvre au-dessus de la barre et y amène la vue.
 */
import { useEffect, useId, useRef, useState, type SubmitEvent } from 'react';
import { Portrait } from '@/components/portrait';
import type { Approach } from '@/domain/model/scenario';
import type { CharacterView, PlayerView, StatementView } from '@/domain/selectors/playerView';
import { useGameStore, useReducedMotion } from '@/state';
import {
  APPROACHES,
  APPROACH_LABELS,
  FIDELITY_LABELS,
  MODALITY_LABELS,
  TRUST_GLYPHS,
  TRUST_PORTRAIT_STATE,
} from './casefileItems';
import { ActionNotice, PinButton, SheetActions, SheetHeader, SheetSection } from './SheetParts';

export interface CharacterSheetProps {
  character: CharacterView;
  view: PlayerView;
  titleId: string;
  onNavigate: (kind: 'statement' | 'fact', id: string) => void;
  compact?: boolean;
}

interface ProbeReaction {
  hypothesisLabel: string;
  approach: Approach;
  text: string;
}

function StatementRow({
  statement,
  historic,
  onNavigate,
}: {
  statement: StatementView;
  historic: boolean;
  onNavigate: (kind: 'statement', id: string) => void;
}): React.JSX.Element {
  return (
    <li className="casefile-statement-row" data-historic={historic ? 'true' : undefined}>
      <button
        type="button"
        className="casefile-link"
        onClick={() => onNavigate('statement', statement.id)}
      >
        {historic ? (
          <s className="casefile-struck">« {statement.text} »</s>
        ) : (
          <span>« {statement.text} »</span>
        )}
      </button>
      {historic && (
        <span className="casefile-badges">
          <span className="tag">rétractée</span>
          {statement.supersededById && <span className="tag">précisée</span>}
        </span>
      )}
    </li>
  );
}

export function CharacterSheet({
  character,
  view,
  titleId,
  onNavigate,
  compact = false,
}: CharacterSheetProps): React.JSX.Element {
  const [probeOpen, setProbeOpen] = useState(false);
  const [hypothesisId, setHypothesisId] = useState<string>(view.hypotheses[0]?.id ?? '');
  const [approach, setApproach] = useState<Approach>('neutral');
  const [reaction, setReaction] = useState<ProbeReaction | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const reducedMotion = useReducedMotion();
  const probeRef = useRef<HTMLFormElement>(null);
  const selectId = useId();
  const approachName = useId();
  const reactionId = useId();
  const probeId = useId();

  const statements = character.statementIds
    .map((id) => view.statements.find((s) => s.id === id))
    .filter((s): s is StatementView => s !== undefined);
  const standing = statements.filter((s) => s.standing);
  const historic = statements.filter((s) => !s.standing);
  const slotLabel = new Map<string, string>(
    view.slots.map((s): [string, string] => [s.id, s.label]),
  );
  const hypothesesBySlot = view.slots
    .map((slot) => ({ slot, list: view.hypotheses.filter((h) => h.slotId === slot.id) }))
    .filter((g) => g.list.length > 0);
  const effectiveHypothesisId = view.hypotheses.some((h) => h.id === hypothesisId)
    ? hypothesisId
    : (view.hypotheses[0]?.id ?? '');

  const sealedHint = 'Le rapport est scellé : plus aucune confrontation ni sondage.';
  const noHypothesisHint = 'Aucune hypothèse formulable pour l’instant.';
  const probeDisabled = view.isSealed || view.hypotheses.length === 0;
  const probeHint = view.isSealed
    ? sealedHint
    : view.hypotheses.length === 0
      ? noHypothesisHint
      : null;
  const probeVisible = probeOpen && !probeDisabled;

  // En compact, le formulaire s'ouvre au-dessus de la barre collante : on l'amène dans la vue.
  useEffect(() => {
    if (!compact || !probeVisible) return;
    const el = probeRef.current;
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' });
    }
  }, [compact, probeVisible, reducedMotion]);

  // Les actions du store sont stables : on les lit sans abonnement au moment de l'interaction.
  const onConfront = (): void => {
    const store = useGameStore.getState();
    store.setConfrontationDraft({ characterId: character.id, targetId: null });
    store.openDialog('confrontation');
  };

  const onProbe = (e: SubmitEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (!effectiveHypothesisId) return;
    const store = useGameStore.getState();
    const result = store.dispatch({
      type: 'probe',
      characterId: character.id,
      targetId: effectiveHypothesisId,
      approach,
    });
    if (!result.ok) {
      setNotice(result.error.message);
      return;
    }
    setNotice(null);
    const last = result.state.probeHistory.at(-1);
    const hypothesisLabel =
      view.hypotheses.find((h) => h.id === effectiveHypothesisId)?.label ?? effectiveHypothesisId;
    if (last) {
      setReaction({ hypothesisLabel, approach, text: last.text });
      store.announce(`${character.name} réagit : ${last.text}`);
    }
  };

  const probeForm = probeVisible && (
    <form className="casefile-probe" id={probeId} ref={probeRef} onSubmit={onProbe}>
      <div className="field">
        <label htmlFor={selectId} className="field-label">
          Hypothèse à soumettre
        </label>
        <select
          id={selectId}
          className="select"
          value={effectiveHypothesisId}
          onChange={(e) => setHypothesisId(e.target.value)}
        >
          {hypothesesBySlot.map((g) => (
            <optgroup key={g.slot.id} label={slotLabel.get(g.slot.id) ?? g.slot.id}>
              {g.list.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <fieldset className="casefile-fieldset">
        <legend className="field-label">Approche</legend>
        <div className="casefile-radios">
          {APPROACHES.map((a) => (
            <label key={a} className="casefile-check">
              <input
                type="radio"
                name={approachName}
                value={a}
                checked={approach === a}
                onChange={() => setApproach(a)}
              />
              <span>{APPROACH_LABELS[a]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="casefile-actions">
        <button type="submit" className="btn btn-primary">
          Sonder {character.name}
        </button>
      </div>
      <ActionNotice message={notice} />
    </form>
  );

  const reactionBlock = reaction && (
    <section className="casefile-reaction" aria-labelledby={reactionId}>
      <h4 id={reactionId} className="casefile-section-title">
        Réaction de {character.name}
      </h4>
      <p className="muted casefile-reaction-context">
        Hypothèse « {reaction.hypothesisLabel} », approche {APPROACH_LABELS[reaction.approach]}.
      </p>
      <blockquote className="casefile-quote">
        <p>{reaction.text}</p>
      </blockquote>
    </section>
  );

  const actions = (
    <SheetActions compact={compact}>
      <button
        type="button"
        className="btn btn-primary"
        disabled={view.isSealed}
        title={view.isSealed ? sealedHint : undefined}
        onClick={onConfront}
      >
        Confronter
      </button>
      <button
        type="button"
        className="btn"
        aria-expanded={probeOpen}
        {...(probeVisible ? { 'aria-controls': probeId } : {})}
        disabled={probeDisabled}
        title={probeHint ?? undefined}
        onClick={() => setProbeOpen((o) => !o)}
      >
        Sonder avec une hypothèse
      </button>
      {compact && <PinButton id={character.id} label={character.name} />}
    </SheetActions>
  );

  return (
    <article className="casefile-sheet-content" aria-labelledby={titleId}>
      <SheetHeader
        kind="character"
        title={character.name}
        titleId={titleId}
        leading={
          <Portrait
            seed={character.portraitSeed}
            accentColor={character.accentColor}
            name={character.name}
            size={64}
            state={TRUST_PORTRAIT_STATE[character.trustState]}
          />
        }
      >
        <p className="casefile-role">
          {character.role} · <span className="muted">{character.pronouns}</span>
        </p>
        <p className="casefile-trust" data-trust={character.trustState}>
          <span className="casefile-trust-glyph" aria-hidden="true">
            {TRUST_GLYPHS[character.trustState]}
          </span>{' '}
          Confiance : <strong>{character.trustState}</strong>
          <span className="muted">
            {' '}
            · {character.confrontationsResolved}{' '}
            {character.confrontationsResolved === 1
              ? 'confrontation résolue'
              : 'confrontations résolues'}
          </span>
        </p>
      </SheetHeader>

      <SheetSection title="Déclarations">
        {statements.length === 0 ? (
          <p className="muted">Aucune déclaration recueillie.</p>
        ) : (
          <ul className="casefile-statements">
            {standing.map((s) => (
              <StatementRow key={s.id} statement={s} historic={false} onNavigate={onNavigate} />
            ))}
            {historic.map((s) => (
              <StatementRow key={s.id} statement={s} historic onNavigate={onNavigate} />
            ))}
          </ul>
        )}
      </SheetSection>

      <SheetSection title={`Ce que ${character.name} a perçu`}>
        {character.perceptions.length === 0 ? (
          <p className="muted">Aucune perception révélée.</p>
        ) : (
          <ul className="casefile-perceptions">
            {character.perceptions.map((p) => {
              const fact = p.factLabel
                ? view.facts.find((f) => f.label === p.factLabel)
                : undefined;
              return (
                <li key={p.id} className="casefile-perception">
                  <span className="casefile-badges">
                    <span className="tag">{MODALITY_LABELS[p.modality] ?? p.modality}</span>
                    <span className="tag">
                      fidélité {FIDELITY_LABELS[p.fidelity] ?? p.fidelity}
                    </span>
                  </span>
                  {p.perceivedTags.length > 0 && (
                    <span className="casefile-chips">
                      {p.perceivedTags.map((tag) => (
                        <span key={tag} className="casefile-chip">
                          {tag}
                        </span>
                      ))}
                    </span>
                  )}
                  {p.factLabel &&
                    (fact ? (
                      <button
                        type="button"
                        className="casefile-link"
                        onClick={() => onNavigate('fact', fact.id)}
                      >
                        Fait lié : {p.factLabel}
                      </button>
                    ) : (
                      <span className="muted">Fait lié : {p.factLabel}</span>
                    ))}
                </li>
              );
            })}
          </ul>
        )}
      </SheetSection>

      <SheetSection title="Aveux publics">
        {character.admittedLabels.length === 0 ? (
          <p className="muted">Aucun aveu public.</p>
        ) : (
          <ul className="casefile-bullets">
            {character.admittedLabels.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        )}
      </SheetSection>

      {compact ? (
        <>
          {probeHint && <p className="field-hint">{probeHint}</p>}
          {probeForm}
          {reactionBlock}
          {actions}
        </>
      ) : (
        <>
          {actions}
          {probeHint && <p className="field-hint">{probeHint}</p>}
          {probeForm}
          {reactionBlock}
        </>
      )}
    </article>
  );
}
