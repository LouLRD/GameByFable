import type { Contradiction, ExplanationStep, Severity } from '../model/contradiction';
import type { EvidenceId, PropositionId, ZoneId } from '../model/ids';
import type {
  ContradictionKind,
  Evidence,
  LoadedScenario,
  PropositionDef,
  PropositionSemantics,
} from '../model/scenario';
import { intervalsOverlap, sec, type Interval } from '../model/time';
import type { EvaluationContext } from '../engine/context';

export const SEVERITY_RANK: Record<Severity, number> = { notice: 0, major: 1, critical: 2 };

export function makeContradictionId(
  kind: ContradictionKind,
  ruleId: string,
  involvedIds: readonly string[],
): string {
  return `${kind}:${ruleId}:${[...new Set(involvedIds)].sort().join('+')}`;
}

export interface ContradictionInput {
  kind: ContradictionKind;
  severity: Severity;
  title: string;
  ruleId: string;
  involvedIds: string[];
  slotIds?: string[];
  explanation: ExplanationStep[];
  inspectableAt?: number;
  inspectableZoneIds?: ZoneId[];
  suggestedEvidenceIds?: EvidenceId[];
  involvesVersion: boolean;
}

export function makeContradiction(input: ContradictionInput): Contradiction {
  const involved = [...new Set(input.involvedIds)].sort();
  const c: Contradiction = {
    id: makeContradictionId(input.kind, input.ruleId, involved),
    kind: input.kind,
    severity: input.severity,
    title: input.title,
    ruleId: input.ruleId,
    involvedIds: involved,
    slotIds: [...new Set(input.slotIds ?? [])].sort(),
    explanation: input.explanation,
    inspectableZoneIds: [...new Set(input.inspectableZoneIds ?? [])].sort(),
    suggestedEvidenceIds: [...new Set(input.suggestedEvidenceIds ?? [])].sort(),
    involvesVersion: input.involvesVersion,
  };
  if (input.inspectableAt !== undefined) c.inspectableAt = sec(input.inspectableAt);
  return c;
}

/** Déduplique par identifiant stable ; conserve la sévérité la plus haute et fusionne les suggestions. */
export function dedupeContradictions(list: readonly Contradiction[]): Contradiction[] {
  const byId = new Map<string, Contradiction>();
  for (const c of list) {
    const prev = byId.get(c.id);
    if (!prev) {
      byId.set(c.id, c);
      continue;
    }
    const winner = SEVERITY_RANK[c.severity] > SEVERITY_RANK[prev.severity] ? c : prev;
    byId.set(c.id, {
      ...winner,
      suggestedEvidenceIds: [
        ...new Set([...prev.suggestedEvidenceIds, ...c.suggestedEvidenceIds]),
      ].sort(),
      inspectableZoneIds: [
        ...new Set([...prev.inspectableZoneIds, ...c.inspectableZoneIds]),
      ].sort(),
      slotIds: [...new Set([...prev.slotIds, ...c.slotIds])].sort(),
      involvesVersion: prev.involvesVersion || c.involvesVersion,
    });
  }
  return [...byId.values()].sort((a, b) => {
    const s = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (s !== 0) return s;
    return a.id < b.id ? -1 : 1;
  });
}

/** Présence(s) impliquée(s) par une sémantique, sans identité de source. */
export function presenceOf(
  sem: PropositionSemantics,
): { characterId: string; zoneId: ZoneId; interval: Interval; continuous: boolean }[] {
  switch (sem.type) {
    case 'presence':
      return [
        {
          characterId: sem.characterId,
          zoneId: sem.zoneId,
          interval: sem.interval,
          continuous: false,
        },
      ];
    case 'continuous-presence':
      return [
        {
          characterId: sem.characterId,
          zoneId: sem.zoneId,
          interval: sem.interval,
          continuous: true,
        },
      ];
    case 'event':
      return sem.actorId && sem.zoneId && sem.interval && sem.requiresPresence
        ? [
            {
              characterId: sem.actorId,
              zoneId: sem.zoneId,
              interval: sem.interval,
              continuous: false,
            },
          ]
        : [];
    case 'sound':
      return sem.actorId && sem.zoneId && sem.interval
        ? [
            {
              characterId: sem.actorId,
              zoneId: sem.zoneId,
              interval: sem.interval,
              continuous: false,
            },
          ]
        : [];
    case 'perceived': {
      const out: {
        characterId: string;
        zoneId: ZoneId;
        interval: Interval;
        continuous: boolean;
      }[] = [];
      if (sem.observerZoneId)
        out.push({
          characterId: sem.observerId,
          zoneId: sem.observerZoneId,
          interval: sem.target.interval,
          continuous: false,
        });
      if (sem.target.characterId)
        out.push({
          characterId: sem.target.characterId,
          zoneId: sem.target.zoneId,
          interval: sem.target.interval,
          continuous: false,
        });
      return out;
    }
    default:
      return [];
  }
}

export type ConflictReason = 'explicit' | 'space-time' | null;

/** Deux propositions sont-elles incompatibles (exclusion explicite ou impossibilité spatio-temporelle) ? */
export function propositionsConflict(a: PropositionDef, b: PropositionDef): ConflictReason {
  if (a.id === b.id) return null;
  if (a.excludes.includes(b.id) || b.excludes.includes(a.id)) return 'explicit';
  for (const pa of presenceOf(a.semantics)) {
    for (const pb of presenceOf(b.semantics)) {
      if (pa.characterId !== pb.characterId || pa.zoneId === pb.zoneId) continue;
      if (intervalsOverlap(pa.interval, pb.interval)) return 'space-time';
    }
  }
  return null;
}

/** Pièces (débloquées) en lien avec des propositions : pour suggérer quoi examiner. */
export function relatedEvidence(
  ctx: EvaluationContext,
  propositionIds: readonly PropositionId[],
): EvidenceId[] {
  const set = new Set(propositionIds);
  const out: EvidenceId[] = [];
  for (const e of ctx.unlockedEvidence) {
    if (e.supports.some((p) => set.has(p)) || e.excludes.some((p) => set.has(p))) out.push(e.id);
  }
  return out;
}

export function evidenceStatusSeverity(e: Evidence): Severity {
  return e.status === 'established' ? 'critical' : 'major';
}

export function characterName(scenario: LoadedScenario, id: string): string {
  return scenario.index.characters.get(id as never)?.name ?? id;
}

export function zoneLabel(scenario: LoadedScenario, id: string): string {
  return scenario.index.zones.get(id as never)?.label ?? id;
}

export function slotOfHypothesis(scenario: LoadedScenario, hypothesisId: string): string[] {
  const h = scenario.index.hypotheses.get(hypothesisId as never);
  return h ? [h.slotId] : [];
}

/** Slots dont une hypothèse contient l'une des propositions données. */
export function slotsForPropositions(
  scenario: LoadedScenario,
  props: readonly PropositionId[],
): string[] {
  const set = new Set(props);
  const out = new Set<string>();
  for (const h of scenario.data.hypotheses)
    if (h.propositions.some((p) => set.has(p))) out.add(h.slotId);
  return [...out].sort();
}

/** Claims de la version dont l'hypothèse porte l'une des propositions données. */
export function claimsWithPropositions(ctx: EvaluationContext, props: readonly PropositionId[]) {
  const set = new Set(props);
  return ctx.claimEvents.filter((ev) => ev.hypothesis.propositions.some((p) => set.has(p)));
}
