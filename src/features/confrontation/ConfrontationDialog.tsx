/**
 * Dialogue de confrontation (GDD §8, §6.3, §6.4).
 *
 * Assistant en étapes visibles simultanément : protagoniste, cible (déclaration ou hypothèse
 * → sondage), pièce d'appui facultative, approche, aperçu de recevabilité. La soumission passe
 * par `dispatch` ; une erreur du moteur est affichée comme telle (jamais comme une réponse du jeu) ;
 * un succès affiche `ConfrontationResult`. Le brouillon vit dans le store (`confrontationDraft`)
 * et survit à la fermeture.
 *
 * Les actions du store sont stables : elles sont lues via `useGameStore.getState()` au moment
 * du geste, ce qui évite de détacher une méthode de son objet.
 */
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type RefObject,
  type SubmitEvent,
} from 'react';
import { Portrait } from '@/components/portrait';
import { DegreeBadge, Dialog } from '@/components/ui';
import { trustState } from '@/domain/endings/signatures';
import type { Approach } from '@/domain/model/scenario';
import {
  selectConfrontationOption,
  type CharacterView,
  type HypothesisView,
} from '@/domain/selectors/playerView';
import { useGameStore, usePlayerView } from '@/state';
import { APPROACH_LABELS } from './approaches';
import { ApproachPicker } from './ApproachPicker';
import { ConfrontationResult, type ResultPiece } from './ConfrontationResult';
import { TRUST_PORTRAIT, trustBelow, type TrustLabel } from './trust';
import { TrustMark } from './TrustMark';
import './confrontation.css';

const HYPOTHESIS_RADIO_VALUE = '__hypothesis__';

/** Fermeture stable (référence constante pour le piège de focus du Dialog). */
const closeDialog = (): void => {
  useGameStore.getState().closeDialog();
};

interface ResultData {
  mode: 'confrontation' | 'probe';
  characterId: string;
  actionIndex: number;
  approach: Approach;
  responseText: string;
  trustBefore: TrustLabel;
  pressureBefore: number;
  unlockedEvidenceIds: readonly string[];
  unlockedStatementIds: readonly string[];
}

type Verdict =
  | { kind: 'incomplete'; message: string }
  | { kind: 'invalid'; message: string }
  | { kind: 'ready'; message: string }
  | { kind: 'probe'; message: string };

const VERDICT_PRESENTATION: Record<Verdict['kind'], { glyph: string; label: string }> = {
  ready: { glyph: '✓', label: 'Recevable' },
  invalid: { glyph: '✕', label: 'Non recevable' },
  incomplete: { glyph: '…', label: 'À compléter' },
  probe: { glyph: '◌', label: 'Sondage' },
};

function shorten(text: string, max = 72): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** Dialogue « Confrontation », piloté par `dialog === 'confrontation'` dans le store. */
export function ConfrontationDialog(): React.JSX.Element {
  const open = useGameStore((s) => s.dialog === 'confrontation');
  /** Combinaisons invalides déjà comptées comme impasses (une seule fois chacune). */
  const seenImpasses = useRef<Set<string>>(new Set());
  return (
    <Dialog
      open={open}
      title="Confrontation"
      onClose={closeDialog}
      width={720}
      className="confrontation-dialog"
    >
      {open ? <ConfrontationBody seenImpasses={seenImpasses} /> : null}
    </Dialog>
  );
}

interface BodyProps {
  seenImpasses: RefObject<Set<string>>;
}

function ConfrontationBody({ seenImpasses }: BodyProps): React.JSX.Element {
  const view = usePlayerView();
  const scenario = useGameStore((s) => s.scenario);
  const game = useGameStore((s) => s.game);
  const draft = useGameStore((s) => s.confrontationDraft);

  const ids = useId();
  const [probeChosen, setProbeChosen] = useState(false);
  const [hypothesisPick, setHypothesisPick] = useState<string | null>(null);
  const [result, setResult] = useState<ResultData | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const targetLegendRef = useRef<HTMLLegendElement>(null);
  const refocusTarget = useRef(false);

  // --- dérivations -----------------------------------------------------------
  const characters = view?.characters ?? [];
  const hypotheses: readonly HypothesisView[] = view?.hypotheses ?? [];
  const statements = view?.statements ?? [];
  const evidence = view?.evidence ?? [];
  const pressure = view?.pressure ?? 0;
  const pressureMax = view?.pressureMax ?? 0;

  const character = characters.find((c) => c.id === draft.characterId) ?? null;
  const targetHypothesis =
    draft.targetId !== null ? (hypotheses.find((h) => h.id === draft.targetId) ?? null) : null;
  const probeMode = probeChosen || targetHypothesis !== null;
  const ownStatements = character ? statements.filter((s) => s.speakerId === character.id) : [];
  const targetStatement =
    !probeMode && draft.targetId !== null
      ? (ownStatements.find((s) => s.id === draft.targetId) ?? null)
      : null;
  const targetEvidence =
    !probeMode && draft.targetId !== null && targetStatement === null
      ? (evidence.find((e) => e.id === draft.targetId) ?? null)
      : null;

  const supportStatements = statements.filter(
    (s) => s.standing && s.speakerId !== character?.id && s.id !== draft.targetId,
  );
  const supportKnown =
    draft.supportId !== null &&
    (evidence.some((e) => e.id === draft.supportId) ||
      supportStatements.some((s) => s.id === draft.supportId));
  const supportId = supportKnown && !probeMode ? draft.supportId : null;

  const option = useMemo(() => {
    if (!scenario || !game || !character || probeMode || draft.targetId === null) return null;
    return selectConfrontationOption(
      scenario,
      game,
      character.id,
      draft.targetId,
      supportId ?? undefined,
    );
  }, [scenario, game, character, probeMode, draft.targetId, supportId]);

  // --- verdict ------------------------------------------------------------------
  let verdict: Verdict;
  if (!view) {
    verdict = { kind: 'invalid', message: 'Aucune partie en cours.' };
  } else if (view.isSealed) {
    verdict = {
      kind: 'invalid',
      message: 'Le rapport est scellé : plus aucune confrontation n’est possible.',
    };
  } else if (!character) {
    verdict = { kind: 'incomplete', message: 'Choisissez d’abord un protagoniste.' };
  } else if (probeMode) {
    verdict = targetHypothesis
      ? {
          kind: 'probe',
          message: `Sans coût de pression : ${character.name} réagit publiquement à l’hypothèse « ${targetHypothesis.label} ».`,
        }
      : { kind: 'incomplete', message: 'Choisissez l’hypothèse à soumettre.' };
  } else if (draft.targetId === null || (targetStatement === null && targetEvidence === null)) {
    verdict = {
      kind: 'incomplete',
      message: `Choisissez une déclaration de ${character.name} à confronter, ou une hypothèse à sonder.`,
    };
  } else if (!option || !option.valid || option.cost === null) {
    verdict = { kind: 'invalid', message: option?.message ?? 'Combinaison non recevable.' };
  } else if (option.cost > pressure) {
    verdict = {
      kind: 'invalid',
      message: `Pression insuffisante : coût ${option.cost}, disponible ${pressure}/${pressureMax}. Une observation nouvelle ou une contradiction résolue peut en rendre.`,
    };
  } else {
    const required: TrustLabel | null =
      option.requiresTrustAtLeast !== null ? trustState(option.requiresTrustAtLeast) : null;
    if (required !== null && trustBelow(character.trustState, required)) {
      verdict = {
        kind: 'invalid',
        message: `${character.name} est ${character.trustState} : cette confrontation exige une confiance au moins « ${required} ». Gagnez d’abord sa confiance.`,
      };
    } else {
      const base = `Coût : ${option.cost} — disponible ${pressure}/${pressureMax}.`;
      verdict = {
        kind: 'ready',
        message:
          required !== null
            ? `${base} Exige une confiance au moins « ${required} » (actuellement : ${character.trustState}).`
            : base,
      };
    }
  }
  const canSubmit = verdict.kind === 'ready' || verdict.kind === 'probe';

  // --- impasses : une seule fois par combinaison invalide ---------------------
  const comboKey =
    character && !probeMode && draft.targetId !== null
      ? `${character.id}|${draft.targetId}|${supportId ?? ''}`
      : null;
  const impasse = result === null && comboKey !== null && verdict.kind === 'invalid';
  useEffect(() => {
    if (!impasse || comboKey === null) return;
    const seen = seenImpasses.current;
    if (seen.has(comboKey)) return;
    seen.add(comboKey);
    useGameStore.getState().noteImpasse();
  }, [impasse, comboKey, seenImpasses]);

  // Retour au formulaire après « Autre confrontation » : focus sur l'étape Cible.
  useEffect(() => {
    if (result !== null || !refocusTarget.current) return;
    refocusTarget.current = false;
    targetLegendRef.current?.focus();
  }, [result]);

  // --- gestes -------------------------------------------------------------------
  const pickCharacter = (c: CharacterView) => {
    const keepTarget =
      draft.targetId !== null &&
      (hypotheses.some((h) => h.id === draft.targetId) ||
        c.statementIds.some((id) => id === draft.targetId));
    const supportIsOwn =
      draft.supportId !== null && c.statementIds.some((id) => id === draft.supportId);
    useGameStore.getState().setConfrontationDraft({
      characterId: c.id,
      targetId: keepTarget ? draft.targetId : null,
      supportId: supportIsOwn ? null : draft.supportId,
    });
    setSubmitError(null);
  };
  const pickStatement = (id: string) => {
    setProbeChosen(false);
    useGameStore.getState().setConfrontationDraft({ targetId: id });
    setSubmitError(null);
  };
  const pickProbe = () => {
    setProbeChosen(true);
    useGameStore
      .getState()
      .setConfrontationDraft({ targetId: hypothesisPick ?? targetHypothesis?.id ?? null });
    setSubmitError(null);
  };
  const pickHypothesis = (raw: string) => {
    const id = raw === '' ? null : raw;
    setHypothesisPick(id);
    setProbeChosen(true);
    useGameStore.getState().setConfrontationDraft({ targetId: id });
    setSubmitError(null);
  };
  const pickSupport = (raw: string) => {
    useGameStore.getState().setConfrontationDraft({ supportId: raw === '' ? null : raw });
    setSubmitError(null);
  };
  const pickApproach = (approach: Approach) => {
    useGameStore.getState().setConfrontationDraft({ approach });
  };
  const another = () => {
    useGameStore
      .getState()
      .setConfrontationDraft({ targetId: null, supportId: null, approach: 'neutral' });
    setProbeChosen(false);
    setHypothesisPick(null);
    setResult(null);
    setSubmitError(null);
    refocusTarget.current = true;
  };
  const openEvidence = (id: string) => {
    useGameStore.getState().select('evidence', id, { space: 'casefile' });
    closeDialog();
  };
  const openStatement = (id: string) => {
    useGameStore.getState().select('statement', id, { space: 'casefile' });
    closeDialog();
  };

  const onSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!view || !character || draft.targetId === null || !canSubmit) return;
    const store = useGameStore.getState();
    const base = {
      characterId: character.id,
      approach: draft.approach,
      trustBefore: character.trustState,
      pressureBefore: view.pressure,
    };
    if (probeMode) {
      const r = store.dispatch({
        type: 'probe',
        characterId: character.id,
        targetId: draft.targetId,
        approach: draft.approach,
      });
      if (!r.ok) {
        setSubmitError(r.error.message);
        return;
      }
      const record = r.state.probeHistory.at(-1);
      const text = record?.text ?? '';
      setResult({
        ...base,
        mode: 'probe',
        actionIndex: record?.actionIndex ?? r.state.actionCount - 1,
        responseText: text,
        unlockedEvidenceIds: [],
        unlockedStatementIds: [],
      });
      store.highlight([character.id]);
      store.announce(`${character.name} réagit au sondage : ${text}`);
    } else {
      const r = store.dispatch({
        type: 'confront',
        characterId: character.id,
        targetId: draft.targetId,
        approach: draft.approach,
        ...(supportId !== null ? { supportId } : {}),
      });
      if (!r.ok) {
        setSubmitError(r.error.message);
        return;
      }
      const record = r.state.confrontationHistory.at(-1);
      const unlockedEvidenceIds = record?.unlockedEvidenceIds ?? [];
      const unlockedStatementIds = record?.unlockedStatementIds ?? [];
      setResult({
        ...base,
        mode: 'confrontation',
        actionIndex: record?.actionIndex ?? r.state.actionCount - 1,
        responseText: record?.responseText ?? '',
        unlockedEvidenceIds,
        unlockedStatementIds,
      });
      store.highlight([character.id, ...unlockedEvidenceIds]);
      const trustAfter = trustState(r.state.characters[character.id]?.trust ?? 0);
      const trustPart =
        trustAfter === character.trustState
          ? `confiance inchangée (${trustAfter})`
          : `confiance ${character.trustState} → ${trustAfter}`;
      store.announce(
        `${character.name} répond (approche ${APPROACH_LABELS[draft.approach]}) : ${unlockedEvidenceIds.length} nouvelle(s) pièce(s), ${unlockedStatementIds.length} précision(s), ${trustPart}, pression restante ${r.state.pressure}/${view.pressureMax}.`,
      );
    }
    setSubmitError(null);
  };

  // --- rendu : résultat ---------------------------------------------------------
  if (!view) {
    return <p className="muted">Aucune partie en cours : ouvrez ou lancez une partie.</p>;
  }

  if (result !== null) {
    const after = view.characters.find((c) => c.id === result.characterId);
    if (after) {
      const newEvidence: ResultPiece[] = result.unlockedEvidenceIds.flatMap((id) => {
        const e = view.evidence.find((x) => x.id === id);
        return e ? [{ id: e.id, label: e.label }] : [];
      });
      const newStatements: ResultPiece[] = result.unlockedStatementIds.flatMap((id) => {
        const s = view.statements.find((x) => x.id === id);
        return s ? [{ id: s.id, label: s.text }] : [];
      });
      const annotations = view.journal
        .filter((j) => j.actionIndex === result.actionIndex && j.handwritten === true)
        .map((j) => j.text);
      return (
        <ConfrontationResult
          mode={result.mode}
          character={after}
          approach={result.approach}
          responseText={result.responseText}
          trustBefore={result.trustBefore}
          trustAfter={after.trustState}
          pressureBefore={result.pressureBefore}
          pressure={view.pressure}
          pressureMax={view.pressureMax}
          newEvidence={newEvidence}
          newStatements={newStatements}
          annotations={annotations}
          onOpenEvidence={openEvidence}
          onOpenStatement={openStatement}
          onAnother={another}
          onClose={closeDialog}
        />
      );
    }
  }

  // --- rendu : formulaire -------------------------------------------------------
  const verdictId = `${ids}-verdict`;
  const presentation = VERDICT_PRESENTATION[verdict.kind];
  const supportHintId = `${ids}-support-hint`;
  const hypothesisSelectId = `${ids}-hypothesis`;

  return (
    <form className="confrontation-form" onSubmit={onSubmit} noValidate>
      <p className="muted confrontation-intro">
        Une confrontation combine un protagoniste, une cible, une pièce d’appui facultative et une
        approche. Une combinaison non recevable ne consomme jamais de pression.
      </p>

      <div className="confrontation-pressure">
        <span>Pression disponible</span>
        <meter
          min={0}
          max={view.pressureMax}
          value={view.pressure}
          aria-label={`Pression disponible : ${view.pressure} sur ${view.pressureMax}`}
        />
        <span className="tabular">
          {view.pressure}/{view.pressureMax}
        </span>
      </div>

      {/* (a) Protagoniste */}
      <fieldset className="confrontation-step">
        <legend>
          <span className="confrontation-step-index" aria-hidden="true">
            1
          </span>
          Protagoniste
        </legend>
        <div className="confrontation-list">
          {view.characters.map((c) => (
            <label key={c.id} className="confrontation-choice" data-with-portrait="true">
              <input
                type="radio"
                name={`${ids}-character`}
                value={c.id}
                checked={character?.id === c.id}
                onChange={() => pickCharacter(c)}
              />
              <span aria-hidden="true" className="confrontation-portrait">
                <Portrait
                  seed={c.portraitSeed}
                  accentColor={c.accentColor}
                  name={c.name}
                  size={40}
                  state={TRUST_PORTRAIT[c.trustState]}
                />
              </span>
              <span className="confrontation-choice-title">{c.name}</span>
              <span className="confrontation-choice-meta">
                <span>{c.role}</span>
                <TrustMark trust={c.trustState} prefix="Confiance :" />
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* (b) Cible */}
      <fieldset className="confrontation-step">
        <legend ref={targetLegendRef} tabIndex={-1}>
          <span className="confrontation-step-index" aria-hidden="true">
            2
          </span>
          Cible
        </legend>
        {!character ? (
          <p className="field-hint">
            Choisissez d’abord un protagoniste : ses déclarations apparaîtront ici.
          </p>
        ) : (
          <>
            <div className="confrontation-list">
              {ownStatements.length === 0 ? (
                <p className="field-hint">
                  Aucune déclaration de {character.name} n’est encore au dossier.
                </p>
              ) : null}
              {ownStatements.map((s) => {
                const retracted = !s.standing;
                const retractedId = `${ids}-retracted-${s.id}`;
                return (
                  <label
                    key={s.id}
                    className="confrontation-choice"
                    title={
                      retracted
                        ? 'Déclaration rétractée : elle ne tient plus, on ne peut plus la confronter.'
                        : undefined
                    }
                  >
                    <input
                      type="radio"
                      name={`${ids}-target`}
                      value={s.id}
                      checked={!probeMode && draft.targetId === s.id}
                      disabled={retracted}
                      onChange={() => pickStatement(s.id)}
                      aria-describedby={retracted ? retractedId : undefined}
                    />
                    <span className="confrontation-choice-title">
                      <DegreeBadge degree={s.degree} />
                      {retracted ? (
                        <span className="tag" id={retractedId}>
                          rétractée
                        </span>
                      ) : null}
                    </span>
                    <span className="confrontation-quote">« {s.text} »</span>
                    <span className="confrontation-choice-meta">{s.propositionLabel}</span>
                  </label>
                );
              })}
              {targetEvidence ? (
                <label className="confrontation-choice">
                  <input
                    type="radio"
                    name={`${ids}-target`}
                    value={targetEvidence.id}
                    checked
                    onChange={() => pickStatement(targetEvidence.id)}
                  />
                  <span className="confrontation-choice-title">
                    <DegreeBadge degree={targetEvidence.degree} />
                    Trace : {targetEvidence.label}
                  </span>
                  <span className="confrontation-choice-meta">{targetEvidence.playerText}</span>
                </label>
              ) : null}
              <label className="confrontation-choice">
                <input
                  type="radio"
                  name={`${ids}-target`}
                  value={HYPOTHESIS_RADIO_VALUE}
                  checked={probeMode}
                  onChange={pickProbe}
                />
                <span className="confrontation-choice-title">
                  Hypothèse <span className="tag">sondage</span>
                </span>
                <span className="confrontation-choice-meta">
                  Soumettre une hypothèse à {character.name} pour recueillir sa réaction, sans pièce
                  d’appui ni coût de pression.
                </span>
              </label>
            </div>
            {probeMode ? (
              <div className="field">
                <label className="field-label" htmlFor={hypothesisSelectId}>
                  Hypothèse à sonder
                </label>
                <select
                  id={hypothesisSelectId}
                  className="select"
                  value={targetHypothesis?.id ?? ''}
                  onChange={(e) => pickHypothesis(e.target.value)}
                >
                  <option value="">— Choisir une hypothèse —</option>
                  {view.slots.map((slot) => {
                    const inSlot = hypotheses.filter((h) => h.slotId === slot.id);
                    if (inSlot.length === 0) return null;
                    return (
                      <optgroup key={slot.id} label={slot.label}>
                        {inSlot.map((h) => (
                          <option key={h.id} value={h.id}>
                            {h.label}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
              </div>
            ) : null}
          </>
        )}
      </fieldset>

      {/* (c) Pièce d'appui */}
      <div className="confrontation-step field">
        <label className="confrontation-step-title" htmlFor={`${ids}-support`}>
          <span className="confrontation-step-index" aria-hidden="true">
            3
          </span>
          Pièce d’appui (facultative)
        </label>
        <select
          id={`${ids}-support`}
          className="select"
          value={supportId ?? ''}
          onChange={(e) => pickSupport(e.target.value)}
          disabled={probeMode}
          aria-describedby={supportHintId}
          title={probeMode ? 'Un sondage ne prend pas de pièce d’appui.' : undefined}
        >
          <option value="">Aucune</option>
          {evidence.length > 0 ? (
            <optgroup label="Traces">
              {evidence.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </optgroup>
          ) : null}
          {supportStatements.length > 0 ? (
            <optgroup label="Déclarations d’autres personnes">
              {supportStatements.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.speakerName} : « {shorten(s.text)} »
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
        <p id={supportHintId} className="field-hint">
          {probeMode
            ? 'Un sondage ne prend pas de pièce d’appui : la réaction porte sur l’hypothèse seule.'
            : 'Une pièce qui contredit directement la déclaration visée rend la confrontation recevable.'}
        </p>
      </div>

      {/* (d) Approche */}
      <ApproachPicker
        name={`${ids}-approach`}
        value={draft.approach}
        onChange={pickApproach}
        step={4}
      />

      {/* (e) Aperçu */}
      <section className="confrontation-preview" aria-labelledby={`${ids}-preview-title`}>
        <h3 id={`${ids}-preview-title`} className="confrontation-step-title">
          <span className="confrontation-step-index" aria-hidden="true">
            5
          </span>
          Aperçu
        </h3>
        <p id={verdictId} className="confrontation-verdict" data-tone={verdict.kind}>
          <span className="confrontation-verdict-glyph" aria-hidden="true">
            {presentation.glyph}
          </span>
          <span>
            <span className="confrontation-verdict-label">{presentation.label}</span>
            {' — '}
            {verdict.message}
          </span>
        </p>
        {submitError !== null ? (
          <div role="alert" className="confrontation-alert">
            <span aria-hidden="true">⚠</span>
            <span>
              <strong>Action refusée par le moteur</strong> — {submitError} Le formulaire est
              conservé et aucune pression n’a été consommée.
            </span>
          </div>
        ) : null}
        <div className="confrontation-actions">
          <button type="button" className="btn btn-ghost" onClick={closeDialog}>
            Annuler
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!canSubmit}
            aria-describedby={verdictId}
            title={canSubmit ? undefined : verdict.message}
          >
            {probeMode ? 'Sonder' : 'Confronter'}
          </button>
        </div>
      </section>
    </form>
  );
}
