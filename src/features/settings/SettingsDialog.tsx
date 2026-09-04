/**
 * Options (dialogue 'settings') : taille de texte, mouvement réduit, aide progressive,
 * son d'ambiance, raccourcis clavier. Les préférences sont appliquées à <html> par App.
 */
import { useId } from 'react';
import { Dialog } from '@/components/ui';
import { useAmbience } from '@/app/ambienceContext';
import { useGameStore } from '@/state';
import type { ReducedMotionPref, TextSizePref } from '@/state/types';
import { ShortcutList } from './ShortcutList';
import './settings.css';

const TEXT_SIZES: readonly { value: TextSizePref; short: string; label: string }[] = [
  { value: 's', short: 'S', label: 'Petite (87 %)' },
  { value: 'm', short: 'M', label: 'Normale (100 %)' },
  { value: 'l', short: 'L', label: 'Grande (119 %)' },
];

const MOTION_PREFS: readonly { value: ReducedMotionPref; label: string; hint: string }[] = [
  { value: 'system', label: 'Système', hint: 'suit le réglage du système' },
  { value: 'on', label: 'Activé', hint: 'aucune animation' },
  { value: 'off', label: 'Désactivé', hint: 'animations brèves' },
];

const closeDialog = (): void => useGameStore.getState().closeDialog();

export function SettingsDialog(): React.JSX.Element {
  const open = useGameStore((s) => s.dialog === 'settings');
  return (
    <Dialog
      open={open}
      title="Options"
      onClose={closeDialog}
      width={640}
      className="settings-dialog"
    >
      {open ? <SettingsBody /> : null}
    </Dialog>
  );
}

function SettingsBody(): React.JSX.Element {
  const prefs = useGameStore((s) => s.prefs);
  const { enabled: audioOn, supported, setEnabled } = useAmbience();
  const textSizeName = useId();
  const motionName = useId();
  const audioHintId = useId();
  const hintsHintId = useId();
  const shortcutsId = useId();

  return (
    <div className="settings">
      <fieldset className="settings-group">
        <legend>Taille du texte</legend>
        <div className="settings-options">
          {TEXT_SIZES.map((option) => (
            <label key={option.value} className="settings-option">
              <input
                type="radio"
                name={textSizeName}
                value={option.value}
                checked={prefs.textSize === option.value}
                onChange={() => {
                  const store = useGameStore.getState();
                  store.setPref('textSize', option.value);
                  store.announce(`Taille du texte : ${option.label}.`);
                }}
              />
              <span>
                <kbd>{option.short}</kbd> {option.label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="settings-group">
        <legend>Mouvement réduit</legend>
        <div className="settings-options">
          {MOTION_PREFS.map((option) => (
            <label key={option.value} className="settings-option">
              <input
                type="radio"
                name={motionName}
                value={option.value}
                checked={prefs.reducedMotion === option.value}
                onChange={() => {
                  const store = useGameStore.getState();
                  store.setPref('reducedMotion', option.value);
                  store.announce(`Mouvement réduit : ${option.label.toLowerCase()}.`);
                }}
              />
              <span>
                {option.label} <span className="muted">— {option.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="settings-group">
        <legend>Assistance</legend>
        <div className="settings-options settings-options-column">
          <label className="settings-option">
            <input
              type="checkbox"
              checked={prefs.hintsEnabled}
              aria-describedby={hintsHintId}
              onChange={(e) => {
                const store = useGameStore.getState();
                store.setPref('hintsEnabled', e.target.checked);
                store.announce(
                  e.target.checked ? 'Aide progressive activée.' : 'Aide progressive désactivée.',
                );
              }}
            />
            <span>Aide progressive</span>
          </label>
          <p id={hintsHintId} className="field-hint">
            Après plusieurs actions refusées, une piste propose la contradiction à examiner. Jamais
            la solution.
          </p>
          <label className="settings-option">
            <input
              type="checkbox"
              checked={audioOn}
              disabled={!supported}
              aria-describedby={audioHintId}
              onChange={(e) => void setEnabled(e.target.checked)}
            />
            <span>Son d’ambiance</span>
          </label>
          <p id={audioHintId} className="field-hint">
            {supported
              ? 'Nappe synthétisée et discrète (frigo, néon, caisse). Elle ne démarre qu’après ce choix explicite ; les sous-titres descriptifs restent affichés dans tous les cas.'
              : 'Web Audio est indisponible dans ce navigateur : le jeu se joue sans son, les sous-titres descriptifs restent affichés.'}
          </p>
        </div>
      </fieldset>

      <section className="settings-group" aria-labelledby={shortcutsId}>
        <h3 id={shortcutsId}>Raccourcis clavier</h3>
        <p className="field-hint">
          Inactifs dans un champ de saisie ou quand un dialogue est ouvert.
        </p>
        <ShortcutList />
      </section>
    </div>
  );
}
