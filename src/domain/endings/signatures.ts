/**
 * Décision de signature d'un protagoniste face à une version.
 * Raisons publiques (affichables) et raisons internes (moteur seulement).
 */
import type { SignatureDecision, SignatureVerdict } from '../model/evaluation';
import type { CharacterId, ClaimSlotId, PropositionId } from '../model/ids';
import type { EvaluationContext } from '../engine/context';
import { certainties } from '../knowledge/knowledge';
import { propositionsConflict } from '../contradictions/common';

export function trustState(trust: number): 'fermé' | 'prudent' | 'disponible' | 'engagé' {
  if (trust <= -1) return 'fermé';
  if (trust === 0) return 'prudent';
  if (trust <= 2) return 'disponible';
  return 'engagé';
}

interface CostItem {
  key: string;
  amount: number;
  sourceIds: string[];
}

/** Coûts privés imposés au personnage par la version (avant exonération). */
export function versionCosts(ctx: EvaluationContext, characterId: CharacterId): CostItem[] {
  const character = ctx.scenario.index.characters.get(characterId);
  if (!character) return [];
  const items = new Map<string, CostItem>();
  const add = (key: string, sourceId: string) => {
    const amount = character.privateCosts[key];
    if (amount === undefined || amount <= 0) return;
    const prev = items.get(key);
    if (prev) prev.sourceIds.push(sourceId);
    else items.set(key, { key, amount, sourceIds: [sourceId] });
  };
  for (const ev of ctx.claimEvents) {
    for (const p of ev.hypothesis.propositions) {
      const def = ctx.scenario.index.propositions.get(p);
      for (const key of def?.costKeys[characterId] ?? []) add(key, p);
    }
    for (const key of ev.extension?.costKeys[characterId] ?? []) add(key, ev.hypothesis.id);
    if (ev.actorId === characterId) for (const key of ev.extension?.actorCostKeys ?? []) add(key, ev.hypothesis.id);
  }
  return [...items.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
}

/** Clés de coût déjà « sur la table » : assumées publiquement ou établies par une pièce jointe. */
export function waivedCostKeys(ctx: EvaluationContext, characterId: CharacterId): Set<string> {
  const waived = new Set<string>(ctx.state.characters[characterId]?.admittedCostKeys ?? []);
  for (const e of ctx.attachedEvidence) {
    if (e.status !== 'established') continue;
    for (const p of e.supports) {
      const def = ctx.scenario.index.propositions.get(p);
      for (const key of def?.costKeys[characterId] ?? []) waived.add(key);
    }
  }
  return waived;
}

export function decideSignature(ctx: EvaluationContext, characterId: CharacterId): SignatureDecision {
  const { scenario, state } = ctx;
  const character = scenario.index.characters.get(characterId);
  const cstate = state.characters[characterId];
  const rule = scenario.index.signatureRules.get(characterId);
  const name = character?.name ?? characterId;
  const trust = cstate?.trust ?? 0;
  const publicReasons: string[] = [];
  const internalReasons: string[] = [];
  const conflicting: PropositionId[] = [];
  const decision = (verdict: SignatureVerdict, requestedSlotId?: ClaimSlotId): SignatureDecision => {
    const d: SignatureDecision = { characterId, verdict, publicReasons, internalReasons, conflictingPropositionIds: [...new Set(conflicting)].sort() };
    if (requestedSlotId) d.requestedSlotId = requestedSlotId;
    return d;
  };
  const slotOf = (hypothesisId: string) => scenario.index.hypotheses.get(hypothesisId as never)?.slotId;

  // 1. Propositions rejetées catégoriquement
  for (const p of rule?.rejectsPropositions ?? []) {
    if (!ctx.versionPropositionSet.has(p)) continue;
    const claim = ctx.claimEvents.find((ev) => ev.hypothesis.propositions.includes(p));
    publicReasons.push(`${name} refuse catégoriquement : « ${scenario.index.propositions.get(p)?.label ?? p} ».`);
    conflicting.push(p);
    return decision('requests-change', claim ? slotOf(claim.hypothesis.id) : undefined);
  }
  // 2. Désignation comme fautif
  for (const ev of ctx.claimEvents) {
    if (ev.extension?.accusatory && ev.actorId === characterId) {
      publicReasons.push(`${name} refuse d'être désigné·e par « ${ev.hypothesis.label} ».`);
      return decision('requests-change', ev.hypothesis.slotId);
    }
  }
  // 3. Règles spéciales de fin
  for (const ending of scenario.data.endings) {
    if (ending.specialSignatureRule !== `${characterId}-never-signs`) continue;
    const hyps = new Set(ctx.claims.map((c) => c.hypothesisId as string));
    if (ending.requiresHypotheses.every((h) => hyps.has(h))) {
      publicReasons.push(`${name} ne signera pas une version de cette nature.`);
      return decision('refuses');
    }
  }

  const certain = certainties(cstate?.knowledge ?? []);
  const waived = waivedCostKeys(ctx, characterId);
  const costs = versionCosts(ctx, characterId);
  const unwaived = costs.filter((c) => !waived.has(c.key) && c.amount > 0);

  // 4. Conflits avec une certitude
  let silent = false;
  for (const q of ctx.versionPropositions) {
    const qdef = scenario.index.propositions.get(q);
    if (!qdef) continue;
    for (const [p, value] of certain) {
      const pdef = scenario.index.propositions.get(p);
      if (!pdef) continue;
      const conflict = (q === p && !value) || (value && propositionsConflict(qdef, pdef) !== null);
      if (!conflict) continue;
      conflicting.push(q);
      // Coût de dire la vérité : la proposition certaine elle-même (si vraie) ou ses alternatives vraies (si la version affirme un faux).
      const truthCosts =
        value
          ? (pdef.costKeys[characterId] ?? []).filter((k) => !waived.has(k) && (character?.privateCosts[k] ?? 0) > 0)
          : trueAlternativesCost(ctx, characterId, q, certain, waived);
      if (truthCosts.length > 0) {
        silent = true;
        internalReasons.push(`Sait que « ${pdef.label} » est ${value ? 'vrai' : 'faux'} ; contredire coûterait : ${truthCosts.join(', ')}.`);
        continue;
      }
      if (ctx.playerKnownPropositions.has(p)) {
        publicReasons.push(`Cette version contredit ce que ${name} tient pour certain : « ${pdef.label} ».`);
      } else {
        publicReasons.push(`${name} refuse cette formulation sans vouloir s'expliquer.`);
        internalReasons.push(`Certitude non révélée au joueur : « ${pdef.label} ».`);
      }
      const claim = ctx.claimEvents.find((ev) => ev.hypothesis.propositions.includes(q));
      return decision('requests-change', claim ? slotOf(claim.hypothesis.id) : undefined);
    }
  }

  // 5. La vérité est acceptée si la confiance suffit
  const costlyClaims = ctx.claimEvents.filter((ev) => costs.some((c) => c.sourceIds.includes(ev.hypothesis.id) || ev.hypothesis.propositions.some((p) => c.sourceIds.includes(p))));
  const allCanonical = costlyClaims.length > 0 && costlyClaims.every((ev) => scenario.index.canonicalBySlot.get(ev.hypothesis.slotId) === ev.hypothesis.id);
  if (allCanonical && rule && trust >= rule.acceptsTruthIfTrustAtLeast) {
    internalReasons.push(`Version exacte sur les points coûteux ; confiance ${trust} ≥ ${rule.acceptsTruthIfTrustAtLeast}.`);
    publicReasons.push(`${name} accepte que les choses soient écrites telles qu'elles sont.`);
    return decision(silent ? 'signs-silently' : 'signs');
  }

  // 6. Coût personnel non compensé
  const total = unwaived.reduce((s, c) => s + c.amount, 0);
  const tolerance = Math.max(0, trust) + 1;
  if (total > tolerance) {
    const ext = scenario.index.characterExtensions.get(characterId);
    const labels = unwaived.map((c) => ext?.costLabels[c.key] ?? c.key);
    internalReasons.push(`Coût ${total} > tolérance ${tolerance} (${unwaived.map((c) => `${c.key}:${c.amount}`).join(', ')}).`);
    publicReasons.push(
      trust <= 0
        ? `${name} n'a pas assez confiance pour signer une version qui l'expose (${labels.join(', ')}).`
        : `${name} juge le coût personnel de cette version trop élevé (${labels.join(', ')}).`,
    );
    return decision('refuses');
  }

  if (silent) {
    publicReasons.push(`${name} n'a pas d'objection à formuler.`);
    return decision('signs-silently');
  }
  publicReasons.push(`${name} accepte de signer cette version.`);
  return decision('signs');
}

/**
 * Quand la version affirme une proposition q que le personnage sait fausse, contredire revient à
 * défendre les alternatives vraies qui excluent q : leur coût non exonéré est le prix du désaccord.
 */
function trueAlternativesCost(
  ctx: EvaluationContext,
  characterId: CharacterId,
  q: PropositionId,
  certain: Map<PropositionId, boolean>,
  waived: Set<string>,
): string[] {
  const character = ctx.scenario.index.characters.get(characterId);
  const qdef = ctx.scenario.index.propositions.get(q);
  const out: string[] = [];
  for (const [p, value] of certain) {
    if (!value) continue;
    const pdef = ctx.scenario.index.propositions.get(p);
    if (!pdef || !qdef) continue;
    if (!(pdef.excludes.includes(q) || qdef.excludes.includes(p))) continue;
    for (const key of pdef.costKeys[characterId] ?? []) if (!waived.has(key) && (character?.privateCosts[key] ?? 0) > 0) out.push(key);
  }
  return [...new Set(out)].sort();
}

export const countsAsSignature = (v: SignatureVerdict): boolean => v === 'signs' || v === 'signs-silently';
