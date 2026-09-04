import type { Contradiction, ContradictionDetector } from '../model/contradiction';
import type { EvaluationContext } from '../engine/context';
import { dedupeContradictions } from './common';
import { discursiveDetector } from './detectors/discursive';
import { epistemicDetector } from './detectors/epistemic';
import { materialDetector } from './detectors/material';
import { physicalTemporalDetector } from './detectors/physicalTemporal';
import { sensoryDetector } from './detectors/sensory';

export type Detector = ContradictionDetector & { detect(ctx: EvaluationContext): Contradiction[] };

/** Détecteurs factuels (les six familles hors motivationnelle, cette dernière découlant des signatures). */
export const factualDetectors: readonly Detector[] = [
  physicalTemporalDetector,
  sensoryDetector,
  materialDetector,
  epistemicDetector,
  discursiveDetector,
];

export function runDetectors(
  ctx: EvaluationContext,
  detectors: readonly Detector[] = factualDetectors,
): Contradiction[] {
  const all: Contradiction[] = [];
  for (const d of detectors) all.push(...d.detect(ctx));
  return dedupeContradictions(all);
}
