import type { CharacterId, ClaimSlotId, EndingId, PropositionId } from './ids';
import type { Contradiction } from './contradiction';
import type { ClaimStatus } from './version';

export type SignatureVerdict = 'signs' | 'signs-silently' | 'refuses' | 'requests-change';

export interface SignatureDecision {
  characterId: CharacterId;
  verdict: SignatureVerdict;
  /** Raisons publiques, affichables. */
  publicReasons: string[];
  /** Raisons internes au moteur ; ne doivent jamais atteindre l'interface avant l'épilogue. */
  internalReasons: string[];
  requestedSlotId?: ClaimSlotId;
  /** Propositions de la version qui heurtent une certitude du personnage (interne). */
  conflictingPropositionIds: PropositionId[];
}

export type CoherenceStatus = 'incomplete' | 'impossible' | 'contradicted' | 'unsupported' | 'coherent';

export interface SlotEvaluation {
  slotId: ClaimSlotId;
  status: ClaimStatus | 'empty';
  supportingEvidenceIds: string[];
  contradictionIds: string[];
}

export interface VersionEvaluation {
  completeness: number;
  coherence: {
    status: CoherenceStatus;
    blocking: Contradiction[];
    notices: Contradiction[];
  };
  disclosure: {
    establishedExplained: number;
    explainedEvidenceIds: string[];
    unexplainedEvidenceIds: string[];
    canonicalAlignment: number | null;
  };
  adhesion: SignatureDecision[];
  signatureCount: number;
  reachableEndingIds: EndingId[];
  slots: SlotEvaluation[];
  /** Toutes les contradictions calculées (version + témoignages). */
  contradictions: Contradiction[];
  /** Contradictions motivationnelles (adhésion), présentées séparément. */
  motivational: Contradiction[];
}
