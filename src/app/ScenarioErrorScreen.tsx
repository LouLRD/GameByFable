/**
 * Écran affiché quand le scénario embarqué échoue à la validation (`loadIssues`).
 * En développement : liste diagnostique (code, chemin, message). En production : message sobre,
 * sans détail technique ni contenu du scénario.
 */
import type { ScenarioIssue } from '@/scenario';

export interface ScenarioErrorScreenProps {
  issues: ScenarioIssue[];
}

export function ScenarioErrorScreen({ issues }: ScenarioErrorScreenProps): React.JSX.Element {
  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.length - errors;
  return (
    <div className="screen screen-error" role="alert">
      <p className="screen-kicker">Message technique — ceci n’est pas une réponse du jeu</p>
      <h1>Le dossier ne peut pas être ouvert</h1>
      {import.meta.env.DEV ? (
        <>
          <p>
            Le scénario embarqué n’a pas passé la validation : {errors} erreur(s), {warnings} avertissement(s).
            Diagnostic affiché en mode développement uniquement.
          </p>
          <div className="issues-wrap">
            <table className="issues">
              <caption className="visually-hidden">Problèmes de validation du scénario</caption>
              <thead>
                <tr>
                  <th scope="col">Sévérité</th>
                  <th scope="col">Code</th>
                  <th scope="col">Chemin</th>
                  <th scope="col">Message</th>
                </tr>
              </thead>
              <tbody>
                {issues.map((issue, i) => (
                  <tr key={`${issue.code}-${issue.path}-${i}`}>
                    <td>{issue.severity === 'error' ? 'erreur' : 'avertissement'}</td>
                    <td className="mono">{issue.code}</td>
                    <td className="mono">{issue.path}</td>
                    <td>{issue.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p>
          Les données du jeu sont indisponibles ou altérées. Rechargez la page ; si le problème persiste,
          réinstallez l’application.
        </p>
      )}
      <div>
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          Recharger la page
        </button>
      </div>
    </div>
  );
}
