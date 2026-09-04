/**
 * Dossier (colonne gauche, GDD §6.1, §12.1) : recherche, filtres à compteurs, liste regroupée,
 * fiche de détail sous la liste (desktop) ou à sa place avec « Retour » (mobile).
 * Mode compact (`compact`, ≤ 1023 px, rendu par la coquille mobile) : titre masqué mais présent,
 * recherche et prémisse repliées derrière des boutons, filtres sur une rangée défilante,
 * épinglage, fiche avec en-tête collant et barre d'actions au pouce.
 * Toutes les données viennent de la vue joueur ; toute action passe par le store.
 */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useGameStore, usePlayerView, type CasefileFilter } from '@/state';
import { CasefileList } from './CasefileList';
import { CharacterSheet } from './CharacterSheet';
import { ContradictionCard } from './ContradictionCard';
import { EvidenceSheet } from './EvidenceSheet';
import { FactSheet } from './FactSheet';
import { HypothesisSheet } from './HypothesisSheet';
import { JournalList } from './JournalList';
import { StatementSheet } from './StatementSheet';
import {
  EMPTY_MESSAGES,
  FILTER_LABELS,
  FILTER_ORDER,
  KIND_TO_FILTER,
  buildCasefileItems,
  isCompactViewport,
  normalizeText,
  useZoneLabels,
  type CasefileItem,
  type CasefileItemKind,
} from './casefileItems';
import { usePins } from './pins';
import './casefile.css';

const EMPTY_SET: ReadonlySet<string> = new Set<string>();
const PINNED_EMPTY_MESSAGE =
  'Aucun élément épinglé : le bouton « Épingler » d’une fiche le place ici.';

export interface CasefilePanelProps {
  /** Mode compact (coquille mobile) : sans grand en-tête, commandes au pouce. Défaut : bureau. */
  compact?: boolean;
}

function onFilterKeyDown(e: KeyboardEvent<HTMLButtonElement>): void {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End')
    return;
  const toolbar = e.currentTarget.closest('[role="toolbar"]');
  if (!toolbar) return;
  const buttons = [...toolbar.querySelectorAll<HTMLButtonElement>('button')];
  const index = buttons.indexOf(e.currentTarget);
  if (index === -1) return;
  e.preventDefault();
  const next =
    e.key === 'ArrowRight'
      ? (index + 1) % buttons.length
      : e.key === 'ArrowLeft'
        ? (index - 1 + buttons.length) % buttons.length
        : e.key === 'Home'
          ? 0
          : buttons.length - 1;
  buttons[next]?.focus();
}

export function CasefilePanel({ compact = false }: CasefilePanelProps): React.JSX.Element {
  const view = usePlayerView();
  const filter = useGameStore((s) => s.casefileFilter);
  const selection = useGameStore((s) => s.selection);
  const zoneLabels = useZoneLabels();
  const { pinnedSet } = usePins();

  const [query, setQuery] = useState('');
  const [seen, setSeen] = useState<ReadonlySet<string> | null>(null);
  const [closedSheetFor, setClosedSheetFor] = useState<string | null>(null);
  // État propre au mode compact : recherche dépliée, prémisse dépliée, filtre « Épinglés ».
  const [searchOpen, setSearchOpen] = useState(false);
  const [premiseOpen, setPremiseOpen] = useState(false);
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchToggleRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  /** Compact : le focus suit la bascule liste ⇄ fiche déclenchée par le joueur. */
  const pendingFocus = useRef<'sheet' | 'list' | null>(null);
  const titleId = useId();
  const searchId = useId();
  const searchWrapId = useId();
  const premiseId = useId();
  const listId = useId();
  const sheetTitleId = useId();

  const searchVisible = !compact || searchOpen;
  useEffect(() => {
    if (compact && searchOpen) searchRef.current?.focus();
  }, [compact, searchOpen]);

  const items = useMemo(
    () => (view ? buildCasefileItems(view, zoneLabels) : []),
    [view, zoneLabels],
  );

  // Première consultation : tout ce qui est déjà là est « vu » ; seuls les ajouts ultérieurs
  // seront marqués « nouveau ». L'élément sélectionné est toujours considéré comme vu.
  if (seen === null && view) {
    setSeen(new Set(items.map((i) => i.id)));
  } else if (
    seen &&
    selection &&
    !seen.has(selection.id) &&
    items.some((i) => i.id === selection.id)
  ) {
    setSeen(new Set([...seen, selection.id]));
  }

  const normalizedQuery = normalizeText(query.trim());
  const searched = normalizedQuery
    ? items.filter((i) => i.haystack.includes(normalizedQuery))
    : items;
  const journalEntries = view
    ? normalizedQuery
      ? view.journal.filter((j) => normalizeText(j.text).includes(normalizedQuery))
      : view.journal
    : [];
  const showPinned = compact && pinnedOnly;
  const visible = showPinned
    ? searched.filter((i) => pinnedSet.has(i.id))
    : filter === 'all'
      ? searched
      : searched.filter((i) => KIND_TO_FILTER[i.kind] === filter);
  const counts: Record<CasefileFilter, number> = {
    all: searched.length,
    evidence: 0,
    statements: 0,
    characters: 0,
    facts: 0,
    hypotheses: 0,
    contradictions: 0,
    journal: journalEntries.length,
  };
  for (const item of searched) counts[KIND_TO_FILTER[item.kind]] += 1;
  const pinnedCount = compact ? searched.filter((i) => pinnedSet.has(i.id)).length : 0;

  const newIds: ReadonlySet<string> = seen
    ? new Set(items.filter((i) => !seen.has(i.id)).map((i) => i.id))
    : EMPTY_SET;

  const selectedItem: CasefileItem | null = selection
    ? (items.find((i) => i.id === selection.id && i.kind === selection.kind) ?? null)
    : null;
  const sheetOpen = selectedItem !== null && closedSheetFor !== selectedItem.id;

  useEffect(() => {
    if (!compact) return;
    const wanted = pendingFocus.current;
    if (!wanted) return;
    if (wanted === 'sheet' && sheetOpen) {
      pendingFocus.current = null;
      backRef.current?.focus();
    } else if (wanted === 'list' && !sheetOpen) {
      pendingFocus.current = null;
      rootRef.current
        ?.querySelector<HTMLButtonElement>('.casefile-item[aria-current="true"]')
        ?.focus();
    }
  }, [compact, sheetOpen]);

  // Les actions du store sont stables : on les lit sans abonnement au moment de l'interaction.
  const openInspector = (id: string): void => {
    const store = useGameStore.getState();
    store.select('contradiction', id);
    store.setInspectorTab('contradictions');
    if (isCompactViewport()) store.setActiveSpace('inspector');
    const title = items.find((i) => i.id === id)?.label ?? id;
    store.announce(`Contradiction « ${title} » ouverte dans l’inspecteur.`);
  };

  const navigate = (kind: CasefileItemKind, id: string): void => {
    setClosedSheetFor(null);
    if (kind === 'contradiction') {
      openInspector(id);
      return;
    }
    useGameStore.getState().select(kind, id);
  };

  const onSelectItem = (item: CasefileItem): void => {
    if (compact && item.kind !== 'contradiction') pendingFocus.current = 'sheet';
    navigate(item.kind, item.id);
  };

  const onCloseSheet = (id: string): void => {
    if (compact) pendingFocus.current = 'list';
    setClosedSheetFor(id);
  };

  const onPickFilter = (f: CasefileFilter): void => {
    setPinnedOnly(false);
    useGameStore.getState().setCasefileFilter(f);
  };

  const onToggleSearch = (): void => {
    if (searchOpen) setQuery('');
    setSearchOpen((open) => !open);
  };

  const onSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key !== 'Escape') return;
    if (query !== '') {
      e.preventDefault();
      setQuery('');
      return;
    }
    if (compact) {
      e.preventDefault();
      setSearchOpen(false);
      searchToggleRef.current?.focus();
    }
  };

  const emptyMessage = normalizedQuery
    ? `Aucun élément ne correspond à « ${query.trim()} ».`
    : showPinned
      ? PINNED_EMPTY_MESSAGE
      : EMPTY_MESSAGES[filter];

  if (!view) {
    return (
      <div className="casefile" data-sheet-open="false" data-compact={compact ? 'true' : undefined}>
        <header className="casefile-header">
          <h2 className={compact ? 'visually-hidden' : 'panel-title'} id={titleId}>
            Dossier
          </h2>
        </header>
        <p className="casefile-empty" role="status">
          Aucune partie en cours : le dossier s’ouvrira avec la première enquête.
        </p>
      </div>
    );
  }

  const renderSheet = (item: CasefileItem): React.JSX.Element | null => {
    switch (item.kind) {
      case 'evidence': {
        const evidence = view.evidence.find((e) => e.id === item.id);
        return evidence ? (
          <EvidenceSheet
            key={evidence.id}
            evidence={evidence}
            view={view}
            zoneLabels={zoneLabels}
            titleId={sheetTitleId}
            compact={compact}
          />
        ) : null;
      }
      case 'statement': {
        const statement = view.statements.find((s) => s.id === item.id);
        return statement ? (
          <StatementSheet
            statement={statement}
            view={view}
            titleId={sheetTitleId}
            onNavigate={navigate}
            compact={compact}
          />
        ) : null;
      }
      case 'character': {
        const character = view.characters.find((c) => c.id === item.id);
        return character ? (
          <CharacterSheet
            key={character.id}
            character={character}
            view={view}
            titleId={sheetTitleId}
            onNavigate={navigate}
            compact={compact}
          />
        ) : null;
      }
      case 'fact': {
        const fact = view.facts.find((f) => f.id === item.id);
        return fact ? (
          <FactSheet
            fact={fact}
            view={view}
            zoneLabels={zoneLabels}
            titleId={sheetTitleId}
            onNavigate={navigate}
            compact={compact}
          />
        ) : null;
      }
      case 'hypothesis': {
        const hypothesis = view.hypotheses.find((h) => h.id === item.id);
        return hypothesis ? (
          <HypothesisSheet
            hypothesis={hypothesis}
            view={view}
            zoneLabels={zoneLabels}
            titleId={sheetTitleId}
            onNavigate={navigate}
            compact={compact}
          />
        ) : null;
      }
      case 'contradiction': {
        const contradiction = [...view.contradictions, ...view.motivational].find(
          (c) => c.id === item.id,
        );
        return contradiction ? (
          <ContradictionCard
            contradiction={contradiction}
            view={view}
            titleId={sheetTitleId}
            onOpenInspector={openInspector}
            compact={compact}
          />
        ) : null;
      }
    }
  };

  const premise = (
    <div className="ticket casefile-premise" id={compact ? premiseId : undefined}>
      <div className="ticket-header">{view.title}</div>
      <p>{view.premise}</p>
    </div>
  );

  return (
    <div
      ref={rootRef}
      className="casefile"
      data-sheet-open={sheetOpen ? 'true' : 'false'}
      data-compact={compact ? 'true' : undefined}
    >
      <header className="casefile-header">
        <div className="casefile-title-row">
          <h2 className={compact ? 'visually-hidden' : 'panel-title'} id={titleId}>
            Dossier
          </h2>
          <span className="muted casefile-count">
            {items.length} {items.length === 1 ? 'élément' : 'éléments'}
          </span>
          {compact && (
            <div className="casefile-tools">
              <button
                type="button"
                className="btn btn-ghost casefile-tool"
                aria-expanded={premiseOpen}
                aria-controls={premiseId}
                onClick={() => setPremiseOpen((open) => !open)}
              >
                <span aria-hidden="true">▤ </span>Situation
              </button>
              <button
                ref={searchToggleRef}
                type="button"
                className="btn btn-ghost casefile-tool"
                aria-expanded={searchOpen}
                aria-controls={searchWrapId}
                onClick={onToggleSearch}
              >
                <span aria-hidden="true">⌕ </span>Rechercher
              </button>
            </div>
          )}
        </div>
        {compact && premiseOpen && premise}
        {searchVisible && (
          <div className="casefile-search" id={searchWrapId}>
            <label htmlFor={searchId} className="visually-hidden">
              Rechercher dans le dossier
            </label>
            <input
              ref={searchRef}
              id={searchId}
              type="search"
              className="input"
              placeholder="Rechercher un libellé, un texte…"
              value={query}
              aria-controls={listId}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKeyDown}
            />
          </div>
        )}
        <div role="toolbar" aria-label="Filtrer le dossier" className="casefile-filters">
          {FILTER_ORDER.map((f) => (
            <button
              key={f}
              type="button"
              className="chip"
              aria-pressed={!showPinned && filter === f}
              onClick={() => onPickFilter(f)}
              onKeyDown={onFilterKeyDown}
            >
              {FILTER_LABELS[f]} <span className="casefile-filter-count">({counts[f]})</span>
            </button>
          ))}
          {compact && (
            <button
              type="button"
              className="chip casefile-chip-pinned"
              aria-pressed={showPinned}
              onClick={() => setPinnedOnly(true)}
              onKeyDown={onFilterKeyDown}
            >
              Épinglés <span className="casefile-filter-count">({pinnedCount})</span>
            </button>
          )}
        </div>
        <p className="visually-hidden" role="status">
          {!showPinned && filter === 'journal'
            ? `${journalEntries.length} ${journalEntries.length === 1 ? 'entrée' : 'entrées'} de journal`
            : `${visible.length} ${visible.length === 1 ? 'élément affiché' : 'éléments affichés'}`}
        </p>
      </header>

      <div className="casefile-body">
        <div className="casefile-list-region" id={listId}>
          {!compact && filter === 'all' && !normalizedQuery && premise}
          {!showPinned && filter === 'journal' ? (
            <JournalList
              entries={journalEntries}
              view={view}
              onNavigate={navigate}
              emptyMessage={emptyMessage}
            />
          ) : (
            <CasefileList
              items={visible}
              grouped={showPinned || filter === 'all'}
              selectedId={selectedItem?.id ?? null}
              newIds={newIds}
              onSelect={onSelectItem}
              emptyMessage={emptyMessage}
              compact={compact}
              {...(compact && !showPinned ? { pinnedIds: pinnedSet } : {})}
            />
          )}
        </div>

        {sheetOpen && selectedItem && (
          <section className="casefile-sheet" aria-label={`Fiche : ${selectedItem.label}`}>
            <div className="casefile-sheet-bar">
              <button
                ref={backRef}
                type="button"
                className="btn btn-ghost casefile-back"
                onClick={() => onCloseSheet(selectedItem.id)}
              >
                <span aria-hidden="true">← </span>Retour à la liste
              </button>
              {compact && (
                <span className="casefile-sheet-bar-title" aria-hidden="true">
                  {selectedItem.label}
                </span>
              )}
            </div>
            {renderSheet(selectedItem)}
          </section>
        )}
      </div>
    </div>
  );
}
