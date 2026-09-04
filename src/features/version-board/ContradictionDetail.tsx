/**
 * Détail d'une contradiction (GDD §9) : titre, badges, éléments impliqués, explication en
 * étapes ordonnées, moyens de l'examiner — sans jamais donner la solution.
 */
import { useId, type JSX } from 'react';
import type { ClaimSlot } from '@/domain/model/scenario';
import type { ContradictionView } from '@/domain/selectors/playerView';
import { KindBadge, SeverityBadge } from '@/components/ui';
import { useGameStore } from '@/state';
import type { ResolvedRef } from './labels';

export interface ContradictionDetailProps {
  contradiction: ContradictionView;
  resolve: (id: string) => ResolvedRef;
  clock: (t: number) => string;
  slots: ClaimSlot[];
}

export function ContradictionDetail({
  contradiction,
  resolve,
  clock,
  slots,
}: ContradictionDetailProps): JSX.Element {
  const select = useGameStore((s) => s.select);
  const setCursor = useGameStore((s) => s.setCursor);
  const highlight = useGameStore((s) => s.highlight);
  const announce = useGameStore((s) => s.announce);
  const baseId = useId();
  const social = contradiction.kind === 'motivational';

  const goTo = (at: number | undefined, zoneIds: readonly string[]) => {
    if (at !== undefined) setCursor(at);
    if (zoneIds.length > 0) {
      highlight([...zoneIds]);
      const first = zoneIds[0];
      if (first) select('zone', first);
    }
    const parts: string[] = [];
    if (at !== undefined) parts.push(`curseur placé à ${clock(at)}`);
    if (zoneIds.length > 0) {
      parts.push(`zones mises en évidence : ${zoneIds.map((z) => resolve(z).label).join(', ')}`);
    }
    if (parts.length > 0) announce(`Examen : ${parts.join(' ; ')}.`);
  };

  const zoneLabels = contradiction.inspectableZoneIds.map((z) => resolve(z).label);
  const slotLabels = contradiction.slotIds.map((id) => slots.find((s) => s.id === id)?.label ?? id);

  return (
    <article className="ci-detail" aria-labelledby={`${baseId}-title`} data-kind={contradiction.kind}>
      <header className="vb-section">
        <div className="ci-badges">
          <SeverityBadge severity={contradiction.severity} />
          <KindBadge kind={contradiction.kind} />
          {social ? <span className="ci-social-tag">résistance sociale</span> : null}
          {contradiction.involvesVersion ? <span className="tag">implique la version</span> : null}
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
          <ul className="ci-chips" role="list">
            {contradiction.involvedIds.map((id) => {
              const ref = resolve(id);
              return (
                <li key={id}>
                  {ref.kind ? (
                    <button
                      type="button"
                      className="chip"
                      onClick={() => {
                        if (ref.kind) select(ref.kind, ref.id);
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
            const isConclusion = i === contradiction.steps.length - 1 && contradiction.steps.length > 1;
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
                select('evidence', id);
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
