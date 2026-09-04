/**
 * Fiche de la zone sélectionnée : équivalent textuel complet du plan (GDD §7, §15).
 * Nom, couverture caméra, lumière, passages (durée à l'instant du curseur, obstruction,
 * visibilité, perte sonore), personnes présentes, pièces et faits localisés, lignes de vue et
 * propagation sonore en jeu. Chaque bouton agit sur le store via les rappels fournis.
 */
import { useId } from 'react';
import { Portrait, type PortraitState } from '@/components/portrait';
import { DegreeBadge } from '@/components/ui';
import type { CharacterView } from '@/domain/selectors/playerView';
import type { Selection } from '@/state/types';
import {
  FIDELITY_LABELS,
  HEAR_LABELS,
  LIGHT_LABELS,
  POSITION_SOURCE_LABELS,
  SIGHT_LABELS,
  formatMultiplier,
  formatPercent,
  formatSeconds,
  type MapFrame,
  type MarkerFrame,
  type SightFrame,
  type SoundFrame,
  type ZoneFrame,
} from './mapModel';

export interface ZoneSheetProps {
  frame: MapFrame;
  /** Zone sélectionnée (selection.kind === 'zone'), ou null. */
  zoneId: string | null;
  selection: Selection | null;
  /** Personnage sélectionné, positionné ou non (pour expliquer l'absence de lignes de vue). */
  selectedCharacter: CharacterView | null;
  clock: (t: number) => string;
  onSelectZone: (zoneId: string) => void;
  onSelectCharacter: (characterId: string) => void;
  onOpenMarker: (kind: 'evidence' | 'fact', id: string) => void;
  onGoTo: (t: number) => void;
  /**
   * `panel` (défaut) : encadré `<aside>` sous le plan, avec son titre visible.
   * `embedded` : contenu d'une feuille de fond (`Dialog`) qui porte déjà le titre — le nom reste
   * présent pour la structure mais visuellement masqué, et le repère « Sélectionnez une zone »
   * laisse place à l'explication de la position inconnue.
   */
  variant?: 'panel' | 'embedded';
}

const PORTRAIT_STATE: Record<CharacterView['trustState'], PortraitState> = {
  fermé: 'closed',
  prudent: 'careful',
  disponible: 'available',
  engagé: 'engaged',
};

function markerTime(marker: MarkerFrame, clock: (t: number) => string): string {
  if (marker.at !== null) return `à ${clock(marker.at)}`;
  if (marker.interval) return `de ${clock(marker.interval.start)} à ${clock(marker.interval.end)}`;
  return 'sans horodatage';
}

function zoneLabelOf(frame: MapFrame, zoneId: string): string {
  return frame.zoneById.get(zoneId)?.zone.label ?? zoneId;
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

interface DetailsProps {
  frame: MapFrame;
  zone: ZoneFrame;
  titleId: string;
  embedded: boolean;
  selection: Selection | null;
  clock: (t: number) => string;
  onSelectZone: (zoneId: string) => void;
  onSelectCharacter: (characterId: string) => void;
  onOpenMarker: (kind: 'evidence' | 'fact', id: string) => void;
  onGoTo: (t: number) => void;
}

function ZoneDetails({
  frame,
  zone,
  titleId,
  embedded,
  selection,
  clock,
  onSelectZone,
  onSelectCharacter,
  onOpenMarker,
  onGoTo,
}: DetailsProps): React.JSX.Element {
  const ids = useId();
  const passagesId = `${ids}-passages`;
  const peopleId = `${ids}-people`;
  const markersId = `${ids}-markers`;
  const passages = frame.passages.filter(
    (p) => p.from.id === zone.zone.id || p.to.id === zone.zone.id,
  );
  const o = zone.obstruction;

  return (
    <>
      <header className="map-sheet-header">
        <h3 id={titleId} className={embedded ? 'visually-hidden' : 'map-sheet-title'}>
          {zone.zone.label}
        </h3>
        <div className="map-sheet-meta">
          <span className="tag" data-covered={zone.covered ? 'true' : 'false'}>
            {zone.covered ? 'filmée' : 'non filmée'}
          </span>
          <span className="tag" data-light={zone.light}>
            lumière {LIGHT_LABELS[zone.light]} · {formatPercent(zone.zone.light)}
          </span>
          {zone.offCamera ? (
            <span className="badge badge-warning">hors champ à {frame.clock}</span>
          ) : null}
        </div>
      </header>

      {o ? (
        <p className="map-sheet-obstruction" data-obstruction={o.id}>
          <strong>Obstruction connue</strong> — palette, de {clock(o.interval.start)} à{' '}
          {clock(o.interval.end)} : trajets {formatMultiplier(o.travelMultiplier)}
          {o.blocksSightBetween.length > 0
            ? ` ; bloque la vue entre ${o.blocksSightBetween
                .map(([a, b]) => `${zoneLabelOf(frame, a)} et ${zoneLabelOf(frame, b)}`)
                .join(', ')}`
            : ''}
          .
        </p>
      ) : null}

      <section className="map-sheet-section" aria-labelledby={passagesId}>
        <h4 id={passagesId} className="map-sheet-heading">
          Passages ({passages.length}) à {frame.clock}
        </h4>
        <ul className="map-list" aria-labelledby={passagesId}>
          {passages.map((p) => {
            const other = p.from.id === zone.zone.id ? p.to : p.from;
            const duration =
              p.state === 'closed'
                ? 'fermé à cet instant'
                : p.obstruction
                  ? `${formatSeconds(p.travelSeconds)} (${formatSeconds(p.baseSeconds)} ${formatMultiplier(p.obstruction.travelMultiplier)})`
                  : formatSeconds(p.travelSeconds);
            return (
              <li key={p.passage.id} className="map-sheet-row" data-state={p.state}>
                <div className="map-sheet-row-main">
                  <span className="map-sheet-row-title">→ {other.label}</span>
                  <span className="map-sheet-row-detail mono">
                    {duration} · {SIGHT_LABELS[p.sight]} · perte sonore {formatPercent(p.soundLoss)}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost map-sheet-btn"
                  onClick={() => onSelectZone(other.id)}
                  aria-label={`Ouvrir la zone ${other.label}`}
                >
                  Ouvrir
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="map-sheet-section" aria-labelledby={peopleId}>
        <h4 id={peopleId} className="map-sheet-heading">
          Personnes présentes ({zone.tokens.length}) à {frame.clock}
        </h4>
        {zone.tokens.length === 0 ? (
          <p className="muted map-sheet-note">Personne n’est connu ici à cet instant.</p>
        ) : (
          <ul className="map-list" aria-labelledby={peopleId}>
            {zone.tokens.map((t) => {
              const selected = selection?.kind === 'character' && selection.id === t.characterId;
              return (
                <li
                  key={t.characterId}
                  className="map-sheet-row map-sheet-person"
                  data-status={t.status}
                >
                  <span className="map-sheet-portrait" aria-hidden="true">
                    <Portrait
                      seed={t.portraitSeed}
                      accentColor={t.accentColor}
                      name={t.name}
                      size={28}
                      state={PORTRAIT_STATE[t.trustState]}
                    />
                  </span>
                  <div className="map-sheet-row-main">
                    <span className="map-sheet-row-title">{t.name}</span>
                    <span className="map-sheet-row-detail">
                      <DegreeBadge degree={t.status} /> {POSITION_SOURCE_LABELS[t.source]}
                      {t.transit ? ' · en transit' : ''} · {clock(t.interval.start)}
                      {t.transit ? '' : `–${clock(t.interval.end)}`}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost map-sheet-btn"
                    aria-pressed={selected}
                    onClick={() => onSelectCharacter(t.characterId)}
                    aria-label={`Sélectionner ${t.name}`}
                  >
                    Sélectionner
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="map-sheet-section" aria-labelledby={markersId}>
        <h4 id={markersId} className="map-sheet-heading">
          Pièces et faits localisés ici ({zone.markers.length})
        </h4>
        {zone.markers.length === 0 ? (
          <p className="muted map-sheet-note">Aucune pièce ni fait connu dans cette zone.</p>
        ) : (
          <ul className="map-list" aria-labelledby={markersId}>
            {zone.markers.map((m) => (
              <li
                key={`${m.kind}:${m.id}`}
                className="map-sheet-row"
                data-active={m.activeAtCursor ? 'true' : 'false'}
                data-marker={m.id}
              >
                <div className="map-sheet-row-main">
                  <span className="map-sheet-row-title">
                    <DegreeBadge degree={m.degree} /> {m.label}
                  </span>
                  <span className="map-sheet-row-detail mono">
                    {m.kind === 'evidence' ? 'Pièce' : 'Fait'} · {markerTime(m, clock)}
                    {m.activeAtCursor ? ' · en cours à cet instant' : ''}
                  </span>
                </div>
                <div className="map-sheet-row-actions">
                  {m.goTo !== null ? (
                    <GoToButton at={m.goTo} label={m.label} clock={clock} onGoTo={onGoTo} />
                  ) : (
                    <span className="muted map-sheet-note">sans horodatage</span>
                  )}
                  <button
                    type="button"
                    className="btn btn-ghost map-sheet-btn"
                    onClick={() => onOpenMarker(m.kind, m.id)}
                    aria-label={`Fiche — ${m.label}`}
                  >
                    Fiche
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function GoToButton({
  at,
  label,
  clock,
  onGoTo,
}: {
  at: number;
  label: string;
  clock: (t: number) => string;
  onGoTo: (t: number) => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      className="btn btn-ghost map-sheet-btn"
      onClick={() => onGoTo(at)}
      aria-label={`Aller à l’instant ${clock(at)} — ${label}`}
    >
      Aller à l’instant
    </button>
  );
}

function SightSection({
  frame,
  sight,
  currentZoneId,
}: {
  frame: MapFrame;
  sight: SightFrame;
  currentZoneId: string | null;
}): React.JSX.Element {
  const id = useId();
  return (
    <section className="map-sheet-section map-sheet-perception" aria-labelledby={id}>
      <h4 id={id} className="map-sheet-heading">
        Lignes de vue — {sight.observer.name}
      </h4>
      <p className="muted map-sheet-note">
        Depuis {sight.zoneLabel} à {frame.clock}.
      </p>
      <ul className="map-list map-list-compact" aria-labelledby={id}>
        {sight.lines.map((l) => {
          const via = l.via.slice(1, -1).map((z) => zoneLabelOf(frame, z));
          const text =
            l.quality > 0
              ? `${FIDELITY_LABELS[l.fidelity]} (${formatPercent(l.quality)})${via.length > 0 ? ` via ${via.join(', ')}` : ''}`
              : l.blockedBy
                ? 'aucune vue — bloquée par une obstruction connue'
                : 'aucune vue';
          return (
            <li
              key={l.to}
              className="map-sheet-line"
              data-fidelity={l.fidelity}
              data-current={l.to === currentZoneId ? 'true' : undefined}
            >
              <span className="map-sheet-line-zone">{l.toLabel}</span> : {text}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SoundSection({
  frame,
  sound,
  clock,
}: {
  frame: MapFrame;
  sound: SoundFrame;
  clock: (t: number) => string;
}): React.JSX.Element {
  const id = useId();
  const heard = sound.zones.filter((z) => z.fidelity !== 'none');
  const silent = sound.zones.filter((z) => z.fidelity === 'none');
  return (
    <section className="map-sheet-section map-sheet-perception" aria-labelledby={id}>
      <h4 id={id} className="map-sheet-heading">
        Propagation sonore — {sound.label}
      </h4>
      <p className="muted map-sheet-note">
        Depuis {sound.originLabel}
        {sound.interval ? `, de ${clock(sound.interval.start)} à ${clock(sound.interval.end)}` : ''}
        , calculée à {frame.clock}.
      </p>
      <ul className="map-list map-list-compact" aria-labelledby={id}>
        {heard.map((z) => (
          <li key={z.zoneId} className="map-sheet-line" data-fidelity={z.fidelity}>
            <span className="map-sheet-line-zone">{z.zoneLabel}</span> :{' '}
            {formatPercent(z.intensity)} — {HEAR_LABELS[z.fidelity]}
            {z.directionZoneId ? `, arrive par ${zoneLabelOf(frame, z.directionZoneId)}` : ''}
          </li>
        ))}
      </ul>
      {silent.length > 0 ? (
        <p className="muted map-sheet-note">
          Inaudible : {silent.map((z) => z.zoneLabel).join(', ')}.
        </p>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Composant
// ---------------------------------------------------------------------------

export function ZoneSheet({
  frame,
  zoneId,
  selection,
  selectedCharacter,
  clock,
  onSelectZone,
  onSelectCharacter,
  onOpenMarker,
  onGoTo,
  variant = 'panel',
}: ZoneSheetProps): React.JSX.Element {
  const titleId = useId();
  const zone = zoneId !== null ? (frame.zoneById.get(zoneId) ?? null) : null;
  const embedded = variant === 'embedded';
  const Root = embedded ? 'div' : 'aside';

  return (
    <Root
      className={embedded ? 'map-sheet map-sheet-embedded' : 'map-sheet'}
      {...(embedded ? {} : { 'aria-labelledby': titleId })}
      data-zone={zone?.zone.id ?? ''}
    >
      {zone ? (
        <ZoneDetails
          frame={frame}
          zone={zone}
          titleId={titleId}
          embedded={embedded}
          selection={selection}
          clock={clock}
          onSelectZone={onSelectZone}
          onSelectCharacter={onSelectCharacter}
          onOpenMarker={onOpenMarker}
          onGoTo={onGoTo}
        />
      ) : embedded && selectedCharacter ? (
        <div className="map-sheet-empty">
          <h3 id={titleId} className="visually-hidden">
            {selectedCharacter.name}
          </h3>
          <p className="map-sheet-empty-lead">Position inconnue à {frame.clock}.</p>
          <p className="muted">
            Aucune caméra, pièce, déclaration ni hypothèse ne place {selectedCharacter.name} à cet
            instant. Déplacez le curseur ou sélectionnez une zone du plan.
          </p>
        </div>
      ) : (
        <div className="map-sheet-empty">
          <h3 id={titleId} className={embedded ? 'visually-hidden' : 'map-sheet-title'}>
            Fiche de zone
          </h3>
          <p className="map-sheet-empty-lead">Sélectionnez une zone ou un jeton.</p>
          <p className="muted">
            Cliquez une zone du plan, ou parcourez-les avec <kbd>Tab</kbd> et les flèches puis
            validez avec <kbd>Entrée</kbd>. La fiche décrit les passages, les personnes présentes et
            les pièces localisées à l’instant du curseur.
          </p>
        </div>
      )}

      {frame.sight ? (
        <SightSection frame={frame} sight={frame.sight} currentZoneId={zoneId} />
      ) : selectedCharacter ? (
        <p className="muted map-sheet-note map-sheet-perception">
          Lignes de vue indisponibles : la position de {selectedCharacter.name} est inconnue à{' '}
          {frame.clock}.
        </p>
      ) : null}
      {frame.sounds.map((s) => (
        <SoundSection key={s.id} frame={frame} sound={s} clock={clock} />
      ))}
    </Root>
  );
}
