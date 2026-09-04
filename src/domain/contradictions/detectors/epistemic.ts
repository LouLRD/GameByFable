/**
 * Détecteur épistémique : une déclaration affirme-t-elle quelque chose que son auteur
 * ne pouvait pas savoir (aucun chemin de connaissance connu du joueur) ?
 * N'utilise que ce que le joueur peut savoir : jamais de perception non révélée.
 */
import type { Contradiction, ContradictionDetector } from '../../model/contradiction';
import type { EvaluationContext } from '../../engine/context';
import { knowledgePath } from '../../knowledge/knowledge';
import { characterName, makeContradiction, relatedEvidence } from '../common';

const RULE = 'r_knowledge_provenance';

export const epistemicDetector: ContradictionDetector & {
  detect(ctx: EvaluationContext): Contradiction[];
} = {
  id: 'epistemic',
  detect(ctx: EvaluationContext): Contradiction[] {
    const out: Contradiction[] = [];
    for (const s of ctx.standingStatements) {
      const def = ctx.scenario.index.propositions.get(s.propositionId);
      if (!def) continue;
      const path = knowledgePath(ctx.scenario, ctx.state, s.speakerId, def, 'player');
      if (path.status === 'self' || path.status === 'full') continue;
      const name = characterName(ctx.scenario, s.speakerId);
      out.push(
        makeContradiction({
          kind: 'epistemic',
          severity: path.status === 'none' ? 'notice' : 'notice',
          title:
            path.status === 'none'
              ? `Provenance non établie : ${name}`
              : `Provenance partielle : ${name}`,
          ruleId: RULE,
          involvedIds: [s.id, s.speakerId],
          explanation: [
            { type: 'statement', statementId: s.id, speakerId: s.speakerId },
            {
              type: 'knowledge-gap',
              characterId: s.speakerId,
              missingTags: path.missingTags,
              availableTags: path.availableTags,
            },
            {
              type: 'conclusion',
              text:
                path.status === 'none'
                  ? `Rien dans le dossier n'explique comment ${name} a pu savoir cela : la déclaration repose sur une source non identifiée.`
                  : `${name} disposait d'une perception partielle : une partie de la déclaration va au-delà de ce qui a été perçu.`,
            },
          ],
          suggestedEvidenceIds: relatedEvidence(ctx, [def.id]),
          involvesVersion: false,
        }),
      );
    }
    return out;
  },
};
