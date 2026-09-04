/**
 * Coquille MOBILE (≤ 1023 px) : un terminal d'enquête tenu en main.
 *
 * - En-tête compact d'une rangée : acte, horloge simulée (bouton → espace Temps), pression, menu.
 * - Un seul espace monté à la fois (Plan, Temps, Dossier, Version) ; barre de navigation au pouce.
 * - Bandeau temporel persistant dans l'espace Plan (le curseur unique reste synchronisé partout).
 * - Guide d'onboarding ancré au-dessus de la navigation : il ne recouvre jamais sa cible.
 * - Menu, options, sauvegardes… en feuilles de fond (composant Dialog).
 *
 * Aucune logique métier : mêmes actions, sélecteurs et évaluations que le bureau desktop.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { PlayerView } from '@/domain/selectors/playerView';
import { ACT_LABELS } from '@/app/actLabels';
import { useAmbience } from '@/app/ambienceContext';
import { Dialog } from '@/components/ui';
import { CasefilePanel } from '@/features/casefile/CasefilePanel';
import { MapPanel } from '@/features/map/MapPanel';
import { GuideStrip } from '@/features/onboarding/GuideStrip';
import { HintCallout } from '@/features/onboarding/HintCallout';
import { IntroCard } from '@/features/onboarding/IntroCard';
import { TimelinePanel } from '@/features/timeline/TimelinePanel';
import { ContradictionInspector } from '@/features/version-board/ContradictionInspector';
import { VersionBoard } from '@/features/version-board/VersionBoard';
import { SPACE_LABELS } from '@/accessibility/useKeyboardShortcuts';
import { useGameStore, useReducedMotion } from '@/state';
import type { InspectorTab, SpaceId } from '@/state/types';
import './mobile.css';

const SPACE_ORDER: readonly SpaceId[] = ['map', 'timeline', 'casefile', 'inspector'];
const SPACE_GLYPH: Readonly<Record<SpaceId, string>> = {
  map: '▦',
  timeline: '◷',
  casefile: '❐',
  inspector: '◆',
};

export function MobileShell({ view }: { view: PlayerView }): React.JSX.Element {
  const activeSpace = useGameStore((s) => s.activeSpace);
  const inspectorTab = useGameStore((s) => s.inspectorTab);
  const seenIntro = useGameStore((s) => s.prefs.seenIntro);
  const [menuOpen, setMenuOpen] = useState(false);
  const spaceRef = useRef<HTMLElement>(null);
  const reducedMotion = useReducedMotion();

  // Changer d'espace remonte en haut du nouvel espace et y place le focus (ordre de lecture logique).
  const previousSpace = useRef(activeSpace);
  useEffect(() => {
    if (previousSpace.current === activeSpace) return;
    previousSpace.current = activeSpace;
    const el = spaceRef.current;
    if (!el) return;
    if (typeof el.scrollTo === 'function')
      el.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
    else el.scrollTop = 0;
    el.focus({ preventScroll: true });
  }, [activeSpace, reducedMotion]);

  const blocking = view.version.blockingIds.length;
  const label = SPACE_LABELS[activeSpace];

  return (
    <main className="mobile" data-space={activeSpace} data-testid="mobile-shell">
      <a className="skip-link" href="#mobile-space">
        Aller au contenu
      </a>
      <MobileHeader view={view} onMenu={() => setMenuOpen(true)} menuOpen={menuOpen} />

      <section
        id="mobile-space"
        ref={spaceRef}
        className="mobile-space"
        data-space={activeSpace}
        aria-label={`Espace ${label}`}
        tabIndex={-1}
      >
        {!seenIntro && activeSpace === 'casefile' ? <IntroCard view={view} /> : null}
        {activeSpace === 'map' ? <MapPanel compact /> : null}
        {activeSpace === 'timeline' ? <TimelinePanel compact /> : null}
        {activeSpace === 'casefile' ? <CasefilePanel compact /> : null}
        {activeSpace === 'inspector' ? (
          <InspectorSpace tab={inspectorTab} blocking={blocking} />
        ) : null}
      </section>

      {activeSpace === 'map' ? <TimeStrip view={view} /> : null}

      <div className="mobile-dock">
        <HintCallout view={view} />
        {view.onboarding ? <GuideStrip step={view.onboarding} /> : null}
      </div>

      <MobileNav view={view} />
      <MenuSheet view={view} open={menuOpen} onClose={() => setMenuOpen(false)} />
    </main>
  );
}

// ---------------------------------------------------------------------------
// En-tête compact
// ---------------------------------------------------------------------------

function MobileHeader({
  view,
  onMenu,
  menuOpen,
}: {
  view: PlayerView;
  onMenu: () => void;
  menuOpen: boolean;
}): React.JSX.Element {
  const cursor = useGameStore((s) => s.cursor);
  const clock = view.clock(cursor);
  const actShort = view.act === 'Épilogue' ? 'Épilogue' : `Acte ${view.act}`;
  return (
    <header className="mobile-header">
      <p className="mobile-act" title={ACT_LABELS[view.act]}>
        <span className="visually-hidden">{ACT_LABELS[view.act]}</span>
        <span aria-hidden="true">{actShort}</span>
      </p>
      <button
        type="button"
        className="mobile-clock"
        title="Ouvrir l’espace Temps"
        aria-label={`Heure simulée ${clock} — ouvrir l’espace Temps`}
        onClick={() => {
          const store = useGameStore.getState();
          store.setActiveSpace('timeline');
          store.announce('Espace Temps.');
        }}
      >
        <time dateTime={clock}>{clock}</time>
      </button>
      <PressurePips value={view.pressure} max={view.pressureMax} />
      <button
        type="button"
        className="mobile-menu-btn"
        aria-haspopup="dialog"
        aria-expanded={menuOpen}
        aria-label="Menu : sauvegardes, options, aide, son, nouvelle partie"
        onClick={onMenu}
      >
        <span aria-hidden="true">☰</span>
        <span className="mobile-menu-label">Menu</span>
      </button>
    </header>
  );
}

function PressurePips({ value, max }: { value: number; max: number }): React.JSX.Element {
  return (
    <div
      className="mobile-pressure"
      role="meter"
      aria-label="Pression"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuetext={`Pression ${value} sur ${max}`}
      title="Pression disponible pour les confrontations"
    >
      <span className="mobile-pressure-num mono" aria-hidden="true">
        {value}/{max}
      </span>
      <span className="mobile-pressure-pips" aria-hidden="true">
        {Array.from({ length: max }, (_, i) => (
          <span key={i} className="mobile-pip" data-filled={i < value} />
        ))}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Espace Version : segments Version | Contradictions
// ---------------------------------------------------------------------------

function InspectorSpace({
  tab,
  blocking,
}: {
  tab: InspectorTab;
  blocking: number;
}): React.JSX.Element {
  const versionId = useId();
  const contraId = useId();
  const panelId = useId();
  const setTab = (next: InspectorTab) => useGameStore.getState().setInspectorTab(next);
  return (
    <div className="mobile-inspector">
      <div className="mobile-segments" role="tablist" aria-label="Contenu de l’espace Version">
        <button
          type="button"
          role="tab"
          id={versionId}
          className="mobile-segment"
          aria-selected={tab === 'version'}
          aria-controls={panelId}
          tabIndex={tab === 'version' ? 0 : -1}
          onClick={() => setTab('version')}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
              e.preventDefault();
              setTab('contradictions');
            }
          }}
        >
          Version
        </button>
        <button
          type="button"
          role="tab"
          id={contraId}
          className="mobile-segment"
          aria-selected={tab === 'contradictions'}
          aria-controls={panelId}
          tabIndex={tab === 'contradictions' ? 0 : -1}
          onClick={() => setTab('contradictions')}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
              e.preventDefault();
              setTab('version');
            }
          }}
        >
          Contradictions
          {blocking > 0 ? (
            <span className="mobile-segment-badge">
              <span aria-hidden="true"> ⚠ {blocking}</span>
              <span className="visually-hidden">
                {' '}
                {blocking} contradiction{blocking > 1 ? 's' : ''} bloquante{blocking > 1 ? 's' : ''}
              </span>
            </span>
          ) : null}
        </button>
      </div>
      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={tab === 'version' ? versionId : contraId}
        className="mobile-inspector-panel"
      >
        {tab === 'version' ? <VersionBoard compact /> : <ContradictionInspector compact />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bandeau temporel (espace Plan) : manipuler le temps sans quitter le plan
// ---------------------------------------------------------------------------

export function TimeStrip({ view }: { view: PlayerView }): React.JSX.Element {
  const cursor = useGameStore((s) => s.cursor);
  const playing = useGameStore((s) => s.playing);
  const nudge = (delta: number) => {
    const store = useGameStore.getState();
    store.nudgeCursor(delta);
  };
  const outputId = useId();
  return (
    <div className="mobile-timestrip" role="group" aria-label="Curseur temporel (plan)">
      <button
        type="button"
        className="mobile-time-btn"
        aria-label="Reculer de 10 secondes"
        disabled={cursor <= 0}
        onClick={() => nudge(-10)}
      >
        −10
      </button>
      <button
        type="button"
        className="mobile-time-btn"
        aria-label="Reculer d’une seconde"
        disabled={cursor <= 0}
        onClick={() => nudge(-1)}
      >
        −1
      </button>
      <label className="mobile-time-range">
        <span className="visually-hidden">Heure de la soirée</span>
        <output id={outputId} className="mobile-time-out mono" aria-live="off">
          {view.clock(cursor)}
        </output>
        <input
          type="range"
          min={0}
          max={view.durationSeconds}
          step={1}
          value={cursor}
          aria-valuetext={view.clock(cursor)}
          aria-describedby={outputId}
          onChange={(e) => useGameStore.getState().setCursor(Number(e.target.value))}
        />
      </label>
      <button
        type="button"
        className="mobile-time-btn"
        aria-label="Avancer d’une seconde"
        disabled={cursor >= view.durationSeconds}
        onClick={() => nudge(1)}
      >
        +1
      </button>
      <button
        type="button"
        className="mobile-time-btn"
        aria-label="Avancer de 10 secondes"
        disabled={cursor >= view.durationSeconds}
        onClick={() => nudge(10)}
      >
        +10
      </button>
      <button
        type="button"
        className="mobile-time-btn mobile-time-play"
        aria-pressed={playing}
        aria-label={playing ? 'Mettre la relecture en pause' : 'Lancer la relecture'}
        onClick={() => useGameStore.getState().setPlaying(!playing)}
      >
        <span aria-hidden="true">{playing ? '❚❚' : '▶'}</span>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Navigation persistante
// ---------------------------------------------------------------------------

function MobileNav({ view }: { view: PlayerView }): React.JSX.Element {
  const activeSpace = useGameStore((s) => s.activeSpace);
  const counts: Partial<Record<SpaceId, { count: number; label: string }>> = {
    casefile: {
      count: view.evidence.length + view.statements.length,
      label: 'éléments au dossier',
    },
    inspector: {
      count: view.version.blockingIds.length,
      label: 'contradictions bloquantes',
    },
  };
  return (
    <nav className="mobile-nav" aria-label="Espaces de travail">
      {SPACE_ORDER.map((id, index) => {
        const active = id === activeSpace;
        const label = SPACE_LABELS[id];
        const badge = counts[id];
        return (
          <button
            key={id}
            type="button"
            className="mobile-nav-tab"
            aria-current={active ? 'page' : undefined}
            title={`${label} (touche ${index + 1})`}
            onClick={() => {
              const store = useGameStore.getState();
              store.setActiveSpace(id);
              store.announce(`Espace ${label}.`);
            }}
          >
            <span className="mobile-nav-glyph" aria-hidden="true">
              {SPACE_GLYPH[id]}
            </span>
            <span className="mobile-nav-label">{label}</span>
            {badge && badge.count > 0 ? (
              <span className="mobile-nav-badge" data-kind={id}>
                <span aria-hidden="true">{badge.count}</span>
                <span className="visually-hidden">
                  {' '}
                  {badge.count} {badge.label}
                </span>
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Menu (feuille de fond)
// ---------------------------------------------------------------------------

function MenuSheet({
  view,
  open,
  onClose,
}: {
  view: PlayerView;
  open: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const { enabled, supported, toggle } = useAmbience();
  const openDialog = (id: 'saves' | 'settings' | 'help' | 'new-game') => {
    onClose();
    useGameStore.getState().openDialog(id);
  };
  const item = (label: string, hint: string, action: () => void, extra?: ReactNode) => (
    <button type="button" className="mobile-menu-item" onClick={action}>
      <span className="mobile-menu-item-label">{label}</span>
      <span className="mobile-menu-item-hint muted">{hint}</span>
      {extra}
    </button>
  );
  return (
    <Dialog
      open={open}
      title="La Version Acceptable"
      onClose={onClose}
      width={480}
      className="mobile-menu"
    >
      <p className="mobile-menu-subtitle muted">
        {view.title} — {view.subtitle} · {ACT_LABELS[view.act]}
      </p>
      <div className="mobile-menu-list">
        {item('Sauvegardes', 'Emplacements, export et import JSON', () => openDialog('saves'))}
        {item('Options', 'Taille du texte, mouvement réduit, aide progressive', () =>
          openDialog('settings'),
        )}
        {item('Aide', 'Commandes, degrés, boucle d’enquête, guide', () => openDialog('help'))}
        <button
          type="button"
          className="mobile-menu-item"
          aria-pressed={enabled}
          disabled={!supported}
          onClick={() => void toggle()}
        >
          <span className="mobile-menu-item-label">Son d’ambiance</span>
          <span className="mobile-menu-item-hint muted">
            {!supported
              ? 'Indisponible ici ; les sous-titres restent affichés'
              : enabled
                ? 'Activé — toucher pour couper'
                : 'Coupé — toucher pour activer (jamais sans ce geste)'}
          </span>
        </button>
        {item('Nouvelle partie', 'Confirmation si la progression n’est pas exportée', () =>
          openDialog('new-game'),
        )}
      </div>
    </Dialog>
  );
}
