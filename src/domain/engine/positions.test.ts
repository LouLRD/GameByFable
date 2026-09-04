import { describe, expect, it } from 'vitest';
import { scenario, run, confront, claim } from '@/test/helpers';
import { buildContext, cameraSegments, knownWorld } from './context';
import {
  canOccupy,
  checkPairCompatibility,
  positionAt,
  CAMERA_EDGE_TOLERANCE_SECONDS,
  TRAVEL_TOLERANCE_SECONDS,
  type PositionSegment,
} from './positions';
import { interval } from '../model/time';
import { createInitialState } from '../replay/reducer';
import { emptyWorld, shortestTravelTime } from './spatial';
import { characterId, zoneId } from '../model/ids';

const Z = zoneId;
const C = characterId;

describe('positions établies par la caméra', () => {
  const cam = cameraSegments(scenario);

  it('n’établit que les zones filmées hors coupure', () => {
    const covered = new Set(scenario.data.extension.cameraCoverage.zoneIds);
    for (const s of cam.segments) {
      expect(covered.has(s.zoneId)).toBe(true);
      expect(s.status).toBe('established');
      expect(s.source).toBe('camera');
      // aucun segment ne recouvre la coupure 500–760
      expect(s.interval.start >= 760 || s.interval.end <= 500).toBe(true);
    }
  });

  it('Ana est établie aux caisses jusqu’à son départ, puis absente des zones filmées', () => {
    const ana = cam.segments.filter((s) => s.characterId === 'ana');
    expect(
      ana.some((s) => s.zoneId === 'checkout' && s.interval.start === 0 && s.interval.end === 245),
    ).toBe(true);
    const abs = cam.absences.get(C('ana')) ?? [];
    expect(abs.some((a) => a.start === 245 && a.end === 500)).toBe(true);
  });

  it('Jo et Noé ne sont jamais établis avant leur passage en zone filmée', () => {
    // Jo n'apparaît qu'en transit (1047, 1054) puis aux caisses à partir de 1062
    expect(
      cam.segments.filter((s) => s.characterId === 'jo' && s.interval.start < 1030).length,
    ).toBe(0);
    expect(
      cam.segments
        .filter((s) => s.characterId === 'jo' && !s.transit)
        .every((s) => s.interval.start >= 1062),
    ).toBe(true);
    expect(
      cam.segments.filter((s) => s.characterId === 'noe' && s.interval.start < 970).length,
    ).toBe(0);
  });

  it('un transit par une zone filmée est vu ponctuellement', () => {
    // Mina : rayon 1 → rayon 2 (transit) → allée froide → réserve à partir de 366
    const transit = cam.segments.find(
      (s) => s.characterId === 'mina' && s.transit && s.zoneId === 'aisle_two',
    );
    expect(transit).toBeDefined();
    expect(transit?.interval.start).toBe(373);
  });
});

describe('canOccupy', () => {
  const state = createInitialState(scenario);
  const ctx = buildContext(scenario, state);

  it('établi quand la caméra couvre la présence', () => {
    expect(
      canOccupy(C('ana'), Z('checkout'), interval(100, 200), ctx.positions, scenario, ctx.world)
        .status,
    ).toBe('established');
  });

  it('impossible quand une position établie dans une autre zone chevauche', () => {
    const r = canOccupy(
      C('malik'),
      Z('office'),
      interval(490, 520),
      ctx.positions,
      scenario,
      ctx.world,
    );
    expect(r.status).toBe('impossible');
    expect(r.conflicts.map((c) => c.kind)).toContain('overlap');
  });

  it('impossible quand le trajet depuis la dernière position établie est trop long', () => {
    // Malik au rayon 2 jusqu'à 500 ; rayon 2 → bureau = 16 s
    const r = canOccupy(
      C('malik'),
      Z('office'),
      interval(503, 513),
      ctx.positions,
      scenario,
      ctx.world,
    );
    expect(r.status).toBe('impossible');
    expect(r.conflicts.map((c) => c.kind)).toContain('arrival-too-late');
    const ok = canOccupy(
      C('malik'),
      Z('office'),
      interval(520, 540),
      ctx.positions,
      scenario,
      ctx.world,
    );
    expect(ok.status).toBe('possible');
  });

  it('impossible quand la caméra ne montre pas la personne dans une zone filmée', () => {
    const r = canOccupy(
      C('ana'),
      Z('checkout'),
      interval(300, 400),
      ctx.positions,
      scenario,
      ctx.world,
    );
    expect(r.status).toBe('impossible');
    expect(r.conflicts.map((c) => c.kind)).toContain('absence');
  });

  it('tolère un dépassement inférieur à la marge de bord de zone', () => {
    const r = canOccupy(
      C('ana'),
      Z('checkout'),
      interval(200, 245 + CAMERA_EDGE_TOLERANCE_SECONDS - 1),
      ctx.positions,
      scenario,
      ctx.world,
    );
    expect(r.status).not.toBe('impossible');
  });

  it('possible (inconnu) hors champ et hors déclaration', () => {
    expect(
      canOccupy(C('jo'), Z('office'), interval(860, 890), ctx.positions, scenario, ctx.world)
        .status,
    ).toBe('possible');
  });

  it('contredit par une déclaration debout (rapporté ailleurs)', () => {
    // Inès déclare être restée dans l'allée froide tout le temps
    const r = canOccupy(
      C('ines'),
      Z('staffroom'),
      interval(480, 550),
      ctx.positions,
      scenario,
      ctx.world,
    );
    expect(r.status).toBe('reported-elsewhere');
    expect(r.conflicts[0]?.segment?.sourceIds).toContain('s_ines_initial');
  });

  it('un trajet proposé ne peut être plus court que le plus court chemin ouvert', () => {
    const a: PositionSegment = {
      characterId: C('jo'),
      zoneId: Z('stockroom'),
      interval: interval(800, 850),
      status: 'proposed',
      source: 'claim',
      sourceIds: ['h1'],
      transit: false,
      continuous: false,
    };
    const b: PositionSegment = {
      ...a,
      zoneId: Z('office'),
      interval: interval(855, 865),
      sourceIds: ['h2'],
    };
    const world = knownWorld(scenario, ['e_pallet_scan' as never]);
    const c = checkPairCompatibility(a, b, scenario, world);
    expect(c?.kind).toBe('arrival-too-late');
    const min = shortestTravelTime(Z('stockroom'), Z('office'), 850, scenario, world);
    const okB: PositionSegment = {
      ...b,
      interval: interval(850 + Math.ceil(min) + TRAVEL_TOLERANCE_SECONDS, 900),
    };
    expect(checkPairCompatibility(a, okB, scenario, world)).toBeNull();
  });

  it('une obstruction révélée change l’issue d’un trajet', () => {
    // réserve → bureau à 700 : 17 s sans palette connue, 27,8 s avec
    const a: PositionSegment = {
      characterId: C('jo'),
      zoneId: Z('stockroom'),
      interval: interval(600, 700),
      status: 'proposed',
      source: 'claim',
      sourceIds: ['h1'],
      transit: false,
      continuous: false,
    };
    const b: PositionSegment = {
      ...a,
      zoneId: Z('office'),
      interval: interval(720, 730),
      sourceIds: ['h2'],
    };
    expect(checkPairCompatibility(a, b, scenario, emptyWorld)).toBeNull();
    expect(
      checkPairCompatibility(a, b, scenario, knownWorld(scenario, ['e_pallet_scan' as never]))
        ?.kind,
    ).toBe('arrival-too-late');
  });
});

describe('monde proposé', () => {
  it('une claim ajoute une présence proposée sans muter le canon', () => {
    const before = JSON.stringify(scenario.data);
    const s = run([claim('cash_origin', 'h_malik_theft', { interval: interval(326, 350) })]);
    const ctx = buildContext(scenario, s);
    const pos = positionAt(ctx.positions, C('malik'), 330);
    expect(pos?.status).toBe('established'); // la caméra prime à l'affichage
    expect(
      ctx.positions.segments.some(
        (x) => x.status === 'proposed' && x.sourceIds.includes('h_malik_theft'),
      ),
    ).toBe(true);
    expect(JSON.stringify(scenario.data)).toBe(before);
  });

  it('une déclaration débloquée ajoute une présence rapportée ; sa rétractation la retire', () => {
    const s0 = run([]);
    const c0 = buildContext(scenario, s0);
    expect(
      c0.positions.segments.some(
        (x) => x.status === 'reported' && x.sourceIds.includes('s_ines_initial'),
      ),
    ).toBe(true);
    const s1 = run(
      [
        confront('jo', 's_jo_initial', 'e_camera_gap'),
        confront('ines', 's_ines_initial', 'e_pallet_scan', 'empathetic'),
      ],
      s0,
    );
    const c1 = buildContext(scenario, s1);
    expect(c1.positions.segments.some((x) => x.sourceIds.includes('s_ines_initial'))).toBe(false);
    expect(
      c1.positions.segments.some(
        (x) => x.status === 'reported' && x.sourceIds.includes('s_ines_clarified'),
      ),
    ).toBe(true);
  });
});
