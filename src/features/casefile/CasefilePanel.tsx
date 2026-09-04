/**
 * Dossier (colonne gauche, GDD §6.1, §12.1) : recherche, filtres à compteurs, liste regroupée,
 * fiche de détail sous la liste (desktop) ou à sa place avec « Retour » (mobile).
 * Toutes les données viennent de la vue joueur ; toute action passe par le store.
 */
import { useId, useMemo, useState, type KeyboardEvent } from 'react';
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
import './casefile.css';

const EMPTY_SET: ReadonlySet<string> = new Set<string>();

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

export function CasefilePanel(): React.JSX.Element {
  const view = usePlayerView();
  const filter = useGameStore((s) => s.casefileFilter);
  const selection = useGameStore((s) => s.selection);
  const zoneLabels = useZoneLabels();

  const [query, setQuery] = useState('');
  const [seen, setSeen] = useState<ReadonlySet<string> | null>(null);
  const [closedSheetFor, setClosedSheetFor] = useState<string | null>(null);
  const titleId = useId();
  const searchId = useId();
  const listId = useId();
  const sheetTitleId = useId();

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
  const visible =
    filter === 'all' ? searched : searched.filter((i) => KIND_TO_FILTER[i.kind] === filter);
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

  const newIds: ReadonlySet<string> = seen
    ? new Set(items.filter((i) => !seen.has(i.id)).map((i) => i.id))
    : EMPTY_SET;

  const selectedItem: CasefileItem | null = selection
    ? (items.find((i) => i.id === selection.id && i.kind === selection.kind) ?? null)
    : null;
  const sheetOpen = selectedItem !== null && closedSheetFor !== selectedItem.id;

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
    navigate(item.kind, item.id);
  };

  const emptyMessage = normalizedQuery
    ? `Aucun élément ne correspond à « ${query.trim()} ».`
    : EMPTY_MESSAGES[filter];

  if (!view) {
    return (
      <div className="casefile" data-sheet-open="false">
        <header className="casefile-header">
          <h2 className="panel-title" id={titleId}>
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
          />
        ) : null;
      }
    }
  };

  return (
    <div className="casefile" data-sheet-open={sheetOpen ? 'true' : 'false'}>
      <header className="casefile-header">
        <div className="casefile-title-row">
          <h2 className="panel-title" id={titleId}>
            Dossier
          </h2>
          <span className="muted casefile-count">
            {items.length} {items.length === 1 ? 'élément' : 'éléments'}
          </span>
        </div>
        <div className="casefile-search">
          <label htmlFor={searchId} className="visually-hidden">
            Rechercher dans le dossier
          </label>
          <input
            id={searchId}
            type="search"
            className="input"
            placeholder="Rechercher un libellé, un texte…"
            value={query}
            aria-controls={listId}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && query !== '') {
                e.preventDefault();
                setQuery('');
              }
            }}
          />
        </div>
        <div role="toolbar" aria-label="Filtrer le dossier" className="casefile-filters">
          {FILTER_ORDER.map((f) => (
            <button
              key={f}
              type="button"
              className="chip"
              aria-pressed={filter === f}
              onClick={() => useGameStore.getState().setCasefileFilter(f)}
              onKeyDown={onFilterKeyDown}
            >
              {FILTER_LABELS[f]} <span className="casefile-filter-count">({counts[f]})</span>
            </button>
          ))}
        </div>
        <p className="visually-hidden" role="status">
          {filter === 'journal'
            ? `${journalEntries.length} ${journalEntries.length === 1 ? 'entrée' : 'entrées'} de journal`
            : `${visible.length} ${visible.length === 1 ? 'élément affiché' : 'éléments affichés'}`}
        </p>
      </header>

      <div className="casefile-body">
        <div className="casefile-list-region" id={listId}>
          {filter === 'all' && !normalizedQuery && (
            <div className="ticket casefile-premise">
              <div className="ticket-header">{view.title}</div>
              <p>{view.premise}</p>
            </div>
          )}
          {filter === 'journal' ? (
            <JournalList
              entries={journalEntries}
              view={view}
              onNavigate={navigate}
              emptyMessage={emptyMessage}
            />
          ) : (
            <CasefileList
              items={visible}
              grouped={filter === 'all'}
              selectedId={selectedItem?.id ?? null}
              newIds={newIds}
              onSelect={onSelectItem}
              emptyMessage={emptyMessage}
            />
          )}
        </div>

        {sheetOpen && selectedItem && (
          <section className="casefile-sheet" aria-label={`Fiche : ${selectedItem.label}`}>
            <div className="casefile-sheet-bar">
              <button
                type="button"
                className="btn btn-ghost casefile-back"
                onClick={() => setClosedSheetFor(selectedItem.id)}
              >
                <span aria-hidden="true">← </span>Retour à la liste
              </button>
            </div>
            {renderSheet(selectedItem)}
          </section>
        )}
      </div>
    </div>
  );
}
