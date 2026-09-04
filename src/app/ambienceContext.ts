/**
 * Contexte de l'ambiance sonore : une seule instance `Ambience` pour l'application, exposée par
 * `AmbienceProvider`. Sans fournisseur (tests isolés), la valeur inerte ne fait rien.
 */
import { createContext, useContext, useEffect, useRef } from 'react';
import type { AudioCue } from '@/audio';
import type { PlayerView } from '@/domain/selectors/playerView';
import { useGameStore } from '@/state';

export interface Subtitle {
  text: string;
  nonce: number;
}

export interface AmbienceContextValue {
  /** Web Audio disponible dans cet environnement. */
  supported: boolean;
  /** Nappe sonore en cours. */
  enabled: boolean;
  /** Dernier sous-titre publié (effacé après `SUBTITLE_DURATION_MS`). */
  subtitle: Subtitle | null;
  /** À appeler depuis un gestionnaire d'événement utilisateur. Résout l'état effectif. */
  setEnabled: (on: boolean) => Promise<boolean>;
  toggle: () => Promise<boolean>;
  playCue: (cue: AudioCue) => void;
}

export const SUBTITLE_DURATION_MS = 3000;

export const INERT_AMBIENCE: AmbienceContextValue = {
  supported: false,
  enabled: false,
  subtitle: null,
  setEnabled: () => Promise.resolve(false),
  toggle: () => Promise.resolve(false),
  playCue: () => undefined,
};

export const AmbienceContext = createContext<AmbienceContextValue>(INERT_AMBIENCE);

export function useAmbience(): AmbienceContextValue {
  return useContext(AmbienceContext);
}

/**
 * Cues déclenchés par l'état du jeu : 'reveal' après une confrontation acceptée, 'till' quand une
 * hypothèse est posée, 'crack' quand le nombre de contradictions bloquantes augmente, 'seal' au
 * scellement. Doit vivre dans un composant qui reste monté pendant l'épilogue.
 */
export function useAmbienceCues(view: PlayerView | null): void {
  const { playCue } = useAmbience();
  const actionNonce = useGameStore((s) => s.actionNonce);
  const lastActionType = useGameStore((s) => s.lastActionType);
  const blocking = view?.version.blockingIds.length ?? 0;
  const sealed = view?.isSealed ?? false;
  const previous = useRef({ actionNonce, blocking, sealed });
  useEffect(() => {
    const prev = previous.current;
    if (actionNonce !== prev.actionNonce) {
      if (lastActionType === 'confront') playCue('reveal');
      else if (lastActionType === 'set-claim') playCue('till');
    }
    if (blocking > prev.blocking) playCue('crack');
    if (sealed && !prev.sealed) playCue('seal');
    previous.current = { actionNonce, blocking, sealed };
  }, [actionNonce, lastActionType, blocking, sealed, playCue]);
}
