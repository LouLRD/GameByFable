/**
 * Bureau principal (GDD §12) : structure exacte attendue par src/styles/layout.css.
 *
 *   <main class="workbench" data-focus?>
 *     <header class="topbar"> · 4 × <section class="space" data-space data-active> · <nav class="space-bar">
 *
 * Grand écran : quatre espaces visibles, colonnes redimensionnables (poignées au clavier et au
 * pointeur), mode focus. Petit écran : un seul espace (`activeSpace`) + barre à quatre onglets.
 * L'espace « Version » porte un onglet interne Version | Contradictions (`inspectorTab`).
 */
import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type Ref,
} from 'react';
import type { PlayerView } from '@/domain/selectors/playerView';
import { useIsDesktop } from '@/accessibility/useIsDesktop';
import { SPACE_LABELS } from '@/accessibility/useKeyboardShortcuts';
import { CasefilePanel } from '@/features/casefile/CasefilePanel';
import { MapPanel } from '@/features/map/MapPanel';
import { TimelinePanel } from '@/features/timeline/TimelinePanel';
import { ContradictionInspector } from '@/features/version-board/ContradictionInspector';
import { VersionBoard } from '@/features/version-board/VersionBoard';
import { HintCallout } from '@/features/onboarding/HintCallout';
import { IntroCard } from '@/features/onboarding/IntroCard';
import { OnboardingCallout } from '@/features/onboarding/OnboardingCallout';
import { focusToSpace } from '@/features/onboarding/focusTarget';
import { useGameStore, useReducedMotion } from '@/state';
import type { InspectorTab, SpaceId } from '@/state/types';
import {
  RESIZE_STEP,
  clampSize,
  layoutBounds,
  loadSizes,
  saveSizes,
  type Bounds,
  type LayoutSizes,
} from './layoutSizes';
import { SpaceBar } from './SpaceBar';
import { TopBar } from './TopBar';

type WorkbenchStyle = CSSProperties & Record<`--${string}`, string>;

// ---------------------------------------------------------------------------
// Poignée de redimensionnement
// ---------------------------------------------------------------------------

interface ResizerProps {
  label: string;
  controls: string;
  orientation: 'vertical' | 'horizontal';
  value: number;
  bounds: Bounds;
  /** +1 : déplacer le pointeur vers la droite / le bas agrandit ; −1 : l'inverse. */
  pointerDirection: 1 | -1;
  onChange: (value: number) => void;
}

/**
 * Poignée focusable. Rôle `slider` (le seul rôle ARIA à valeur accepté focusable par l'outillage
 * a11y du projet) : flèches droite / haut agrandissent de 16 px, gauche / bas réduisent,
 * Début / Fin vont aux bornes ; le pointeur suit le bord physique.
 */
function Resizer({
  label,
  controls,
  orientation,
  value,
  bounds,
  pointerDirection,
  onChange,
}: ResizerProps): React.JSX.Element {
  const drag = useRef<{ origin: number; value: number } | null>(null);
  const vertical = orientation === 'vertical';

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    let next: number;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        next = value + RESIZE_STEP;
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        next = value - RESIZE_STEP;
        break;
      case 'PageUp':
        next = value + RESIZE_STEP * 4;
        break;
      case 'PageDown':
        next = value - RESIZE_STEP * 4;
        break;
      case 'Home':
        next = bounds.min;
        break;
      case 'End':
        next = bounds.max;
        break;
      default:
        return;
    }
    e.preventDefault();
    onChange(next);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    drag.current = { origin: vertical ? e.clientX : e.clientY, value };
    if (typeof e.currentTarget.setPointerCapture === 'function')
      e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const position = vertical ? e.clientX : e.clientY;
    onChange(d.value + (position - d.origin) * pointerDirection);
  };
  const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    const target = e.currentTarget;
    if (typeof target.hasPointerCapture === 'function' && target.hasPointerCapture(e.pointerId)) {
      target.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <div
      className="resizer"
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-controls={controls}
      aria-orientation={orientation}
      aria-valuemin={bounds.min}
      aria-valuemax={bounds.max}
      aria-valuenow={value}
      aria-valuetext={`${value} pixels`}
      title={`${label} : flèches pour ajuster de ${RESIZE_STEP} px, Début / Fin pour les bornes`}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    />
  );
}

// ---------------------------------------------------------------------------
// Espace de travail
// ---------------------------------------------------------------------------

interface SpaceProps {
  id: SpaceId;
  isDesktop: boolean;
  active: boolean;
  focused: boolean;
  onToggleFocus: () => void;
  tools?: ReactNode;
  resizer?: ReactNode;
  sectionRef?: Ref<HTMLElement>;
  children: ReactNode;
}

function Space({
  id,
  isDesktop,
  active,
  focused,
  onToggleFocus,
  tools,
  resizer,
  sectionRef,
  children,
}: SpaceProps): React.JSX.Element {
  const headingId = useId();
  const title = SPACE_LABELS[id];
  return (
    <section
      id={`space-${id}`}
      className="space"
      data-space={id}
      data-active={active}
      aria-labelledby={headingId}
      tabIndex={-1}
      ref={sectionRef}
    >
      <header className="space-header">
        <h2 id={headingId} className="space-title">
          {title}
        </h2>
        <div className="space-tools">
          {tools}
          {isDesktop ? (
            <button
              type="button"
              className="btn btn-ghost space-focus-btn"
              aria-pressed={focused}
              aria-label={`${focused ? 'Réduire' : 'Agrandir'} l’espace ${title}`}
              title={
                focused
                  ? 'Revenir aux quatre espaces (Échap)'
                  : `Afficher seulement l’espace ${title}`
              }
              onClick={onToggleFocus}
            >
              {focused ? 'Réduire' : 'Agrandir'}
            </button>
          ) : null}
        </div>
      </header>
      {children}
      {isDesktop ? resizer : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Onglets Version | Contradictions
// ---------------------------------------------------------------------------

interface InspectorTabsProps {
  tab: InspectorTab;
  onChange: (tab: InspectorTab) => void;
  contradictionCount: number;
  tabIds: Record<InspectorTab, string>;
  panelId: string;
}

const INSPECTOR_TABS: readonly InspectorTab[] = ['version', 'contradictions'];
const INSPECTOR_TAB_LABELS: Readonly<Record<InspectorTab, string>> = {
  version: 'Version',
  contradictions: 'Contradictions',
};

function InspectorTabs({
  tab,
  onChange,
  contradictionCount,
  tabIds,
  panelId,
}: InspectorTabsProps): React.JSX.Element {
  const buttons = useRef<Record<InspectorTab, HTMLButtonElement | null>>({
    version: null,
    contradictions: null,
  });
  const onKeyDown = (e: ReactKeyboardEvent<HTMLElement>) => {
    const index = INSPECTOR_TABS.indexOf(tab);
    let next: InspectorTab | undefined;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = INSPECTOR_TABS[(index + 1) % INSPECTOR_TABS.length];
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = INSPECTOR_TABS[(index - 1 + INSPECTOR_TABS.length) % INSPECTOR_TABS.length];
        break;
      case 'Home':
        next = INSPECTOR_TABS[0];
        break;
      case 'End':
        next = INSPECTOR_TABS[INSPECTOR_TABS.length - 1];
        break;
      default:
        return;
    }
    if (!next) return;
    e.preventDefault();
    onChange(next);
    buttons.current[next]?.focus();
  };
  return (
    <div className="inspector-tabs" role="tablist" aria-label="Contenu de l’espace Version">
      {INSPECTOR_TABS.map((id) => {
        const selected = id === tab;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            id={tabIds[id]}
            className="inspector-tab"
            aria-selected={selected}
            aria-controls={selected ? panelId : undefined}
            tabIndex={selected ? 0 : -1}
            onKeyDown={onKeyDown}
            ref={(el) => {
              buttons.current[id] = el;
            }}
            onClick={() => onChange(id)}
          >
            {INSPECTOR_TAB_LABELS[id]}
            {id === 'contradictions' && contradictionCount > 0 ? (
              <>
                {' '}
                <span className="count-badge">
                  <span aria-hidden="true">{contradictionCount}</span>
                  <span className="visually-hidden">({contradictionCount} au total)</span>
                </span>
              </>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bureau
// ---------------------------------------------------------------------------

export interface WorkbenchProps {
  view: PlayerView;
}

export function Workbench({ view }: WorkbenchProps): React.JSX.Element {
  const isDesktop = useIsDesktop();
  const reducedMotion = useReducedMotion();
  const activeSpace = useGameStore((s) => s.activeSpace);
  const focusPanel = useGameStore((s) => s.focusPanel);
  const inspectorTab = useGameStore((s) => s.inspectorTab);
  const actionNonce = useGameStore((s) => s.actionNonce);
  const lastActionType = useGameStore((s) => s.lastActionType);

  const [sizes, setSizes] = useState<LayoutSizes>(loadSizes);
  const inspectorRef = useRef<HTMLElement>(null);
  const versionTabId = useId();
  const contradictionsTabId = useId();
  const panelId = useId();
  const tabIds: Record<InspectorTab, string> = {
    version: versionTabId,
    contradictions: contradictionsTabId,
  };

  const resize = (key: keyof LayoutSizes, value: number) => {
    const next: LayoutSizes = { ...sizes, [key]: clampSize(Math.round(value), layoutBounds(key)) };
    saveSizes(next);
    setSizes(next);
  };

  const toggleFocus = (panel: SpaceId) => {
    const store = useGameStore.getState();
    const next = focusPanel === panel ? null : panel;
    store.setFocusPanel(next);
    store.announce(
      next
        ? `Espace ${SPACE_LABELS[panel]} agrandi. Échap pour revenir aux quatre espaces.`
        : 'Les quatre espaces sont visibles.',
    );
  };

  // Retour visuel bref (GDD §12.3) : onde à la pose d'une hypothèse, fissure quand une contradiction
  // bloquante apparaît. Appliqué directement au DOM ; neutralisé en mouvement réduit.
  const blocking = view.version.blockingIds.length;
  const previous = useRef({ blocking, actionNonce });
  useEffect(() => {
    const prev = previous.current;
    let klass: 'anim-crack' | 'anim-propagate' | null = null;
    if (blocking > prev.blocking) klass = 'anim-crack';
    else if (actionNonce !== prev.actionNonce && lastActionType === 'set-claim')
      klass = 'anim-propagate';
    previous.current = { blocking, actionNonce };
    const element = inspectorRef.current;
    if (!klass || reducedMotion || !element) return;
    const applied = klass;
    element.classList.add(applied);
    const id = window.setTimeout(() => element.classList.remove(applied), 600);
    return () => {
      window.clearTimeout(id);
      element.classList.remove(applied);
    };
  }, [blocking, actionNonce, lastActionType, reducedMotion]);

  const style: WorkbenchStyle = {
    '--casefile-width': `${sizes.casefile}px`,
    '--inspector-width': `${sizes.inspector}px`,
    '--timeline-height': `${sizes.timeline}px`,
  };
  const isActive = (space: SpaceId) => isDesktop || activeSpace === space;
  const onboarding = view.onboarding;
  const calloutAnchor: SpaceId = onboarding ? focusToSpace(onboarding.focus) : 'inspector';
  const hintsEnabled = useGameStore((s) => s.prefs.hintsEnabled);
  const impasseCount = useGameStore((s) => s.impasseCount);
  const hintThreshold = useGameStore((s) => s.scenario?.data.extension.hintAfterImpasses ?? 3);
  const showHint = hintsEnabled && impasseCount >= hintThreshold;

  return (
    <main
      className="workbench"
      data-callout={onboarding || showHint ? calloutAnchor : undefined}
      data-focus={focusPanel ?? undefined}
      style={style}
    >
      <a className="skip-link" href="#space-casefile">
        Aller au dossier
      </a>
      <TopBar view={view} isDesktop={isDesktop} />

      <Space
        id="casefile"
        isDesktop={isDesktop}
        active={isActive('casefile')}
        focused={focusPanel === 'casefile'}
        onToggleFocus={() => toggleFocus('casefile')}
        resizer={
          <Resizer
            label="Largeur du dossier"
            controls="space-casefile"
            orientation="vertical"
            value={sizes.casefile}
            bounds={layoutBounds('casefile')}
            pointerDirection={1}
            onChange={(v) => resize('casefile', v)}
          />
        }
      >
        <div className="space-body">
          <IntroCard view={view} />
          <CasefilePanel />
        </div>
      </Space>

      <Space
        id="map"
        isDesktop={isDesktop}
        active={isActive('map')}
        focused={focusPanel === 'map'}
        onToggleFocus={() => toggleFocus('map')}
      >
        <div className="space-body">
          <MapPanel />
        </div>
      </Space>

      <Space
        id="timeline"
        isDesktop={isDesktop}
        active={isActive('timeline')}
        focused={focusPanel === 'timeline'}
        onToggleFocus={() => toggleFocus('timeline')}
        resizer={
          <Resizer
            label="Hauteur de la frise"
            controls="space-timeline"
            orientation="horizontal"
            value={sizes.timeline}
            bounds={layoutBounds('timeline')}
            pointerDirection={-1}
            onChange={(v) => resize('timeline', v)}
          />
        }
      >
        <div className="space-body">
          <TimelinePanel />
        </div>
      </Space>

      <Space
        id="inspector"
        isDesktop={isDesktop}
        active={isActive('inspector')}
        focused={focusPanel === 'inspector'}
        onToggleFocus={() => toggleFocus('inspector')}
        sectionRef={inspectorRef}
        tools={
          <InspectorTabs
            tab={inspectorTab}
            onChange={(tab) => useGameStore.getState().setInspectorTab(tab)}
            contradictionCount={view.contradictions.length}
            tabIds={tabIds}
            panelId={panelId}
          />
        }
        resizer={
          <Resizer
            label="Largeur de l’espace Version"
            controls="space-inspector"
            orientation="vertical"
            value={sizes.inspector}
            bounds={layoutBounds('inspector')}
            pointerDirection={-1}
            onChange={(v) => resize('inspector', v)}
          />
        }
      >
        <div
          className="space-body"
          role="tabpanel"
          id={panelId}
          aria-labelledby={tabIds[inspectorTab]}
        >
          {inspectorTab === 'version' ? <VersionBoard /> : <ContradictionInspector />}
        </div>
      </Space>

      <div className="callout-stack" data-anchor={calloutAnchor}>
        {onboarding ? <OnboardingCallout step={onboarding} isDesktop={isDesktop} /> : null}
        <HintCallout view={view} />
      </div>

      <SpaceBar view={view} />
    </main>
  );
}
