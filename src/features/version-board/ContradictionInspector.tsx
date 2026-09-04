/**
 * Inspecteur de contradictions (GDD §9) : liste groupée par genre (physique, temporelle,
 * sensorielle, matérielle, épistémique, discursive), filtres, puis section séparée
 * « Adhésion » pour les résistances sociales — jamais comptées comme incohérences.
 * La contradiction sélectionnée (depuis n'importe quel volet) s'ouvre dans le détail.
 * Mode compact (`compact`, coquille mobile) : liste et détail ne cohabitent pas — un tap ouvre
 * le détail plein panneau (en-tête collant « ← Contradictions »), le retour garde la sélection.
 */
import { useEffect, useId, useMemo, useRef, useState, type JSX, type KeyboardEvent } from 'react';
import type { ContradictionView } from '@/domain/selectors/playerView';
import { KindBadge, SeverityBadge } from '@/components/ui';
import { useGameStore, usePlayerView, useReducedMotion } from '@/state';
import { ContradictionDetail } from './ContradictionDetail';
import {
  api,
  buildResolver,
  KIND_GROUP_TITLES,
  KIND_ORDER,
  plural,
  scrollTo,
  type CoherenceKind,
} from './labels';
import './version-board.css';

type Filter = 'all' | 'version' | 'statements';

const FILTERS: { id: Filter; label: string; compactLabel: string }[] = [
  { id: 'all', label: 'Toutes', compactLabel: 'Toutes' },
  { id: 'version', label: 'Impliquant la version', compactLabel: 'Version' },
  { id: 'statements', label: 'Témoignages', compactLabel: 'Témoignages' },
];

export interface ContradictionInspectorProps {
  /** Mode compact (coquille mobile) : liste puis détail plein panneau. */
  compact?: boolean;
}

function onToolbarKeyDown(e: KeyboardEvent<HTMLButtonElement>): void {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') {
    return;
  }
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

function isCoherenceKind(kind: string): kind is CoherenceKind {
  return (KIND_ORDER as readonly string[]).includes(kind);
}

export function ContradictionInspector({
  compact = false,
}: ContradictionInspectorProps): JSX.Element {
  const view = usePlayerView();
  const scenario = useGameStore((s) => s.scenario);
  const selection = useGameStore((s) => s.selection);
  const reducedMotion = useReducedMotion();
  const [filter, setFilter] = useState<Filter>('all');
  // Compact : détail refermé par « ← Contradictions » sans perdre la sélection partagée.
  const [closedFor, setClosedFor] = useState<string | null>(null);
  const baseId = useId();
  const detailRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const pendingFocus = useRef<'detail' | 'list' | null>(null);

  const resolve = useMemo(
    () =>
      view
        ? buildResolver(view, scenario?.data.zones ?? [])
        : (id: string) => ({ id, label: id, kind: null }),
    [view, scenario],
  );

  const selectedId = selection?.kind === 'contradiction' ? selection.id : null;
  const selected: ContradictionView | undefined = view
    ? [...view.contradictions, ...view.motivational].find((c) => c.id === selectedId)
    : undefined;
  const detailOpen = compact && selected !== undefined && closedFor !== selected.id;

  useEffect(() => {
    if (selected && !compact) scrollTo(detailRef.current, reducedMotion);
  }, [selected?.id, reducedMotion, selected, compact]);

  // Compact : le focus suit la bascule liste ⇄ détail déclenchée par le joueur.
  useEffect(() => {
    if (!compact) return;
    const wanted = pendingFocus.current;
    if (!wanted) return;
    if (wanted === 'detail' && detailOpen) {
      pendingFocus.current = null;
      backRef.current?.focus();
    } else if (wanted === 'list' && !detailOpen) {
      pendingFocus.current = null;
      rootRef.current?.querySelector<HTMLButtonElement>('.ci-item[aria-current="true"]')?.focus();
    }
  }, [compact, detailOpen]);

  if (!view) {
    return (
      <div className="ci">
        <p className="muted">Aucune partie en cours.</p>
      </div>
    );
  }

  const blockingIds = new Set(view.version.blockingIds);

  const onPick = (id: string): void => {
    const store = api();
    setClosedFor(null);
    if (compact) pendingFocus.current = 'detail';
    store.select('contradiction', id);
    store.setInspectorTab('contradictions');
  };

  const onBack = (): void => {
    if (!selected) return;
    pendingFocus.current = 'list';
    setClosedFor(selected.id);
  };

  if (detailOpen && selected) {
    return (
      <div
        ref={rootRef}
        className="ci"
        data-compact="true"
        data-detail-open="true"
        aria-labelledby={`${baseId}-title`}
        role="region"
      >
        <h2 id={`${baseId}-title`} className="visually-hidden">
          Contradictions
        </h2>
        <ContradictionDetail
          compact
          contradiction={selected}
          resolve={resolve}
          clock={view.clock}
          slots={view.slots}
          evaluations={view.version.slots}
          blocking={blockingIds.has(selected.id)}
          onBack={onBack}
          backRef={backRef}
        />
      </div>
    );
  }

  const factual = view.contradictions.filter((c) =>
    filter === 'all' ? true : filter === 'version' ? c.involvesVersion : !c.involvesVersion,
  );
  const groups = KIND_ORDER.map((kind) => ({
    kind,
    items: factual.filter((c) => c.kind === kind),
  })).filter((g) => g.items.length > 0);
  const others = factual.filter((c) => !isCoherenceKind(c.kind));
  const motivational = filter === 'statements' ? [] : view.motivational;
  const versionEmpty = Object.keys(view.version.claims).length === 0;
  const nothing = factual.length === 0 && motivational.length === 0;

  const renderItem = (c: ContradictionView): JSX.Element => {
    const current = c.id === selectedId;
    return (
      <li key={c.id}>
        <button
          type="button"
          className="vb-link ci-item"
          aria-current={current ? 'true' : undefined}
          onClick={() => {
            onPick(c.id);
          }}
        >
          <SeverityBadge severity={c.severity} />
          <KindBadge kind={c.kind} />
          <span className="vb-link-text">{c.title}</span>
          {blockingIds.has(c.id) ? <span className="tag">bloquante</span> : null}
        </button>
      </li>
    );
  };

  return (
    <div
      ref={rootRef}
      className="ci"
      data-compact={compact ? 'true' : undefined}
      aria-labelledby={`${baseId}-title`}
      role="region"
    >
      <header className="vb-header">
        <h2 id={`${baseId}-title`} className={compact ? 'visually-hidden' : 'vb-title'}>
          Contradictions
        </h2>
        <p className="vb-note">
          {plural(view.contradictions.length, 'contradiction', 'contradictions')}, dont{' '}
          {plural(view.version.blockingIds.length, 'bloquante', 'bloquantes')} ;{' '}
          {plural(view.motivational.length, 'résistance sociale', 'résistances sociales')}.
        </p>
      </header>

      <div className="ci-filters" role="toolbar" aria-label="Filtrer les contradictions">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className="chip"
            aria-pressed={filter === f.id}
            onClick={() => {
              setFilter(f.id);
            }}
            onKeyDown={onToolbarKeyDown}
          >
            {compact ? f.compactLabel : f.label}
          </button>
        ))}
      </div>

      {nothing ? (
        <div className="ci-empty" role="status">
          <p>Aucune contradiction : la version tient pour l’instant.</p>
          {versionEmpty ? (
            <p className="vb-note">Placez une hypothèse pour que le moteur la vérifie.</p>
          ) : null}
        </div>
      ) : null}

      {groups.map((g) => (
        <section key={g.kind} className="ci-group" aria-labelledby={`${baseId}-${g.kind}`}>
          <h3 id={`${baseId}-${g.kind}`} className="ci-group-title">
            {KIND_GROUP_TITLES[g.kind]} <span className="muted">({g.items.length})</span>
          </h3>
          <ul className="vb-list vb-linklist">{g.items.map(renderItem)}</ul>
        </section>
      ))}

      {others.length > 0 ? (
        <section className="ci-group" aria-labelledby={`${baseId}-others`}>
          <h3 id={`${baseId}-others`} className="ci-group-title">
            Autres <span className="muted">({others.length})</span>
          </h3>
          <ul className="vb-list vb-linklist">{others.map(renderItem)}</ul>
        </section>
      ) : null}

      {motivational.length > 0 ? (
        <section className="ci-group ci-social" aria-labelledby={`${baseId}-social`}>
          <h3 id={`${baseId}-social`} className="ci-group-title">
            Adhésion <span className="ci-social-tag">résistance sociale</span>
          </h3>
          <p className="vb-note">
            Ces résistances pèsent sur l’adhésion, jamais sur la cohérence : elles ne sont pas
            comptées comme des incohérences.
          </p>
          <ul className="vb-list vb-linklist">{motivational.map(renderItem)}</ul>
        </section>
      ) : null}

      {compact ? null : (
        <div ref={detailRef} className="ci-detail-slot">
          {selected ? (
            <ContradictionDetail
              contradiction={selected}
              resolve={resolve}
              clock={view.clock}
              slots={view.slots}
              blocking={blockingIds.has(selected.id)}
            />
          ) : nothing ? null : (
            <p className="vb-note">Choisissez une contradiction pour lire son explication.</p>
          )}
        </div>
      )}
    </div>
  );
}
