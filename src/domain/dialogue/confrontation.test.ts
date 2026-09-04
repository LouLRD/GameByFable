import { describe, expect, it } from 'vitest';
import { scenario, run, confront } from '@/test/helpers';
import type { PlayerAction } from '../model/actions';
import { createInitialState } from '../replay/reducer';
import { findConfrontation, probe, resolveConfrontation } from './confrontation';
import { characterId } from '../model/ids';

const C = characterId;

describe('recevabilité des confrontations (échecs informatifs)', () => {
  const s0 = createInitialState(scenario);

  it('personne, cible et appui inconnus ou verrouillés', () => {
    expect(findConfrontation(scenario, s0, C('zed'), 's_ana_initial', undefined)).toMatchObject({ ok: false, error: { code: 'unknown-character' } });
    expect(findConfrontation(scenario, s0, C('ana'), 'nope', undefined)).toMatchObject({ ok: false, error: { code: 'unknown-target' } });
    expect(findConfrontation(scenario, s0, C('malik'), 's_malik_clarified', undefined)).toMatchObject({ ok: false, error: { code: 'target-locked' } });
    expect(findConfrontation(scenario, s0, C('ana'), 's_ana_initial', 'e_drawer_log')).toMatchObject({ ok: false, error: { code: 'support-locked' } });
  });

  it('aucune confrontation sur cette cible : message nommant la personne', () => {
    const r = findConfrontation(scenario, s0, C('ana'), 's_malik_initial', 'e_till_report');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/Ana Sorel n’a rien à ajouter/);
  });

  it('appui manquant ou inadéquat : la position est maintenue, sans révéler la bonne pièce', () => {
    const none = findConfrontation(scenario, s0, C('noe'), 's_noe_initial', undefined);
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.error.message).toMatch(/Sans pièce d’appui/);
    const wrong = findConfrontation(scenario, s0, C('noe'), 's_noe_initial', 'e_till_report');
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) {
      expect(wrong.error.message).toMatch(/n’entame pas la position de Noé/);
      expect(wrong.error.message).not.toMatch(/palette/i);
    }
  });

  it('déjà résolue', () => {
    const s = run([confront('jo', 's_jo_initial', 'e_camera_gap')]);
    const r = findConfrontation(scenario, s, C('jo'), 's_jo_initial', 'e_camera_gap');
    expect(r).toMatchObject({ ok: false, error: { code: 'confrontation-already-resolved' } });
  });

  it('pression insuffisante puis confiance insuffisante', () => {
    const broke = { ...s0, pressure: 0 };
    const r = resolveConfrontation(scenario, broke, C('jo'), 's_jo_initial', 'e_camera_gap', 'neutral');
    expect(r).toMatchObject({ ok: false, error: { code: 'insufficient-pressure' } });
    const withDrawer = run([confront('ana', 's_ana_initial', 'e_till_report', 'direct')]); // confiance 1 → 0
    const t = resolveConfrontation(scenario, withDrawer, C('ana'), 's_ana_initial', 'e_drawer_log', 'neutral');
    expect(t).toMatchObject({ ok: false, error: { code: 'insufficient-trust' } });
    if (!t.ok) expect(t.error.message).toMatch(/prudent/);
  });

  it('deux confrontations sur la même cible se distinguent par la pièce d’appui', () => {
    const s = run([confront('ana', 's_ana_initial', 'e_till_report', 'empathetic')]);
    const r = findConfrontation(scenario, s, C('ana'), 's_ana_initial', 'e_drawer_log');
    expect(r.ok && r.def.id).toBe('c_ana_refund');
  });

  it('la variante gardée s’applique quand l’approche directe ne libère pas de précision', () => {
    const s = run([confront('jo', 's_jo_initial', 'e_camera_gap')]);
    const direct = resolveConfrontation(scenario, s, C('ines'), 's_ines_initial', 'e_pallet_scan', 'direct');
    const soft = resolveConfrontation(scenario, s, C('ines'), 's_ines_initial', 'e_pallet_scan', 'empathetic');
    expect(direct.ok && direct.resolution.text).toMatch(/Inès se ferme/);
    expect(direct.ok && direct.resolution.unlockStatementIds).toEqual([]);
    expect(soft.ok && soft.resolution.unlockStatementIds).toContain('s_ines_clarified');
    expect(soft.ok && soft.resolution.text).not.toBe(direct.ok && direct.resolution.text);
    expect(direct.ok && direct.resolution.learnedPropositionIds).toContain('prop_pallet_present_2056');
  });
});

describe('sondages', () => {
  it('une hypothèse verrouillée n’est pas sondable', () => {
    const r = probe(scenario, createInitialState(scenario), C('ana'), 'h_emergency_refund', 'neutral');
    expect(r).toMatchObject({ ok: false, error: { code: 'hypothesis-locked' } });
  });

  it('la personne visée refuse ; l’approche directe lui coûte de la confiance', () => {
    const s = createInitialState(scenario);
    const neutral = probe(scenario, s, C('malik'), 'h_malik_theft', 'neutral');
    expect(neutral.ok && neutral.result.stance).toBe('refuses');
    expect(neutral.ok && neutral.result.trustDelta).toBe(0);
    const direct = probe(scenario, s, C('malik'), 'h_malik_theft', 'direct');
    expect(direct.ok && direct.result.trustDelta).toBe(-1);
    const after = run([{ type: 'probe', characterId: C('malik'), targetId: 'h_malik_theft', approach: 'direct' }]);
    expect(after.characters.malik?.trust).toBe(-1);
    expect(after.probeHistory).toHaveLength(1);
  });

  it('réaction neutre quand rien de connu ne s’y oppose, refus fondé sur une certitude révélée', () => {
    const s0 = createInitialState(scenario);
    expect(probe(scenario, s0, C('jo'), 'h_counting_error', 'neutral')).toMatchObject({ ok: true, result: { stance: 'neutral' } });
    // Après sa précision, Inès a publiquement affirmé la bouilloire : un redémarrage programmé heurte sa certitude
    const s = run([confront('jo', 's_jo_initial', 'e_camera_gap'), confront('ines', 's_ines_initial', 'e_pallet_scan', 'empathetic')]);
    expect(probe(scenario, s, C('ines'), 'h_scheduled_reboot', 'neutral')).toMatchObject({ ok: true, result: { stance: 'refuses' } });
    // mais elle ne se trahit pas tant que rien n'est révélé
    expect(probe(scenario, s0, C('ines'), 'h_scheduled_reboot', 'neutral')).toMatchObject({ ok: true, result: { stance: 'neutral' } });
  });

  it('une pièce établissant ses propres gestes est reconnue ; une pièce sans lien laisse indifférent', () => {
    const s = run([confront('ana', 's_ana_initial', 'e_till_report', 'empathetic')]);
    expect(probe(scenario, s, C('ana'), 'e_drawer_log', 'neutral')).toMatchObject({ ok: true, result: { stance: 'acknowledges' } });
    expect(probe(scenario, s, C('noe'), 'e_drawer_log', 'neutral')).toMatchObject({ ok: true, result: { stance: 'unknown' } });
    expect(probe(scenario, s, C('noe'), 'e_hidden_receipt', 'neutral')).toMatchObject({ ok: false, error: { code: 'evidence-locked' } });
    expect(probe(scenario, s, C('noe'), 'nothing', 'neutral')).toMatchObject({ ok: false, error: { code: 'unknown-target' } });
  });

  it('un sondage ne consomme pas de pression et ne débloque rien', () => {
    const before = createInitialState(scenario);
    const probeAction: PlayerAction = { type: 'probe', characterId: C('mina'), targetId: 'h_mina_theft', approach: 'neutral' };
    const after = run([probeAction], before);
    expect(after.pressure).toBe(before.pressure);
    expect(after.unlockedEvidenceIds).toEqual(before.unlockedEvidenceIds);
  });
});
