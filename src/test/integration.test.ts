import { describe, expect, it } from 'vitest';
import { scenario, run, claim, confront, CANONICAL_CONFRONTATIONS } from './helpers';
import { evaluateVersion } from '@/domain/engine/evaluate';
import { renderExplanation } from '@/domain/contradictions/render';
import { applyAction, createInitialState, reduceEnvelope, toEnvelope } from '@/domain/replay/reducer';
import { semanticHash } from '@/domain/replay/hash';
import { createSaveFile, parseImport, serializeSave, toReplayEnvelope, MemoryStorage, SaveRepository } from '@/persistence';
import { selectPlayerView } from '@/domain/selectors/playerView';
import { interval } from '@/domain/model/time';
import type { PlayerAction } from '@/domain/model/actions';

describe('chaînes complètes', () => {
  it('claim → simulation → contradiction → explication', () => {
    const s = run([claim('video_outage', 'h_deliberate_unplug', { actorId: 'malik' as never, interval: interval(503, 513) })]);
    const view = selectPlayerView(scenario, s);
    const c = view.contradictions.find((x) => x.involvesVersion && x.kind === 'physical');
    expect(c).toBeDefined();
    expect(c?.steps.map((st) => st.text).join(' ')).toMatch(/Trajet Rayon 2 → Bureau en partant à 20 h 57 min 20 s : 16 s/);
    expect(view.version.slots.find((x) => x.slotId === 'video_outage')?.status).toBe('impossible');
    expect(view.version.coherenceStatus).toBe('impossible');
  });

  it('confrontation → révélation → nouvelle option', () => {
    const s0 = run([]);
    expect(selectPlayerView(scenario, s0).hypotheses.some((h) => h.id === 'h_circuit_overload')).toBe(false);
    const s1 = run([confront('jo', 's_jo_initial', 'e_camera_gap'), confront('ines', 's_ines_initial', 'e_pallet_scan', 'empathetic')], s0);
    const view = selectPlayerView(scenario, s1);
    expect(view.evidence.map((e) => e.id)).toEqual(expect.arrayContaining(['e_pallet_scan', 'e_breaker_log', 'e_warm_kettle']));
    expect(view.hypotheses.some((h) => h.id === 'h_circuit_overload')).toBe(true);
    expect(view.journal.some((j) => j.handwritten)).toBe(true);
    expect(view.characters.find((c) => c.id === 'ines')?.trustState).toBe('engagé');
  });

  it('conclusion refusée puis corrigée', () => {
    const base = run([...CANONICAL_CONFRONTATIONS]);
    const wrong = run([
      claim('cash_origin', 'h_malik_theft', { interval: interval(326, 350) }),
      claim('video_outage', 'h_circuit_overload'),
      claim('receipt_path', 'h_mina_hidden_receipt'),
      claim('noise_source', 'h_trolley_threshold'),
      claim('manager_knowledge', 'h_ana_initiated_refund'),
      { type: 'request-round-table' },
    ], base);
    const e1 = evaluateVersion(scenario, wrong).evaluation;
    expect(e1.adhesion.find((d) => d.characterId === 'malik')?.verdict).toBe('requests-change');
    expect(e1.coherence.blocking.length).toBeGreaterThan(0);
    expect(e1.reachableEndingIds).not.toContain('ending_transparent');
    const fixed = run([{ type: 'leave-round-table' }, claim('cash_origin', 'h_emergency_refund'), { type: 'request-round-table' }], wrong);
    const e2 = evaluateVersion(scenario, fixed).evaluation;
    expect(e2.coherence.blocking).toEqual([]);
    expect(e2.reachableEndingIds[0]).toBe('ending_transparent');
    const sealed = run([{ type: 'seal-report' }], fixed);
    expect(sealed.endingId).toBe('ending_transparent');
  });

  it('export/import : état sémantiquement équivalent, ordre des actions préservé', () => {
    const actions: PlayerAction[] = [...CANONICAL_CONFRONTATIONS.slice(0, 3), claim('video_outage', 'h_circuit_overload'), claim('noise_source', 'h_bottle_noise')];
    const s = run(actions);
    const save = createSaveFile({
      scenarioId: scenario.data.scenario.id,
      scenarioVersion: scenario.data.scenario.version,
      seed: s.seed,
      actions,
      ui: { cursor: 533, selectedId: 'e_camera_gap', activeSpace: 'timeline' },
      label: 'test',
      savedAt: '2026-09-04T21:12:00.000Z',
      appVersion: '1.0.0',
    });
    const text = serializeSave(save);
    const parsed = parseImport(text, { scenarioId: scenario.data.scenario.id, scenarioVersion: scenario.data.scenario.version });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.save.actions).toEqual(actions);
    const replayed = reduceEnvelope(scenario, toReplayEnvelope(parsed.save));
    expect('state' in replayed).toBe(true);
    if ('state' in replayed) {
      expect(semanticHash(replayed.state)).toBe(semanticHash(s));
      expect(replayed.rejected).toEqual([]);
    }
    // ré-export identique
    expect(serializeSave(parsed.save)).toBe(text);
  });

  it('importer une sauvegarde invalide laisse la sauvegarde courante intacte', () => {
    const repo = new SaveRepository(new MemoryStorage(), { scenarioId: scenario.data.scenario.id, scenarioVersion: scenario.data.scenario.version });
    const s = run([claim('cash_origin', 'h_counting_error')]);
    const save = createSaveFile({ scenarioId: s.scenarioId, scenarioVersion: s.scenarioVersion, seed: s.seed, actions: [claim('cash_origin', 'h_counting_error')], ui: { cursor: 0, selectedId: null, activeSpace: null }, label: 'ok', savedAt: '2026-09-04T21:12:00.000Z', appVersion: '1.0.0' });
    repo.write('slot-1', save);
    const bad = parseImport('{"kind":"la-version-acceptable-save","formatVersion":9}', { scenarioId: s.scenarioId, scenarioVersion: s.scenarioVersion });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toBe('newer-format');
    const other = parseImport(JSON.stringify({ ...save, scenarioId: 'autre-scenario' }), { scenarioId: s.scenarioId, scenarioVersion: s.scenarioVersion });
    expect(other.ok).toBe(false);
    const still = repo.read('slot-1');
    expect(still.ok).toBe(true);
    if (still.ok) expect(still.save.actions).toEqual(save.actions);
  });

  it('les actions rejetées au replay sont signalées sans casser la partie', () => {
    const envelope = toEnvelope(createInitialState(scenario), [claim('cash_origin', 'h_emergency_refund'), claim('cash_origin', 'h_counting_error')]);
    const r = reduceEnvelope(scenario, envelope);
    expect('state' in r).toBe(true);
    if ('state' in r) {
      expect(r.rejected).toHaveLength(1);
      expect(r.rejected[0]?.error.code).toBe('hypothesis-locked');
      expect(r.state.claims.cash_origin?.hypothesisId).toBe('h_counting_error');
    }
  });

  it('modifier le temps d’une claim de trente secondes change réellement les calculs', () => {
    const a = run([claim('video_outage', 'h_deliberate_unplug', { actorId: 'malik' as never, interval: interval(490, 520) })]);
    const b = run([claim('video_outage', 'h_deliberate_unplug', { actorId: 'malik' as never, interval: interval(520, 550) })]);
    const ea = evaluateVersion(scenario, a).evaluation;
    const eb = evaluateVersion(scenario, b).evaluation;
    expect(ea.coherence.status).toBe('impossible');
    expect(eb.coherence.status).toBe('incomplete');
    expect(renderExplanation(ea.coherence.blocking[0]?.explanation ?? [], scenario).length).toBeGreaterThan(0);
    const r = applyAction(scenario, a, claim('video_outage', 'h_deliberate_unplug', { actorId: 'malik' as never, interval: interval(520, 550) }));
    expect(r.ok && r.state.resolvedContradictionKinds).toContain('temporal');
  });
});
