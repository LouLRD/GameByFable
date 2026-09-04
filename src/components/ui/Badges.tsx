/**
 * Badges de degré, de statut et de sévérité : icône (glyphe) + libellé + texture CSS.
 * Jamais la couleur seule (GDD §6.1, §13).
 */
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

export function DegreeBadge({ degree }: { degree: Degree | 'unknown' }): React.JSX.Element {
  return (
    <span className={`badge degree-${degree}`} data-degree={degree}>
      <span className="degree-label">{DEGREE_LABELS[degree]}</span>
    </span>
  );
}

export function StatusBadge({ status }: { status: ClaimStatus | 'empty' }): React.JSX.Element {
  return (
    <span className={`badge status-${status === 'empty' ? 'unknown' : status}`} data-status={status}>
      <span className="status-label">{STATUS_LABELS[status]}</span>
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: Severity }): React.JSX.Element {
  return (
    <span className={`badge severity-${severity}`} data-severity={severity}>
      <span className="severity-label">{SEVERITY_LABELS[severity]}</span>
    </span>
  );
}

export function KindBadge({ kind }: { kind: string }): React.JSX.Element {
  return (
    <span className="tag" data-kind={kind}>
      {KIND_LABELS[kind] ?? kind}
    </span>
  );
}
