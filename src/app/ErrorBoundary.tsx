/**
 * Garde-fou React autour du bureau : une exception d'interface affiche un message technique
 * sobre (jamais présenté comme une réponse du jeu) et un bouton de rechargement. La partie est
 * sauvegardée automatiquement après chaque action, le rechargement ne perd donc rien.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: error instanceof Error ? error : new Error('Erreur inconnue') };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    if (import.meta.env.DEV) {
      console.error(
        '[La Version Acceptable] erreur d’interface interceptée',
        error,
        info.componentStack,
      );
    }
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return <TechnicalErrorScreen error={error} />;
  }
}

export function TechnicalErrorScreen({ error }: { error: Error }): React.JSX.Element {
  return (
    <div className="screen screen-error" role="alert">
      <p className="screen-kicker">Message technique — ceci n’est pas une réponse du jeu</p>
      <h1>L’interface a rencontré une erreur</h1>
      <p>
        Votre progression est sauvegardée automatiquement après chaque action : rechargez la page
        pour reprendre le dossier là où vous l’aviez laissé.
      </p>
      <div>
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          Recharger la page
        </button>
      </div>
      {import.meta.env.DEV ? <pre className="screen-detail">{error.message}</pre> : null}
    </div>
  );
}
