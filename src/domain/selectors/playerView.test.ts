import { describe, expect, it } from 'vitest';
import { scenario, run, claim, confront, CANONICAL_CONFRONTATIONS } from '@/test/helpers';
import { selectPlayerView } from './playerView';
import { selectEpilogue } from './epilogue';
import { createInitialState } from '../replay/reducer';

/** Textes qui ne doivent apparaître nulle part dans la vue joueur avant leur révélation. */
function forbiddenTexts(state: ReturnType<typeof run>): string[] {
  const out: string[] = [];
  const established = new Set(state.establishedFactIds);
  const reported = new Set(state.reportedFactIds);
  for (const f of scenario.data.canonicalFacts) {
    if (f.secrecy === 'public' || established.has(f.id) || reported.has(f.id)) continue;
    out.push(f.id);
    const label = scenario.index.factPresentations.get(f.id)?.label;
    if (label) out.push(label);
  }
  const unlockedStatements = new Set(state.unlockedStatementIds);
  for (const s of scenario.data.statements) if (!unlockedStatements.has(s.id)) out.push(s.publicText);
  const unlockedEvidence = new Set(state.unlockedEvidenceIds);
  for (const e of scenario.data.evidence) if (!unlockedEvidence.has(e.id)) out.push(e.playerText, e.label);
  const revealed = new Set(state.revealedPerceptionIds);
  for (const p of scenario.data.perceptions) if (!revealed.has(p.id)) out.push(p.id);
  for (const c of scenario.data.characters) {
    out.push(...c.values);
    out.push(...Object.keys(c.privateCosts).map((k) => `"${k}"`));
  }
  out.push('internalReasons', 'canonicalHypothesisId', 'movementTracks', 'signs-silently');
  return out;
}

describe('vue joueur : sécurité narrative', () => {
  it('au départ, aucune information canonical-only ne traverse le sélecteur', () => {
    const s = createInitialState(scenario);
    const json = JSON.stringify(selectPlayerView(scenario, s));
    for (const t of forbiddenTexts(s)) expect(json, t).not.toContain(t);
    expect(json).not.toMatch(/bouilloire|justificatif rose|derrière la fiche|paper-only|protect-ana/i);
  });

  it('en cours de partie, seules les révélations obtenues apparaissent', () => {
    const s = run([confront('jo', 's_jo_initial', 'e_camera_gap'), confront('malik', 's_malik_initial', 'e_camera_gap', 'empathetic'), claim('cash_origin', 'h_malik_theft')]);
    const view = selectPlayerView(scenario, s);
    const json = JSON.stringify(view);
    for (const t of forbiddenTexts(s)) expect(json, t).not.toContain(t);
    expect(view.statements.some((x) => x.id === 's_malik_clarified')).toBe(true);
    expect(view.facts.some((f) => f.id === 'f_pallet_placed' && f.degree === 'established')).toBe(true);
    expect(view.facts.some((f) => f.id === 'f_sleeve_on_trolley' && f.degree === 'reported')).toBe(true);
    expect(view.facts.some((f) => f.id === 'f_receipt_hidden')).toBe(false);
  });

  it('les hypothèses verrouillées et leurs libellés sont absents', () => {
    const view = selectPlayerView(scenario, createInitialState(scenario));
    const ids = new Set(view.hypotheses.map((h) => h.id));
    expect(ids.has('h_emergency_refund' as never)).toBe(false);
    expect(ids.has('h_mina_hidden_receipt' as never)).toBe(false);
    expect(ids.has('h_malik_theft' as never)).toBe(true);
    expect(JSON.stringify(view)).not.toContain('Justificatif caché');
  });

  it('les raisons internes de signature ne sortent jamais ; la confiance est textuelle', () => {
    const s = run([claim('cash_origin', 'h_malik_theft')]);
    const view = selectPlayerView(scenario, s);
    for (const a of view.version.adhesion) {
      expect(Object.keys(a)).not.toContain('internalReasons');
      expect(['signs', 'refuses', 'requests-change']).toContain(a.verdict);
    }
    for (const c of view.characters) {
      expect(['fermé', 'prudent', 'disponible', 'engagé']).toContain(c.trustState);
      expect(Object.keys(c)).not.toContain('trust');
      expect(Object.keys(c)).not.toContain('privateCosts');
    }
  });

  it('les perceptions d’un personnage ne sont visibles qu’une fois révélées', () => {
    const before = selectPlayerView(scenario, run([confront('jo', 's_jo_initial', 'e_camera_gap')]));
    expect(before.characters.find((c) => c.id === 'noe')?.perceptions).toEqual([]);
    const after = selectPlayerView(scenario, run([confront('jo', 's_jo_initial', 'e_camera_gap'), confront('noe', 's_noe_initial', 'e_pallet_scan')]));
    const noe = after.characters.find((c) => c.id === 'noe');
    expect(noe?.perceptions.map((p) => p.id).sort()).toEqual(['p_noe_bang', 'p_noe_silhouette']);
    expect(noe?.perceptions.find((p) => p.id === 'p_noe_silhouette')?.fidelity).toBe('ambiguous');
  });

  it('l’épilogue n’existe qu’après scellement et respecte la politique de révélation', () => {
    expect(selectEpilogue(scenario, createInitialState(scenario))).toBeNull();
    const sealed = run([...CANONICAL_CONFRONTATIONS, claim('cash_origin', 'h_emergency_refund'), claim('video_outage', 'h_circuit_overload'), claim('receipt_path', 'h_mina_hidden_receipt'), claim('noise_source', 'h_trolley_threshold'), claim('manager_knowledge', 'h_ana_initiated_refund'), { type: 'request-round-table' }, { type: 'seal-report' }]);
    const e = selectEpilogue(scenario, sealed);
    expect(e?.ending.id).toBe('ending_transparent');
    expect(e?.otherEndings.map((x) => x.title)).toContain('Réparer sans exposer');
    expect(e?.otherEndings.every((x) => !('requiresHypotheses' in x))).toBe(true);
    expect(e?.slots.every((x) => x.matches)).toBe(true);
  });

  it('l’onboarding progresse sans bloquer', () => {
    const s0 = createInitialState(scenario);
    expect(selectPlayerView(scenario, s0).onboarding?.id).toBe('o1');
    const s1 = run([{ type: 'dismiss-onboarding', onboardingId: 'o1' as never }], s0);
    expect(selectPlayerView(scenario, s1, { selectedId: 'e_camera_gap' }).onboarding?.id).toBe('o2');
    expect(selectPlayerView(scenario, s1, { selectedId: null }).onboarding?.id).toBe('o3');
    const s2 = run([{ type: 'dismiss-onboarding', onboardingId: 'o2' as never }, { type: 'dismiss-onboarding', onboardingId: 'o3' as never }, claim('cash_origin', 'h_malik_theft')], s1);
    expect(selectPlayerView(scenario, s2).onboarding?.id).toBe('o4');
  });
});
