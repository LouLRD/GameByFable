/**
 * Liste du dossier : un bouton par élément (glyphe de type, libellé, badge de degré, provenance).
 * Regroupée par type quand le filtre est « Tout ». Flèches haut/bas pour circuler entre éléments.
 * Mode compact : éléments hauts (≥ 56 px), groupes repliables (bouton d'en-tête `aria-expanded`),
 * section « Épinglés » en tête de liste.
 */
import { useId, useState, type KeyboardEvent } from 'react';
import { DegreeBadge, KindBadge, SeverityBadge } from '@/components/ui';
import {
  KIND_GLYPHS,
  KIND_ORDER,
  KIND_PLURAL,
  KIND_SINGULAR,
  TRUST_GLYPHS,
  type CasefileItem,
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
  /** Mode compact (≤ 1023 px) : éléments hauts et groupes repliables. */
  compact?: boolean;
  /** Éléments épinglés : sortis de leur groupe et placés dans une section « Épinglés » en tête. */
  pinnedIds?: ReadonlySet<string>;
}

interface ListGroup {
  key: string;
  /** Null pour la liste plate (aucun intertitre). */
  title: string | null;
  glyph: string;
  items: CasefileItem[];
}

const PINNED_GROUP_KEY = 'pinned';
const PINNED_GLYPH = '★';

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
  pinned,
  onSelect,
}: {
  item: CasefileItem;
  selected: boolean;
  isNew: boolean;
  pinned: boolean;
  onSelect: (item: CasefileItem) => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      className="casefile-item"
      data-kind={item.kind}
      data-id={item.id}
      data-pinned={pinned ? 'true' : undefined}
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

function buildGroups(
  items: CasefileItem[],
  grouped: boolean,
  pinnedIds: ReadonlySet<string> | undefined,
): ListGroup[] {
  const pinned = pinnedIds ? items.filter((i) => pinnedIds.has(i.id)) : [];
  const rest = pinned.length > 0 ? items.filter((i) => !pinnedIds?.has(i.id)) : items;
  const groups: ListGroup[] = grouped
    ? KIND_ORDER.map((kind) => ({
        key: kind,
        title: KIND_PLURAL[kind],
        glyph: KIND_GLYPHS[kind],
        items: rest.filter((i) => i.kind === kind),
      })).filter((g) => g.items.length > 0)
    : rest.length > 0
      ? [{ key: 'flat', title: null, glyph: '', items: rest }]
      : [];
  if (pinned.length > 0) {
    groups.unshift({
      key: PINNED_GROUP_KEY,
      title: 'Épinglés',
      glyph: PINNED_GLYPH,
      items: pinned,
    });
  }
  return groups;
}

export function CasefileList({
  items,
  grouped,
  selectedId,
  newIds,
  onSelect,
  emptyMessage,
  compact = false,
  pinnedIds,
}: CasefileListProps): React.JSX.Element {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set<string>());
  const baseId = useId();

  if (items.length === 0) {
    return (
      <p className="casefile-empty" role="status">
        {emptyMessage}
      </p>
    );
  }
  const groups = buildGroups(items, grouped, pinnedIds);

  const toggleGroup = (key: string): void => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="casefile-groups" data-compact={compact ? 'true' : undefined}>
      {groups.map((group) => {
        const collapsible = compact && group.title !== null;
        const isCollapsed = collapsible && collapsed.has(group.key);
        const listDomId = `${baseId}-${group.key}`;
        return (
          <section
            key={group.key}
            className="casefile-group"
            data-group={group.key}
            data-collapsed={isCollapsed ? 'true' : undefined}
          >
            {group.title !== null && (
              <h3 className="casefile-group-title">
                {collapsible ? (
                  <button
                    type="button"
                    className="casefile-group-toggle"
                    aria-expanded={!isCollapsed}
                    {...(isCollapsed ? {} : { 'aria-controls': listDomId })}
                    onClick={() => toggleGroup(group.key)}
                  >
                    <span aria-hidden="true">{group.glyph} </span>
                    {group.title}{' '}
                    <span className="casefile-group-count">({group.items.length})</span>
                    <span className="casefile-group-chevron" aria-hidden="true">
                      {isCollapsed ? '▸' : '▾'}
                    </span>
                  </button>
                ) : (
                  <>
                    <span aria-hidden="true">{group.glyph} </span>
                    {group.title}{' '}
                    <span className="casefile-group-count">({group.items.length})</span>
                  </>
                )}
              </h3>
            )}
            {!isCollapsed && (
              <ul className="casefile-items" id={listDomId}>
                {group.items.map((item) => (
                  <li key={`${item.kind}:${item.id}`}>
                    <ItemButton
                      item={item}
                      selected={item.id === selectedId}
                      isNew={newIds.has(item.id)}
                      pinned={pinnedIds?.has(item.id) ?? false}
                      onSelect={onSelect}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
