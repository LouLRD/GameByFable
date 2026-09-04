/**
 * Journal de l'enquête : entrées chronologiques, annotations manuscrites (.hand-note),
 * références cliquables vers les éléments du dossier.
 */
import type { JournalEntry } from '@/domain/model/state';
import type { PlayerView } from '@/domain/selectors/playerView';
import {
  JOURNAL_KIND_LABELS,
  KIND_GLYPHS,
  resolveRef,
  type CasefileItemKind,
} from './casefileItems';

export interface JournalListProps {
  entries: readonly JournalEntry[];
  view: PlayerView;
  onNavigate: (kind: CasefileItemKind, id: string) => void;
  emptyMessage: string;
}

export function JournalList({ entries, view, onNavigate, emptyMessage }: JournalListProps): React.JSX.Element {
  if (entries.length === 0) {
    return (
      <p className="casefile-empty" role="status">
        {emptyMessage}
      </p>
    );
  }
  return (
    <ol role="list" className="casefile-journal">
      {entries.map((entry, index) => {
        const refs = entry.refIds
          .map((id) => ({ id, ref: resolveRef(view, id) }))
          .filter((r): r is { id: string; ref: NonNullable<ReturnType<typeof resolveRef>> } => r.ref !== null);
        return (
          <li
            key={entry.id}
            className="casefile-journal-entry"
            data-kind={entry.kind}
            data-handwritten={entry.handwritten ? 'true' : undefined}
          >
            <div className="casefile-journal-meta">
              <span className="mono muted casefile-journal-index">n° {entry.actionIndex + 1}</span>
              <span className="tag">{JOURNAL_KIND_LABELS[entry.kind]}</span>
            </div>
            {entry.handwritten ? (
              <p className="hand-note" data-tilt={index % 2 === 0 ? undefined : 'right'}>
                {entry.text}
              </p>
            ) : (
              <p className="casefile-journal-text">{entry.text}</p>
            )}
            {refs.length > 0 && (
              <div className="casefile-journal-refs">
                {refs.map(({ id, ref }) => (
                  <button
                    key={id}
                    type="button"
                    className="casefile-link"
                    onClick={() => onNavigate(ref.kind, id)}
                  >
                    <span aria-hidden="true">{KIND_GLYPHS[ref.kind]} </span>
                    {ref.label}
                  </button>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
