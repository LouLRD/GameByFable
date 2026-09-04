/**
 * Bandeau supérieur (GDD §12.1) : titre, sous-titre du scénario, acte, heure simulée (curseur
 * unique), jauge de pression (forme + texte, jamais la couleur seule) et commandes du dossier.
 * Sur petit écran, les commandes se replient derrière un bouton « Menu ».
 */
import { useId, useState } from 'react';
import type { PlayerView } from '@/domain/selectors/playerView';
import { useGameStore } from '@/state';
import type { DialogId } from '@/state/types';
import { ACT_LABELS } from './actLabels';
import { useAmbience } from './ambienceContext';

export interface TopBarProps {
  view: PlayerView;
  isDesktop: boolean;
}

const openDialog = (dialog: DialogId): void => useGameStore.getState().openDialog(dialog);

export function TopBar({ view, isDesktop }: TopBarProps): React.JSX.Element {
  const cursor = useGameStore((s) => s.cursor);
  const audioPref = useGameStore((s) => s.prefs.audioEnabled);
  const { enabled, supported, toggle } = useAmbience();
  const [menuOpen, setMenuOpen] = useState(false);
  const actionsId = useId();
  const soundHintId = useId();

  const clock = view.clock(cursor);
  const actFull = ACT_LABELS[view.act];
  const actShort = view.act === 'Épilogue' ? 'Épilogue' : `Acte ${view.act}`;
  const soundHint = !supported
    ? 'Web Audio est indisponible dans ce navigateur : les sous-titres descriptifs restent affichés.'
    : enabled
      ? 'Couper l’ambiance sonore.'
      : audioPref
        ? 'Reprendre l’ambiance sonore (préférence mémorisée ; le son ne démarre jamais sans ce clic).'
        : 'Activer l’ambiance sonore synthétisée, discrète.';

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <h1 className="topbar-title">LA VERSION ACCEPTABLE</h1>
        <p className="topbar-subtitle">
          {view.title} — {view.subtitle}
        </p>
      </div>
      <p className="topbar-act" title={actFull}>
        <span className="topbar-act-full">{actFull}</span>
        <span className="topbar-act-short" aria-hidden="true">
          {actShort}
        </span>
      </p>
      <p className="topbar-clock">
        <span className="visually-hidden">Heure simulée </span>
        <time aria-live="off" dateTime={clock}>
          {clock}
        </time>
      </p>
      <PressureMeter value={view.pressure} max={view.pressureMax} />
      <div className="topbar-spacer" />
      {!isDesktop ? (
        <button
          type="button"
          className="btn btn-ghost topbar-menu"
          aria-expanded={menuOpen}
          aria-controls={actionsId}
          onClick={() => setMenuOpen((open) => !open)}
        >
          Menu
        </button>
      ) : null}
      <div id={actionsId} className="topbar-actions" role="group" aria-label="Commandes du dossier" hidden={!isDesktop && !menuOpen}>
        <button type="button" className="btn btn-ghost" onClick={() => openDialog('saves')}>
          Sauvegardes
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => openDialog('settings')}>
          Options
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => openDialog('help')} title="Aide (touche ?)">
          Aide
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => openDialog('new-game')}>
          Nouvelle partie
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          aria-pressed={enabled}
          disabled={!supported}
          aria-describedby={soundHintId}
          title={soundHint}
          onClick={() => void toggle()}
        >
          Son <span className="visually-hidden">{enabled ? '(ambiance activée)' : '(ambiance coupée)'}</span>
        </button>
        <span id={soundHintId} className="visually-hidden">
          {soundHint}
        </span>
      </div>
    </header>
  );
}

function PressureMeter({ value, max }: { value: number; max: number }): React.JSX.Element {
  const pips = Array.from({ length: Math.max(0, max) }, (_, i) => i < value);
  return (
    <div
      className="topbar-pressure"
      role="meter"
      aria-label="Pression"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuetext={`Pression ${value} sur ${max}`}
      title="Pression disponible pour les confrontations : une confrontation forte en consomme, une observation nouvelle peut en rendre."
    >
      <span className="pressure-text">
        <span className="pressure-word">Pression </span>
        <span className="tabular">
          {value}/{max}
        </span>
      </span>
      <span className="pressure-pips" aria-hidden="true">
        {pips.map((filled, i) => (
          <span key={i} className="pressure-pip" data-filled={filled} />
        ))}
      </span>
    </div>
  );
}
