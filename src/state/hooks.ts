/**
 * Hooks dérivés : vue joueur mémoïsée (aucun recalcul du moteur quand seul le curseur bouge).
 */
import { useMemo } from 'react';
import { useGameStore } from './store';
import { selectPlayerView, type PlayerView } from '@/domain/selectors/playerView';
import { selectEpilogue, type EpilogueView } from '@/domain/selectors/epilogue';
import { evaluateVersion, type FullEvaluation } from '@/domain/engine/evaluate';

export function usePlayerView(): PlayerView | null {
  const scenario = useGameStore((s) => s.scenario);
  const game = useGameStore((s) => s.game);
  const selectedId = useGameStore((s) => s.selection?.id ?? null);
  return useMemo(
    () => (scenario && game ? selectPlayerView(scenario, game, { selectedId }) : null),
    [scenario, game, selectedId],
  );
}

export function useEvaluation(): FullEvaluation | null {
  const scenario = useGameStore((s) => s.scenario);
  const game = useGameStore((s) => s.game);
  return useMemo(
    () => (scenario && game ? evaluateVersion(scenario, game) : null),
    [scenario, game],
  );
}

export function useEpilogue(): EpilogueView | null {
  const scenario = useGameStore((s) => s.scenario);
  const game = useGameStore((s) => s.game);
  return useMemo(
    () => (scenario && game ? selectEpilogue(scenario, game) : null),
    [scenario, game],
  );
}

/** Mouvement réduit effectif : préférence explicite ou média système. */
export function useReducedMotion(): boolean {
  const pref = useGameStore((s) => s.prefs.reducedMotion);
  if (pref === 'on') return true;
  if (pref === 'off') return false;
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}
