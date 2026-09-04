/**
 * Résultat d'une confrontation ou d'un sondage : portrait, réponse sur ticket,
 * effets listés en texte, annotation manuscrite, actions de suite.
 */
import { useEffect, useId, useRef } from 'react';
import { Portrait } from '@/components/portrait';
import type { Approach } from '@/domain/model/scenario';
import type { CharacterView } from '@/domain/selectors/playerView';
import { useReducedMotion } from '@/state';
import { APPROACH_LABELS } from './approaches';
import { TRUST_PORTRAIT, type TrustLabel } from './trust';
import { TrustMark } from './TrustMark';

export interface ResultPiece {
  id: string;
  label: string;
}

export interface ConfrontationResultProps {
  mode: 'confrontation' | 'probe';
  character: CharacterView;
  approach: Approach;
  responseText: string;
  trustBefore: TrustLabel;
  trustAfter: TrustLabel;
  pressureBefore: number;
  pressure: number;
  pressureMax: number;
  newEvidence: readonly ResultPiece[];
  newStatements: readonly ResultPiece[];
  annotations: readonly string[];
  onOpenEvidence: (id: string) => void;
  onOpenStatement: (id: string) => void;
  onAnother: () => void;
  onClose: () => void;
}

export function ConfrontationResult({
  mode,
  character,
  approach,
  responseText,
  trustBefore,
  trustAfter,
  pressureBefore,
  pressure,
  pressureMax,
  newEvidence,
  newStatements,
  annotations,
  onOpenEvidence,
  onOpenStatement,
  onAnother,
  onClose,
}: ConfrontationResultProps): React.JSX.Element {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const trustLine =
    trustBefore === trustAfter ? (
      <>
        Confiance : inchangée (<TrustMark trust={trustAfter} />)
      </>
    ) : (
      <>
        Confiance : <TrustMark trust={trustBefore} />
        <span aria-hidden="true"> → </span>
        <span className="visually-hidden"> devient </span>
        <TrustMark trust={trustAfter} />
      </>
    );

  const pressureLine =
    mode === 'probe'
      ? `Pression : inchangée (${pressure}/${pressureMax}) — un sondage ne consomme rien.`
      : pressureBefore === pressure
        ? `Pression restante : ${pressure}/${pressureMax}.`
        : `Pression : ${pressureBefore} → ${pressure} sur ${pressureMax} (restante : ${pressure}/${pressureMax}).`;

  return (
    <section
      className={`confrontation-result${reducedMotion ? '' : ' anim-slide-up'}`}
      aria-labelledby={headingId}
      data-mode={mode}
    >
      <header className="confrontation-result-head">
        <Portrait
          seed={character.portraitSeed}
          accentColor={character.accentColor}
          name={character.name}
          size={56}
          state={TRUST_PORTRAIT[trustAfter]}
        />
        <div className="confrontation-result-identity">
          <h3 id={headingId} ref={headingRef} tabIndex={-1}>
            {mode === 'probe' ? 'Réaction de ' : 'Réponse de '}
            {character.name}
          </h3>
          <p className="muted">
            {character.role} · <TrustMark trust={trustAfter} />
          </p>
        </div>
      </header>

      <blockquote className="ticket confrontation-ticket">
        <div className="ticket-header">
          {mode === 'probe' ? 'Sondage' : 'Confrontation'} — approche {APPROACH_LABELS[approach]}
        </div>
        <p>{responseText}</p>
      </blockquote>

      <h4 className="confrontation-effects-title">Effets</h4>
      <ul className="confrontation-effects">
        <li>{trustLine}</li>
        <li>{pressureLine}</li>
        {newEvidence.length > 0 ? (
          <li>
            Nouvelles pièces au dossier :
            <ul className="confrontation-links">
              {newEvidence.map((piece) => (
                <li key={piece.id}>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => onOpenEvidence(piece.id)}
                    title="Ouvrir cette pièce dans le dossier"
                  >
                    <span aria-hidden="true">■ </span>
                    {piece.label}
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ) : null}
        {newStatements.length > 0 ? (
          <li>
            {character.name} précise sa déclaration :
            <ul className="confrontation-links">
              {newStatements.map((piece) => (
                <li key={piece.id}>
                  <button
                    type="button"
                    className="btn confrontation-statement-link"
                    onClick={() => onOpenStatement(piece.id)}
                    title="Ouvrir cette déclaration dans le dossier"
                  >
                    <span aria-hidden="true">▤ </span>
                    <span className="confrontation-quote">« {piece.label} »</span>
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ) : null}
        {mode === 'confrontation' && newEvidence.length === 0 && newStatements.length === 0 ? (
          <li>Aucune nouvelle pièce ni précision : la réponse est, en elle-même, l’information.</li>
        ) : null}
      </ul>

      {annotations.length > 0 ? (
        <div className="confrontation-annotations">
          {annotations.map((text, i) => (
            <p key={`${i}-${text.slice(0, 12)}`} className="hand-note" data-tilt={i % 2 ? 'right' : 'left'}>
              {text}
            </p>
          ))}
        </div>
      ) : null}

      <div className="confrontation-actions">
        <button type="button" className="btn" onClick={onAnother}>
          Autre confrontation
        </button>
        <button type="button" className="btn btn-primary" onClick={onClose}>
          Fermer
        </button>
      </div>
    </section>
  );
}
