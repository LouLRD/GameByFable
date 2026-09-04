import type { Contradiction } from '../model/contradiction';
import type { SignatureDecision } from '../model/evaluation';
import type { EndingId } from '../model/ids';
import type { Ending, LoadedScenario } from '../model/scenario';
import type { EvaluationContext } from '../engine/context';
import { countsAsSignature } from './signatures';

export interface EndingMatch {
  ending: Ending;
  satisfied: boolean;
  failed: string[];
}

export function matchEnding(ctx: EvaluationContext, ending: Ending, blocking: readonly Contradiction[], adhesion: readonly SignatureDecision[]): EndingMatch {
  const failed: string[] = [];
  const hyps = new Set(ctx.claims.map((c) => c.hypothesisId as string));
  const attached = new Set(ctx.attachedEvidence.map((e) => e.id as string));
  const unlocked = new Set(ctx.unlockedEvidence.map((e) => e.id as string));
  if (!ending.requiresHypotheses.every((h) => hyps.has(h))) failed.push('hypotheses');
  if (!ending.requiresEvidence.every((e) => attached.has(e))) failed.push('evidence');
  if (ending.forbidsEvidenceInReport.some((e) => attached.has(e))) failed.push('forbidden-in-report');
  if (ending.forbidsEvidenceUnlocked.some((e) => unlocked.has(e))) failed.push('forbidden-unlocked');
  if (ending.maxBlockingContradictions !== null && blocking.length > ending.maxBlockingContradictions) failed.push('blocking');
  const signatures = adhesion.filter((d) => countsAsSignature(d.verdict)).length;
  if (signatures < ending.minimumSignatures) failed.push('signatures');
  return { ending, satisfied: failed.length === 0, failed };
}

/** Fins atteignables par ordre de priorité décroissante (hors repli). */
export function reachableEndings(ctx: EvaluationContext, blocking: readonly Contradiction[], adhesion: readonly SignatureDecision[]): Ending[] {
  return [...ctx.scenario.data.endings]
    .filter((e) => !e.fallback)
    .sort((a, b) => b.priority - a.priority || (a.id < b.id ? -1 : 1))
    .filter((e) => matchEnding(ctx, e, blocking, adhesion).satisfied);
}

export function resolveEnding(ctx: EvaluationContext, blocking: readonly Contradiction[], adhesion: readonly SignatureDecision[]): Ending {
  const reachable = reachableEndings(ctx, blocking, adhesion);
  const first = reachable[0];
  if (first) return first;
  const fallback = ctx.scenario.data.endings.find((e) => e.fallback);
  if (!fallback) throw new Error('Scénario sans fin de repli');
  return fallback;
}

export function endingById(scenario: LoadedScenario, id: EndingId): Ending | undefined {
  return scenario.index.endings.get(id);
}
