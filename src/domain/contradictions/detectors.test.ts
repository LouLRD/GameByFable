import { describe, expect, it } from 'vitest';
import {
  scenario,
  run,
  claim,
  confront,
  CANONICAL_CONFRONTATIONS,
  CANONICAL_CLAIMS,
} from '@/test/helpers';
import { evaluateVersion, computeEvaluation } from '../engine/evaluate';
import { renderExplanation } from './render';
import { dedupeContradictions, makeContradiction, propositionsConflict } from './common';
import { interval } from '../model/time';
import type { Contradiction } from '../model/contradiction';

const ev = (actions: Parameters<typeof run>[0]) =>
  evaluateVersion(scenario, run(actions)).evaluation;
const kinds = (list: readonly Contradiction[]) => [...new Set(list.map((c) => c.kind))].sort();

describe('les sept familles de contradiction', () => {
  it('temporelle : une claim chevauche une position établie ailleurs (critique, explication en étapes)', () => {
    const e = ev([claim('video_outage', 'h_deliberate_unplug', { actorId: 'malik' as never })]);
    const c = e.coherence.blocking.find((x) => x.kind === 'temporal');
    expect(c).toBeDefined();
    expect(c?.severity).toBe('critical');
    expect(c?.involvedIds).toContain('h_deliberate_unplug');
    expect(c?.slotIds).toEqual(['video_outage']);
    const steps = renderExplanation(c?.explanation ?? [], scenario);
    expect(steps.length).toBeGreaterThanOrEqual(3);
    expect(steps.some((s) => s.text.includes('Rayon 2'))).toBe(true);
    expect(steps.some((s) => s.text.includes('caméra'))).toBe(true);
    expect(c?.inspectableAt).toBeDefined();
    expect(c?.suggestedEvidenceIds).toContain('e_camera_gap');
    expect(e.coherence.status).toBe('impossible');
  });

  it('physique : trajet trop long depuis la dernière position établie ; corriger l’heure la fait disparaître', () => {
    const bad = ev([
      claim('video_outage', 'h_deliberate_unplug', {
        actorId: 'malik' as never,
        interval: interval(503, 513),
      }),
    ]);
    const c = bad.coherence.blocking.find((x) => x.kind === 'physical');
    expect(c).toBeDefined();
    const steps = renderExplanation(c?.explanation ?? [], scenario)
      .map((s) => s.text)
      .join(' ');
    expect(steps).toMatch(/Trajet Rayon 2 → Bureau/);
    expect(steps).toMatch(/ne peut atteindre/);
    const good = ev([
      claim('video_outage', 'h_deliberate_unplug', {
        actorId: 'malik' as never,
        interval: interval(520, 540),
      }),
    ]);
    expect(good.coherence.blocking.filter((x) => x.kind === 'physical')).toEqual([]);
    expect(good.slots.find((s) => s.slotId === 'video_outage')?.status).toBe('unknown');
    // changer d'acteur transforme la contradiction (Ana n'est pas filmée à ce moment : possible)
    const ana = ev([
      claim('video_outage', 'h_deliberate_unplug', {
        actorId: 'ana' as never,
        interval: interval(503, 513),
      }),
    ]);
    expect(
      ana.coherence.blocking.filter((x) => x.kind === 'physical' || x.kind === 'temporal'),
    ).toEqual([]);
  });

  it('sensorielle : vue partielle puis identification impossible après la révélation de la palette', () => {
    const start = ev([]);
    const before = start.contradictions.find(
      (c) => c.kind === 'sensory' && c.involvedIds.includes('s_noe_initial'),
    );
    expect(before?.severity).toBe('notice');
    const after = ev([confront('jo', 's_jo_initial', 'e_camera_gap')]).contradictions.find(
      (c) => c.kind === 'sensory' && c.involvedIds.includes('s_noe_initial'),
    );
    expect(after?.severity).toBe('major');
    expect(after?.id).toBe(before?.id); // identifiant stable : la contradiction se transforme, elle ne clignote pas
    const text = renderExplanation(after?.explanation ?? [], scenario)
      .map((s) => s.text)
      .join(' ');
    expect(text).toMatch(/obstruction/);
  });

  it('sensorielle : une source sonore incompatible avec la perception décrite', () => {
    const e = ev([claim('noise_source', 'h_freezer_alarm')]);
    const c = e.coherence.blocking.find(
      (x) => x.kind === 'sensory' && x.involvedIds.includes('h_freezer_alarm'),
    );
    expect(c).toBeDefined();
    const text = renderExplanation(c?.explanation ?? [], scenario)
      .map((s) => s.text)
      .join(' ');
    expect(text).toMatch(/Signature décrite/);
    // le chariot sur le seuil est compatible : aucune contradiction sensorielle une fois débloqué
    const s = run([
      confront('jo', 's_jo_initial', 'e_camera_gap'),
      confront('noe', 's_noe_initial', 'e_pallet_scan'),
      claim('noise_source', 'h_trolley_threshold'),
    ]);
    const ok = evaluateVersion(scenario, s).evaluation;
    expect(ok.coherence.blocking.filter((x) => x.kind === 'sensory')).toEqual([]);
  });

  it('matérielle : une pièce jointe exclut une hypothèse ; la retirer du rapport la transforme en omission', () => {
    const s = run([
      confront('jo', 's_jo_initial', 'e_camera_gap'),
      confront('ines', 's_ines_initial', 'e_pallet_scan', 'direct'),
      claim('video_outage', 'h_deliberate_unplug', { actorId: 'ana' as never }),
    ]);
    const e = evaluateVersion(scenario, s).evaluation;
    const c = e.coherence.blocking.find(
      (x) => x.kind === 'material' && x.involvedIds.includes('e_breaker_log'),
    );
    expect(c?.severity).toBe('critical');
    const detached = run(
      [{ type: 'set-evidence-attached', evidenceId: 'e_breaker_log' as never, attached: false }],
      s,
    );
    const e2 = evaluateVersion(scenario, detached).evaluation;
    expect(e2.coherence.blocking.filter((x) => x.involvedIds.includes('e_breaker_log'))).toEqual(
      [],
    );
    const omission = e2.contradictions.find(
      (x) => x.kind === 'material' && x.title.startsWith('Omission'),
    );
    expect(omission?.severity).toBe('notice');
  });

  it('matérielle : règle générique « la palette n’explique pas l’absence de fichier »', () => {
    const e = ev([claim('video_outage', 'h_pallet_camera')]);
    const c = e.coherence.blocking.find((x) => x.ruleId === 'r_camera_pallet_not_signal');
    expect(c).toBeDefined();
    expect(
      renderExplanation(c?.explanation ?? [], scenario).some((s) =>
        s.text.includes('redémarrage de session'),
      ),
    ).toBe(true);
  });

  it('épistémique : une déclaration sans chemin de connaissance connu est signalée, puis résolue', () => {
    const e = ev([]);
    const c = e.contradictions.find((x) => x.kind === 'epistemic');
    expect(c?.involvedIds).toContain('s_noe_initial');
    expect(c?.involvesVersion).toBe(false);
    const after = ev([
      confront('jo', 's_jo_initial', 'e_camera_gap'),
      confront('noe', 's_noe_initial', 'e_pallet_scan'),
    ]);
    expect(after.contradictions.filter((x) => x.kind === 'epistemic')).toEqual([]);
  });

  it('discursive : la version contredit une déclaration debout (majeure) ; une déclaration discréditée ne bloque plus', () => {
    // Inès déclare être restée dans l'allée froide ; la version la place en salle de pause
    const s = run([
      confront('jo', 's_jo_initial', 'e_camera_gap'),
      confront('ines', 's_ines_initial', 'e_pallet_scan', 'direct'),
      claim('video_outage', 'h_circuit_overload'),
    ]);
    const e = evaluateVersion(scenario, s).evaluation;
    const c = e.coherence.blocking.find(
      (x) => x.kind === 'discursive' && x.involvedIds.includes('s_ines_initial'),
    );
    expect(c?.severity).toBe('major');
    // Malik : sa déclaration initiale est physiquement impossible → une version qui la contredit n'est qu'annotée
    const s2 = run([claim('cash_origin', 'h_malik_theft', { interval: interval(326, 350) })]);
    const e2 = evaluateVersion(scenario, s2).evaluation;
    const d = e2.contradictions.find(
      (x) =>
        x.kind === 'discursive' && x.involvedIds.includes('s_malik_initial') && x.involvesVersion,
    );
    expect(d?.severity).toBe('notice');
  });

  it('discursive : deux témoignages incompatibles sont signalés sans compter pour la cohérence', () => {
    const e = ev([]);
    const c = e.contradictions.find(
      (x) =>
        x.kind === 'discursive' &&
        x.involvedIds.includes('s_ines_initial') &&
        x.involvedIds.includes('s_noe_initial'),
    );
    expect(c?.severity).toBe('notice');
    expect(c?.involvesVersion).toBe(false);
    expect(e.coherence.status).toBe('incomplete');
  });

  it('motivationnelle : un refus de signature n’abaisse pas la cohérence matérielle', () => {
    const s = run([claim('cash_origin', 'h_malik_theft', { interval: interval(326, 350) })]);
    const e = evaluateVersion(scenario, s).evaluation;
    expect(e.motivational.some((m) => m.involvedIds.includes('malik'))).toBe(true);
    expect(e.motivational.every((m) => m.kind === 'motivational')).toBe(true);
    expect(e.coherence.blocking.some((c) => c.kind === 'motivational')).toBe(false);
    expect(kinds(e.contradictions)).not.toContain('motivational');
  });
});

describe('cycle de vie des contradictions', () => {
  it('retirer une claim supprime les contradictions qui dépendent uniquement d’elle', () => {
    const withClaim = run([
      claim('video_outage', 'h_deliberate_unplug', { actorId: 'malik' as never }),
    ]);
    const e1 = evaluateVersion(scenario, withClaim).evaluation;
    const mine = e1.contradictions.filter((c) => c.involvedIds.includes('h_deliberate_unplug'));
    expect(mine.length).toBeGreaterThan(0);
    const cleared = run([{ type: 'clear-claim', slotId: 'video_outage' as never }], withClaim);
    const e2 = evaluateVersion(scenario, cleared).evaluation;
    for (const c of mine) expect(e2.contradictions.find((x) => x.id === c.id)).toBeUndefined();
    // les contradictions indépendantes (témoignages) subsistent
    const independent = e1.contradictions
      .filter((c) => !c.involvesVersion)
      .map((c) => c.id)
      .sort();
    expect(
      e2.contradictions
        .filter((c) => !c.involvesVersion)
        .map((c) => c.id)
        .sort(),
    ).toEqual(independent);
  });

  it('les identifiants sont stables et la déduplication conserve la sévérité la plus haute', () => {
    const a = makeContradiction({
      kind: 'material',
      severity: 'notice',
      title: 'a',
      ruleId: 'r',
      involvedIds: ['x', 'y'],
      explanation: [],
      involvesVersion: true,
    });
    const b = makeContradiction({
      kind: 'material',
      severity: 'critical',
      title: 'b',
      ruleId: 'r',
      involvedIds: ['y', 'x'],
      explanation: [],
      involvesVersion: false,
      suggestedEvidenceIds: ['e_till_report' as never],
    });
    expect(a.id).toBe(b.id);
    const merged = dedupeContradictions([a, b]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.severity).toBe('critical');
    expect(merged[0]?.involvesVersion).toBe(true);
    expect(merged[0]?.suggestedEvidenceIds).toEqual(['e_till_report']);
  });

  it('deux évaluations du même état renvoient les mêmes identifiants (aucun clignotement)', () => {
    const s = run([claim('cash_origin', 'h_malik_theft')]);
    const ids1 = computeEvaluation(scenario, s).evaluation.contradictions.map((c) => c.id);
    const ids2 = computeEvaluation(scenario, s).evaluation.contradictions.map((c) => c.id);
    expect(ids1).toEqual(ids2);
  });

  it('les détecteurs distinguent inconnu / non étayé / contredit / impossible', () => {
    const s = run([
      ...CANONICAL_CONFRONTATIONS.slice(0, 2),
      claim('video_outage', 'h_deliberate_unplug', {
        actorId: 'jo' as never,
        interval: interval(520, 540),
      }), // inconnu : Jo hors champ
      claim('noise_source', 'h_bottle_noise'), // contredit : signature/timing vs Noé
      claim('cash_origin', 'h_malik_theft'), // impossible : chevauche la caméra
      claim('manager_knowledge', 'h_ana_deposit'), // non étayé : assertion sans pièce
    ]);
    const e = evaluateVersion(scenario, s).evaluation;
    const status = Object.fromEntries(e.slots.map((x) => [x.slotId, x.status]));
    expect(status.video_outage).toBe('unknown');
    expect(status.noise_source).toBe('contradicted');
    expect(status.cash_origin).toBe('impossible');
    expect(status.manager_knowledge).toBe('unsupported');
    expect(status.receipt_path).toBe('empty');
  });

  it('propositionsConflict détecte exclusions explicites et conflits spatio-temporels', () => {
    const p = (id: string) => scenario.index.propositions.get(id as never);
    expect(propositionsConflict(p('prop_refund_happened')!, p('prop_counting_error')!)).toBe(
      'explicit',
    );
    expect(
      propositionsConflict(p('prop_ines_cold_aisle_continuous')!, p('prop_kettle_caused_trip')!),
    ).not.toBeNull();
    expect(
      propositionsConflict(p('prop_customer_left_2052')!, p('prop_freezer_alarm')!),
    ).toBeNull();
  });
});

describe('aucun spoiler avant révélation', () => {
  const hiddenLabels = () =>
    scenario.data.canonicalFacts
      .filter((f) => f.secrecy === 'canonical-only')
      .map((f) => scenario.index.factPresentations.get(f.id)?.label ?? '');
  const hiddenStatementTexts = () =>
    scenario.data.statements.filter((s) => !s.availableAtStart).map((s) => s.publicText);

  it('les explications ne citent ni fait secret ni déclaration non débloquée', () => {
    const e = ev([
      claim('cash_origin', 'h_malik_theft'),
      claim('video_outage', 'h_deliberate_unplug', { actorId: 'malik' as never }),
      claim('noise_source', 'h_stockroom_door', { actorId: 'ines' as never }),
    ]);
    const texts = [...e.contradictions, ...e.motivational]
      .flatMap((c) => [c.title, ...renderExplanation(c.explanation, scenario).map((s) => s.text)])
      .join('\n');
    for (const label of hiddenLabels()) expect(texts).not.toContain(label);
    for (const t of hiddenStatementTexts()) expect(texts).not.toContain(t);
    expect(texts).not.toMatch(/bouilloire|justificatif rose|derrière la fiche/i);
    for (const c of [...e.contradictions, ...e.motivational]) {
      for (const id of c.involvedIds) {
        const fact = scenario.index.facts.get(id as never);
        if (fact) expect(fact.secrecy, `fait secret impliqué : ${id}`).not.toBe('canonical-only');
      }
    }
  });
});

describe('vérité canonique', () => {
  it('la version vraie est cohérente, étayée et atteint « Tout écrire » une fois les confrontations résolues', () => {
    const s = run([...CANONICAL_CONFRONTATIONS, ...CANONICAL_CLAIMS]);
    const e = evaluateVersion(scenario, s).evaluation;
    expect(e.coherence.status).toBe('coherent');
    expect(e.coherence.blocking).toEqual([]);
    expect(e.slots.every((x) => x.status === 'supported')).toBe(true);
    expect(e.reachableEndingIds[0]).toBe('ending_transparent');
  });
});
