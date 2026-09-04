/**
 * Trois axes d'évaluation distincts (GDD §10) : Cohérence, Dévoilement, Adhésion.
 * Jamais de note globale ; jamais d'alignement canonique avant l'épilogue.
 */
import { useId, type JSX } from 'react';
import type { ClaimSlot } from '@/domain/model/scenario';
import type { CharacterView, EvidenceView, VersionView } from '@/domain/selectors/playerView';
import { coherenceDisplay, plural, VERDICT_DISPLAY } from './labels';

export interface AxesPanelProps {
  version: VersionView;
  characters: CharacterView[];
  evidence: EvidenceView[];
  slots: ClaimSlot[];
  onSelectEvidence: (id: string) => void;
  onGoToSlot: (slotId: string) => void;
}

export function AxesPanel({
  version,
  characters,
  evidence,
  slots,
  onSelectEvidence,
  onGoToSlot,
}: AxesPanelProps): JSX.Element {
  const baseId = useId();
  const coherence = coherenceDisplay(version.coherenceStatus);
  const explained = version.disclosure.explainedEvidenceIds.length;
  const unexplained = version.disclosure.unexplainedEvidenceIds;
  const total = explained + unexplained.length;
  const pct = Math.round(Math.max(0, Math.min(1, version.disclosure.establishedExplained)) * 100);
  const evidenceLabel = (id: string) => evidence.find((e) => e.id === id)?.label ?? id;
  const characterName = (id: string) => characters.find((c) => c.id === id)?.name ?? id;
  const slotLabel = (id: string) => slots.find((s) => s.id === id)?.label ?? id;

  return (
    <div className="axes" aria-label="Trois axes d’évaluation" role="group">
      <section className="axis" data-axis="coherence" aria-labelledby={`${baseId}-coh`}>
        <h3 id={`${baseId}-coh`} className="axis-title">
          Cohérence
        </h3>
        <p className="axis-value">
          <span className="vb-glyph" aria-hidden="true">
            {coherence.glyph}
          </span>{' '}
          {coherence.label}
        </p>
        <p className="vb-note">
          {plural(
            version.blockingIds.length,
            'contradiction bloquante',
            'contradictions bloquantes',
          )}
          , {plural(version.noticeIds.length, 'remarque', 'remarques')}.
        </p>
      </section>

      <section className="axis" data-axis="disclosure" aria-labelledby={`${baseId}-dev`}>
        <h3 id={`${baseId}-dev`} className="axis-title">
          Dévoilement
        </h3>
        <div
          className="axis-meter"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-valuetext={`${pct} % des pièces établies expliquées`}
          aria-labelledby={`${baseId}-dev`}
        >
          <div className="axis-meter-fill" style={{ width: `${pct}%` }} />
        </div>
        <p className="axis-value">
          {explained} {explained > 1 ? 'pièces expliquées' : 'pièce expliquée'} sur {total}
        </p>
        {unexplained.length > 0 ? (
          <div className="vb-section">
            <p className="vb-note">Non expliquées par la version :</p>
            <ul className="axis-list" role="list">
              {unexplained.map((id) => (
                <li key={id}>
                  <button
                    type="button"
                    className="vb-link"
                    onClick={() => {
                      onSelectEvidence(id);
                    }}
                  >
                    <span className="vb-glyph" aria-hidden="true">
                      ○
                    </span>
                    <span className="vb-link-text">{evidenceLabel(id)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="vb-note">Toutes les pièces établies sont expliquées.</p>
        )}
      </section>

      <section className="axis" data-axis="adhesion" aria-labelledby={`${baseId}-adh`}>
        <h3 id={`${baseId}-adh`} className="axis-title">
          Adhésion
        </h3>
        <p className="axis-value">
          {version.signatureCount}/{version.adhesion.length} signeraient
        </p>
        <ul className="axis-list" role="list">
          {version.adhesion.map((a) => {
            const verdict = VERDICT_DISPLAY[a.verdict];
            return (
              <li key={a.characterId} className="adhesion-row" data-verdict={a.verdict}>
                <span className="adhesion-glyph" aria-hidden="true">
                  {verdict.glyph}
                </span>
                <span>
                  <span className="adhesion-name">{characterName(a.characterId)}</span>{' '}
                  <span className="adhesion-verdict">{verdict.label}</span>
                </span>
                {a.publicReasons.length > 0 ? (
                  <ul className="adhesion-reasons">
                    {a.publicReasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                ) : null}
                {a.requestedSlotId ? (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      if (a.requestedSlotId) onGoToSlot(a.requestedSlotId);
                    }}
                  >
                    Emplacement demandé : {slotLabel(a.requestedSlotId)}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
