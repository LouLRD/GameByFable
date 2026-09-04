/**
 * Pile de notifications (`toasts` du store) : fermables, disparition automatique après 6 s sauf
 * pour les erreurs, qui restent jusqu'à fermeture et sont annoncées en `role="alert"`.
 */
import { useEffect } from 'react';
import { useGameStore } from '@/state';
import type { Toast } from '@/state/types';

export const TOAST_DURATION_MS = 6000;

const TONE_GLYPH: Record<Toast['tone'], string> = { info: 'i', success: '✓', error: '✕' };
const TONE_LABEL: Record<Toast['tone'], string> = { info: 'Information', success: 'Succès', error: 'Erreur' };

export function Toasts(): React.JSX.Element {
  const toasts = useGameStore((s) => s.toasts);
  return (
    <div className="toasts" aria-label="Notifications">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}

function ToastItem({ toast }: { toast: Toast }): React.JSX.Element {
  useEffect(() => {
    if (toast.tone === 'error') return;
    const id = window.setTimeout(() => useGameStore.getState().dismissToast(toast.id), TOAST_DURATION_MS);
    return () => window.clearTimeout(id);
  }, [toast.id, toast.tone]);
  return (
    <div className="toast anim-slide-up" data-tone={toast.tone} role={toast.tone === 'error' ? 'alert' : 'status'}>
      <span className="toast-glyph" aria-hidden="true">
        {TONE_GLYPH[toast.tone]}
      </span>
      <p className="toast-text">
        <span className="visually-hidden">{TONE_LABEL[toast.tone]} :</span> {toast.text}
      </p>
      <button
        type="button"
        className="btn btn-ghost toast-close"
        onClick={() => useGameStore.getState().dismissToast(toast.id)}
        aria-label="Fermer la notification"
      >
        ×
      </button>
    </div>
  );
}
