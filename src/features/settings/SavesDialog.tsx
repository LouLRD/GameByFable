/**
 * Sauvegardes (dialogue 'saves') : trois emplacements manuels + automatique, export JSON, import
 * par fichier ou texte collé (refus non destructif affiché dans le dialogue). Le chargement ou
 * l'import réussi restaure la partie, ce qui ferme le dialogue : le succès est alors notifié.
 */
import { useId, useState, type ChangeEvent } from 'react';
import { Dialog } from '@/components/ui';
import type { SlotId, SlotSummary } from '@/persistence';
import { useGameStore } from '@/state';
import './settings.css';

const SLOT_NAMES: Readonly<Record<SlotId, string>> = {
  auto: 'Sauvegarde automatique',
  'slot-1': 'Emplacement 1',
  'slot-2': 'Emplacement 2',
  'slot-3': 'Emplacement 3',
};

type Pending = { kind: 'load' | 'clear'; slot: SlotId } | null;

interface Message {
  tone: 'success' | 'error' | 'info';
  text: string;
}

function formatSavedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'date inconnue';
  return date.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
}

function readFileText(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('Lecture impossible'));
    reader.readAsText(file);
  });
}

const closeDialog = (): void => useGameStore.getState().closeDialog();

export function SavesDialog(): React.JSX.Element {
  const open = useGameStore((s) => s.dialog === 'saves');
  return (
    <Dialog open={open} title="Sauvegardes" onClose={closeDialog} width={720} className="saves-dialog">
      {open ? <SavesBody /> : null}
    </Dialog>
  );
}

function SavesBody(): React.JSX.Element {
  const storageAvailable = useGameStore((s) => s.storageAvailable);
  const unsavedSinceExport = useGameStore((s) => s.unsavedSinceExport);
  const actionCount = useGameStore((s) => s.actions.length);

  const [slots, setSlots] = useState<SlotSummary[]>(() => useGameStore.getState().listSlots());
  const [label, setLabel] = useState('');
  const [pending, setPending] = useState<Pending>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [importText, setImportText] = useState('');
  const labelId = useId();
  const autoHintId = useId();
  const fileId = useId();
  const importTextId = useId();
  const needsConfirmation = unsavedSinceExport && actionCount > 0;

  const refresh = () => setSlots(useGameStore.getState().listSlots());

  const save = (slot: SlotId) => {
    const store = useGameStore.getState();
    const trimmed = label.trim();
    const r = trimmed ? store.saveToSlot(slot, trimmed) : store.saveToSlot(slot);
    setMessage({ tone: r.ok ? 'success' : 'error', text: r.message });
    store.announce(r.message);
    refresh();
  };

  const load = (slot: SlotId) => {
    const store = useGameStore.getState();
    const r = store.loadSlot(slot);
    setPending(null);
    if (r.ok) {
      store.pushToast(r.message, 'success');
      store.announce(r.message);
    } else {
      setMessage({ tone: 'error', text: r.message });
    }
    refresh();
  };

  const clear = (slot: SlotId) => {
    const store = useGameStore.getState();
    store.clearSlot(slot);
    setPending(null);
    const text = `${SLOT_NAMES[slot]} effacé.`;
    setMessage({ tone: 'info', text });
    store.announce(text);
    refresh();
  };

  const doExport = () => {
    const store = useGameStore.getState();
    const r = store.exportSave();
    store.pushToast(r.message, r.ok ? 'success' : 'error');
    setMessage({ tone: r.ok ? 'success' : 'error', text: r.message });
  };

  const doImport = (text: string) => {
    if (!text.trim()) {
      setMessage({ tone: 'error', text: 'Aucun contenu à importer. La partie en cours est conservée.' });
      return;
    }
    const store = useGameStore.getState();
    const r = store.importSave(text);
    if (r.ok) {
      store.pushToast(r.message, 'success');
      store.announce(r.message);
    } else {
      setMessage({ tone: 'error', text: r.message });
      store.announce(r.message);
    }
    refresh();
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    try {
      doImport(await readFileText(file));
    } catch {
      setMessage({ tone: 'error', text: 'Le fichier n’a pas pu être lu. La partie en cours est conservée.' });
    } finally {
      input.value = '';
    }
  };

  return (
    <div className="saves">
      {!storageAvailable ? (
        <p className="saves-warning" role="note">
          Le stockage local est indisponible dans ce navigateur : les emplacements ci-dessous ne survivront pas au
          rechargement de la page. Utilisez l’export pour conserver votre progression.
        </p>
      ) : null}

      <div className="saves-message-zone">
        {message?.tone === 'error' ? (
          <p className="saves-message" data-tone="error" role="alert">
            {message.text}
          </p>
        ) : null}
        <p className="saves-message" data-tone={message?.tone ?? 'info'} role="status" aria-live="polite">
          {message && message.tone !== 'error' ? message.text : ''}
        </p>
      </div>

      <div className="field">
        <label htmlFor={labelId} className="field-label">
          Libellé de la sauvegarde
        </label>
        <input
          id={labelId}
          className="input"
          type="text"
          maxLength={60}
          value={label}
          placeholder="Ex. Avant la table ronde"
          onChange={(e) => setLabel(e.target.value)}
        />
        <p className="field-hint" id={autoHintId}>
          Utilisé par « Sauvegarder ici ». L’emplacement automatique est écrit par le jeu après chaque action.
        </p>
      </div>

      <ul className="saves-slots">
        {slots.map((slot) => {
          const name = SLOT_NAMES[slot.slotId];
          const isAuto = slot.slotId === 'auto';
          const emptyHintId = `${fileId}-empty-${slot.slotId}`;
          return (
            <li key={slot.slotId} className="slot" data-empty={slot.empty}>
              <div className="slot-head">
                <h3 className="slot-name">{name}</h3>
                {isAuto ? <span className="tag">auto</span> : null}
              </div>
              {slot.empty ? (
                <p className="muted slot-meta" id={emptyHintId}>
                  {slot.rejection ? `Contenu illisible (${slot.rejection}), conservé tel quel.` : 'Vide.'}
                </p>
              ) : (
                <p className="slot-meta">
                  <span className="slot-label">{slot.label}</span> · <time dateTime={slot.savedAt}>{formatSavedAt(slot.savedAt)}</time>{' '}
                  · {slot.actionCount} {slot.actionCount > 1 ? 'actions' : 'action'}
                </p>
              )}
              <div className="slot-actions">
                <button
                  type="button"
                  className="btn"
                  disabled={isAuto}
                  aria-describedby={isAuto ? autoHintId : undefined}
                  title={isAuto ? 'L’emplacement automatique est écrit par le jeu après chaque action.' : `Enregistrer la partie en cours dans ${name}`}
                  onClick={() => save(slot.slotId)}
                >
                  Sauvegarder ici <span className="visually-hidden">({name})</span>
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={slot.empty}
                  aria-describedby={slot.empty ? emptyHintId : undefined}
                  title={slot.empty ? 'Emplacement vide' : `Restaurer ${name}`}
                  onClick={() => (needsConfirmation ? setPending({ kind: 'load', slot: slot.slotId }) : load(slot.slotId))}
                >
                  Charger <span className="visually-hidden">({name})</span>
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={slot.empty}
                  aria-describedby={slot.empty ? emptyHintId : undefined}
                  title={slot.empty ? 'Emplacement vide' : `Effacer ${name}`}
                  onClick={() => setPending({ kind: 'clear', slot: slot.slotId })}
                >
                  Effacer <span className="visually-hidden">({name})</span>
                </button>
              </div>
              {pending?.slot === slot.slotId ? (
                <div className="slot-confirm" role="group" aria-label={`Confirmation — ${name}`}>
                  <p>
                    {pending.kind === 'load'
                      ? `Charger ${name} remplacera la progression en cours (${actionCount} ${actionCount > 1 ? 'actions' : 'action'} non exportées).`
                      : `Effacer ${name} est définitif.`}
                  </p>
                  <button
                    type="button"
                    className={pending.kind === 'clear' ? 'btn btn-danger' : 'btn btn-primary'}
                    onClick={() => (pending.kind === 'load' ? load(slot.slotId) : clear(slot.slotId))}
                  >
                    {pending.kind === 'load' ? 'Confirmer le chargement' : 'Confirmer l’effacement'}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => setPending(null)}>
                    Annuler
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <hr />

      <section className="saves-transfer" aria-label="Export et import">
        <div className="saves-row">
          <button type="button" className="btn btn-primary" onClick={doExport}>
            Exporter (JSON)
          </button>
          <p className="field-hint">
            Télécharge un fichier nommé d’après le scénario et la date. {unsavedSinceExport && actionCount > 0 ? 'Progression non exportée.' : ''}
          </p>
        </div>
        <div className="saves-import">
          <div className="field">
            <label htmlFor={fileId} className="field-label">
              Importer un fichier de sauvegarde
            </label>
            <input id={fileId} className="input" type="file" accept="application/json,.json" onChange={(e) => void onFile(e)} />
          </div>
          <div className="field">
            <label htmlFor={importTextId} className="field-label">
              Ou coller le JSON
            </label>
            <textarea
              id={importTextId}
              className="input"
              rows={4}
              value={importText}
              spellCheck={false}
              placeholder='{"kind":"lva-save", …}'
              onChange={(e) => setImportText(e.target.value)}
            />
          </div>
          <div className="saves-row">
            <button type="button" className="btn" onClick={() => doImport(importText)}>
              Importer le texte
            </button>
            <p className="field-hint">Un fichier invalide, d’un autre scénario ou d’un format plus récent est refusé sans toucher à la partie en cours.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
