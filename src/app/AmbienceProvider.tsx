/**
 * Ambiance sonore (GDD §14). Le son ne démarre JAMAIS sans un clic explicite (`setEnabled(true)`
 * depuis un gestionnaire d'événement) ; la préférence `prefs.audioEnabled` est mémorisée mais ne
 * sert qu'à proposer la reprise. Les sous-titres descriptifs sont toujours publiés, son actif ou non.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createAmbience, type Ambience, type AudioCue } from '@/audio';
import { useGameStore } from '@/state';
import { AmbienceContext, SUBTITLE_DURATION_MS, useAmbience, type AmbienceContextValue, type Subtitle } from './ambienceContext';

export function AmbienceProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const instance = useRef<Ambience | null>(null);
  const getAmbience = useCallback((): Ambience => {
    instance.current ??= createAmbience();
    return instance.current;
  }, []);
  const [enabled, setEnabledState] = useState(false);
  const [supported, setSupported] = useState(() => typeof globalThis.AudioContext === 'function');
  const [subtitle, setSubtitle] = useState<Subtitle | null>(null);

  useEffect(() => {
    const ambience = getAmbience();
    let nonce = 0;
    const unsubscribe = ambience.onSubtitle((e) => {
      nonce += 1;
      setSubtitle({ text: e.text, nonce });
    });
    return () => {
      unsubscribe();
      ambience.dispose();
      instance.current = null;
    };
  }, [getAmbience]);

  useEffect(() => {
    if (!subtitle) return;
    const id = window.setTimeout(() => {
      setSubtitle((current) => (current?.nonce === subtitle.nonce ? null : current));
    }, SUBTITLE_DURATION_MS);
    return () => window.clearTimeout(id);
  }, [subtitle]);

  const setEnabled = useCallback(
    async (on: boolean): Promise<boolean> => {
      const ambience = getAmbience();
      const store = useGameStore.getState();
      if (!on) {
        ambience.disable();
        setEnabledState(false);
        store.setPref('audioEnabled', false);
        store.announce('Ambiance sonore coupée. Les sous-titres restent affichés.');
        return false;
      }
      const ok = await ambience.enable();
      setSupported(ambience.isSupported());
      setEnabledState(ok);
      store.setPref('audioEnabled', ok);
      store.announce(
        ok
          ? 'Ambiance sonore activée.'
          : 'Le son n’est pas disponible dans ce navigateur ; les sous-titres restent affichés.',
      );
      return ok;
    },
    [getAmbience],
  );

  const toggle = useCallback(() => setEnabled(!getAmbience().isEnabled()), [setEnabled, getAmbience]);
  const playCue = useCallback((cue: AudioCue) => getAmbience().playCue(cue), [getAmbience]);

  const value = useMemo<AmbienceContextValue>(
    () => ({ supported, enabled, subtitle, setEnabled, toggle, playCue }),
    [supported, enabled, subtitle, setEnabled, toggle, playCue],
  );
  return <AmbienceContext.Provider value={value}>{children}</AmbienceContext.Provider>;
}

/** Région discrète des sous-titres descriptifs : toujours présente, son actif ou non. */
export function Subtitles(): React.JSX.Element {
  const { subtitle } = useAmbience();
  return (
    <div className="subtitles" role="status" aria-live="polite" aria-atomic="true" aria-label="Sous-titres des sons">
      {subtitle ? <span className="subtitles-text">{subtitle.text}</span> : null}
    </div>
  );
}
