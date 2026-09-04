/**
 * Détecteur discursif : la version contredit une déclaration debout, ou deux déclarations
 * debout sont incompatibles entre elles. Une déclaration déjà discréditée par une trace
 * jointe (ou physiquement impossible) ne bloque plus la version : la contradiction devient une note.
 */
import type {
  Contradiction,
  ContradictionDetector,
  ExplanationStep,
} from '../../model/contradiction';
import type { EvaluationContext } from '../../engine/context';
import { canOccupy, presencesFromSemantics } from '../../engine/positions';
import type { Statement } from '../../model/scenario';
import {
  characterName,
  claimsWithPropositions,
  makeContradiction,
  propositionsConflict,
  relatedEvidence,
} from '../common';

const RULE = 'r_statement_conflict';

/** Pièces jointes qui discréditent la déclaration (exclusion directe ou support d'une proposition incompatible). */
function discreditedBy(ctx: EvaluationContext, s: Statement): string[] {
  const def = ctx.scenario.index.propositions.get(s.propositionId);
  if (!def) return [];
  const by: string[] = [];
  for (const e of ctx.attachedEvidence) {
    if (e.excludes.includes(def.id)) by.push(e.id);
    else if (e.supports.some((p) => def.excludes.includes(p))) by.push(e.id);
  }
  // Impossibilité physique établie
  for (const seg of presencesFromSemantics(def.semantics, s.id, s.speakerId)) {
    const occ = canOccupy(
      seg.characterId,
      seg.zoneId,
      seg.interval,
      ctx.positions,
      ctx.scenario,
      ctx.world,
      [s.id],
    );
    if (occ.status === 'impossible')
      by.push(...occ.conflicts.flatMap((c) => c.segment?.sourceIds ?? [ctx.cameraEvidenceId]));
  }
  return [...new Set(by)];
}

export const discursiveDetector: ContradictionDetector & {
  detect(ctx: EvaluationContext): Contradiction[];
} = {
  id: 'discursive',
  detect(ctx: EvaluationContext): Contradiction[] {
    const out: Contradiction[] = [];
    // 1. Version vs déclarations debout
    for (const s of ctx.standingStatements) {
      const sdef = ctx.scenario.index.propositions.get(s.propositionId);
      if (!sdef) continue;
      const discredit = discreditedBy(ctx, s);
      for (const q of ctx.versionPropositions) {
        const qdef = ctx.scenario.index.propositions.get(q);
        if (!qdef) continue;
        const reason = propositionsConflict(sdef, qdef);
        if (!reason) continue;
        for (const claim of claimsWithPropositions(ctx, [q])) {
          const name = characterName(ctx.scenario, s.speakerId);
          const steps: ExplanationStep[] = [
            { type: 'statement', statementId: s.id, speakerId: s.speakerId },
            {
              type: 'claim',
              hypothesisId: claim.hypothesis.id,
              ...(claim.actorId ? { actorId: claim.actorId } : {}),
              ...(claim.zoneId ? { zoneId: claim.zoneId } : {}),
              ...(claim.interval ? { interval: claim.interval } : {}),
            },
            { type: 'proposition-conflict', a: sdef.id, b: qdef.id, reason },
          ];
          if (discredit.length > 0)
            steps.push({ type: 'discredited', statementId: s.id, byIds: discredit });
          steps.push({
            type: 'conclusion',
            text:
              discredit.length > 0
                ? `La déclaration de ${name} est déjà contredite par le dossier : elle n'empêche pas la version, mais rappelle qu'elle n'a pas été rectifiée.`
                : `La version affirme le contraire de ce que ${name} maintient. Un témoignage peut être faux, mais tant qu'il tient, la version reste contestée.`,
          });
          out.push(
            makeContradiction({
              kind: 'discursive',
              severity: discredit.length > 0 ? 'notice' : 'major',
              title: `Contredit la déclaration de ${name}`,
              ruleId: RULE,
              involvedIds: [s.id, claim.hypothesis.id, s.speakerId],
              slotIds: [claim.hypothesis.slotId],
              explanation: steps,
              suggestedEvidenceIds: [
                ...relatedEvidence(ctx, [sdef.id, qdef.id]),
                ...(discredit.filter((d) =>
                  ctx.scenario.index.evidence.has(d as never),
                ) as never[]),
              ],
              involvesVersion: true,
            }),
          );
        }
      }
      // Claims paramétrées plaçant le locuteur ailleurs que sa déclaration (sans exclusion explicite)
      for (const ev of ctx.claimEvents) {
        if (ev.presence?.characterId !== s.speakerId) continue;
        const occ = canOccupy(
          ev.presence.characterId,
          ev.presence.zoneId,
          ev.presence.interval,
          ctx.positions,
          ctx.scenario,
          ctx.world,
          [ev.hypothesis.id],
        );
        if (occ.status !== 'reported-elsewhere') continue;
        for (const c of occ.conflicts) {
          if (c.segment?.sourceIds[0] !== s.id) continue;
          const name = characterName(ctx.scenario, s.speakerId);
          out.push(
            makeContradiction({
              kind: 'discursive',
              severity: discredit.length > 0 ? 'notice' : 'major',
              title: `${name} déclare avoir été ailleurs`,
              ruleId: RULE,
              involvedIds: [s.id, ev.hypothesis.id, s.speakerId],
              slotIds: [ev.hypothesis.slotId],
              explanation: [
                {
                  type: 'claim',
                  hypothesisId: ev.hypothesis.id,
                  actorId: ev.presence.characterId,
                  zoneId: ev.presence.zoneId,
                  interval: ev.presence.interval,
                },
                ...c.steps,
                ...(discredit.length > 0
                  ? [
                      {
                        type: 'discredited',
                        statementId: s.id,
                        byIds: discredit,
                      } as ExplanationStep,
                    ]
                  : []),
                {
                  type: 'conclusion',
                  text: `L'hypothèse place ${name} là où sa déclaration dit qu'iel n'était pas. Tant que la déclaration tient, la version est contestée.`,
                },
              ],
              inspectableAt: c.at,
              inspectableZoneIds: c.zoneIds,
              suggestedEvidenceIds: relatedEvidence(ctx, [sdef.id]),
              involvesVersion: true,
            }),
          );
        }
      }
    }
    // 2. Déclarations debout entre elles
    const standing = ctx.standingStatements;
    for (let i = 0; i < standing.length; i += 1) {
      for (let j = i + 1; j < standing.length; j += 1) {
        const a = standing[i];
        const b = standing[j];
        if (!a || !b) continue;
        const da = ctx.scenario.index.propositions.get(a.propositionId);
        const db = ctx.scenario.index.propositions.get(b.propositionId);
        if (!da || !db) continue;
        const reason = propositionsConflict(da, db);
        if (!reason) continue;
        const na = characterName(ctx.scenario, a.speakerId);
        const nb = characterName(ctx.scenario, b.speakerId);
        out.push(
          makeContradiction({
            kind: 'discursive',
            severity: 'notice',
            title:
              a.speakerId === b.speakerId
                ? `${na} se contredit`
                : `Témoignages incompatibles : ${na} / ${nb}`,
            ruleId: RULE,
            involvedIds: [a.id, b.id, a.speakerId, b.speakerId],
            explanation: [
              { type: 'statement', statementId: a.id, speakerId: a.speakerId },
              { type: 'statement', statementId: b.id, speakerId: b.speakerId },
              { type: 'proposition-conflict', a: da.id, b: db.id, reason },
              {
                type: 'conclusion',
                text: `Les deux déclarations ne peuvent pas être vraies ensemble. Au moins l'une des deux personnes se trompe ou ment — pas nécessairement pour la même raison.`,
              },
            ],
            suggestedEvidenceIds: relatedEvidence(ctx, [da.id, db.id]),
            involvesVersion: false,
          }),
        );
      }
    }
    return out;
  },
};
