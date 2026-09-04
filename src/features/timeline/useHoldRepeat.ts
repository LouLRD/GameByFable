/**
 * Appui long à répétition (mode compact) : un bouton maintenu plus de `HOLD_DELAY_MS`
 * déclenche `action` puis la répète toutes les `HOLD_INTERVAL_MS` ; relâcher, annuler ou quitter
 * le bouton arrête la répétition. Un appui bref déclenche `action` une seule fois (via le clic) ;
 * le clic qui suit un appui long est ignoré pour éviter un double déclenchement. Le relâchement est
 * aussi écouté sur `window` : un bouton devenu inactif pendant l'appui ne reçoit plus le pointeur.
 */
import { useEffect, useMemo, useState, type MouseEvent, type PointerEvent } from 'react';

export const HOLD_DELAY_MS = 500;
export const HOLD_INTERVAL_MS = 120;

export interface HoldRepeatHandlers {
  onPointerDown: (e: PointerEvent<HTMLElement>) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onPointerLeave: () => void;
  onClick: (e: MouseEvent<HTMLElement>) => void;
  onContextMenu: (e: MouseEvent<HTMLElement>) => void;
}

export interface HoldRepeat {
  /** Gestionnaires à étaler sur le bouton. */
  handlers: HoldRepeatHandlers;
  /** Arrête une répétition en cours (ex. bouton devenu inactif). */
  stop: () => void;
}

interface HoldController {
  /** Fixe l'action courante (appelé par le hook dans un effet, jamais pendant le rendu). */
  setAction: (fn: () => void) => void;
  start: () => void;
  stop: () => void;
  /** Déclenche l'action d'un appui bref ; retourne false si un appui long vient d'avoir lieu. */
  click: () => boolean;
}

/** Machine d'appui long, indépendante de React (temporisateurs + écoute du relâchement global). */
function createHoldController(): HoldController {
  let delayTimer: number | null = null;
  let intervalTimer: number | null = null;
  let repeated = false;
  let action: () => void = () => undefined;

  const controller: HoldController = {
    setAction: (fn) => {
      action = fn;
    },
    start: () => {
      controller.stop();
      repeated = false;
      window.addEventListener('pointerup', controller.stop);
      window.addEventListener('pointercancel', controller.stop);
      delayTimer = window.setTimeout(() => {
        delayTimer = null;
        repeated = true;
        action();
        intervalTimer = window.setInterval(() => action(), HOLD_INTERVAL_MS);
      }, HOLD_DELAY_MS);
    },
    stop: () => {
      if (delayTimer !== null) {
        window.clearTimeout(delayTimer);
        delayTimer = null;
      }
      if (intervalTimer !== null) {
        window.clearInterval(intervalTimer);
        intervalTimer = null;
      }
      window.removeEventListener('pointerup', controller.stop);
      window.removeEventListener('pointercancel', controller.stop);
    },
    click: () => {
      if (repeated) {
        repeated = false;
        return false;
      }
      action();
      return true;
    },
  };
  return controller;
}

export function useHoldRepeat(action: () => void): HoldRepeat {
  const [controller] = useState(createHoldController);

  useEffect(() => {
    controller.setAction(action);
  }, [controller, action]);

  // Démontage : aucun temporisateur fantôme.
  useEffect(() => () => controller.stop(), [controller]);

  const handlers = useMemo<HoldRepeatHandlers>(
    () => ({
      onPointerDown: (e) => {
        if (e.button !== 0) return;
        controller.start();
      },
      onPointerUp: () => controller.stop(),
      onPointerCancel: () => controller.stop(),
      onPointerLeave: () => controller.stop(),
      onClick: (e) => {
        if (!controller.click()) e.preventDefault();
      },
      onContextMenu: (e) => {
        e.preventDefault();
      },
    }),
    [controller],
  );

  return { handlers, stop: controller.stop };
}
