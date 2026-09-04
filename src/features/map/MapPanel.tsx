/**
 * Espace « Plan » (GDD §7.1, §12, §15) : en-tête avec heure simulée et légende repliable,
 * plan SVG interactif (zoom et déplacement via `MapViewport`), tray des personnages hors champ et
 * fiche de la zone sélectionnée.
 *
 * Toutes les lectures passent par la vue joueur et les données publiques du plan ; les seules
 * écritures sont la sélection partagée, le curseur et les annonces. Le plan suit le curseur sans
 * recalcul du moteur : la trame est mémoïsée sur [curseur, vue, monde connu, sélection].
 *
 * Mode compact (`compact`, coquille mobile < 1024 px) : pas de grand en-tête (titre masqué mais
 * présent), plan pleine largeur, barre d'outils au pouce (heure, Légende, Fiche), tray en rangée
 * défilante, légende et fiche en feuilles de fond (`Dialog`). La fiche s'ouvre à chaque sélection
 * faite depuis le panneau ; sa fermeture ne touche pas la sélection du store.
 */
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Portrait } from '@/components/portrait';
import { Dialog } from '@/components/ui';
import { knownWorld } from '@/domain/engine/context';
import type { CharacterView } from '@/domain/selectors/playerView';
import { useGameStore, usePlayerView, useReducedMotion } from '@/state';
import { buildMapFrame, type MapFrame } from './mapModel';
import { MapViewport } from './MapViewport';
import { StoreMap } from './StoreMap';
import { ZoneSheet } from './ZoneSheet';
import './map.css';

/** Durée de la propagation visuelle après une hypothèse placée. */
const PULSE_MS = 1400;
/** Durée de la mise en évidence demandée par le store (`highlight`). */
const HIGHLIGHT_MS = 2600;
const EMPTY_SET: ReadonlySet<string> = new Set<string>();

const LEGEND_ITEMS: readonly {
  status: 'established' | 'reported' | 'proposed' | 'unknown';
  glyph: string;
  label: string;
  detail: string;
}[] = [
  {
    status: 'established',
    glyph: '■',
    label: 'établi',
    detail: 'jeton plein : caméra, pièce ou fait révélé',
  },
  {
    status: 'reported',
    glyph: '▤',
    label: 'rapporté',
    detail: 'contour pointillé : déclaration debout',
  },
  {
    status: 'proposed',
    glyph: '◆',
    label: 'proposé',
    detail: 'losange surligné : votre version',
  },
  {
    status: 'unknown',
    glyph: '?',
    label: 'inconnu',
    detail: 'hors champ : la personne figure dans la liste sous le plan',
  },
];

type LegendSymbolKind = 'camera' | 'offcam' | 'obstruction' | 'passage' | 'sight' | 'sound';

/** Symboles du plan expliqués dans la feuille de légende (mode compact). */
const LEGEND_SYMBOLS: readonly { kind: LegendSymbolKind; label: string; detail: string }[] = [
  { kind: 'camera', label: 'CAM', detail: 'zone filmée par la caméra des zones centrales' },
  {
    kind: 'offcam',
    label: 'hors champ',
    detail: 'hachures : zone filmée mais caméra interrompue à cet instant',
  },
  {
    kind: 'obstruction',
    label: 'obstruction',
    detail: 'palette connue : trajets ralentis, vue bloquée entre deux zones',
  },
  {
    kind: 'passage',
    label: 'passage',
    detail: 'trait entre deux zones et sa durée ; pointillé : fermé ; ambre épais : obstrué',
  },
  {
    kind: 'sight',
    label: 'lignes de vue',
    detail: 'traits ambre depuis la personne sélectionnée ; pointillés : vue partielle',
  },
  {
    kind: 'sound',
    label: 'son',
    detail: 'anneaux corail ♪ : propagation d’un son et intensité par zone',
  },
];

function LegendSwatch({ status }: { status: (typeof LEGEND_ITEMS)[number]['status'] }) {
  return (
    <svg className="map-legend-swatch" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
      {status === 'established' ? (
        <circle className="map-legend-established" cx={7} cy={7} r={5} />
      ) : status === 'reported' ? (
        <circle className="map-legend-reported" cx={7} cy={7} r={5} />
      ) : status === 'proposed' ? (
        <polygon className="map-legend-proposed" points="7,1 13,7 7,13 1,7" />
      ) : (
        <text className="map-legend-unknown" x={7} y={10.5} textAnchor="middle">
          ?
        </text>
      )}
    </svg>
  );
}

function LegendSymbol({ kind }: { kind: LegendSymbolKind }) {
  return (
    <svg
      className="map-legend-swatch map-legend-symbol"
      viewBox="0 0 24 14"
      aria-hidden="true"
      focusable="false"
    >
      {kind === 'camera' ? (
        <>
          <rect className="map-legend-cam-bg" x={2} y={3} width={20} height={8} rx={1} />
          <text className="map-legend-cam-text" x={12} y={9.4} textAnchor="middle">
            CAM
          </text>
        </>
      ) : kind === 'offcam' ? (
        <>
          <rect className="map-legend-frame" x={1.5} y={1.5} width={21} height={11} />
          {[0, 1, 2, 3, 4].map((i) => (
            <line
              key={i}
              className="map-legend-hatch"
              x1={2 + i * 5}
              y1={12}
              x2={7 + i * 5}
              y2={2}
            />
          ))}
        </>
      ) : kind === 'obstruction' ? (
        <>
          <rect className="map-legend-slat" x={4} y={2} width={16} height={2.4} />
          <rect className="map-legend-slat" x={4} y={6} width={16} height={2.4} />
          <rect className="map-legend-block" x={5} y={9.4} width={3.4} height={3.2} />
          <rect className="map-legend-block" x={10.3} y={9.4} width={3.4} height={3.2} />
          <rect className="map-legend-block" x={15.6} y={9.4} width={3.4} height={3.2} />
        </>
      ) : kind === 'passage' ? (
        <>
          <line className="map-legend-passage" x1={2} y1={7} x2={22} y2={7} />
          <rect className="map-legend-passage-tag" x={8} y={4.6} width={8} height={4.8} rx={0.6} />
        </>
      ) : kind === 'sight' ? (
        <>
          <circle className="map-legend-sight-origin" cx={3} cy={11} r={2} />
          <line className="map-legend-sight" x1={3} y1={11} x2={22} y2={3} />
        </>
      ) : (
        <>
          <circle className="map-legend-sound" cx={12} cy={7} r={2.5} />
          <circle className="map-legend-sound" cx={12} cy={7} r={5.5} />
        </>
      )}
    </svg>
  );
}

/** Entrées de légende ; `extended` ajoute les symboles (feuille compacte). */
function LegendItems({ extended }: { extended: boolean }): React.JSX.Element {
  return (
    <>
      {LEGEND_ITEMS.map((item) => (
        <li key={item.status} className="map-legend-item" data-status={item.status}>
          <LegendSwatch status={item.status} />
          <span>
            <strong className="map-legend-label">
              <span aria-hidden="true">{item.glyph} </span>
              {item.label}
            </strong>{' '}
            — {item.detail}
          </span>
        </li>
      ))}
      {extended
        ? LEGEND_SYMBOLS.map((symbol) => (
            <li key={symbol.kind} className="map-legend-item" data-symbol={symbol.kind}>
              <LegendSymbol kind={symbol.kind} />
              <span>
                <strong className="map-legend-label">{symbol.label}</strong> — {symbol.detail}
              </span>
            </li>
          ))
        : null}
    </>
  );
}

interface TrayProps {
  characters: CharacterView[];
  clock: string;
  selectedId: string | null;
  onSelectCharacter: (characterId: string) => void;
}

function OffScreenTray({ characters, clock, selectedId, onSelectCharacter }: TrayProps) {
  const titleId = useId();
  return (
    <div className="map-tray" role="group" aria-labelledby={titleId}>
      <span id={titleId} className="map-tray-title">
        Hors champ à cet instant ({characters.length})
      </span>
      {characters.length === 0 ? (
        <span className="muted map-tray-empty">Tout le monde a une position connue à {clock}.</span>
      ) : (
        <ul className="map-list map-tray-list">
          {characters.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="chip map-tray-chip"
                aria-pressed={selectedId === c.id}
                onClick={() => onSelectCharacter(c.id)}
              >
                <span className="map-tray-portrait" aria-hidden="true">
                  <Portrait
                    seed={c.portraitSeed}
                    accentColor={c.accentColor}
                    name={c.name}
                    size={20}
                  />
                </span>
                <span>{c.name}</span>
                <span className="visually-hidden">
                  , position inconnue à {clock} — sélectionner
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export interface MapPanelProps {
  /** Rendu par la coquille mobile (< 1024 px). Absent : bureau, rendu inchangé. */
  compact?: boolean;
}

export function MapPanel({ compact = false }: MapPanelProps = {}): React.JSX.Element {
  const view = usePlayerView();
  const scenario = useGameStore((s) => s.scenario);
  const game = useGameStore((s) => s.game);
  const cursor = useGameStore((s) => s.cursor);
  const selection = useGameStore((s) => s.selection);
  const highlightIds = useGameStore((s) => s.highlightIds);
  const highlightNonce = useGameStore((s) => s.highlightNonce);
  const actionNonce = useGameStore((s) => s.actionNonce);
  const lastActionType = useGameStore((s) => s.lastActionType);
  const actions = useGameStore((s) => s.actions);
  const reducedMotion = useReducedMotion();
  const [legendOpen, setLegendOpen] = useState(false);
  const legendId = useId();
  /** Clé « kind:id » de la sélection pour laquelle la feuille compacte est ouverte. */
  const [sheetFor, setSheetFor] = useState<string | null>(null);
  const closeSheet = useCallback(() => setSheetFor(null), []);
  const closeLegend = useCallback(() => setLegendOpen(false), []);
  const announce = useCallback((message: string) => useGameStore.getState().announce(message), []);

  const world = useMemo(
    () => (scenario && game ? knownWorld(scenario, game.unlockedEvidenceIds) : null),
    [scenario, game],
  );
  const frame = useMemo<MapFrame | null>(
    () =>
      scenario && view && world
        ? buildMapFrame({ scenario, view, world, cursor, selection })
        : null,
    [scenario, view, world, cursor, selection],
  );

  // Propagation brève : zones et acteur impliqués par la dernière hypothèse placée.
  const [pulseSeen, setPulseSeen] = useState(0);
  const pulseActive = lastActionType === 'set-claim' && actionNonce > pulseSeen;
  useEffect(() => {
    if (!pulseActive) return;
    const timer = window.setTimeout(() => setPulseSeen(actionNonce), PULSE_MS);
    return () => window.clearTimeout(timer);
  }, [pulseActive, actionNonce]);
  const pulseIds = useMemo<ReadonlySet<string>>(() => {
    if (!pulseActive || !view) return EMPTY_SET;
    const last = actions.at(-1);
    if (last?.type !== 'set-claim') return EMPTY_SET;
    const claim = view.version.claims[last.slotId];
    const ids = new Set<string>();
    if (claim?.zoneId) ids.add(claim.zoneId);
    if (claim?.actorId) ids.add(claim.actorId);
    return ids;
  }, [pulseActive, view, actions]);

  // Mise en évidence demandée par d'autres espaces (`highlight`).
  const [highlightSeen, setHighlightSeen] = useState(0);
  const highlightActive = highlightIds.length > 0 && highlightNonce > highlightSeen;
  useEffect(() => {
    if (!highlightActive) return;
    const timer = window.setTimeout(() => setHighlightSeen(highlightNonce), HIGHLIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [highlightActive, highlightNonce]);
  const highlightSet = useMemo<ReadonlySet<string>>(
    () => (highlightActive ? new Set(highlightIds) : EMPTY_SET),
    [highlightActive, highlightIds],
  );

  const compactAttr = compact ? 'true' : undefined;

  if (!view || !frame) {
    return (
      <div className="map-panel" data-testid="map-panel" data-compact={compactAttr}>
        {compact ? (
          <h2 className="visually-hidden">Plan — La Veilleuse</h2>
        ) : (
          <header className="panel-header map-header">
            <h2 className="panel-title">Plan — La Veilleuse</h2>
          </header>
        )}
        <p className="map-empty muted">
          Aucune partie en cours : le plan s’affichera dès l’ouverture du dossier.
        </p>
      </div>
    );
  }

  const selectedZoneId = selection?.kind === 'zone' ? selection.id : null;
  const selectedCharacterId = selection?.kind === 'character' ? selection.id : null;
  const selectedCharacter =
    selectedCharacterId !== null
      ? (view.characters.find((c) => c.id === selectedCharacterId) ?? null)
      : null;
  const selectionKey =
    selectedZoneId !== null
      ? `zone:${selectedZoneId}`
      : selectedCharacterId !== null
        ? `character:${selectedCharacterId}`
        : null;

  // Les actions du store sont stables : on les appelle sur l'instance courante plutôt que de
  // les extraire (méthodes non liées).
  const openSheetFor = (kind: 'zone' | 'character', id: string): void => {
    if (compact) setSheetFor(`${kind}:${id}`);
  };
  const handleSelectZone = (zoneId: string): void => {
    const store = useGameStore.getState();
    store.select('zone', zoneId);
    const zone = frame.zoneById.get(zoneId);
    if (zone) store.announce(`${zone.label}.`);
    openSheetFor('zone', zoneId);
  };
  const handleSelectCharacter = (characterId: string): void => {
    const store = useGameStore.getState();
    store.select('character', characterId);
    const character = view.characters.find((c) => c.id === characterId);
    if (character) store.announce(`${character.name} — sélection.`);
    openSheetFor('character', characterId);
  };
  const handleGoTo = (t: number): void => {
    const store = useGameStore.getState();
    store.setCursor(t);
    store.announce(`Curseur placé à ${view.clock(t)}.`);
  };
  const handleOpenMarker = (kind: 'evidence' | 'fact', id: string): void => {
    useGameStore.getState().select(kind, id);
  };

  const storeMap = (
    <StoreMap
      frame={frame}
      selection={selection}
      highlightIds={highlightSet}
      pulseIds={pulseIds}
      animate={!reducedMotion}
      compact={compact}
      onSelectZone={handleSelectZone}
    />
  );

  if (compact) {
    // Feuille de fond : zone sélectionnée, ou zone où se trouve la personne sélectionnée.
    const characterZone =
      selectedCharacterId !== null
        ? (frame.zones.find((z) => z.tokens.some((t) => t.characterId === selectedCharacterId)) ??
          null)
        : null;
    const sheetZoneId = selectedZoneId ?? characterZone?.zone.id ?? null;
    const sheetTitle =
      selectedZoneId !== null
        ? (frame.zoneById.get(selectedZoneId)?.zone.label ?? 'Fiche de zone')
        : (selectedCharacter?.name ?? 'Fiche');
    const sheetOpen = sheetFor !== null && sheetFor === selectionKey;

    return (
      <div
        className="map-panel"
        data-testid="map-panel"
        data-compact="true"
        data-camera-on={frame.cameraOn}
      >
        <h2 className="visually-hidden">Plan — La Veilleuse</h2>
        <MapViewport compact onAnnounce={announce}>
          {storeMap}
        </MapViewport>
        <div className="map-toolbar">
          <span className="map-clock mono">
            <span className="visually-hidden">Heure simulée </span>
            {frame.clock}
          </span>
          <button
            type="button"
            className="btn btn-ghost map-legend-toggle"
            aria-haspopup="dialog"
            aria-expanded={legendOpen}
            onClick={() => setLegendOpen(true)}
          >
            Légende
          </button>
          <button
            type="button"
            className="btn map-sheet-open"
            disabled={selectionKey === null}
            aria-haspopup="dialog"
            aria-expanded={sheetOpen}
            aria-label={
              selectionKey === null
                ? 'Ouvrir la fiche (aucune sélection)'
                : `Ouvrir la fiche — ${sheetTitle}`
            }
            onClick={() => {
              if (selectionKey !== null) setSheetFor(selectionKey);
            }}
          >
            Fiche
          </button>
        </div>
        <OffScreenTray
          characters={frame.offScreen}
          clock={frame.clock}
          selectedId={selectedCharacterId}
          onSelectCharacter={handleSelectCharacter}
        />

        <Dialog
          open={legendOpen}
          title="Légende du plan"
          onClose={closeLegend}
          className="map-legend-dialog"
        >
          <ul className="map-list map-legend map-legend-sheet">
            <LegendItems extended />
          </ul>
        </Dialog>

        <Dialog
          open={sheetOpen}
          title={sheetTitle}
          onClose={closeSheet}
          className="map-sheet-dialog"
        >
          <ZoneSheet
            frame={frame}
            zoneId={sheetZoneId}
            selection={selection}
            selectedCharacter={selectedCharacter}
            clock={view.clock}
            onSelectZone={handleSelectZone}
            onSelectCharacter={handleSelectCharacter}
            onOpenMarker={handleOpenMarker}
            onGoTo={handleGoTo}
            variant="embedded"
          />
        </Dialog>
      </div>
    );
  }

  return (
    <div className="map-panel" data-testid="map-panel" data-camera-on={frame.cameraOn}>
      <header className="panel-header map-header">
        <h2 className="panel-title">Plan — La Veilleuse</h2>
        <div className="map-header-tools">
          <span className="map-clock mono">
            <span className="visually-hidden">Heure simulée </span>
            {frame.clock}
          </span>
          <button
            type="button"
            className="btn btn-ghost map-legend-toggle"
            aria-expanded={legendOpen}
            aria-controls={legendId}
            onClick={() => setLegendOpen((v) => !v)}
          >
            Légende
          </button>
        </div>
      </header>
      <ul id={legendId} className="map-list map-legend" hidden={!legendOpen}>
        <LegendItems extended={false} />
      </ul>

      <div className="map-body">
        <div className="map-canvas">
          <MapViewport onAnnounce={announce}>{storeMap}</MapViewport>
          <OffScreenTray
            characters={frame.offScreen}
            clock={frame.clock}
            selectedId={selectedCharacterId}
            onSelectCharacter={handleSelectCharacter}
          />
        </div>
        <ZoneSheet
          frame={frame}
          zoneId={selectedZoneId}
          selection={selection}
          selectedCharacter={selectedCharacter}
          clock={view.clock}
          onSelectZone={handleSelectZone}
          onSelectCharacter={handleSelectCharacter}
          onOpenMarker={handleOpenMarker}
          onGoTo={handleGoTo}
        />
      </div>
    </div>
  );
}
