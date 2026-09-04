import { describe, expect, it } from 'vitest';

import { knownWorld } from '@/domain/engine/context';
import type { PlayerAction } from '@/domain/model/actions';
import { selectPlayerView } from '@/domain/selectors/playerView';
import type { Selection } from '@/state/types';
import { claim, confront, run, scenario } from '@/test/helpers';
import {
  buildMapFrame,
  formatMultiplier,
  formatPercent,
  lightLevel,
  nearestZone,
  personCount,
  tokenPoints,
  type MapFrame,
} from './mapModel';

function frameAt(
  cursor: number,
  actions: readonly PlayerAction[] = [],
  selection: Selection | null = null,
): MapFrame {
  const state = run(actions);
  const view = selectPlayerView(scenario, state);
  const world = knownWorld(scenario, state.unlockedEvidenceIds);
  return buildMapFrame({ scenario, view, world, cursor, selection });
}

describe('mapModel — formats', () => {
  it('formate les multiplicateurs à la française et les pourcentages arrondis', () => {
    expect(formatMultiplier(2.2)).toBe('×2,2');
    expect(formatMultiplier(2)).toBe('×2');
    expect(formatPercent(0.376)).toBe('38 %');
    expect(personCount(0)).toBe('aucune personne présente');
    expect(personCount(1)).toBe('1 personne présente');
    expect(personCount(3)).toBe('3 personnes présentes');
  });

  it('classe la lumière en trois niveaux', () => {
    expect(lightLevel(0.9)).toBe('bright');
    expect(lightLevel(0.65)).toBe('dim');
    expect(lightLevel(0.45)).toBe('dark');
  });

  it('dispose les jetons de façon déterministe et sans chevauchement', () => {
    const centroid = { x: 31, y: 78 };
    const bounds = { minX: 20, minY: 60, maxX: 42, maxY: 96 };
    expect(tokenPoints(centroid, bounds, 1)).toEqual([{ x: 31, y: 79.5 }]);
    const three = tokenPoints(centroid, bounds, 3);
    expect(three).toEqual(tokenPoints(centroid, bounds, 3));
    const keys = new Set(three.map((p) => `${p.x},${p.y}`));
    expect(keys.size).toBe(3);
    for (const p of three) {
      expect(p.x).toBeGreaterThan(bounds.minX);
      expect(p.x).toBeLessThan(bounds.maxX);
      expect(p.y).toBeGreaterThan(bounds.minY);
      expect(p.y).toBeLessThan(bounds.maxY);
    }
  });
});

describe('mapModel — buildMapFrame', () => {
  it('à t=100 : Ana et Malik aux Caisses (caméra), Inès rapportée, Jo et Noé hors champ', () => {
    const frame = frameAt(100);
    expect(frame.clock).toBe('20:50:40');
    expect(frame.cameraOn).toBe(true);
    const checkout = frame.zoneById.get('checkout');
    expect(checkout?.tokens.map((t) => [t.characterId, t.status, t.source])).toEqual([
      ['ana', 'established', 'camera'],
      ['malik', 'established', 'camera'],
    ]);
    expect(checkout?.label).toBe('Zone Caisses, 2 personnes présentes, filmée, éclairée');
    expect(frame.zoneById.get('cold_aisle')?.tokens[0]?.label).toBe(
      'Inès Vidal — Allée froide (rapporté par une déclaration)',
    );
    expect(frame.offScreen.map((c) => c.id)).toEqual(['jo', 'noe']);
  });

  it('pendant la coupure (t=600), les zones filmées sont hors champ et personne n’y est placé', () => {
    const frame = frameAt(600);
    expect(frame.cameraOn).toBe(false);
    for (const id of ['entrance', 'checkout', 'aisle_one', 'aisle_two']) {
      expect(frame.zoneById.get(id)?.offCamera).toBe(true);
      expect(frame.zoneById.get(id)?.tokens).toEqual([]);
    }
    expect(frame.zoneById.get('stockroom')?.offCamera).toBe(false);
  });

  it('l’obstruction n’apparaît qu’une fois connue, et seulement dans son intervalle', () => {
    const before = frameAt(500);
    expect(before.zones.every((z) => z.obstruction === null)).toBe(true);
    expect(before.passages.find((p) => p.passage.id === 'p05')?.label).toBe('9 s');

    const known = frameAt(500, [confront('jo', 's_jo_initial', 'e_camera_gap')]);
    const cold = known.zoneById.get('cold_aisle');
    expect(cold?.obstruction?.id).toBe('pallet_obstruction');
    const p05 = known.passages.find((p) => p.passage.id === 'p05');
    expect(p05?.state).toBe('obstructed');
    expect(p05?.travelSeconds).toBeCloseTo(19.8);
    expect(p05?.label).toBe('20 s ×2,2');

    const later = frameAt(900, [confront('jo', 's_jo_initial', 'e_camera_gap')]);
    expect(later.zoneById.get('cold_aisle')?.obstruction).toBeNull();
  });

  it('les marqueurs sont actifs autour de leur instant ou dans leur intervalle', () => {
    const at180 = frameAt(180);
    expect(at180.zoneById.get('entrance')?.activeMarkers.map((m) => m.id)).toEqual(['e_door_exit']);
    expect(frameAt(100).zoneById.get('entrance')?.activeMarkers).toEqual([]);
    const at600 = frameAt(600);
    expect(
      at600.zoneById
        .get('office')
        ?.activeMarkers.map((m) => m.id)
        .sort(),
    ).toEqual(['e_camera_gap', 'f_camera_trip']);
    expect(at600.zoneById.get('entrance')?.markers.map((m) => m.goTo)).toEqual([180]);
  });

  it('les lignes de vue d’Ana depuis les Caisses distinguent vue nette, partielle et absente', () => {
    const frame = frameAt(100, [], { kind: 'character', id: 'ana' });
    expect(frame.sight?.zoneId).toBe('checkout');
    const lines = frame.sight?.lines ?? [];
    const byZone = new Map<string, (typeof lines)[number]>();
    for (const l of lines) byZone.set(l.to, l);
    expect(byZone.get('entrance')?.quality).toBe(1);
    expect(byZone.get('aisle_one')?.fidelity).toBe('exact');
    expect(byZone.get('staffroom')?.quality).toBe(0);
    expect(frame.sight?.lines[0]?.quality).toBeGreaterThanOrEqual(
      frame.sight?.lines.at(-1)?.quality ?? 0,
    );
  });

  it('une hypothèse « son » placée produit une propagation depuis sa zone, dans son intervalle seulement', () => {
    const inWindow = frameAt(340, [claim('noise_source', 'h_bottle_noise')]);
    expect(inWindow.sounds).toHaveLength(1);
    const sound = inWindow.sounds[0];
    expect(sound?.originZoneId).toBe('aisle_two');
    expect(sound?.label).toBe('Hypothèse : Bouteille cassée');
    expect(sound?.zones[0]?.zoneId).toBe('aisle_two');
    // Triées par intensité décroissante ; le son s'atténue en s'éloignant de l'origine.
    const intensities = sound?.zones.map((z) => z.intensity) ?? [];
    expect(intensities).toEqual([...intensities].sort((a, b) => b - a));
    expect(intensities.at(-1) ?? 1).toBeLessThan(intensities[0] ?? 0);

    expect(frameAt(800, [claim('noise_source', 'h_bottle_noise')]).sounds).toEqual([]);
    expect(
      frameAt(800, [claim('noise_source', 'h_bottle_noise')], {
        kind: 'hypothesis',
        id: 'h_bottle_noise',
      }).sounds,
    ).toHaveLength(1);
  });

  it('navigation par flèches : zone la plus proche dans la direction demandée', () => {
    const frame = frameAt(0);
    const checkout = frame.zoneById.get('checkout');
    const aisleOne = frame.zoneById.get('aisle_one');
    expect(checkout && nearestZone(frame.zones, checkout, 'up')?.zone.id).toBe('aisle_one');
    expect(aisleOne && nearestZone(frame.zones, aisleOne, 'right')?.zone.id).toBe('aisle_two');
    expect(checkout && nearestZone(frame.zones, checkout, 'left')?.zone.id).toBe('entrance');
    const entrance = frame.zoneById.get('entrance');
    expect(entrance && nearestZone(frame.zones, entrance, 'left')).toBeNull();
  });
});
