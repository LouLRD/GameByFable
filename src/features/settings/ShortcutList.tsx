import { SHORTCUTS } from './shortcuts';

/** Liste des raccourcis clavier (partagée par Options et Aide). */
export function ShortcutList(): React.JSX.Element {
  return (
    <dl className="shortcut-list">
      {SHORTCUTS.map((shortcut) => (
        <div key={shortcut.label} className="shortcut-row">
          <dt>
            {shortcut.keys.map((key, i) => (
              <span key={key}>
                {i > 0 ? <span className="shortcut-sep"> ou </span> : null}
                <kbd>{key}</kbd>
              </span>
            ))}
          </dt>
          <dd>{shortcut.label}</dd>
        </div>
      ))}
    </dl>
  );
}
