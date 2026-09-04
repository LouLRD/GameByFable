/**
 * Badges de degré, de statut et de sévérité : icône (glyphe) + libellé + texture CSS.
 * Jamais la couleur seule (GDD §6.1, §13).
 */
import type { Degree } from '@/domain/selectors/playerView';
import type { Severity } from '@/domain/model/contradiction';
import type { ClaimStatus } from '@/domain/model/version';
import { DEGREE_LABELS, KIND_LABELS, SEVERITY_LABELS, STATUS_LABELS } from './labels';

export function DegreeBadge({ degree }: { degree: Degree | 'unknown' }): React.JSX.Element {
  return (
    <span className={`badge degree-${degree}`} data-degree={degree}>
      <span className="degree-label">{DEGREE_LABELS[degree]}</span>
    </span>
  );
}

export function StatusBadge({ status }: { status: ClaimStatus | 'empty' }): React.JSX.Element {
  return (
    <span
      className={`badge status-${status === 'empty' ? 'unknown' : status}`}
      data-status={status}
    >
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
