/**
 * Formulaire d'hypothèse (GDD §6.2) : choix de l'hypothèse pour un emplacement, puis acteur,
 * lieu et intervalle (horloge HH:MM:SS convertie en secondes simulées). Validation locale,
 * erreur du moteur affichée sans fermer, annonce et mise en évidence après placement.
 * Mode compact (`compact`, sinon déduit du viewport < 1024 px) : boutons « −10 s / −1 s /
 * +1 s / +10 s » sous chaque champ d'heure, bouton « Placer dans la version » collant en bas.
 */
import { useCallback, useId, useRef, useState, type JSX, type SyntheticEvent } from 'react';
import { useIsDesktop } from '@/accessibility/useIsDesktop';
import { Dialog, STATUS_LABELS } from '@/components/ui';
import type { PlayerAction } from '@/domain/model/actions';
import type { ClaimSlot, LoadedScenario, Zone } from '@/domain/model/scenario';
import { interval } from '@/domain/model/time';
import type { PlayerClaim } from '@/domain/model/version';
import type { HypothesisView, PlayerView } from '@/domain/selectors/playerView';
import { selectPlayerView } from '@/domain/selectors/playerView';
import { useGameStore, usePlayerView } from '@/state';
import { api, clockToOffset, describeVersion, formatDuration } from './labels';
import './version-board.css';

export interface ClaimFormDialogProps {
  /** Mode compact ; omis : déduit du viewport (compact sous 1024 px). */
  compact?: boolean;
}

/** Pas d'ajustement des champs d'heure en mode compact (secondes). */
const NUDGES: readonly number[] = [-10, -1, 1, 10];

function nudgeLabel(delta: number): string {
  return `${delta < 0 ? '−' : '+'}${Math.abs(delta)} s`;
}

export function ClaimFormDialog({ compact }: ClaimFormDialogProps = {}): JSX.Element | null {
  const view = usePlayerView();
  const scenario = useGameStore((s) => s.scenario);
  const dialog = useGameStore((s) => s.dialog);
  const claimForm = useGameStore((s) => s.claimForm);
  const isDesktop = useIsDesktop();
  const onClose = useCallback(() => {
    api().closeDialog();
  }, []);

  if (dialog !== 'claim-form' || !claimForm || !view || !scenario) return null;
  const slot = view.slots.find((s) => s.id === claimForm.slotId);
  if (!slot) return null;

  return (
    <Dialog open title={`Hypothèse — ${slot.label}`} onClose={onClose} width={640}>
      <ClaimFormBody
        key={slot.id}
        view={view}
        scenario={scenario}
        slot={slot}
        initialHypothesisId={claimForm.hypothesisId}
        compact={compact ?? !isDesktop}
        onClose={onClose}
      />
    </Dialog>
  );
}

interface Draft {
  hypothesisId: string;
  actorId: string;
  zoneId: string;
  start: string;
  end: string;
}

function draftFor(
  h: HypothesisView | undefined,
  claim: PlayerClaim | undefined,
  clock: (t: number) => string,
): Draft {
  if (!h) return { hypothesisId: '', actorId: '', zoneId: '', start: clock(0), end: clock(60) };
  const fromClaim = claim?.hypothesisId === h.id ? claim : undefined;
  const iv = fromClaim?.interval ?? h.defaultInterval;
  return {
    hypothesisId: h.id,
    actorId: fromClaim?.actorId ?? h.defaultActorId ?? '',
    zoneId: fromClaim?.zoneId ?? h.defaultZoneId ?? '',
    start: clock(iv ? iv.start : 0),
    end: clock(iv ? iv.end : 60),
  };
}

interface ClaimFormBodyProps {
  view: PlayerView;
  scenario: LoadedScenario;
  slot: ClaimSlot;
  initialHypothesisId: string | null;
  compact: boolean;
  onClose: () => void;
}

/** Corps du formulaire : monté à chaque ouverture (état remis à zéro par la clé). */
function ClaimFormBody({
  view,
  scenario,
  slot,
  initialHypothesisId,
  compact,
  onClose,
}: ClaimFormBodyProps): JSX.Element {
  const zones: readonly Zone[] = scenario.data.zones;
  const options = view.hypotheses.filter((h) => h.slotId === slot.id);
  const current = view.version.claims[slot.id];
  const initial =
    options.find((h) => h.id === initialHypothesisId) ??
    options.find((h) => h.id === current?.hypothesisId) ??
    options[0];
  const [draft, setDraft] = useState<Draft>(() => draftFor(initial, current, view.clock));
  const [attempted, setAttempted] = useState(false);
  const [domainError, setDomainError] = useState<string | null>(null);
  const ids = useId();
  const actorRef = useRef<HTMLSelectElement>(null);
  const startRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLInputElement>(null);

  const hypothesis = options.find((h) => h.id === draft.hypothesisId);
  const actor = view.characters.find((c) => c.id === draft.actorId);
  const zone = zones.find((z) => z.id === draft.zoneId);
  const defaultActor = hypothesis?.defaultActorId
    ? view.characters.find((c) => c.id === hypothesis.defaultActorId)
    : undefined;
  const defaultZone = hypothesis?.defaultZoneId
    ? zones.find((z) => z.id === hypothesis.defaultZoneId)
    : undefined;
  const withInterval = hypothesis?.defaultInterval !== undefined;
  const sealed = view.isSealed;

  const startOff = clockToOffset(view.startClock, draft.start);
  const endOff = clockToOffset(view.startClock, draft.end);
  const duration = view.durationSeconds;
  const endClock = view.clock(duration);
  const inWindow = (t: number | null): t is number => t !== null && t >= 0 && t <= duration;
  const clamp = (t: number): number => Math.min(duration, Math.max(0, t));

  const errors: { actor?: string; start?: string; end?: string } = {};
  if (hypothesis?.requiresActor && !actor) {
    errors.actor = 'Cette hypothèse exige de désigner un acteur.';
  }
  if (withInterval) {
    if (startOff === null) errors.start = 'Heure de début invalide : format attendu HH:MM:SS.';
    else if (!inWindow(startOff)) {
      errors.start = `Le début doit être compris entre ${view.startClock} et ${endClock}.`;
    }
    if (endOff === null) errors.end = 'Heure de fin invalide : format attendu HH:MM:SS.';
    else if (!inWindow(endOff)) {
      errors.end = `La fin doit être comprise entre ${view.startClock} et ${endClock}.`;
    } else if (startOff !== null && endOff <= startOff) {
      errors.end = 'La fin doit être postérieure au début.';
    }
  }
  const hasErrors = Object.keys(errors).length > 0;
  const showErrors = attempted;

  const onHypothesisChange = (id: string): void => {
    const next = options.find((h) => h.id === id);
    setDraft(draftFor(next, current, view.clock));
    setDomainError(null);
  };

  /**
   * Ajuste un champ d'heure de `delta` secondes, borné à la fenêtre du scénario. Une saisie
   * invalide repart du début de la fenêtre (début) ou du début saisi (fin).
   */
  const nudge = (field: 'start' | 'end', delta: number): void => {
    setDraft((d) => {
      const currentOff = clockToOffset(view.startClock, d[field]);
      const other = clockToOffset(view.startClock, field === 'start' ? d.end : d.start);
      const fallback = field === 'start' ? 0 : inWindow(other) ? other : 0;
      const base = currentOff === null ? fallback : clamp(currentOff);
      return { ...d, [field]: view.clock(clamp(base + delta)) };
    });
    setDomainError(null);
  };

  const onSubmit = (e: SyntheticEvent<HTMLFormElement>): void => {
    e.preventDefault();
    setAttempted(true);
    if (!hypothesis || sealed) return;
    if (hasErrors) {
      const target = errors.actor ? actorRef : errors.start ? startRef : endRef;
      target.current?.focus();
      return;
    }
    const action: PlayerAction = {
      type: 'set-claim',
      slotId: slot.id,
      hypothesisId: hypothesis.id,
      ...(actor ? { actorId: actor.id } : {}),
      ...(zone ? { zoneId: zone.id } : {}),
      ...(withInterval && startOff !== null && endOff !== null
        ? { interval: interval(startOff, endOff) }
        : {}),
    };
    const result = api().dispatch(action);
    if (!result.ok) {
      setDomainError(result.error.message);
      return;
    }
    setDomainError(null);
    const next = selectPlayerView(scenario, result.state);
    const status = next.version.slots.find((s) => s.slotId === slot.id)?.status ?? 'unknown';
    const placed = next.version.claims[slot.id];
    api().announce(
      `Hypothèse placée : « ${hypothesis.label} » — statut ${STATUS_LABELS[status]}. ${describeVersion(next.version)}`,
    );
    const highlightIds = [placed?.zoneId, placed?.actorId].filter(
      (id): id is NonNullable<typeof id> => id !== undefined,
    );
    if (highlightIds.length > 0) api().highlight(highlightIds);
    onClose();
  };

  const describedBy = (...parts: (string | false | undefined)[]): string | undefined => {
    const list = parts.filter((p): p is string => typeof p === 'string' && p.length > 0);
    return list.length > 0 ? list.join(' ') : undefined;
  };

  const renderNudges = (field: 'start' | 'end'): JSX.Element | null => {
    if (!compact) return null;
    return (
      <div
        className="claim-form-nudges"
        role="group"
        aria-label={field === 'start' ? 'Ajuster le début' : 'Ajuster la fin'}
      >
        {NUDGES.map((delta) => (
          <button
            key={delta}
            type="button"
            className="btn claim-form-nudge"
            disabled={sealed}
            onClick={() => {
              nudge(field, delta);
            }}
          >
            {nudgeLabel(delta)}
          </button>
        ))}
      </div>
    );
  };

  return (
    <form
      className="claim-form"
      data-compact={compact ? 'true' : undefined}
      onSubmit={onSubmit}
      noValidate
    >
      <p className="vb-note">{slot.prompt}</p>

      {options.length === 0 ? (
        <p className="vb-alert" role="alert">
          Aucune hypothèse formulable pour cet emplacement : il manque des pièces.
        </p>
      ) : (
        <div className="field">
          <label htmlFor={`${ids}-hyp`} className="field-label">
            Hypothèse
          </label>
          <select
            id={`${ids}-hyp`}
            className="select"
            value={draft.hypothesisId}
            onChange={(e) => {
              onHypothesisChange(e.target.value);
            }}
            data-autofocus
          >
            {options.map((h) => (
              <option key={h.id} value={h.id}>
                {h.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {hypothesis ? (
        <>
          <p className="claim-form-summary">{hypothesis.summary}</p>
          <div className="claim-form-tags">
            <span className="tag">{slot.label}</span>
            {hypothesis.accusatory ? <span className="tag">désigne une personne</span> : null}
            {hypothesis.hasWorldEffect ? (
              <span className="tag">insère un événement dans le monde proposé</span>
            ) : null}
            {current && current.hypothesisId !== hypothesis.id ? (
              <span className="tag">remplacera l’hypothèse en place</span>
            ) : null}
          </div>

          <div className="claim-form-grid">
            <div className="field">
              <label htmlFor={`${ids}-actor`} className="field-label">
                Acteur{hypothesis.requiresActor ? ' (requis)' : ''}
              </label>
              <select
                ref={actorRef}
                id={`${ids}-actor`}
                className="select"
                value={draft.actorId}
                aria-invalid={showErrors && errors.actor ? true : undefined}
                aria-describedby={describedBy(
                  `${ids}-actor-hint`,
                  showErrors && errors.actor ? `${ids}-actor-err` : false,
                )}
                onChange={(e) => {
                  setDraft((d) => ({ ...d, actorId: e.target.value }));
                }}
              >
                <option value="">
                  {hypothesis.requiresActor
                    ? '— Désigner un acteur —'
                    : defaultActor
                      ? `Par défaut (${defaultActor.name})`
                      : 'Aucun acteur'}
                </option>
                {view.characters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.role}
                  </option>
                ))}
              </select>
              <p id={`${ids}-actor-hint`} className="field-hint">
                {hypothesis.requiresActor
                  ? 'L’hypothèse ne désigne personne par elle-même.'
                  : 'Laissez « par défaut » pour garder la formulation d’origine.'}
              </p>
              {showErrors && errors.actor ? (
                <p id={`${ids}-actor-err`} className="field-error">
                  {errors.actor}
                </p>
              ) : null}
            </div>

            <div className="field">
              <label htmlFor={`${ids}-zone`} className="field-label">
                Lieu
              </label>
              <select
                id={`${ids}-zone`}
                className="select"
                value={draft.zoneId}
                onChange={(e) => {
                  setDraft((d) => ({ ...d, zoneId: e.target.value }));
                }}
              >
                <option value="">
                  {defaultZone ? `Par défaut (${defaultZone.label})` : 'Aucun lieu'}
                </option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {withInterval ? (
            <fieldset className="claim-form-fieldset">
              <legend className="field-label">Intervalle</legend>
              <p className="field-hint" id={`${ids}-window`}>
                Fenêtre du scénario : {view.startClock} → {endClock}. Saisie en horloge HH:MM:SS ;
                les secondes simulées sont calculées depuis {view.startClock}.
              </p>
              <div className="claim-form-time">
                <div className="field">
                  <label htmlFor={`${ids}-start`} className="field-label">
                    Début (horloge)
                  </label>
                  <input
                    ref={startRef}
                    id={`${ids}-start`}
                    className="input mono"
                    type="text"
                    inputMode="numeric"
                    placeholder="HH:MM:SS"
                    autoComplete="off"
                    value={draft.start}
                    aria-invalid={showErrors && errors.start ? true : undefined}
                    aria-describedby={describedBy(
                      `${ids}-window`,
                      `${ids}-start-sec`,
                      showErrors && errors.start ? `${ids}-start-err` : false,
                    )}
                    onChange={(e) => {
                      setDraft((d) => ({ ...d, start: e.target.value }));
                    }}
                  />
                  {renderNudges('start')}
                  <p id={`${ids}-start-sec`} className="field-hint mono">
                    {inWindow(startOff) ? `= ${startOff} s` : '= — s'}
                  </p>
                  {showErrors && errors.start ? (
                    <p id={`${ids}-start-err`} className="field-error">
                      {errors.start}
                    </p>
                  ) : null}
                </div>
                <div className="field">
                  <label htmlFor={`${ids}-end`} className="field-label">
                    Fin (horloge)
                  </label>
                  <input
                    ref={endRef}
                    id={`${ids}-end`}
                    className="input mono"
                    type="text"
                    inputMode="numeric"
                    placeholder="HH:MM:SS"
                    autoComplete="off"
                    value={draft.end}
                    aria-invalid={showErrors && errors.end ? true : undefined}
                    aria-describedby={describedBy(
                      `${ids}-window`,
                      `${ids}-end-sec`,
                      showErrors && errors.end ? `${ids}-end-err` : false,
                    )}
                    onChange={(e) => {
                      setDraft((d) => ({ ...d, end: e.target.value }));
                    }}
                  />
                  {renderNudges('end')}
                  <p id={`${ids}-end-sec`} className="field-hint mono">
                    {inWindow(endOff) ? `= ${endOff} s` : '= — s'}
                  </p>
                  {showErrors && errors.end ? (
                    <p id={`${ids}-end-err`} className="field-error">
                      {errors.end}
                    </p>
                  ) : null}
                </div>
              </div>
              <p className="claim-form-duration">
                Durée :{' '}
                {inWindow(startOff) && inWindow(endOff) && endOff > startOff
                  ? formatDuration(endOff - startOff)
                  : '— (intervalle invalide)'}
              </p>
            </fieldset>
          ) : (
            <p className="field-hint">Cette hypothèse ne porte pas d’horaire.</p>
          )}
        </>
      ) : null}

      {domainError ? (
        <p className="vb-alert" role="alert">
          <span className="tag">action refusée</span> {domainError}
        </p>
      ) : null}
      {sealed ? (
        <p id={`${ids}-sealed`} className="vb-note">
          Le rapport est scellé : la version ne peut plus être modifiée.
        </p>
      ) : null}

      <div className="claim-form-actions">
        <button type="button" className="btn" onClick={onClose}>
          Annuler
        </button>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={sealed || !hypothesis}
          title={sealed ? 'Le rapport est scellé.' : undefined}
          aria-describedby={sealed ? `${ids}-sealed` : undefined}
        >
          Placer dans la version
        </button>
      </div>
    </form>
  );
}
