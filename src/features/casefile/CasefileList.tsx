/**
 * Liste du dossier : un bouton par élément (glyphe de type, libellé, badge de degré, provenance).
 * Regroupée par type quand le filtre est « Tout ». Flèches haut/bas pour circuler entre éléments.
 */
import type { KeyboardEvent } from 'react';
import { DegreeBadge, KindBadge, SeverityBadge } from '@/components/ui';
import {
  KIND_GLYPHS,
  KIND_ORDER,
  KIND_PLURAL,
  KIND_SINGULAR,
  TRUST_GLYPHS,
  type CasefileItem,
  type CasefileItemKind,
} from './casefileItems';

export interface CasefileListProps {
  items: CasefileItem[];
  /** Regroupe par type avec un intertitre par groupe. */
  grouped: boolean;
  selectedId: string | null;
  /** Éléments apparus depuis la dernière consultation. */
  newIds: ReadonlySet<string>;
  onSelect: (item: CasefileItem) => void;
  emptyMessage: string;
}

function onItemKeyDown(e: KeyboardEvent<HTMLButtonElement>): void {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
  const root = e.currentTarget.closest('.casefile-groups');
  if (!root) return;
  const buttons = [...root.querySelectorAll<HTMLButtonElement>('.casefile-item')];
  const index = buttons.indexOf(e.currentTarget);
  if (index === -1) return;
  e.preventDefault();
  const next =
    e.key === 'ArrowDown'
      ? Math.min(buttons.length - 1, index + 1)
      : e.key === 'ArrowUp'
        ? Math.max(0, index - 1)
        : e.key === 'Home'
          ? 0
          : buttons.length - 1;
  buttons[next]?.focus();
}

function ItemButton({
  item,
  selected,
  isNew,
  onSelect,
}: {
  item: CasefileItem;
  selected: boolean;
  isNew: boolean;
  onSelect: (item: CasefileItem) => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      className="casefile-item"
      data-kind={item.kind}
      data-id={item.id}
      aria-current={selected ? 'true' : undefined}
      onClick={() => onSelect(item)}
      onKeyDown={onItemKeyDown}
    >
      <span className="casefile-item-glyph" aria-hidden="true">
        {KIND_GLYPHS[item.kind]}
      </span>
      <span className="visually-hidden">{KIND_SINGULAR[item.kind]} : </span>
      <span className="casefile-item-main">
        <span
          className={`casefile-item-label${item.historic ? ' casefile-item-label-historic' : ''}`}
        >
          {item.label}
        </span>
        <span className="casefile-item-meta">
          {item.degree && <DegreeBadge degree={item.degree} />}
          {item.severity && <SeverityBadge severity={item.severity} />}
          {item.contradictionKind && <KindBadge kind={item.contradictionKind} />}
          {item.trustState && (
            <span className="tag" data-trust={item.trustState}>
              <span aria-hidden="true">{TRUST_GLYPHS[item.trustState]} </span>
              {item.trustState}
            </span>
          )}
          <span className="casefile-item-provenance">{item.provenance}</span>
          {item.historic && <span className="tag">rétractée</span>}
          {isNew && <span className="badge badge-warning">nouveau</span>}
        </span>
      </span>
    </button>
  );
}

export function CasefileList({
  items,
  grouped,
  selectedId,
  newIds,
  onSelect,
  emptyMessage,
}: CasefileListProps): React.JSX.Element {
  if (items.length === 0) {
    return (
      <p className="casefile-empty" role="status">
        {emptyMessage}
      </p>
    );
  }
  const groups: { kind: CasefileItemKind | null; items: CasefileItem[] }[] = grouped
    ? KIND_ORDER.map((kind) => ({ kind, items: items.filter((i) => i.kind === kind) })).filter(
        (g) => g.items.length > 0,
      )
    : [{ kind: null, items }];

  return (
    <div className="casefile-groups">
      {groups.map((group) => (
        <section key={group.kind ?? 'flat'} className="casefile-group">
          {group.kind && (
            <h3 className="casefile-group-title">
              <span aria-hidden="true">{KIND_GLYPHS[group.kind]} </span>
              {KIND_PLURAL[group.kind]}{' '}
              <span className="casefile-group-count">({group.items.length})</span>
            </h3>
          )}
          <ul className="casefile-items">
            {group.items.map((item) => (
              <li key={`${item.kind}:${item.id}`}>
                <ItemButton
                  item={item}
                  selected={item.id === selectedId}
                  isNew={newIds.has(item.id)}
                  onSelect={onSelect}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
