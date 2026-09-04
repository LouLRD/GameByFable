/**
 * Morceaux partagés par les fiches du dossier : en-tête, section titrée, avis d'action refusée,
 * barre d'actions (rangée classique sur bureau, barre collante au pouce en mode compact) et
 * bouton d'épinglage.
 */
import type { ReactNode } from 'react';
import { useGameStore } from '@/state';
import { KIND_GLYPHS, KIND_SINGULAR, type CasefileItemKind } from './casefileItems';
import { usePins } from './pins';

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

/**
 * Actions principales d'une fiche. Sur bureau : rangée de boutons dans le flux. En mode compact :
 * barre collante en bas de la fiche (`position: sticky` dans le conteneur défilant, jamais fixe),
 * cibles ≥ 44 px, atteignable au pouce.
 */
export function SheetActions({
  compact,
  children,
}: {
  compact: boolean;
  children: ReactNode;
}): React.JSX.Element {
  if (compact) {
    return (
      <div className="casefile-actionbar" role="group" aria-label="Actions">
        {children}
      </div>
    );
  }
  return <div className="casefile-actions">{children}</div>;
}

/** Épingler / désépingler un élément : il rejoint la section « Épinglés » en tête du dossier. */
export function PinButton({ id, label }: { id: string; label: string }): React.JSX.Element {
  const { isPinned, toggle } = usePins();
  const pinned = isPinned(id);
  return (
    <button
      type="button"
      className="btn casefile-pin"
      aria-pressed={pinned}
      onClick={() => {
        toggle(id);
        useGameStore
          .getState()
          .announce(
            pinned
              ? `Épingle retirée de « ${label} ».`
              : `« ${label} » épinglé en tête du dossier.`,
          );
      }}
    >
      <span aria-hidden="true">{pinned ? '★ ' : '☆ '}</span>
      {pinned ? 'Désépingler' : 'Épingler'}
    </button>
  );
}
