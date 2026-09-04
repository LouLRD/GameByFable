/**
 * Barre persistante des quatre espaces (tablette / mobile, GDD §12.2). Toujours rendue ;
 * masquée par layout.css au-delà de 1024 px. Compteurs discrets, nommés pour les lecteurs d'écran.
 */
import type { PlayerView } from '@/domain/selectors/playerView';
import { SPACE_LABELS } from '@/accessibility/useKeyboardShortcuts';
import { useGameStore } from '@/state';
import type { SpaceId } from '@/state/types';

interface TabDef {
  id: SpaceId;
  digit: string;
  count?: number;
  countLabel?: string;
}

export function SpaceBar({ view }: { view: PlayerView }): React.JSX.Element {
  const activeSpace = useGameStore((s) => s.activeSpace);
  const tabs: TabDef[] = [
    { id: 'map', digit: '1' },
    { id: 'timeline', digit: '2' },
    { id: 'casefile', digit: '3', count: view.evidence.length + view.statements.length, countLabel: 'éléments au dossier' },
    { id: 'inspector', digit: '4', count: view.contradictions.length, countLabel: 'contradictions' },
  ];
  return (
    <nav className="space-bar" aria-label="Espaces de travail">
      {tabs.map((tab) => {
        const active = tab.id === activeSpace;
        const label = SPACE_LABELS[tab.id];
        return (
          <button
            key={tab.id}
            type="button"
            className="space-bar-tab"
            aria-current={active ? 'page' : undefined}
            title={`${label} (touche ${tab.digit})`}
            onClick={() => {
              const store = useGameStore.getState();
              store.setActiveSpace(tab.id);
              store.announce(`Espace ${label}.`);
            }}
          >
            <span className="space-bar-label">{label}</span>
            {tab.count !== undefined && tab.count > 0 ? (
              <span className="space-bar-count">
                {' '}
                <span aria-hidden="true">{tab.count}</span>
                <span className="visually-hidden">
                  {tab.count} {tab.countLabel}
                </span>
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
