/**
 * Espace « Plan » (GDD §7.1, §12, §15) : en-tête avec heure simulée et légende repliable,
 * plan SVG interactif, tray des personnages hors champ et fiche de la zone sélectionnée.
 *
 * Toutes les lectures passent par la vue joueur et les données publiques du plan ; les seules
 * écritures sont la sélection partagée, le curseur et les annonces. Le plan suit le curseur sans
 * recalcul du moteur : la trame est mémoïsée sur [curseur, vue, monde connu, sélection].
 */
import { useEffect, useId, useMemo, useState } from 'react';
import { Portrait } from '@/components/portrait';
import { knownWorld } from '@/domain/engine/context';
import type { CharacterView } from '@/domain/selectors/playerView';
import { useGameStore, usePlayerView, useReducedMotion } from '@/state';
import { buildMapFrame, type MapFrame } from './mapModel';
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

export function MapPanel(): React.JSX.Element {
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

  if (!view || !frame) {
    return (
      <div className="map-panel" data-testid="map-panel">
        <header className="panel-header map-header">
          <h2 className="panel-title">Plan — La Veilleuse</h2>
        </header>
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

  // Les actions du store sont stables : on les appelle sur l'instance courante plutôt que de
  // les extraire (méthodes non liées).
  const handleSelectZone = (zoneId: string): void => {
    const store = useGameStore.getState();
    store.select('zone', zoneId);
    const zone = frame.zoneById.get(zoneId);
    if (zone) store.announce(`${zone.label}.`);
  };
  const handleSelectCharacter = (characterId: string): void => {
    const store = useGameStore.getState();
    store.select('character', characterId);
    const character = view.characters.find((c) => c.id === characterId);
    if (character) store.announce(`${character.name} — sélection.`);
  };
  const handleGoTo = (t: number): void => {
    const store = useGameStore.getState();
    store.setCursor(t);
    store.announce(`Curseur placé à ${view.clock(t)}.`);
  };
  const handleOpenMarker = (kind: 'evidence' | 'fact', id: string): void => {
    useGameStore.getState().select(kind, id);
  };

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
      </ul>

      <div className="map-body">
        <div className="map-canvas">
          <StoreMap
            frame={frame}
            selection={selection}
            highlightIds={highlightSet}
            pulseIds={pulseIds}
            animate={!reducedMotion}
            onSelectZone={handleSelectZone}
          />
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
