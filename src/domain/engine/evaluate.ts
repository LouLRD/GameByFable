/**
 * Évaluation complète d'une version : contradictions, cohérence, dévoilement, adhésion, fins.
 * Mémoïsée sur un hash sémantique des parties pertinentes de l'état ; le cache n'est pas une vérité sauvegardée.
 */
import type { Contradiction } from '../model/contradiction';
import type { SlotEvaluation, VersionEvaluation, CoherenceStatus } from '../model/evaluation';
import type { LoadedScenario } from '../model/scenario';
import type { GameState } from '../model/state';
import type { ClaimStatus } from '../model/version';
import { buildContext, type EvaluationContext } from './context';
import { canOccupy } from './positions';
import { runDetectors } from '../contradictions/registry';
import { makeContradiction, SEVERITY_RANK } from '../contradictions/common';
import { decideSignature, countsAsSignature } from '../endings/signatures';
import { reachableEndings } from '../endings/endings';
import { semanticHash } from '../replay/hash';

export interface FullEvaluation {
  context: EvaluationContext;
  evaluation: VersionEvaluation;
}

function evaluationKey(state: GameState): string {
  return semanticHash({
    claims: state.claims,
    detached: state.detachedEvidenceIds,
    evidence: state.unlockedEvidenceIds,
    statements: state.unlockedStatementIds,
    retracted: state.retractedStatementIds,
    perceptions: state.revealedPerceptionIds,
    facts: state.establishedFactIds,
    reported: state.reportedFactIds,
    characters: state.characters,
    phase: state.phase,
    scenarioId: state.scenarioId,
  });
}

const CACHE_LIMIT = 64;
const caches = new WeakMap<LoadedScenario, Map<string, FullEvaluation>>();

export function evaluateVersion(scenario: LoadedScenario, state: GameState): FullEvaluation {
  let cache = caches.get(scenario);
  if (!cache) {
    cache = new Map();
    caches.set(scenario, cache);
  }
  const key = evaluationKey(state);
  const hit = cache.get(key);
  if (hit) return hit;
  const result = computeEvaluation(scenario, state);
  if (cache.size >= CACHE_LIMIT) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  cache.set(key, result);
  return result;
}

export function computeEvaluation(scenario: LoadedScenario, state: GameState): FullEvaluation {
  const ctx = buildContext(scenario, state);
  const factual = runDetectors(ctx);
  const versionContradictions = factual.filter((c) => c.involvesVersion);
  const blocking = versionContradictions.filter((c) => SEVERITY_RANK[c.severity] >= SEVERITY_RANK.major);
  const notices = factual.filter((c) => !blocking.includes(c));

  const adhesion = scenario.data.characters.map((c) => decideSignature(ctx, c.id));
  const motivational: Contradiction[] = adhesion
    .filter((d) => !countsAsSignature(d.verdict))
    .map((d) =>
      makeContradiction({
        kind: 'motivational',
        severity: d.verdict === 'requests-change' ? 'major' : 'notice',
        title: `${scenario.index.characters.get(d.characterId)?.name ?? d.characterId} ne signe pas`,
        ruleId: 'r_signature',
        involvedIds: [d.characterId, ...ctx.claims.filter((c) => !d.requestedSlotId || c.slotId === d.requestedSlotId).map((c) => c.hypothesisId)],
        slotIds: d.requestedSlotId ? [d.requestedSlotId] : [],
        explanation: [...d.publicReasons.map((text) => ({ type: 'text' as const, text })), { type: 'conclusion', text: `Résistance sociale : la version peut rester matériellement cohérente, mais cette personne ne l'endossera pas.` }],
        involvesVersion: true,
      }),
    );

  const requiredSlots = scenario.data.claimSlots.filter((s) => s.required);
  const filledRequired = requiredSlots.filter((s) => ctx.claims.some((c) => c.slotId === s.id)).length;
  const completeness = requiredSlots.length === 0 ? 1 : filledRequired / requiredSlots.length;

  const slots: SlotEvaluation[] = scenario.data.claimSlots.map((slot) => {
    const ev = ctx.claimEvents.find((e) => e.hypothesis.slotId === slot.id);
    if (!ev) return { slotId: slot.id, status: 'empty', supportingEvidenceIds: [], contradictionIds: [] };
    const mine = versionContradictions.filter((c) => c.involvedIds.includes(ev.hypothesis.id));
    const supporting = ctx.attachedEvidence.filter((e) => e.supports.some((p) => ev.hypothesis.propositions.includes(p))).map((e) => e.id as string);
    let status: ClaimStatus;
    if (mine.some((c) => c.severity === 'critical')) status = 'impossible';
    else if (mine.some((c) => c.severity === 'major')) status = 'contradicted';
    else if (supporting.length > 0) status = 'supported';
    else if (ev.hypothesis.requiresActor && !ev.actorId) status = 'unknown';
    else if (ev.presence) {
      const occ = canOccupy(ev.presence.characterId, ev.presence.zoneId, ev.presence.interval, ctx.positions, scenario, ctx.world, [ev.hypothesis.id]);
      status = occ.status === 'possible' ? 'unknown' : 'unsupported';
    } else status = 'unsupported';
    return { slotId: slot.id, status, supportingEvidenceIds: supporting, contradictionIds: mine.map((c) => c.id) };
  });

  let status: CoherenceStatus;
  if (blocking.some((c) => c.severity === 'critical')) status = 'impossible';
  else if (blocking.length > 0) status = 'contradicted';
  else if (completeness < 1) status = 'incomplete';
  else if (!slots.some((s) => s.status === 'supported')) status = 'unsupported';
  else status = 'coherent';

  const allHypothesisProps = new Set(scenario.data.hypotheses.flatMap((h) => h.propositions));
  const explainable = ctx.unlockedEvidence.filter((e) => e.supports.some((p) => allHypothesisProps.has(p)));
  const explained = explainable.filter((e) => e.supports.some((p) => ctx.versionPropositionSet.has(p)) && !e.excludes.some((p) => ctx.versionPropositionSet.has(p)));
  const establishedExplained = explainable.length === 0 ? 0 : explained.length / explainable.length;

  let canonicalAlignment: number | null = null;
  if (state.phase === 'sealed' || scenario.data.revealPolicy.canonicalAlignmentBeforeEnding) {
    const total = scenario.data.claimSlots.length;
    const matches = ctx.claims.filter((c) => scenario.index.canonicalBySlot.get(c.slotId) === c.hypothesisId).length;
    canonicalAlignment = total === 0 ? 0 : matches / total;
  }

  const signatureCount = adhesion.filter((d) => countsAsSignature(d.verdict)).length;
  const reachable = reachableEndings(ctx, blocking, adhesion).map((e) => e.id);

  const evaluation: VersionEvaluation = {
    completeness,
    coherence: { status, blocking, notices },
    disclosure: {
      establishedExplained,
      explainedEvidenceIds: explained.map((e) => e.id as string),
      unexplainedEvidenceIds: explainable.filter((e) => !explained.includes(e)).map((e) => e.id as string),
      canonicalAlignment,
    },
    adhesion,
    signatureCount,
    reachableEndingIds: reachable,
    slots,
    contradictions: factual,
    motivational,
  };
  return { context: ctx, evaluation };
}
