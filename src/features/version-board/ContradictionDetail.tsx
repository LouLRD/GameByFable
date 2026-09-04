/**
 * Détail d'une contradiction (GDD §9) : titre, badges, éléments impliqués, explication en
 * étapes ordonnées, moyens de l'examiner — sans jamais donner la solution.
 * Mode compact (`compact`) : en-tête collant « ← Contradictions » + titre + badges, puis une
 * progression numérotée : 1) éléments incompatibles, 2) données utilisées, 3) raisonnement,
 * 4) instant ou condition, 5) conséquences pour la version. Les étapes viennent des `steps`
 * rendus par le domaine, rangées d'après `explanation[i].type` (même index) — rien n'est inventé.
 */
import { useId, type JSX, type RefObject } from 'react';
import type { ExplanationStep } from '@/domain/model/contradiction';
import type { SlotEvaluation } from '@/domain/model/evaluation';
import type { ClaimSlot } from '@/domain/model/scenario';
import type { RenderedStep } from '@/domain/contradictions/render';
import type { ContradictionView } from '@/domain/selectors/playerView';
import { KindBadge, SeverityBadge, StatusBadge } from '@/components/ui';
import type { SpaceId } from '@/state';
import { api, type ResolvedRef } from './labels';

export interface ContradictionDetailProps {
  contradiction: ContradictionView;
  resolve: (id: string) => ResolvedRef;
  clock: (t: number) => string;
  slots: ClaimSlot[];
  /** Vrai si la contradiction compte parmi celles qui bloquent la cohérence. */
  blocking: boolean;
  /** Mode compact : progression numérotée plein panneau avec en-tête collant. */
  compact?: boolean;
  /** Statuts des emplacements (section « Conséquences » du mode compact). */
  evaluations?: readonly SlotEvaluation[];
  /** Retour à la liste (mode compact). */
  onBack?: () => void;
  backRef?: RefObject<HTMLButtonElement | null>;
}

type StepRole = 'element' | 'data' | 'reasoning' | 'conclusion';

/** Rôle de chaque type d'étape dans la progression compacte (ordre d'origine conservé). */
const STEP_ROLES: Record<ExplanationStep['type'], StepRole> = {
  claim: 'element',
  statement: 'element',
  evidence: 'element',
  position: 'data',
  'absent-from-camera': 'data',
  travel: 'data',
  sight: 'data',
  sound: 'data',
  'signature-mismatch': 'reasoning',
  'timing-mismatch': 'reasoning',
  requires: 'reasoning',
  excludes: 'reasoning',
  'proposition-conflict': 'reasoning',
  'knowledge-gap': 'reasoning',
  discredited: 'reasoning',
  'arrival-too-late': 'reasoning',
  'departure-too-late': 'reasoning',
  overlap: 'reasoning',
  text: 'reasoning',
  conclusion: 'conclusion',
};

interface IndexedStep {
  index: number;
  step: RenderedStep;
  role: StepRole;
}

function spaceFor(kind: ResolvedRef['kind']): SpaceId {
  return kind === 'zone' ? 'map' : 'casefile';
}

export function ContradictionDetail({
  contradiction,
  resolve,
  clock,
  slots,
  blocking,
  compact = false,
  evaluations = [],
  onBack,
  backRef,
}: ContradictionDetailProps): JSX.Element {
  const baseId = useId();
  const social = contradiction.kind === 'motivational';

  const goTo = (at: number | undefined, zoneIds: readonly string[]) => {
    const store = api();
    if (at !== undefined) store.setCursor(at);
    if (zoneIds.length > 0) {
      store.highlight([...zoneIds]);
      const first = zoneIds[0];
      if (first) store.select('zone', first);
    }
    const parts: string[] = [];
    if (at !== undefined) parts.push(`curseur placé à ${clock(at)}`);
    if (zoneIds.length > 0) {
      parts.push(`zones mises en évidence : ${zoneIds.map((z) => resolve(z).label).join(', ')}`);
    }
    if (parts.length > 0) store.announce(`Examen : ${parts.join(' ; ')}.`);
  };

  /** Compact : bascule vers le plan sans toucher la sélection (le détail reste ouvert au retour). */
  const goToOnMap = (at: number | undefined, zoneIds: readonly string[]) => {
    const store = api();
    if (at !== undefined) store.setCursor(at);
    if (zoneIds.length > 0) store.highlight([...zoneIds]);
    store.setActiveSpace('map');
    const parts: string[] = [];
    if (at !== undefined) parts.push(`curseur placé à ${clock(at)}`);
    if (zoneIds.length > 0) {
      parts.push(`zones mises en évidence : ${zoneIds.map((z) => resolve(z).label).join(', ')}`);
    }
    store.announce(`Plan ouvert${parts.length > 0 ? ` : ${parts.join(' ; ')}` : ''}.`);
  };

  const zoneLabels = contradiction.inspectableZoneIds.map((z) => resolve(z).label);
  const slotLabels = contradiction.slotIds.map((id) => slots.find((s) => s.id === id)?.label ?? id);

  if (!compact) {
    return (
      <article
        className="ci-detail"
        aria-labelledby={`${baseId}-title`}
        data-kind={contradiction.kind}
        data-contradiction-id={contradiction.id}
      >
        <header className="vb-section">
          <div className="ci-badges">
            <SeverityBadge severity={contradiction.severity} />
            <KindBadge kind={contradiction.kind} />
            {social ? <span className="ci-social-tag">résistance sociale</span> : null}
            {blocking ? <span className="tag">bloquante</span> : null}
            {contradiction.involvesVersion ? (
              <span className="tag">implique la version</span>
            ) : (
              <span className="tag">entre témoignages</span>
            )}
          </div>
          <h3 id={`${baseId}-title`} className="ci-detail-title">
            {contradiction.title}
          </h3>
          {social ? (
            <p className="vb-note">
              Cette résistance pèse sur l’adhésion, pas sur la cohérence : la version reste
              matériellement possible.
            </p>
          ) : null}
          {slotLabels.length > 0 ? (
            <p className="vb-note">Emplacements concernés : {slotLabels.join(', ')}.</p>
          ) : null}
        </header>

        {contradiction.involvedIds.length > 0 ? (
          <section className="vb-section" aria-labelledby={`${baseId}-inv`}>
            <h4 id={`${baseId}-inv`} className="vb-section-title">
              Éléments impliqués
            </h4>
            <ul className="vb-list ci-chips">
              {contradiction.involvedIds.map((id) => {
                const ref = resolve(id);
                return (
                  <li key={id}>
                    {ref.kind ? (
                      <button
                        type="button"
                        className="chip"
                        onClick={() => {
                          if (ref.kind) api().select(ref.kind, ref.id);
                        }}
                      >
                        {ref.label}
                      </button>
                    ) : (
                      <span className="chip" aria-disabled="true">
                        {ref.label}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        <section className="vb-section" aria-labelledby={`${baseId}-exp`}>
          <h4 id={`${baseId}-exp`} className="vb-section-title">
            Explication
          </h4>
          <ol className="ci-steps">
            {contradiction.steps.map((step, i) => {
              const canView = step.at !== undefined || step.zoneIds.length > 0;
              const isConclusion =
                i === contradiction.steps.length - 1 && contradiction.steps.length > 1;
              return (
                <li key={`${i}-${step.text}`} className="ci-step">
                  <span className="ci-step-text" data-conclusion={isConclusion}>
                    {step.text}
                  </span>
                  {canView ? (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => {
                        goTo(step.at, step.zoneIds);
                      }}
                      aria-label={`Voir l’étape ${i + 1}${step.at !== undefined ? ` à ${clock(step.at)}` : ''}`}
                    >
                      Voir
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </section>

        <section className="vb-section" aria-labelledby={`${baseId}-exa`}>
          <h4 id={`${baseId}-exa`} className="vb-section-title">
            Examiner
          </h4>
          <div className="ci-examine">
            {contradiction.inspectableAt !== undefined ? (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  goTo(contradiction.inspectableAt, []);
                }}
              >
                Aller à {clock(contradiction.inspectableAt)}
              </button>
            ) : null}
            {zoneLabels.length > 0 ? (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  goTo(undefined, contradiction.inspectableZoneIds);
                }}
              >
                Zones : {zoneLabels.join(', ')}
              </button>
            ) : null}
            {contradiction.suggestedEvidenceIds.map((id) => (
              <button
                key={id}
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  api().select('evidence', id);
                }}
              >
                Pièce : {resolve(id).label}
              </button>
            ))}
            {contradiction.inspectableAt === undefined &&
            zoneLabels.length === 0 &&
            contradiction.suggestedEvidenceIds.length === 0 ? (
              <p className="vb-note">
                Rien à observer sur le plan : relisez les éléments impliqués dans le dossier.
              </p>
            ) : null}
          </div>
        </section>
      </article>
    );
  }

  // --- Mode compact : progression numérotée -------------------------------------------------
  const indexed: IndexedStep[] = contradiction.steps.map((step, index) => ({
    index,
    step,
    role: STEP_ROLES[contradiction.explanation[index]?.type ?? 'text'],
  }));
  const elements = indexed.filter((s) => s.role === 'element');
  const data = indexed.filter((s) => s.role === 'data');
  const reasoning = indexed.filter((s) => s.role === 'reasoning');
  const conclusions = indexed.filter((s) => s.role === 'conclusion');

  // Puces des éléments incompatibles : références des étapes « élément », sinon éléments impliqués.
  const chipIds = (
    elements.length > 0 ? elements.flatMap((s) => s.step.refIds) : contradiction.involvedIds
  ).filter((id, i, arr) => arr.indexOf(id) === i);

  const hasInstant =
    contradiction.inspectableAt !== undefined ||
    zoneLabels.length > 0 ||
    contradiction.suggestedEvidenceIds.length > 0;

  const renderChip = (id: string): JSX.Element => {
    const ref = resolve(id);
    return (
      <li key={id}>
        {ref.kind ? (
          <button
            type="button"
            className="chip"
            onClick={() => {
              if (ref.kind) api().select(ref.kind, ref.id, { space: spaceFor(ref.kind) });
            }}
          >
            {ref.label}
          </button>
        ) : (
          <span className="chip" aria-disabled="true">
            {ref.label}
          </span>
        )}
      </li>
    );
  };

  const renderStepLine = (s: IndexedStep): JSX.Element => {
    const canView = s.step.at !== undefined || s.step.zoneIds.length > 0;
    return (
      <li key={`${s.index}-${s.step.text}`} className="ci-step">
        <span className="ci-step-text">{s.step.text}</span>
        {canView ? (
          <button
            type="button"
            className="btn btn-ghost ci-step-view"
            onClick={() => {
              goToOnMap(s.step.at, s.step.zoneIds);
            }}
            aria-label={`Voir l’étape ${s.index + 1}${s.step.at !== undefined ? ` à ${clock(s.step.at)}` : ''}`}
          >
            {s.step.at !== undefined ? clock(s.step.at) : 'Plan'}
          </button>
        ) : null}
      </li>
    );
  };

  const stages: { key: string; title: string; body: JSX.Element }[] = [];
  if (chipIds.length > 0 || elements.length > 0) {
    stages.push({
      key: 'elements',
      title: 'Éléments incompatibles',
      body: (
        <>
          {chipIds.length > 0 ? (
            <ul className="vb-list ci-chips">{chipIds.map(renderChip)}</ul>
          ) : null}
          {elements.length > 0 ? (
            <ul className="vb-list ci-stage-lines">
              {elements.map((s) => (
                <li key={`${s.index}-${s.step.text}`} className="ci-step">
                  <span className="ci-step-text">{s.step.text}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ),
    });
  }
  if (data.length > 0) {
    stages.push({
      key: 'data',
      title: 'Données utilisées',
      body: <ul className="vb-list ci-stage-lines">{data.map(renderStepLine)}</ul>,
    });
  }
  if (reasoning.length > 0) {
    stages.push({
      key: 'reasoning',
      title: 'Raisonnement',
      body: <ol className="ci-steps ci-stage-steps">{reasoning.map(renderStepLine)}</ol>,
    });
  }
  stages.push({
    key: 'instant',
    title: 'Instant ou condition',
    body: (
      <div className="ci-examine">
        {contradiction.inspectableAt !== undefined ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              goToOnMap(contradiction.inspectableAt, contradiction.inspectableZoneIds);
            }}
          >
            Voir à {clock(contradiction.inspectableAt)}
          </button>
        ) : null}
        {zoneLabels.length > 0 ? (
          <button
            type="button"
            className="btn"
            onClick={() => {
              goToOnMap(undefined, contradiction.inspectableZoneIds);
            }}
          >
            Zones : {zoneLabels.join(', ')}
          </button>
        ) : null}
        {contradiction.suggestedEvidenceIds.map((id) => (
          <button
            key={id}
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              api().select('evidence', id, { space: 'casefile' });
            }}
          >
            Pièce : {resolve(id).label}
          </button>
        ))}
        {!hasInstant ? (
          <p className="vb-note">
            Rien à observer sur le plan : relisez les éléments impliqués dans le dossier.
          </p>
        ) : null}
      </div>
    ),
  });
  stages.push({
    key: 'consequences',
    title: 'Conséquences pour la version',
    body: (
      <>
        {conclusions.map((s) => (
          <p key={`${s.index}-${s.step.text}`} className="ci-conclusion">
            {s.step.text}
          </p>
        ))}
        {social ? (
          <p className="vb-note">
            Cette résistance pèse sur l’adhésion, pas sur la cohérence : la version reste
            matériellement possible.
          </p>
        ) : null}
        {contradiction.slotIds.length > 0 ? (
          <ul className="vb-list ci-slot-list">
            {contradiction.slotIds.map((slotId) => {
              const status = evaluations.find((e) => e.slotId === slotId)?.status ?? 'empty';
              return (
                <li key={slotId} className="ci-slot-row">
                  <span className="ci-slot-label">
                    {slots.find((s) => s.id === slotId)?.label ?? slotId}
                  </span>
                  <StatusBadge status={status} />
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="vb-note">
            Aucun emplacement du canevas : la contradiction oppose des éléments du dossier.
          </p>
        )}
        <div className="ci-badges">
          {blocking ? <span className="tag">bloque la cohérence</span> : null}
          {contradiction.involvesVersion ? (
            <span className="tag">implique la version</span>
          ) : (
            <span className="tag">entre témoignages</span>
          )}
        </div>
      </>
    ),
  });

  return (
    <article
      className="ci-detail ci-detail-compact"
      aria-labelledby={`${baseId}-title`}
      data-kind={contradiction.kind}
      data-contradiction-id={contradiction.id}
    >
      <header className="ci-detail-bar">
        <button ref={backRef} type="button" className="btn btn-ghost ci-back" onClick={onBack}>
          <span aria-hidden="true">← </span>Contradictions
        </button>
        <div className="ci-detail-bar-main">
          <h3 id={`${baseId}-title`} className="ci-detail-title">
            {contradiction.title}
          </h3>
          <div className="ci-badges">
            <SeverityBadge severity={contradiction.severity} />
            <KindBadge kind={contradiction.kind} />
            {social ? <span className="ci-social-tag">résistance sociale</span> : null}
            {blocking ? <span className="tag">bloquante</span> : null}
          </div>
        </div>
      </header>

      <ol className="ci-progression" aria-label="Explication pas à pas">
        {stages.map((stage, i) => (
          <li key={stage.key} className="ci-stage" data-stage={stage.key}>
            <h4 className="ci-stage-title" id={`${baseId}-${stage.key}`}>
              <span className="ci-stage-num" aria-hidden="true">
                {i + 1}
              </span>
              {stage.title}
            </h4>
            <div className="ci-stage-body">{stage.body}</div>
          </li>
        ))}
      </ol>
    </article>
  );
}
