import rawScenario from './la-veilleuse.json';
import { laVeilleuseExtension } from './la-veilleuse.extension';
import { loadScenario, type LoadResult } from './loader';
import type { LoadedScenario } from '@/domain/model/scenario';

let cached: LoadResult | null = null;

/** Charge (une fois) le scénario embarqué. */
export function loadBundledScenario(): LoadResult {
  cached ??= loadScenario(rawScenario, laVeilleuseExtension);
  return cached;
}

/** Variante qui lève en cas d'échec ; utile aux tests et au moteur. */
export function requireBundledScenario(): LoadedScenario {
  const result = loadBundledScenario();
  if (!result.ok) {
    const details = result.issues.map((i) => `- [${i.code}] ${i.path}: ${i.message}`).join('\n');
    throw new Error(`Scénario invalide :\n${details}`);
  }
  return result.scenario;
}

export { loadScenario } from './loader';
export type { LoadResult } from './loader';
export type { ScenarioIssue } from './validate';
