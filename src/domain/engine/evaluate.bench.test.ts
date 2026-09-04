import { describe, expect, it } from 'vitest';
import { scenario, run, claim, CANONICAL_CONFRONTATIONS } from '@/test/helpers';
import { computeEvaluation, evaluateVersion } from './evaluate';
import { interval } from '../model/time';

/**
 * Mesure honnête : 1 000 évaluations complètes SANS cache (computeEvaluation), sur des versions
 * variées ; la médiane est affichée et comparée à la cible indicative de 20 ms (spécification §14).
 */
describe('performance de l’évaluation', () => {
  it('médiane de 1 000 évaluations complètes', { timeout: 120_000 }, () => {
    const base = run([...CANONICAL_CONFRONTATIONS]);
    const hyps = scenario.data.hypotheses;
    const states = Array.from({ length: 20 }, (_, i) => {
      const actions = scenario.data.claimSlots.map((slot, j) => {
        const candidates = hyps.filter((h) => h.slotId === slot.id);
        const h = candidates[(i + j) % candidates.length];
        if (!h) throw new Error('slot vide');
        const actor = scenario.data.characters[(i + j) % 6];
        return claim(slot.id, h.id, h.requiresActor && actor ? { actorId: actor.id, interval: interval(400 + i * 10, 460 + i * 10) } : {});
      });
      return run(actions, base);
    });
    const samples: number[] = [];
    for (let i = 0; i < 1000; i += 1) {
      const s = states[i % states.length];
      if (!s) continue;
      const t0 = performance.now();
      computeEvaluation(scenario, s);
      samples.push(performance.now() - t0);
    }
    samples.sort((a, b) => a - b);
    const median = samples[Math.floor(samples.length / 2)] ?? 0;
    const p95 = samples[Math.floor(samples.length * 0.95)] ?? 0;
    console.info(`[bench] évaluation complète : médiane ${median.toFixed(2)} ms, p95 ${p95.toFixed(2)} ms (1 000 échantillons, 20 versions distinctes)`);
    expect(median).toBeLessThan(20);
  });

  it('le cache évite tout recalcul pour un état identique', () => {
    const s = run([claim('cash_origin', 'h_malik_theft')]);
    const a = evaluateVersion(scenario, s);
    const b = evaluateVersion(scenario, s);
    expect(b).toBe(a);
  });
});
