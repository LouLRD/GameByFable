/**
 * Ligne de signature : portrait (état selon le verdict), nom, verdict en texte + glyphe,
 * raisons publiques et, le cas échéant, bouton vers l'emplacement contesté.
 * Utilisée à la table ronde (verdicts vivants) et dans l'épilogue (issues figées).
 */
import type { JSX } from 'react';

import { Portrait } from '@/components/portrait';

import { VERDICT_GLYPHS, VERDICT_LABELS, VERDICT_PORTRAIT, type SignatureVerdict } from './labels';

export interface SignatureRowProps {
  name: string;
  role?: string | undefined;
  portraitSeed: number;
  accentColor: string;
  /** État de confiance textuel (fermé / prudent / disponible / engagé). */
  trustState?: string | undefined;
  verdict: SignatureVerdict;
  reasons: readonly string[];
  /** Réaction en une phrase (épilogue). */
  line?: string | undefined;
  /** Emplacement dont la personne demande la modification. */
  requestedSlot?: { id: string; label: string } | null | undefined;
  onShowSlot?: ((slotId: string) => void) | undefined;
}

export function SignatureRow({
  name,
  role,
  portraitSeed,
  accentColor,
  trustState,
  verdict,
  reasons,
  line,
  requestedSlot,
  onShowSlot,
}: SignatureRowProps): JSX.Element {
  return (
    <li className="sig-row" data-verdict={verdict} data-character-name={name}>
      <div className="sig-portrait">
        <Portrait
          seed={portraitSeed}
          accentColor={accentColor}
          name={name}
          size={48}
          state={VERDICT_PORTRAIT[verdict]}
        />
      </div>
      <div className="sig-main">
        <div className="sig-head">
          <span className="sig-name">{name}</span>
          {role ? <span className="muted sig-role">{role}</span> : null}
          {trustState ? <span className="tag">confiance : {trustState}</span> : null}
        </div>
        <p className="sig-verdict" data-verdict={verdict}>
          <span className="sig-glyph" aria-hidden="true">
            {VERDICT_GLYPHS[verdict]}
          </span>
          <span>{VERDICT_LABELS[verdict]}</span>
        </p>
        {line ? <p className="sig-line">{line}</p> : null}
        {reasons.length > 0 ? (
          <ul className="sig-reasons list-plain">
            {reasons.map((reason, index) => (
              <li key={`${index}-${reason}`}>{reason}</li>
            ))}
          </ul>
        ) : null}
        {requestedSlot && onShowSlot ? (
          <button
            type="button"
            className="btn btn-ghost sig-slot-btn"
            onClick={() => onShowSlot(requestedSlot.id)}
            aria-label={`Voir l’emplacement « ${requestedSlot.label} »`}
          >
            Voir l’emplacement
          </button>
        ) : null}
      </div>
    </li>
  );
}
