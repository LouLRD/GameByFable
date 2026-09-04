/**
 * Détecteur matériel : incompatibilité entre la version et une trace jointe au rapport,
 * règles génériques du scénario (exigences, exclusions, conflits) et omissions
 * (pièce débloquée mais retirée du rapport alors qu'elle contredit la version).
 */
import type {
  Contradiction,
  ContradictionDetector,
  ExplanationStep,
} from '../../model/contradiction';
import type { EvaluationContext } from '../../engine/context';
import type { Evidence, GenericRule } from '../../model/scenario';
import type { PropositionId } from '../../model/ids';
import {
  claimsWithPropositions,
  evidenceStatusSeverity,
  makeContradiction,
  slotOfHypothesis,
  slotsForPropositions,
} from '../common';

function claimStep(ctx: EvaluationContext, hypothesisId: string): ExplanationStep {
  const ev = ctx.claimEvents.find((e) => e.hypothesis.id === hypothesisId);
  const step: ExplanationStep = { type: 'claim', hypothesisId: hypothesisId as never };
  if (ev?.actorId) step.actorId = ev.actorId;
  if (ev?.zoneId) step.zoneId = ev.zoneId;
  if (ev?.interval) step.interval = ev.interval;
  return step;
}

function evidenceVsVersion(
  ctx: EvaluationContext,
  e: Evidence,
  attached: boolean,
): Contradiction[] {
  const out: Contradiction[] = [];
  const conflicts: { prop: PropositionId; via: 'excludes' | 'supports'; other: PropositionId }[] =
    [];
  for (const p of e.excludes)
    if (ctx.versionPropositionSet.has(p)) conflicts.push({ prop: p, via: 'excludes', other: p });
  for (const p of e.supports) {
    const supported = ctx.scenario.index.propositions.get(p);
    if (!supported) continue;
    for (const q of ctx.versionPropositions) {
      const def = ctx.scenario.index.propositions.get(q);
      if (def && (def.excludes.includes(p) || supported.excludes.includes(q)))
        conflicts.push({ prop: q, via: 'supports', other: p });
    }
  }
  for (const c of conflicts) {
    const claims = claimsWithPropositions(ctx, [c.prop]);
    for (const claim of claims) {
      const steps: ExplanationStep[] = [{ type: 'evidence', evidenceId: e.id }];
      if (c.via === 'excludes')
        steps.push({ type: 'excludes', sourceId: e.id, propositionId: c.prop });
      else steps.push({ type: 'proposition-conflict', a: c.other, b: c.prop, reason: 'explicit' });
      steps.push(claimStep(ctx, claim.hypothesis.id));
      steps.push({
        type: 'conclusion',
        text: attached
          ? e.status === 'established'
            ? `Une trace établie jointe au rapport rend cette hypothèse impossible telle quelle.`
            : `Une trace déduite jointe au rapport contredit cette hypothèse ; elle peut être discutée, mais pas ignorée.`
          : `Cette pièce est connue mais retirée du rapport : la version tient parce qu'elle omet une trace qui la contredit.`,
      });
      out.push(
        makeContradiction({
          kind: 'material',
          severity: attached ? evidenceStatusSeverity(e) : 'notice',
          title: attached ? `Incompatible avec « ${e.label} »` : `Omission : « ${e.label} »`,
          ruleId: attached
            ? c.via === 'excludes'
              ? 'r_evidence_excludes'
              : 'r_evidence_supports'
            : 'r_evidence_omitted',
          involvedIds: [e.id, claim.hypothesis.id],
          slotIds: [claim.hypothesis.slotId],
          explanation: steps,
          suggestedEvidenceIds: [e.id],
          involvesVersion: true,
        }),
      );
    }
  }
  return out;
}

function genericRule(ctx: EvaluationContext, rule: GenericRule): Contradiction[] {
  if (rule.kind !== 'material') return [];
  const out: Contradiction[] = [];
  const attached = new Set(ctx.attachedEvidence.map((e) => e.id));
  const evidenceOk = rule.ifEvidenceId ? attached.has(rule.ifEvidenceId) : true;
  const propositionOk = rule.ifProposition
    ? ctx.versionPropositionSet.has(rule.ifProposition)
    : true;
  if (!evidenceOk || !propositionOk) return out;

  if (rule.requireAnyProposition && rule.requireAnyProposition.length > 0) {
    const satisfied = rule.requireAnyProposition.some((p) => ctx.versionPropositionSet.has(p));
    if (!satisfied) {
      const slots = slotsForPropositions(ctx.scenario, rule.requireAnyProposition);
      const filled = slots.filter((s) => ctx.claims.some((c) => c.slotId === s));
      // Une claim absente donne un monde incomplet, pas un monde faux : on ne signale que si le slot est rempli.
      if (filled.length > 0) {
        const involved = [
          rule.id,
          ...(rule.ifEvidenceId ? [rule.ifEvidenceId] : []),
          ...ctx.claims.filter((c) => filled.includes(c.slotId)).map((c) => c.hypothesisId),
        ];
        const steps: ExplanationStep[] = [];
        if (rule.ifEvidenceId) steps.push({ type: 'evidence', evidenceId: rule.ifEvidenceId });
        if (rule.ifProposition)
          steps.push({
            type: 'text',
            text: `La version affirme : « ${ctx.scenario.index.propositions.get(rule.ifProposition)?.label ?? rule.ifProposition} ».`,
          });
        steps.push({
          type: 'requires',
          evidenceId: (rule.ifEvidenceId ?? '') as never,
          anyOf: rule.requireAnyProposition,
        });
        for (const c of ctx.claims.filter((c) => filled.includes(c.slotId)))
          steps.push(claimStep(ctx, c.hypothesisId));
        steps.push({
          type: 'conclusion',
          text: `Aucune hypothèse de la version ne fournit l'une des explications exigées.`,
        });
        out.push(
          makeContradiction({
            kind: 'material',
            severity: 'major',
            title: rule.ifEvidenceId
              ? `« ${ctx.scenario.index.evidence.get(rule.ifEvidenceId)?.label ?? rule.ifEvidenceId} » exige une explication`
              : `Une conséquence manque à la version`,
            ruleId: rule.id,
            involvedIds: involved,
            slotIds: filled,
            explanation: steps,
            suggestedEvidenceIds: rule.ifEvidenceId ? [rule.ifEvidenceId] : [],
            involvesVersion: true,
          }),
        );
      }
    }
  }
  if (rule.excludeProposition && ctx.versionPropositionSet.has(rule.excludeProposition)) {
    for (const claim of claimsWithPropositions(ctx, [rule.excludeProposition])) {
      const steps: ExplanationStep[] = [];
      if (rule.ifEvidenceId) steps.push({ type: 'evidence', evidenceId: rule.ifEvidenceId });
      steps.push(
        {
          type: 'excludes',
          sourceId: rule.ifEvidenceId ?? rule.id,
          propositionId: rule.excludeProposition,
        },
        claimStep(ctx, claim.hypothesis.id),
      );
      steps.push({
        type: 'conclusion',
        text: rule.explanation ?? `La trace jointe exclut cette hypothèse.`,
      });
      out.push(
        makeContradiction({
          kind: 'material',
          severity: rule.ifEvidenceId
            ? evidenceStatusSeverity(
                ctx.scenario.index.evidence.get(rule.ifEvidenceId) ??
                  ({ status: 'deduced' } as Evidence),
              )
            : 'major',
          title: `Exclu par « ${rule.ifEvidenceId ? (ctx.scenario.index.evidence.get(rule.ifEvidenceId)?.label ?? rule.ifEvidenceId) : rule.id} »`,
          ruleId: rule.id,
          involvedIds: [
            rule.id,
            claim.hypothesis.id,
            ...(rule.ifEvidenceId ? [rule.ifEvidenceId] : []),
          ],
          slotIds: [claim.hypothesis.slotId],
          explanation: steps,
          suggestedEvidenceIds: rule.ifEvidenceId ? [rule.ifEvidenceId] : [],
          involvesVersion: true,
        }),
      );
    }
  }
  if (
    rule.conflictsWithEvidenceId &&
    attached.has(rule.conflictsWithEvidenceId) &&
    rule.ifProposition
  ) {
    const e = ctx.scenario.index.evidence.get(rule.conflictsWithEvidenceId);
    for (const claim of claimsWithPropositions(ctx, [rule.ifProposition])) {
      out.push(
        makeContradiction({
          kind: 'material',
          severity: e ? evidenceStatusSeverity(e) : 'major',
          title: `Incompatible avec « ${e?.label ?? rule.conflictsWithEvidenceId} »`,
          ruleId: rule.id,
          involvedIds: [rule.id, claim.hypothesis.id, rule.conflictsWithEvidenceId],
          slotIds: slotOfHypothesis(ctx.scenario, claim.hypothesis.id),
          explanation: [
            claimStep(ctx, claim.hypothesis.id),
            { type: 'evidence', evidenceId: rule.conflictsWithEvidenceId },
            { type: 'conclusion', text: rule.explanation ?? `La trace contredit l'hypothèse.` },
          ],
          suggestedEvidenceIds: [rule.conflictsWithEvidenceId],
          involvesVersion: true,
        }),
      );
    }
  }
  return out;
}

export const materialDetector: ContradictionDetector & {
  detect(ctx: EvaluationContext): Contradiction[];
} = {
  id: 'material',
  detect(ctx: EvaluationContext): Contradiction[] {
    const out: Contradiction[] = [];
    for (const e of ctx.attachedEvidence) out.push(...evidenceVsVersion(ctx, e, true));
    for (const e of ctx.detachedEvidence) out.push(...evidenceVsVersion(ctx, e, false));
    for (const rule of ctx.scenario.data.genericRules) out.push(...genericRule(ctx, rule));
    return out;
  },
};
