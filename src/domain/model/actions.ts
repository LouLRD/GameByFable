import type {
  CharacterId,
  ClaimSlotId,
  EvidenceId,
  HypothesisId,
  OnboardingId,
  ZoneId,
} from './ids';
import type { Approach } from './scenario';
import type { Interval } from './time';

export type PlayerAction =
  | {
      type: 'set-claim';
      slotId: ClaimSlotId;
      hypothesisId: HypothesisId;
      actorId?: CharacterId;
      zoneId?: ZoneId;
      interval?: Interval;
    }
  | { type: 'clear-claim'; slotId: ClaimSlotId }
  | { type: 'set-evidence-attached'; evidenceId: EvidenceId; attached: boolean }
  | {
      type: 'confront';
      characterId: CharacterId;
      targetId: string;
      supportId?: string;
      approach: Approach;
    }
  | { type: 'probe'; characterId: CharacterId; targetId: string; approach: Approach }
  | { type: 'request-round-table' }
  | { type: 'leave-round-table' }
  | { type: 'seal-report' }
  | { type: 'dismiss-onboarding'; onboardingId: OnboardingId };

export type ActionErrorCode =
  | 'sealed'
  | 'unknown-slot'
  | 'unknown-hypothesis'
  | 'hypothesis-locked'
  | 'hypothesis-slot-mismatch'
  | 'actor-required'
  | 'unknown-actor'
  | 'unknown-zone'
  | 'invalid-interval'
  | 'unknown-evidence'
  | 'evidence-locked'
  | 'evidence-mandatory'
  | 'unknown-character'
  | 'unknown-target'
  | 'target-locked'
  | 'support-locked'
  | 'no-matching-confrontation'
  | 'confrontation-already-resolved'
  | 'insufficient-pressure'
  | 'insufficient-trust'
  | 'round-table-unavailable'
  | 'not-at-round-table'
  | 'version-incomplete'
  | 'unknown-onboarding';

export interface ActionError {
  code: ActionErrorCode;
  message: string;
  details?: Record<string, string | number | boolean>;
}

export type ActionResult<S> = { ok: true; state: S } | { ok: false; error: ActionError; state: S };
