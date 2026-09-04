import { describe, expect, it } from 'vitest';
import { requireBundledScenario } from '@/scenario';
import { zoneId } from '../model/ids';
import { sec } from '../model/time';
import {
  canSee,
  canonicalWorld,
  emptyWorld,
  HEAR_THRESHOLDS,
  hearSignal,
  nextOpenTime,
  passageTravelSeconds,
  shortestTravelTime,
  signatureSimilarity,
  traceRoute,
} from './spatial';

const scenario = requireBundledScenario();
const Z = zoneId;
const known = canonicalWorld(scenario);

describe('graphe temporel et chemins', () => {
  it('calcule le plus court chemin en additionnant les passages', () => {
    // rayon 1 → réserve : rayon 2 (7) + allée froide (8) + réserve (9) = 24 s
    const r = traceRoute(Z('aisle_one'), Z('stockroom'), 366, scenario, emptyWorld);
    expect(r).not.toBeNull();
    expect(r?.seconds).toBe(24);
    expect(r?.via).toEqual(['aisle_one', 'aisle_two', 'cold_aisle', 'stockroom']);
    expect(r?.arrival).toBe(390);
  });

  it('respecte les trajectoires canoniques (aucun déplacement plus court que le chemin ouvert)', () => {
    for (const track of scenario.data.movementTracks) {
      for (let i = 1; i < track.segments.length; i += 1) {
        const a = track.segments[i - 1]!;
        const b = track.segments[i]!;
        const min = shortestTravelTime(a.zoneId, b.zoneId, a.end, scenario, known);
        expect(
          b.start - a.end,
          `${track.characterId} ${a.zoneId}→${b.zoneId}`,
        ).toBeGreaterThanOrEqual(Math.floor(min));
      }
    }
  });

  it("l'obstruction active multiplie la durée du passage concerné", () => {
    const p05 = scenario.index.passages.get('p05' as never)!;
    expect(passageTravelSeconds(p05, 300, scenario, known)).toBe(9);
    expect(passageTravelSeconds(p05, 500, scenario, known)).toBeCloseTo(19.8, 5);
    // inconnue du joueur → non appliquée
    expect(passageTravelSeconds(p05, 500, scenario, emptyWorld)).toBe(9);
    // une obstruction active modifie au moins un chemin
    const before = shortestTravelTime(Z('cold_aisle'), Z('stockroom'), 500, scenario, emptyWorld);
    const after = shortestTravelTime(Z('cold_aisle'), Z('stockroom'), 500, scenario, known);
    expect(after).toBeGreaterThan(before);
  });

  it("l'obstruction cesse à la fin de son intervalle (borne exclusive)", () => {
    // Jo quitte la réserve à 850 : réserve → allée froide (9) → bureau (8) = 17
    const r = traceRoute(Z('stockroom'), Z('office'), 850, scenario, known);
    expect(r?.seconds).toBe(17);
    const during = traceRoute(Z('stockroom'), Z('office'), 700, scenario, known);
    expect(during?.seconds).toBeCloseTo(27.8, 5);
    expect(during?.obstructed).toBe(true);
  });

  it("attend l'ouverture d'un passage fermé par intervalle", () => {
    const p = {
      ...scenario.index.passages.get('p01' as never)!,
      openWhen: { type: 'between' as const, start: sec(100), end: sec(200) },
    };
    expect(nextOpenTime(p, 50, 1560)).toBe(100);
    expect(nextOpenTime(p, 150, 1560)).toBe(150);
    expect(nextOpenTime(p, 250, 1560)).toBeNull();
    expect(nextOpenTime({ ...p, openWhen: { type: 'never' } }, 0, 1560)).toBeNull();
  });

  it('retourne un trajet nul pour une zone identique', () => {
    const r = traceRoute(Z('office'), Z('office'), 10, scenario, known);
    expect(r?.seconds).toBe(0);
    expect(r?.via).toEqual(['office']);
  });
});

describe('visibilité', () => {
  it('vue nette dans la même zone ou par un passage clair', () => {
    expect(canSee(Z('checkout'), Z('checkout'), 100, scenario, known).fidelity).toBe('exact');
    expect(canSee(Z('loading'), Z('stockroom'), 100, scenario, known).fidelity).toBe('exact');
  });

  it('vue partielle à travers un passage partiel ou plusieurs sauts', () => {
    const r = canSee(Z('loading'), Z('cold_aisle'), 100, scenario, known);
    expect(r.fidelity).toBe('partial');
    expect(r.via).toEqual(['loading', 'stockroom', 'cold_aisle']);
  });

  it("la palette occulte la vue vers l'allée froide pendant son intervalle", () => {
    const before = canSee(Z('loading'), Z('cold_aisle'), 100, scenario, known);
    const during = canSee(Z('loading'), Z('cold_aisle'), 540, scenario, known);
    expect(during.quality).toBeLessThan(before.quality);
    expect(during.occludedBy).toContain('pallet_obstruction');
    expect(during.fidelity).not.toBe('exact');
    // inconnue du joueur → aucune occlusion appliquée
    expect(canSee(Z('loading'), Z('cold_aisle'), 540, scenario, emptyWorld).occludedBy).toEqual([]);
  });

  it("bloque explicitement les paires listées par l'obstruction", () => {
    const r = canSee(Z('aisle_one'), Z('stockroom'), 540, scenario, known);
    expect(r.blockedBy).toBe('pallet_obstruction');
    expect(r.quality).toBe(0);
  });

  it('aucune vue à travers un passage sans visibilité', () => {
    expect(canSee(Z('cold_aisle'), Z('office'), 100, scenario, known).fidelity).toBe('none');
    expect(canSee(Z('checkout'), Z('staffroom'), 100, scenario, known).fidelity).toBe('none');
  });
});

describe('sons', () => {
  const trolley = scenario.index.sounds.get('sound_trolley' as never)!;
  const bottle = scenario.index.sounds.get('sound_bottle' as never)!;
  const kettle = scenario.index.sounds.get('sound_kettle' as never)!;

  it("l'intensité diminue avec la perte acoustique cumulée", () => {
    const at = 533;
    const inStock = hearSignal(Z('stockroom'), trolley, at, scenario, known);
    const loading = hearSignal(Z('loading'), trolley, at, scenario, known);
    const cold = hearSignal(Z('cold_aisle'), trolley, at, scenario, known);
    const checkout = hearSignal(Z('checkout'), trolley, at, scenario, known);
    expect(inStock.intensity).toBeGreaterThan(loading.intensity);
    expect(loading.intensity).toBeGreaterThan(checkout.intensity);
    expect(cold.intensity).toBeGreaterThan(checkout.intensity);
    expect(loading.directionZoneId).toBe('stockroom');
    expect(loading.cumulativeLoss).toBeLessThan(1);
  });

  it('donne la direction sans la source et perd les détails quand le son est étouffé', () => {
    const far = hearSignal(Z('entrance'), trolley, 533, scenario, known);
    expect(far.fidelity).not.toBe('exact');
    expect(far.perceivedTags.every((t) => trolley.signatureTags.includes(t))).toBe(true);
    const near = hearSignal(Z('loading'), trolley, 533, scenario, known);
    expect(near.fidelity).toBe('exact');
    expect(near.perceivedTags).toEqual(trolley.signatureTags);
  });

  it("la bouilloire n'est au plus qu'un bourdonnement ambigu depuis le quai", () => {
    const r = hearSignal(Z('loading'), kettle, 500, scenario, known);
    expect(r.intensity).toBeLessThan(HEAR_THRESHOLDS.partial);
    expect(['ambiguous', 'none']).toContain(r.fidelity);
    expect(r.perceivedTags).not.toContain('appliance');
  });

  it('deux sources proches sont confondables si elles partagent des étiquettes', () => {
    expect(signatureSimilarity(trolley.signatureTags, bottle.signatureTags)).toBeGreaterThan(0);
    expect(signatureSimilarity(trolley.signatureTags, kettle.signatureTags)).toBe(0);
  });
});
