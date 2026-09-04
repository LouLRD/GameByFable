/**
 * Détecteur sensoriel : une perception revendiquée (déclaration) est-elle accessible ?
 * - visuel : ligne de vue, occlusions, lumière, identité revendiquée ;
 * - audio  : la source sonore proposée par la version est-elle audible, avec la bonne signature, au bon moment ?
 */
import type { Contradiction, ContradictionDetector, ExplanationStep } from '../../model/contradiction';
import type { EvaluationContext } from '../../engine/context';
import { canOccupy, positionAt } from '../../engine/positions';
import { canSee, hearSignal, sharedTags } from '../../engine/spatial';
import { intervalsOverlap, interval, sec } from '../../model/time';
import type { ZoneId } from '../../model/ids';
import { characterName, makeContradiction, relatedEvidence, zoneLabel } from '../common';

const RULE_SIGHT = 'r_line_of_sight';
const RULE_SOUND = 'r_sound_signature';
const TIMING_TOLERANCE = 30;

function observerZone(ctx: EvaluationContext, observerId: string, fallback: ZoneId | undefined, at: number): ZoneId | null {
  if (fallback) return fallback;
  const pos = positionAt(ctx.positions, observerId as never, at);
  return pos?.zoneId ?? null;
}

export const sensoryDetector: ContradictionDetector & { detect(ctx: EvaluationContext): Contradiction[] } = {
  id: 'sensory',
  detect(ctx: EvaluationContext): Contradiction[] {
    const out: Contradiction[] = [];
    const soundClaims = ctx.claimEvents.filter((ev) => ev.extension?.worldEffect?.type === 'sound' && ev.zoneId && ev.interval);

    for (const s of ctx.standingStatements) {
      const def = ctx.scenario.index.propositions.get(s.propositionId);
      if (def?.semantics.type !== 'perceived') continue;
      const sem = def.semantics;
      const mid = (sem.target.interval.start + sem.target.interval.end) / 2;
      const from = observerZone(ctx, sem.observerId, sem.observerZoneId, mid);
      const observerName = characterName(ctx.scenario, sem.observerId);
      if (!from) continue; // point de vue inconnu : rien à conclure

      if (sem.modality === 'visual') {
        const sight = canSee(from, sem.target.zoneId, mid, ctx.scenario, ctx.world);
        const steps: ExplanationStep[] = [
          { type: 'statement', statementId: s.id, speakerId: s.speakerId },
          { type: 'sight', observer: sem.observerId, from, to: sem.target.zoneId, at: sec(mid), quality: sight.quality, via: sight.via, ...(sight.blockedBy ? { occludedBy: sight.blockedBy } : sight.occludedBy[0] ? { occludedBy: sight.occludedBy[0] } : {}) },
        ];
        let severity: 'notice' | 'major' | null = null;
        let title = '';
        if (sight.fidelity === 'none') {
          severity = 'major';
          title = `${observerName} ne pouvait pas voir ${zoneLabel(ctx.scenario, sem.target.zoneId)}`;
          steps.push({ type: 'conclusion', text: `Aucune ligne de vue n'atteint la zone depuis ${zoneLabel(ctx.scenario, from)} à cet instant.` });
        } else if (sem.target.identityClaimed && sight.fidelity !== 'exact') {
          severity = sight.fidelity === 'partial' ? 'notice' : 'major';
          title = `Identification incertaine depuis ${zoneLabel(ctx.scenario, from)}`;
          steps.push({
            type: 'conclusion',
            text:
              sight.fidelity === 'partial'
                ? `La vue n'est que partielle : une silhouette, une couleur ou une direction restent perceptibles, mais l'identité revendiquée n'est pas garantie.`
                : `La vue est trop dégradée pour reconnaître quelqu'un : la déclaration attribue une identité que la perception ne pouvait pas fournir.`,
          });
        }
        // La cible était-elle là ?
        if (sem.target.characterId) {
          const occ = canOccupy(sem.target.characterId, sem.target.zoneId, sem.target.interval, ctx.positions, ctx.scenario, ctx.world, [s.id]);
          if (occ.status === 'impossible') {
            severity = 'major';
            title = title || `${observerName} n'a pas pu voir ${characterName(ctx.scenario, sem.target.characterId)} à ${zoneLabel(ctx.scenario, sem.target.zoneId)}`;
            for (const c of occ.conflicts) steps.push(...c.steps);
            steps.push({ type: 'conclusion', text: `${characterName(ctx.scenario, sem.target.characterId)} est établi·e ailleurs : ce qui a été vu ne pouvait pas être cette personne.` });
          } else if (occ.status === 'reported-elsewhere' && severity === null) {
            severity = 'notice';
            title = `Perception de ${observerName} contredite par une déclaration`;
            for (const c of occ.conflicts) steps.push(...c.steps);
            steps.push({ type: 'conclusion', text: `La personne désignée déclare avoir été ailleurs : perception et témoignage divergent.` });
          }
        }
        if (severity) {
          out.push(
            makeContradiction({
              kind: 'sensory',
              severity,
              title,
              ruleId: RULE_SIGHT,
              involvedIds: [s.id, sem.observerId, ...(sem.target.characterId ? [sem.target.characterId] : [])],
              explanation: steps,
              inspectableAt: mid,
              inspectableZoneIds: [from, sem.target.zoneId],
              suggestedEvidenceIds: [...relatedEvidence(ctx, [def.id]), ...(sight.occludedBy.length > 0 || sight.blockedBy ? ctx.unlockedEvidence.filter((e) => ctx.scenario.data.obstructions.some((o) => o.publicAfterEvidenceId === e.id)).map((e) => e.id) : [])],
              involvesVersion: false,
            }),
          );
        }
      }

      const soundTags = sem.modality === 'audio' ? sem.target.claimedTags : (sem.target.soundTags ?? []);
      if (soundTags.length > 0) {
        for (const ev of soundClaims) {
          const effect = ev.extension?.worldEffect;
          if (effect?.type !== 'sound' || !ev.zoneId || !ev.interval) continue;
          const at = (ev.interval.start + ev.interval.end) / 2;
          const heard = hearSignal(from, { originZoneId: ev.zoneId, intensity: effect.intensity, signatureTags: effect.signatureTags }, at, ctx.scenario, ctx.world);
          const steps: ExplanationStep[] = [
            { type: 'claim', hypothesisId: ev.hypothesis.id, zoneId: ev.zoneId, interval: ev.interval, ...(ev.actorId ? { actorId: ev.actorId } : {}) },
            { type: 'statement', statementId: s.id, speakerId: s.speakerId },
            { type: 'sound', from: ev.zoneId, to: from, intensity: heard.intensity, via: heard.via, threshold: 0.06 },
          ];
          const problems: string[] = [];
          let severity: 'major' | 'critical' | null = null;
          if (heard.fidelity === 'none') {
            severity = 'critical';
            problems.push(`Le son proposé n'est pas audible depuis ${zoneLabel(ctx.scenario, from)} : intensité perçue ${heard.intensity.toFixed(2)}.`);
          }
          const shared = sharedTags(effect.signatureTags, soundTags);
          if (shared.length / soundTags.length < 0.5) {
            severity = severity ?? 'major';
            steps.push({ type: 'signature-mismatch', expected: soundTags, claimed: effect.signatureTags, shared });
            problems.push(`La signature du son proposé ne correspond pas à ce que ${observerName} décrit.`);
          }
          const tolerant = interval(ev.interval.start - TIMING_TOLERANCE, ev.interval.end + TIMING_TOLERANCE);
          if (!intervalsOverlap(tolerant, sem.target.interval)) {
            severity = severity ?? 'major';
            steps.push({ type: 'timing-mismatch', expected: sem.target.interval, claimed: ev.interval });
            problems.push(`Le moment proposé ne coïncide pas avec le bruit décrit.`);
          }
          if (!severity) continue;
          steps.push({ type: 'conclusion', text: problems.join(' ') });
          out.push(
            makeContradiction({
              kind: 'sensory',
              severity,
              title: heard.fidelity === 'none' ? `Son inaudible depuis ${zoneLabel(ctx.scenario, from)}` : `Le bruit proposé ne correspond pas à la perception de ${observerName}`,
              ruleId: RULE_SOUND,
              involvedIds: [ev.hypothesis.id, s.id, sem.observerId],
              slotIds: [ev.hypothesis.slotId],
              explanation: steps,
              inspectableAt: at,
              inspectableZoneIds: [ev.zoneId, from],
              suggestedEvidenceIds: relatedEvidence(ctx, ev.hypothesis.propositions),
              involvesVersion: true,
            }),
          );
        }
      }
    }
    return out;
  },
};
