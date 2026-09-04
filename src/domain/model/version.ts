import type { CharacterId, ClaimSlotId, EvidenceId, HypothesisId, ZoneId } from './ids';
import type { Interval } from './time';

/** Hypothèse placée par le joueur dans un emplacement du canevas. */
export interface PlayerClaim {
  slotId: ClaimSlotId;
  hypothesisId: HypothesisId;
  actorId?: CharacterId;
  zoneId?: ZoneId;
  interval?: Interval;
}

/** Version proposée : claims + pièces jointes au rapport. */
export interface ProposedVersion {
  claims: Readonly<Record<string, PlayerClaim>>;
  /** Pièces débloquées que le joueur a retirées du rapport. */
  detachedEvidenceIds: readonly EvidenceId[];
}

export type ClaimStatus = 'unknown' | 'unsupported' | 'supported' | 'contradicted' | 'impossible';
