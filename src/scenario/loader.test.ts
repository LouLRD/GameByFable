import { describe, expect, it } from 'vitest';
import rawScenario from './la-veilleuse.json';
import { laVeilleuseExtension } from './la-veilleuse.extension';
import { loadScenario } from './loader';

describe('chargement du scénario La Veilleuse', () => {
  it('valide le scénario canonique et son extension sans erreur', () => {
    const result = loadScenario(rawScenario, laVeilleuseExtension);
    if (!result.ok) {
      throw new Error(result.issues.map((i) => `[${i.code}] ${i.path}: ${i.message}`).join('\n'));
    }
    expect(result.scenario.data.zones.length).toBe(9);
    expect(result.scenario.data.characters.length).toBe(6);
    expect(result.scenario.index.canonicalBySlot.size).toBe(5);
    // avertissements listés pour information (aucun ne doit être un secret)
    for (const w of result.warnings) expect(w.severity).toBe('warning');
  });

  it('refuse un identifiant dupliqué', () => {
    const broken = structuredClone(rawScenario);
    broken.zones.push({ ...broken.zones[0]! });
    const result = loadScenario(broken, laVeilleuseExtension);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((i) => i.code === 'duplicate-id')).toBe(true);
  });

  it('refuse une référence invalide', () => {
    const broken = structuredClone(rawScenario);
    broken.passages[0]!.to = 'nowhere';
    const result = loadScenario(broken, laVeilleuseExtension);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((i) => i.code === 'unknown-zone')).toBe(true);
  });

  it('refuse un intervalle hors fenêtre', () => {
    const broken = structuredClone(rawScenario);
    broken.canonicalFacts[0]!.interval.end = 99_999;
    const result = loadScenario(broken, laVeilleuseExtension);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((i) => i.code === 'interval-out-of-window')).toBe(true);
  });

  it('refuse une zone déconnectée', () => {
    const broken = structuredClone(rawScenario);
    broken.zones.push({ id: 'island', label: 'Île', polygon: [[0, 0], [1, 0], [1, 1]], light: 0.5, acousticAbsorption: 0.1 });
    const result = loadScenario(broken, laVeilleuseExtension);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((i) => i.code === 'disconnected-zone')).toBe(true);
  });

  it('refuse une vérité déclarée contredite par les données', () => {
    const ext = structuredClone(laVeilleuseExtension);
    const p = ext.propositions.find((x) => x.id === 'prop_refund_happened')!;
    p.truth = false;
    const result = loadScenario(rawScenario, ext);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((i) => i.code === 'truth-conflict')).toBe(true);
  });

  it('refuse un scénario sans fin atteignable', () => {
    const broken = structuredClone(rawScenario);
    for (const e of broken.endings) if (!e.fallback) e.requiresEvidence = ['e_missing'];
    const result = loadScenario(broken, laVeilleuseExtension);
    expect(result.ok).toBe(false);
  });
});
