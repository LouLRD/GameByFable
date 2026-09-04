/**
 * Carte d'un emplacement du canevas : question, hypothèse placée (ou état vide),
 * statut, contradictions liées, actions. Retours visuels : .anim-propagate quand une
 * hypothèse vient d'être posée, .anim-crack quand l'emplacement porte une contradiction
 * après une réévaluation (désactivés en mouvement réduit).
 */
import { useEffect, useRef, type JSX } from 'react';
import type { ClaimSlot, Zone } from '@/domain/model/scenario';
import type { SlotEvaluation } from '@/domain/model/evaluation';
import type { PlayerClaim } from '@/domain/model/version';
import type {
  CharacterView,
  ContradictionView,
  HypothesisView,
} from '@/domain/selectors/playerView';
import { SeverityBadge, StatusBadge } from '@/components/ui';
import { plural } from './labels';

export interface SlotCardProps {
  slot: ClaimSlot;
  index: number;
  claim: PlayerClaim | undefined;
  hypothesis: HypothesisView | undefined;
  evaluation: SlotEvaluation;
  /** Contradictions dont `slotIds` contient cet emplacement. */
  contradictions: ContradictionView[];
  blockingIds: ReadonlySet<string>;
  characters: CharacterView[];
  zones: readonly Zone[];
  clock: (t: number) => string;
  sealed: boolean;
  /** Compteur d'actions acceptées : déclenche les retours visuels. */
  actionNonce: number;
  reducedMotion: boolean;
  onChoose: () => void;
  onEdit: () => void;
  onClear: () => void;
  onSelectContradiction: (id: string) => void;
}

const ANIM_CLASSES = ['anim-crack', 'anim-propagate'] as const;

function claimKey(claim: PlayerClaim | undefined): string {
  if (!claim) return '';
  return [
    claim.hypothesisId,
    claim.actorId ?? '',
    claim.zoneId ?? '',
    claim.interval ? `${claim.interval.start}-${claim.interval.end}` : '',
  ].join('|');
}

export function SlotCard({
  slot,
  index,
  claim,
  hypothesis,
  evaluation,
  contradictions,
  blockingIds,
  characters,
  zones,
  clock,
  sealed,
  actionNonce,
  reducedMotion,
  onChoose,
  onEdit,
  onClear,
  onSelectContradiction,
}: SlotCardProps): JSX.Element {
  const cardRef = useRef<HTMLElement>(null);
  const previousKey = useRef<string>(claimKey(claim));
  const key = claimKey(claim);
  const hasBlocking = contradictions.some((c) => blockingIds.has(c.id));
  const hasContradiction = evaluation.contradictionIds.length > 0;

  useEffect(() => {
    const prev = previousKey.current;
    previousKey.current = key;
    if (actionNonce === 0 || reducedMotion) return;
    const el = cardRef.current;
    if (!el || !claim) return;
    const cls = hasContradiction ? 'anim-crack' : key !== prev ? 'anim-propagate' : null;
    if (!cls) return;
    for (const c of ANIM_CLASSES) el.classList.remove(c);
    // Relance l'animation même si la classe était déjà présente.
    void el.offsetWidth;
    el.classList.add(cls);
    const stop = () => {
      el.classList.remove(cls);
    };
    el.addEventListener('animationend', stop, { once: true });
    const timer = window.setTimeout(stop, 900);
    return () => {
      window.clearTimeout(timer);
      el.removeEventListener('animationend', stop);
    };
  }, [actionNonce, reducedMotion, key, claim, hasContradiction]);

  const statusClass = evaluation.status === 'empty' ? '' : ` status-${evaluation.status}`;
  const headingId = `slot-card-${slot.id}-title`;
  const promptId = `slot-card-${slot.id}-prompt`;
  const sealedNoteId = `slot-card-${slot.id}-sealed`;
  const actorName = claim?.actorId
    ? (characters.find((c) => c.id === claim.actorId)?.name ?? claim.actorId)
    : null;
  const zoneLabel = claim?.zoneId
    ? (zones.find((z) => z.id === claim.zoneId)?.label ?? claim.zoneId)
    : null;

  return (
    <article
      ref={cardRef}
      id={`slot-card-${slot.id}`}
      className="card slot-card"
      aria-labelledby={headingId}
      aria-describedby={promptId}
      tabIndex={-1}
      data-slot-id={slot.id}
      data-status={evaluation.status}
      data-blocking={hasBlocking}
    >
      <header className="slot-card-head">
        <span className="slot-card-index" aria-hidden="true">
          {index + 1}.
        </span>
        <h3 id={headingId} className="slot-card-label">
          {slot.label}
          {slot.required ? '' : ' (facultatif)'}
        </h3>
      </header>
      <p id={promptId} className="slot-card-prompt">
        {slot.prompt}
      </p>

      {claim ? (
        <div className={`slot-card-body${statusClass}`}>
          <div className="slot-card-hyp">
            <p className="slot-card-hyp-label">{hypothesis?.label ?? claim.hypothesisId}</p>
            <StatusBadge status={evaluation.status} />
          </div>
          {hypothesis ? <p className="slot-card-summary">{hypothesis.summary}</p> : null}
          <dl className="slot-card-params">
            <dt>Acteur</dt>
            <dd>{actorName ?? 'non précisé'}</dd>
            <dt>Lieu</dt>
            <dd>{zoneLabel ?? 'non précisé'}</dd>
            <dt>Intervalle</dt>
            <dd className="mono">
              {claim.interval
                ? `${clock(claim.interval.start)} – ${clock(claim.interval.end)}`
                : 'non précisé'}
            </dd>
          </dl>
          {evaluation.supportingEvidenceIds.length > 0 ? (
            <p className="vb-note">
              {plural(
                evaluation.supportingEvidenceIds.length,
                'pièce étaye cette hypothèse',
                'pièces étayent cette hypothèse',
              )}
              .
            </p>
          ) : null}
          {contradictions.length > 0 ? (
            <div className="vb-section">
              <p className="vb-note">
                {plural(contradictions.length, 'contradiction liée', 'contradictions liées')}
                {hasBlocking ? ' — fil causal fissuré' : ''}
              </p>
              <ul className="vb-linklist" role="list">
                {contradictions.slice(0, 4).map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className="vb-link"
                      onClick={() => {
                        onSelectContradiction(c.id);
                      }}
                    >
                      <SeverityBadge severity={c.severity} />
                      <span className="vb-link-text">{c.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="slot-card-actions">
            <button
              type="button"
              className="btn"
              onClick={onEdit}
              disabled={sealed}
              {...(sealed ? { title: 'Le rapport est scellé.', 'aria-describedby': sealedNoteId } : {})}
            >
              Modifier
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClear}
              disabled={sealed}
              {...(sealed ? { title: 'Le rapport est scellé.', 'aria-describedby': sealedNoteId } : {})}
            >
              Retirer
            </button>
          </div>
        </div>
      ) : (
        <div className="slot-card-empty">
          <span>
            <StatusBadge status="empty" /> Aucune hypothèse
          </span>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onChoose}
            disabled={sealed}
            {...(sealed ? { title: 'Le rapport est scellé.', 'aria-describedby': sealedNoteId } : {})}
          >
            Choisir
          </button>
        </div>
      )}
      {sealed ? (
        <p id={sealedNoteId} className="vb-note">
          Le rapport est scellé : la version ne peut plus être modifiée.
        </p>
      ) : null}
    </article>
  );
}
