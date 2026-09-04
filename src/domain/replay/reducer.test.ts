import { describe, expect, it } from 'vitest';
import { scenario, run, claim, confront, CANONICAL_CLAIMS, CANONICAL_CONFRONTATIONS, PROCEDURAL_CLAIMS } from '@/test/helpers';
import { applyAction, createInitialState, reduceEnvelope, reduceGame, toEnvelope } from './reducer';
import { semanticHash } from './hash';
import type { PlayerAction } from '../model/actions';

describe('déterminisme et replay', () => {
  const actions: PlayerAction[] = [...CANONICAL_CONFRONTATIONS, ...CANONICAL_CLAIMS, { type: 'request-round-table' }, { type: 'seal-report' }];

  it('deux replays identiques sont profondément égaux', () => {
    const a = reduceGame(scenario, createInitialState(scenario), actions);
    const b = reduceGame(scenario, createInitialState(scenario), actions);
    expect(a.rejected).toEqual([]);
    expect(a.state).toEqual(b.state);
    expect(semanticHash(a.state)).toBe(semanticHash(b.state));
  });

  it("l'état est dérivable de l'enveloppe (graine + actions)", () => {
    const direct = run(actions);
    const envelope = toEnvelope(direct, actions);
    const replayed = reduceEnvelope(scenario, envelope);
    expect('state' in replayed).toBe(true);
    if ('state' in replayed) expect(semanticHash(replayed.state)).toBe(semanticHash(direct));
  });

  it('les identifiants du journal dérivent de la graine et de l’index d’action', () => {
    const a = run([claim('cash_origin', 'h_counting_error')]);
    const b = run([claim('cash_origin', 'h_counting_error')], createInitialState(scenario, 'autre-graine'));
    expect(a.journal[0]?.id).toBeDefined();
    expect(a.journal[0]?.id).not.toBe(b.journal[0]?.id);
    const c = run([claim('cash_origin', 'h_counting_error')]);
    expect(a.journal[0]?.id).toBe(c.journal[0]?.id);
  });

  it('refuse une enveloppe de scénario inconnu ou plus récent sans lever', () => {
    const s = run([]);
    expect(reduceEnvelope(scenario, { ...toEnvelope(s, []), scenarioId: 'autre' })).toHaveProperty('error');
    expect(reduceEnvelope(scenario, { ...toEnvelope(s, []), scenarioVersion: 99 })).toHaveProperty('error');
  });
});

describe('actions refusées', () => {
  it('une action refusée ne modifie pas le hash sémantique de l’état', () => {
    const s = run([claim('cash_origin', 'h_counting_error')]);
    const before = semanticHash(s);
    const bad: PlayerAction[] = [
      claim('cash_origin', 'h_circuit_overload'), // mauvais slot
      claim('cash_origin', 'h_emergency_refund'), // verrouillée
      claim('video_outage', 'h_deliberate_unplug'), // acteur requis
      claim('cash_origin', 'h_malik_theft', { interval: { start: 500, end: 100 } as never }),
      claim('cash_origin', 'h_malik_theft', { interval: { start: 0, end: 99_999 } as never }),
      { type: 'set-evidence-attached', evidenceId: 'e_till_report' as never, attached: false },
      { type: 'set-evidence-attached', evidenceId: 'e_hidden_receipt' as never, attached: false },
      confront('malik', 's_malik_initial', undefined),
      confront('malik', 's_malik_initial', 'e_till_report'),
      confront('ana', 's_ana_initial', 'e_drawer_log'), // appui verrouillé
      { type: 'request-round-table' },
      { type: 'seal-report' },
      { type: 'leave-round-table' },
      { type: 'dismiss-onboarding', onboardingId: 'nope' as never },
    ];
    for (const a of bad) {
      const r = applyAction(scenario, s, a);
      expect(r.ok, JSON.stringify(a)).toBe(false);
      expect(semanticHash(r.state)).toBe(before);
    }
  });

  it('renvoie des codes typés distincts', () => {
    const s = run([]);
    const codes = [
      applyAction(scenario, s, claim('cash_origin', 'h_circuit_overload')),
      applyAction(scenario, s, claim('cash_origin', 'h_emergency_refund')),
      applyAction(scenario, s, claim('video_outage', 'h_deliberate_unplug')),
      applyAction(scenario, s, confront('malik', 's_malik_initial', undefined)),
      applyAction(scenario, s, { type: 'request-round-table' }),
    ].map((r) => (r.ok ? 'ok' : r.error.code));
    expect(codes).toEqual(['hypothesis-slot-mismatch', 'hypothesis-locked', 'actor-required', 'no-matching-confrontation', 'version-incomplete']);
  });

  it('une confrontation invalide n’est jamais consommée (pression intacte)', () => {
    const s = run([]);
    const r = applyAction(scenario, s, confront('noe', 's_noe_initial', undefined));
    expect(r.ok).toBe(false);
    expect(r.state.pressure).toBe(s.pressure);
    expect(r.state.resolvedConfrontationIds).toEqual([]);
  });
});

describe('conclusion verrouillée', () => {
  it('une conclusion scellée ne peut plus être modifiée', () => {
    const sealed = run([
      confront('jo', 's_jo_initial', 'e_camera_gap', 'direct'),
      confront('malik', 's_malik_initial', 'e_camera_gap', 'direct'),
      ...PROCEDURAL_CLAIMS,
      { type: 'request-round-table' },
      { type: 'seal-report' },
    ]);
    expect(sealed.phase).toBe('sealed');
    expect(sealed.endingId).toBe('ending_procedural');
    const h = semanticHash(sealed);
    for (const a of [claim('cash_origin', 'h_malik_theft'), { type: 'clear-claim', slotId: 'cash_origin' } as PlayerAction, confront('malik', 's_malik_initial', 'e_camera_gap'), { type: 'leave-round-table' } as PlayerAction]) {
      const r = applyAction(scenario, sealed, a);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe('sealed');
      expect(semanticHash(r.state)).toBe(h);
    }
  });
});

describe('pression et déblocages', () => {
  it('une confrontation consomme de la pression ; les révélations en rendent', () => {
    const s0 = run([]);
    expect(s0.pressure).toBe(4);
    const s1 = run([confront('jo', 's_jo_initial', 'e_camera_gap')], s0);
    // coût 1, récompense « palette vérifiée » +1
    expect(s1.pressure).toBe(4);
    expect(s1.unlockedEvidenceIds).toContain('e_pallet_scan');
    expect(s1.claimedPressureRewardIds).toContain('pr_pallet_verified');
    const s2 = run([confront('malik', 's_malik_initial', 'e_camera_gap')], s1);
    expect(s2.pressure).toBe(3);
  });

  it('la pression ne dépasse jamais le maximum', () => {
    const s = run([...CANONICAL_CONFRONTATIONS]);
    expect(s.pressure).toBeLessThanOrEqual(scenario.data.maximumPressure);
    expect(s.pressure).toBeGreaterThanOrEqual(0);
  });

  it('résoudre une contradiction épistémique rend de la pression une seule fois', () => {
    const before = run([confront('jo', 's_jo_initial', 'e_camera_gap')]);
    const after = run([confront('noe', 's_noe_initial', 'e_pallet_scan')], before);
    expect(after.resolvedContradictionKinds).toContain('epistemic');
    expect(after.claimedPressureRewardIds).toContain('pr_first_epistemic_resolution');
  });

  it('débloquer une déclaration rétracte la précédente et révèle les perceptions liées', () => {
    const s = run([confront('jo', 's_jo_initial', 'e_camera_gap'), confront('noe', 's_noe_initial', 'e_pallet_scan')]);
    expect(s.unlockedStatementIds).toContain('s_noe_clarified');
    expect(s.retractedStatementIds).toContain('s_noe_initial');
    expect(s.revealedPerceptionIds).toEqual(expect.arrayContaining(['p_noe_bang', 'p_noe_silhouette']));
    // la perception initiale n'est pas effacée : la déclaration initiale reste dans l'historique
    expect(s.unlockedStatementIds).toContain('s_noe_initial');
  });

  it('les hypothèses verrouillées deviennent formulables après la pièce requise', () => {
    const s0 = run([]);
    expect(applyAction(scenario, s0, claim('video_outage', 'h_circuit_overload')).ok).toBe(false);
    const s1 = run([confront('jo', 's_jo_initial', 'e_camera_gap'), confront('ines', 's_ines_initial', 'e_pallet_scan', 'direct')], s0);
    expect(s1.unlockedEvidenceIds).toContain('e_breaker_log');
    expect(applyAction(scenario, s1, claim('video_outage', 'h_circuit_overload')).ok).toBe(true);
  });

  it('applique les valeurs par défaut de l’hypothèse à la claim', () => {
    const s = run([claim('cash_origin', 'h_malik_theft')]);
    const c = s.claims.cash_origin;
    expect(c?.actorId).toBe('malik');
    expect(c?.zoneId).toBe('aisle_one');
    expect(c?.interval).toEqual({ start: 320, end: 370 });
  });
});
