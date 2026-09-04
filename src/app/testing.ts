/**
 * Aides de test pour la coquille (jsdom) : remise à zéro du store singleton et simulation de la
 * largeur d'écran (`matchMedia` n'existe pas dans jsdom).
 */
import { useGameStore } from '@/state';

export function resetStore(): void {
  window.localStorage.clear();
  const s = useGameStore.getState();
  s.bootstrap();
  useGameStore.setState({
    dialog: null,
    toasts: [],
    focusPanel: null,
    activeSpace: 'casefile',
    inspectorTab: 'version',
    impasseCount: 0,
    selection: null,
    cursor: 0,
    playing: false,
    liveMessage: '',
    prefs: {
      reducedMotion: 'system',
      textSize: 'm',
      hintsEnabled: true,
      audioEnabled: false,
      seenIntro: true,
    },
  });
}

export function stubViewport(width: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });
  const matchMedia = (query: string): MediaQueryList => {
    const minWidth = /min-width:\s*(\d+)px/.exec(query);
    const maxWidth = /max-width:\s*(\d+)px/.exec(query);
    let matches = false;
    if (minWidth?.[1]) matches = width >= Number(minWidth[1]);
    else if (maxWidth?.[1]) matches = width <= Number(maxWidth[1]);
    return {
      matches,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    };
  };
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: matchMedia,
  });
}

/** Première hypothèse posable dès le départ sans acteur (pour produire une action journalisée). */
export function firstClaimAction(): { type: 'set-claim'; slotId: string; hypothesisId: string } {
  const scenario = useGameStore.getState().scenario;
  const hypothesis = scenario?.data.hypotheses.find((h) => h.availableAtStart && !h.requiresActor);
  if (!hypothesis) throw new Error('Aucune hypothèse initiale sans acteur dans le scénario.');
  return { type: 'set-claim', slotId: hypothesis.slotId, hypothesisId: hypothesis.id };
}
