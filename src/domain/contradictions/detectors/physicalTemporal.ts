/**
 * Détecteurs physique (trajet / absence caméra) et temporel (chevauchement) :
 * appliqués aux claims paramétrées et aux déclarations debout impliquant une présence.
 */
import type {
  Contradiction,
  ContradictionDetector,
  ExplanationStep,
} from '../../model/contradiction';
import type { EvidenceId } from '../../model/ids';
import {
  canOccupy,
  checkPairCompatibility,
  presencesFromSemantics,
  type OccupancyConflict,
  type PositionSegment,
} from '../../engine/positions';
import type { EvaluationContext } from '../../engine/context';
import { characterName, makeContradiction, zoneLabel } from '../common';

const PHYSICAL_RULE = 'r_actor_reachability';
const TEMPORAL_RULE = 'r_actor_overlap';

function conflictKind(c: OccupancyConflict): 'physical' | 'temporal' | null {
  switch (c.kind) {
    case 'overlap':
      return 'temporal';
    case 'absence':
    case 'arrival-too-late':
    case 'departure-too-late':
      return 'physical';
    case 'reported-overlap':
      return null;
  }
}

function suggestions(ctx: EvaluationContext, c: OccupancyConflict): EvidenceId[] {
  if (!c.segment) return [ctx.cameraEvidenceId];
  if (c.segment.source === 'camera') return [ctx.cameraEvidenceId];
  if (c.segment.source === 'fact') {
    const pres = ctx.scenario.index.factPresentations.get(c.segment.sourceIds[0] as never);
    return pres
      ? pres.revealedByEvidenceIds.filter((e) => ctx.unlockedEvidence.some((u) => u.id === e))
      : [];
  }
  return c.segment.sourceIds.filter((id) =>
    ctx.scenario.index.evidence.has(id as never),
  ) as EvidenceId[];
}

function fromConflict(
  ctx: EvaluationContext,
  c: OccupancyConflict,
  subject: {
    id: string;
    kind: 'claim' | 'statement';
    slotIds: string[];
    leadStep: ExplanationStep;
    characterId: string;
    zoneId: string;
  },
): Contradiction | null {
  const kind = conflictKind(c);
  if (!kind) return null;
  const name = characterName(ctx.scenario, subject.characterId);
  const isClaim = subject.kind === 'claim';
  const title =
    kind === 'temporal'
      ? `${name} ne peut pas être à deux endroits`
      : c.kind === 'absence'
        ? `La caméra ne montre pas ${name} à ${zoneLabel(ctx.scenario, subject.zoneId)}`
        : `Trajet impossible pour ${name}`;
  const conclusion: ExplanationStep = {
    type: 'conclusion',
    text: isClaim
      ? kind === 'temporal'
        ? `L'hypothèse place ${name} dans une zone alors qu'une position établie l'en exclut au même moment.`
        : `Les durées de trajet (obstructions connues comprises) rendent la position proposée inatteignable.`
      : `La déclaration est incompatible avec une position établie : elle ne peut pas être exacte telle quelle.`,
  };
  return makeContradiction({
    kind,
    severity: isClaim ? 'critical' : 'major',
    title,
    ruleId: kind === 'temporal' ? TEMPORAL_RULE : PHYSICAL_RULE,
    involvedIds: [subject.id, subject.characterId, ...(c.segment?.sourceIds ?? [])],
    slotIds: subject.slotIds,
    explanation: [subject.leadStep, ...c.steps, conclusion],
    inspectableAt: c.at,
    inspectableZoneIds: c.zoneIds,
    suggestedEvidenceIds: suggestions(ctx, c),
    involvesVersion: isClaim,
  });
}

export const physicalTemporalDetector: ContradictionDetector & {
  detect(ctx: EvaluationContext): Contradiction[];
} = {
  id: 'physical-temporal',
  detect(ctx: EvaluationContext): Contradiction[] {
    const out: Contradiction[] = [];
    const proposed: PositionSegment[] = [];
    for (const ev of ctx.claimEvents) {
      if (!ev.presence) continue;
      proposed.push(ev.presence);
      const p = ev.presence;
      const res = canOccupy(
        p.characterId,
        p.zoneId,
        p.interval,
        ctx.positions,
        ctx.scenario,
        ctx.world,
        [ev.hypothesis.id],
      );
      if (res.status !== 'impossible') continue;
      const lead: ExplanationStep = {
        type: 'claim',
        hypothesisId: ev.hypothesis.id,
        actorId: p.characterId,
        zoneId: p.zoneId,
        interval: p.interval,
      };
      for (const c of res.conflicts) {
        const contradiction = fromConflict(ctx, c, {
          id: ev.hypothesis.id,
          kind: 'claim',
          slotIds: [ev.hypothesis.slotId],
          leadStep: lead,
          characterId: p.characterId,
          zoneId: p.zoneId,
        });
        if (contradiction) out.push(contradiction);
      }
    }
    for (let i = 0; i < proposed.length; i += 1) {
      for (let j = i + 1; j < proposed.length; j += 1) {
        const a = proposed[i];
        const b = proposed[j];
        if (!a || !b) continue;
        const c = checkPairCompatibility(a, b, ctx.scenario, ctx.world);
        if (!c) continue;
        const kind = conflictKind(c);
        if (!kind) continue;
        const name = characterName(ctx.scenario, a.characterId);
        const ha = a.sourceIds[0] ?? '';
        const hb = b.sourceIds[0] ?? '';
        const slotIds = [ha, hb]
          .map((h) => ctx.scenario.index.hypotheses.get(h as never)?.slotId)
          .filter((s): s is NonNullable<typeof s> => s !== undefined);
        out.push(
          makeContradiction({
            kind,
            severity: 'critical',
            title:
              kind === 'temporal'
                ? `${name} ne peut pas être à deux endroits`
                : `Trajet impossible pour ${name} entre deux hypothèses`,
            ruleId: kind === 'temporal' ? TEMPORAL_RULE : PHYSICAL_RULE,
            involvedIds: [ha, hb, a.characterId],
            slotIds,
            explanation: [
              {
                type: 'claim',
                hypothesisId: ha as never,
                actorId: a.characterId,
                zoneId: a.zoneId,
                interval: a.interval,
              },
              {
                type: 'claim',
                hypothesisId: hb as never,
                actorId: b.characterId,
                zoneId: b.zoneId,
                interval: b.interval,
              },
              ...c.steps,
              {
                type: 'conclusion',
                text: `Deux hypothèses de la version exigent de ${name} des présences incompatibles.`,
              },
            ],
            inspectableAt: c.at,
            inspectableZoneIds: c.zoneIds,
            involvesVersion: true,
          }),
        );
      }
    }
    for (const s of ctx.standingStatements) {
      const def = ctx.scenario.index.propositions.get(s.propositionId);
      if (!def) continue;
      for (const seg of presencesFromSemantics(def.semantics, s.id, s.speakerId)) {
        const res = canOccupy(
          seg.characterId,
          seg.zoneId,
          seg.interval,
          ctx.positions,
          ctx.scenario,
          ctx.world,
          [s.id],
        );
        if (res.status !== 'impossible') continue;
        const lead: ExplanationStep = {
          type: 'statement',
          statementId: s.id,
          speakerId: s.speakerId,
        };
        for (const c of res.conflicts) {
          const contradiction = fromConflict(ctx, c, {
            id: s.id,
            kind: 'statement',
            slotIds: [],
            leadStep: lead,
            characterId: seg.characterId,
            zoneId: seg.zoneId,
          });
          if (contradiction) out.push(contradiction);
        }
      }
    }
    return out;
  },
};
