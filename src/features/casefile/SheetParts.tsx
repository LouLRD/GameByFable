/**
 * Morceaux partagés par les fiches du dossier : en-tête, section titrée, avis d'action refusée.
 */
import type { ReactNode } from 'react';
import { KIND_GLYPHS, KIND_SINGULAR, type CasefileItemKind } from './casefileItems';

export function SheetHeader({
  kind,
  title,
  titleId,
  leading,
  children,
}: {
  kind: CasefileItemKind;
  title: string;
  titleId: string;
  /** Élément placé avant le titre (portrait). */
  leading?: ReactNode;
  /** Badges et métadonnées sous le titre. */
  children?: ReactNode;
}): React.JSX.Element {
  return (
    <header className="casefile-sheet-head">
      {leading ?? (
        <span className="casefile-sheet-glyph" aria-hidden="true">
          {KIND_GLYPHS[kind]}
        </span>
      )}
      <div className="casefile-sheet-heading">
        <p className="casefile-sheet-kind">{KIND_SINGULAR[kind]}</p>
        <h3 id={titleId} className="casefile-sheet-title">
          {title}
        </h3>
        {children}
      </div>
    </header>
  );
}

export function SheetSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <section className="casefile-section">
      <h4 className="casefile-section-title">{title}</h4>
      {children}
    </section>
  );
}

/**
 * Refus technique d'une action (message d'erreur du moteur). Présenté comme une remarque
 * de l'outil, jamais comme une réplique d'un personnage.
 */
export function ActionNotice({ message }: { message: string | null }): React.JSX.Element | null {
  if (!message) return null;
  return (
    <p className="casefile-notice" role="alert">
      <span className="tag">action refusée</span> {message}
    </p>
  );
}
