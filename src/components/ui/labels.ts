/** Libellés partagés des degrés, statuts, sévérités et genres de contradiction. */
import type { Degree } from '@/domain/selectors/playerView';
import type { Severity } from '@/domain/model/contradiction';
import type { ClaimStatus } from '@/domain/model/version';

export const DEGREE_LABELS: Record<Degree | 'unknown', string> = {
  established: 'établi',
  reported: 'rapporté',
  deduced: 'déduit',
  proposed: 'proposé',
  unknown: 'inconnu',
};

export const STATUS_LABELS: Record<ClaimStatus | 'empty', string> = {
  unknown: 'inconnu',
  unsupported: 'non étayé',
  supported: 'étayé',
  contradicted: 'contredit',
  impossible: 'impossible',
  empty: 'vide',
};

export const SEVERITY_LABELS: Record<Severity, string> = {
  notice: 'remarque',
  major: 'majeure',
  critical: 'critique',
};

export const KIND_LABELS: Record<string, string> = {
  physical: 'physique',
  temporal: 'temporelle',
  sensory: 'sensorielle',
  material: 'matérielle',
  epistemic: 'épistémique',
  discursive: 'discursive',
  motivational: 'motivationnelle',
};

