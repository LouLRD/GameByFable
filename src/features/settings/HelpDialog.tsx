/**
 * Aide (dialogue 'help') : la boucle de jeu, les degrés d'information, la pression, la confiance,
 * la table ronde et les raccourcis clavier. Aucun contenu du scénario.
 */
import { useId } from 'react';
import { Dialog } from '@/components/ui';
import { useGameStore } from '@/state';
import { ShortcutList } from './ShortcutList';
import './settings.css';

const closeDialog = (): void => useGameStore.getState().closeDialog();

export function HelpDialog(): React.JSX.Element {
  const open = useGameStore((s) => s.dialog === 'help');
  const loopId = useId();
  const degreesId = useId();
  const resourcesId = useId();
  const shortcutsId = useId();
  return (
    <Dialog open={open} title="Aide" onClose={closeDialog} width={680} className="help-dialog">
      <div className="help">
        <section aria-labelledby={loopId}>
          <h3 id={loopId}>La boucle</h3>
          <ol className="help-loop">
            <li>
              <strong>Observer</strong> — parcourez le dossier : pièces, déclarations, fiches.
              Sélectionner un élément place le curseur et met en évidence le plan.
            </li>
            <li>
              <strong>Formuler</strong> — posez une hypothèse dans un emplacement du canevas de
              version. Le moteur en déduit les conséquences.
            </li>
            <li>
              <strong>Rejouer</strong> — déplacez le curseur ou lancez la relecture : qui pouvait
              être où, voir ou entendre quoi.
            </li>
            <li>
              <strong>Confronter</strong> — opposez une déclaration à la pièce qui la contredit.
              L’approche (neutre, empathique, directe) joue surtout sur la confiance.
            </li>
            <li>
              <strong>Réviser</strong> — une contradiction explique son raisonnement étape par étape
              ; corrigez la version plutôt que d’insister.
            </li>
          </ol>
        </section>

        <section aria-labelledby={degreesId}>
          <h3 id={degreesId}>Les degrés d’information</h3>
          <dl className="help-degrees">
            <div>
              <dt>
                <span className="badge degree-established">
                  <span className="degree-label">établi</span>
                </span>
              </dt>
              <dd>Trace matérielle ou log : le monde le garantit.</dd>
            </div>
            <div>
              <dt>
                <span className="badge degree-reported">
                  <span className="degree-label">rapporté</span>
                </span>
              </dt>
              <dd>Quelqu’un l’affirme. Une perception n’est pas un fait.</dd>
            </div>
            <div>
              <dt>
                <span className="badge degree-deduced">
                  <span className="degree-label">déduit</span>
                </span>
              </dt>
              <dd>Conséquence calculée par le moteur à partir de l’établi.</dd>
            </div>
            <div>
              <dt>
                <span className="badge degree-proposed">
                  <span className="degree-label">proposé</span>
                </span>
              </dt>
              <dd>Votre version : à vérifier, jamais acquis.</dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby={resourcesId}>
          <h3 id={resourcesId}>Pression, confiance, table ronde</h3>
          <ul className="help-list">
            <li>
              <strong>Pression</strong> (0 à 6) : une confrontation forte en consomme ; une
              observation nouvelle ou une contradiction critique résolue en rend. Une confrontation
              irrecevable ne coûte rien.
            </li>
            <li>
              <strong>Confiance</strong> : chaque personne est <em>fermée</em>, <em>prudente</em>,{' '}
              <em>disponible</em> ou <em>engagée</em>. Elle influence ce qu’elle précise, admet ou
              signe.
            </li>
            <li>
              <strong>Table ronde</strong> : après deux révélations structurantes, chaque personne
              réagit à la version, signe, refuse ou demande un changement. Vous pouvez retravailler
              tant que le rapport n’est pas scellé.
            </li>
            <li>
              <strong>Sceller le rapport</strong> est définitif : l’épilogue compare alors la
              version signée aux faits révélés.
            </li>
          </ul>
        </section>

        <section aria-labelledby={shortcutsId}>
          <h3 id={shortcutsId}>Raccourcis clavier</h3>
          <ShortcutList />
        </section>
      </div>
    </Dialog>
  );
}
