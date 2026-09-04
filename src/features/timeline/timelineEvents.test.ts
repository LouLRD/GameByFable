import { describe, expect, it } from 'vitest';
import { useGameStore } from '@/state';
import {
  buildTimelineEvents,
  complementSpans,
  describeEvent,
  nextEvent,
  outageSpans,
  packRows,
  previousEvent,
  shortName,
  timeFromPointer,
  unknownSpans,
  visualSpan,
} from './timelineEvents';
import { selectPlayerView } from '@/domain/selectors/playerView';

function freshView() {
  const store = useGameStore.getState();
  store.bootstrap();
  store.newGame();
  const { scenario, game } = useGameStore.getState();
  if (!scenario || !game) throw new Error('partie non chargée');
  return selectPlayerView(scenario, game);
}

const zoneLabels = new Map<string, string>([
  ['checkout', 'Caisses'],
  ['office', 'Bureau'],
  ['entrance', 'Entrée'],
  ['cold_aisle', 'Allée froide'],
]);

describe('complementSpans', () => {
  it('retourne la fenêtre entière quand rien n’est couvert', () => {
    expect(complementSpans([], 100)).toEqual([{ start: 0, end: 100 }]);
  });

  it('calcule les trous entre intervalles non triés et fusionne les chevauchements', () => {
    expect(
      complementSpans(
        [
          { start: 50, end: 70 },
          { start: 10, end: 30 },
          { start: 20, end: 40 },
        ],
        100,
      ),
    ).toEqual([
      { start: 0, end: 10 },
      { start: 40, end: 50 },
      { start: 70, end: 100 },
    ]);
  });

  it('ne retourne rien quand tout est couvert', () => {
    expect(complementSpans([{ start: 0, end: 100 }], 100)).toEqual([]);
  });
});

describe('packRows', () => {
  it('place les intervalles qui se chevauchent sur des rangées différentes', () => {
    expect(
      packRows([
        { start: 0, end: 10 },
        { start: 5, end: 15 },
        { start: 10, end: 20 },
        { start: 15, end: 25 },
      ]),
    ).toEqual([0, 1, 0, 1]);
  });

  it('donne un intervalle nominal aux instants ponctuels', () => {
    expect(visualSpan(100, null, 40)).toEqual({ start: 80, end: 120 });
    expect(visualSpan(100, 105, 40)).toEqual({ start: 100, end: 140 });
    expect(visualSpan(100, 300, 40)).toEqual({ start: 100, end: 300 });
  });
});

describe('timeFromPointer', () => {
  it('convertit une position en instant borné à la fenêtre', () => {
    const rect = { left: 100, width: 1000 };
    expect(timeFromPointer(100, rect, 1560)).toBe(0);
    expect(timeFromPointer(600, rect, 1560)).toBe(780);
    expect(timeFromPointer(5000, rect, 1560)).toBe(1560);
    expect(timeFromPointer(-50, rect, 1560)).toBe(0);
  });

  it('retourne null sans largeur mesurable', () => {
    expect(timeFromPointer(10, { left: 0, width: 0 }, 1560)).toBeNull();
  });
});

describe('buildTimelineEvents (vue joueur en début de partie)', () => {
  it('liste les pièces datées, les faits, les contradictions inspectables, la coupure et le comptage, triés', () => {
    const view = freshView();
    const events = buildTimelineEvents(view, zoneLabels);
    const ats = events.map((e) => e.at);
    expect([...ats].sort((a, b) => a - b)).toEqual(ats);
    expect(events.find((e) => e.kind === 'evidence' && e.id === 'e_camera_gap')).toMatchObject({
      at: 500,
      end: 760,
      zoneIds: ['office'],
    });
    expect(events.find((e) => e.kind === 'evidence' && e.id === 'e_door_exit')).toMatchObject({
      at: 180,
      end: null,
    });
    expect(events.some((e) => e.kind === 'fact' && e.degree === 'established')).toBe(true);
    expect(
      events.some((e) => e.kind === 'contradiction' && e.severity === 'major' && e.at === 250),
    ).toBe(true);
    expect(events.find((e) => e.kind === 'outage')).toMatchObject({ at: 500, end: 760 });
    expect(events.find((e) => e.kind === 'incident')).toMatchObject({ at: view.incidentAt });
    // Aucune hypothèse datée ni obstruction connue en début de partie.
    expect(events.some((e) => e.kind === 'claim')).toBe(false);
    expect(events.some((e) => e.kind === 'obstruction')).toBe(false);
  });

  it('décrit les événements en français avec l’heure simulée', () => {
    const view = freshView();
    const events = buildTimelineEvents(view, zoneLabels);
    const gap = events.find((e) => e.id === 'e_camera_gap');
    const door = events.find((e) => e.id === 'e_door_exit');
    expect(gap && describeEvent(gap, view.clock)).toBe(
      'Pièce : Journal vidéo, 20:57:20 → 21:01:40',
    );
    expect(door && describeEvent(door, view.clock)).toBe('Pièce : Capteur de porte, 20:52:00');
    const major = events.find((e) => e.kind === 'contradiction' && e.severity === 'major');
    expect(major && describeEvent(major, view.clock)).toMatch(
      /^Contradiction majeure : .+, 20:53:10$/,
    );
  });

  it('navigue au marqueur suivant / précédent strictement', () => {
    const view = freshView();
    const events = buildTimelineEvents(view, zoneLabels);
    expect(nextEvent(events, 0)?.at).toBe(180);
    expect(nextEvent(events, 180)?.at).toBeGreaterThan(180);
    expect(previousEvent(events, 250)?.at).toBe(238);
    expect(previousEvent(events, 180)).toBeNull();
    expect(previousEvent(events, 0)).toBeNull();
    expect(nextEvent(events, view.durationSeconds)).toBeNull();
  });

  it('calcule la coupure vidéo et les positions inconnues à partir du modèle de positions', () => {
    const view = freshView();
    expect(outageSpans(view)).toEqual([{ start: 500, end: 760 }]);
    const ana = view.positions.byCharacter.get('ana' as never) ?? [];
    const unknown = unknownSpans(ana, view.durationSeconds);
    expect(unknown).toEqual([{ start: 245, end: 760 }]);
  });
});

describe('shortName', () => {
  it('garde le premier mot du nom, sans espaces superflus', () => {
    expect(shortName('Ana Sorel')).toBe('Ana');
    expect(shortName('  Malik   Bensaïd ')).toBe('Malik');
    expect(shortName('Jo')).toBe('Jo');
  });
});
