/**
 * Région aria-live du bureau, alimentée par `announce()` du store. L'élément interne est
 * re-créé à chaque `liveNonce` pour qu'un message identique soit relu par les lecteurs d'écran.
 */
import { useGameStore } from '@/state';

export function LiveRegion(): React.JSX.Element {
  const message = useGameStore((s) => s.liveMessage);
  const nonce = useGameStore((s) => s.liveNonce);
  return (
    <div
      className="visually-hidden"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-testid="live-region"
    >
      <span key={nonce}>{message}</span>
    </div>
  );
}
