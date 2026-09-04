/** État de confiance d'un protagoniste : glyphe (décoratif) + libellé textuel. */
import { TRUST_GLYPH, type TrustLabel } from './trust';

export interface TrustMarkProps {
  trust: TrustLabel;
  /** Préfixe visible (ex. « Confiance : »). */
  prefix?: string;
}

export function TrustMark({ trust, prefix }: TrustMarkProps): React.JSX.Element {
  return (
    <span className="trust-mark" data-trust={trust}>
      {prefix ? <span className="trust-mark-prefix">{prefix}</span> : null}
      <span className="trust-mark-glyph" aria-hidden="true">
        {TRUST_GLYPH[trust]}
      </span>
      <span className="trust-mark-label">{trust}</span>
    </span>
  );
}
