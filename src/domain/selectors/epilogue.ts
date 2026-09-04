/**
 * Sélecteur d'épilogue : accessible uniquement après scellement. Compare version signée et faits
 * canoniques, en respectant la politique de révélation (les faits non révélés restent dans l'ombre).
 */
import type { CharacterId, ClaimSlotId, EndingId } from '../model/ids';
import type { Ending, LoadedScenario, MovementTrack } from '../model/scenario';
import type { GameState } from '../model/state';
import type { Interval } from '../model/time';
import { evaluateVersion } from '../engine/evaluate';
import { availableHypothesisIds } from '../engine/context';

export interface EpilogueSlotView {
  slotId: ClaimSlotId;
  slotLabel: string;
  chosenLabel: string | null;
  matches: boolean;
  /** Libellé de l'hypothèse canonique, seulement si elle est connue du joueur ; sinon null (ombre). */
  canonicalLabel: string | null;
}

export interface EpilogueFactView {
  id: string;
  label: string | null;
  zoneId: string | null;
  interval: Interval;
  participantIds: CharacterId[];
  revealed: boolean;
  slotLabel: string | null;
}

export interface EpilogueCharacterView {
  characterId: CharacterId;
  name: string;
  outcome: 'signed' | 'signed-silently' | 'refused' | 'requested-change';
  line: string;
  publicReasons: string[];
}

export interface EpilogueView {
  ending: Ending;
  slots: EpilogueSlotView[];
  facts: EpilogueFactView[];
  shadowCount: number;
  characters: EpilogueCharacterView[];
  canonicalAlignment: number;
  signatureCount: number;
  otherEndings: { id: EndingId; title: string; hint: string }[];
  tracks: MovementTrack[];
  omittedEvidenceLabels: string[];
}

export function selectEpilogue(scenario: LoadedScenario, state: GameState): EpilogueView | null {
  if (state.phase !== 'sealed' || !state.endingId) return null;
  const ending = scenario.index.endings.get(state.endingId);
  if (!ending) return null;
  const { evaluation } = evaluateVersion(scenario, state);
  const available = availableHypothesisIds(scenario, state.unlockedEvidenceIds);
  const established = new Set(state.establishedFactIds);
  const reported = new Set(state.reportedFactIds);

  const slots: EpilogueSlotView[] = scenario.data.claimSlots.map((slot) => {
    const claim = state.claims[slot.id];
    const canonicalId = scenario.index.canonicalBySlot.get(slot.id);
    const canonical = canonicalId ? scenario.index.hypotheses.get(canonicalId) : undefined;
    const matches = Boolean(claim && canonicalId && claim.hypothesisId === canonicalId);
    return {
      slotId: slot.id,
      slotLabel: slot.label,
      chosenLabel: claim ? (scenario.index.hypotheses.get(claim.hypothesisId)?.label ?? null) : null,
      matches,
      canonicalLabel: canonical && (matches || available.has(canonical.id)) ? canonical.label : null,
    };
  });

  const facts: EpilogueFactView[] = scenario.data.canonicalFacts
    .map((f) => {
      const revealed = f.secrecy === 'public' || established.has(f.id) || reported.has(f.id);
      const slotLabel = f.variableSlotId ? (scenario.index.slots.get(f.variableSlotId)?.label ?? null) : null;
      return {
        id: f.id,
        label: revealed ? (scenario.index.factPresentations.get(f.id)?.label ?? f.id) : null,
        zoneId: revealed ? f.zoneId : null,
        interval: f.interval,
        participantIds: revealed ? [...f.participants] : [],
        revealed,
        slotLabel,
      };
    })
    .sort((a, b) => a.interval.start - b.interval.start);

  const characters: EpilogueCharacterView[] = evaluation.adhesion.map((d) => {
    const name = scenario.index.characters.get(d.characterId)?.name ?? d.characterId;
    const ext = scenario.index.characterExtensions.get(d.characterId);
    switch (d.verdict) {
      case 'signs':
        return { characterId: d.characterId, name, outcome: 'signed', line: ext?.reactions.signs ?? `${name} a signé.`, publicReasons: d.publicReasons };
      case 'signs-silently':
        return { characterId: d.characterId, name, outcome: 'signed-silently', line: `${name} a signé sans un mot. Une part de la soirée reste entre ses mains.`, publicReasons: [] };
      case 'requests-change':
        return { characterId: d.characterId, name, outcome: 'requested-change', line: ext?.reactions.requestsChange ?? `${name} a demandé une modification.`, publicReasons: d.publicReasons };
      case 'refuses':
        return { characterId: d.characterId, name, outcome: 'refused', line: ext?.reactions.refusesBelief ?? `${name} a refusé de signer.`, publicReasons: d.publicReasons };
    }
  });

  const otherEndings = scenario.data.revealPolicy.showOtherEndingTitlesAfterEnding
    ? scenario.data.endings
        .filter((e) => e.id !== ending.id)
        .sort((a, b) => b.priority - a.priority)
        .map((e) => ({ id: e.id, title: e.title, hint: scenario.index.endingExtensions.get(e.id)?.hint ?? '' }))
    : [];

  const detached = new Set(state.detachedEvidenceIds);
  return {
    ending,
    slots,
    facts,
    shadowCount: facts.filter((f) => !f.revealed).length,
    characters,
    canonicalAlignment: evaluation.disclosure.canonicalAlignment ?? 0,
    signatureCount: evaluation.signatureCount,
    otherEndings,
    tracks: scenario.data.movementTracks,
    omittedEvidenceLabels: state.unlockedEvidenceIds.filter((id) => detached.has(id)).map((id) => scenario.index.evidence.get(id)?.label ?? id),
  };
}
